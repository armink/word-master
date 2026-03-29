/**
 * 基于 Web Audio API 的轻量音效工具
 * 完全在浏览器本地合成，无需网络请求，无需缓存。
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  // 某些浏览器在用户未交互时会将 ctx 挂起
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function playTone(
  freq: number,
  startOffset: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = 'sine',
) {
  const c = getCtx()
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)

  osc.type = type
  osc.frequency.value = freq

  const t = c.currentTime + startOffset
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(gainPeak, t + 0.01)
  gain.gain.linearRampToValueAtTime(0, t + duration)

  osc.start(t)
  osc.stop(t + duration + 0.05)
}

/** 答对：清脆上行三音 C5 → E5 → G5 */
export function playCorrect() {
  playTone(523, 0.00, 0.13, 0.28)
  playTone(659, 0.11, 0.13, 0.28)
  playTone(784, 0.22, 0.28, 0.28)
}

/** 答错：低沉下行双音 */
export function playWrong() {
  playTone(260, 0.00, 0.18, 0.25, 'sawtooth')
  playTone(180, 0.16, 0.28, 0.25, 'sawtooth')
}
