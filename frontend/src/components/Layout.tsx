import { Outlet, Link, useLocation } from 'react-router-dom'

export default function Layout() {
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-bg-tertiary px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-accent tracking-wide no-underline">
          ScenarioForge
        </Link>
        <nav className="flex gap-4 text-sm">
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
        </nav>
      </header>
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
