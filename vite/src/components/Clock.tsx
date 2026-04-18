/**
 * Ambient clock for the header meta strip.
 *
 * ICU convention: 24-hour clock, tabular digits so the seconds column
 * never jitters. Updates once per second — cheap and always up to date.
 */

import { useEffect, useState } from 'react'

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function Clock() {
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const date = formatDate(now)
  const time = formatTime(now)

  return (
    <div
      className="flex items-center uppercase"
      style={{
        gap: 10,
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '0.18em',
        lineHeight: 1.4,
        color: 'var(--ink-soft)',
      }}
      aria-label={`Current time: ${date}, ${time}`}
    >
      <span>{date}</span>
      <span aria-hidden="true" style={{ color: 'var(--ink-muted)' }}>
        ·
      </span>
      <span className="tabular" style={{ color: 'var(--ink)' }}>
        {time}
      </span>
    </div>
  )
}
