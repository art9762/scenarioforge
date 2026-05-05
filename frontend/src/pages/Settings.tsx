import { useState, useEffect } from 'react'
import type { DepthMode, EquipmentProfile } from '../types'
import { api } from '../api/client'

interface ModelInfo {
  id: string
  provider: string
  name: string
}

const AGENTS = ['director', 'screenwriter', 'visual_director', 'copywriter', 'editor']
const AGENT_LABELS: Record<string, string> = {
  director: 'Режиссёр',
  screenwriter: 'Сценарист',
  visual_director: 'Визуал-директор',
  copywriter: 'Копирайтер',
  editor: 'Редактор',
}

const DEFAULT_EQUIPMENT: EquipmentProfile = {
  camera: '',
  lenses: '',
  lighting: '',
  audio: '',
  locations: '',
  special: '',
}

type SavedSettings = {
  depth: DepthMode
  overrides: Record<string, string>
  equipment: EquipmentProfile
}

function loadSavedSettings(): SavedSettings {
  const defaults = {
    depth: 'standard' as DepthMode,
    overrides: {},
    equipment: DEFAULT_EQUIPMENT,
  }

  try {
    const saved = localStorage.getItem('sf_settings')
    if (!saved) {
      return defaults
    }

    const parsed = JSON.parse(saved) as Partial<SavedSettings>

    return {
      depth: parsed.depth ?? defaults.depth,
      overrides: parsed.overrides ?? defaults.overrides,
      equipment: { ...defaults.equipment, ...parsed.equipment },
    }
  } catch {
    return defaults
  }
}

export default function Settings() {
  const [savedSettings] = useState(loadSavedSettings)
  const [depth, setDepth] = useState<DepthMode>(savedSettings.depth)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [overrides, setOverrides] = useState<Record<string, string>>(savedSettings.overrides)
  const [equipment, setEquipment] = useState<EquipmentProfile>(savedSettings.equipment)

  useEffect(() => {
    api.getModels()
      .then((data: unknown) => {
        // API returns array of {id, provider, name} objects
        const arr = data as ModelInfo[]
        setModels(arr)
      })
      .catch(() => setModels([
        { id: 'claude-haiku-4-5', provider: 'aurora', name: 'Claude Haiku 4.5' },
        { id: 'claude-sonnet-4-6', provider: 'aurora', name: 'Claude Sonnet 4.6' },
        { id: 'claude-opus-4-6', provider: 'aurora', name: 'Claude Opus 4.6' },
        { id: 'gpt-5.5', provider: 'orion', name: 'GPT 5.5' },
      ]))
  }, [])

  const save = () => {
    localStorage.setItem('sf_settings', JSON.stringify({ depth, overrides, equipment }))
    alert('Настройки сохранены')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Настройки</h1>

      {/* Depth mode */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Режим глубины по умолчанию</h2>
        <div className="flex gap-3">
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
      </section>

      {/* Model overrides */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Модели агентов</h2>
        <div className="space-y-3">
          {AGENTS.map((agent) => (
            <div key={agent} className="flex items-center gap-3">
              <span className="text-sm text-text-secondary w-40">{AGENT_LABELS[agent]}</span>
              <select
                value={overrides[agent] || ''}
                onChange={(e) => setOverrides({ ...overrides, [agent]: e.target.value })}
                className="flex-1 bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="">По умолчанию</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </section>

      {/* Equipment profile */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Профиль оборудования (по умолчанию)</h2>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(equipment).map(([key, val]) => (
            <div key={key}>
              <label className="block text-xs text-text-secondary mb-1">
                {{ camera: 'Камера', lenses: 'Объективы', lighting: 'Свет', audio: 'Звук', locations: 'Локации', special: 'Спецсредства' }[key] || key}
              </label>
              <input
                value={val}
                onChange={(e) => setEquipment({ ...equipment, [key]: e.target.value })}
                className="w-full bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          ))}
        </div>
      </section>

      <button onClick={save} className="bg-accent text-bg-primary px-6 py-3 rounded font-medium hover:opacity-90">
        Сохранить настройки
      </button>
    </div>
  )
}
