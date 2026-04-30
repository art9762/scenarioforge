import type { Project, BriefingQuestion, PipelineStatus, Scenario, DepthMode, ModelConfig, AgentResult, Revision, ChatMessage } from '../types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  // Projects
  listProjects: () => request<Project[]>('/projects'),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (data: { idea: string; type: string; equipment: Record<string, string> }) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),

  // Pipeline
  startBriefing: (id: string) => request<{ questions: (string | BriefingQuestion)[] }>(`/projects/${id}/brief`, { method: 'POST' }),
  submitAnswers: (id: string, answers: string[]) =>
    request<void>(`/projects/${id}/brief/answers`, { method: 'POST', body: JSON.stringify({ answers }) }),
  startGeneration: (id: string, depth: DepthMode, models?: ModelConfig) =>
    request<void>(`/projects/${id}/generate`, { method: 'POST', body: JSON.stringify({ depth_mode: depth, model_overrides: models || {} }) }),
  getStatus: (id: string) => request<PipelineStatus>(`/projects/${id}/status`),
  stopGeneration: (id: string) => request<void>(`/projects/${id}/stop`, { method: 'POST' }),

  // Scenario
  getScenario: (id: string) => request<Scenario>(`/projects/${id}`),
  updateScenario: (id: string, scenario: string) =>
    request<void>(`/projects/${id}/scenario`, { method: 'PUT', body: JSON.stringify({ scenario }) }),
  reviseScene: (id: string, sceneId: number, agent: string) =>
    request<void>(`/projects/${id}/revise`, { method: 'POST', body: JSON.stringify({ scene_number: sceneId, agent }) }),

  // Agent results
  listAgentResults: (id: string) => request<{ results: AgentResult[] }>(`/projects/${id}/agents`),
  getAgentResult: (id: string, agent: string) => request<AgentResult>(`/projects/${id}/agents/${agent}`),

  // Revisions
  listRevisions: (id: string) => request<{ revisions: Revision[] }>(`/projects/${id}/revisions`),
  getRevision: (id: string, filename: string) => request<{ filename: string; content: string }>(`/projects/${id}/revisions/${filename}`),

  // Agent chat
  chatWithAgent: (id: string, agent: string, message: string, contextFragment?: string) =>
    request<{ response: string; agent: string }>(`/projects/${id}/chat/${agent}`, {
      method: 'POST',
      body: JSON.stringify({ message, context_fragment: contextFragment }),
    }),
  getChatHistory: (id: string, agent: string) =>
    request<{ messages: ChatMessage[]; agent: string }>(`/projects/${id}/chat/${agent}`),
  clearChatHistory: (id: string, agent: string) =>
    request<void>(`/projects/${id}/chat/${agent}`, { method: 'DELETE' }),

  // Ask about fragment
  askAboutFragment: (id: string, question: string, fragment: string, agent: string = 'director') =>
    request<{ response: string; agent: string }>(`/projects/${id}/ask`, {
      method: 'POST',
      body: JSON.stringify({ question, fragment, agent }),
    }),

  // Export
  exportMd: (id: string) => `${BASE}/projects/${id}/export/md`,
  exportPdf: (id: string) => `${BASE}/projects/${id}/export/pdf`,

  // Config
  getModels: () => request<{ id: string; provider: string; name: string }[]>('/config/models'),
  getDepthModes: () => request<Record<string, unknown>>('/config/depth-modes'),

  // Test
  testModels: () => request<{ results: { model: string; name: string; provider: string; ok: boolean; latency: number; reply?: string; error?: string }[] }>('/test/models', { method: 'POST' }),

  // SSE stream
  streamStatus: (id: string): EventSource => {
    return new EventSource(`${BASE}/projects/${id}/stream`)
  },
}
