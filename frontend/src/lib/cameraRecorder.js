// Record the camera as you see it on screen: the picture, the face-tracking overlay and a focus read-out, plus a
// one-a-second focus timeline that is saved with the video (backend: /recordings → SQL + MongoDB, video to S3/disk).
import { STATE_COLORS } from "./attention";
import { TYPES } from "./meetRecorder";

/** Video bitrate for each camera quality (CAMERA_QUALITY keys). */
const BITRATE = { low: 1_000_000, medium: 2_500_000, high: 5_000_000 };
const FPS = 30;

export class CameraRecorder {
  /**
   * @param {HTMLVideoElement} video the camera  @param {HTMLCanvasElement} overlay useFaceTracker's drawing
   * @param {() => {focusPct: number, state: string}} metrics the latest focus metrics
   */
  constructor(video, overlay, metrics, quality = "medium") {
    this.video = video;
    this.overlay = overlay;
    this.metrics = metrics;
    this.quality = quality;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.timeline = [];
  }

  start() {
    this.resize();
    this.mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.canvas.captureStream(FPS), {
      mimeType: this.mimeType,
      videoBitsPerSecond: BITRATE[this.quality] ?? BITRATE.medium,
    });
    const chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    this.done = new Promise((resolve) => {
      this.rec.onstop = () => resolve(new Blob(chunks, { type: this.mimeType.split(";")[0] }));
    });
    this.started = Date.now();
    this.rec.start(1000);
    // a timer, not requestAnimationFrame: keeps recording while the tab is in the background
    this.timer = setInterval(() => this.draw(), 1000 / FPS);
    this.sampler = setInterval(() => this.sample(), 1000);
  }

  /** Stops and resolves with { blob, durationSec, timeline }. */
  async stop() {
    clearInterval(this.timer);
    clearInterval(this.sampler);
    if (this.rec?.state !== "inactive") this.rec.stop();
    const blob = await this.done;
    return { blob, durationSec: (Date.now() - this.started) / 1000, timeline: this.timeline };
  }

  get seconds() {
    return this.started ? Math.floor((Date.now() - this.started) / 1000) : 0;
  }

  sample() {
    const m = this.metrics();
    this.timeline.push({ t: this.seconds, focus: Math.round(m.focusPct ?? 0), state: m.state });
  }

  /** Follow the camera's resolution (it changes when you switch quality mid-recording). */
  resize() {
    const w = this.video.videoWidth || 1280,
      h = this.video.videoHeight || 720;
    if (this.canvas.width !== w || this.canvas.height !== h) Object.assign(this.canvas, { width: w, height: h });
  }

  draw() {
    this.resize();
    const { ctx, canvas } = this;
    const w = canvas.width,
      h = canvas.height;
    // mirrored like on screen; the overlay's labels are drawn pre-flipped for exactly this
    ctx.setTransform(-1, 0, 0, 1, w, 0);
    if (this.video.videoWidth) ctx.drawImage(this.video, 0, 0, w, h);
    if (this.overlay?.width) ctx.drawImage(this.overlay, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const s = h / 720; // HUD scales with the resolution
    const secs = this.seconds;
    const m = this.metrics();
    const label = `REC ${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    const focus = `${m.state} · ${Math.round(m.focusPct ?? 0)}%`;
    ctx.font = `600 ${18 * s}px Inter, system-ui, sans-serif`;
    const pad = 16 * s;
    const pill = (x, text, dot) => {
      const tw = ctx.measureText(text).width + 44 * s;
      ctx.fillStyle = "#000a";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, pad, tw, 34 * s, 17 * s) : ctx.rect(x, pad, tw, 34 * s);
      ctx.fill();
      ctx.fillStyle = dot;
      ctx.beginPath();
      ctx.arc(x + 18 * s, pad + 17 * s, 6 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(text, x + 32 * s, pad + 23 * s);
      return tw;
    };
    const first = pill(pad, label, "#ea4335");
    pill(pad + first + 10 * s, focus, STATE_COLORS[m.state] ?? "#38bdf8");
  }
}
