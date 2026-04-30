import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Scenario } from '../types'
import Spinner from '../components/Spinner'
import { normalizeScenarioResponse } from '../utils/scenario'

const AGENTS = [
  { value: 'screenwriter', label: 'Сценарист' },
  { value: 'visual_director', label: 'Визуал-директор' },
  { value: 'copywriter', label: 'Копирайтер' },
  { value: 'editor', label: 'Редактор' },
]

export default function ScenarioEditor() {
  const { id } = useParams<{ id: string }>()
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingScene, setEditingScene] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    api.getScenario(id)
      .then((data) => setScenario(normalizeScenarioResponse(data)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const handleRevise = async (sceneId: number, agent: string) => {
    if (!id) return
    try {
      await api.reviseScene(id, sceneId, agent)
      alert('Сцена отправлена на доработку')
    } catch {
      alert('Ошибка')
    }
  }

  const handleSave = async () => {
    if (!id || !scenario) return
    setSaving(true)
    try {
      await api.updateScenario(id, scenario.raw_markdown)
      alert('Сохранено')
    } catch {
      alert('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Загрузка..." />
  if (!scenario) return <p className="text-text-secondary">Сценарий не найден</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Редактор сценария</h1>
        <button onClick={handleSave} disabled={saving} className="bg-accent text-bg-primary px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>

      <div className="space-y-4">
        {scenario.scenes?.map((scene, i) => (
          <div key={i} className="bg-bg-secondary border border-bg-tertiary rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-accent">Сцена {i + 1} — {scene.title}</h3>
              <div className="flex gap-1">
                {AGENTS.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => handleRevise(scene.id, a.value)}
                    className="text-xs px-2 py-1 border border-bg-tertiary rounded text-text-secondary hover:border-accent hover:text-accent"
                    title={`Отправить ${a.label}`}
                  >
                    → {a.label}
                  </button>
                ))}
              </div>
            </div>

            {editingScene === i ? (
              <div>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full bg-bg-primary border border-bg-tertiary rounded p-3 text-sm text-text-primary font-mono resize-none h-48 focus:outline-none focus:border-accent"
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setEditingScene(null)} className="text-xs text-text-secondary hover:text-text-primary">Отмена</button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => { setEditingScene(i); setEditText(scene.dialogue || '') }}
                className="cursor-pointer text-sm text-text-secondary hover:text-text-primary screenplay-text whitespace-pre-wrap"
              >
                {scene.dialogue || 'Нажмите для редактирования...'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Raw edit fallback */}
      {(!scenario.scenes || scenario.scenes.length === 0) && (
        <textarea
          value={scenario.raw_markdown}
          onChange={(e) => setScenario({ ...scenario, raw_markdown: e.target.value })}
          className="w-full h-[70vh] bg-bg-secondary border border-bg-tertiary rounded-lg p-4 font-mono text-sm text-text-primary resize-none focus:outline-none focus:border-accent"
        />
      )}
    </div>
  )
}
