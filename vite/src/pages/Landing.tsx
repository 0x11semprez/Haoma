/**
 * Landing — `/`
 * Sober entry screen. Wordmark cycles through the mission statement every 10s
 * with a single premium horizontal fade.
 */

import { useEffect, useState } from 'react'
import type { Variants } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { MuteToggle, NightToggle } from '@/components/Toggles'
import { useAudio } from '@/hooks/useAudio'

const FADE_HORIZONTAL: Variants = {
  initial: { opacity: 0, x: '-6%' },
  animate: {
    opacity: 1,
    x: '0%',
    transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    x: '6%',
    transition: { duration: 0.6, ease: [0.55, 0, 0.7, 0.4] },
  },
}

const HERO_PHRASES: readonly string[] = [
  'haoma',
  'Save every child',
  'See the silent collapse',
  'Hours before vital signs',
]

const ROTATION_MS = 10000

export function LandingPage() {
  const navigate = useNavigate()
  const { play, unlock } = useAudio()
  const [phraseIndex, setPhraseIndex] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setPhraseIndex((i) => (i + 1) % HERO_PHRASES.length)
    }, ROTATION_MS)
    return () => window.clearInterval(id)
  }, [])

  const text = HERO_PHRASES[phraseIndex]

  const handleEnter = () => {
    unlock()
    play('transition')
    navigate('/login')
  }

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
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <NightToggle />
        <MuteToggle />
      </header>

      <section
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.h1
            key={text}
            className="font-serif"
            variants={FADE_HORIZONTAL}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 'clamp(5rem, 18vw, 24rem)',
              lineHeight: 0.9,
              letterSpacing: '-0.04em',
              color: 'var(--ink)',
              fontWeight: 400,
              margin: 0,
              maxWidth: '94vw',
              textAlign: 'center',
              wordBreak: 'break-word',
              willChange: 'transform, opacity, filter',
            }}
          >
            {text}
          </motion.h1>
        </AnimatePresence>
      </section>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        style={{
          display: 'flex',
          justifyContent: 'center',
          paddingBottom: 24,
        }}
      >
        <button
          type="button"
          onClick={handleEnter}
          className="enter-btn"
        >
          <span className="enter-btn-label enter-btn-label-idle">
            Enter in your Workspace
          </span>
          <span className="enter-btn-label enter-btn-label-hover">
            Step inside →
          </span>
        </button>
      </motion.div>
    </main>
  )
}
