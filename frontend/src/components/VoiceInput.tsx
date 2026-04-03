import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

interface Props {
  lang: 'zh_cn' | 'en_us'
  onResult: (text: string) => void
  onError?: (msg: string) => void
  disabled?: boolean
}

// 预设波形高度，避免 Math.random() 每次 render 时跳动
const BARS = [8, 14, 22, 10, 30, 18, 14, 26, 34, 18, 26, 14, 22, 10, 18, 8]

export default function VoiceInput({ lang, onResult, onError, disabled }: Props) {
  const { recording, start, stop } = useAudioRecorder()
  const buttonRef  = useRef<HTMLButtonElement>(null)
  const touchActiveRef = useRef(false)
  const cancelRef  = useRef(false)   // 当前手势是否落在取消区域
  const [pressing,   setPressing]   = useState(false)
  const [cancelMode, setCancelMode] = useState(false)

  // ── 开始录音 ────────────────────────────────────────────────────
  const doStart = useCallback(async () => {
    if (disabled) return
    cancelRef.current = false
    setCancelMode(false)
    setPressing(true)
    try { navigator.vibrate?.(40) } catch { /* 不支持震动忽略 */ }
    try {
      await start()
    } catch (err) {
      setPressing(false)
      if (!window.isSecureContext) {
        onError?.('需要 HTTPS 才能使用麦克风，请改用 https:// 地址访问')
        return
      }
      const name = err instanceof Error ? err.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        onError?.('麦克风权限被拒绝，请在浏览器或系统设置中允许')
      } else {
        onError?.('无法访问麦克风，建议使用 Chrome 或 Safari')
      }
    }
  }, [disabled, start, onError])

  // ── 结束录音：cancelled=true 时丢弃音频 ─────────────────────────
  const doStop = useCallback(async (cancelled: boolean) => {
    setPressing(false)
    setCancelMode(false)
    cancelRef.current = false
    if (!recording) return
    const audio = stop()
    if (cancelled) return
    try {
      const res = await fetch(`/api/stt?lang=${lang}`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/pcm' },
        body: audio,
      })
      if (!res.ok) {
        onError?.((await res.json() as { error?: string }).error ?? '识别失败')
        return
      }
      const { text } = await res.json() as { text: string }
      if (!text) { onError?.('未识别到内容'); return }
      onResult(text)
    } catch {
      onError?.('网络错误，请重试')
    }
  }, [recording, stop, lang, onResult, onError])

  // ── 按钮 touchstart（passive:false 阻断长按菜单）────────────────
  useEffect(() => {
    const el = buttonRef.current
    if (!el) return
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      touchActiveRef.current = true
      doStart()
    }
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    return () => el.removeEventListener('touchstart', onTouchStart)
  }, [doStart])

  // ── 全局 touchmove / touchend（录音期间追踪手指位置）────────────
  useEffect(() => {
    if (!pressing) return
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      // 取消区：手指滑到屏幕左侧 38% 且高于屏幕底部 38%
      const inCancel = t.clientX < window.innerWidth * 0.38
        && t.clientY > window.innerHeight * 0.62
      cancelRef.current = inCancel
      setCancelMode(inCancel)
    }
    const onEnd = () => {
      touchActiveRef.current = false
      doStop(cancelRef.current)
    }
    document.addEventListener('touchmove',   onMove, { passive: true })
    document.addEventListener('touchend',    onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchmove',   onMove)
      document.removeEventListener('touchend',    onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [pressing, doStop])

  // ── 桌面：pressing 期间全局监听 pointerup（遮罩出现后鼠标已离开按钮）─
  useEffect(() => {
    if (!pressing || touchActiveRef.current) return
    const onUp = () => doStop(false)
    document.addEventListener('pointerup', onUp)
    return () => document.removeEventListener('pointerup', onUp)
  }, [pressing, doStop])

  // ── 桌面鼠标事件（仅按下，松开由全局 pointerup 处理）───────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (touchActiveRef.current || e.pointerType === 'touch') return
    e.preventDefault()
    doStart()
  }, [doStart])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (touchActiveRef.current || e.pointerType === 'touch') return
    doStop(false)
  }, [doStop])

  // ── 全屏录音遮罩（Portal，真正全屏覆盖） ────────────────────────
  const overlay = pressing ? createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(0,0,0,0.55)', touchAction: 'none', userSelect: 'none' }}
    >
      {/* 中央波形气泡 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="bg-[#4CAF50] rounded-2xl px-6 py-5 flex items-end gap-1.5">
          {BARS.map((h, i) => (
            <div
              key={i}
              className="w-1.5 bg-white rounded-full"
              style={{
                height: `${h}px`,
                transformOrigin: 'bottom',
                animation: `voiceBar 0.55s ease-in-out ${(i * 0.04).toFixed(2)}s infinite alternate`,
              }}
            />
          ))}
        </div>
        <p className="text-white/70 text-sm">
          {cancelMode ? '松开即可取消' : '松开发送，向左滑动取消'}
        </p>
      </div>

      {/* 底部操作区 */}
      <div className="h-32 flex select-none">
        {/* 左：取消区 */}
        <div className={`w-[38%] flex flex-col items-center justify-center gap-2 transition-colors duration-150
          ${cancelMode ? 'bg-red-500/90' : 'bg-white/10'}`}>
          <div className={`w-11 h-11 rounded-full flex items-center justify-center border-2 transition-colors duration-150
            ${cancelMode ? 'border-white bg-white/30' : 'border-white/50'}`}>
            <span className="text-white text-lg leading-none">✕</span>
          </div>
          <span className={`text-sm font-medium transition-colors duration-150
            ${cancelMode ? 'text-white' : 'text-white/60'}`}>取消</span>
        </div>

        {/* 右：发送区 */}
        <div className={`flex-1 flex flex-col items-center justify-center gap-2 transition-colors duration-150
          ${!cancelMode ? 'bg-white/20' : 'bg-white/5'}`}>
          <div className={`w-11 h-11 rounded-full flex items-center justify-center border-2 transition-colors duration-150
            ${!cancelMode ? 'border-white bg-white/30' : 'border-white/20'}`}>
            <span className="text-white text-lg leading-none">↑</span>
          </div>
          <span className={`text-sm font-medium transition-colors duration-150
            ${!cancelMode ? 'text-white' : 'text-white/30'}`}>松开 发送</span>
        </div>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      {overlay}
      <button
        ref={buttonRef}
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
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
        {pressing || recording ? '🎤 录音中…' : '🎤 按住说话'}
      </button>
    </>
  )
}

