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

const AGENTS = ['director', 'screenwriter', 'visual_director', 'copywriter', 'editor']

export default function Generation() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [status, setStatus] = useState<PipelineStatus>({ status: 'idle', progress: 0 })
  const [depth, setDepth] = useState<DepthMode>('standard')
  const [phase, setPhase] = useState<'loading' | 'form' | 'running' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const intervalRef = useRef<number>(0)

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

  // Poll while running and react to status changes
  useEffect(() => {
    if (!id || phase !== 'running') return
    const handleStatus = (s: PipelineStatus) => {
      setStatus(s)
      if (s.status === 'done' || s.status === 'completed') {
        clearInterval(intervalRef.current)
        setTimeout(() => navigate(`/projects/${id}/scenario`), 1000)
      } else if (s.status === 'error') {
        clearInterval(intervalRef.current)
        setPhase('error')
        setErrorMsg(s.message || 'Ошибка генерации')
      }
    }
    const poll = () => {
      api.getStatus(id).then(handleStatus).catch(() => {})
    }
    poll()
    intervalRef.current = window.setInterval(poll, 2000)
    return () => clearInterval(intervalRef.current)
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

  return (
    <div className="max-w-md mx-auto py-12">
      <h1 className="text-2xl font-bold mb-6 text-center">Генерация сценария</h1>

      <div className="space-y-3 mb-8">
        {AGENTS.map((agent) => {
          const isActive = status.current_agent === agent
          const isPast = AGENTS.indexOf(agent) < AGENTS.indexOf(status.current_agent || '')
          return (
            <div key={agent} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${isActive ? 'border-accent bg-accent/5' : isPast ? 'border-success/30 bg-success/5' : 'border-bg-tertiary'}`}>
              <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-accent animate-pulse' : isPast ? 'bg-success' : 'bg-bg-tertiary'}`} />
              <span className={isActive ? 'text-accent font-medium' : isPast ? 'text-success' : 'text-text-secondary'}>
                {AGENT_LABELS[agent] || agent}
              </span>
              {isActive && <div className="ml-auto w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
            </div>
          )
        })}
      </div>

      <div className="bg-bg-secondary rounded-full h-2 overflow-hidden">
        <div className="bg-accent h-full transition-all duration-500" style={{ width: `${status.progress}%` }} />
      </div>
      <p className="text-center text-text-secondary text-sm mt-3">
        {status.message || `${status.progress}%`}
      </p>

      {(status.status === 'done' || status.status === 'completed') && (
        <p className="text-center text-success mt-4 font-medium">Готово! Переход к сценарию...</p>
      )}
      {status.status === 'error' && (
        <p className="text-center text-danger mt-4">{status.message || 'Ошибка генерации'}</p>
      )}
    </div>
  )
}
