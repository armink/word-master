import { useState } from 'react'
import type { Item, QuizType } from '@/types'
import VoiceInput from './VoiceInput'
import TtsButton from './TtsButton'
import { scoreRepeatRecording } from '@/utils/levenshtein'
import type { RepeatRecordingResult } from '@/utils/levenshtein'

interface Props {
  item: Item
  quizType: QuizType
  onDone: () => void
}

const MAX_ROUNDS = 10
const MIN_ROUNDS = 5  // 至少读够这么多轮才解锁「下一个」

const SCIENCE_TIP =
  '根据巴德利工作记忆模型，出声朗读时听觉皮层与语音运动区同时激活，「音形意」三重编码比只看单词记忆强约 2 倍。再来一遍，真的有效！'

function feedbackText(rawScore: number): { text: string; showTip: boolean } {
  if (rawScore >= 85) return { text: '发音超棒！大脑已牢牢记住它 🎉', showTip: false }
  if (rawScore >= 70) return { text: '不错！你刚激活了大脑的语音回路 👍', showTip: false }
  return { text: '再多读几遍，记忆会更深！📖', showTip: true }
}

type PanelState = 'ready' | 'done'

export default function RepeatPanel({ item, quizType, onDone }: Props) {
  const [panelState, setPanelState] = useState<PanelState>('ready')
  const [totalRounds, setTotalRounds] = useState(0)
  const [bestScore, setBestScore] = useState(0)
  const [lastResult, setLastResult] = useState<RepeatRecordingResult | null>(null)
  const [voiceError, setVoiceError] = useState('')

  // en_to_zh 使用 zh_cn（IAT 自动识别中英混合）
  // zh_to_en 使用 en_us（只输出英文字符）
  const sttLang: 'zh_cn' | 'en_us' = quizType === 'en_to_zh' ? 'zh_cn' : 'en_us'
  const targetZh = quizType === 'en_to_zh' ? item.chinese : null

  const handleResult = (transcript: string) => {
    setVoiceError('')
    const result = scoreRepeatRecording(transcript, item.english, targetZh, totalRounds)
    if (result.rounds === 0) {
      setVoiceError(
        quizType === 'en_to_zh'
          ? `请交替说英文和中文，例如：${item.english} → ${item.chinese} → ${item.english}…`
          : '未识别到英文单词，请重试'
      )
      return
    }
    const newTotal = totalRounds + result.rounds
    setTotalRounds(newTotal)
    setBestScore(prev => Math.max(prev, result.score))
    setLastResult(result)
    setPanelState('done')
  }

  const handleReadAgain = () => {
    setLastResult(null)
    setVoiceError('')
    setPanelState('ready')
  }

  const fb = lastResult ? feedbackText(lastResult.rawScore) : null
  const canReadAgain = totalRounds < MAX_ROUNDS
  const canAdvance  = totalRounds >= MIN_ROUNDS

  return (
    <div className="mt-3 space-y-3">

      {/* 单词展示区：始终可见 */}
      <div className="bg-red-50 border border-red-100 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-medium text-red-400">跟着说，重复越多记得越牢 👇</p>
        {/* 英文 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xl font-bold text-gray-800">{item.english}</span>
          {item.phonetic && (
            <span className="text-sm text-gray-400">[{item.phonetic}]</span>
          )}
          <TtsButton text={item.english} className="w-7 h-7 shrink-0 ml-auto" />
        </div>
        {/* 中文（仅 en_to_zh） */}
        {quizType === 'en_to_zh' && (
          <div className="flex items-center gap-2">
            <span className="text-xl text-gray-600 font-medium">{item.chinese}</span>
            <TtsButton text={item.chinese} vcn="xiaoyan" className="w-6 h-6 shrink-0" />
          </div>
        )}
        {/* 节奏提示 */}
        <p className="text-xs text-gray-400">
          {quizType === 'en_to_zh'
            ? `按住后反复说：${item.english} → ${item.chinese} → ${item.english} → ${item.chinese}…`
            : `按住后反复说：${item.english} → ${item.english} → ${item.english}…`
          }
        </p>
      </div>

      {/* 录音按钮：ready 状态，或 done 但轮数不足（省去"再读一遍"多余的点击） */}
      {(panelState === 'ready' || !canAdvance) && (
        <>
          <VoiceInput
            lang={sttLang}
            onResult={handleResult}
            onError={msg => setVoiceError(msg)}
          />
          {voiceError && (
            <p className="text-red-500 text-xs text-center mt-1">{voiceError}</p>
          )}
        </>
      )}

      {/* 本次录音结果 */}
      {panelState === 'done' && lastResult && fb && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              识别出 <span className="font-semibold text-gray-700">{lastResult.rounds}</span> 轮
            </span>
            <span className="text-xl font-bold text-red-500">{lastResult.score} 分</span>
          </div>
          <p className="text-sm text-gray-600">{fb.text}</p>
          {!canAdvance && (
            <p className="text-xs text-orange-500 font-medium">
              再读 {MIN_ROUNDS - totalRounds} 轮就可以继续 💪
            </p>
          )}
          {fb.showTip && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3 leading-relaxed">
              {SCIENCE_TIP}
            </p>
          )}
        </div>
      )}

      {/* 轮次圆点 + 最高分 */}
      {totalRounds > 0 && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: Math.min(totalRounds, MAX_ROUNDS) }, (_, i) => (
              <div key={i} className="w-3 h-3 rounded-full bg-red-400 transition-all duration-300" />
            ))}
            {Array.from({ length: Math.max(0, MAX_ROUNDS - totalRounds) }, (_, i) => (
              <div key={`e${i}`} className="w-2 h-2 rounded-full bg-gray-200" />
            ))}
            {totalRounds > MAX_ROUNDS && (
              <span className="text-xs text-red-400 font-bold ml-0.5">+{totalRounds - MAX_ROUNDS}</span>
            )}
          </div>
          <span className="text-xs text-gray-500">
            最高 <span className="font-bold text-red-500">{bestScore}</span> 分
          </span>
        </div>
      )}

      {/* 操作按钮（done 且已达标：可选再读一遍 + 继续） */}
      {panelState === 'done' && canAdvance && (
        <div className="flex gap-2">
          {canReadAgain && (
            <button
              onClick={handleReadAgain}
              className="flex-1 py-3 rounded-2xl text-sm font-bold bg-orange-100 text-orange-600 hover:bg-orange-200 active:scale-95 transition-all"
            >
              再读一遍
            </button>
          )}
          <button
            onClick={onDone}
            className={`py-3 rounded-2xl text-sm font-bold transition-all active:scale-95 ${
              canReadAgain
                ? 'px-5 bg-gray-100 text-gray-500 hover:bg-gray-200'
                : 'flex-1 bg-red-400 text-white hover:bg-red-500'
            }`}
          >
            下一个 →
          </button>
        </div>
      )}

      {/* 已完成 MIN_ROUNDS 轮后，ready 状态下也可离开 */}
      {panelState === 'ready' && canAdvance && (
        <button
          onClick={onDone}
          className="w-full py-2.5 rounded-2xl text-sm text-gray-400 border border-gray-200 bg-white hover:bg-gray-50 active:scale-95 transition-all"
        >
          下一个 →
        </button>
      )}

    </div>
  )
}
