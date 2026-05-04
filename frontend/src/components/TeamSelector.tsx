import { useState, useRef, useEffect } from 'react'
import { useTeams } from '../contexts/TeamContext'

export default function TeamSelector() {
  const { teams, currentTeam, setCurrentTeam } = useTeams()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (teams.length === 0) return null

  const label = currentTeam ? currentTeam.name : 'Личные'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 text-xs border border-bg-tertiary rounded hover:border-accent-dim transition-colors text-text-secondary cursor-pointer"
      >
        <span className="max-w-[120px] truncate">{label}</span>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-bg-secondary border border-bg-tertiary rounded shadow-lg z-50 min-w-[160px]">
          <button
            onClick={() => { setCurrentTeam(null); setOpen(false) }}
            className={`w-full text-left px-3 py-2 text-xs hover:bg-bg-tertiary cursor-pointer ${!currentTeam ? 'text-accent' : 'text-text-primary'}`}
          >
            Личные проекты
          </button>
          {teams.map(t => (
            <button
              key={t.id}
              onClick={() => { setCurrentTeam(t); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-bg-tertiary cursor-pointer flex justify-between items-center ${currentTeam?.id === t.id ? 'text-accent' : 'text-text-primary'}`}
            >
              <span className="truncate">{t.name}</span>
              <span className="text-text-secondary ml-2">{t.credits} кр.</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
