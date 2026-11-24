/**
 * Adaptive Web Audio Score + Procedural 3D Foley Engine for FERRUM Interactive 3D Cinema:
 * - Drives dual buses: Adaptive 5-Act Musical Score (`musicBusGain`) + Interactive 3D Foley SFX (`sfxBusGain`)
 * - Synthesizes distinct tactile Foley cues per scene: Curtain Tear, Iron Barbell Clank,
 *   Golden Portal Swell, Pillar Shatter Rumble, Stair Footstep Echo, Shockwave, and UI Click.
 */

export type SoundAct = 0 | 1 | 2 | 3 | 4

export const ACT_LABELS: Record<SoundAct, string> = {
  0: 'I · Chỉ trỏ',
  1: 'II · Bế tắc',
  2: 'III · Mở App',
  3: 'IV · Bứt phá',
  4: 'V · Lột xác',
}

interface ChordVoicing {
  bass: number
  notes: number[]
}

// Dm9 -> Bbmaj7 -> Gm7 -> A7sus4 (melancholic minor acts I-II)
const SAD_CHORDS: ChordVoicing[] = [
  { bass: 73.42, notes: [293.66, 349.23, 440.0, 659.25] },
  { bass: 58.27, notes: [233.08, 349.23, 440.0, 523.25] },
  { bass: 98.0, notes: [293.66, 349.23, 466.16, 587.33] },
  { bass: 55.0, notes: [220.0, 293.66, 392.0, 659.25] },
]

// Fmaj7 -> Cmaj7 -> G6 -> Am9 (warm amber breakthrough & disciplined transformation acts III-V)
const BRIGHT_CHORDS: ChordVoicing[] = [
  { bass: 87.31, notes: [261.63, 329.63, 392.0, 523.25] },
  { bass: 65.41, notes: [261.63, 329.63, 493.88, 587.33] },
  { bass: 98.0, notes: [246.94, 329.63, 440.0, 587.33] },
  { bass: 55.0, notes: [261.63, 329.63, 440.0, 493.88] },
]

export interface SoundState {
  enabled: boolean
  muted: boolean
  volume: number
  sfxLevel: number
  musicLevel: number
  act: SoundAct
}

type Listener = (s: SoundState) => void

class FerrumSoundEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private sfxBusGain: GainNode | null = null
  private musicBusGain: GainNode | null = null
  private reverbNode: ConvolverNode | null = null
  private scoreFilter: BiquadFilterNode | null = null
  private scoreGain: GainNode | null = null
  private droneOsc: OscillatorNode | null = null
  private droneGain: GainNode | null = null
  private murmurSource: AudioBufferSourceNode | null = null
  private murmurGain: GainNode | null = null

  private timerId: number | null = null
  private step = 0
  private enabled = false
  private muted = false
  private volume = 0.85
  private sfxLevel = 0.85
  private musicLevel = 0.55
  private act: SoundAct = 0
  private listeners = new Set<Listener>()
  private visibilityBound = false
  private noiseBuffer: AudioBuffer | null = null

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.getState())
    return () => {
      this.listeners.delete(fn)
    }
  }

  getState(): SoundState {
    return {
      enabled: this.enabled,
      muted: this.muted,
      volume: this.volume,
      sfxLevel: this.sfxLevel,
      musicLevel: this.musicLevel,
      act: this.act,
    }
  }

  private emit(): void {
    const snap = this.getState()
    this.listeners.forEach((fn) => fn(snap))
  }

  async enable(): Promise<boolean> {
    if (typeof window === 'undefined') return false
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return false
      this.ctx = new AC()
      this.buildGraph()
      this.startLoop()
      this.bindVisibility()
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume().catch(() => {})
    }
    this.enabled = true
    this.muted = false
    this.applyActParameters(true)
    this.emit()
    return true
  }

  async toggle(): Promise<void> {
    if (!this.enabled) {
      await this.enable()
      return
    }
    this.muted = !this.muted
    if (this.ctx && this.masterGain) {
      const target = this.muted ? 0 : this.volume
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08)
    }
    this.emit()
  }

  setVolume(val: number): void {
    this.volume = Math.max(0, Math.min(1, val))
    if (this.muted && this.volume > 0) this.muted = false
    if (this.ctx && this.masterGain && this.enabled) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.06)
    }
    this.emit()
  }

  setMusicLevel(val: number): void {
    this.musicLevel = Math.max(0, Math.min(1, val))
    if (this.ctx && this.musicBusGain && this.enabled) {
      this.musicBusGain.gain.setTargetAtTime(this.musicLevel, this.ctx.currentTime, 0.08)
    }
    this.emit()
  }

  setSfxLevel(val: number): void {
    this.sfxLevel = Math.max(0, Math.min(1, val))
    if (this.ctx && this.sfxBusGain && this.enabled) {
      this.sfxBusGain.gain.setTargetAtTime(this.sfxLevel, this.ctx.currentTime, 0.08)
    }
    this.emit()
  }

  setAct(nextAct: SoundAct): void {
    if (this.act === nextAct) return
    const prev = this.act
    this.act = nextAct
    if (this.enabled && !this.muted && this.ctx) {
      this.applyActParameters(false)
      if (nextAct > prev) {
        if (nextAct === 1) this.playIronClank()
        else if (nextAct === 2) this.playGoldenPortal()
        else if (nextAct === 3) {
          this.playKineticSlash()
          this.playShatterRumble()
        } else if (nextAct === 4) {
          this.playDaylightBloom()
          this.playFootstepEcho()
        }
      }
    }
    this.emit()
  }

  private buildGraph(): void {
    const ctx = this.ctx
    if (!ctx) return

    this.compressor = ctx.createDynamicsCompressor()
    this.compressor.threshold.value = -14
    this.compressor.knee.value = 16
    this.compressor.ratio.value = 4

    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = 0

    this.sfxBusGain = ctx.createGain()
    this.sfxBusGain.gain.value = this.sfxLevel

    this.musicBusGain = ctx.createGain()
    this.musicBusGain.gain.value = this.musicLevel

    this.scoreFilter = ctx.createBiquadFilter()
    this.scoreFilter.type = 'lowpass'
    this.scoreFilter.frequency.value = 820
    this.scoreFilter.Q.value = 0.8

    this.scoreGain = ctx.createGain()
    this.scoreGain.gain.value = 0.78

    this.reverbNode = ctx.createConvolver()
    this.reverbNode.buffer = this.createImpulseResponse(ctx, 2.3, 2.8)
    const reverbSend = ctx.createGain()
    reverbSend.gain.value = 0.36

    this.scoreFilter.connect(this.scoreGain)
    this.scoreGain.connect(this.musicBusGain)
    this.scoreGain.connect(reverbSend)
    reverbSend.connect(this.reverbNode)
    this.reverbNode.connect(this.musicBusGain)

    this.sfxBusGain.connect(this.compressor)
    this.musicBusGain.connect(this.compressor)
    this.compressor.connect(this.masterGain)
    this.masterGain.connect(ctx.destination)

    this.droneOsc = ctx.createOscillator()
    this.droneOsc.type = 'triangle'
    this.droneOsc.frequency.value = 55
    const droneFilter = ctx.createBiquadFilter()
    droneFilter.type = 'lowpass'
    droneFilter.frequency.value = 140
    this.droneGain = ctx.createGain()
    this.droneGain.gain.value = 0.16
    this.droneOsc.connect(droneFilter)
    droneFilter.connect(this.droneGain)
    this.droneGain.connect(this.musicBusGain)
    this.droneOsc.start()

    const noiseLen = ctx.sampleRate * 3
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate)
    const ch = noiseBuf.getChannelData(0)
    let b0 = 0
    let b1 = 0
    let b2 = 0
    for (let i = 0; i < noiseLen; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + white * 0.099046
      b1 = 0.963 * b1 + white * 0.2965164
      b2 = 0.57 * b2 + white * 1.0526913
      ch[i] = (b0 + b1 + b2 + white * 0.1848) * 0.055
    }
    this.noiseBuffer = noiseBuf

    this.murmurSource = ctx.createBufferSource()
    this.murmurSource.buffer = noiseBuf
    this.murmurSource.loop = true
    const murmurFilter = ctx.createBiquadFilter()
    murmurFilter.type = 'bandpass'
    murmurFilter.frequency.value = 620
    murmurFilter.Q.value = 1.6
    this.murmurGain = ctx.createGain()
    this.murmurGain.gain.value = 0.02
    this.murmurSource.connect(murmurFilter)
    murmurFilter.connect(this.murmurGain)
    this.murmurGain.connect(this.reverbNode)
    this.murmurSource.start()
  }

  private createImpulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds)
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c)
      for (let i = 0; i < length; i++) {
        const env = Math.pow(1 - i / length, decay)
        data[i] = (Math.random() * 2 - 1) * env * 0.45
      }
    }
    return impulse
  }

  private applyActParameters(immediate: boolean): void {
    const ctx = this.ctx
    if (!ctx || !this.masterGain || !this.scoreFilter || !this.droneGain || !this.murmurGain || !this.musicBusGain || !this.sfxBusGain) {
      return
    }
    const now = ctx.currentTime
    const tc = immediate ? 0.05 : 0.45

    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.08)
    this.musicBusGain.gain.setTargetAtTime(this.musicLevel, now, tc)
    this.sfxBusGain.gain.setTargetAtTime(this.sfxLevel, now, tc)

    if (this.act === 0) {
      this.scoreFilter.frequency.setTargetAtTime(840, now, tc)
      this.droneGain.gain.setTargetAtTime(0.14, now, tc)
      this.murmurGain.gain.setTargetAtTime(0.024, now, tc)
    } else if (this.act === 1) {
      this.scoreFilter.frequency.setTargetAtTime(680, now, tc)
      this.droneGain.gain.setTargetAtTime(0.2, now, tc)
      this.murmurGain.gain.setTargetAtTime(0.008, now, tc)
    } else if (this.act === 2) {
      this.scoreFilter.frequency.setTargetAtTime(1980, now, tc)
      this.droneGain.gain.setTargetAtTime(0.14, now, tc)
      this.murmurGain.gain.setTargetAtTime(0.0, now, tc)
    } else if (this.act === 3) {
      this.scoreFilter.frequency.setTargetAtTime(2650, now, tc)
      this.droneGain.gain.setTargetAtTime(0.18, now, tc)
      this.murmurGain.gain.setTargetAtTime(0.0, now, tc)
    } else {
      this.scoreFilter.frequency.setTargetAtTime(3400, now, tc)
      this.droneGain.gain.setTargetAtTime(0.22, now, tc)
      this.murmurGain.gain.setTargetAtTime(0.0, now, tc)
    }
  }

  private startLoop(): void {
    if (this.timerId !== null) window.clearInterval(this.timerId)
    this.timerId = window.setInterval(() => {
      if (!this.ctx || !this.enabled || this.muted || this.ctx.state !== 'running') return
      this.tickNote(this.step)
      this.step = (this.step + 1) % 64
    }, 290)
  }

  private tickNote(step: number): void {
    const ctx = this.ctx
    if (!ctx || !this.scoreFilter) return
    const now = ctx.currentTime
    const chordIdx = Math.floor(step / 16) % 4
    const beatInBar = step % 16
    const progression = this.act < 2 ? SAD_CHORDS : BRIGHT_CHORDS
    const chord = progression[chordIdx]

    if (this.act === 0) {
      if (beatInBar === 0) this.triggerVoice(chord.bass * 2, 2.2, 0.14, 'sine', now)
      if (beatInBar === 0 || beatInBar === 5 || beatInBar === 10 || beatInBar === 13) {
        const note = chord.notes[beatInBar % chord.notes.length]
        this.triggerVoice(note, 1.8, 0.085, 'triangle', now)
      }
    } else if (this.act === 1) {
      if (beatInBar % 4 === 0) this.playHeartbeat(now)
      if (beatInBar === 0 || beatInBar === 6 || beatInBar === 12) {
        const note = chord.notes[(step >> 2) % chord.notes.length]
        this.triggerVoice(note, 1.2, 0.085, 'triangle', now)
      }
    } else if (this.act === 2) {
      if (beatInBar === 0) this.triggerVoice(chord.bass * 2, 2.0, 0.15, 'triangle', now)
      if (beatInBar % 2 === 0) {
        const note = chord.notes[(beatInBar / 2) % chord.notes.length]
        this.triggerVoice(note, 0.9, 0.085, 'sine', now)
      }
    } else if (this.act === 3) {
      if (beatInBar % 4 === 0) {
        this.triggerVoice(chord.bass, 0.42, 0.2, 'sawtooth', now, 340)
      }
      if (beatInBar % 2 === 0) {
        const note = chord.notes[(beatInBar / 2) % chord.notes.length]
        this.triggerVoice(note, 0.55, 0.085, 'triangle', now)
      }
    } else {
      if (beatInBar === 0 || beatInBar === 8) {
        this.triggerVoice(chord.bass * 2, 1.4, 0.16, 'triangle', now, 440)
      }
      if (beatInBar % 2 === 0) {
        const idx = (beatInBar / 2) % chord.notes.length
        this.triggerVoice(chord.notes[idx], 0.72, 0.09, 'sine', now)
        if (beatInBar % 4 === 2) {
          this.triggerVoice(chord.notes[idx] * 2, 0.45, 0.036, 'triangle', now, 3200)
        }
      }
    }
  }

  private triggerVoice(
    freq: number,
    dur: number,
    gainPeak: number,
    type: OscillatorType,
    startTime: number,
    localCutoff = 2600,
  ): void {
    const ctx = this.ctx
    if (!ctx || !this.scoreFilter) return
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    const lp = ctx.createBiquadFilter()
    osc.type = type
    osc.frequency.setValueAtTime(freq, startTime)
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(localCutoff, startTime)

    env.gain.setValueAtTime(0.0001, startTime)
    env.gain.linearRampToValueAtTime(gainPeak, startTime + 0.025)
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + dur)

    osc.connect(lp)
    lp.connect(env)
    env.connect(this.scoreFilter)
    osc.start(startTime)
    osc.stop(startTime + dur + 0.04)
  }

  private playHeartbeat(time: number): void {
    const ctx = this.ctx
    if (!ctx || !this.musicBusGain) return
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(64, time)
    osc.frequency.exponentialRampToValueAtTime(34, time + 0.18)
    g.gain.setValueAtTime(0.0001, time)
    g.gain.linearRampToValueAtTime(0.24, time + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22)
    osc.connect(g)
    g.connect(this.musicBusGain)
    osc.start(time)
    osc.stop(time + 0.24)
  }

  playCurtainOpen(): void {
    if (!this.ctx || !this.enabled || this.muted || !this.sfxBusGain) return
    const ctx = this.ctx
    const now = ctx.currentTime

    if (this.noiseBuffer) {
      const n = ctx.createBufferSource()
      n.buffer = this.noiseBuffer
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(420, now)
      bp.frequency.exponentialRampToValueAtTime(1480, now + 0.65)
      bp.Q.value = 1.4
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.001, now)
      g.gain.linearRampToValueAtTime(0.32, now + 0.09)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.85)
      n.connect(bp)
      bp.connect(g)
      g.connect(this.sfxBusGain)
      n.start(now)
      n.stop(now + 0.9)
    }

    ;[146.83, 220.0].forEach((freq) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now)
      g.gain.setValueAtTime(0.001, now)
      g.gain.linearRampToValueAtTime(0.12, now + 0.14)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.35)
      osc.connect(g)
      g.connect(this.sfxBusGain!)
      osc.start(now)
      osc.stop(now + 1.4)
    })
  }

  playIronClank(): void {
    if (!this.ctx || !this.enabled || this.muted || !this.sfxBusGain) return
    const ctx = this.ctx
    const now = ctx.currentTime
    ;[392, 836, 1480].forEach((f) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(f, now)
      osc.frequency.exponentialRampToValueAtTime(f * 0.96, now + 0.42)
      g.gain.setValueAtTime(0.075, now)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.44)
      osc.connect(g)
      g.connect(this.sfxBusGain!)
      osc.start(now)
      osc.stop(now + 0.46)
    })
  }

  playGoldenPortal(): void {
    if (!this.ctx || !this.enabled || this.muted || !this.sfxBusGain) return
    const ctx = this.ctx
    const now = ctx.currentTime
    ;[261.63, 329.63, 392.0, 493.88, 587.33].forEach((f, idx) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, now + idx * 0.035)
      g.gain.setValueAtTime(0.0001, now + idx * 0.035)
      g.gain.linearRampToValueAtTime(0.075, now + idx * 0.035 + 0.12)
      g.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.035 + 1.15)
      osc.connect(g)
      g.connect(this.sfxBusGain!)
      osc.start(now + idx * 0.035)
      osc.stop(now + idx * 0.035 + 1.2)
    })
  }

  playKineticSlash(): void {
    if (!this.ctx || !this.enabled || this.muted || !this.sfxBusGain) return
    const ctx = this.ctx
    const now = ctx.currentTime

    const sub = ctx.createOscillator()
    const subG = ctx.createGain()
    sub.type = 'sine'
    sub.frequency.setValueAtTime(145, now)
    sub.frequency.exponentialRampToValueAtTime(42, now + 0.34)
    subG.gain.setValueAtTime(0.28, now)
    subG.gain.exponentialRampToValueAtTime(0.0001, now + 0.38)
    sub.connect(subG)
    subG.connect(this.sfxBusGain)
    sub.start(now)
    sub.stop(now + 0.4)
  }

  /** Shattering concrete rumble for Act IV exploding pillars. */
  playShatterRumble(): void {
    if (!this.ctx || !this.enabled || this.muted || !this.sfxBusGain || !this.noiseBuffer) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const n = ctx.createBufferSource()
    n.buffer = this.noiseBuffer
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(520, now)
    lp.frequency.exponentialRampToValueAtTime(140, now + 0.72)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.01, now)
    g.gain.linearRampToValueAtTime(0.36, now + 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.78)
    n.connect(lp)
    lp.connect(g)
    g.connect(this.sfxBusGain)
    n.start(now)
    n.stop(now + 0.8)
  }

  playDaylightBloom(): void {
    if (!this.ctx || !this.enabled || this.muted || !this.sfxBusGain) return
    const ctx = this.ctx
    const now = ctx.currentTime
    ;[329.63, 493.88, 659.25, 987.77].forEach((f, idx) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(f, now + idx * 0.045)
      g.gain.setValueAtTime(0.0001, now + idx * 0.045)
      g.gain.linearRampToValueAtTime(0.06, now + idx * 0.045 + 0.1)
      g.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.045 + 1.3)
      osc.connect(g)
      g.connect(this.sfxBusGain!)
      osc.start(now + idx * 0.045)
      osc.stop(now + idx * 0.045 + 1.35)
    })
  }

  /** Soft stone stair step thud for Act V ascension. */
  playFootstepEcho(): void {
    if (!this.ctx || !this.enabled || this.muted || !this.sfxBusGain) return
    const ctx = this.ctx
    const now = ctx.currentTime
    ;[0, 0.28].forEach((offset) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(112, now + offset)
      osc.frequency.exponentialRampToValueAtTime(48, now + offset + 0.14)
      g.gain.setValueAtTime(0.001, now + offset)
      g.gain.linearRampToValueAtTime(0.14, now + offset + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18)
      osc.connect(g)
      g.connect(this.sfxBusGain!)
      osc.start(now + offset)
      osc.stop(now + offset + 0.2)
    })
  }

  playChapterSwell(): void {
    this.playGoldenPortal()
  }

  playUiClick(pitchMultiplier = 1): void {
    if (!this.ctx || !this.enabled || this.muted || !this.sfxBusGain) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1320 * pitchMultiplier, now)
    osc.frequency.exponentialRampToValueAtTime(660 * pitchMultiplier, now + 0.06)
    g.gain.setValueAtTime(0.08, now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.065)
    osc.connect(g)
    g.connect(this.sfxBusGain)
    osc.start(now)
    osc.stop(now + 0.075)
  }

  playShockwave(): void {
    if (!this.ctx || !this.enabled || this.muted || !this.sfxBusGain) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(135, now)
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.32)
    g.gain.setValueAtTime(0.18, now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    osc.connect(g)
    g.connect(this.sfxBusGain)
    osc.start(now)
    osc.stop(now + 0.38)
  }

  private bindVisibility(): void {
    if (this.visibilityBound || typeof document === 'undefined') return
    this.visibilityBound = true
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx || !this.enabled) return
      if (document.hidden) {
        void this.ctx.suspend().catch(() => {})
      } else if (!this.muted) {
        void this.ctx.resume().catch(() => {})
      }
    })
  }

  dispose(): void {
    if (this.timerId !== null) window.clearInterval(this.timerId)
    this.timerId = null
    if (this.ctx) {
      void this.ctx.close().catch(() => {})
      this.ctx = null
    }
  }
}

export const soundEngine = new FerrumSoundEngine()
