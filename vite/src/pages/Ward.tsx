/**
 * Ward overview — workstation-density grid of all monitored patients.
 * Polls `/api/patients` every 10s for silent refresh. Sorts by severity
 * (critical → watch → stable), then by haoma_index desc within each band.
 */

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TopBar } from '@/components/TopBar'
import { Glyph } from '@/components/Glyph'
import { PatientCard } from '@/components/ward/PatientCard'
import { fetchWard, HaomaApiError } from '@/lib/api'
import { alertToSeverity, SEVERITY } from '@/lib/clinical'
import type { PatientSummary, WardSummary } from '@/types/ui'

const POLL_INTERVAL_MS = 2_500

let cachedWard: WardSummary | null = null

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
  const [ward, setWard] = useState<WardSummary | null>(cachedWard)
  const [loading, setLoading] = useState(cachedWard === null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await fetchWard()
      cachedWard = data
      setWard(data)
      setError(null)
    } catch (err) {
      const msg =
        err instanceof HaomaApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown error'
      // Only surface the error on the initial load — silent refreshes stay silent.
      if (showSpinner) setError(msg)
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(cachedWard === null)
    const id = window.setInterval(() => void load(false), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [load])

  const counts = ward ? countBySeverity(ward.patients) : undefined

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg)' }}>
      <TopBar
        hospitalName={ward?.hospital_name}
        departmentName={ward?.ward_name}
        wardHeading={ward?.ward_name}
        counts={counts}
      />

      {loading ? (
        <CenteredMessage text="Loading patients…" />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void load(true)} />
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
