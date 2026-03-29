interface MasteryBarProps {
  label: string
  value: number  // 0-100
}

export default function MasteryBar({ label, value }: MasteryBarProps) {
  const mastered = value >= 80
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-12 text-gray-500 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${mastered ? 'bg-primary-500' : 'bg-primary-300'}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`w-8 text-right font-medium ${mastered ? 'text-primary-600' : 'text-gray-500'}`}>
        {value}
      </span>
      {mastered && <span className="text-primary-500 text-xs">✓</span>}
    </div>
  )
}
