/**
 * Persistent high-priority alarm banner (IEC 60601-1-8 §6.1.2).
 *
 * Visibility rule: visible on every authenticated route whenever the
 * ward store has >=1 patient at alert_level === 'red'. On the critical
 * patient's own page the banner still shows — the clinician needs
 * confirmation that the alarm state they're investigating is still
 * active; the page's own 220 px pulsing score handles the primary
 * attention cue.
 *
 * Dual-action bar: the label is a button that navigates to the patient;
 * the silence button mutes the pulse for 2 min per IEC.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Glyph } from './Glyph'
import { isSilenced, useCriticalPatients } from '@/hooks/useCriticalPatients'
import { useAudio } from '@/hooks/useAudio'

export function CriticalAlertBar() {
  const { critical, silence } = useCriticalPatients()
  const { setMuted } = useAudio()
  const navigate = useNavigate()
  const [, force] = useState(0)

  // Silence window is time-based; re-render once per second so the bar
  // un-silences itself when the 2 min window lapses.
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1_000)
    return () => window.clearInterval(id)
  }, [])

  // Body-level hook so the ward card knows to suppress its own pulse.
  useEffect(() => {
    const top = critical[0]?.patient_id
    if (top) document.body.setAttribute('data-banner-owner', top)
    else document.body.removeAttribute('data-banner-owner')
    return () => document.body.removeAttribute('data-banner-owner')
  }, [critical])

  const featured = critical[0]
  const silenced = featured ? isSilenced(featured.patient_id) : false
  const extras = Math.max(0, critical.length - 1)

  const onOpen = useCallback(() => {
    if (!featured) return
    navigate(`/patient/${encodeURIComponent(featured.patient_id)}`)
  }, [featured, navigate])

  const onSilence = useCallback(() => {
    if (!featured) return
    silence(featured.patient_id)
    setMuted(true)
  }, [featured, silence, setMuted])

  if (!featured) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="alert-banner"
      data-silenced={silenced ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '14px 48px',
        gap: 24,
      }}
    >
      <div
        className={`alert-banner__pulse-overlay ${silenced ? '' : 'pulse-high'}`}
        aria-hidden="true"
      />

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open critical patient ${featured.display_name}, room ${featured.room_number}`}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <Glyph
          shape="triangle"
          size="medium"
          color="var(--critical)"
          pulseClass={silenced ? '' : 'pulse-high'}
          aria-label="Critical"
        />
        <span
          className="uppercase"
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.2em',
            color: 'var(--critical)',
          }}
        >
          Critical
        </span>
        <span
          style={{
            fontSize: 17,
            fontWeight: 500,
            color: 'var(--ink)',
          }}
        >
          {featured.display_name} · Room {featured.room_number}
        </span>
        {extras > 0 ? (
          <span
            className="tabular"
            style={{
              fontSize: 15,
              color: 'var(--ink-soft)',
              fontStyle: 'italic',
              fontFamily: 'var(--serif)',
            }}
          >
            + {extras} more critical
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={onSilence}
        aria-label={silenced ? 'Silenced for 2 minutes' : 'Silence alarm for 2 minutes'}
        disabled={silenced}
        className="uppercase"
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.18em',
          padding: '8px 14px',
          background: silenced ? 'transparent' : 'var(--ink)',
          color: silenced ? 'var(--ink-soft)' : 'var(--bg)',
          border: `1px solid var(--ink)`,
          borderRadius: 3,
          cursor: silenced ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--sans)',
        }}
      >
        {silenced ? 'Silenced' : 'Silence 2 min'}
      </button>
    </div>
  )
}
