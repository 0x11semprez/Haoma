/**
 * Haoma audio engine — Web Audio API synthesis.
 *
 * IEC 60601-1-8 alarm signals:
 *   - Critical (high priority): 10 pulses arranged as 2 bursts of 5,
 *     fundamental around 440 Hz with 4 harmonics.
 *   - Watch (medium priority): 3 pulses, fundamental around 330 Hz.
 *   - Stable: single soft chime (used only on recovery).
 *
 * UI sounds are intentionally distinct from alarm timbre so they cannot
 * be confused with a clinical event.
 *
 * No audio files — everything synthesized. No latency, no bundle bloat.
 * Browsers require a user gesture before an AudioContext can start, so
 * the first call is a no-op until the user clicks somewhere.
 */

export type HaomaSound =
  | 'critical'
  | 'watch'
  | 'stable'
  | 'uiClick'
  | 'badgeSuccess'
  | 'transition'

const MUTE_KEY = 'haoma.audio.muted'

interface PulseTrainOptions {
  fundamental: number
  harmonics: number
  pulseMs: number
  gapMs: number
  pulsesPerBurst: number
  bursts: number
  burstGapMs: number
  peakGain: number
}

class HaomaAudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private _muted: boolean

  constructor() {
    this._muted =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(MUTE_KEY) === '1'
  }

  get muted(): boolean {
    return this._muted
  }

  setMuted(muted: boolean): void {
    this._muted = muted
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (muted && this.masterGain && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime)
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime)
    }
  }

  /** Must be invoked from a user gesture (click, keypress) at least once. */
  unlock(): void {
    this.ensureCtx()
  }

  play(sound: HaomaSound): void {
    if (this._muted) return
    const ctx = this.ensureCtx()
    if (!ctx) return

    switch (sound) {
      case 'critical':
        this.playPulseTrain(ctx, {
          fundamental: 440,
          harmonics: 4,
          pulseMs: 130,
          gapMs: 90,
          pulsesPerBurst: 5,
          bursts: 2,
          burstGapMs: 320,
          peakGain: 0.28,
        })
        return
      case 'watch':
        this.playPulseTrain(ctx, {
          fundamental: 330,
          harmonics: 3,
          pulseMs: 160,
          gapMs: 140,
          pulsesPerBurst: 3,
          bursts: 1,
          burstGapMs: 0,
          peakGain: 0.2,
        })
        return
      case 'stable':
        this.playChime(ctx, [523.25, 783.99], {
          durationMs: 320,
          peakGain: 0.09,
          attackMs: 10,
          releaseMs: 280,
        })
        return
      case 'uiClick':
        this.playClick(ctx)
        return
      case 'badgeSuccess':
        this.playArpeggio([523.25, 659.25, 783.99, 1046.5], {
          stepMs: 85,
          toneDurationMs: 260,
          peakGain: 0.11,
        })
        return
      case 'transition':
        this.playWhoosh(ctx, {
          fromHz: 1400,
          toHz: 320,
          durationMs: 340,
          peakGain: 0.11,
        })
        return
    }
  }

  /** Short tactile click — two detuned square oscillators through a lowpass. */
  private playClick(ctx: AudioContext): void {
    if (!this.masterGain) return
    const now = ctx.currentTime
    const duration = 0.06
    const peak = 0.08

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(peak, now + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(4800, now)
    filter.frequency.exponentialRampToValueAtTime(1200, now + duration)
    filter.Q.value = 2

    const fundamentals = [1760, 1768]
    fundamentals.forEach((freq) => {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now)
      osc.frequency.exponentialRampToValueAtTime(freq * 0.6, now + duration)
      osc.connect(filter)
      osc.start(now)
      osc.stop(now + duration + 0.02)
    })
    filter.connect(gain).connect(this.masterGain)
  }

  /** Airy downward pitch-sweep used when navigating between screens. */
  private playWhoosh(
    ctx: AudioContext,
    opts: { fromHz: number; toHz: number; durationMs: number; peakGain: number },
  ): void {
    if (!this.masterGain) return
    const now = ctx.currentTime
    const duration = opts.durationMs / 1000

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(opts.fromHz, now)
    osc.frequency.exponentialRampToValueAtTime(opts.toHz, now + duration)

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.2
    filter.frequency.setValueAtTime(opts.fromHz, now)
    filter.frequency.exponentialRampToValueAtTime(opts.toHz, now + duration)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(opts.peakGain, now + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    osc.connect(filter).connect(gain).connect(this.masterGain)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }

  /** Additive chime — sum of harmonics with a soft bell-like decay. */
  private playChime(
    ctx: AudioContext,
    partials: readonly number[],
    opts: {
      durationMs: number
      peakGain: number
      attackMs: number
      releaseMs: number
    },
  ): void {
    if (!this.masterGain) return
    const now = ctx.currentTime
    const duration = opts.durationMs / 1000
    const attack = opts.attackMs / 1000
    const release = opts.releaseMs / 1000

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(opts.peakGain, now + attack)
    gain.gain.setValueAtTime(opts.peakGain, now + Math.max(0, duration - release))
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    partials.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = i === 0 ? 'triangle' : 'sine'
      osc.frequency.value = freq
      const partialGain = ctx.createGain()
      partialGain.gain.value = 1 / (i + 1.4)
      osc.connect(partialGain).connect(gain)
      osc.start(now)
      osc.stop(now + duration + 0.02)
    })
    gain.connect(this.masterGain)
  }

  /** Rising arpeggio with overlapping chime voices — used for success states. */
  private playArpeggio(
    freqs: readonly number[],
    opts: { stepMs: number; toneDurationMs: number; peakGain: number },
  ): void {
    if (!this.masterGain) return
    freqs.forEach((freq, i) => {
      window.setTimeout(() => {
        if (!this.ctx) return
        this.playChime(this.ctx, [freq, freq * 2], {
          durationMs: opts.toneDurationMs,
          peakGain: opts.peakGain,
          attackMs: 6,
          releaseMs: Math.floor(opts.toneDurationMs * 0.75),
        })
      }, i * opts.stepMs)
    })
  }

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return null
      try {
        this.ctx = new Ctor()
        this.masterGain = this.ctx.createGain()
        this.masterGain.gain.value = 1
        this.masterGain.connect(this.ctx.destination)
      } catch {
        this.ctx = null
        return null
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  private playPulseTrain(ctx: AudioContext, opts: PulseTrainOptions): void {
    if (!this.masterGain) return
    const pulse = (opts.pulseMs + opts.gapMs) / 1000
    let t0 = ctx.currentTime + 0.02
    for (let b = 0; b < opts.bursts; b += 1) {
      for (let i = 0; i < opts.pulsesPerBurst; i += 1) {
        this.schedulePulse(ctx, t0 + i * pulse, opts)
      }
      t0 += opts.pulsesPerBurst * pulse + opts.burstGapMs / 1000
    }
  }

  private schedulePulse(
    ctx: AudioContext,
    startAt: number,
    opts: PulseTrainOptions,
  ): void {
    if (!this.masterGain) return
    const duration = opts.pulseMs / 1000
    const attack = 0.01
    const release = 0.04
    const sustainEnd = startAt + Math.max(0, duration - release)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(opts.peakGain, startAt + attack)
    gain.gain.setValueAtTime(opts.peakGain, sustainEnd)
    gain.gain.linearRampToValueAtTime(0, startAt + duration)
    gain.connect(this.masterGain)

    for (let h = 1; h <= opts.harmonics; h += 1) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = opts.fundamental * h
      const harmonicGain = ctx.createGain()
      harmonicGain.gain.value = 1 / (h * 1.6)
      osc.connect(harmonicGain).connect(gain)
      osc.start(startAt)
      osc.stop(startAt + duration + 0.02)
    }
  }
}

export const haomaAudio = new HaomaAudioEngine()
