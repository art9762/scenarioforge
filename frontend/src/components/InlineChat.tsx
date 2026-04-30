import Spinner from './Spinner'

interface Props {
  visible: boolean
  question: string
  fragment: string
  agent: string
  response: string | null
  loading: boolean
  onClose: () => void
}

const AGENT_LABELS: Record<string, string> = {
  director: 'Режиссёр',
  screenwriter: 'Сценарист',
  visual_director: 'Визуал-директор',
  copywriter: 'Копирайтер',
  editor: 'Редактор',
}

export default function InlineChat({ visible, question, fragment, agent, response, loading, onClose }: Props) {
  if (!visible) return null

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-bg-secondary border-l border-bg-tertiary shadow-2xl z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary">
        <div>
          <h3 className="text-sm font-medium text-accent">{AGENT_LABELS[agent] || agent}</h3>
          <p className="text-xs text-text-secondary">Ответ на вопрос</p>
        </div>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-lg">×</button>
      </div>

      {/* Fragment */}
      <div className="px-4 py-3 border-b border-bg-tertiary">
        <p className="text-xs text-text-secondary mb-1">Фрагмент:</p>
        <p className="text-xs bg-bg-primary rounded p-2 text-text-primary italic max-h-20 overflow-y-auto">
          "{fragment.length > 200 ? fragment.slice(0, 200) + '...' : fragment}"
        </p>
      </div>

      {/* Question */}
      <div className="px-4 py-3 border-b border-bg-tertiary">
        <p className="text-xs text-text-secondary mb-1">Вопрос:</p>
        <p className="text-sm text-text-primary">{question}</p>
      </div>

      {/* Response */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <Spinner label="Думает..." />
        ) : response ? (
          <div className="text-sm text-text-primary whitespace-pre-wrap screenplay-text">{response}</div>
        ) : null}
      </div>
    </div>
  )
}
