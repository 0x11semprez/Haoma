import { PatientCard } from '@/components/patient/PatientCard'
import type { WebSocketFrame } from '@/types/api'

/**
 * The 4 PINN input features — derived indicators the model consumes to
 * produce the Haoma Index. Rendered as 4 independent cards (one per
 * feature), each with the shared hoverable `PatientCard` shell so the
 * interaction feels identical to the 4 vitals on the right side of the
 * hero. Unit + short caption help the reader decode each number without
 * leaving the card.
 */
interface FeatureSpec {
  label: string
  value: string
  unit: string
  caption: string
}

export function FeaturesPanel({ frame }: { frame: WebSocketFrame | null }) {
  const f = frame?.features

  const specs: FeatureSpec[] = [
    {
      label: 'ΔT core / peripheral',
      value: f !== undefined ? f.delta_t.toFixed(2) : '—',
      unit: '°C',
      caption: 'Thermal gradient — widens under peripheral vasoconstriction.',
    },
    {
      label: 'HR variability (30 min)',
      value: f !== undefined ? f.hrv_trend_30min.toFixed(3) : '—',
      unit: '',
      caption: 'Rolling trend of R-R intervals. Drops early in compensation.',
    },
    {
      label: 'PI / HR ratio',
      value: f !== undefined ? f.pi_fc_ratio.toFixed(3) : '—',
      unit: '',
      caption: 'Pulsatile capillary flow normalised by heart rate.',
    },
    {
      label: 'Degradation slope (30 min)',
      value: f !== undefined ? f.degradation_slope_30min.toFixed(3) : '—',
      unit: '',
      caption: 'Aggregated temporal derivative of the risk surface.',
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
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {specs.map((s) => (
          <FeatureCard key={s.label} spec={s} />
        ))}
      </div>
    </section>
  )
}

function FeatureCard({ spec }: { spec: FeatureSpec }) {
  return (
    <PatientCard
      style={{
        padding: '18px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 140,
      }}
    >
      <span
        className="uppercase"
        style={{
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '0.22em',
          color: 'var(--ink-soft)',
        }}
      >
        {spec.label}
      </span>
      <div className="flex items-baseline" style={{ gap: 8, marginTop: 4 }}>
        <span
          className="tabular"
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 48,
            lineHeight: 0.95,
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
          }}
        >
          {spec.value}
        </span>
        {spec.unit ? (
          <span
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 17,
              fontWeight: 400,
              color: 'var(--ink-soft)',
              lineHeight: 1,
            }}
          >
            {spec.unit}
          </span>
        ) : null}
      </div>
      <span
        style={{
          fontSize: 13,
          color: 'var(--ink-soft)',
          lineHeight: 1.4,
        }}
      >
        {spec.caption}
      </span>
    </PatientCard>
  )
}
