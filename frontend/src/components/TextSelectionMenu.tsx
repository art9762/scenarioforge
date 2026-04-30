import { useState, useEffect, useCallback } from 'react'

const AGENTS = [
  { value: 'director', label: 'Режиссёр' },
  { value: 'screenwriter', label: 'Сценарист' },
  { value: 'visual_director', label: 'Визуал-директор' },
  { value: 'copywriter', label: 'Копирайтер' },
  { value: 'editor', label: 'Редактор' },
]

interface Props {
  onAsk: (question: string, fragment: string, agent: string) => void
  onRewrite: (fragment: string, agent: string) => void
}

export default function TextSelectionMenu({ onAsk, onRewrite }: Props) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [selectedText, setSelectedText] = useState('')
  const [showAskInput, setShowAskInput] = useState(false)
  const [question, setQuestion] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('director')

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()
    if (text && text.length > 3) {
      const range = selection!.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      })
      setSelectedText(text)
      setVisible(true)
      setShowAskInput(false)
      setQuestion('')
    } else {
      setVisible(false)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  if (!visible) return null

  return (
    <div
      className="fixed z-50 transform -translate-x-1/2 -translate-y-full"
      style={{ left: position.x, top: position.y }}
    >
      <div className="bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl p-2 min-w-[200px]">
        {showAskInput ? (
          <div className="p-2">
            <div className="flex gap-2 mb-2">
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="bg-bg-primary border border-bg-tertiary rounded px-2 py-1 text-xs text-text-primary"
              >
                {AGENTS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ваш вопрос..."
              className="w-full bg-bg-primary border border-bg-tertiary rounded px-2 py-1 text-xs text-text-primary resize-none focus:outline-none focus:border-accent"
              rows={2}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (question.trim()) {
                    onAsk(question, selectedText, selectedAgent)
                    setVisible(false)
                  }
                }
              }}
            />
            <div className="flex gap-1 mt-1">
              <button
                onClick={() => {
                  if (question.trim()) {
                    onAsk(question, selectedText, selectedAgent)
                    setVisible(false)
                  }
                }}
                className="text-xs bg-accent text-bg-primary px-3 py-1 rounded hover:opacity-90"
              >
                Спросить
              </button>
              <button
                onClick={() => setShowAskInput(false)}
                className="text-xs text-text-secondary px-2 py-1 hover:text-text-primary"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={() => setShowAskInput(true)}
              className="text-xs px-3 py-2 rounded text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
            >
              💬 Спросить
            </button>
            <div className="w-px bg-bg-tertiary" />
            {AGENTS.slice(0, 3).map((a) => (
              <button
                key={a.value}
                onClick={() => {
                  onRewrite(selectedText, a.value)
                  setVisible(false)
                }}
                className="text-xs px-2 py-2 rounded text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
                title={`Переписать: ${a.label}`}
              >
                → {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Arrow pointing down */}
      <div className="flex justify-center">
        <div className="w-2 h-2 bg-bg-secondary border-r border-b border-bg-tertiary transform rotate-45 -mt-1" />
      </div>
    </div>
  )
}
