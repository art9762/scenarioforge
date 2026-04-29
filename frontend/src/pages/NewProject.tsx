import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

const PROJECT_TYPES = [
  { value: 'youtube', label: 'YouTube видео' },
  { value: 'short_film', label: 'Короткий метр' },
  { value: 'miniature', label: 'Миниатюра' },
]

export default function NewProject() {
  const navigate = useNavigate()
  const [idea, setIdea] = useState('')
  const [type, setType] = useState('youtube')
  const [equipment, setEquipment] = useState({
    camera: '',
    lenses: '',
    lighting: '',
    audio: '',
    locations: '',
    special: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!idea.trim()) return
    setSubmitting(true)
    try {
      const project = await api.createProject({ idea, type, equipment })
      navigate(`/projects/${project.id}/briefing`)
    } catch {
      alert('Ошибка создания проекта')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Новый проект</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm text-text-secondary mb-2">Идея сценария</label>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            className="w-full bg-bg-secondary border border-bg-tertiary rounded-lg p-3 text-text-primary resize-none h-32 focus:outline-none focus:border-accent"
            placeholder="Опишите вашу идею для видео или фильма..."
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-2">Тип проекта</label>
          <div className="flex gap-3">
            {PROJECT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`px-4 py-2 rounded border text-sm transition-colors ${type === t.value ? 'border-accent bg-accent/10 text-accent' : 'border-bg-tertiary text-text-secondary hover:border-accent-dim'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm text-text-secondary mb-3">Профиль оборудования</h3>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(equipment).map(([key, val]) => (
              <div key={key}>
                <label className="block text-xs text-text-secondary mb-1 capitalize">
                  {{ camera: 'Камера', lenses: 'Объективы', lighting: 'Свет', audio: 'Звук', locations: 'Локации', special: 'Спецсредства' }[key] || key}
                </label>
                <input
                  value={val}
                  onChange={(e) => setEquipment({ ...equipment, [key]: e.target.value })}
                  className="w-full bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                  placeholder={key}
                />
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !idea.trim()}
          className="w-full bg-accent text-bg-primary py-3 rounded font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Создание...' : 'Создать проект'}
        </button>
      </form>
    </div>
  )
}
