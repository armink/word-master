import { useCallback } from 'react'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

interface Props {
  lang: 'zh_cn' | 'en_us'
  onResult: (text: string) => void
  onError?: (msg: string) => void
  disabled?: boolean
}

export default function VoiceInput({ lang, onResult, onError, disabled }: Props) {
  const { recording, start, stop } = useAudioRecorder()

  const handleStart = useCallback(async (e: React.PointerEvent) => {
    e.preventDefault()
    if (disabled) return
    try {
      await start()
    } catch {
      onError?.('无法访问麦克风，请检查权限')
    }
  }, [disabled, start, onError])

  const handleStop = useCallback(async (e: React.PointerEvent) => {
    e.preventDefault()
    if (!recording) return
    const audio = stop()
    try {
      const res = await fetch(`/api/stt?lang=${lang}`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/pcm' },
        body: audio,
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        onError?.(err.error ?? '识别失败')
        return
      }
      const { text } = await res.json() as { text: string }
      if (!text) { onError?.('未识别到内容'); return }
      onResult(text)
    } catch {
      onError?.('网络错误，请重试')
    }
  }, [recording, stop, lang, onResult, onError])

  return (
    <button
      type="button"
      onPointerDown={handleStart}
      onPointerUp={handleStop}
      onPointerLeave={handleStop}
      disabled={disabled}
      className={`w-full py-4 rounded-2xl font-bold text-base select-none transition-all
        ${recording
          ? 'bg-red-500 text-white shadow-inner scale-[0.97]'
          : 'bg-primary-100 text-primary-700 border-2 border-primary-200 hover:bg-primary-200'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {recording ? '🎤 松开提交' : '🎤 按住说话'}
    </button>
  )
}
