import { useState } from 'react'

interface Props {
  text: string
  vcn?: string   // 发音人：英文用 'aisxping'（默认），中文用 'xiaoyan'
  className?: string
}

export default function TtsButton({ text, vcn, className = '' }: Props) {
  const [playing, setPlaying] = useState(false)

  const handlePlay = async () => {
    if (playing) return
    setPlaying(true)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ...(vcn ? { vcn } : {}) }),
      })
      if (!res.ok) throw new Error('TTS failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url) }
      audio.onerror = () => { setPlaying(false); URL.revokeObjectURL(url) }
      await audio.play()
    } catch {
      setPlaying(false)
    }
  }

  return (
    <button
      onClick={handlePlay}
      disabled={playing}
      title="朗读发音"
      className={`rounded-full flex items-center justify-center transition-colors disabled:opacity-50
        ${playing ? 'bg-primary-200 text-primary-700' : 'bg-primary-100 text-primary-600 hover:bg-primary-200'}
        ${className}`}
    >
      {playing ? '⏸' : '🔊'}
    </button>
  )
}
