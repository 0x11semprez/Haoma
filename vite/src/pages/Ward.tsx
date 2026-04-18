/**
 * Ward overview — workstation-density grid of all monitored patients.
 * Subscribes to the shared ward store (`useCriticalPatients`) so the
 * poll runs once per session and stays in sync with the global alert
 * banner. Sorts by severity (critical → watch → stable), then by
 * haoma_index desc within each band.
 */

import { motion } from 'framer-motion'
import { TopBar, type WardContext } from '@/components/TopBar'
import { Glyph } from '@/components/Glyph'
import { PatientCard } from '@/components/ward/PatientCard'
import { useCriticalPatients } from '@/hooks/useCriticalPatients'
import { alertToSeverity, SEVERITY } from '@/lib/clinical'
import type { PatientSummary, WardSummary } from '@/types/ui'

const SEVERITY_RANK: Record<ReturnType<typeof alertToSeverity>, number> = {
  critical: 0,
  watch: 1,
  stable: 2,
}

function sortPatients(patients: PatientSummary[]): PatientSummary[] {
  return [...patients].sort((a, b) => {
    const rankDiff =
      SEVERITY_RANK[alertToSeverity(a.alert_level)] -
      SEVERITY_RANK[alertToSeverity(b.alert_level)]
    if (rankDiff !== 0) return rankDiff
    return b.haoma_index - a.haoma_index
  })
}

/** Build the TopBar's ward context. Short codes and shift metadata are
 *  optional on the wire; we only opt into ward-mode when the backend
 *  (or mock) supplies the bits a clinician actually reads: the short
 *  codes, the shift name, and the monitoring start timestamp. */
function toWardContext(ward: WardSummary): WardContext | undefined {
  if (
    !ward.ward_short ||
    !ward.shift_name ||
    !ward.shift_end_iso ||
    !ward.monitoring_since_iso
  ) {
    return undefined
  }
  return {
    hospitalName: ward.hospital_name,
    wardShort: ward.ward_short,
    bay: ward.bay,
    bedsTotal: ward.beds_total,
    shiftName: ward.shift_name,
    shiftEndIso: ward.shift_end_iso,
    monitoringSinceIso: ward.monitoring_since_iso,
    framesDropped: ward.frames_dropped ?? 0,
    chargeNurse: ward.charge_nurse,
    patientCount: ward.patients.length,
    counts: countBySeverity(ward.patients),
  }
}

function countBySeverity(patients: PatientSummary[]) {
  let critical = 0
  let watch = 0
  let stable = 0
  for (const p of patients) {
    const sev = alertToSeverity(p.alert_level)
    if (sev === 'critical') critical += 1
    else if (sev === 'watch') watch += 1
    else stable += 1
  }
  return { critical, watch, stable }
}

export function WardPage() {
  const { ward, lastError } = useCriticalPatients()
  const loading = ward === null && lastError === null

  const wardCtx = ward ? toWardContext(ward) : undefined

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg)' }}>
      <TopBar
        hospitalName={ward?.hospital_name}
        departmentName={ward?.ward_name}
        ward={wardCtx}
      />

      {loading ? (
        <CenteredMessage text="Loading patients…" />
      ) : lastError && ward === null ? (
        <ErrorPanel
          message={lastError}
          onRetry={() => window.location.reload()}
        />
      ) : ward ? (
        ward.patients.length === 0 ? (
          <CenteredMessage text="No patients to monitor" />
        ) : (
          <Grid patients={ward.patients} />
        )
      ) : null}
    </div>
  )
}

/* ── Grid ────────────────────────────────────────────────────────────── */

function Grid({ patients }: { patients: PatientSummary[] }) {
  const sorted = sortPatients(patients)
  return (
    <motion.div
      className="ward-grid"
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        // Lock every row to the exact card height so rectangles are identical
        // across rows, not just within a row.
        gridAutoRows: '280px',
        columnGap: 28,
        rowGap: 24,
        padding: '16px 48px 32px',
      }}
    >
      {sorted.map((p) => (
        <motion.div
          key={p.patient_id}
          layout
          transition={{
            layout: { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 },
          }}
          whileHover={{ scale: 1.02 }}
          style={{ height: '100%', width: '100%', minWidth: 0 }}
          variants={{
            hidden: { opacity: 0, y: 8 },
            show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
          }}
        >
          <PatientCard patient={p} />
        </motion.div>
      ))}
      <style>{`
        @media (max-width: 1200px) {
          .ward-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 720px) {
          .ward-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
    </motion.div>
  )
}

/* ── Feedback panels ─────────────────────────────────────────────────── */

function CenteredMessage({ text }: { text: string }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        padding: '96px 48px',
        fontFamily: 'var(--serif)',
        fontStyle: 'italic',
        fontSize: 28,
        color: 'var(--ink-soft)',
      }}
    >
      {text}
    </div>
  )
}

function ErrorPanel({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  const critical = SEVERITY.critical
  return (
    <div
      className="flex flex-col items-center"
      style={{ padding: '96px 48px', gap: 24, textAlign: 'center' }}
    >
      <div className="flex items-center" style={{ gap: 12 }}>
        <Glyph
          shape={critical.glyph}
          size="medium"
          color={critical.colorVar}
          aria-label="Error"
        />
        <span
          style={{
            fontSize: 17,
            fontWeight: 500,
            color: critical.colorVar,
          }}
        >
          {message}
        </span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 15,
          letterSpacing: '0.02em',
          padding: '10px 18px',
          background: 'var(--ink)',
          color: 'var(--bg)',
          border: `1px solid var(--ink)`,
          borderRadius: 3,
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  )
}
