import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { BriefingQuestion } from '../types'
import Spinner from '../components/Spinner'

export default function Briefing() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [questions, setQuestions] = useState<BriefingQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    api.startBriefing(id)
      .then((data) => setQuestions(data.questions.map((q) => ({ ...q, answer: '' }))))
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false))
  }, [id])

  const handleAnswer = (qid: string, answer: string) => {
    setQuestions((qs) => qs.map((q) => (q.id === qid ? { ...q, answer } : q)))
  }

  const handleSubmit = async () => {
    if (!id) return
    setSubmitting(true)
    try {
      await api.submitAnswers(id, questions.map((q) => ({ id: q.id, answer: q.answer || '' })))
      navigate(`/projects/${id}/generation`)
    } catch {
      alert('Ошибка отправки ответов')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <Spinner label="Режиссёр формулирует вопросы..." />

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Бриф от Режиссёра</h1>
      <p className="text-text-secondary text-sm mb-6">Ответьте на вопросы для создания сценария</p>

      <div className="space-y-4">
        {questions.map((q) => (
          <div key={q.id} className="bg-bg-secondary border border-bg-tertiary rounded-lg p-4">
            <p className="text-text-primary mb-2">{q.question}</p>
            <textarea
              value={q.answer || ''}
              onChange={(e) => handleAnswer(q.id, e.target.value)}
              className="w-full bg-bg-primary border border-bg-tertiary rounded p-2 text-sm text-text-primary resize-none h-20 focus:outline-none focus:border-accent"
              placeholder="Ваш ответ..."
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-6 w-full bg-accent text-bg-primary py-3 rounded font-medium hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? 'Отправка...' : 'Отправить ответы и начать генерацию'}
      </button>
    </div>
  )
}
