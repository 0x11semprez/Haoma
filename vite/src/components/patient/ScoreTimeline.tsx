/**
 * Rolling Haoma-index timeline — last N frames plus a dashed forward
 * projection emitted by the backend (frame.projected_trajectory).
 *
 * The projection is NOT computed here: the backend owns the forecasting
 * logic (today a slope extrapolation in the mock, tomorrow the PINN).
 * We only render it, with a NOW marker and a distinct stroke so the
 * jury never confuses "observed" and "projected".
 *
 * Severity thresholds (55 / 80) are drawn as thin horizontal lines in
 * clinical colours rather than pale filled bands, which kept the chart
 * legible but crushed the curve visually. The area fill is a neutral
 * ink gradient (≤6% opacity) — no clinical hue, safe in grayscale.
 */

import { useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Glyph } from '@/components/Glyph'
import { severityOf } from '@/lib/clinical'
import type { AlertLevel, ProjectedPoint } from '@/types/api'

export interface TimelinePoint {
  index: number
  score: number
  alert_level: AlertLevel
  timestamp: string
}

interface Props {
  data: TimelinePoint[]
  projected?: ProjectedPoint[]
  intervalSeconds?: number
}

interface ChartRow {
  index: number
  score?: number
  projected?: number
  alert_level?: AlertLevel
  timestamp?: string
  isProjected?: boolean
  secondsFromNow?: number
}

interface TooltipLike {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: unknown }>
}

function isChartRow(value: unknown): value is ChartRow {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  return typeof rec.index === 'number'
}

function formatClock(timestamp?: string, secondsFromNow?: number): string {
  if (timestamp) {
    const d = new Date(timestamp)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    }
  }
  if (typeof secondsFromNow === 'number') {
    const mins = Math.round(secondsFromNow / 60)
    return mins > 0 ? `+${mins} min` : 'now'
  }
  return ''
}

function ChartTooltip(props: unknown) {
  const { active, payload } = (props ?? {}) as TooltipLike
  if (!active || !payload || payload.length === 0) return null
  const raw = payload[0]?.payload
  if (!isChartRow(raw)) return null

  const score = raw.isProjected ? raw.projected : raw.score
  if (score === undefined) return null

  const level: AlertLevel = raw.alert_level ?? levelFromScore(score)
  const s = severityOf(level)
  const clock = formatClock(raw.timestamp, raw.secondsFromNow)

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
      {clock ? (
        <div
          className="uppercase tabular"
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.22em',
            color: 'var(--ink-soft)',
            marginBottom: 4,
          }}
        >
          {clock}
          {raw.isProjected ? ' · projected' : ''}
        </div>
      ) : null}
      <div
        className="tabular"
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 32,
          lineHeight: 1,
          color: raw.isProjected ? 'var(--ink-soft)' : 'var(--ink)',
          fontStyle: raw.isProjected ? 'italic' : 'normal',
        }}
      >
        {Math.round(score)}
      </div>
      <div
        className="inline-flex items-center"
        style={{ gap: 8, marginTop: 8 }}
      >
        <Glyph shape={s.glyph} size="inline" color={s.colorVar} />
        <span
          className="uppercase"
          style={{
            fontSize: 12,
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

function levelFromScore(score: number): AlertLevel {
  if (score >= 80) return 'red'
  if (score >= 55) return 'orange'
  return 'green'
}

const AXIS_TEXT = {
  fontFamily: 'var(--sans)',
  fontSize: 12,
  fill: 'var(--ink-soft)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
}

const THRESHOLD_LABEL = {
  fontFamily: 'var(--sans)',
  fontSize: 10,
  letterSpacing: '0.22em',
} as const

export function ScoreTimeline({
  data,
  projected = [],
  intervalSeconds = 2,
}: Props) {
  const lastRealIndex = data.length > 0 ? data[data.length - 1]!.index : 0

  // Merge historical and projected samples on the same x-axis. The pivot
  // point (last real index) carries BOTH series so the dashed line visually
  // continues from the solid line with no gap.
  const combined = useMemo<ChartRow[]>(() => {
    const rows: ChartRow[] = data.map((p) => ({
      index: p.index,
      score: p.score,
      alert_level: p.alert_level,
      timestamp: p.timestamp,
      secondsFromNow: (p.index - lastRealIndex) * intervalSeconds,
    }))
    if (projected.length > 0 && data.length > 0) {
      const last = data[data.length - 1]!
      const pivotIndex = rows.findIndex((r) => r.index === last.index)
      if (pivotIndex >= 0) rows[pivotIndex]!.projected = last.score
      const samplesPerSecond = 1 / intervalSeconds
      for (const p of projected) {
        rows.push({
          index:
            last.index + Math.round(p.seconds_ahead * samplesPerSecond),
          projected: p.score,
          isProjected: true,
          secondsFromNow: p.seconds_ahead,
        })
      }
    }
    rows.sort((a, b) => a.index - b.index)
    return rows
  }, [data, projected, intervalSeconds, lastRealIndex])

  const formatX = (idx: number) => {
    const minutesOffset = ((idx - lastRealIndex) * intervalSeconds) / 60
    if (minutesOffset >= 0.5) return `+${Math.round(minutesOffset)}m`
    if (minutesOffset <= -0.5) return `-${Math.round(-minutesOffset)}m`
    return 'NOW'
  }

  return (
    <div
      style={{
        width: '100%',
        height: 'clamp(260px, 34vh, 320px)',
        minWidth: 0,
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={combined}
          margin={{ top: 16, right: 24, left: 8, bottom: 8 }}
        >
          <defs>
            <linearGradient id="haoma-score-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ink)" stopOpacity={0.06} />
              <stop offset="100%" stopColor="var(--ink)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--line-soft)"
            vertical={false}
            strokeDasharray="0"
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
            minTickGap={56}
            padding={{ left: 4, right: 4 }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 55, 80, 100]}
            tick={AXIS_TEXT}
            stroke="var(--line)"
            tickLine={false}
            axisLine={{ stroke: 'var(--line)' }}
            width={36}
          />
          <ReferenceLine
            y={55}
            stroke="var(--warning)"
            strokeDasharray="2 4"
            strokeWidth={1}
            ifOverflow="hidden"
            label={{
              value: 'WATCH',
              position: 'right',
              fill: 'var(--warning)',
              ...THRESHOLD_LABEL,
            }}
          />
          <ReferenceLine
            y={80}
            stroke="var(--critical)"
            strokeDasharray="2 4"
            strokeWidth={1}
            ifOverflow="hidden"
            label={{
              value: 'CRITICAL',
              position: 'right',
              fill: 'var(--critical)',
              ...THRESHOLD_LABEL,
            }}
          />
          <Tooltip
            content={ChartTooltip}
            cursor={{ stroke: 'var(--ink-soft)', strokeDasharray: '3 3' }}
          />
          {projected.length > 0 && data.length > 0 ? (
            <ReferenceLine
              x={lastRealIndex}
              stroke="var(--ink-soft)"
              strokeDasharray="2 4"
              strokeWidth={1}
              label={{
                value: 'NOW',
                position: 'top',
                fill: 'var(--ink-soft)',
                fontFamily: 'var(--sans)',
                fontSize: 11,
                letterSpacing: '0.22em',
              }}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="score"
            stroke="var(--ink)"
            strokeWidth={2}
            fill="url(#haoma-score-fill)"
            connectNulls={false}
            isAnimationActive={false}
            activeDot={{
              r: 4,
              stroke: 'var(--bg)',
              strokeWidth: 2,
              fill: 'var(--ink)',
            }}
          />
          <Line
            type="monotone"
            dataKey="projected"
            stroke="var(--ink-soft)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
