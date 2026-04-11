/**
 * LearningForecastChart — 纯 SVG 每日负荷预测柱状图
 *
 * 布局常量
 *   BAR_W  = 7   每根柱宽（px）
 *   GAP    = 1   柱间距（px）
 *   STEP   = 8   每根柱占有的单元宽度
 *   CHART_H= 120 图表绘图区高度
 *   LABEL_H= 18  底部日期标签高度
 *
 * 颜色规则
 *   - 复习柱：蓝色（历史偏淡 #93c5fd，未来正常 #3b82f6）
 *   - 新词柱：绿色（历史偏淡 #86efac，未来正常 #22c55e）
 *   - 今日竖线：灰色虚线
 *   - 峰值横线：橙色虚线（超出峰值由此线提示，柱子不再染色）
 */
import type { Forecast } from '@/types'

interface Props {
  forecast: Forecast
  maxDays?: number
}

const BAR_W = 7
const GAP = 1
const STEP = BAR_W + GAP
const CHART_H = 120
const LABEL_H = 18

function fmtDate(d: number): string {
  const s = String(d)
  return `${s.slice(4, 6)}/${s.slice(6, 8)}`
}

export default function LearningForecastChart({ forecast, maxDays }: Props) {
  const days = forecast.forecast.slice(0, maxDays ?? forecast.forecast.length)
  if (days.length === 0) return null

  const { daily_peak } = forecast

  const maxVal = Math.max(...days.map(d => d.total), daily_peak, 1)
  const svgW = days.length * STEP
  const svgH = CHART_H + LABEL_H

  // 预计完成日竖线位置
  const completionIdx = forecast.projected_completion_date != null
    ? days.findIndex(d => d.date === forecast.projected_completion_date)
    : -1

  // 像素高度换算（留 2px 顶部空隙）
  const toH = (v: number) => Math.round((v / maxVal) * (CHART_H - 2))
  const peakY = CHART_H - toH(daily_peak)

  return (
    <div className="overflow-x-auto rounded-xl bg-gray-50 p-2">
      <svg
        width={svgW}
        height={svgH}
        style={{ display: 'block', minWidth: svgW }}
        aria-label="每日负荷预测图"
      >
        {/* 峰值横虚线 */}
        <line
          x1={0} y1={peakY} x2={svgW} y2={peakY}
          stroke="#f97316" strokeWidth={1} strokeDasharray="3 3" opacity={0.7}
        />

        {/* 预计完成日竖线 */}
        {completionIdx >= 0 && (() => {
          const cx = completionIdx * STEP + BAR_W / 2
          return (
            <g>
              <line x1={cx} y1={4} x2={cx} y2={CHART_H}
                stroke="#16a34a" strokeWidth={1.5} strokeDasharray="4 2" />
              <text x={cx + 2} y={12} fontSize={8} fill="#16a34a" fontWeight="600">完成</text>
            </g>
          )
        })()}

        {days.map((day, i) => {
          const rH = toH(day.review_count)
          const nH = toH(day.new_count)
          const totalBarH = rH + nH
          const x = i * STEP

          // 颜色：未来正常蓝/绿
          const reviewColor = '#3b82f6'
          const newColor    = '#22c55e'

          // 标签（每7天一个）
          const showLabel = i % 7 === 0

          return (
            <g key={day.date}>
              {/* 复习柱（栈底，从底部向上） */}
              {rH > 0 && (
                <rect
                  x={x} y={CHART_H - rH}
                  width={BAR_W} height={rH}
                  fill={reviewColor} rx={1}
                />
              )}
              {/* 新词柱（叠在复习柱上方） */}
              {nH > 0 && (
                <rect
                  x={x} y={CHART_H - totalBarH}
                  width={BAR_W} height={nH}
                  fill={newColor} rx={1}
                />
              )}
              {/* 日期标签 */}
              {showLabel && (
                <text
                  x={i === 0 ? x : x + BAR_W / 2} y={svgH - 2}
                  textAnchor={i === 0 ? 'start' : 'middle'}
                  fontSize={9}
                  fill="#9ca3af"
                >
                  {fmtDate(day.date)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* 图例 */}
      <div className="flex gap-3 mt-1 text-xs text-gray-400 pl-1">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#3b82f6' }} />复习
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#22c55e' }} />新词
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block" style={{ width: 16, borderTop: '1.5px dashed #f97316', marginTop: 2 }} />上限
        </span>
        {completionIdx >= 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block" style={{ width: 1.5, height: 12, background: '#16a34a', marginRight: 2 }} />完成日
          </span>
        )}
      </div>
    </div>
  )
}
