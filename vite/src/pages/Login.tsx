/**
 * Login — `/login`
 * CPS card scan, single-surface version. Tap the card → a thin vertical
 * beam sweeps across the illustration once (~1.1 s). On success the card
 * stroke crossfades to --stable, a filled ✓ badge springs in at the
 * top-right corner, and "Welcome again, {name}" fades up in serif italic
 * below — then a full-viewport flash snaps in and hands off to /ward.
 * On failure the stroke flips to --critical and the existing ▲ triangle
 * badge appears with an inline retry. Keyboard bypass: Shift+D runs the
 * same animation end-to-end.
 *
 * Design system: vite/CLAUDE.md §2 (type), §3 (palette — --stable carries
 * the confirmed identity, triple-encoded with the ✓ glyph + welcome line;
 * --critical + ▲ glyph + retry text on failure), §4 (glyphs), §5 (motion),
 * §6 (no shadow, flat surfaces — the scan lives on the card itself, no
 * modal, no scrim).
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { MuteToggle, NightToggle } from '@/components/Toggles'
import { Glyph } from '@/components/Glyph'
import { useAudio } from '@/hooks/useAudio'
import { authenticateBadge, getSession, HaomaApiError } from '@/lib/api'
import type { AuthSession } from '@/types/ui'

type LoginState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'success'; name: string }
  | { kind: 'error'; message: string; backendDown: boolean }

type LoginView = 'card' | 'credentials'

const AUTH_KEY = 'haoma.auth'
const DEMO_BADGE_ID = 'demo-cps-001'

/* Reading phase: a thin vertical beam sweeps across the card in three
 * passes (L→R→L→R) to read as a deliberate round-trip scan. Must match
 * .card-scan-line animation duration in index.css. */
const MIN_SCAN_MS = 2000
/* Success beat, staged:
 *   0 ms    → card stroke crossfades to --stable (SVG transition, 200 ms)
 *   50 ms   → ✓ badge springs in (scan-check-pop, 380 ms)
 *   250 ms  → "Welcome again, {name}" fades up (serif italic, peaks ~750 ms)
 *   1000 ms → enter `departing` — page content fades to 0 while a fixed
 *             ✓ seal springs in at viewport centre (the card's corner ✓
 *             disappears with the content; the new one reads as the same
 *             badge "jumping" off the page)
 *   1500 ms → seal's disc scales up (35×) to cover the viewport; the ✓
 *             path fades out so the final cover is a solid --stable field
 *   1950 ms → navigate behind the opaque cover; RootLayout's iris-
 *             contraction overlay picks up the handoff in --stable. */
const WELCOME_HOLD_MS = 1000
const SEAL_POP_MS = 1100
const DOTS_EXIT_MS = 240
const SEAL_COVER_MS = 450
const NAV_DELAY_MS =
  WELCOME_HOLD_MS + SEAL_POP_MS + DOTS_EXIT_MS + SEAL_COVER_MS

function buildDemoSession(): AuthSession {
  return {
    token: 'demo-bypass',
    clinician_name: 'Dr. Elena Reyes',
    role: 'attending',
    expires_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
  }
}

export function LoginPage() {
  const navigate = useNavigate()
  const { play, unlock } = useAudio()
  const [state, setState] = useState<LoginState>({ kind: 'idle' })
  const [departing, setDeparting] = useState(false)
  const [sealStage, setSealStage] = useState<'pop' | 'cover'>('pop')
  const [view, setView] = useState<LoginView>('card')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const departTimer = useRef<number | null>(null)
  const coverTimer = useRef<number | null>(null)
  const navTimer = useRef<number | null>(null)
  const scanTimer = useRef<number | null>(null)

  useEffect(() => {
    if (getSession()) {
      navigate('/ward', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    return () => {
      if (departTimer.current !== null) window.clearTimeout(departTimer.current)
      if (coverTimer.current !== null) window.clearTimeout(coverTimer.current)
      if (navTimer.current !== null) window.clearTimeout(navTimer.current)
      if (scanTimer.current !== null) window.clearTimeout(scanTimer.current)
    }
  }, [])

  const completeAndNavigate = useCallback(
    (name: string) => {
      setState({ kind: 'success', name })
      // Sound peaks within ~20 ms of trigger; the check circle's spring
      // scale-in peaks ~150 ms in. Delay the chime so audio + visual land
      // together — otherwise the eye sees the check after the ear hears it.
      window.setTimeout(() => play('badgeSuccess'), 140)
      // Stage 1 — after the welcome hold, fade the page content and
      // pop the centered ✓ seal.
      departTimer.current = window.setTimeout(() => {
        setDeparting(true)
      }, WELCOME_HOLD_MS)
      // Stage 2 — once the pop settles, scale the disc up to cover the
      // viewport. The ✓ fades during this stage so the final cover is a
      // clean --stable field.
      coverTimer.current = window.setTimeout(() => {
        setSealStage('cover')
      }, WELCOME_HOLD_MS + SEAL_POP_MS)
      // Stage 3 — navigate behind the opaque cover. Hand the colour off
      // to RootLayout so its contraction overlay matches the seal.
      navTimer.current = window.setTimeout(() => {
        try {
          sessionStorage.setItem('haoma.authWipe', '1')
        } catch {
          /* sessionStorage disabled — soft-fail, local cover still holds */
        }
        navigate('/ward')
      }, NAV_DELAY_MS)
    },
    [navigate, play],
  )

  const handleBadgeTap = useCallback(async () => {
    if (state.kind === 'reading' || state.kind === 'success') return
    unlock()
    play('uiClick')
    setState({ kind: 'reading' })
    const minScan = new Promise((r) => setTimeout(r, MIN_SCAN_MS))
    try {
      const session = await authenticateBadge(DEMO_BADGE_ID)
      await minScan
      completeAndNavigate(session.clinician_name)
    } catch (err) {
      // Let the beam finish its pass before the card flips to --critical,
      // otherwise the sweep would cut mid-motion and read as a glitch.
      await minScan
      if (err instanceof HaomaApiError) {
        const backendDown = err.status === 0 || err.status === 404
        const message = backendDown
          ? 'Authentication service unavailable. Press Shift+D for the demo.'
          : err.message
        setState({ kind: 'error', message, backendDown })
      } else {
        setState({
          kind: 'error',
          message:
            'Authentication service unavailable. Press Shift+D for the demo.',
          backendDown: true,
        })
      }
    }
  }, [completeAndNavigate, play, state.kind, unlock])

  // Credential bypass — used by Shift+D, the credentials form and the
  // fallback button. Replays the full scan animation so the fallback
  // feels like a real auth path, not a teleport.
  const runCredentialBypass = useCallback(() => {
    if (state.kind !== 'idle' && state.kind !== 'error') return
    const session = buildDemoSession()
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(session))
    } catch {
      /* localStorage disabled — silent fallback */
    }
    unlock()
    play('uiClick')
    setState({ kind: 'reading' })
    scanTimer.current = window.setTimeout(() => {
      completeAndNavigate(session.clinician_name)
    }, MIN_SCAN_MS)
  }, [completeAndNavigate, play, state.kind, unlock])

  const handleCredentialSubmit = useCallback(
    (ev: FormEvent<HTMLFormElement>) => {
      ev.preventDefault()
      if (!email.trim() || !password) return
      runCredentialBypass()
    },
    [email, password, runCredentialBypass],
  )

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (!ev.shiftKey) return
      if (ev.key !== 'D' && ev.key !== 'd') return
      if (state.kind !== 'idle' && state.kind !== 'error') return
      ev.preventDefault()
      runCredentialBypass()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [runCredentialBypass, state.kind])

  const handleRetry = useCallback(() => {
    setState({ kind: 'idle' })
  }, [])

  const isReading = state.kind === 'reading'
  const isSuccess = state.kind === 'success'
  const isError = state.kind === 'error'
  const disabled = isReading || isSuccess

  // Card stroke follows the clinical state (triple-encoded with the
  // overlaid glyph + below-card text). SVG has a 200 ms `stroke`
  // transition so the flip feels continuous with the beam finishing.
  const cardStroke = isSuccess
    ? 'var(--stable)'
    : isError
      ? 'var(--critical)'
      : 'var(--ink)'

  return (
    <main
      style={{
        minHeight: '100svh',
        background: 'var(--bg)',
        color: 'var(--ink)',
        display: 'flex',
        flexDirection: 'column',
        padding: '32px 48px',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <motion.div
          whileHover={{ scale: 1.12, color: 'var(--ink)' }}
          whileTap={{ scale: 0.88 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18 }}
          style={{
            display: 'inline-flex',
            color: 'var(--ink-soft)',
            borderRadius: 999,
          }}
        >
          <Link
            to="/"
            aria-label="Back"
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 22,
              lineHeight: 1,
              color: 'inherit',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              padding: 6,
            }}
          >
            <span aria-hidden="true">←</span>
          </Link>
        </motion.div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NightToggle />
          <MuteToggle />
        </div>
      </header>

      <section
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0,
          position: 'relative',
          zIndex: 2,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: departing ? 0 : 1, y: 0 }}
          transition={
            departing
              ? { duration: 0.3, ease: [0.22, 1, 0.36, 1] }
              : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
          }
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
          {view === 'card' && (
          <motion.div
            key="card-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
            }}
          >
          <h1
            style={{
              marginTop: 0,
              marginBottom: 0,
              fontFamily: 'var(--serif)',
              fontSize: 'clamp(96px, 12.5vw, 180px)',
              fontStyle: 'italic',
              fontWeight: 400,
              lineHeight: 0.98,
              letterSpacing: '-0.035em',
              color: 'var(--ink)',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            Tap your CPS card
          </h1>

          <p
            style={{
              marginTop: 32,
              marginBottom: 0,
              fontFamily: 'var(--sans)',
              fontSize: 22,
              fontWeight: 400,
              lineHeight: 1.35,
              color: 'var(--ink-soft)',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            Place your professional health card on the reader to access the
            ward monitoring dashboard.
          </p>

          <button
            type="button"
            onClick={handleBadgeTap}
            disabled={disabled}
            aria-label="Scan CPS card"
            aria-busy={isReading}
            style={{
              marginTop: 48,
              width: 420,
              height: 420,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: disabled ? 'default' : 'pointer',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
            }}
          >
            {/* Stylised CPS card — static anchor. The scan beam + result
             * badge (✓ / ▲) animate on top of the card illustration, which
             * itself stays put so the tap gesture has a single clear focus. */}
            <svg
              width={220}
              height={146}
              viewBox="0 0 112 76"
              style={{ position: 'absolute' }}
              aria-hidden="true"
            >
              <rect
                x={1}
                y={1}
                width={110}
                height={74}
                rx={6}
                ry={6}
                fill="none"
                stroke={cardStroke}
                strokeWidth={1.5}
                style={{ transition: 'stroke 200ms ease' }}
              />
              {/* Chip */}
              <rect
                x={14}
                y={18}
                width={22}
                height={16}
                rx={2}
                ry={2}
                fill="none"
                stroke={cardStroke}
                strokeWidth={1.25}
                style={{ transition: 'stroke 200ms ease' }}
              />
              <line
                x1={14}
                y1={26}
                x2={36}
                y2={26}
                stroke={cardStroke}
                strokeWidth={1.25}
              />
              {/* Embossed lines */}
              <line x1={50} y1={22} x2={96} y2={22} stroke={cardStroke} strokeWidth={1} opacity={0.5} />
              <line x1={50} y1={30} x2={82} y2={30} stroke={cardStroke} strokeWidth={1} opacity={0.5} />
              <line x1={14} y1={54} x2={98} y2={54} stroke={cardStroke} strokeWidth={1} opacity={0.35} />
              <line x1={14} y1={62} x2={74} y2={62} stroke={cardStroke} strokeWidth={1} opacity={0.35} />
            </svg>

            {/* Scan beam — single horizontal pass across the card while
             * the backend is checked. Purely decorative (aria-hidden);
             * the aria-busy on the button announces the scan state. */}
            {isReading && <div className="card-scan-line" aria-hidden="true" />}

            {/* Success badge — filled --stable disc with a drawn ✓, seated
             * at the top-right corner of the card (same anchor as the
             * error ▲ so the two states share a visual axis). */}
            <AnimatePresence>
              {isSuccess && (
                <motion.div
                  key="ok"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: 'absolute',
                    top: 98,
                    right: 88,
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'var(--bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    className="scan-check-circle"
                    width={44}
                    height={44}
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                  >
                    <circle cx={50} cy={50} r={42} fill="var(--stable)" />
                    <path
                      className="scan-check-path"
                      d="M32 52 L45 65 L70 38"
                      fill="none"
                      stroke="var(--bg)"
                      strokeWidth={8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error badge — triangle, off-center on the card corner */}
            <AnimatePresence>
              {isError && (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    position: 'absolute',
                    top: 98,
                    right: 88,
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'var(--bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Glyph shape="triangle" size="medium" color="var(--critical)" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>

          <div
            style={{
              marginTop: 48,
              minHeight: 64,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              maxWidth: 480,
            }}
            aria-live="polite"
            role="status"
          >
            <AnimatePresence mode="wait" initial={false}>
              {isSuccess && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 0.5,
                    delay: 0.25,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{
                    fontFamily: 'var(--serif)',
                    fontStyle: 'italic',
                    fontSize: 40,
                    lineHeight: 1.05,
                    letterSpacing: '-0.02em',
                    color: 'var(--ink)',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Welcome again, {state.name}
                </motion.div>
              )}
              {isError && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontFamily: 'var(--sans)',
                      fontSize: 17,
                      color: 'var(--critical)',
                      textAlign: 'center',
                    }}
                  >
                    <Glyph
                      shape="triangle"
                      size="medium"
                      color="var(--critical)"
                      aria-label="Failure"
                    />
                    <span>Identification failed</span>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--sans)',
                      fontSize: 15,
                      color: 'var(--ink-soft)',
                      textAlign: 'center',
                      lineHeight: 1.4,
                    }}
                  >
                    {state.message}
                  </div>
                  <button
                    type="button"
                    onClick={handleRetry}
                    style={{
                      marginTop: 4,
                      padding: '8px 16px',
                      fontFamily: 'var(--sans)',
                      fontSize: 15,
                      fontWeight: 400,
                      letterSpacing: '0.02em',
                      color: 'var(--ink)',
                      background: 'transparent',
                      border: '1px solid var(--line)',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--ink)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--line)'
                    }}
                  >
                    Retry
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </motion.div>
          )}

          {view === 'credentials' && (
          <motion.div
            key="credentials-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <h1
              style={{
                marginTop: 0,
                marginBottom: 0,
                fontFamily: 'var(--serif)',
                fontSize: 'clamp(96px, 12.5vw, 180px)',
                fontStyle: 'italic',
                fontWeight: 400,
                lineHeight: 0.98,
                letterSpacing: '-0.035em',
                color: 'var(--ink)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              Sign in
            </h1>

            <p
              style={{
                marginTop: 32,
                marginBottom: 0,
                fontFamily: 'var(--sans)',
                fontSize: 22,
                fontWeight: 400,
                lineHeight: 1.35,
                color: 'var(--ink-soft)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              Enter your clinician credentials to access the ward.
            </p>

            <form
              onSubmit={handleCredentialSubmit}
              style={{
                marginTop: 48,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 28,
                width: 'min(420px, 100%)',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-soft)',
                  }}
                >
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="doctor@hospital.fr"
                  disabled={disabled}
                  className="login-field"
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-soft)',
                  }}
                >
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={disabled}
                  className="login-field"
                />
              </label>

              <div
                style={{
                  marginTop: 16,
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <button
                  type="submit"
                  disabled={disabled}
                  className="enter-btn"
                >
                  <span className="enter-btn-label enter-btn-label-idle">
                    Continue
                  </span>
                  <span className="enter-btn-label enter-btn-label-hover">
                    Enter →
                  </span>
                </button>
              </div>
            </form>
          </motion.div>
          )}
          </AnimatePresence>

          {view === 'credentials' && (
            <button
              type="button"
              onClick={() => setView('card')}
              disabled={disabled}
              style={{
                marginTop: 48,
                padding: '8px 4px',
                background: 'transparent',
                border: 'none',
                cursor: disabled ? 'default' : 'pointer',
                fontFamily: 'var(--sans)',
                fontSize: 15,
                fontWeight: 400,
                letterSpacing: '0.01em',
                color: 'var(--ink-soft)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                opacity: disabled ? 0.4 : 1,
                transition: 'color 180ms ease, opacity 180ms ease',
              }}
              onMouseEnter={(e) => {
                if (disabled) return
                e.currentTarget.style.color = 'var(--ink)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--ink-soft)'
              }}
            >
              <span aria-hidden="true">←</span>
              <span
                style={{
                  textDecoration: 'underline',
                  textUnderlineOffset: 4,
                  textDecorationThickness: 1,
                }}
              >
                Use your CPS card instead
              </span>
            </button>
          )}

          {view === 'card' && (
            <button
              type="button"
              onClick={() => setView('credentials')}
              disabled={disabled}
              style={{
                marginTop: 56,
                padding: '8px 4px',
                background: 'transparent',
                border: 'none',
                cursor: disabled ? 'default' : 'pointer',
                fontFamily: 'var(--sans)',
                fontSize: 15,
                fontWeight: 400,
                letterSpacing: '0.01em',
                color: 'var(--ink-soft)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                opacity: disabled ? 0.4 : 1,
                transition: 'color 180ms ease, opacity 180ms ease',
              }}
              onMouseEnter={(e) => {
                if (disabled) return
                e.currentTarget.style.color = 'var(--ink)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--ink-soft)'
              }}
            >
              <span>Forgot your card?</span>
              <span aria-hidden="true" style={{ color: 'var(--ink-muted)' }}>
                —
              </span>
              <span
                style={{
                  textDecoration: 'underline',
                  textUnderlineOffset: 4,
                  textDecorationThickness: 1,
                }}
              >
                Sign in with credentials
              </span>
            </button>
          )}
        </motion.div>
      </section>

      {/* Auth seal — the ✓ "jumps" off the page. Two stacked layers so
       * the disc and the ✓ path can animate independently: the disc
       * pops in (spring), holds, then scales up 35× to cover the
       * viewport; the ✓ path pops with it and fades during the cover
       * stage so the final field is a clean --stable colour. Handoff to
       * RootLayout's wipe-hold (same --stable via `haoma.wipeColor`)
       * keeps the seam invisible across the /login → /ward unmount. */}
      {departing && (
        <>
          <AnimatePresence>
          {sealStage === 'pop' && (
          <motion.div
            key="seal-dots"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 22,
              mass: 0.8,
              delay: 0.04,
            }}
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              marginLeft: -60,
              marginTop: -60,
              width: 120,
              height: 120,
              display: 'flex',
              gap: 14,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 51,
              pointerEvents: 'none',
            }}
          >
            {/* Three loading dots, staggered pulse — reads as "entering
             * the ward, final handshake" rather than a static confirm
             * mark. Each dot runs an opacity+scale loop; the 160 ms
             * stagger between them gives the classic "…" cadence. */}
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                initial={{ y: 0 }}
                animate={{ y: [0, -18, 0] }}
                transition={{
                  duration: 0.9,
                  delay: i * 0.15,
                  repeat: Infinity,
                  ease: [0.3, 0, 0.35, 1],
                }}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: 'var(--stable)',
                }}
              />
            ))}
          </motion.div>
          )}
          </AnimatePresence>
          {/* Iris cover — radial clip-path expansion from the viewport
           * centre. Fires after DOTS_EXIT_MS so the dots have time to
           * drop off the bottom first, giving the iris a cleaner
           * entrance. Handoff to RootLayout wipe-hold (same --bg,
           * circle 150%) is seamless. */}
          {sealStage === 'cover' && (
            <motion.div
              key="seal-iris"
              initial={{ clipPath: 'circle(0 at 50% 50%)' }}
              animate={{ clipPath: 'circle(150% at 50% 50%)' }}
              transition={{
                duration: SEAL_COVER_MS / 1000,
                delay: DOTS_EXIT_MS / 1000,
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
      )}
    </main>
  )
}
