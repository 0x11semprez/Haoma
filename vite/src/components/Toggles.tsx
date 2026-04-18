/**
 * Mute + Night toggles. Iconic, no surrounding box — the icon itself is the affordance.
 * Hover/tap micro-interactions via framer-motion (respects prefers-reduced-motion via root MotionConfig).
 */

import { AnimatePresence, motion } from 'framer-motion'
import { useAudio } from '@/hooks/useAudio'
import { useNightMode } from '@/hooks/useNightMode'

const ICON_BUTTON_BASE = {
  position: 'relative',
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
  overflow: 'hidden',
} as const

const ICON_SWAP_SPRING = { type: 'spring' as const, stiffness: 360, damping: 22 }

function SoundOnIcon() {
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
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function SoundOffIcon() {
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
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  )
}

export function MuteToggle() {
  const { muted, setMuted, play } = useAudio()
  return (
    <motion.button
      type="button"
      onClick={() => {
        const next = !muted
        setMuted(next)
        if (!next) play('uiClick')
      }}
      aria-pressed={muted}
      aria-label={muted ? 'Enable sound' : 'Mute sound'}
      whileHover={{ scale: 1.12, color: 'var(--ink)' }}
      whileTap={{ scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      style={ICON_BUTTON_BASE}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={muted ? 'off' : 'on'}
          initial={{ scale: 0.4, opacity: 0, rotate: -40 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.4, opacity: 0, rotate: 40 }}
          transition={ICON_SWAP_SPRING}
          style={{ display: 'inline-flex', lineHeight: 0 }}
        >
          {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}

function SunIcon() {
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
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
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
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function NightToggle() {
  const { night, toggle } = useNightMode()
  const { play } = useAudio()
  return (
    <motion.button
      type="button"
      onClick={() => {
        play('uiClick')
        toggle()
      }}
      aria-pressed={night}
      aria-label={night ? 'Switch to day mode' : 'Switch to night mode'}
      whileHover={{ scale: 1.14, rotate: night ? -22 : 22, color: 'var(--ink)' }}
      whileTap={{ scale: 0.86, rotate: night ? 6 : -6 }}
      transition={{ type: 'spring', stiffness: 320, damping: 16 }}
      style={ICON_BUTTON_BASE}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={night ? 'sun' : 'moon'}
          initial={{ scale: 0.3, opacity: 0, rotate: -90 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.3, opacity: 0, rotate: 90 }}
          transition={ICON_SWAP_SPRING}
          style={{ display: 'inline-flex', lineHeight: 0 }}
        >
          {night ? <SunIcon /> : <MoonIcon />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}
