import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

const { api } = await loadModule('../src/api/client.ts')
const { observeGeneration } = await loadModule('../src/utils/generation.ts')
const flush = () => new Promise(setImmediate)

function stubGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original)
    else delete globalThis[name]
  })
}

function session(t, fetch) {
  const tokens = new Map([['access_token', 'synthetic-access'], ['refresh_token', 'synthetic-refresh']])
  stubGlobal(t, 'localStorage', {
    getItem: key => tokens.get(key) ?? null,
    setItem: (key, value) => tokens.set(key, value),
    removeItem: key => tokens.delete(key),
  })
  const location = { href: '/projects/test/generation' }
  stubGlobal(t, 'window', { location })
  t.mock.method(globalThis, 'fetch', fetch)
  return { tokens, location }
}

function eventStream(text, splitBytes = false) {
  const bytes = new TextEncoder().encode(text)
  return new Response(new ReadableStream({
    start(controller) {
      if (splitBytes) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
      } else controller.enqueue(bytes)
      controller.close()
    },
  }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } })
}

function timers(t) {
  const pending = new Map()
  let next = 0
  t.mock.method(globalThis, 'setTimeout', (callback, ms) => {
    pending.set(++next, { callback, ms })
    return next
  })
  t.mock.method(globalThis, 'clearTimeout', id => pending.delete(id))
  return {
    pending,
    run(ms) {
      const entry = [...pending].find(([, timer]) => timer.ms === ms)
      assert.ok(entry, `No timer scheduled for ${ms}ms`)
      pending.delete(entry[0])
      entry[1].callback()
    },
  }
}

function observer() {
  const statuses = [], errors = []
  let completions = 0
  return {
    statuses, errors,
    get completions() { return completions },
    onStatus: status => statuses.push(status),
    onError: status => errors.push(status),
    onComplete: () => { completions++ },
  }
}

test('Authenticated SSE decodes byte boundaries, Unicode, multiline data and CRLF', async (t) => {
  const events = []
  session(t, async (url, options) => {
    assert.equal(url, '/api/projects/test/stream')
    assert.equal(options.headers.Authorization, 'Bearer synthetic-access')
    assert.ok(options.signal instanceof AbortSignal)
    return eventStream('\uFEFF: heartbeat\r\nid: 7\r\nevent: message\r\ndata: {"status":"generating",\r\ndata: "progress":0.25,"draft_preview":"Сценарий 🎬"}\r\n\r\ndata:{"status":"completed","progress":1}\n\n', true)
  })
  await api.streamStatus('test', status => events.push(status), new AbortController().signal)
  assert.deepEqual(events, [
    { status: 'generating', progress: 0.25, draft_preview: 'Сценарий 🎬' },
    { status: 'completed', progress: 1 },
  ])
})

test('SSE supports bare CR separators and discards an unfinished event at EOF', async (t) => {
  const events = []
  session(t, async () => eventStream('data: {"status":"generating","progress":0.5}\r\rdata: {"status":"completed","progress":1}', true))
  await api.streamStatus('test', status => events.push(status), new AbortController().signal)
  assert.deepEqual(events, [{ status: 'generating', progress: 0.5 }])
})

test('Malformed SSE rejects so the observer can switch to polling', async (t) => {
  session(t, async () => eventStream('data: not JSON\n\n'))
  await assert.rejects(api.streamStatus('test', () => {}, new AbortController().signal), SyntaxError)
})

test('Forbidden streams never attempt token refresh or expose credentials in URLs', async (t) => {
  const requests = []
  const { location } = session(t, async url => {
    requests.push(url)
    return new Response(null, { status: 403 })
  })
  await assert.rejects(api.streamStatus('test', () => {}, new AbortController().signal), /API error: 403/)
  assert.deepEqual(requests, ['/api/projects/test/stream'])
  assert.equal(location.href, '/projects/test/generation')
})

test('An expired stream refreshes and retries with the renewed bearer token', async (t) => {
  const requests = []
  session(t, async (url, options) => {
    requests.push({ url, options })
    if (url === '/api/auth/refresh') return Response.json({ access_token: 'renewed', refresh_token: 'renewed-refresh' })
    if (options.headers.Authorization === 'Bearer synthetic-access') return new Response(null, { status: 401 })
    return eventStream('data: {"status":"generating","progress":0.5}\n\n')
  })
  const events = []
  await api.streamStatus('test', status => events.push(status), new AbortController().signal)
  assert.deepEqual(requests.map(request => request.url), ['/api/projects/test/stream', '/api/auth/refresh', '/api/projects/test/stream'])
  assert.equal(requests[2].options.headers.Authorization, 'Bearer renewed')
  assert.deepEqual(events, [{ status: 'generating', progress: 0.5 }])
})

test('Aborting a stream cancels its body reader and reports AbortError', async (t) => {
  let cancelled = 0
  session(t, async () => new Response(new ReadableStream({ cancel() { cancelled++ } }), {
    headers: { 'Content-Type': 'text/event-stream' },
  }))
  const controller = new AbortController()
  const stream = api.streamStatus('test', () => assert.fail('Unexpected status'), controller.signal)
  await flush()
  controller.abort()
  await assert.rejects(stream, { name: 'AbortError' })
  assert.equal(cancelled, 1)
})

test('Aborting while refreshing does not cancel a shared refresh or another request', async (t) => {
  let finishRefresh
  const refresh = new Promise(resolve => { finishRefresh = resolve })
  const requests = []
  const { location, tokens } = session(t, async (url, options) => {
    requests.push({ url, options })
    if (url === '/api/auth/refresh') return refresh
    if (options.headers.Authorization === 'Bearer synthetic-access') return new Response(null, { status: 401 })
    return Response.json({ status: 'generating', progress: 0.5 })
  })
  const controller = new AbortController()
  const stream = api.streamStatus('test', () => assert.fail('Cancelled stream received data'), controller.signal)
  await flush()
  const status = api.getStatus('another')
  await flush()
  controller.abort()
  await assert.rejects(stream, { name: 'AbortError' })
  assert.equal(requests.filter(request => request.url === '/api/auth/refresh').length, 1)
  assert.equal(requests.find(request => request.url === '/api/auth/refresh').options.signal, undefined)
  finishRefresh(Response.json({ access_token: 'renewed', refresh_token: 'renewed-refresh' }))
  assert.deepEqual(await status, { status: 'generating', progress: 0.5 })
  assert.equal(requests.filter(request => request.url === '/api/projects/test/stream').length, 1)
  assert.equal(requests.at(-1).options.headers.Authorization, 'Bearer renewed')
  assert.equal(tokens.get('access_token'), 'renewed')
  assert.equal(location.href, '/projects/test/generation')
})

test('An already-aborted stream does not send an HTTP request', async (t) => {
  session(t, async () => assert.fail('Request sent after cleanup'))
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(api.streamStatus('test', () => {}, controller.signal), { name: 'AbortError' })
})

test('EOF starts one polling loop; polling completion schedules one navigation', async (t) => {
  const clock = timers(t), events = observer(), controller = new AbortController()
  let polls = 0, streams = 0
  const source = {
    async streamStatus(_id, receive) { streams++; receive({ status: 'generating', progress: 0.1 }) },
    async getStatus() { return ++polls === 1 ? { status: 'generating', progress: 0.5 } : { status: 'completed', progress: 1 } },
  }
  const watching = observeGeneration(source, 'test', events, controller.signal)
  await flush()
  assert.equal(streams, 1)
  assert.equal(polls, 1)
  assert.equal(clock.pending.size, 1)
  clock.run(2000)
  await flush()
  assert.equal(polls, 2)
  assert.equal(clock.pending.size, 1)
  clock.run(1000)
  await watching
  assert.equal(events.completions, 1)
  assert.equal(events.errors.length, 0)
  assert.equal(clock.pending.size, 0)
})

test('Cleanup removes polling retry timers without surfacing an error', async (t) => {
  const clock = timers(t), events = observer(), controller = new AbortController()
  let polls = 0
  const watching = observeGeneration({
    async streamStatus() { throw new Error('Disconnected') },
    async getStatus(_id, signal) { assert.equal(signal, controller.signal); polls++; throw new Error('Offline') },
  }, 'test', events, controller.signal)
  await flush()
  assert.equal(polls, 1)
  assert.equal(clock.pending.size, 1)
  controller.abort()
  await watching
  assert.equal(clock.pending.size, 0)
  assert.equal(events.errors.length, 0)
  assert.equal(events.completions, 0)
})

test('Cleanup prevents late polling results and cancels completion navigation timers', async (t) => {
  const clock = timers(t), oldEvents = observer(), old = new AbortController()
  let finishPoll
  const oldWatching = observeGeneration({
    async streamStatus() {},
    getStatus: () => new Promise(resolve => { finishPoll = resolve }),
  }, 'old', oldEvents, old.signal)
  await flush()
  old.abort()
  finishPoll({ status: 'completed', progress: 1 })
  await oldWatching
  assert.deepEqual(oldEvents.statuses, [])
  assert.equal(clock.pending.size, 0)

  const current = new AbortController(), currentEvents = observer()
  const currentWatching = observeGeneration({
    async streamStatus(_id, receive) {
      receive({ status: 'completed', progress: 1 })
      receive({ status: 'completed', progress: 1 })
    },
    getStatus: () => assert.fail('A terminal stream must not start polling'),
  }, 'new', currentEvents, current.signal)
  await flush()
  assert.equal(clock.pending.size, 1)
  assert.equal(currentEvents.statuses.length, 1)
  current.abort()
  await currentWatching
  assert.equal(clock.pending.size, 0)
  assert.equal(currentEvents.completions, 0)
  assert.deepEqual(currentEvents.errors, [])
})

test('Switching projects aborts the old stream and ignores its late messages', async () => {
  const callbacks = new Map(), streamSignals = new Map()
  const source = {
    streamStatus(id, receive, signal) {
      callbacks.set(id, receive)
      streamSignals.set(id, signal)
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    },
    getStatus: () => assert.fail('No fallback while stream is active'),
  }
  const old = new AbortController(), oldEvents = observer()
  const oldWatching = observeGeneration(source, 'old', oldEvents, old.signal)
  old.abort()
  const current = new AbortController(), events = observer()
  const currentWatching = observeGeneration(source, 'new', events, current.signal)
  callbacks.get('old')({ status: 'completed', progress: 1 })
  callbacks.get('new')({ status: 'stopped', progress: 0.5 })
  await Promise.all([oldWatching, currentWatching])
  assert.equal(streamSignals.get('old').aborted, true)
  assert.equal(streamSignals.get('new').aborted, true)
  assert.deepEqual(oldEvents.statuses, [])
  assert.deepEqual(events.errors, [{ status: 'stopped', progress: 0.5 }])
})
