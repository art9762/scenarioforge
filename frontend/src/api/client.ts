import type { Project, BriefingQuestion, PipelineStatus, Scenario, DepthMode, ModelConfig, AgentResult, Revision, ChatMessage } from '../types'

interface AdminUser {
  id: string
  user_id: string
  email: string
  display_name: string
  is_admin: boolean
  is_active: boolean
  credits: number
  tier: string
  created_at: string
}

interface InviteCode {
  id: string
  code: string
  used: boolean
  used_by: string | null
  created_by: string
  used_at: string | null
  created_at: string
}

interface CreditCode {
  id: string
  code: string
  amount: number
  used: boolean
  used_by: string | null
  created_by: string
  used_at: string | null
  created_at: string
}

interface AdminStats {
  users: number
  projects: number
  total_generations: number
  invite_codes: { used: number; total: number }
  credit_codes: { used: number; total: number }
  tokens: { total: number; input: number; output: number }
}

const BASE = '/api'

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: getAuthHeaders(),
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
  reviseScene: (id: string, sceneId: number, agent: string, instructions: string = '') =>
    request<void>(`/projects/${id}/revise`, { method: 'POST', body: JSON.stringify({ scene_number: sceneId, agent, instructions }) }),

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

  // Auth
  login: (email: string, password: string) =>
    request<{ access_token: string; refresh_token: string; user_id: string; email: string; display_name: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string, invite_code: string, display_name?: string) =>
    request<{ access_token: string; refresh_token: string; user_id: string; email: string; display_name: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, invite_code, display_name }) }),
  getMe: () => request<{ user_id?: string; email?: string; display_name?: string; is_admin?: boolean; credits?: number; auth_enabled: boolean }>('/auth/me'),
  redeemCode: (code: string) =>
    request<{ credits: number; added: number }>('/auth/redeem', { method: 'POST', body: JSON.stringify({ code }) }),

  // Admin
  adminListUsers: () => request<AdminUser[]>('/admin/users'),
  adminUpdateUser: (id: string, data: { credits?: number; is_active?: boolean; is_admin?: boolean }) =>
    request<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  adminGenerateInviteCodes: (count: number) =>
    request<{ codes: string[] }>('/admin/invite-codes', { method: 'POST', body: JSON.stringify({ count }) }),
  adminListInviteCodes: () => request<InviteCode[]>('/admin/invite-codes'),
  adminGenerateCreditCodes: (count: number, amount: number) =>
    request<{ codes: CreditCode[] }>('/admin/credit-codes', { method: 'POST', body: JSON.stringify({ count, amount }) }),
  adminListCreditCodes: () => request<CreditCode[]>('/admin/credit-codes'),
  adminGetStats: () => request<AdminStats>('/admin/stats'),

  // SSE stream
  streamStatus: (id: string): EventSource => {
    return new EventSource(`${BASE}/projects/${id}/stream`)
  },
}
