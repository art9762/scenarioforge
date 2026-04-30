import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { PipelineStatus, DepthMode } from '../types'

const AGENT_LABELS: Record<string, string> = {
  director: 'Режиссёр',
  screenwriter: 'Сценарист',
  visual_director: 'Визуал-директор',
  copywriter: 'Копирайтер',
  editor: 'Редактор',
}

const AGENT_ICONS: Record<string, string> = {
  director: '🎬',
  screenwriter: '✍️',
  visual_director: '🎥',
  copywriter: '📝',
  editor: '🔍',
}

const AGENTS = ['director', 'screenwriter', 'visual_director', 'copywriter', 'editor']

export default function Generation() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [status, setStatus] = useState<PipelineStatus>({ status: 'idle', progress: 0 })
  const [depth, setDepth] = useState<DepthMode>('standard')
  const [phase, setPhase] = useState<'loading' | 'form' | 'running' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [draftPreview, setDraftPreview] = useState('')
  const [showDraft, setShowDraft] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  // On mount: check current project status
  useEffect(() => {
    if (!id) return
    api.getStatus(id).then((s) => {
      setStatus(s)
      if (s.status === 'generating') {
        setPhase('running')
      } else if (s.status === 'completed' || s.status === 'done') {
        navigate(`/projects/${id}/scenario`, { replace: true })
      } else if (s.status === 'error') {
        setPhase('error')
        setErrorMsg(s.message || 'Ошибка генерации')
      } else if (s.status === 'stopped') {
        setPhase('error')
        setErrorMsg('Генерация была остановлена')
      } else {
        setPhase('form')
      }
    }).catch(() => setPhase('form'))
  }, [id, navigate])

  // SSE connection while running
  useEffect(() => {
    if (!id || phase !== 'running') return

    const es = api.streamStatus(id)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as PipelineStatus & { draft_preview?: string }
        setStatus(data)

        if (data.draft_preview) {
          setDraftPreview(data.draft_preview)
        }

        if (data.status === 'done' || data.status === 'completed') {
          es.close()
          setTimeout(() => navigate(`/projects/${id}/scenario`), 1000)
        } else if (data.status === 'error') {
          es.close()
          setPhase('error')
          setErrorMsg(data.message || 'Ошибка генерации')
        } else if (data.status === 'stopped') {
          es.close()
          setPhase('error')
          setErrorMsg('Генерация была остановлена')
        }
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      // SSE error — fallback to polling
      es.close()
      const poll = () => {
        api.getStatus(id).then((s) => {
          setStatus(s)
          if (s.status === 'done' || s.status === 'completed') {
            setTimeout(() => navigate(`/projects/${id}/scenario`), 1000)
          } else if (s.status === 'error' || s.status === 'stopped') {
            setPhase('error')
            setErrorMsg(s.message || 'Ошибка')
          } else {
            setTimeout(poll, 2000)
          }
        }).catch(() => setTimeout(poll, 3000))
      }
      poll()
    }

    return () => {
      es.close()
    }
  }, [id, phase, navigate])

  const startGen = async () => {
    if (!id) return
    try {
      await api.startGeneration(id, depth)
      setPhase('running')
    } catch {
      alert('Ошибка запуска генерации')
    }
  }

  const handleStop = async () => {
    if (!id) return
    try {
      await api.stopGeneration(id)
    } catch {
      // ignore
    }
  }

  if (phase === 'loading') {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <h1 className="text-2xl font-bold mb-4">Ошибка</h1>
        <p className="text-danger mb-6">{errorMsg}</p>
        <button onClick={() => setPhase('form')} className="bg-accent text-bg-primary px-8 py-3 rounded font-medium hover:opacity-90">
          Попробовать снова
        </button>
      </div>
    )
  }

  if (phase === 'form') {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <h1 className="text-2xl font-bold mb-6">Запуск генерации</h1>
        <div className="mb-6">
          <label className="block text-sm text-text-secondary mb-3">Режим глубины</label>
          <div className="flex gap-3 justify-center">
            {(['fast', 'standard', 'deep'] as DepthMode[]).map((d) => (
              <button
                key={d}
                onClick={() => setDepth(d)}
                className={`px-4 py-2 rounded border text-sm ${depth === d ? 'border-accent text-accent bg-accent/10' : 'border-bg-tertiary text-text-secondary hover:border-accent-dim'}`}
              >
                {{ fast: '⚡ Быстро', standard: '🎯 Стандарт', deep: '🏆 Глубоко' }[d]}
              </button>
            ))}
          </div>
        </div>
        <button onClick={startGen} className="bg-accent text-bg-primary px-8 py-3 rounded font-medium hover:opacity-90">
          Начать генерацию
        </button>
      </div>
    )
  }

  // Running phase — pipeline visualization
  const completedAgents = status.completed_agents || []
  const progressPercent = Math.round((status.progress || 0) * 100)

  return (
    <div className="max-w-2xl mx-auto py-12">
      <h1 className="text-2xl font-bold mb-8 text-center">Генерация сценария</h1>

      {/* Agent pipeline graph */}
      <div className="relative mb-8">
        {/* Connection line */}
        <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-bg-tertiary" />

        <div className="space-y-1">
          {AGENTS.map((agent, idx) => {
            const isActive = status.current_agent === agent
            const isComplete = completedAgents.includes(agent)
            return (
              <div key={agent} className="relative">
                {/* Arrow between agents */}
                {idx > 0 && (
                  <div className="flex justify-center py-1">
                    <svg className={`w-4 h-4 ${isComplete || isActive ? 'text-accent' : 'text-bg-tertiary'}`} viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 12l-4-4h8z" />
                    </svg>
                  </div>
                )}

                <div className={`flex items-center gap-4 px-4 py-3 rounded-lg border transition-all duration-300 ${
                  isActive ? 'border-accent bg-accent/5 shadow-lg shadow-accent/10' :
                  isComplete ? 'border-success/30 bg-success/5' :
                  'border-bg-tertiary bg-bg-secondary/50'
                }`}>
                  {/* Status indicator */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                    isActive ? 'bg-accent/20 animate-pulse' :
                    isComplete ? 'bg-success/20' :
                    'bg-bg-tertiary/50'
                  }`}>
                    {isComplete ? '✓' : AGENT_ICONS[agent] || '●'}
                  </div>

                  {/* Agent info */}
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium ${
                      isActive ? 'text-accent' :
                      isComplete ? 'text-success' :
                      'text-text-secondary'
                    }`}>
                      {AGENT_LABELS[agent] || agent}
                    </div>
                    {isActive && (
                      <div className="text-xs text-text-secondary mt-0.5">Работает...</div>
                    )}
                    {isComplete && (
                      <div className="text-xs text-success/70 mt-0.5">Готово</div>
                    )}
                  </div>

                  {/* Spinner for active */}
                  {isActive && (
                    <div className="flex-shrink-0 w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  )}

                  {/* Checkmark for complete */}
                  {isComplete && (
                    <div className="flex-shrink-0 text-success text-sm">✓</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-bg-secondary rounded-full h-2.5 overflow-hidden mb-2">
        <div
          className="bg-gradient-to-r from-accent-dim to-accent h-full transition-all duration-700 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-text-secondary mb-6">
        <span>{status.current_agent ? AGENT_LABELS[status.current_agent] : ''}</span>
        <span>{progressPercent}%</span>
      </div>

      {/* Draft preview toggle */}
      {draftPreview && (
        <div className="mb-6">
          <button
            onClick={() => setShowDraft(!showDraft)}
            className="text-xs text-text-secondary hover:text-accent flex items-center gap-1 mb-2"
          >
            {showDraft ? '▼' : '▶'} Предпросмотр черновика
          </button>
          {showDraft && (
            <div className="bg-bg-secondary border border-bg-tertiary rounded-lg p-4 text-xs text-text-secondary screenplay-text whitespace-pre-wrap max-h-48 overflow-y-auto">
              {draftPreview}
              {draftPreview.length >= 500 && <span className="text-accent">...</span>}
            </div>
          )}
        </div>
      )}

      {/* Stop button */}
      <div className="text-center">
        <button
          onClick={handleStop}
          className="text-sm text-text-secondary hover:text-danger border border-bg-tertiary hover:border-danger px-4 py-2 rounded transition-colors"
        >
          Остановить генерацию
        </button>
      </div>

      {(status.status === 'done' || status.status === 'completed') && (
        <p className="text-center text-success mt-6 font-medium">Готово! Переход к сценарию...</p>
      )}
    </div>
  )
}
