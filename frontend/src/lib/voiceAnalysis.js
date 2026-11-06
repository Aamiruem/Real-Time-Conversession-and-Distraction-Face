// Voice analysis in the browser (no server needed): every 50 ms it measures the microphone's loudness and, while
// you speak, your pitch. summary() turns that into speaking time, pauses, volume, energy variation and pitch
// variety — the delivery half of how you come across.

const FRAME_MS = 50;
const SILENCE_DB = -48; // quieter than this = not speaking

/** Pitch (Hz) of one frame by autocorrelation, or 0 when there's no clear voice in it. */
function pitchOf(buf, rate) {
  let rms = 0;
  for (const v of buf) rms += v * v;
  if (Math.sqrt(rms / buf.length) < 0.01) return 0;
  const minLag = Math.floor(rate / 400), maxLag = Math.floor(rate / 70); // human voice: 70-400 Hz
  let best = 0, bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < buf.length; i++) sum += buf[i] * buf[i + lag];
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  let energy = 0;
  for (const v of buf) energy += v * v;
  return bestLag && best / energy > 0.3 ? rate / bestLag : 0;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sd = (a) => {
  const m = mean(a);
  return a.length ? Math.sqrt(mean(a.map((v) => (v - m) ** 2))) : 0;
};

export class VoiceAnalyser {
  /** @param {MediaStream} stream a stream with a microphone track */
  start(stream) {
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.frames = []; // { db, pitch }
    this.level = -90;
    this.timer = setInterval(() => {
      this.analyser.getFloatTimeDomainData(this.buf);
      let rms = 0;
      for (const v of this.buf) rms += v * v;
      const db = 20 * Math.log10(Math.sqrt(rms / this.buf.length) + 1e-9);
      this.level = db;
      this.frames.push({ db, pitch: db > SILENCE_DB ? pitchOf(this.buf, this.ctx.sampleRate) : 0 });
    }, FRAME_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.ctx?.close().catch(() => {});
  }

  summary() {
    const f = this.frames ?? [];
    const seconds = (f.length * FRAME_MS) / 1000;
    const voiced = f.filter((x) => x.db > SILENCE_DB);
    // pauses: silent stretches of 0.6 s+ between speech; long ones 2 s+
    let run = 0, pauses = 0, longPauses = 0, bursts = 0, inSpeech = false;
    for (const x of f) {
      if (x.db > SILENCE_DB) {
        if (!inSpeech) bursts++;
        if (run >= 600 / FRAME_MS && bursts > 1) {
          pauses++;
          if (run >= 2000 / FRAME_MS) longPauses++;
        }
        run = 0;
        inSpeech = true;
      } else {
        run++;
        if (run > 4) inSpeech = false;
      }
    }
    const pitches = f.map((x) => x.pitch).filter((p) => p > 0);
    const pitchMean = mean(pitches);
    const loud = voiced.map((x) => x.db);
    return {
      seconds: +seconds.toFixed(1),
      speaking_pct: f.length ? +((100 * voiced.length) / f.length).toFixed(1) : 0,
      pauses,
      long_pauses: longPauses,
      phrases_per_min: seconds ? +((bursts / seconds) * 60).toFixed(1) : 0,
      loudness_db: loud.length ? +mean(loud).toFixed(1) : null,
      energy_variation: loud.length ? +sd(loud).toFixed(1) : null, // dB: low = flat delivery
      pitch_hz: pitchMean ? Math.round(pitchMean) : null,
      pitch_variation: pitchMean ? +((100 * sd(pitches)) / pitchMean).toFixed(1) : null, // % : low = monotone
    };
  }
}
