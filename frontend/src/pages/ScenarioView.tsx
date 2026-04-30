import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Scenario, Revision } from '../types'
import Spinner from '../components/Spinner'
import TextSelectionMenu from '../components/TextSelectionMenu'
import InlineChat from '../components/InlineChat'
import { normalizeScenarioResponse } from '../utils/scenario'

export default function ScenarioView() {
  const { id } = useParams<{ id: string }>()
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeScene, setActiveScene] = useState(0)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [showRevisions, setShowRevisions] = useState(false)
  const [revisionContent, setRevisionContent] = useState<string | null>(null)
  const [showRevisionDiff, setShowRevisionDiff] = useState(false)

  // Inline chat state
  const [chatVisible, setChatVisible] = useState(false)
  const [chatQuestion, setChatQuestion] = useState('')
  const [chatFragment, setChatFragment] = useState('')
  const [chatAgent, setChatAgent] = useState('director')
  const [chatResponse, setChatResponse] = useState<string | null>(null)
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    api.getScenario(id)
      .then((data) => setScenario(normalizeScenarioResponse(data)))
      .catch(() => {})
      .finally(() => setLoading(false))

    api.listRevisions(id)
      .then((data) => setRevisions(data.revisions))
      .catch(() => {})
  }, [id])

  const handleAsk = async (question: string, fragment: string, agent: string) => {
    if (!id) return
    setChatVisible(true)
    setChatQuestion(question)
    setChatFragment(fragment)
    setChatAgent(agent)
    setChatResponse(null)
    setChatLoading(true)
    try {
      const res = await api.askAboutFragment(id, question, fragment, agent)
      setChatResponse(res.response)
    } catch {
      setChatResponse('Ошибка при получении ответа.')
    } finally {
      setChatLoading(false)
    }
  }

  const handleRewrite = async (fragment: string, agent: string) => {
    if (!id) return
    setChatVisible(true)
    setChatQuestion('Перепиши этот фрагмент')
    setChatFragment(fragment)
    setChatAgent(agent)
    setChatResponse(null)
    setChatLoading(true)
    try {
      const res = await api.askAboutFragment(id, `Перепиши следующий фрагмент, улучши его согласно своей роли. Верни только переписанный фрагмент.`, fragment, agent)
      setChatResponse(res.response)
    } catch {
      setChatResponse('Ошибка при получении ответа.')
    } finally {
      setChatLoading(false)
    }
  }

  const loadRevision = async (filename: string) => {
    if (!id) return
    try {
      const data = await api.getRevision(id, filename)
      setRevisionContent(data.content)
      setShowRevisionDiff(true)
    } catch {
      // ignore
    }
  }

  if (loading) return <Spinner label="Загрузка сценария..." />
  if (!scenario) return <p className="text-text-secondary">Сценарий не найден</p>

  return (
    <div className={chatVisible ? 'mr-96' : ''}>
      <TextSelectionMenu onAsk={handleAsk} onRewrite={handleRewrite} />
      <InlineChat
        visible={chatVisible}
        question={chatQuestion}
        fragment={chatFragment}
        agent={chatAgent}
        response={chatResponse}
        loading={chatLoading}
        onClose={() => setChatVisible(false)}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{scenario.title}</h1>
          <p className="text-text-secondary text-sm">{scenario.genre} • {scenario.duration}</p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/projects/${id}/chat/director`}
            className="px-3 py-2 border border-bg-tertiary rounded text-sm text-text-secondary hover:border-accent hover:text-accent no-underline"
          >
            💬 Чат с агентами
          </Link>
          {revisions.length > 0 && (
            <button
              onClick={() => setShowRevisions(!showRevisions)}
              className="px-3 py-2 border border-bg-tertiary rounded text-sm text-text-secondary hover:border-accent hover:text-accent"
            >
              📜 Ревизии ({revisions.length})
            </button>
          )}
          <Link to={`/projects/${id}/edit`} className="px-3 py-2 border border-bg-tertiary rounded text-sm text-text-secondary hover:border-accent no-underline">
            Редактировать
          </Link>
          <a href={api.exportMd(id!)} className="px-3 py-2 border border-bg-tertiary rounded text-sm text-text-secondary hover:border-accent no-underline">
            MD
          </a>
          <a href={api.exportPdf(id!)} className="px-3 py-2 border border-bg-tertiary rounded text-sm text-text-secondary hover:border-accent no-underline">
            PDF
          </a>
        </div>
      </div>

      {/* Revision history dropdown */}
      {showRevisions && (
        <div className="mb-6 bg-bg-secondary border border-bg-tertiary rounded-lg p-4">
          <h3 className="text-sm font-medium text-accent mb-3">История ревизий</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {revisions.map((rev) => (
              <button
                key={rev.filename}
                onClick={() => loadRevision(rev.filename)}
                className="w-full text-left px-3 py-2 rounded text-sm hover:bg-bg-primary transition-colors flex justify-between items-center"
              >
                <span className="text-text-primary">{rev.source}</span>
                <span className="text-xs text-text-secondary">{rev.date} {rev.time}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Split view: revision diff */}
      {showRevisionDiff && revisionContent && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-text-secondary">Сравнение с ревизией</h3>
            <button
              onClick={() => { setShowRevisionDiff(false); setRevisionContent(null) }}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              ✕ Закрыть
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-bg-secondary border border-bg-tertiary rounded-lg p-4">
              <p className="text-xs text-text-secondary mb-2 uppercase">Ревизия</p>
              <div className="screenplay-text whitespace-pre-wrap text-sm max-h-96 overflow-y-auto">
                {revisionContent}
              </div>
            </div>
            <div className="bg-bg-secondary border border-bg-tertiary rounded-lg p-4">
              <p className="text-xs text-text-secondary mb-2 uppercase">Текущая версия</p>
              <div className="screenplay-text whitespace-pre-wrap text-sm max-h-96 overflow-y-auto">
                {scenario.raw_markdown}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hint about text selection */}
      <div className="mb-4 text-xs text-text-secondary bg-bg-secondary/50 rounded px-3 py-2 border border-bg-tertiary/50">
        💡 Выделите текст в сценарии, чтобы задать вопрос или отправить фрагмент агенту
      </div>

      {/* Scene navigation */}
      {scenario.scenes && scenario.scenes.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {scenario.scenes.map((_s, i) => (
            <button
              key={i}
              onClick={() => setActiveScene(i)}
              className={`px-3 py-1 rounded text-xs whitespace-nowrap border ${i === activeScene ? 'border-accent text-accent bg-accent/10' : 'border-bg-tertiary text-text-secondary hover:border-accent-dim'}`}
            >
              Сцена {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Active scene */}
      {scenario.scenes && scenario.scenes[activeScene] && (
        <div className="bg-bg-secondary border border-bg-tertiary rounded-lg p-6 screenplay-text">
          <h2 className="text-lg font-bold text-accent mb-1">
            Сцена {activeScene + 1} — {scenario.scenes[activeScene].title}
          </h2>
          <div className="text-xs text-text-secondary mb-4 flex gap-4">
            <span>📍 {scenario.scenes[activeScene].location}</span>
            <span>🕐 {scenario.scenes[activeScene].time_of_day}</span>
            <span>⏱ {scenario.scenes[activeScene].duration}</span>
          </div>

          {scenario.scenes[activeScene].equipment_setup && (
            <div className="mb-3">
              <span className="text-xs text-text-secondary uppercase">Оборудование:</span>
              <p className="text-sm">{scenario.scenes[activeScene].equipment_setup}</p>
            </div>
          )}

          {scenario.scenes[activeScene].shot_list?.length > 0 && (
            <div className="mb-3">
              <span className="text-xs text-text-secondary uppercase">Кадры:</span>
              <ol className="list-decimal list-inside text-sm space-y-1 mt-1">
                {scenario.scenes[activeScene].shot_list.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          )}

          {scenario.scenes[activeScene].dialogue && (
            <div className="mb-3">
              <span className="text-xs text-text-secondary uppercase">Диалог:</span>
              <div className="mt-1 whitespace-pre-wrap text-sm border-l-2 border-accent pl-3">
                {scenario.scenes[activeScene].dialogue}
              </div>
            </div>
          )}

          {scenario.scenes[activeScene].director_notes && (
            <div className="mb-3">
              <span className="text-xs text-text-secondary uppercase">Заметки режиссёра:</span>
              <p className="text-sm italic text-text-secondary mt-1">{scenario.scenes[activeScene].director_notes}</p>
            </div>
          )}

          {scenario.scenes[activeScene].audio_sfx && (
            <div>
              <span className="text-xs text-text-secondary uppercase">Звук/SFX:</span>
              <p className="text-sm mt-1">{scenario.scenes[activeScene].audio_sfx}</p>
            </div>
          )}
        </div>
      )}

      {/* Raw markdown fallback */}
      {(!scenario.scenes || scenario.scenes.length === 0) && scenario.raw_markdown && (
        <div className="bg-bg-secondary border border-bg-tertiary rounded-lg p-6 screenplay-text whitespace-pre-wrap">
          {scenario.raw_markdown}
        </div>
      )}
    </div>
  )
}
