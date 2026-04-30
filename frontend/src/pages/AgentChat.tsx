import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import type { ChatMessage } from '../types'
import Spinner from '../components/Spinner'

const AGENT_LABELS: Record<string, string> = {
  director: 'Режиссёр',
  screenwriter: 'Сценарист',
  visual_director: 'Визуал-директор',
  copywriter: 'Копирайтер',
  editor: 'Редактор',
}

const AGENT_DESCRIPTIONS: Record<string, string> = {
  director: 'Анализирует идею, создаёт бриф, контролирует пайплайн',
  screenwriter: 'Пишет структуру, сцены, арки персонажей, диалоги',
  visual_director: 'Описывает кадры, ракурсы, свет, оборудование',
  copywriter: 'Полирует диалоги, делает их естественными',
  editor: 'Финальная проверка: логика, тайминг, форматирование',
}

const AGENTS = ['director', 'screenwriter', 'visual_director', 'copywriter', 'editor']

export default function AgentChat() {
  const { id, agent } = useParams<{ id: string; agent: string }>()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const currentAgent = agent || 'director'

  useEffect(() => {
    if (!id || !currentAgent) return
    setLoading(true)
    api.getChatHistory(id, currentAgent)
      .then((data) => setMessages(data.messages))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false))
  }, [id, currentAgent])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!id || !input.trim() || sending) return
    const msg = input.trim()
    setInput('')
    setSending(true)

    // Optimistic update
    setMessages(prev => [...prev, { role: 'user', content: msg }])

    try {
      const res = await api.chatWithAgent(id, currentAgent, msg)
      setMessages(prev => [...prev, { role: 'assistant', content: res.response }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка при получении ответа. Попробуйте ещё раз.' }])
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = async () => {
    if (!id) return
    try {
      await api.clearChatHistory(id, currentAgent)
      setMessages([])
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Agent sidebar */}
      <div className="w-48 flex-shrink-0 border-r border-bg-tertiary pr-4 mr-4 overflow-y-auto">
        <div className="mb-4">
          <Link to={`/projects/${id}/scenario`} className="text-xs text-text-secondary hover:text-accent no-underline">
            ← К сценарию
          </Link>
        </div>
        <h3 className="text-xs text-text-secondary uppercase mb-3">Агенты</h3>
        <div className="space-y-1">
          {AGENTS.map((a) => (
            <Link
              key={a}
              to={`/projects/${id}/chat/${a}`}
              className={`block px-3 py-2 rounded text-sm no-underline transition-colors ${
                a === currentAgent
                  ? 'bg-accent/10 text-accent border border-accent/30'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
              }`}
            >
              {AGENT_LABELS[a]}
            </Link>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-bg-tertiary">
          <div>
            <h2 className="text-lg font-bold text-accent">{AGENT_LABELS[currentAgent]}</h2>
            <p className="text-xs text-text-secondary">{AGENT_DESCRIPTIONS[currentAgent]}</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="text-xs text-text-secondary hover:text-danger px-2 py-1 border border-bg-tertiary rounded hover:border-danger transition-colors"
            >
              Очистить
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {loading ? (
            <Spinner label="Загрузка..." />
          ) : messages.length === 0 ? (
            <div className="text-center text-text-secondary py-12">
              <p className="text-lg mb-2">{AGENT_LABELS[currentAgent]}</p>
              <p className="text-sm">Задайте вопрос о сценарии или попросите что-то изменить</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-accent/10 border border-accent/20 text-text-primary'
                    : 'bg-bg-secondary border border-bg-tertiary text-text-primary'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.timestamp && (
                    <div className="text-xs text-text-secondary mt-1 opacity-60">
                      {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-bg-secondary border border-bg-tertiary rounded-lg px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Сообщение для ${AGENT_LABELS[currentAgent]}...`}
            className="flex-1 bg-bg-secondary border border-bg-tertiary rounded-lg px-4 py-3 text-sm text-text-primary resize-none focus:outline-none focus:border-accent"
            rows={2}
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="bg-accent text-bg-primary px-6 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 self-end py-3"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}
