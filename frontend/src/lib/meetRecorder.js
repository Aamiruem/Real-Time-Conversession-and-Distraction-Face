// Record a meeting on this computer (like Zoom's "Record on this computer"): the call is redrawn onto a canvas
// from the tiles on screen, everyone's audio is mixed, and the result is saved as a video file when you stop.

export const TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
export const canRecord = () =>
  typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function" && TYPES.some((t) => MediaRecorder.isTypeSupported(t));

const W = 1280,
  H = 720,
  GAP = 8;

export class MeetRecorder {
  /** @param {HTMLElement} stage the element holding the .gm-tile elements  @param {string} title shown in the file name */
  constructor(stage, title) {
    this.stage = stage;
    this.title = title;
    this.canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
    this.ctx = this.canvas.getContext("2d");
    this.audio = new AudioContext();
    this.dest = this.audio.createMediaStreamDestination();
    this.sources = new Map(); // id -> { track, node }
  }

  /** Mix in (or update) someone's audio. Call again whenever their stream changes. */
  addAudio(id, stream) {
    const track = stream?.getAudioTracks()[0];
    const cur = this.sources.get(id);
    if (cur?.track === track) return;
    cur?.node.disconnect();
    this.sources.delete(id);
    if (!track) return;
    const node = this.audio.createMediaStreamSource(new MediaStream([track]));
    node.connect(this.dest);
    this.sources.set(id, { track, node });
  }

  /** Stop mixing everyone who is no longer in the call. */
  keepOnly(ids) {
    for (const id of [...this.sources.keys()]) if (!ids.includes(id)) this.addAudio(id, null);
  }

  start() {
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const out = new MediaStream([...this.canvas.captureStream(30).getVideoTracks(), ...this.dest.stream.getAudioTracks()]);
    this.rec = new MediaRecorder(out, { mimeType, videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 128_000 });
    const chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    this.done = new Promise((resolve) => {
      this.rec.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
    });
    this.started = Date.now();
    this.rec.start(1000);
    this.timer = setInterval(() => this.draw(), 1000 / 30);
  }

  /** Stops, saves the file to Downloads, and resolves with its size in bytes. */
  async stop() {
    clearInterval(this.timer);
    if (this.rec?.state !== "inactive") this.rec.stop();
    const blob = await this.done;
    this.audio.close().catch(() => {});
    const url = URL.createObjectURL(blob);
    const stamp = new Date(this.started).toISOString().slice(0, 16).replace("T", " ").replace(":", "-");
    Object.assign(document.createElement("a"), { href: url, download: `${this.title} ${stamp}.${blob.type.includes("mp4") ? "mp4" : "webm"}` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return blob.size;
  }

  // ---------------------------------------------------------------- drawing
  /** Where each tile goes: a presenter / pinned person big on the left, or everyone in a grid. */
  layout(n, big) {
    if (big >= 0 && n > 1) {
      const mainW = Math.round(W * 0.78);
      const sideW = W - mainW - GAP * 3;
      const sideH = Math.min((sideW * 9) / 16, (H - GAP * n) / (n - 1));
      let y = GAP;
      return Array.from({ length: n }, (_, i) => {
        if (i === big) return { x: GAP, y: GAP, w: mainW, h: H - GAP * 2 };
        const r = { x: mainW + GAP * 2, y, w: sideW, h: sideH };
        y += sideH + GAP;
        return r;
      });
    }
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cw = (W - GAP * (cols + 1)) / cols;
    const ch = (H - GAP * (rows + 1)) / rows;
    return Array.from({ length: n }, (_, i) => {
      const row = Math.floor(i / cols);
      const inRow = row === rows - 1 ? n - row * cols : cols; // centre a short last row
      const offset = ((cols - inRow) * (cw + GAP)) / 2;
      return { x: GAP + offset + (i % cols) * (cw + GAP), y: GAP + row * (ch + GAP), w: cw, h: ch };
    });
  }

  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = "#202124";
    ctx.fillRect(0, 0, W, H);
    const tiles = [...this.stage.querySelectorAll(".gm-tile")];
    const boxes = this.layout(
      tiles.length,
      tiles.findIndex((t) => t.classList.contains("big")),
    );
    tiles.forEach((tile, i) => this.drawTile(tile, boxes[i]));
    // a small "REC" mark and the running time
    const secs = Math.floor((Date.now() - this.started) / 1000);
    const label = `REC ${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    ctx.font = "600 16px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#0009";
    ctx.beginPath();
    ctx.roundRect?.(14, 14, ctx.measureText(label).width + 40, 30, 15);
    ctx.fill();
    ctx.fillStyle = "#ea4335";
    ctx.beginPath();
    ctx.arc(32, 29, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, 44, 35);
  }

  drawTile(tile, { x, y, w, h }) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 10) : ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = "#3c4043";
    ctx.fillRect(x, y, w, h);
    const video = tile.querySelector("video:not(.hidden)");
    if (video?.videoWidth) {
      // cover the box, mirrored like on screen
      const s = Math.max(w / video.videoWidth, h / video.videoHeight);
      const vw = video.videoWidth * s,
        vh = video.videoHeight * s;
      const screen = tile.querySelector(".gm-name svg"); // presenting: show the whole screen, not a crop
      const fit = screen ? Math.min(w / video.videoWidth, h / video.videoHeight) : s;
      const fw = video.videoWidth * fit,
        fh = video.videoHeight * fit;
      const [dw, dh] = screen ? [fw, fh] : [vw, vh];
      if (video.classList.contains("mirror")) {
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else {
      const avatar = tile.querySelector(".gm-avatar");
      const r = Math.min(w, h) * 0.18;
      ctx.fillStyle = avatar ? getComputedStyle(avatar).backgroundColor : "#1a73e8";
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `500 ${Math.round(r * 0.8)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(avatar?.textContent ?? "", x + w / 2, y + h / 2);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
    const name = tile.querySelector(".gm-name b")?.textContent;
    if (name) {
      ctx.font = "500 15px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#0008";
      ctx.fillRect(x, y + h - 30, ctx.measureText(name).width + 24, 30);
      ctx.fillStyle = "#fff";
      ctx.fillText(name, x + 12, y + h - 10);
    }
    ctx.restore();
  }
}
