/**
 * Unified top bar — single bordered surface that replaces the previous
 * TopBar + SecondaryHeader duo.
 *
 * Connection chip policy: the nominal "LIVE" state is intentionally silent
 * — a monitor that's working should not brag. The chip only appears when
 * the stream is degraded (reconnecting, lost), because that IS safety-
 * critical information the clinician must see.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ HOSPITAL · DEPARTMENT         MON 18 APR · 16:42:08  Dr. Name…  │
 *   │ Ward heading (serif H1)                ▲ n  ◆ n  ● n            │
 *   └─────────────────────────────────────────────────────────────────┘
 */

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

interface Props {
  hospitalName?: string
  departmentName?: string
  wardHeading?: string
  counts?: WardCounts
  wsStatus?: WsStatus
}

export function TopBar({
  hospitalName,
  departmentName,
  wardHeading,
  counts,
  wsStatus,
}: Props) {
  const navigate = useNavigate()
  const session = getSession()

  const onLogout = () => {
    clearSession()
    navigate('/')
  }

  const hasHeading = Boolean(wardHeading || counts)

  return (
    <header
      className="flex flex-col"
      style={{
        borderBottom: '1px solid var(--line)',
        padding: '20px 48px',
        gap: hasHeading ? 24 : 0,
      }}
    >
      <div className="flex items-center" style={{ gap: 32 }}>
        <div
          className="flex items-center"
          style={{ flex: '1 1 0', minWidth: 0, justifyContent: 'flex-start' }}
        >
          <FacilityLabel
            hospitalName={hospitalName}
            departmentName={departmentName}
          />
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
          style={{ flex: '1 1 0', minWidth: 0, gap: 20, justifyContent: 'flex-end' }}
        >
          {session ? (
            <ClinicianBadge
              name={session.clinician_name}
              role={session.role}
            />
          ) : null}
          <div
            aria-hidden="true"
            style={{
              width: 1,
              height: 20,
              background: 'var(--line)',
            }}
          />
          <NightToggle />
          <MuteToggle />
          <LogoutButton onClick={onLogout} />
        </div>
      </div>

      {hasHeading ? (
        <div
          className="flex items-end justify-between"
          style={{ gap: 48 }}
        >
          {wardHeading ? (
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--serif)',
                fontSize: 56,
                fontWeight: 400,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
              }}
            >
              {wardHeading}
            </h1>
          ) : (
            <span />
          )}
          {counts ? <CountsRow counts={counts} /> : null}
        </div>
      ) : null}
    </header>
  )
}

/* ── Left meta: hospital · department ─────────────────────────────── */

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
          {i > 0 ? (
            <span
              aria-hidden="true"
              style={{ margin: '0 10px', color: 'var(--ink-muted)' }}
            >
              ·
            </span>
          ) : null}
          {p}
        </span>
      ))}
    </span>
  )
}

/* ── Right meta: clinician identity ───────────────────────────────── */

function ClinicianBadge({ name, role }: { name: string; role: string }) {
  return (
    <div
      className="flex flex-col items-end"
      style={{ gap: 2, lineHeight: 1.1 }}
    >
      <span
        style={{
          fontSize: 15,
          fontWeight: 500,
          color: 'var(--ink)',
        }}
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

/* ── Count pills (folded from former SecondaryHeader) ─────────────── */

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
