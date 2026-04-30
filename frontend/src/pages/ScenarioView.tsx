import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Scenario } from '../types'
import Spinner from '../components/Spinner'
import { normalizeScenarioResponse } from '../utils/scenario'

export default function ScenarioView() {
  const { id } = useParams<{ id: string }>()
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeScene, setActiveScene] = useState(0)

  useEffect(() => {
    if (!id) return
    api.getScenario(id)
      .then((data) => setScenario(normalizeScenarioResponse(data)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Spinner label="Загрузка сценария..." />
  if (!scenario) return <p className="text-text-secondary">Сценарий не найден</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{scenario.title}</h1>
          <p className="text-text-secondary text-sm">{scenario.genre} • {scenario.duration}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/projects/${id}/edit`} className="px-3 py-2 border border-bg-tertiary rounded text-sm text-text-secondary hover:border-accent no-underline">
            Редактировать
          </Link>
          <a href={api.exportMd(id!)} className="px-3 py-2 border border-bg-tertiary rounded text-sm text-text-secondary hover:border-accent no-underline">
            MD
          </a>
          <a href={api.exportPdf(id!)} className="px-3 py-2 border border-bg-tertiary rounded text-sm text-text-secondary hover:border-accent no-underline">
            PDF
          </a>
        </div>
      </div>

      {/* Scene navigation */}
      {scenario.scenes && scenario.scenes.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {scenario.scenes.map((_s, i) => (
            <button
              key={i}
              onClick={() => setActiveScene(i)}
              className={`px-3 py-1 rounded text-xs whitespace-nowrap border ${i === activeScene ? 'border-accent text-accent bg-accent/10' : 'border-bg-tertiary text-text-secondary hover:border-accent-dim'}`}
            >
              Сцена {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Active scene */}
      {scenario.scenes && scenario.scenes[activeScene] && (
        <div className="bg-bg-secondary border border-bg-tertiary rounded-lg p-6 screenplay-text">
          <h2 className="text-lg font-bold text-accent mb-1">
            Сцена {activeScene + 1} — {scenario.scenes[activeScene].title}
          </h2>
          <div className="text-xs text-text-secondary mb-4 flex gap-4">
            <span>📍 {scenario.scenes[activeScene].location}</span>
            <span>🕐 {scenario.scenes[activeScene].time_of_day}</span>
            <span>⏱ {scenario.scenes[activeScene].duration}</span>
          </div>

          {scenario.scenes[activeScene].equipment_setup && (
            <div className="mb-3">
              <span className="text-xs text-text-secondary uppercase">Оборудование:</span>
              <p className="text-sm">{scenario.scenes[activeScene].equipment_setup}</p>
            </div>
          )}

          {scenario.scenes[activeScene].shot_list?.length > 0 && (
            <div className="mb-3">
              <span className="text-xs text-text-secondary uppercase">Кадры:</span>
              <ol className="list-decimal list-inside text-sm space-y-1 mt-1">
                {scenario.scenes[activeScene].shot_list.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          )}

          {scenario.scenes[activeScene].dialogue && (
            <div className="mb-3">
              <span className="text-xs text-text-secondary uppercase">Диалог:</span>
              <div className="mt-1 whitespace-pre-wrap text-sm border-l-2 border-accent pl-3">
                {scenario.scenes[activeScene].dialogue}
              </div>
            </div>
          )}

          {scenario.scenes[activeScene].director_notes && (
            <div className="mb-3">
              <span className="text-xs text-text-secondary uppercase">Заметки режиссёра:</span>
              <p className="text-sm italic text-text-secondary mt-1">{scenario.scenes[activeScene].director_notes}</p>
            </div>
          )}

          {scenario.scenes[activeScene].audio_sfx && (
            <div>
              <span className="text-xs text-text-secondary uppercase">Звук/SFX:</span>
              <p className="text-sm mt-1">{scenario.scenes[activeScene].audio_sfx}</p>
            </div>
          )}
        </div>
      )}

      {/* Raw markdown fallback */}
      {(!scenario.scenes || scenario.scenes.length === 0) && scenario.raw_markdown && (
        <div className="bg-bg-secondary border border-bg-tertiary rounded-lg p-6 screenplay-text whitespace-pre-wrap">
          {scenario.raw_markdown}
        </div>
      )}
    </div>
  )
}
