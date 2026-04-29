interface SpinnerProps {
  size?: string
  label?: string
}

export default function Spinner({ size = 'w-5 h-5', label }: SpinnerProps) {
  return (
    <div className="flex items-center gap-2">
      <div className={`${size} border-2 border-accent border-t-transparent rounded-full animate-spin`} />
      {label && <span className="text-text-secondary text-sm">{label}</span>}
    </div>
  )
}
