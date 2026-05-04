import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Project } from '../types'
import { useTeams } from '../contexts/TeamContext'
import Spinner from '../components/Spinner'

const TYPE_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  short_film: 'Короткий метр',
  miniature: 'Миниатюра',
}

const STATUS_LABELS: Record<string, string> = {
  created: 'Черновик',
  draft: 'Черновик',
  briefing: 'Бриф...',
  questions_ready: 'Бриф',
  answers_submitted: 'Готов к генерации',
  generating: 'Генерация...',
  completed: 'Готов',
  error: 'Ошибка',
  stopped: 'Остановлен',
}

function projectRoute(p: Project): string {
  switch (p.status) {
    case 'completed':
      return `/projects/${p.id}/scenario`
    case 'generating':
      return `/projects/${p.id}/generation`
    default:
      return `/projects/${p.id}/briefing`
  }
}

const ACTIVE_STATUSES = ['generating', 'briefing']

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<number>(0)
  const { currentTeam } = useTeams()

  const fetchProjects = useCallback(() => {
    api.listProjects(currentTeam?.slug).then(setProjects).catch(() => {})
  }, [currentTeam?.slug])

  useEffect(() => {
    let cancelled = false
    api.listProjects(currentTeam?.slug)
      .then(data => { if (!cancelled) setProjects(data) })
      .catch(() => { if (!cancelled) setProjects([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [currentTeam?.slug])

  useEffect(() => {
    clearInterval(intervalRef.current)
    const hasActive = projects.some((p) => ACTIVE_STATUSES.includes(p.status))
    if (hasActive) {
      intervalRef.current = window.setInterval(fetchProjects, 5000)
    }
    return () => clearInterval(intervalRef.current)
  }, [projects, fetchProjects])

  if (loading) return <Spinner label="Загрузка проектов..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Проекты</h1>
        <Link to="/new" className="bg-accent text-bg-primary px-4 py-2 rounded font-medium text-sm no-underline hover:opacity-90">
          + Новый проект
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">
          <p className="text-lg mb-2">Нет проектов</p>
          <p className="text-sm">Создайте первый сценарий</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={projectRoute(p)}
              className="block bg-bg-secondary border border-bg-tertiary rounded-lg p-4 no-underline hover:border-accent-dim transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-text-primary font-medium">{p.title || p.idea.slice(0, 60)}</h3>
                  <p className="text-text-secondary text-sm mt-1">{TYPE_LABELS[p.type] || p.type}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-bg-tertiary text-text-secondary">
                  {STATUS_LABELS[p.status] || p.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
