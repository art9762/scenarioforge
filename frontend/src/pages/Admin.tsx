import { useState, useEffect, useMemo } from 'react'
import { api } from '../api/client'

type Tab = 'users' | 'invites' | 'credits' | 'teams' | 'activity'

interface UserInfo {
  id: string
  email: string
  display_name: string
  is_active: boolean
  is_admin: boolean
  credits: number
  tier: string
  created_at: string
}

interface CodeInfo {
  id: string
  code: string
  amount?: number
  created_by: string
  used_by: string | null
  used_at: string | null
  created_at: string
}

interface StatsInfo {
  users: number
  projects: number
  teams: number
  total_generations: number
  invite_codes: { used: number; total: number }
  credit_codes: { used: number; total: number }
  tokens: { total: number; input: number; output: number }
}

interface AdminTeam {
  id: string
  name: string
  slug: string
  credits: number
  members_count: number
  created_by_email: string | null
  created_at: string
}

interface AuditEntry {
  id: number
  user_email: string | null
  action: string
  details: Record<string, unknown> | null
  created_at: string
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<UserInfo[]>([])
  const [inviteCodes, setInviteCodes] = useState<CodeInfo[]>([])
  const [creditCodes, setCreditCodes] = useState<CodeInfo[]>([])
  const [stats, setStats] = useState<StatsInfo | null>(null)
  const [teams, setTeams] = useState<AdminTeam[]>([])
  const [activity, setActivity] = useState<AuditEntry[]>([])
  const [inviteCount, setInviteCount] = useState(5)
  const [creditCount, setCreditCount] = useState(5)
  const [creditAmount, setCreditAmount] = useState(10)
  const [loading, setLoading] = useState(false)
  const [editUser, setEditUser] = useState<UserInfo | null>(null)
  const [editCredits, setEditCredits] = useState(0)
  const [editTier, setEditTier] = useState('free')
  const [editTeam, setEditTeam] = useState<AdminTeam | null>(null)
  const [editTeamCredits, setEditTeamCredits] = useState(0)
  const [userSearch, setUserSearch] = useState('')
  const [activityOffset, setActivityOffset] = useState(0)
  const [hasMoreActivity, setHasMoreActivity] = useState(true)

  const loadActivity = async (offset = 0) => {
    try {
      const entries = await api.adminGetActivity(50, offset)
      if (offset === 0) {
        setActivity(entries)
      } else {
        setActivity(prev => [...prev, ...entries])
      }
      setHasMoreActivity(entries.length === 50)
      setActivityOffset(offset + entries.length)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.adminListUsers(),
      api.adminListInviteCodes(),
      api.adminListCreditCodes(),
      api.adminGetStats(),
      api.adminListTeams(),
    ]).then(([u, i, c, s, t]) => {
      if (cancelled) return
      setUsers(u)
      setInviteCodes(i)
      setCreditCodes(c)
      setStats(s)
      setTeams(t)
    }).catch(() => {})
    api.adminGetActivity(50, 0).then(entries => {
      if (cancelled) return
      setActivity(entries)
      setHasMoreActivity(entries.length === 50)
      setActivityOffset(entries.length)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const filteredUsers = useMemo(() => {
    if (!userSearch) return users
    const q = userSearch.toLowerCase()
    return users.filter(u => u.email.toLowerCase().includes(q) || (u.display_name || '').toLowerCase().includes(q))
  }, [users, userSearch])

  const generateInvites = async () => {
    setLoading(true)
    try {
      await api.adminGenerateInviteCodes(inviteCount)
      const codes = await api.adminListInviteCodes()
      setInviteCodes(codes)
    } finally {
      setLoading(false)
    }
  }

  const generateCredits = async () => {
    setLoading(true)
    try {
      await api.adminGenerateCreditCodes(creditCount, creditAmount)
      const codes = await api.adminListCreditCodes()
      setCreditCodes(codes)
    } finally {
      setLoading(false)
    }
  }

  const saveUser = async () => {
    if (!editUser) return
    try {
      await api.adminUpdateUser(editUser.id, {
        credits: editCredits,
        is_active: editUser.is_active,
        is_admin: editUser.is_admin,
        tier: editTier,
      })
      setEditUser(null)
      const u = await api.adminListUsers()
      setUsers(u)
    } catch {
      alert('Ошибка сохранения')
    }
  }

  const saveTeam = async () => {
    if (!editTeam) return
    try {
      await api.adminUpdateTeam(editTeam.id, { credits: editTeamCredits })
      setEditTeam(null)
      const t = await api.adminListTeams()
      setTeams(t)
      const s = await api.adminGetStats()
      setStats(s)
    } catch {
      alert('Ошибка сохранения')
    }
  }

  const deleteTeam = async (team: AdminTeam) => {
    if (!confirm(`Удалить команду "${team.name}"? Это действие необратимо.`)) return
    try {
      await api.adminDeleteTeam(team.id)
      const t = await api.adminListTeams()
      setTeams(t)
      const s = await api.adminGetStats()
      setStats(s)
    } catch {
      alert('Ошибка удаления')
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'users', label: 'Пользователи' },
    { key: 'teams', label: 'Команды' },
    { key: 'invites', label: 'Инвайт-коды' },
    { key: 'credits', label: 'Коды пополнения' },
    { key: 'activity', label: 'Активность' },
  ]

  const actionLabels: Record<string, string> = {
    register: 'Регистрация',
    login: 'Вход',
    generate: 'Генерация',
    admin_update_user: 'Изменение пользователя',
    admin_update_team: 'Изменение команды',
    admin_delete_team: 'Удаление команды',
  }

  return (
    <div className="max-w-5xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-2">Админ-панель</h1>

      {stats && (
        <div className="flex flex-wrap gap-4 mb-6 text-sm text-text-secondary">
          <span>Юзеров: {stats.users}</span>
          <span>Команд: {stats.teams}</span>
          <span>Проектов: {stats.projects}</span>
          <span>Генераций: {stats.total_generations}</span>
          <span>Инвайтов: {stats.invite_codes?.used}/{stats.invite_codes?.total}</span>
          <span>Кредитов: {stats.credit_codes?.used}/{stats.credit_codes?.total}</span>
          <span>Токены: {(stats.tokens?.total || 0).toLocaleString()} (вх: {(stats.tokens?.input || 0).toLocaleString()}, вых: {(stats.tokens?.output || 0).toLocaleString()})</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-bg-tertiary overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t.key ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Users */}
      {tab === 'users' && (
        <div>
          <div className="mb-4">
            <input
              type="text"
              placeholder="Поиск по email или имени..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full max-w-sm bg-bg-primary border border-bg-tertiary rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary border-b border-bg-tertiary">
                  <th className="py-2 px-2">Email</th>
                  <th className="py-2 px-2">Имя</th>
                  <th className="py-2 px-2">Кредиты</th>
                  <th className="py-2 px-2">Тариф</th>
                  <th className="py-2 px-2">Статус</th>
                  <th className="py-2 px-2">Админ</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="border-b border-bg-tertiary/50">
                    <td className="py-2 px-2">{u.email}</td>
                    <td className="py-2 px-2">{u.display_name}</td>
                    <td className="py-2 px-2">{u.credits}</td>
                    <td className="py-2 px-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${u.tier === 'pro' ? 'bg-accent/20 text-accent' : 'bg-bg-tertiary text-text-secondary'}`}>
                        {u.tier}
                      </span>
                    </td>
                    <td className="py-2 px-2">{u.is_active ? '✓' : '✗'}</td>
                    <td className="py-2 px-2">{u.is_admin ? '👑' : ''}</td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() => { setEditUser(u); setEditCredits(u.credits); setEditTier(u.tier) }}
                        className="text-accent text-xs hover:underline"
                      >
                        Изменить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Edit user modal */}
          {editUser && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditUser(null)}>
              <div className="bg-bg-secondary border border-bg-tertiary rounded-lg p-6 w-80" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-bold mb-4">{editUser.email}</h3>
                <label className="block text-sm text-text-secondary mb-1">Кредиты</label>
                <input
                  type="number"
                  value={editCredits}
                  onChange={(e) => setEditCredits(Number(e.target.value))}
                  className="w-full bg-bg-primary border border-bg-tertiary rounded px-3 py-2 mb-3"
                />
                <label className="block text-sm text-text-secondary mb-1">Тариф</label>
                <select
                  value={editTier}
                  onChange={(e) => setEditTier(e.target.value)}
                  className="w-full bg-bg-primary border border-bg-tertiary rounded px-3 py-2 mb-3"
                >
                  <option value="free">free</option>
                  <option value="pro">pro</option>
                </select>
                <label className="flex items-center gap-2 mb-2 text-sm">
                  <input type="checkbox" checked={editUser.is_active} onChange={(e) => setEditUser({ ...editUser, is_active: e.target.checked })} />
                  Активен
                </label>
                <label className="flex items-center gap-2 mb-4 text-sm">
                  <input type="checkbox" checked={editUser.is_admin} onChange={(e) => setEditUser({ ...editUser, is_admin: e.target.checked })} />
                  Админ
                </label>
                <div className="flex gap-2">
                  <button onClick={saveUser} className="bg-accent text-bg-primary px-4 py-2 rounded text-sm">Сохранить</button>
                  <button onClick={() => setEditUser(null)} className="border border-bg-tertiary px-4 py-2 rounded text-sm">Отмена</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Teams */}
      {tab === 'teams' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-bg-tertiary">
                <th className="py-2 px-2">Название</th>
                <th className="py-2 px-2">Slug</th>
                <th className="py-2 px-2">Кредиты</th>
                <th className="py-2 px-2">Участников</th>
                <th className="py-2 px-2">Создатель</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} className="border-b border-bg-tertiary/50">
                  <td className="py-2 px-2">{t.name}</td>
                  <td className="py-2 px-2 font-mono text-text-secondary">{t.slug}</td>
                  <td className="py-2 px-2">{t.credits}</td>
                  <td className="py-2 px-2">{t.members_count}</td>
                  <td className="py-2 px-2">{t.created_by_email || '—'}</td>
                  <td className="py-2 px-2 flex gap-2">
                    <button
                      onClick={() => { setEditTeam(t); setEditTeamCredits(t.credits) }}
                      className="text-accent text-xs hover:underline"
                    >
                      Изменить
                    </button>
                    <button
                      onClick={() => deleteTeam(t)}
                      className="text-red-400 text-xs hover:underline"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
              {teams.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-text-secondary">Команд пока нет</td></tr>
              )}
            </tbody>
          </table>

          {/* Edit team modal */}
          {editTeam && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditTeam(null)}>
              <div className="bg-bg-secondary border border-bg-tertiary rounded-lg p-6 w-80" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-bold mb-4">{editTeam.name}</h3>
                <label className="block text-sm text-text-secondary mb-1">Кредиты</label>
                <input
                  type="number"
                  value={editTeamCredits}
                  onChange={(e) => setEditTeamCredits(Number(e.target.value))}
                  className="w-full bg-bg-primary border border-bg-tertiary rounded px-3 py-2 mb-4"
                />
                <div className="flex gap-2">
                  <button onClick={saveTeam} className="bg-accent text-bg-primary px-4 py-2 rounded text-sm">Сохранить</button>
                  <button onClick={() => setEditTeam(null)} className="border border-bg-tertiary px-4 py-2 rounded text-sm">Отмена</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invite Codes */}
      {tab === 'invites' && (
        <div>
          <div className="flex gap-3 items-center mb-4">
            <input
              type="number"
              min={1}
              max={100}
              value={inviteCount}
              onChange={(e) => setInviteCount(Number(e.target.value))}
              className="w-20 bg-bg-primary border border-bg-tertiary rounded px-3 py-2 text-sm"
            />
            <button onClick={generateInvites} disabled={loading} className="bg-accent text-bg-primary px-4 py-2 rounded text-sm hover:opacity-90 disabled:opacity-50">
              Сгенерировать
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-bg-tertiary">
                <th className="py-2 px-2">Код</th>
                <th className="py-2 px-2">Статус</th>
                <th className="py-2 px-2">Дата</th>
              </tr>
            </thead>
            <tbody>
              {inviteCodes.map((c) => (
                <tr key={c.id} className="border-b border-bg-tertiary/50">
                  <td className="py-2 px-2 font-mono">{c.code}</td>
                  <td className="py-2 px-2">{c.used_by ? <span className="text-text-secondary">Использован</span> : <span className="text-success">Свободен</span>}</td>
                  <td className="py-2 px-2 text-text-secondary">{c.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Credit Codes */}
      {tab === 'credits' && (
        <div>
          <div className="flex gap-3 items-center mb-4">
            <input
              type="number"
              min={1}
              max={100}
              value={creditCount}
              onChange={(e) => setCreditCount(Number(e.target.value))}
              className="w-20 bg-bg-primary border border-bg-tertiary rounded px-3 py-2 text-sm"
              placeholder="Кол-во"
            />
            <input
              type="number"
              min={1}
              value={creditAmount}
              onChange={(e) => setCreditAmount(Number(e.target.value))}
              className="w-24 bg-bg-primary border border-bg-tertiary rounded px-3 py-2 text-sm"
              placeholder="Кредитов"
            />
            <button onClick={generateCredits} disabled={loading} className="bg-accent text-bg-primary px-4 py-2 rounded text-sm hover:opacity-90 disabled:opacity-50">
              Сгенерировать
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-bg-tertiary">
                <th className="py-2 px-2">Код</th>
                <th className="py-2 px-2">Кредитов</th>
                <th className="py-2 px-2">Статус</th>
                <th className="py-2 px-2">Дата</th>
              </tr>
            </thead>
            <tbody>
              {creditCodes.map((c) => (
                <tr key={c.id} className="border-b border-bg-tertiary/50">
                  <td className="py-2 px-2 font-mono">{c.code}</td>
                  <td className="py-2 px-2">{c.amount}</td>
                  <td className="py-2 px-2">{c.used_by ? <span className="text-text-secondary">Использован</span> : <span className="text-success">Свободен</span>}</td>
                  <td className="py-2 px-2 text-text-secondary">{c.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Activity Log */}
      {tab === 'activity' && (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary border-b border-bg-tertiary">
                  <th className="py-2 px-2">Дата</th>
                  <th className="py-2 px-2">Пользователь</th>
                  <th className="py-2 px-2">Действие</th>
                  <th className="py-2 px-2">Детали</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id} className="border-b border-bg-tertiary/50">
                    <td className="py-2 px-2 text-text-secondary whitespace-nowrap">{a.created_at?.slice(0, 16).replace('T', ' ')}</td>
                    <td className="py-2 px-2">{a.user_email || '—'}</td>
                    <td className="py-2 px-2">{actionLabels[a.action] || a.action}</td>
                    <td className="py-2 px-2 text-text-secondary text-xs max-w-xs truncate">
                      {a.details ? JSON.stringify(a.details) : ''}
                    </td>
                  </tr>
                ))}
                {activity.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-center text-text-secondary">Нет записей</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {hasMoreActivity && activity.length > 0 && (
            <button
              onClick={() => loadActivity(activityOffset)}
              className="mt-4 border border-bg-tertiary px-4 py-2 rounded text-sm hover:bg-bg-tertiary/50"
            >
              Загрузить ещё
            </button>
          )}
        </div>
      )}
    </div>
  )
}
