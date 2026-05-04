import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useTeams } from '../contexts/TeamContext'
import Spinner from '../components/Spinner'

export default function Teams() {
  const { teams, refreshTeams, loading } = useTeams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError('')
    try {
      await api.createTeam(name.trim())
      setName('')
      await refreshTeams()
    } catch {
      setError('Ошибка создания команды')
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <Spinner label="Загрузка команд..." />

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Команды</h1>

      <form onSubmit={handleCreate} className="flex gap-3 mb-6">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Название команды"
          className="flex-1 bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="bg-accent text-bg-primary px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? 'Создание...' : 'Создать'}
        </button>
      </form>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {teams.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <p className="text-lg mb-2">Нет команд</p>
          <p className="text-sm">Создайте команду, чтобы работать вместе</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {teams.map(t => (
            <button
              key={t.id}
              onClick={() => navigate(`/teams/${t.slug}`)}
              className="block w-full text-left bg-bg-secondary border border-bg-tertiary rounded-lg p-4 hover:border-accent-dim transition-colors cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-text-primary font-medium">{t.name}</h3>
                  <p className="text-text-secondary text-sm mt-1">
                    {t.members_count} участник(ов)
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs px-2 py-1 rounded bg-bg-tertiary text-text-secondary">
                    {t.role}
                  </span>
                  <p className="text-text-secondary text-xs mt-1">{t.credits} кр.</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
