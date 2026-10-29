// Background blur / replacement for meetings (like Google Meet). MediaPipe selfie segmentation finds you in every
// camera frame; the rest is blurred or swapped for a background. Runs on your device; others receive the result.
//
// Chrome / Edge: MediaStreamTrackProcessor -> segment -> MediaStreamTrackGenerator (frame-driven, so it keeps
// running at full speed when you switch tabs). Other browsers: <video> -> canvas -> captureStream().

let segPromise = null;

export function loadSegmenter() {
  segPromise ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const make = (delegate) =>
      ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/mediapipe/selfie_segmenter_landscape.tflite", delegate },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  })();
  segPromise.catch(() => (segPromise = null));
  return segPromise;
}

const gradient = (stops) => (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};

/** Small seeded random numbers, so a drawn scene looks the same every time. */
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rrect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  ctx.fill();
};

// Room backgrounds, drawn in code (no photos to license or download)
function bookshelf(ctx, w, h) {
  const rnd = seeded(7);
  ctx.fillStyle = "#efe6d8";
  ctx.fillRect(0, 0, w, h);
  const cols = 4,
    rows = 4,
    pad = w * 0.04,
    cw = (w - pad * 2) / cols,
    rh = (h * 0.82) / rows;
  const spines = ["#7c2d12", "#1e3a8a", "#065f46", "#b45309", "#831843", "#334155", "#a16207", "#e5e7eb", "#0f766e"];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = pad + c * cw,
        y = h * 0.04 + r * rh;
      ctx.fillStyle = "#f8f3ea";
      ctx.fillRect(x + 6, y + 6, cw - 12, rh - 12);
      let bx = x + 14;
      const kind = rnd();
      if (kind < 0.62) {
        while (bx < x + cw * (0.45 + rnd() * 0.45)) {
          const bw = cw * (0.035 + rnd() * 0.03),
            bh = rh * (0.55 + rnd() * 0.3);
          ctx.fillStyle = spines[Math.floor(rnd() * spines.length)];
          ctx.fillRect(bx, y + rh - 12 - bh, bw, bh);
          bx += bw + 2;
        }
      }
      if (kind > 0.45) {
        // a plant or a vase
        const px = x + cw * (0.62 + rnd() * 0.2),
          base = y + rh - 12;
        ctx.fillStyle = rnd() > 0.5 ? "#d6c3a3" : "#b45309";
        rrect(ctx, px - cw * 0.06, base - rh * 0.22, cw * 0.12, rh * 0.22, 6);
        ctx.fillStyle = "#3f7d4f";
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.ellipse(px + (rnd() - 0.5) * cw * 0.16, base - rh * (0.3 + rnd() * 0.25), cw * 0.05, rh * 0.09, rnd() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  ctx.strokeStyle = "#d9c7a7";
  ctx.lineWidth = 10;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(pad + c * cw, h * 0.04);
    ctx.lineTo(pad + c * cw, h * 0.86);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(pad, h * 0.04 + r * rh);
    ctx.lineTo(w - pad, h * 0.04 + r * rh);
    ctx.stroke();
  }
  ctx.fillStyle = "#a7c4a0";
  ctx.fillRect(0, h * 0.86, w, h * 0.14); // cabinet
}

function livingRoom(ctx, w, h) {
  const wall = ctx.createLinearGradient(0, 0, 0, h);
  wall.addColorStop(0, "#f5efe6");
  wall.addColorStop(1, "#e7dccb");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, h);
  const sky = ctx.createLinearGradient(0, h * 0.1, 0, h * 0.6);
  sky.addColorStop(0, "#9fd3f5");
  sky.addColorStop(1, "#e0f2fe");
  ctx.fillStyle = sky;
  ctx.fillRect(w * 0.55, h * 0.1, w * 0.36, h * 0.5);
  ctx.fillStyle = "#86b98f";
  ctx.fillRect(w * 0.55, h * 0.48, w * 0.36, h * 0.12); // trees outside
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 12;
  ctx.strokeRect(w * 0.55, h * 0.1, w * 0.36, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(w * 0.73, h * 0.1);
  ctx.lineTo(w * 0.73, h * 0.6);
  ctx.stroke();
  ctx.fillStyle = "#c2a37a";
  ctx.fillRect(0, h * 0.82, w, h * 0.18); // floor
  ctx.fillStyle = "#4b7f86";
  rrect(ctx, w * 0.04, h * 0.6, w * 0.42, h * 0.26, 24); // sofa
  ctx.fillStyle = "#3d6b71";
  rrect(ctx, w * 0.06, h * 0.52, w * 0.38, h * 0.14, 20);
  ctx.fillStyle = "#fbbf24aa";
  ctx.beginPath();
  ctx.moveTo(w * 0.48, h * 0.3);
  ctx.lineTo(w * 0.54, h * 0.3);
  ctx.lineTo(w * 0.56, h * 0.4);
  ctx.lineTo(w * 0.46, h * 0.4);
  ctx.fill(); // lamp shade
  ctx.fillStyle = "#57534e";
  ctx.fillRect(w * 0.505, h * 0.4, w * 0.008, h * 0.42);
}

function cityNight(ctx, w, h) {
  const rnd = seeded(42);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#0b1026");
  sky.addColorStop(0.6, "#3b2a6b");
  sky.addColorStop(1, "#c2410c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  let x = 0;
  while (x < w) {
    const bw = w * (0.05 + rnd() * 0.07),
      bh = h * (0.25 + rnd() * 0.5);
    ctx.fillStyle = `hsl(240 25% ${8 + rnd() * 8}%)`;
    ctx.fillRect(x, h - bh, bw, bh);
    ctx.fillStyle = "#fde68a";
    for (let wy = h - bh + 10; wy < h - 10; wy += 14) {
      for (let wx = x + 6; wx < x + bw - 8; wx += 12) if (rnd() > 0.55) ctx.fillRect(wx, wy, 5, 7);
    }
    x += bw + 2;
  }
}

function beach(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  sky.addColorStop(0, "#60a5fa");
  sky.addColorStop(1, "#dbeafe");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.55);
  ctx.fillStyle = "#fef9c3";
  ctx.beginPath();
  ctx.arc(w * 0.8, h * 0.18, h * 0.08, 0, Math.PI * 2);
  ctx.fill(); // sun
  const sea = ctx.createLinearGradient(0, h * 0.55, 0, h * 0.72);
  sea.addColorStop(0, "#0284c7");
  sea.addColorStop(1, "#38bdf8");
  ctx.fillStyle = sea;
  ctx.fillRect(0, h * 0.55, w, h * 0.17);
  ctx.fillStyle = "#f0f9ff";
  ctx.fillRect(0, h * 0.715, w, h * 0.012); // surf line
  ctx.fillStyle = "#f5deb3";
  ctx.fillRect(0, h * 0.725, w, h * 0.275); // sand
  ctx.fillStyle = "#7c5a3a";
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h);
  ctx.quadraticCurveTo(w * 0.13, h * 0.6, w * 0.2, h * 0.32);
  ctx.lineTo(w * 0.215, h * 0.33);
  ctx.quadraticCurveTo(w * 0.15, h * 0.62, w * 0.13, h);
  ctx.fill(); // palm trunk
  ctx.fillStyle = "#15803d";
  for (const a of [-2.6, -2, -1.2, -0.5, 0.2]) {
    ctx.beginPath();
    ctx.ellipse(w * 0.205 + Math.cos(a) * w * 0.07, h * 0.32 + Math.sin(a) * h * 0.06, w * 0.08, h * 0.022, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

function mountains(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#fde68a");
  sky.addColorStop(0.5, "#fca5a5");
  sky.addColorStop(1, "#a78bfa");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const ridge = (base, amp, color, seed) => {
    const rnd = seeded(seed);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 8) ctx.lineTo(x, h * base - rnd() * h * amp);
    ctx.lineTo(w, h);
    ctx.fill();
  };
  ridge(0.62, 0.3, "#7c6aa8", 3);
  ridge(0.75, 0.22, "#4c3f75", 9);
  ridge(0.9, 0.14, "#2e2550", 21);
}

function galaxy(ctx, w, h) {
  const rnd = seeded(99);
  const g = ctx.createRadialGradient(w * 0.6, h * 0.4, 0, w * 0.6, h * 0.4, w * 0.7);
  g.addColorStop(0, "#4c1d95");
  g.addColorStop(0.5, "#1e1b4b");
  g.addColorStop(1, "#020617");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 900; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
    ctx.fillRect(rnd() * w, rnd() * h, rnd() > 0.95 ? 2 : 1, rnd() > 0.95 ? 2 : 1);
  }
  ctx.fillStyle = "#f472b6";
  ctx.beginPath();
  ctx.arc(w * 0.15, h * 0.25, h * 0.06, 0, Math.PI * 2);
  ctx.fill(); // a planet
}

function modernOffice(ctx, w, h) {
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, w, h);
  // floor-to-ceiling windows with a skyline
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.75);
  sky.addColorStop(0, "#bae6fd");
  sky.addColorStop(1, "#f0f9ff");
  ctx.fillStyle = sky;
  ctx.fillRect(w * 0.05, h * 0.05, w * 0.9, h * 0.7);
  const rnd = seeded(5);
  for (let x = w * 0.05; x < w * 0.95; ) {
    const bw = w * (0.04 + rnd() * 0.05);
    const bh = h * (0.15 + rnd() * 0.3);
    ctx.fillStyle = `hsl(210 15% ${62 + rnd() * 15}%)`;
    ctx.fillRect(x, h * 0.75 - bh, Math.min(bw, w * 0.95 - x), bh);
    x += bw + 3;
  }
  ctx.fillStyle = "#9ca3af";
  for (let i = 0; i <= 4; i++) ctx.fillRect(w * 0.05 + (i * w * 0.9) / 4 - 4, h * 0.05, 8, h * 0.7); // mullions
  ctx.fillStyle = "#d6d3d1";
  ctx.fillRect(0, h * 0.75, w, h * 0.25); // floor
  ctx.fillStyle = "#57534e";
  rrect(ctx, w * 0.62, h * 0.7, w * 0.3, h * 0.05, 6); // desk
  ctx.fillStyle = "#3f7d4f";
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(w * 0.12 + (rnd() - 0.5) * w * 0.05, h * (0.5 + rnd() * 0.15), w * 0.025, h * 0.07, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#e7e5e4";
  rrect(ctx, w * 0.09, h * 0.66, w * 0.06, h * 0.1, 6); // plant pot
}

/**
 * Effects shown in the picker. blur = background blur radius in pixels at 1280 px wide (scaled to the camera);
 * shrink = the fallback for browsers without canvas filters (how far the background is shrunk and stretched back).
 */
export const EFFECTS = [
  { id: "none", label: "No effect", swatch: "transparent" },
  { id: "blur-light", label: "Slightly blur", blur: 10, shrink: 8, swatch: "linear-gradient(135deg,#94a3b8,#cbd5e1)" },
  { id: "blur", label: "Blur", blur: 26, shrink: 20, swatch: "linear-gradient(135deg,#64748b,#94a3b8)" },
  { id: "office-modern", label: "Modern office", paint: modernOffice, scene: true },
  { id: "bookshelf", label: "Bookshelf", paint: bookshelf, scene: true },
  { id: "living", label: "Living room", paint: livingRoom, scene: true },
  { id: "beach", label: "Beach", paint: beach, scene: true },
  { id: "mountains", label: "Mountains", paint: mountains, scene: true },
  { id: "city", label: "City at night", paint: cityNight, scene: true },
  { id: "galaxy", label: "Space", paint: galaxy, scene: true },
  { id: "studio", label: "Studio", paint: gradient(["#0f172a", "#1e3a8a", "#312e81"]), swatch: "linear-gradient(135deg,#0f172a,#1e3a8a,#312e81)" },
  { id: "sunset", label: "Sunset", paint: gradient(["#f97316", "#db2777", "#7c3aed"]), swatch: "linear-gradient(135deg,#f97316,#db2777,#7c3aed)" },
  { id: "ocean", label: "Ocean", paint: gradient(["#0ea5e9", "#0369a1", "#0c4a6e"]), swatch: "linear-gradient(135deg,#0ea5e9,#0369a1,#0c4a6e)" },
  { id: "forest", label: "Forest", paint: gradient(["#4ade80", "#15803d", "#14532d"]), swatch: "linear-gradient(135deg,#4ade80,#15803d,#14532d)" },
  { id: "office", label: "Office", paint: gradient(["#e7e5e4", "#a8a29e", "#57534e"]), swatch: "linear-gradient(135deg,#e7e5e4,#a8a29e,#57534e)" },
];

/** Colour filters (Meet's "Filters" tab) — CSS filters applied to the whole picture. */
export const FILTERS = [
  { id: "none", label: "None", css: "" },
  { id: "warm", label: "Warm", css: "sepia(.22) saturate(1.2) hue-rotate(-8deg)" },
  { id: "cool", label: "Cool", css: "saturate(1.1) hue-rotate(10deg) brightness(1.03)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.45) contrast(1.08)" },
  { id: "mono", label: "Black & white", css: "grayscale(1) contrast(1.1)" },
  { id: "vintage", label: "Vintage", css: "sepia(.5) contrast(.95) brightness(1.05)" },
  { id: "studio", label: "Studio light", css: "brightness(1.06) contrast(1.05) saturate(1.08)" },
  { id: "soft", label: "Soft glow", css: "brightness(1.08) contrast(.94) saturate(1.05)" },
];
const LOW_LIGHT = "brightness(1.35) contrast(1.06) saturate(1.05)"; // "Adjust for low light"

// Canvas filters (blur, colour) are fast where supported (Chrome, Edge, Firefox, Safari 18+)
const CANVAS_FILTER = typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;
const smoothstep = (lo, hi, x) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/** A small preview image of a drawn scene (for the picker). */
export function sceneSwatch(effect, w = 160, h = 90) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  effect.paint(c.getContext("2d"), w, h);
  return `url(${c.toDataURL()}) center / cover`;
}

const canvas = (w, h) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/** Draws one processed frame: you (from the mask) over a blurred or replaced background, then the colour filter. */
class Compositor {
  constructor(segmenter, effect, image, css) {
    this.seg = segmenter; // null when only a filter / low-light is on (no background change)
    this.effect = effect ?? {};
    this.image = image; // ImageBitmap for "your own image"
    this.css = css; // CSS filter string, "" for none
    this.lastTs = 0;
  }

  size(w, h) {
    if (this.out?.width === w && this.out?.height === h) return;
    this.out = canvas(w, h);
    this.ctx = this.out.getContext("2d");
    this.final = canvas(w, h);
    this.fctx = this.final.getContext("2d");
    this.bg = canvas(w, h);
    const bctx = this.bg.getContext("2d");
    if (this.image) {
      const s = Math.max(w / this.image.width, h / this.image.height); // cover
      bctx.drawImage(this.image, (w - this.image.width * s) / 2, (h - this.image.height * s) / 2, this.image.width * s, this.image.height * s);
    } else this.effect.paint?.(bctx, w, h);
    // blur: filter a quarter-size copy (fast), or without filters, shrink hard and stretch back
    const k = CANVAS_FILTER ? 4 : (this.effect.shrink ?? 1);
    this.small = canvas(Math.max(8, Math.round(w / k)), Math.max(8, Math.round(h / k)));
    this.sctx = this.small.getContext("2d");
  }

  /** The colour filter / low-light boost over the finished picture (skipped when none is on). */
  filtered(src, w, h) {
    if (!this.css) return src;
    this.fctx.filter = this.css;
    this.fctx.drawImage(src, 0, 0, w, h);
    this.fctx.filter = "none";
    return this.final;
  }

  draw(source, w, h) {
    this.size(w, h);
    if (!this.seg) return this.filtered(source, w, h);
    const ts = Math.max(performance.now(), this.lastTs + 1); // MediaPipe needs increasing timestamps
    this.lastTs = ts;
    const res = this.seg.segmentForVideo(source, ts);
    const mask = res.confidenceMasks?.[0];
    if (mask) {
      if (!this.mask || this.mask.width !== mask.width || this.mask.height !== mask.height) {
        this.mask = canvas(mask.width, mask.height);
        this.mctx = this.mask.getContext("2d");
        this.maskImage = new ImageData(mask.width, mask.height);
      }
      const conf = mask.getAsFloat32Array();
      // steady edges: blend with the last frames (no flicker), then sharpen the soft middle of the mask
      if (this.smooth?.length !== conf.length) this.smooth = Float32Array.from(conf);
      const sm = this.smooth;
      const px = this.maskImage.data;
      for (let i = 0; i < conf.length; i++) {
        const c = conf[i];
        sm[i] += (c - sm[i]) * (Math.abs(c - sm[i]) > 0.5 ? 0.85 : 0.55); // follow fast movement, damp jitter
        px[i * 4 + 3] = smoothstep(0.3, 0.7, sm[i]) * 255;
      }
      this.mctx.putImageData(this.maskImage, 0, 0);
    }
    res.close();

    const ctx = this.ctx;
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(source, 0, 0, w, h); // you…
    if (this.mask) {
      ctx.globalCompositeOperation = "destination-in";
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      if (CANVAS_FILTER) ctx.filter = `blur(${Math.max(1, w / 640)}px)`; // feathered edge, like a real lens
      ctx.drawImage(this.mask, 0, 0, w, h); // …cut out by the mask
      ctx.filter = "none";
    }
    ctx.globalCompositeOperation = "destination-over"; // background goes behind you
    if (this.effect.blur) {
      const s = this.sctx,
        sw = this.small.width,
        sh = this.small.height;
      s.imageSmoothingQuality = "high";
      if (CANVAS_FILTER) {
        const r = (this.effect.blur * w) / 1280 / 4; // radius on the quarter-size copy
        s.filter = `blur(${r}px)`;
        s.drawImage(source, -r * 2, -r * 2, sw + r * 4, sh + r * 4); // drawn past the edges: no dark border
        s.filter = "none";
      } else s.drawImage(source, 0, 0, sw, sh);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this.small, 0, 0, w, h);
    } else ctx.drawImage(this.bg, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    return this.filtered(this.out, w, h);
  }
}

/**
 * Process a camera track with an effect. Returns { track, stop() }: send / show `track`, call stop() to end it
 * (the source camera track is left running — its owner stops it).
 */
export async function applyEffect(sourceTrack, { id = "none", image = null, filter = "none", lowLight = false } = {}) {
  const background = id === "image" && image ? { id: "image" } : EFFECTS.find((e) => e.id === id && e.id !== "none") ?? null;
  const css = [FILTERS.find((f) => f.id === filter)?.css, lowLight && LOW_LIGHT].filter(Boolean).join(" ");
  if (!background && !css) return { track: sourceTrack, stop: () => {} };
  const comp = new Compositor(background ? await loadSegmenter() : null, background, image, css);
  let stopped = false;

  if (typeof MediaStreamTrackProcessor !== "undefined" && typeof MediaStreamTrackGenerator !== "undefined") {
    const processor = new MediaStreamTrackProcessor({ track: sourceTrack });
    const generator = new MediaStreamTrackGenerator({ kind: "video" });
    const reader = processor.readable.getReader();
    const writer = generator.writable.getWriter();
    (async () => {
      while (!stopped) {
        const { value: frame, done } = await reader.read().catch(() => ({ done: true }));
        if (done) break;
        try {
          const out = comp.draw(frame, frame.displayWidth, frame.displayHeight);
          const next = new VideoFrame(out, { timestamp: frame.timestamp });
          await writer.write(next);
        } catch {
          /* a dropped frame */
        } finally {
          frame.close();
        }
      }
    })();
    generator.contentHint = "motion";
    return {
      track: generator,
      stop: () => {
        stopped = true;
        reader.cancel().catch(() => {});
        generator.stop();
      },
    };
  }

  // fallback: <video> -> canvas -> captureStream
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([sourceTrack]);
  await video.play();
  const visible = document.createElement("canvas");
  const vctx = visible.getContext("2d");
  const loop = () => {
    if (stopped) return;
    const w = video.videoWidth,
      h = video.videoHeight;
    if (w && h) {
      if (visible.width !== w) [visible.width, visible.height] = [w, h];
      vctx.drawImage(comp.draw(video, w, h), 0, 0);
    }
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(loop);
    else setTimeout(loop, 33);
  };
  loop();
  const track = visible.captureStream(30).getVideoTracks()[0];
  return {
    track,
    stop: () => {
      stopped = true;
      track.stop();
      video.srcObject = null;
    },
  };
}

/** Is any processing on (background, filter or low light)? */
export const effectActive = (e = {}) => (e.id ?? "none") !== "none" || (e.filter ?? "none") !== "none" || !!e.lowLight;
