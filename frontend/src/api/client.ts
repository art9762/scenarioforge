import type { Project, BriefingQuestion, PipelineStatus, Scenario, DepthMode, ModelConfig } from '../types'

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
    request<void>(`/projects/${id}/generate`, { method: 'POST', body: JSON.stringify({ depth, models }) }),
  getStatus: (id: string) => request<PipelineStatus>(`/projects/${id}/status`),
  stopGeneration: (id: string) => request<void>(`/projects/${id}/stop`, { method: 'POST' }),

  // Scenario
  getScenario: (id: string) => request<Scenario>(`/projects/${id}`),
  updateScenario: (id: string, scenario: string) =>
    request<void>(`/projects/${id}/scenario`, { method: 'PUT', body: JSON.stringify({ scenario }) }),
  reviseScene: (id: string, sceneId: number, agent: string) =>
    request<void>(`/projects/${id}/revise`, { method: 'POST', body: JSON.stringify({ scene_id: sceneId, agent }) }),

  // Export
  exportMd: (id: string) => `${BASE}/projects/${id}/export/md`,
  exportPdf: (id: string) => `${BASE}/projects/${id}/export/pdf`,

  // Config
  getModels: () => request<{ id: string; provider: string; name: string }[]>('/config/models'),
  getDepthModes: () => request<Record<string, unknown>>('/config/depth-modes'),
}
