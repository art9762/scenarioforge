import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [inviteCode, setInviteCode] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleValidateCode = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.validateInviteCode(inviteCode)
      setStep(2)
    } catch {
      setError('Недействительный или использованный код')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }
    if (password.length < 6) {
      setError('Пароль должен быть не менее 6 символов')
      return
    }
    setSubmitting(true)
    try {
      await register(inviteCode, email, password, displayName)
      navigate('/', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('409')) setError('Этот email уже зарегистрирован')
      else if (msg.includes('400')) setError('Недействительный инвайт-код')
      else setError('Ошибка регистрации')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-accent mb-8 text-center">Регистрация</h1>

        {step === 1 && (
          <form onSubmit={handleValidateCode} className="space-y-4">
            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm text-text-secondary mb-1">Инвайт-код</label>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                required
                autoFocus
                placeholder="Введите код приглашения"
                className="w-full bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-accent hover:bg-accent/90 text-white font-medium py-2 rounded disabled:opacity-50"
            >
              {submitting ? 'Проверка...' : 'Далее'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm text-text-secondary mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Имя</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Как к вам обращаться"
                className="w-full bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Подтвердите пароль</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-bg-secondary border border-bg-tertiary rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-accent hover:bg-accent/90 text-white font-medium py-2 rounded disabled:opacity-50"
            >
              {submitting ? 'Создание...' : 'Создать аккаунт'}
            </button>
            <button
              type="button"
              onClick={() => { setStep(1); setError('') }}
              className="w-full text-text-secondary hover:text-text-primary text-sm py-1"
            >
              Назад
            </button>
          </form>
        )}

        <p className="text-center text-sm text-text-secondary mt-6">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Войти
          </Link>
        </p>
      </div>
    </div>
  )
}
