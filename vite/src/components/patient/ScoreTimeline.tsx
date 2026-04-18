/**
 * Rolling Haoma-index timeline — last N frames plus a dashed forward
 * projection emitted by the backend (frame.projected_trajectory).
 *
 * The projection is NOT computed here: the backend owns the forecasting
 * logic (today a slope extrapolation in the mock, tomorrow the PINN).
 * We only render it, with a NOW marker and a distinct stroke so the
 * jury never confuses "observed" and "projected".
 *
 * Tooltip flags projected points explicitly — no guessing allowed.
 */

import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
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

function ChartTooltip(props: unknown) {
  const { active, payload } = (props ?? {}) as TooltipLike
  if (!active || !payload || payload.length === 0) return null
  const raw = payload[0]?.payload
  if (!isChartRow(raw)) return null

  const score = raw.isProjected ? raw.projected : raw.score
  if (score === undefined) return null

  const level: AlertLevel = raw.alert_level ?? levelFromScore(score)
  const s = severityOf(level)

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
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.18em',
            color: s.colorVar,
          }}
        >
          {raw.isProjected ? `${s.label} · PROJECTED` : s.label}
        </span>
      </div>
    </div>
  )
}

function levelFromScore(score: number): AlertLevel {
  if (score >= 70) return 'red'
  if (score >= 40) return 'orange'
  return 'green'
}

const AXIS_TEXT = {
  fontFamily: 'var(--sans)',
  fontSize: 13,
  fill: 'var(--ink-soft)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
}

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
    }))
    if (projected.length > 0 && data.length > 0) {
      const last = data[data.length - 1]!
      // Pivot: attach the dashed line to the last real sample.
      const pivotIndex = rows.findIndex((r) => r.index === last.index)
      if (pivotIndex >= 0) rows[pivotIndex]!.projected = last.score
      const samplesPerSecond = 1 / intervalSeconds
      for (const p of projected) {
        rows.push({
          index: last.index + Math.round(p.seconds_ahead * samplesPerSecond),
          projected: p.score,
          isProjected: true,
        })
      }
    }
    rows.sort((a, b) => a.index - b.index)
    return rows
  }, [data, projected, intervalSeconds])

  const formatX = (idx: number) => {
    const minutesOffset = ((idx - lastRealIndex) * intervalSeconds) / 60
    if (minutesOffset >= 0.5) return `+${Math.round(minutesOffset)}m`
    if (minutesOffset <= -0.5) return `-${Math.round(-minutesOffset)}m`
    return 'NOW'
  }

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={combined}
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
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--ink)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
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
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
