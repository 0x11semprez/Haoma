/**
 * Unified top bar.
 *
 * Connection chip policy: the nominal "LIVE" state is intentionally silent
 * — a monitor that's working should not brag. The chip only appears when
 * the stream is degraded (reconnecting, lost), because that IS safety-
 * critical information the clinician must see.
 *
 * Two display modes:
 *
 *   · Ward (full context — pass `ward`): compact breadcrumb
 *     `CHOP · PICU · BAY B`, a caps trust sub-line
 *     `MONITORING SINCE 07:00 · 0 FRAMES DROPPED`, a meaningful H1
 *     `6 patients · Day shift` with italic serif subtitle
 *     `Handoff in 0:38`, and the counts pills on the right. Charge nurse
 *     sits as a second line under the clinician badge.
 *
 *   · Patient / fallback (pass `hospitalName`, `departmentName`): long-form
 *     breadcrumb only. The H1 row is suppressed.
 *
 * The fix the `ward` mode targets: the previous bar showed
 * `PEDIATRIC INTENSIVE CARE UNIT` in the breadcrumb AND again as the serif
 * H1 on the ward route. Each row now carries distinct information.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { clearSession, getSession, type WsStatus } from '@/lib/api'
import { Glyph } from './Glyph'
import { Clock } from './Clock'
import { ConnectionChip } from './patient/ConnectionChip'
import { MuteToggle, NightToggle } from './Toggles'

interface WardCounts {
  critical: number
  watch: number
  stable: number
}

export interface WardContext {
  hospitalName: string
  wardShort: string
  bay?: string
  bedsTotal?: number
  shiftName: string
  shiftEndIso: string
  monitoringSinceIso: string
  framesDropped: number
  chargeNurse?: string
  patientCount: number
  counts: WardCounts
}

interface Props {
  /** Long-form facility label — used when `ward` is absent (Patient page). */
  hospitalName?: string
  departmentName?: string
  /** Ward-mode context: enables compact breadcrumb, trust sub-line and
   *  the meaningful H1 row. */
  ward?: WardContext
  wsStatus?: WsStatus
}

/* Logout — a plain iris cover (clip-path expansion from the viewport
 * centre) in --bg. No pop, no disc — the intent is a quick, quiet
 * departure rather than the celebratory pop the login seal carries.
 * RootLayout's wipe-hold contracts the iris on the landing page. */
const LOGOUT_IRIS_MS = 500

export function TopBar({ hospitalName, departmentName, ward, wsStatus }: Props) {
  const navigate = useNavigate()
  const session = getSession()
  const [loggingOut, setLoggingOut] = useState(false)

  const onLogout = () => {
    if (loggingOut) return
    setLoggingOut(true)
    window.setTimeout(() => {
      clearSession()
      try {
        sessionStorage.setItem('haoma.authWipe', '1')
      } catch {
        /* sessionStorage disabled — soft-fail, landing still appears */
      }
      navigate('/')
    }, LOGOUT_IRIS_MS)
  }

  return (
    <>
    <header
      className="flex flex-col"
      style={{
        borderBottom: '1px solid var(--line)',
        padding: '20px 48px',
        gap: ward ? 24 : 0,
      }}
    >
      <div className="flex items-start" style={{ gap: 32 }}>
        <div
          className="flex flex-col"
          style={{ flex: '1 1 0', minWidth: 0, gap: 4 }}
        >
          {ward ? (
            <CompactFacilityLabel ward={ward} />
          ) : (
            <FacilityLabel
              hospitalName={hospitalName}
              departmentName={departmentName}
            />
          )}
          {ward ? <MonitoringLine ward={ward} /> : null}
        </div>
        <div
          className="flex items-center"
          style={{ flex: '0 0 auto', gap: 14, justifyContent: 'center' }}
        >
          <Clock />
          {wsStatus === 'closed' || wsStatus === 'error' ? (
            <ConnectionChip status={wsStatus} />
          ) : null}
        </div>
        <div
          className="flex items-center"
          style={{
            flex: '1 1 0',
            minWidth: 0,
            gap: 20,
            justifyContent: 'flex-end',
          }}
        >
          {session ? (
            <ClinicianBadge
              name={session.clinician_name}
              role={session.role}
              chargeNurse={ward?.chargeNurse}
            />
          ) : null}
          <div
            aria-hidden="true"
            style={{ width: 1, height: 20, background: 'var(--line)' }}
          />
          <NightToggle />
          <MuteToggle />
          <LogoutButton onClick={onLogout} />
        </div>
      </div>

      {ward ? <WardHeadingRow ward={ward} /> : null}
    </header>

    {/* Logout seal — --bg disc that drops in from the header area,
     * pops with a spring, then scales up to cover the viewport. No
     * icon inside (logout is a departure, not a confirmation). The
     * disc colour matches RootLayout's default wipe-hold fill so the
     * contraction on Landing is seamless without any wipeColor flag.
     * A thin --ink border keeps the disc readable against the --bg
     * page during the pop stage; the border scales with the disc and
     * is visually absorbed into the full-viewport cover. */}
    {loggingOut && (
      <motion.div
        initial={{ clipPath: 'circle(0 at 50% 50%)' }}
        animate={{ clipPath: 'circle(150% at 50% 50%)' }}
        transition={{
          duration: LOGOUT_IRIS_MS / 1000,
          ease: [0.45, 0, 0.2, 1],
        }}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg)',
          zIndex: 52,
          pointerEvents: 'none',
        }}
      />
    )}
    </>
  )
}

/* ── Breadcrumb — ward mode ───────────────────────────────────────── */

function CompactFacilityLabel({ ward }: { ward: WardContext }) {
  const parts = [ward.hospitalName, ward.wardShort]
  if (ward.bay) parts.push(ward.bay)
  return (
    <span
      className="uppercase"
      style={{
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '0.18em',
        color: 'var(--ink-soft)',
        lineHeight: 1.4,
      }}
    >
      {parts.map((p, i) => (
        <span key={p}>
          {i > 0 ? <Separator /> : null}
          {p}
        </span>
      ))}
    </span>
  )
}

/* ── Breadcrumb — fallback (Patient page) ─────────────────────────── */

function FacilityLabel({
  hospitalName,
  departmentName,
}: {
  hospitalName?: string
  departmentName?: string
}) {
  if (!hospitalName && !departmentName) return null
  const parts = [hospitalName, departmentName].filter(Boolean) as string[]
  return (
    <span
      className="uppercase"
      style={{
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '0.18em',
        color: 'var(--ink-soft)',
        lineHeight: 1.4,
      }}
    >
      {parts.map((p, i) => (
        <span key={p}>
          {i > 0 ? <Separator /> : null}
          {p}
        </span>
      ))}
    </span>
  )
}

function Separator() {
  return (
    <span
      aria-hidden="true"
      style={{ margin: '0 10px', color: 'var(--ink-muted)' }}
    >
      ·
    </span>
  )
}

/* ── Trust sub-line — monitoring uptime ───────────────────────────── */

function MonitoringLine({ ward }: { ward: WardContext }) {
  const startLabel = formatHHMM(ward.monitoringSinceIso)
  const hasBeds = typeof ward.bedsTotal === 'number' && ward.bedsTotal > 0
  if (!startLabel && !hasBeds) return null
  const fragments: React.ReactNode[] = []
  if (hasBeds) {
    fragments.push(
      <span key="beds" className="tabular">
        {ward.patientCount} / {ward.bedsTotal} beds
      </span>,
    )
  }
  if (startLabel) {
    fragments.push(
      <span key="since">Monitoring since {startLabel}</span>,
      <span key="drops" className="tabular">
        {ward.framesDropped} {ward.framesDropped === 1 ? 'frame' : 'frames'} dropped
      </span>,
    )
  }
  return (
    <span
      className="uppercase"
      style={{
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.2em',
        color: 'var(--ink-muted)',
        lineHeight: 1.4,
      }}
    >
      {fragments.map((frag, i) => (
        <span key={i}>
          {i > 0 ? <Separator /> : null}
          {frag}
        </span>
      ))}
    </span>
  )
}

/* ── Right meta: clinician identity (+ charge nurse sub-line) ─────── */

function ClinicianBadge({
  name,
  role,
  chargeNurse,
}: {
  name: string
  role: string
  chargeNurse?: string
}) {
  return (
    <div
      className="flex flex-col items-end"
      style={{ gap: 2, lineHeight: 1.1 }}
    >
      <span
        style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}
      >
        {name}
      </span>
      <span
        className="uppercase"
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.2em',
          color: 'var(--ink-soft)',
        }}
      >
        {role}
      </span>
      {chargeNurse ? (
        <span
          className="uppercase"
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.2em',
            color: 'var(--ink-muted)',
            marginTop: 4,
          }}
        >
          Charge · {chargeNurse}
        </span>
      ) : null}
    </div>
  )
}

/* ── Sign-out — iconic, matches Toggles' 36x36 pill pattern ───────── */

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function LogoutButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label="Sign out"
      whileHover={{ scale: 1.12, color: 'var(--ink)' }}
      whileTap={{ scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      style={{
        width: 36,
        height: 36,
        padding: 0,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--ink-soft)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        borderRadius: 999,
      }}
    >
      <LogoutIcon />
    </motion.button>
  )
}

/* ── Heading row — census + shift + handoff + counts ──────────────── */

function WardHeadingRow({ ward }: { ward: WardContext }) {
  return (
    <div className="flex items-end justify-between" style={{ gap: 48 }}>
      <WardCensus ward={ward} />
      <CountsRow counts={ward.counts} />
    </div>
  )
}

function WardCensus({ ward }: { ward: WardContext }) {
  const handoff = useHandoffLabel(ward.shiftEndIso)
  return (
    <div className="flex flex-col" style={{ gap: 6, minWidth: 0 }}>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--serif)',
          fontSize: 56,
          fontWeight: 400,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
          display: 'flex',
          alignItems: 'baseline',
          gap: 18,
          flexWrap: 'wrap',
        }}
      >
        <span className="tabular">
          {ward.patientCount} {ward.patientCount === 1 ? 'patient' : 'patients'}
        </span>
        <span
          className="uppercase"
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.2em',
            color: 'var(--ink-soft)',
          }}
        >
          · {ward.shiftName}
        </span>
      </h1>
      {handoff ? (
        <span
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 19,
            color: 'var(--ink-soft)',
            lineHeight: 1.2,
          }}
          aria-live="polite"
        >
          {handoff}
        </span>
      ) : null}
    </div>
  )
}

/** Formats the shift-end timestamp as `Handoff in Hh MMm` (or `MMm` if < 1h).
 *  Re-computed every 30 s — a minute's resolution is enough for a clinical
 *  context. Returns `null` if the timestamp is unparsable or already past. */
function useHandoffLabel(shiftEndIso: string): string | null {
  const [label, setLabel] = useState<string | null>(() =>
    computeHandoffLabel(shiftEndIso),
  )
  useEffect(() => {
    setLabel(computeHandoffLabel(shiftEndIso))
    const id = window.setInterval(() => {
      setLabel(computeHandoffLabel(shiftEndIso))
    }, 30_000)
    return () => window.clearInterval(id)
  }, [shiftEndIso])
  return label
}

function computeHandoffLabel(shiftEndIso: string): string | null {
  const end = Date.parse(shiftEndIso)
  if (Number.isNaN(end)) return null
  const diffMs = end - Date.now()
  if (diffMs <= 0) return 'Handoff in progress'
  const totalMin = Math.round(diffMs / 60_000)
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (hours === 0) return `Handoff in ${minutes}m`
  return `Handoff in ${hours}h ${String(minutes).padStart(2, '0')}m`
}

/* ── Time helpers ─────────────────────────────────────────────────── */

function formatHHMM(iso: string): string | null {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/* ── Count pills ──────────────────────────────────────────────────── */

function CountsRow({ counts }: { counts: WardCounts }) {
  return (
    <div className="flex items-center" style={{ gap: 32 }}>
      <CountPill
        shape="triangle"
        label="CRITICAL"
        color="var(--critical)"
        count={counts.critical}
      />
      <CountPill
        shape="diamond"
        label="WATCH"
        color="var(--warning)"
        count={counts.watch}
      />
      <CountPill
        shape="circle-filled"
        label="STABLE"
        color="var(--stable)"
        count={counts.stable}
      />
    </div>
  )
}

function CountPill({
  shape,
  label,
  color,
  count,
}: {
  shape: 'triangle' | 'diamond' | 'circle-filled'
  label: string
  color: string
  count: number
}) {
  const dim = count === 0
  const displayColor = dim ? 'var(--ink-muted)' : color
  return (
    <div
      className="flex items-center"
      style={{ gap: 10 }}
      aria-label={`${count} ${label.toLowerCase()}`}
    >
      <Glyph shape={shape} size="medium" color={displayColor} />
      <span
        className="tabular"
        style={{
          fontSize: 17,
          fontWeight: 500,
          color: dim ? 'var(--ink-muted)' : 'var(--ink)',
        }}
      >
        {count}
      </span>
      <span
        className="uppercase"
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.18em',
          color: dim ? 'var(--ink-muted)' : 'var(--ink-soft)',
        }}
      >
        {label}
      </span>
    </div>
  )
}
