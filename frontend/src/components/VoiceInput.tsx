import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

interface Props {
  lang: 'zh_cn' | 'en_us'
  onResult: (text: string) => void
  onError?: (msg: string) => void
  disabled?: boolean
}

export default function VoiceInput({ lang, onResult, onError, disabled }: Props) {
  const { recording, start, stop } = useAudioRecorder()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const touchActiveRef = useRef(false)
  // pressing: 按下瞬间立即给视觉反馈，不等 getUserMedia 异步完成
  const [pressing, setPressing] = useState(false)

  const doStart = useCallback(async () => {
    if (disabled) return
    setPressing(true)  // 立即更新 UI，不等异步
    try {
      await start()
    } catch (err) {
      setPressing(false)
      // isSecureContext=false 说明未走 HTTPS，getUserMedia 被浏览器直接阻断
      if (!window.isSecureContext) {
        onError?.('需要 HTTPS 才能使用麦克风，请改用手机 Chrome 访问 https:// 地址')
        return
      }
      const msg = err instanceof Error ? err.name : ''
      if (msg === 'NotAllowedError' || msg === 'PermissionDeniedError') {
        onError?.('麦克风权限被拒绝，请在浏览器或系统设置中允许')
      } else {
        onError?.('无法访问麦克风，建议使用 Chrome 或 Safari 浏览器')
      }
    }
  }, [disabled, start, onError])

  const doStop = useCallback(async () => {
    setPressing(false)
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

  // ---- 触屏事件（手机）----
  // React 内部将所有触摸监听器注册为 passive:true，导致合成事件里的
  // e.preventDefault() 被浏览器静默忽略，长按计时器无法取消。
  // 必须通过 useEffect + addEventListener(..., { passive: false }) 注册
  // 原生非被动监听器，才能真正调用 preventDefault 阻断长按系统菜单。
  useEffect(() => {
    const el = buttonRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()        // passive:false 下才真正有效
      touchActiveRef.current = true
      doStart()
    }
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault()
      touchActiveRef.current = false
      doStop()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: false })
    el.addEventListener('touchcancel', onTouchEnd,  { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend',   onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [doStart, doStop])

  // ---- 指针事件（桌面鼠标）----
  // 触屏上 touchstart preventDefault 后 pointer 事件通常不再派发，
  // 用 touchActiveRef 双重防护，避免意外双触发。
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (touchActiveRef.current || e.pointerType === 'touch') return
    e.preventDefault()
    doStart()
  }, [doStart])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (touchActiveRef.current || e.pointerType === 'touch') return
    e.preventDefault()
    doStop()
  }, [doStop])

  return (
    <button
      ref={buttonRef}
      type="button"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={e => e.preventDefault()}
      disabled={disabled}
      style={{
        WebkitTouchCallout: 'none',
        touchAction: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      } as React.CSSProperties}
      className={`w-full py-4 rounded-2xl font-bold text-base select-none transition-all
        ${pressing || recording
          ? 'bg-primary-500 text-white shadow-inner scale-[0.97]'
          : 'bg-primary-100 text-primary-700 border-2 border-primary-200 hover:bg-primary-200'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {pressing || recording ? '🎤 松开提交' : '🎤 按住说话'}
    </button>
  )
}

