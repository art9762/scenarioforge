import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { api } from '../api/client'

interface UserInfo {
  user_id: string
  email: string
  display_name: string
  is_admin: boolean
  credits: number
  tier: string
}

interface AuthState {
  user: UserInfo | null
  isAuthenticated: boolean
  authEnabled: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (inviteCode: string, email: string, password: string, displayName: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const fetchMe = async (): Promise<void> => {
      const data = await api.getMe()
      setAuthEnabled(data.auth_enabled)
      if (data.auth_enabled && data.user_id) {
        setUser({
          user_id: data.user_id,
          email: data.email ?? '',
          display_name: data.display_name ?? '',
          is_admin: data.is_admin ?? false,
          credits: data.credits ?? 0,
          tier: (data as Record<string, unknown>).tier as string ?? 'free',
        })
      } else {
        setUser(null)
      }
    }

    try {
      await fetchMe()
    } catch {
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const tokens = await api.refreshTokens(refreshToken)
          localStorage.setItem('access_token', tokens.access_token)
          localStorage.setItem('refresh_token', tokens.refresh_token)
          await fetchMe()
          return
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
        }
      }
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.getMe().then(data => {
      if (cancelled) return
      setAuthEnabled(data.auth_enabled)
      if (data.auth_enabled && data.user_id) {
        setUser({
          user_id: data.user_id,
          email: data.email ?? '',
          display_name: data.display_name ?? '',
          is_admin: data.is_admin ?? false,
          credits: data.credits ?? 0,
          tier: (data as Record<string, unknown>).tier as string ?? 'free',
        })
      }
    }).catch(() => {
      if (!cancelled) setUser(null)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.login(email, password)
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    await refreshUser()
  }, [refreshUser])

  const register = useCallback(async (inviteCode: string, email: string, password: string, displayName: string) => {
    const data = await api.register(email, password, inviteCode, displayName)
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    await refreshUser()
  }, [refreshUser])

  const logout = useCallback(() => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
  }, [])

  const isAuthenticated = user !== null

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, authEnabled, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}
