export interface Project {
  id: string
  title: string
  idea: string
  type: 'youtube' | 'short_film' | 'miniature'
  equipment: EquipmentProfile
  status: 'created' | 'draft' | 'briefing' | 'questions_ready' | 'answers_submitted' | 'generating' | 'completed' | 'error' | 'stopped'
  created_at: string
}

export interface EquipmentProfile {
  camera: string
  lenses: string
  lighting: string
  audio: string
  locations: string
  special: string
}

export interface BriefingQuestion {
  id: string
  question: string
  answer?: string
}

export interface PipelineStatus {
  status: 'idle' | 'running' | 'error' | 'generating' | 'completed' | 'stopped'
  current_agent?: string
  progress: number
  message?: string
  completed_agents?: string[]
  draft_preview?: string
}

export interface Scene {
  id: number
  title: string
  location: string
  time_of_day: string
  duration: string
  equipment_setup: string
  shot_list: string[]
  dialogue: string
  director_notes: string
  audio_sfx: string
}

export interface Scenario {
  title: string
  type: string
  genre: string
  duration: string
  date: string
  equipment: EquipmentProfile
  characters: { name: string; description: string; notes: string }[]
  scenes: Scene[]
  production_notes: string[]
  raw_markdown: string
}

export type DepthMode = 'fast' | 'standard' | 'deep'

export interface ModelConfig {
  [agent: string]: string
}

export interface AgentResult {
  agent: string
  model: string
  result: string
  tokens: Record<string, number> | null
  timestamp: string
}

export interface Revision {
  filename: string
  date: string
  time: string
  source: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}
