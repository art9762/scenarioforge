import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useTeams } from '../contexts/TeamContext'
import { useAuth } from '../contexts/AuthContext'
import type { TeamDetail } from '../types'
import Spinner from '../components/Spinner'

export default function TeamSettings() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { refreshTeams } = useTeams()
  const { user } = useAuth()
  const [team, setTeam] = useState<TeamDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editName, setEditName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('editor')
  const [transferAmount, setTransferAmount] = useState('')
  const [creditCode, setCreditCode] = useState('')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const isOwner = team?.members.some(m => m.user_id === user?.user_id && m.role === 'owner')

  const load = async () => {
    if (!slug) return
    try {
      const data = await api.getTeam(slug)
      setTeam(data)
      setEditName(data.name)
    } catch {
      navigate('/teams')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    if (slug) {
      api.getTeam(slug)
        .then(data => { if (!cancelled) { setTeam(data); setEditName(data.name) } })
        .catch(() => { if (!cancelled) navigate('/teams') })
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    return () => { cancelled = true }
  }, [slug, navigate])

  const flash = (m: string) => { setMsg(m); setError(''); setTimeout(() => setMsg(''), 3000) }
  const flashErr = (m: string) => { setError(m); setMsg(''); setTimeout(() => setError(''), 3000) }

  const handleRename = async () => {
    if (!slug || !editName.trim()) return
    try {
      const res = await api.updateTeam(slug, editName.trim())
      await refreshTeams()
      navigate(`/teams/${res.slug}`, { replace: true })
      flash('Название обновлено')
    } catch { flashErr('Ошибка переименования') }
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slug || !newEmail.trim()) return
    try {
      await api.addTeamMember(slug, newEmail.trim(), newRole)
      setNewEmail('')
      await load()
      flash('Участник добавлен')
    } catch { flashErr('Пользователь не найден или уже в команде') }
  }

  const handleChangeRole = async (userId: string, role: string) => {
    if (!slug) return
    try {
      await api.updateTeamMember(slug, userId, role)
      await load()
      flash('Роль обновлена')
    } catch { flashErr('Ошибка') }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!slug || !confirm('Удалить участника?')) return
    try {
      await api.removeTeamMember(slug, userId)
      await load()
      flash('Участник удалён')
    } catch { flashErr('Ошибка') }
  }

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slug) return
    const amount = parseInt(transferAmount)
    if (!amount || amount <= 0) return
    try {
      await api.transferCredits(slug, amount)
      setTransferAmount('')
      await load()
      await refreshTeams()
      flash(`Переведено ${amount} кр.`)
    } catch { flashErr('Недостаточно кредитов') }
  }

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slug || !creditCode.trim()) return
    try {
      const res = await api.redeemOnTeam(slug, creditCode.trim())
      setCreditCode('')
      await load()
      await refreshTeams()
      flash(`Активировано +${res.added} кр.`)
    } catch { flashErr('Недействительный код') }
  }

  const handleDelete = async () => {
    if (!slug || !confirm('Удалить команду? Это действие необратимо.')) return
    try {
      await api.deleteTeam(slug)
      await refreshTeams()
      navigate('/teams')
    } catch { flashErr('Ошибка удаления') }
  }

  if (loading) return <Spinner label="Загрузка..." />
  if (!team) return null

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate('/teams')} className="text-text-secondary text-sm mb-4 hover:text-text-primary cursor-pointer">
        &larr; Назад к командам
      </button>

      <h1 className="text-2xl font-bold mb-6">{team.name}</h1>

      {msg && <p className="text-green-400 text-sm mb-3">{msg}</p>}
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {/* Name */}
      {isOwner && (
        <section className="mb-8">
          <h2 className="text-sm text-text-secondary mb-2">Название</h2>
          <div className="flex gap-2">
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="flex-1 bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleRename}
              disabled={editName.trim() === team.name}
              className="bg-accent text-bg-primary px-3 py-2 rounded text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Сохранить
            </button>
          </div>
        </section>
      )}

      {/* Credits */}
      <section className="mb-8">
        <h2 className="text-sm text-text-secondary mb-2">Кредиты команды: {team.credits}</h2>
        <form onSubmit={handleTransfer} className="flex gap-2 mb-2">
          <input
            type="number"
            min="1"
            value={transferAmount}
            onChange={e => setTransferAmount(e.target.value)}
            placeholder="Количество"
            className="w-32 bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!transferAmount || parseInt(transferAmount) <= 0}
            className="bg-bg-tertiary text-text-primary px-3 py-2 rounded text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Перевести из личных
          </button>
        </form>
        {isOwner && (
          <form onSubmit={handleRedeem} className="flex gap-2">
            <input
              value={creditCode}
              onChange={e => setCreditCode(e.target.value)}
              placeholder="Кредит-код"
              className="flex-1 bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!creditCode.trim()}
              className="bg-bg-tertiary text-text-primary px-3 py-2 rounded text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Активировать
            </button>
          </form>
        )}
      </section>

      {/* Members */}
      <section className="mb-8">
        <h2 className="text-sm text-text-secondary mb-3">Участники ({team.members.length})</h2>
        <div className="space-y-2 mb-4">
          {team.members.map(m => (
            <div key={m.id} className="flex items-center justify-between bg-bg-secondary border border-bg-tertiary rounded p-3">
              <div>
                <span className="text-text-primary text-sm">{m.display_name || m.email}</span>
                <span className="text-text-secondary text-xs ml-2">{m.email}</span>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && m.user_id !== user?.user_id ? (
                  <>
                    <select
                      value={m.role}
                      onChange={e => handleChangeRole(m.user_id, e.target.value)}
                      className="bg-bg-tertiary text-text-primary text-xs rounded px-2 py-1 border-none focus:outline-none cursor-pointer"
                    >
                      <option value="owner">owner</option>
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <button
                      onClick={() => handleRemoveMember(m.user_id)}
                      className="text-red-400 hover:text-red-300 text-xs cursor-pointer"
                    >
                      Удалить
                    </button>
                  </>
                ) : (
                  <span className="text-text-secondary text-xs px-2 py-1 bg-bg-tertiary rounded">{m.role}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {isOwner && (
          <form onSubmit={handleAddMember} className="flex gap-2">
            <input
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="Email пользователя"
              className="flex-1 bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              className="bg-bg-secondary border border-bg-tertiary rounded px-2 py-2 text-sm text-text-primary focus:outline-none cursor-pointer"
            >
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <button
              type="submit"
              disabled={!newEmail.trim()}
              className="bg-accent text-bg-primary px-3 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Добавить
            </button>
          </form>
        )}
      </section>

      {/* Delete */}
      {isOwner && (
        <section className="border-t border-bg-tertiary pt-6">
          <button
            onClick={handleDelete}
            className="text-red-400 hover:text-red-300 text-sm cursor-pointer"
          >
            Удалить команду
          </button>
        </section>
      )}
    </div>
  )
}
