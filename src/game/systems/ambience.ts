import { MAP } from "../world/mapData";
/** Original, synthesized ambience. No recordings, voices or external audio assets. */
export interface AmbienceState {
  x: number;
  y: number;
  driving: boolean;
  speed: number;
  walking: boolean;
  sprinting: boolean;
  surface: "road" | "pavement" | "earth";
}

type Zone = "shop" | "taxi" | "pitch";
type Bus = { gain: GainNode; pan: StereoPannerNode | null };

const STORAGE_KEY = "hanover-park-audio-v1";
const ZONES = {
  shop: { ...MAP.locations.shop, radius: 1100 },
  taxi: { ...MAP.locations.taxi, radius: 900 },
  pitch: { ...MAP.locations.pitch, radius: 1200 },
};
const RADIO_NOTES = [
  293.66, 369.99, 440, 369.99, 329.63, 246.94, 329.63, 293.66,
];
const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

export class Ambience {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private meter = new Float32Array(256);
  private noise: AudioBuffer | null = null;
  private buses: Partial<Record<Zone, Bus>> = {};
  private nodes = new Set<AudioNode>();
  private beds = new Set<AudioScheduledSourceNode>();
  private transientNodes = new Map<AudioScheduledSourceNode, AudioNode[]>();
  private wind: GainNode | null = null;
  private chatter: GainNode | null = null;
  private chatterFilter: BiquadFilterNode | null = null;
  private pitchCrowd: GainNode | null = null;
  private engine: GainNode | null = null;
  private engineLow: OscillatorNode | null = null;
  private engineHigh: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private savedMuted = false;
  private savedVolume = 0.4;
  private paused = false;
  private disposed = false;
  private unsupported = false;
  private suspendTimer: number | null = null;
  private elapsed = 0;
  private stepClock = 0;
  private stepSide = 1;
  private nextHorn = 12;
  private nextKick = 3.2;
  private nextWhistle = 16;
  private nextRadio = 1.1;
  private radioNote = 0;
  private previousPosition: { x: number; y: number } | null = null;
  private levels = { shop: 0, taxi: 0, pitch: 0 };
  private randomSeed = 0x48704b;
  private parameterTargets = new WeakMap<AudioParam, number>();

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (typeof saved?.muted === "boolean") this.savedMuted = saved.muted;
      if (typeof saved?.volume === "number" && Number.isFinite(saved.volume))
        this.savedVolume = clamp(saved.volume);
    } catch {
      // Audio preferences are optional when storage is unavailable.
    }
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", this.visibilityChanged);
  }

  get muted() {
    return this.savedMuted;
  }

  get volume() {
    return this.savedVolume;
  }

  get available() {
    return !this.disposed && !this.unsupported && !!this.audioConstructor();
  }

  get contextState(): AudioContextState | "uninitialized" | "unavailable" {
    return (
      this.context?.state ?? (this.available ? "uninitialized" : "unavailable")
    );
  }

  /** Spatial weights before the user's master volume; useful for captions and tests. */
  get zoneLevels() {
    return { ...this.levels };
  }

  /** Call directly from a click/key gesture to create or resume browser audio. */
  initialize(): void {
    if (!this.available) return;
    this.clearSuspendTimer();
    if (!this.context) {
      const AudioConstructor = this.audioConstructor();
      if (!AudioConstructor) return;
      try {
        this.context = new AudioConstructor();
        this.createGraph();
      } catch {
        this.unsupported = true;
        this.releaseGraph();
        void this.context?.close().catch(() => {});
        this.context = null;
        return;
      }
    }
    this.applyMaster();
    if (this.silentForPause()) this.suspendAfterFade();
    else void this.context.resume().catch(() => {});
  }

  setMuted(muted: boolean): void {
    this.savedMuted = muted;
    this.persist();
    this.applyMaster();
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.savedVolume = clamp(volume);
    this.persist();
    this.applyMaster();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.clearSuspendTimer();
    this.applyMaster();
    if (this.silentForPause()) {
      this.stepClock = 0;
      this.previousPosition = null;
      this.stopTransientsAfterFade();
      this.suspendAfterFade();
    }
    // Resume in initialize(), called by the scene's Resume/Start/input gesture.
  }

  /** RMS measured from the connected output, rather than an inferred playing flag. */
  level(): number {
    if (!this.analyser || this.context?.state !== "running") return 0;
    this.analyser.getFloatTimeDomainData(this.meter);
    let sum = 0;
    for (const value of this.meter) sum += value * value;
    return clamp(Math.sqrt(sum / this.meter.length));
  }

  /** dt is in seconds. walking should describe actual movement after collision. */
  update(dt: number, state: AmbienceState): void {
    if (
      this.disposed ||
      !this.context ||
      this.context.state !== "running" ||
      this.silentForPause() ||
      !Number.isFinite(dt) ||
      !Number.isFinite(state.x) ||
      !Number.isFinite(state.y)
    )
      return;
    dt = clamp(dt, 0, 0.1);
    this.elapsed += dt;
    const now = this.context.currentTime;
    for (const zone of Object.keys(ZONES) as Zone[]) {
      const anchor = ZONES[zone];
      const distance = Math.hypot(state.x - anchor.x, state.y - anchor.y);
      const weight = clamp(1 - distance / anchor.radius) ** 2;
      this.levels[zone] = weight;
      const bus = this.buses[zone];
      if (bus) {
        this.ramp(bus.gain.gain, weight, now, 0.12);
        if (bus.pan)
          this.ramp(
            bus.pan.pan,
            clamp((anchor.x - state.x) / 550, -0.85, 0.85),
            now,
          );
      }
    }
    if (this.wind)
      this.ramp(
        this.wind.gain,
        0.17 + Math.sin(this.elapsed * 0.22) * 0.045,
        now,
      );
    // Filtered noise with overlapping soft syllabic envelopes; never spoken words.
    if (this.chatter) {
      const voices =
        0.12 +
        0.045 * Math.sin(this.elapsed * 4.7) +
        0.035 * Math.sin(this.elapsed * 7.3 + 1.4);
      this.ramp(this.chatter.gain, voices, now, 0.04);
    }
    if (this.chatterFilter)
      this.ramp(
        this.chatterFilter.frequency,
        650 + Math.sin(this.elapsed * 1.7) * 180,
        now,
      );
    if (this.pitchCrowd)
      this.ramp(
        this.pitchCrowd.gain,
        0.06 + Math.sin(this.elapsed * 3.2) * 0.025,
        now,
      );
    const speed = Number.isFinite(state.speed)
      ? clamp(Math.abs(state.speed) / 340)
      : 0;
    if (this.engine)
      this.ramp(
        this.engine.gain,
        state.driving ? 0.13 + speed * 0.045 : 0,
        now,
        0.09,
      );
    if (this.engineLow)
      this.ramp(this.engineLow.frequency, 44 + speed * 67, now, 0.07);
    if (this.engineHigh)
      this.ramp(this.engineHigh.frequency, 88 + speed * 134, now, 0.07);
    if (this.engineFilter)
      this.ramp(this.engineFilter.frequency, 300 + speed * 1050, now, 0.08);

    const moved = this.previousPosition
      ? Math.hypot(
          state.x - this.previousPosition.x,
          state.y - this.previousPosition.y,
        ) > 0.01
      : false;
    this.previousPosition = { x: state.x, y: state.y };
    if (!state.driving && state.walking && moved) {
      this.stepClock += dt;
      const interval = state.sprinting ? 0.27 : 0.43;
      if (this.stepClock >= interval) {
        this.stepClock %= interval;
        if (!this.savedMuted && this.savedVolume > 0)
          this.footstep(state.surface);
      }
    } else this.stepClock = 0;

    // Events use the game's clock, so pause/hidden tabs cannot accumulate timers.
    if (this.savedMuted || this.savedVolume === 0) return;
    if (this.elapsed >= this.nextRadio) {
      if (this.levels.shop > 0.015 && this.buses.shop) {
        this.tone(
          RADIO_NOTES[this.radioNote],
          0.32,
          0.062,
          "triangle",
          this.buses.shop.gain,
        );
        this.radioNote = (this.radioNote + 1) % RADIO_NOTES.length;
        this.nextRadio = this.elapsed + (this.radioNote === 0 ? 14 : 0.42);
      } else this.nextRadio = this.elapsed + 2;
    }
    if (this.elapsed >= this.nextHorn) {
      if (this.levels.taxi > 0.035 && this.buses.taxi) {
        this.tone(330, 0.19, 0.055, "sine", this.buses.taxi.gain);
        this.tone(415, 0.19, 0.036, "sine", this.buses.taxi.gain);
      }
      this.nextHorn = this.elapsed + 19 + this.random() * 14;
    }
    if (this.elapsed >= this.nextKick) {
      if (this.levels.pitch > 0.025 && this.buses.pitch) {
        this.tone(115, 0.12, 0.13, "sine", this.buses.pitch.gain, 48);
        this.noiseBurst(0.09, 0.065, 950, this.buses.pitch.gain);
      }
      this.nextKick = this.elapsed + 2.8 + this.random() * 3.5;
    }
    if (this.elapsed >= this.nextWhistle) {
      if (this.levels.pitch > 0.04 && this.buses.pitch)
        this.tone(1750, 0.23, 0.035, "sine", this.buses.pitch.gain, 1980);
      this.nextWhistle = this.elapsed + 22 + this.random() * 15;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearSuspendTimer();
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.visibilityChanged);
    this.releaseGraph();
    if (this.context && this.context.state !== "closed")
      void this.context.close().catch(() => {});
  }

  private audioConstructor(): typeof AudioContext | undefined {
    if (typeof window === "undefined") return undefined;
    return (
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    );
  }

  private persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ muted: this.savedMuted, volume: this.savedVolume }),
      );
    } catch {
      // Keep usable session preferences even when persistent storage is denied.
    }
  }

  private silentForPause() {
    return this.paused || (typeof document !== "undefined" && document.hidden);
  }

  private visibilityChanged = () => {
    this.clearSuspendTimer();
    this.applyMaster();
    if (this.silentForPause()) {
      this.previousPosition = null;
      this.stepClock = 0;
      this.stopTransientsAfterFade();
      this.suspendAfterFade();
    }
  };

  private applyMaster() {
    if (!this.context || !this.master) return;
    const volume =
      this.savedMuted || this.silentForPause() ? 0 : this.savedVolume;
    const gain = this.master.gain;
    const now = this.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(volume, now + 0.065);
  }

  private suspendAfterFade() {
    if (
      !this.context ||
      this.context.state === "closed" ||
      this.suspendTimer !== null
    )
      return;
    this.suspendTimer = window.setTimeout(() => {
      this.suspendTimer = null;
      if (this.silentForPause() && this.context?.state === "running")
        void this.context.suspend().catch(() => {});
    }, 85);
  }

  private clearSuspendTimer() {
    if (this.suspendTimer !== null) {
      window.clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
  }

  private stopTransientsAfterFade() {
    if (!this.context) return;
    for (const source of this.transientNodes.keys()) {
      try {
        source.stop(this.context.currentTime + 0.07);
      } catch {
        /* May already have ended. */
      }
    }
  }

  private keep<T extends AudioNode>(node: T): T {
    this.nodes.add(node);
    return node;
  }

  private ramp(
    parameter: AudioParam,
    value: number,
    now: number,
    timeConstant = 0.06,
  ) {
    const previous = this.parameterTargets.get(parameter);
    if (
      previous !== undefined &&
      Math.abs(previous - value) < Math.max(0.0002, Math.abs(value) * 0.001)
    )
      return;
    this.parameterTargets.set(parameter, value);
    parameter.setTargetAtTime(value, now, timeConstant);
  }

  private createGraph() {
    const context = this.context!;
    this.master = this.keep(context.createGain());
    this.master.gain.value = 0;
    const compressor = this.keep(context.createDynamicsCompressor());
    compressor.threshold.value = -20;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.015;
    compressor.release.value = 0.2;
    this.analyser = this.keep(context.createAnalyser());
    this.analyser.fftSize = 256;
    this.master
      .connect(compressor)
      .connect(this.analyser)
      .connect(context.destination);
    this.noise = context.createBuffer(
      1,
      context.sampleRate * 4,
      context.sampleRate,
    );
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = this.random() * 2 - 1;
    for (const zone of Object.keys(ZONES) as Zone[]) {
      const gain = this.keep(context.createGain());
      gain.gain.value = 0;
      const pan =
        typeof context.createStereoPanner === "function"
          ? this.keep(context.createStereoPanner())
          : null;
      if (pan) gain.connect(pan).connect(this.master);
      else gain.connect(this.master);
      this.buses[zone] = { gain, pan };
    }

    this.wind = this.noiseBed(this.master, "lowpass", 390, 0.17).gain;
    const chatter = this.noiseBed(this.buses.shop!.gain, "bandpass", 650, 0.12);
    this.chatter = chatter.gain;
    this.chatterFilter = chatter.filter;
    this.noiseBed(this.buses.shop!.gain, "bandpass", 1650, 0.033);
    this.pitchCrowd = this.noiseBed(
      this.buses.pitch!.gain,
      "bandpass",
      1200,
      0.06,
    ).gain;
    this.noiseBed(this.buses.taxi!.gain, "lowpass", 220, 0.045);
    this.oscillatorBed(this.buses.taxi!.gain, "triangle", 73, 0.055);
    this.oscillatorBed(this.buses.taxi!.gain, "sine", 39, 0.046);

    this.engine = this.keep(context.createGain());
    this.engine.gain.value = 0;
    this.engine.connect(this.master);
    this.engineFilter = this.keep(context.createBiquadFilter());
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 300;
    this.engineFilter.Q.value = 0.5;
    this.engineFilter.connect(this.engine);
    this.engineLow = this.oscillatorBed(this.engineFilter, "triangle", 44, 0.9);
    this.engineHigh = this.oscillatorBed(this.engineFilter, "sine", 88, 0.34);
    this.noiseBed(this.engineFilter, "lowpass", 500, 0.18);
  }

  private noiseBed(
    target: AudioNode,
    type: BiquadFilterType,
    frequency: number,
    volume: number,
  ) {
    const context = this.context!;
    const source = this.keep(context.createBufferSource());
    source.buffer = this.noise;
    source.loop = true;
    const filter = this.keep(context.createBiquadFilter());
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    const gain = this.keep(context.createGain());
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(target);
    this.beds.add(source);
    source.start(0, this.random() * 3);
    return { gain, filter };
  }

  private oscillatorBed(
    target: AudioNode,
    type: OscillatorType,
    frequency: number,
    volume: number,
  ) {
    const context = this.context!;
    const source = this.keep(context.createOscillator());
    const gain = this.keep(context.createGain());
    source.type = type;
    source.frequency.value = frequency;
    gain.gain.value = volume;
    source.connect(gain).connect(target);
    this.beds.add(source);
    source.start();
    return source;
  }

  private footstep(surface: AmbienceState["surface"]) {
    if (!this.master || !this.context || this.transientNodes.size >= 24) return;
    const pan =
      typeof this.context.createStereoPanner === "function"
        ? this.context.createStereoPanner()
        : null;
    const output = pan ?? this.context.createGain();
    if (pan) pan.pan.value = this.stepSide * 0.11;
    this.stepSide *= -1;
    output.connect(this.master);
    const earth = surface === "earth";
    this.noiseBurst(
      earth ? 0.12 : 0.065,
      earth ? 0.15 : 0.11,
      earth ? 650 : 1700,
      output,
      [output],
    );
    this.tone(
      earth ? 78 : 105,
      0.07,
      earth ? 0.043 : 0.058,
      "sine",
      this.master,
      44,
    );
  }

  private envelope(
    gain: AudioParam,
    now: number,
    duration: number,
    volume: number,
  ) {
    gain.setValueAtTime(0, now);
    gain.linearRampToValueAtTime(volume, now + Math.min(0.016, duration / 4));
    gain.exponentialRampToValueAtTime(0.0001, now + duration);
    gain.setValueAtTime(0, now + duration + 0.005);
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    target: AudioNode,
    endFrequency?: number,
  ) {
    if (!this.context || this.transientNodes.size >= 24) return;
    const now = this.context.currentTime;
    const source = this.context.createOscillator();
    const gain = this.context.createGain();
    source.type = type;
    source.frequency.setValueAtTime(frequency, now);
    if (endFrequency)
      source.frequency.exponentialRampToValueAtTime(
        endFrequency,
        now + duration,
      );
    this.envelope(gain.gain, now, duration, volume);
    source.connect(gain).connect(target);
    this.trackTransient(source, [gain]);
    source.start(now);
    source.stop(now + duration + 0.015);
  }

  private noiseBurst(
    duration: number,
    volume: number,
    frequency: number,
    target: AudioNode,
    extraNodes: AudioNode[] = [],
  ) {
    if (!this.context || !this.noise || this.transientNodes.size >= 24) {
      for (const node of extraNodes) node.disconnect();
      return;
    }
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.5;
    const gain = this.context.createGain();
    this.envelope(gain.gain, now, duration, volume);
    source.connect(filter).connect(gain).connect(target);
    this.trackTransient(source, [filter, gain, ...extraNodes]);
    source.start(now, this.random() * 2, duration + 0.015);
  }

  private trackTransient(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    this.transientNodes.set(source, nodes);
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
      this.transientNodes.delete(source);
      source.onended = null;
    };
  }

  private releaseGraph() {
    for (const source of this.beds) {
      try {
        source.stop();
      } catch {
        /* May already be stopped. */
      }
    }
    for (const [source, nodes] of this.transientNodes) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* May already have ended. */
      }
      source.disconnect();
      for (const node of nodes) node.disconnect();
    }
    for (const node of this.nodes) node.disconnect();
    this.beds.clear();
    this.nodes.clear();
    this.transientNodes.clear();
    this.master = null;
    this.analyser = null;
    this.noise = null;
    this.buses = {};
    this.wind = null;
    this.chatter = null;
    this.chatterFilter = null;
    this.pitchCrowd = null;
    this.engine = null;
    this.engineLow = null;
    this.engineHigh = null;
    this.engineFilter = null;
    this.parameterTargets = new WeakMap();
  }

  private random() {
    this.randomSeed = (1664525 * this.randomSeed + 1013904223) >>> 0;
    return this.randomSeed / 4294967296;
  }
}
