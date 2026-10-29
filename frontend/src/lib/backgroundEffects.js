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

/** Effects shown in the picker. blur = how far the background is shrunk before being stretched back (bigger = softer). */
export const EFFECTS = [
  { id: "none", label: "No effect", swatch: "transparent" },
  { id: "blur-light", label: "Slightly blur", blur: 8, swatch: "linear-gradient(135deg,#94a3b8,#cbd5e1)" },
  { id: "blur", label: "Blur", blur: 20, swatch: "linear-gradient(135deg,#64748b,#94a3b8)" },
  { id: "studio", label: "Studio", paint: gradient(["#0f172a", "#1e3a8a", "#312e81"]), swatch: "linear-gradient(135deg,#0f172a,#1e3a8a,#312e81)" },
  { id: "sunset", label: "Sunset", paint: gradient(["#f97316", "#db2777", "#7c3aed"]), swatch: "linear-gradient(135deg,#f97316,#db2777,#7c3aed)" },
  { id: "ocean", label: "Ocean", paint: gradient(["#0ea5e9", "#0369a1", "#0c4a6e"]), swatch: "linear-gradient(135deg,#0ea5e9,#0369a1,#0c4a6e)" },
  { id: "forest", label: "Forest", paint: gradient(["#4ade80", "#15803d", "#14532d"]), swatch: "linear-gradient(135deg,#4ade80,#15803d,#14532d)" },
  { id: "office", label: "Office", paint: gradient(["#e7e5e4", "#a8a29e", "#57534e"]), swatch: "linear-gradient(135deg,#e7e5e4,#a8a29e,#57534e)" },
];

const canvas = (w, h) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/** Draws one processed frame: you (from the mask) over a blurred or replaced background. */
class Compositor {
  constructor(segmenter, effect, image) {
    this.seg = segmenter;
    this.effect = effect;
    this.image = image; // ImageBitmap for "your own image"
    this.lastTs = 0;
  }

  size(w, h) {
    if (this.out?.width === w && this.out?.height === h) return;
    this.out = canvas(w, h);
    this.ctx = this.out.getContext("2d");
    this.bg = canvas(w, h);
    const bctx = this.bg.getContext("2d");
    if (this.image) {
      const s = Math.max(w / this.image.width, h / this.image.height); // cover
      bctx.drawImage(this.image, (w - this.image.width * s) / 2, (h - this.image.height * s) / 2, this.image.width * s, this.image.height * s);
    } else this.effect.paint?.(bctx, w, h);
    const k = this.effect.blur ?? 1;
    this.small = canvas(Math.max(8, Math.round(w / k)), Math.max(8, Math.round(h / k)));
    this.sctx = this.small.getContext("2d");
  }

  draw(source, w, h) {
    this.size(w, h);
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
      const px = this.maskImage.data;
      for (let i = 0; i < conf.length; i++) px[i * 4 + 3] = conf[i] * 255;
      this.mctx.putImageData(this.maskImage, 0, 0);
    }
    res.close();

    const ctx = this.ctx;
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(source, 0, 0, w, h); // you…
    if (this.mask) {
      ctx.globalCompositeOperation = "destination-in";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.mask, 0, 0, w, h); // …cut out by the mask (smooth upscaling = soft edges)
    }
    ctx.globalCompositeOperation = "destination-over"; // background goes behind you
    if (this.effect.blur) {
      // shrink then stretch back: a fast, smooth blur that works in every browser
      this.sctx.imageSmoothingQuality = "high";
      this.sctx.drawImage(source, 0, 0, this.small.width, this.small.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this.small, 0, 0, w, h);
    } else ctx.drawImage(this.bg, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    return this.out;
  }
}

/**
 * Process a camera track with an effect. Returns { track, stop() }: send / show `track`, call stop() to end it
 * (the source camera track is left running — its owner stops it).
 */
export async function applyEffect(sourceTrack, effectId, image = null) {
  const effect = EFFECTS.find((e) => e.id === effectId) ?? (image ? { id: "image" } : null);
  if (!effect || effect.id === "none") return { track: sourceTrack, stop: () => {} };
  const comp = new Compositor(await loadSegmenter(), effect, image);
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
