import type { WebSocketFrame } from '@/types/api'

export function FeaturesPanel({ frame }: { frame: WebSocketFrame | null }) {
  const f = frame?.features
  const rows: Array<{ label: string; value: string }> = [
    {
      label: 'ΔT core / peripheral',
      value: f !== undefined ? `${f.delta_t.toFixed(2)} °C` : '—',
    },
    {
      label: 'HR variability (30 min)',
      value: f !== undefined ? f.hrv_trend_30min.toFixed(3) : '—',
    },
    {
      label: 'PI/HR ratio',
      value: f !== undefined ? f.pi_fc_ratio.toFixed(3) : '—',
    },
    {
      label: 'Degradation slope (30 min)',
      value: f !== undefined ? f.degradation_slope_30min.toFixed(3) : '—',
    },
  ]

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
        DERIVED INDICATORS
      </span>

      <div
        className="info-hover-group"
        style={{
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        {rows.map((row, idx) => (
          <div
            key={row.label}
            className="info-hover info-hover--slate flex items-center justify-between"
            style={{
              padding: '12px 20px',
              borderTop: idx === 0 ? 'none' : '1px solid var(--line-soft)',
              gap: 16,
            }}
          >
            <span
              style={{
                fontSize: 17,
                color: 'var(--ink)',
              }}
            >
              {row.label}
            </span>
            <span
              className="tabular"
              style={{
                fontSize: 17,
                fontWeight: 500,
                color: 'var(--ink)',
                whiteSpace: 'nowrap',
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
