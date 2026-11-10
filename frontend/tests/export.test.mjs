import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

// Use the project's TypeScript compiler so the tests also run on Node 20.
async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

const { api } = await loadModule('../src/api/client.ts')
const { saveDownload } = await loadModule('../src/utils/download.ts')

function stubGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original)
    else delete globalThis[name]
  })
}

function browserSession(t, responses, { authenticated = true } = {}) {
  const values = new Map(authenticated ? [
    ['access_token', 'access-original'],
    ['refresh_token', 'refresh-original'],
  ] : [])
  stubGlobal(t, 'localStorage', {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  })
  const location = { href: '/projects/test/scenario' }
  stubGlobal(t, 'window', { location })
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options })
    assert.ok(responses.length, `Unexpected request: ${url}`)
    const response = responses.shift()
    return typeof response === 'function' ? response() : response
  })
  return { requests, values, location }
}

test('Markdown export sends bearer authentication and preserves UTF-8 content and filename', async (t) => {
  const markdown = '# Сценарий\n\n🎬 Первая сцена'
  const { requests } = browserSession(t, [new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': 'attachment; filename=scenario_test.md',
    },
  })])

  const result = await api.exportMd('test')
  assert.equal(await result.blob.text(), markdown)
  assert.equal(result.filename, 'scenario_test.md')
  assert.match(result.blob.type, /^text\/markdown;\s*charset=utf-8$/)
  assert.equal(requests[0].url, '/api/projects/test/export/md')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer access-original')
})

test('PDF export keeps arbitrary binary bytes intact', async (t) => {
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 0, 128, 255])
  browserSession(t, [new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } })])

  const result = await api.exportPdf('test')
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), bytes)
  assert.equal(result.blob.type, 'application/pdf')
  assert.equal(result.filename, 'scenario_test.pdf')
})

for (const [disposition, expected] of [
  ['attachment; filename="My screenplay.md"', 'My screenplay.md'],
  ["attachment; filename=fallback.md; filename*=UTF-8''%D0%A1%D1%86%D0%B5%D0%BD%D0%B0.md", 'Сцена.md'],
  ["attachment; filename*=UTF-8'ru'%D0%A1%D1%86%D0%B5%D0%BD%D0%B0.md", 'Сцена.md'],
  ["attachment; filename*=UTF-8''%INVALID; filename=plain.md", 'plain.md'],
  ["attachment; filename*=UTF-8''%INVALID", 'scenario_test.md'],
  ['attachment; filename="../../scenario.md"', 'scenario.md'],
  ['attachment; filename=".."', 'scenario_test.md'],
  [null, 'scenario_test.md'],
]) {
  test(`Download filename: ${disposition ?? 'missing header'}`, async (t) => {
    const headers = disposition ? { 'Content-Disposition': disposition } : {}
    browserSession(t, [new Response('# Scene', { headers })])
    assert.equal((await api.exportMd('test')).filename, expected)
  })
}

test('Expired access tokens refresh once and retry the binary download with the new token', async (t) => {
  const { requests, values } = browserSession(t, [
    new Response('{"detail":"Expired"}', { status: 401 }),
    Response.json({ access_token: 'access-renewed', refresh_token: 'refresh-renewed' }),
    new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } }),
  ])

  assert.equal(await (await api.exportPdf('test')).blob.text(), '%PDF-1.7')
  assert.deepEqual(requests.map(({ url }) => url), [
    '/api/projects/test/export/pdf', '/api/auth/refresh', '/api/projects/test/export/pdf',
  ])
  assert.equal(requests[2].options.headers.Authorization, 'Bearer access-renewed')
  assert.equal(requests[1].options.body, JSON.stringify({ refresh_token: 'refresh-original' }))
  assert.equal(values.get('access_token'), 'access-renewed')
  assert.ok(requests.every(({ url }) => !url.includes('token') && !url.includes('?')))
})

test('Concurrent downloads share a single refresh request', async (t) => {
  const { requests } = browserSession(t, [
    new Response(null, { status: 401 }),
    new Response(null, { status: 401 }),
    Response.json({ access_token: 'renewed', refresh_token: 'renewed-refresh' }),
    new Response('# Markdown'),
    new Response('%PDF-1.7'),
  ])

  const [md, pdf] = await Promise.all([api.exportMd('test'), api.exportPdf('test')])
  assert.equal(await md.blob.text(), '# Markdown')
  assert.equal(await pdf.blob.text(), '%PDF-1.7')
  assert.equal(requests.filter(({ url }) => url === '/api/auth/refresh').length, 1)
})

for (const status of [400, 403, 404, 500]) {
  test(`HTTP ${status} rejects export instead of downloading an error body`, async (t) => {
    const response = Response.json({ detail: 'Export failed' }, { status })
    const readBlob = t.mock.method(response, 'blob')
    browserSession(t, [response])
    await assert.rejects(api.exportMd('test'), new RegExp(`API error: ${status}`))
    assert.equal(readBlob.mock.callCount(), 0)
  })
}

test('An unsuccessful retry rejects without reading the error body', async (t) => {
  const rejected = new Response('Access denied', { status: 403 })
  const readBlob = t.mock.method(rejected, 'blob')
  browserSession(t, [
    new Response(null, { status: 401 }),
    Response.json({ access_token: 'new', refresh_token: 'new-refresh' }),
    rejected,
  ])
  await assert.rejects(api.exportPdf('test'), /API error: 403/)
  assert.equal(readBlob.mock.callCount(), 0)
})

test('Failed refresh clears expired credentials and returns to login', async (t) => {
  const { values, location } = browserSession(t, [
    new Response(null, { status: 401 }),
    new Response(null, { status: 401 }),
  ])
  await assert.rejects(api.exportMd('test'), /Session expired/)
  assert.equal(values.get('access_token'), undefined)
  assert.equal(values.get('refresh_token'), undefined)
  assert.equal(location.href, '/login')
})

test('Export works with authentication disabled and no stored token', async (t) => {
  const { requests } = browserSession(t, [new Response('# Scene')], { authenticated: false })
  assert.equal(await (await api.exportMd('test')).blob.text(), '# Scene')
  assert.equal(requests[0].options.headers.Authorization, undefined)
})

test('JSON endpoints still return parsed JSON through the shared transport', async (t) => {
  browserSession(t, [Response.json([{ id: 'test', idea: 'A screenplay' }])])
  assert.deepEqual(await api.listProjects(), [{ id: 'test', idea: 'A screenplay' }])
})

test('Browser download clicks the temporary anchor before deferring URL cleanup', (t) => {
  const events = []
  const pending = []
  const blob = new Blob(['# Сценарий'])
  const anchor = {
    click() { events.push('click') },
    remove() { events.push('remove') },
  }
  stubGlobal(t, 'document', {
    createElement(tag) { assert.equal(tag, 'a'); return anchor },
    body: { appendChild(element) { assert.equal(element, anchor); events.push('append') } },
  })
  t.mock.method(URL, 'createObjectURL', (content) => {
    assert.equal(content, blob)
    return 'blob:test-download'
  })
  t.mock.method(URL, 'revokeObjectURL', (url) => {
    assert.equal(url, 'blob:test-download')
    events.push('revoke')
  })
  t.mock.method(globalThis, 'setTimeout', (callback) => {
    pending.push(callback)
    return 1
  })

  saveDownload(blob, 'Сценарий.md')
  assert.equal(anchor.href, 'blob:test-download')
  assert.equal(anchor.download, 'Сценарий.md')
  assert.equal(anchor.hidden, true)
  assert.deepEqual(events, ['append', 'click', 'remove'])
  assert.equal(pending.length, 1)
  pending[0]()
  assert.deepEqual(events, ['append', 'click', 'remove', 'revoke'])
})

test('Browser download also releases its URL when the click fails', (t) => {
  const pending = []
  const anchor = {
    click() { throw new Error('Download blocked') },
    remove: t.mock.fn(),
  }
  stubGlobal(t, 'document', {
    createElement: () => anchor,
    body: { appendChild() {} },
  })
  t.mock.method(URL, 'createObjectURL', () => 'blob:test-download')
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {})
  t.mock.method(globalThis, 'setTimeout', (callback) => {
    pending.push(callback)
    return 1
  })

  assert.throws(() => saveDownload(new Blob(['test']), 'test.md'), /Download blocked/)
  assert.equal(anchor.remove.mock.callCount(), 1)
  assert.equal(revoke.mock.callCount(), 0)
  pending[0]()
  assert.equal(revoke.mock.callCount(), 1)
})
