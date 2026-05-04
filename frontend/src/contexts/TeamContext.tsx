import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { api } from '../api/client'
import type { Team } from '../types'
import { useAuth } from './AuthContext'

interface TeamState {
  teams: Team[]
  currentTeam: Team | null
  setCurrentTeam: (team: Team | null) => void
  refreshTeams: () => Promise<void>
  loading: boolean
}

const TeamContext = createContext<TeamState | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useTeams(): TeamState {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error('useTeams must be used within TeamProvider')
  return ctx
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, authEnabled } = useAuth()
  const [teams, setTeams] = useState<Team[]>([])
  const [currentTeam, setCurrentTeamState] = useState<Team | null>(null)
  const [loading, setLoading] = useState(false)

  const refreshTeams = useCallback(async () => {
    if (!isAuthenticated || !authEnabled) {
      setTeams([])
      return
    }
    setLoading(true)
    try {
      const data = await api.listTeams()
      setTeams(data)
      setCurrentTeamState(prev => {
        if (!prev) return null
        const updated = data.find(t => t.slug === prev.slug)
        return updated ?? null
      })
    } catch {
      setTeams([])
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, authEnabled])

  useEffect(() => {
    if (!isAuthenticated || !authEnabled) return
    let cancelled = false
    api.listTeams()
      .then(data => {
        if (cancelled) return
        setTeams(data)
        const saved = localStorage.getItem('current_team')
        if (saved) {
          const found = data.find(t => t.slug === saved)
          if (found) setCurrentTeamState(found)
        }
      })
      .catch(() => { if (!cancelled) setTeams([]) })
    return () => { cancelled = true }
  }, [isAuthenticated, authEnabled])

  const setCurrentTeam = useCallback((team: Team | null) => {
    setCurrentTeamState(team)
    if (team) {
      localStorage.setItem('current_team', team.slug)
    } else {
      localStorage.removeItem('current_team')
    }
  }, [])

  return (
    <TeamContext.Provider value={{ teams, currentTeam, setCurrentTeam, refreshTeams, loading }}>
      {children}
    </TeamContext.Provider>
  )
}
