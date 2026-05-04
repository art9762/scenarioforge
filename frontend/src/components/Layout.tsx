import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import TeamSelector from './TeamSelector'

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, authEnabled, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const navLink = (to: string, label: string) => (
    <Link
      to={to}
      className={`no-underline ${location.pathname === to ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}
    >
      {label}
    </Link>
  )

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-bg-tertiary px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-accent tracking-wide no-underline">
          ScenarioForge
        </Link>
        <nav className="flex gap-4 text-sm items-center">
          {authEnabled && user && <TeamSelector />}
          {navLink('/', 'Проекты')}
          {navLink('/new', 'Новый')}
          {authEnabled && user && navLink('/teams', 'Команды')}
          {navLink('/settings', 'Настройки')}
          {navLink('/test', 'Тест')}
          {user?.is_admin && navLink('/admin', 'Админ')}
          {user && (
            <span className="text-text-secondary ml-2 border border-bg-tertiary rounded px-2 py-0.5 text-xs">
              {user.credits} кр.
            </span>
          )}
          {authEnabled && user && (
            <div className="flex items-center gap-2 ml-2">
              <span className="text-text-secondary text-xs">{user.display_name || user.email}</span>
              <button
                onClick={handleLogout}
                className="text-text-secondary hover:text-red-400 text-xs cursor-pointer"
              >
                Выйти
              </button>
            </div>
          )}
        </nav>
      </header>
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
