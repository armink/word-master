import { useState, useRef, useCallback } from 'react'

export function useAudioRecorder() {
  const [recording, setRecording] = useState(false)
  const contextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Int16Array[]>([])

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const ctx = new AudioContext({ sampleRate: 16000 })
    const source = ctx.createMediaStreamSource(stream)
    // bufferSize=4096 对应约 256ms；使用单声道输入输出
    const processor = ctx.createScriptProcessor(4096, 1, 1)

    processor.onaudioprocess = (e) => {
      const f32 = e.inputBuffer.getChannelData(0)
      const i16 = new Int16Array(f32.length)
      for (let i = 0; i < f32.length; i++) {
        i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32767))
      }
      chunksRef.current.push(new Int16Array(i16))
    }

    source.connect(processor)
    processor.connect(ctx.destination)

    streamRef.current = stream
    contextRef.current = ctx
    processorRef.current = processor
    chunksRef.current = []
    setRecording(true)
  }, [])

  const stop = useCallback((): ArrayBuffer => {
    processorRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(t => t.stop())
    contextRef.current?.close()

    const total = chunksRef.current.reduce((s, c) => s + c.length, 0)
    const out = new Int16Array(total)
    let offset = 0
    for (const c of chunksRef.current) {
      out.set(c, offset)
      offset += c.length
    }

    chunksRef.current = []
    setRecording(false)
    return out.buffer
  }, [])

  return { recording, start, stop }
}
