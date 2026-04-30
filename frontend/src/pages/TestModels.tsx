import { useState } from 'react'
import { api } from '../api/client'

interface ModelResult {
  model: string
  name: string
  provider: string
  ok: boolean
  latency: number
  reply?: string
  error?: string
}

export default function TestModels() {
  const [results, setResults] = useState<ModelResult[]>([])
  const [loading, setLoading] = useState(false)

  const runTest = async () => {
    setLoading(true)
    setResults([])
    try {
      const data = await api.testModels()
      setResults(data.results)
    } catch {
      alert('Не удалось запустить тест')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-2">Тест моделей</h1>
      <p className="text-text-secondary text-sm mb-6">
        Отправляет короткий запрос каждой модели и проверяет ответ.
      </p>

      <button
        onClick={runTest}
        disabled={loading}
        className="bg-accent text-bg-primary px-6 py-2.5 rounded font-medium hover:opacity-90 disabled:opacity-50 mb-8"
      >
        {loading ? 'Тестирую...' : 'Запустить тест'}
      </button>

      {loading && (
        <div className="flex items-center gap-3 text-text-secondary mb-6">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Отправляю запросы ко всем моделям...
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((r) => (
            <div
              key={r.model}
              className={`border rounded-lg p-4 ${r.ok ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${r.ok ? 'text-success' : 'text-danger'}`}>
                    {r.ok ? '✓' : '✗'}
                  </span>
                  <span className="font-medium text-text-primary">{r.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary">
                    {r.provider}
                  </span>
                </div>
                <span className="text-sm text-text-secondary">{r.latency}s</span>
              </div>
              <div className="text-sm text-text-secondary ml-7">
                <code className="text-xs">{r.model}</code>
              </div>
              {r.ok && r.reply && (
                <div className="text-sm text-text-secondary ml-7 mt-1">
                  Ответ: <span className="text-text-primary">{r.reply}</span>
                </div>
              )}
              {!r.ok && r.error && (
                <div className="text-sm text-danger ml-7 mt-1">
                  {r.error}
                </div>
              )}
            </div>
          ))}
          <div className="text-sm text-text-secondary pt-2 border-t border-bg-tertiary">
            Итого: {results.filter((r) => r.ok).length}/{results.length} моделей работают
          </div>
        </div>
      )}
    </div>
  )
}
