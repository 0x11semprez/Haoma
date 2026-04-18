/**
 * Rolling Haoma-index timeline — last N frames (N≈120, ≈4 min at 2 s cadence).
 * Recharts is themed via CSS vars so it stays coherent with the design system.
 * Tooltip renders the score + a triple-encoded severity tag so the jury can
 * scrub back and still see WHY a point is flagged.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Glyph } from '@/components/Glyph'
import { severityOf } from '@/lib/clinical'
import type { AlertLevel } from '@/types/api'

export interface TimelinePoint {
  index: number
  score: number
  alert_level: AlertLevel
  timestamp: string
}

interface Props {
  data: TimelinePoint[]
  intervalSeconds?: number
}

/**
 * Recharts calls tooltip formatters with untyped payload arrays — we narrow
 * through a type guard before rendering.
 */
interface TooltipLike {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: unknown }>
}

function isTimelinePoint(value: unknown): value is TimelinePoint {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  return (
    typeof rec.score === 'number' &&
    typeof rec.index === 'number' &&
    typeof rec.alert_level === 'string'
  )
}

function ChartTooltip(props: unknown) {
  const { active, payload } = (props ?? {}) as TooltipLike
  if (!active || !payload || payload.length === 0) return null
  const raw = payload[0]?.payload
  if (!isTimelinePoint(raw)) return null
  const s = severityOf(raw.alert_level)
  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-card)',
        padding: '10px 14px',
        fontFamily: 'var(--sans)',
      }}
    >
      <div
        className="tabular"
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 28,
          lineHeight: 1,
          color: 'var(--ink)',
        }}
      >
        {Math.round(raw.score)}
      </div>
      <div
        className="inline-flex items-center"
        style={{ gap: 8, marginTop: 8 }}
      >
        <Glyph shape={s.glyph} size="inline" color={s.colorVar} />
        <span
          className="uppercase"
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.18em',
            color: s.colorVar,
          }}
        >
          {s.label}
        </span>
      </div>
    </div>
  )
}

const AXIS_TEXT = {
  fontFamily: 'var(--sans)',
  fontSize: 13,
  fill: 'var(--ink-soft)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
}

export function ScoreTimeline({ data, intervalSeconds = 2 }: Props) {
  const lastIndex = data.length > 0 ? data[data.length - 1]!.index : 0
  const formatX = (idx: number) => {
    const framesBack = lastIndex - idx
    const minutes = Math.round((framesBack * intervalSeconds) / 60)
    if (minutes <= 0) return 'NOW'
    return `-${minutes}m`
  }

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
        >
          <CartesianGrid
            stroke="var(--line-soft)"
            vertical={false}
            strokeDasharray="0"
          />
          <ReferenceArea
            y1={0}
            y2={55}
            fill="var(--stable-pale)"
            fillOpacity={0.35}
            ifOverflow="hidden"
          />
          <ReferenceArea
            y1={55}
            y2={80}
            fill="var(--warning-pale)"
            fillOpacity={0.35}
            ifOverflow="hidden"
          />
          <ReferenceArea
            y1={80}
            y2={100}
            fill="var(--critical-pale)"
            fillOpacity={0.35}
            ifOverflow="hidden"
          />
          <XAxis
            dataKey="index"
            type="number"
            domain={[
              (min: number) => Math.floor(min),
              (max: number) => Math.ceil(max),
            ]}
            tickFormatter={formatX}
            tick={AXIS_TEXT}
            stroke="var(--line)"
            tickLine={false}
            axisLine={{ stroke: 'var(--line)' }}
            minTickGap={48}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 55, 80, 100]}
            tick={AXIS_TEXT}
            stroke="var(--line)"
            tickLine={false}
            axisLine={{ stroke: 'var(--line)' }}
            width={48}
          />
          <Tooltip
            content={ChartTooltip}
            cursor={{ stroke: 'var(--ink-soft)', strokeDasharray: '3 3' }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--ink)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
