import { useState, useEffect } from 'react'
import { api } from '../api/client'

type Tab = 'users' | 'invites' | 'credits'

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

export default function Admin() {
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<UserInfo[]>([])
  const [inviteCodes, setInviteCodes] = useState<CodeInfo[]>([])
  const [creditCodes, setCreditCodes] = useState<CodeInfo[]>([])
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)
  const [inviteCount, setInviteCount] = useState(5)
  const [creditCount, setCreditCount] = useState(5)
  const [creditAmount, setCreditAmount] = useState(10)
  const [loading, setLoading] = useState(false)
  const [editUser, setEditUser] = useState<UserInfo | null>(null)
  const [editCredits, setEditCredits] = useState(0)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [u, i, c, s] = await Promise.all([
        api.adminListUsers(),
        api.adminListInviteCodes(),
        api.adminListCreditCodes(),
        api.adminGetStats(),
      ])
      setUsers(u)
      setInviteCodes(i)
      setCreditCodes(c)
      setStats(s)
    } catch {
      // ignore
    }
  }

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
      await api.adminUpdateUser(editUser.id, { credits: editCredits, is_active: editUser.is_active, is_admin: editUser.is_admin })
      setEditUser(null)
      const u = await api.adminListUsers()
      setUsers(u)
    } catch {
      alert('Ошибка сохранения')
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'users', label: 'Пользователи' },
    { key: 'invites', label: 'Инвайт-коды' },
    { key: 'credits', label: 'Коды пополнения' },
  ]

  return (
    <div className="max-w-5xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-2">Админ-панель</h1>

      {stats && (
        <div className="flex flex-wrap gap-4 mb-6 text-sm text-text-secondary">
          <span>Юзеров: {(stats as any).users}</span>
          <span>Проектов: {(stats as any).projects}</span>
          <span>Генераций: {(stats as any).total_generations}</span>
          <span>Инвайтов: {(stats as any).invite_codes?.used}/{(stats as any).invite_codes?.total}</span>
          <span>Кредитов: {(stats as any).credit_codes?.used}/{(stats as any).credit_codes?.total}</span>
          <span>Токены: {((stats as any).tokens?.total || 0).toLocaleString()} (вх: {((stats as any).tokens?.input || 0).toLocaleString()}, вых: {((stats as any).tokens?.output || 0).toLocaleString()})</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-bg-tertiary">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Users */}
      {tab === 'users' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-bg-tertiary">
                <th className="py-2 px-2">Email</th>
                <th className="py-2 px-2">Имя</th>
                <th className="py-2 px-2">Кредиты</th>
                <th className="py-2 px-2">Статус</th>
                <th className="py-2 px-2">Админ</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-bg-tertiary/50">
                  <td className="py-2 px-2">{u.email}</td>
                  <td className="py-2 px-2">{u.display_name}</td>
                  <td className="py-2 px-2">{u.credits}</td>
                  <td className="py-2 px-2">{u.is_active ? '✓' : '✗'}</td>
                  <td className="py-2 px-2">{u.is_admin ? '👑' : ''}</td>
                  <td className="py-2 px-2">
                    <button
                      onClick={() => { setEditUser(u); setEditCredits(u.credits) }}
                      className="text-accent text-xs hover:underline"
                    >
                      Изменить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Edit modal */}
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
    </div>
  )
}
