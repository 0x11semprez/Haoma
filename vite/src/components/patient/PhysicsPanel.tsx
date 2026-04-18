import type { WebSocketFrame } from '@/types/api'

const MINUS_SIGN = '\u2212'

function fmt(value: number | undefined | null, decimals: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return value.toFixed(decimals)
}

export function PhysicsPanel({ frame }: { frame: WebSocketFrame | null }) {
  const p = frame?.physics
  // Semantics are INVERTED between the two heads:
  // - R̂ rising = pathological (vasoconstriction) → critical when delta > 0
  // - Q̂ falling = pathological (micro-vascular collapse) → critical when delta < 0
  const rColor = p
    ? p.resistance_delta_pct > 0
      ? 'var(--critical)'
      : 'var(--stable)'
    : 'var(--ink-soft)'
  const qColor = p
    ? p.flow_delta_pct < 0
      ? 'var(--critical)'
      : 'var(--stable)'
    : 'var(--ink-soft)'

  return (
    <section className="flex flex-col" style={{ gap: 16 }}>
      <span
        className="uppercase"
        style={{
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: '0.2em',
          color: 'var(--ink-soft)',
        }}
      >
        PINN PHYSICAL QUANTITIES
      </span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        <PhysicsCell
          title="RESISTANCE R̂"
          value={fmt(p?.resistance, 2)}
          deltaPct={p?.resistance_delta_pct ?? null}
          deltaColor={rColor}
          caption="Vascular resistance"
        />
        <PhysicsCell
          title="MICRO FLOW Q̂"
          value={fmt(p?.flow, 2)}
          deltaPct={p?.flow_delta_pct ?? null}
          deltaColor={qColor}
          caption="Micro-vascular flow"
        />
      </div>
    </section>
  )
}

function PhysicsCell({
  title,
  value,
  deltaPct,
  deltaColor,
  caption,
}: {
  title: string
  value: string
  deltaPct: number | null
  deltaColor: string
  caption: string
}) {
  const hasDelta = deltaPct !== null && !Number.isNaN(deltaPct)
  const sign = hasDelta && deltaPct >= 0 ? '+' : hasDelta ? MINUS_SIGN : ''
  const deltaText = hasDelta
    ? `${sign}${Math.abs(deltaPct).toFixed(0)} %`
    : '—'

  return (
    <div
      className="info-hover info-hover--indigo"
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-card)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <span
        className="uppercase"
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.18em',
          color: 'var(--ink-soft)',
        }}
      >
        {title}
      </span>
      <span
        className="tabular"
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 32,
          fontWeight: 400,
          lineHeight: 1,
          color: 'var(--ink)',
        }}
      >
        {value}
      </span>
      <span
        className="tabular"
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: deltaColor,
        }}
      >
        {deltaText}
      </span>
      <span
        style={{
          fontSize: 14,
          color: 'var(--ink-soft)',
          lineHeight: 1.35,
        }}
      >
        {caption}
      </span>
    </div>
  )
}
