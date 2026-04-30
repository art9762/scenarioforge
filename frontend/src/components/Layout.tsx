import { Outlet, Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function Layout() {
  const location = useLocation()
  const [isAdmin, setIsAdmin] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)

  useEffect(() => {
    api.getMe().then((data) => {
      if (data.auth_enabled && data.user_id) {
        setIsAdmin(!!data.is_admin)
        setCredits(data.credits ?? null)
      }
    }).catch(() => {})
  }, [location.pathname])

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-bg-tertiary px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-accent tracking-wide no-underline">
          ScenarioForge
        </Link>
        <nav className="flex gap-4 text-sm items-center">
          <Link to="/" className={`no-underline ${location.pathname === '/' ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}>
            Проекты
          </Link>
          <Link to="/new" className={`no-underline ${location.pathname === '/new' ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}>
            Новый
          </Link>
          <Link to="/settings" className={`no-underline ${location.pathname === '/settings' ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}>
            Настройки
          </Link>
          <Link to="/test" className={`no-underline ${location.pathname === '/test' ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}>
            Тест
          </Link>
          {isAdmin && (
            <Link to="/admin" className={`no-underline ${location.pathname === '/admin' ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}>
              👑 Админ
            </Link>
          )}
          {credits !== null && (
            <span className="text-text-secondary ml-2 border border-bg-tertiary rounded px-2 py-0.5 text-xs">
              💎 {credits}
            </span>
          )}
        </nav>
      </header>
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
