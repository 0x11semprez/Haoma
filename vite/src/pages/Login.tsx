/**
 * Login — `/login`
 * CPS card scan with an Apple-Pay-style half-sheet. Tap the card → a scrim
 * drops, the sheet springs up from the bottom carrying the scan (three
 * pulsing waves + rotating clinical labels: Reading card → Verifying
 * credentials → Authenticating, ~2.4 s) → the waves swap for a green
 * check circle (spring scale-in), the header flips to "Authenticated"
 * in --stable, "Welcome again, {name}" fades up in serif italic, then
 * "Entering ward →" → a full-viewport flash snaps in and hands off to
 * /ward. Keyboard bypass: Shift+D runs the same animation end-to-end.
 *
 * Design system: vite/CLAUDE.md §2 (type), §3 (palette — --stable carries
 * the confirmed identity, triple-encoded with the check glyph + caps label),
 * §4 (glyphs), §5 (motion), §6 (no shadow, radius ≤ 4 px on surfaces — the
 * sheet is a surface, so top corners 4 px, 1 px border, flat scrim fill).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
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

const AUTH_KEY = 'haoma.auth'
const DEMO_BADGE_ID = 'demo-cps-001'

/* Reading phase: three staggered pulse waves at ~466 ms cadence (see
 * .scan-pulse in index.css). 2.4 s = one full wave cycle + the head of
 * the next, enough to read the rhythm without feeling stuck. */
const MIN_SCAN_MS = 2400
/* Reading-phase status labels: rotated in order while the waves pulse,
 * each held for READING_STEP_MS (plus a 300 ms crossfade). Gives the scan
 * a clinical narrative rather than a single static "Reading…" line. */
const READING_LABELS = [
  'Reading card',
  'Verifying credentials',
  'Authenticating',
] as const
const READING_STEP_MS = 800
/* Success beat, staged:
 *   0 ms    → check circle scales in (scan-check-circle, 380 ms)
 *   250 ms  → "Welcome again, {name}" fades up (serif italic)
 *   750 ms  → "Access unlocked" fades up (caps, --stable)
 *   1800 ms → full-viewport flash snaps in (180 ms)
 *   2000 ms → navigate while flash is fully opaque so the route crossfade
 *             happens behind the cover (RootLayout overlay picks it up). */
const FLASH_DELAY_MS = 1800
const NAV_DELAY_MS = 2000

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
  const [flashing, setFlashing] = useState(false)
  const [readingStep, setReadingStep] = useState(0)
  const flashTimer = useRef<number | null>(null)
  const navTimer = useRef<number | null>(null)
  const scanTimer = useRef<number | null>(null)

  useEffect(() => {
    if (getSession()) {
      navigate('/ward', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
      if (navTimer.current !== null) window.clearTimeout(navTimer.current)
      if (scanTimer.current !== null) window.clearTimeout(scanTimer.current)
    }
  }, [])

  // Advance the rotating reading label while scanning. Reset to 0 every
  // time we enter (or leave) the reading state so a retry starts fresh.
  useEffect(() => {
    if (state.kind !== 'reading') {
      setReadingStep(0)
      return
    }
    const id = window.setInterval(() => {
      setReadingStep((s) => Math.min(s + 1, READING_LABELS.length - 1))
    }, READING_STEP_MS)
    return () => window.clearInterval(id)
  }, [state.kind])

  const completeAndNavigate = useCallback(
    (name: string) => {
      setState({ kind: 'success', name })
      play('badgeSuccess')
      flashTimer.current = window.setTimeout(() => {
        setFlashing(true)
      }, FLASH_DELAY_MS)
      navTimer.current = window.setTimeout(() => {
        // Hand the cover off to the RootLayout overlay so it survives
        // the /login → /ward unmount. Without this flag, Login's local
        // flash unmounts one frame before Ward paints = visible pop.
        try {
          sessionStorage.setItem('haoma.authWipe', '1')
        } catch {
          /* sessionStorage disabled — soft-fail, local flash still covers most of it */
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

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (!ev.shiftKey) return
      if (ev.key !== 'D' && ev.key !== 'd') return
      if (state.kind !== 'idle' && state.kind !== 'error') return
      ev.preventDefault()
      const session = buildDemoSession()
      try {
        localStorage.setItem(AUTH_KEY, JSON.stringify(session))
      } catch {
        /* localStorage disabled — silent fallback */
      }
      unlock()
      play('uiClick')
      // Shift+D replays the full scan animation — same rhythm as a real
      // badge tap, but skips the network call and drops straight into the
      // success beat once MIN_SCAN_MS elapses.
      setState({ kind: 'reading' })
      scanTimer.current = window.setTimeout(() => {
        completeAndNavigate(session.clinician_name)
      }, MIN_SCAN_MS)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [completeAndNavigate, play, state.kind, unlock])

  const handleRetry = useCallback(() => {
    setState({ kind: 'idle' })
  }, [])

  const isReading = state.kind === 'reading'
  const isSuccess = state.kind === 'success'
  const isError = state.kind === 'error'
  const disabled = isReading || isSuccess

  const cardStroke = isError ? 'var(--critical)' : 'var(--ink)'

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
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 15,
              fontWeight: 500,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: 'var(--ink-soft)',
            }}
          >
            Identification
          </div>

          <h1
            style={{
              marginTop: 24,
              marginBottom: 0,
              fontFamily: 'var(--serif)',
              fontSize: 'clamp(80px, 10.5vw, 148px)',
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
              marginTop: 28,
              marginBottom: 0,
              fontFamily: 'var(--sans)',
              fontSize: 20,
              fontWeight: 400,
              lineHeight: 1.3,
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
              marginTop: 40,
              width: 320,
              height: 320,
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
            {/* Stylised CPS card — static anchor. Auth progress (pulses,
             * check circle, welcome) happens in the half-sheet rising from
             * the bottom, not on the card itself, so the illustration stays
             * put throughout reading → success to ground the tap gesture. */}
            <svg
              width={156}
              height={104}
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
                    top: 70,
                    right: 70,
                    width: 36,
                    height: 36,
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
      </section>

      {/* ── Authentication half-sheet ───────────────────────────────────
       * Rises from the bottom as soon as the reader engages. Carries the
       * full auth narrative: scanning waves → check circle, rotating
       * clinical labels → "Welcome again, {name}" + "Entering ward".
       * Design-system compliant: 4 px radius, 1 px border, flat bg, no
       * shadow/gradient (§6). The scrim is a flat fill, not a gradient. */}
      <AnimatePresence>
        {(isReading || isSuccess) && (
          <>
            <motion.div
              key="auth-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden="true"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(12, 10, 8, 0.46)',
                zIndex: 4,
              }}
            />
            <motion.aside
              key="auth-sheet"
              initial={{ y: '115%', x: '-50%' }}
              animate={{ y: 0, x: '-50%' }}
              exit={{ y: '115%', x: '-50%', opacity: 0 }}
              transition={{
                type: 'spring',
                stiffness: 260,
                damping: 30,
                mass: 0.9,
              }}
              role="status"
              aria-live="polite"
              aria-label={isSuccess ? 'Authenticated' : 'Authenticating'}
              style={{
                position: 'fixed',
                left: '50%',
                bottom: 0,
                // Horizontal centering is threaded through the x prop above
                // so framer-motion's transform management doesn't clobber it.
                width: 'min(560px, calc(100vw - 24px))',
                background: 'var(--bg)',
                borderTop: '1px solid var(--line)',
                borderLeft: '1px solid var(--line)',
                borderRight: '1px solid var(--line)',
                borderRadius: '4px 4px 0 0',
                padding: '36px 44px 44px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 20,
                zIndex: 5,
              }}
            >
              {/* Handle — thin grabber line anchored to the top edge */}
              <div
                aria-hidden="true"
                style={{
                  width: 56,
                  height: 3,
                  background: 'var(--line)',
                  borderRadius: 2,
                  marginTop: -16,
                }}
              />

              {/* Caps header — crossfades between states, picks up --stable
               * color on success to reinforce the clinical OK signal. */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={isSuccess ? 'header-done' : 'header-progress'}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.24 }}
                  style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: '0.28em',
                    textTransform: 'uppercase',
                    color: isSuccess ? 'var(--stable)' : 'var(--ink-soft)',
                  }}
                >
                  {isSuccess ? 'Authenticated' : 'Authentication'}
                </motion.div>
              </AnimatePresence>

              {/* Visual center — pulse stack swaps for the check circle on
               * success with a spring scale-in for that snappy Apple beat. */}
              <div style={{ position: 'relative', width: 128, height: 128 }}>
                <AnimatePresence mode="wait" initial={false}>
                  {isReading ? (
                    <motion.div
                      key="pulses"
                      initial={{ opacity: 0, scale: 0.86 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.86 }}
                      transition={{ duration: 0.26 }}
                      style={{ position: 'absolute', inset: 0 }}
                    >
                      <svg
                        className="scan-pulse-stack"
                        width={128}
                        height={128}
                        viewBox="0 0 200 200"
                        aria-hidden="true"
                      >
                        <circle className="scan-pulse scan-pulse--1" cx={100} cy={100} r={34} />
                        <circle className="scan-pulse scan-pulse--2" cx={100} cy={100} r={34} />
                        <circle className="scan-pulse scan-pulse--3" cx={100} cy={100} r={34} />
                        <circle cx={100} cy={100} r={10} fill="var(--ink)" />
                      </svg>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="check"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 320,
                        damping: 22,
                        mass: 0.7,
                      }}
                      style={{ position: 'absolute', inset: 0 }}
                    >
                      <svg
                        width={128}
                        height={128}
                        viewBox="0 0 100 100"
                        aria-hidden="true"
                        overflow="visible"
                      >
                        <circle cx={50} cy={50} r={42} fill="var(--stable)" />
                        <path
                          className="scan-check-path"
                          d="M32 52 L45 65 L70 38"
                          fill="none"
                          stroke="var(--bg)"
                          strokeWidth={6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Text region — fixed height so the sheet doesn't twitch on
               * the reading → success swap. */}
              <div
                style={{
                  minHeight: 104,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isReading ? (
                    <motion.div
                      key="reading-labels"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        position: 'relative',
                        height: 28,
                        minWidth: 320,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={readingStep}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{
                            duration: 0.3,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          style={{
                            position: 'absolute',
                            fontFamily: 'var(--sans)',
                            fontSize: 15,
                            fontWeight: 500,
                            letterSpacing: '0.28em',
                            textTransform: 'uppercase',
                            color: 'var(--ink-soft)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {READING_LABELS[readingStep]}
                        </motion.div>
                      </AnimatePresence>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="success-labels"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 14,
                      }}
                    >
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.5,
                          delay: 0.15,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        style={{
                          fontFamily: 'var(--serif)',
                          fontStyle: 'italic',
                          fontSize: 32,
                          lineHeight: 1.05,
                          letterSpacing: '-0.02em',
                          color: 'var(--ink)',
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Welcome again, {isSuccess ? state.name : ''}
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.4,
                          delay: 0.7,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 10,
                          fontFamily: 'var(--sans)',
                          fontSize: 13,
                          fontWeight: 500,
                          letterSpacing: '0.28em',
                          textTransform: 'uppercase',
                          color: 'var(--ink-soft)',
                        }}
                      >
                        <span>Entering ward</span>
                        <span aria-hidden="true">→</span>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Bright snap-in flash — fires after the check has been held long
       * enough to register, then hands the cover off to the RootLayout
       * overlay (haoma.authWipe) which persists across the /ward mount. */}
      {flashing && <div className="scan-bright-flash" aria-hidden="true" />}
    </main>
  )
}
