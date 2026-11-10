import type { PipelineStatus } from '../types'

interface StatusSource {
  streamStatus: (id: string, onStatus: (status: PipelineStatus) => void, signal: AbortSignal) => Promise<void>
  getStatus: (id: string, signal: AbortSignal) => Promise<PipelineStatus>
}

interface StatusObserver {
  onStatus: (status: PipelineStatus) => void
  onComplete: () => void
  onError: (status: PipelineStatus) => void
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** One stream, followed by one sequential polling loop if the stream ends or fails. */
export async function observeGeneration(source: StatusSource, id: string, observer: StatusObserver, signal: AbortSignal): Promise<void> {
  const stream = new AbortController()
  const stopStream = () => stream.abort()
  signal.addEventListener('abort', stopStream, { once: true })
  let terminal: PipelineStatus | undefined

  const receive = (status: PipelineStatus) => {
    if (signal.aborted || terminal) return
    observer.onStatus(status)
    if (['completed', 'error', 'stopped'].includes(status.status)) {
      terminal = status
      stopStream()
    }
  }

  try {
    signal.throwIfAborted()
    try {
      await source.streamStatus(id, receive, stream.signal)
    } catch {
      // Failed HTTP responses, malformed events and EOF all fall back to polling.
      // Caller cancellation is handled below and never becomes a UI error.
    }

    while (!signal.aborted && !terminal) {
      try {
        receive(await source.getStatus(id, signal))
      } catch {
        if (signal.aborted) return
        await delay(3000, signal)
        continue
      }
      if (!terminal) await delay(2000, signal)
    }

    if (signal.aborted || !terminal) return
    if (terminal.status === 'completed') {
      await delay(1000, signal)
      if (!signal.aborted) observer.onComplete()
    } else {
      observer.onError(terminal)
    }
  } catch (error) {
    if (!signal.aborted) throw error
  } finally {
    signal.removeEventListener('abort', stopStream)
    stopStream()
  }
}
