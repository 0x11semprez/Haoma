/**
 * Patient live-monitoring view — THE demo screen.
 *
 * Lifecycle:
 *   1. fetch patient detail (REST) before opening the socket
 *   2. subscribe to `/ws/patients/:id`, push frames into a rolling buffer
 *   3. on unmount, close the socket handle
 *
 * Key demo rules enforced here (CLAUDE.md non-negotiables):
 *   - Score is the lead element: 220px Instrument Serif, pulsing only on red/orange
 *   - Triple-encoded clinical state (glyph + text + color) — never color alone
 *   - No sound trigger here: `useAlertSound` owns escalation beeps
 *   - WS disconnect keeps the last frame on screen; we only swap the chip state
 *   - Empty / missing SHAP renders a hyphen row, never crashes
 *
 * Animation note: the outer <RootLayout> already animates scale 0.96 → 1
 * on /patient/* entry. We purposely DO NOT add a second translate/scale
 * here — the 220px serif digit is rasterised under the outer scale, and
 * a nested transform created visible blur + layout oscillation. The
 * AnimatePresence below is opacity-only.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { TopBar } from '@/components/TopBar'
import type { TimelinePoint } from '@/components/patient/ScoreTimeline'
import { PatientHeader } from '@/components/patient/PatientHeader'
import { PatientErrorPanel } from '@/components/patient/PatientErrorPanel'
import { PatientLoader, type LoaderStage } from '@/components/patient/PatientLoader'
import { ScoreBanner } from '@/components/patient/ScoreBanner'
import { VitalsGrid } from '@/components/patient/VitalsGrid'
import { WhyBand } from '@/components/patient/WhyBand'
import { FeaturesPanel } from '@/components/patient/FeaturesPanel'
import { TimelineSection } from '@/components/patient/TimelineSection'
import { useAlertSound } from '@/hooks/useAlertSound'
import {
  fetchPatient,
  HaomaApiError,
  subscribeToPatient,
  type WsHandle,
  type WsStatus,
} from '@/lib/api'
import type { WebSocketFrame } from '@/types/api'
import type { PatientDetail } from '@/types/ui'

const BUFFER_SIZE = 120
const WS_INTERVAL_SECONDS = 2
const MIN_LOADER_MS = 8500

export function PatientPage() {
  const { patientId } = useParams<{ patientId: string }>()

  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [patientError, setPatientError] = useState<string | null>(null)
  const [loadingPatient, setLoadingPatient] = useState(true)
  const [frame, setFrame] = useState<WebSocketFrame | null>(null)
  const [wsStatus, setWsStatus] = useState<WsStatus>('idle')
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [readyInstance, setReadyInstance] = useState<string | null>(null)
  const minLoaderElapsed = readyInstance === patientId
  const frameCounterRef = useRef(0)

  useEffect(() => {
    if (!patientId) return
    const timer = window.setTimeout(
      () => setReadyInstance(patientId),
      MIN_LOADER_MS,
    )
    return () => window.clearTimeout(timer)
  }, [patientId])

  const loadPatient = useCallback(async () => {
    if (!patientId) return
    setLoadingPatient(true)
    setPatientError(null)
    try {
      const detail = await fetchPatient(patientId)
      setPatient(detail)
    } catch (err) {
      const msg =
        err instanceof HaomaApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown error'
      setPatientError(msg)
    } finally {
      setLoadingPatient(false)
    }
  }, [patientId])

  useEffect(() => {
    void loadPatient()
  }, [loadPatient])

  useEffect(() => {
    if (!patient || !patientId) return
    frameCounterRef.current = 0
    setTimeline([])
    setFrame(null)

    let handle: WsHandle | null = null
    handle = subscribeToPatient(patientId, {
      onFrame: (f) => {
        setFrame(f)
        setTimeline((prev) => {
          const next: TimelinePoint = {
            index: frameCounterRef.current++,
            score: f.haoma_index * 100,
            alert_level: f.alert_level,
            timestamp: f.timestamp,
          }
          const merged = [...prev, next]
          if (merged.length > BUFFER_SIZE) {
            return merged.slice(merged.length - BUFFER_SIZE)
          }
          return merged
        })
      },
      onStatus: (s) => setWsStatus(s),
    })

    return () => {
      handle?.close()
    }
  }, [patient, patientId])

  useAlertSound(frame?.alert_level)

  if (!patientId) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--bg)' }}>
        <TopBar />
        <CenteredMessage text="Unknown patient." />
      </div>
    )
  }

  const wsBroken = wsStatus === 'error' || wsStatus === 'closed'
  const dataReady = !loadingPatient && (frame !== null || wsBroken)
  const showLoader = !patientError && (!dataReady || !minLoaderElapsed)
  const loaderStage: LoaderStage = loadingPatient ? 'patient' : 'stream'

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg)' }}>
      <TopBar
        hospitalName={patient?.hospital_name}
        departmentName={patient?.ward_name}
        wsStatus={wsStatus}
      />
      <BackArrow />

      <AnimatePresence mode="wait" initial={false}>
        {patientError ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
          >
            <PatientErrorPanel message={patientError} onRetry={loadPatient} />
          </motion.div>
        ) : showLoader ? (
          <PatientLoader key="loader" stage={loaderStage} />
        ) : patient ? (
          <motion.div
            key="body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
          >
            <PatientHeader patient={patient} frame={frame} wsStatus={wsStatus} />
            <div className="patient-bands">
              <ScoreBanner frame={frame} />
              <VitalsGrid frame={frame} />
              <WhyBand frame={frame} />
              <FeaturesPanel frame={frame} />
              <TimelineSection
                timeline={timeline}
                intervalSeconds={WS_INTERVAL_SECONDS}
                bufferSize={BUFFER_SIZE}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function BackArrow() {
  return (
    <div style={{ padding: '16px 48px 0 48px' }}>
      <motion.div
        whileHover={{ scale: 1.12, color: 'var(--ink)' }}
        whileTap={{ scale: 0.88 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        style={{ display: 'inline-flex', color: 'var(--ink-soft)', borderRadius: 999 }}
      >
        <Link
          to="/ward"
          aria-label="Back to ward"
          style={{
            color: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </Link>
      </motion.div>
    </div>
  )
}

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
