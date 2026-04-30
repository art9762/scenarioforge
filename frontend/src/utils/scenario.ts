import type { EquipmentProfile, Scenario } from '../types'

const EMPTY_EQUIPMENT: EquipmentProfile = {
  camera: '',
  lenses: '',
  lighting: '',
  audio: '',
  locations: '',
  special: '',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isScenario(value: unknown): value is Scenario {
  return isRecord(value) && typeof value.raw_markdown === 'string'
}

function scenarioFromMarkdown(raw_markdown: string): Scenario {
  return {
    title: 'Сценарий',
    type: '',
    genre: '',
    duration: '',
    date: '',
    equipment: { ...EMPTY_EQUIPMENT },
    characters: [],
    scenes: [],
    production_notes: [],
    raw_markdown,
  }
}

export function normalizeScenarioResponse(data: unknown): Scenario | null {
  if (isScenario(data)) {
    return data
  }

  if (!isRecord(data) || !('scenario' in data)) {
    return null
  }

  const scenario = data.scenario

  if (isScenario(scenario)) {
    return scenario
  }

  if (typeof scenario === 'string') {
    return scenarioFromMarkdown(scenario)
  }

  return null
}
