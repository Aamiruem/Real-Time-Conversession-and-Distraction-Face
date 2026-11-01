// Google Meet-style pop-out: a small always-on-top window with the live meeting (everyone's video, the shared
// screen big) and its controls, so you can present your screen or work in another tab or app and still see and
// run the call. Chrome / Edge: a Document Picture-in-Picture window with real buttons. Other browsers: a
// picture-in-picture video whose built-in buttons (mic, camera, hang up) work where the browser offers them.
import { StageDrawer } from "./meetRecorder";

const FPS = 15;
const ICONS = {
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  micOff: '<path d="m2 2 20 20M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7M17 16.9A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.1 1.2M12 19v3"/>',
  cam: '<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  camOff: '<path d="m2 2 20 20M10.7 6H14a2 2 0 0 1 2 2v3.3l1 1L22 9v7M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  present: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v6"/>',
  hangup: '<path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8" transform="rotate(135 12 12)"/>',
};
const svg = (name) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

const STYLE = `
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #202124; font-family: Inter, system-ui, sans-serif; overflow: hidden; }
  body { display: grid; grid-template-rows: minmax(0, 1fr) auto; }
  video { width: 100%; height: 100%; object-fit: contain; background: #202124; display: block; }
  .bar { display: flex; justify-content: center; gap: 10px; padding: 10px; background: #202124; }
  button { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 50%; cursor: pointer;
    background: #3c4043; color: #fff; transition: background .15s; }
  button:hover { background: #5f6368; }
  button.off { background: #ea4335; }
  button.on { background: #8ab4f8; color: #202124; }
  button.end { width: 56px; border-radius: 22px; background: #ea4335; }
  button.end:hover { background: #d93025; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button:focus-visible { outline: 2px solid #8ab4f8; outline-offset: 2px; }
`;

/** A timer that keeps its pace while the meeting tab is in the background (tab timers drop to 1/s there). */
function ticker(fn) {
  const src = `setInterval(() => postMessage(0), ${Math.round(1000 / FPS)});`;
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
  worker.onmessage = fn;
  return () => worker.terminate();
}

export const canPopOut = () =>
  typeof window !== "undefined" && ("documentPictureInPicture" in window || document.pictureInPictureEnabled);

export class MeetPopout {
  /**
   * @param {HTMLElement} stage the meeting stage (.gm-stage)
   * @param {{ state: () => {mic: boolean, cam: boolean, screen: boolean, canShare: boolean},
   *           toggleMic: () => void, toggleCam: () => void, toggleShare: () => void, leave: () => void }} actions
   */
  constructor(stage, actions) {
    this.stage = stage;
    this.actions = actions;
    this.win = null; // Document PiP window, or null when closed / using the video fallback
    this.video = null;
  }

  get isOpen() {
    return !!this.win || (!!this.video && document.pictureInPictureElement === this.video);
  }

  async open() {
    if (this.isOpen) return;
    this.drawer = new StageDrawer(this.stage, 640, 360);
    this.drawer.drawStage();
    this.stopTick = ticker(() => {
      this.drawer.drawStage();
      this.refresh();
    });
    const stream = (this.stream = this.drawer.canvas.captureStream(FPS));
    try {
      if ("documentPictureInPicture" in window) await this.openWindow(stream);
      else await this.openVideo(stream);
    } catch (e) {
      this.close();
      throw e;
    }
  }

  /** Chrome / Edge: a real mini window with buttons. */
  async openWindow(stream) {
    const win = await window.documentPictureInPicture.requestWindow({ width: 420, height: 300 });
    this.win = win;
    const doc = win.document;
    doc.title = "Presence Meet";
    doc.head.append(Object.assign(doc.createElement("style"), { textContent: STYLE }));
    const video = Object.assign(doc.createElement("video"), { autoplay: true, muted: true, playsInline: true });
    video.srcObject = stream;
    const bar = doc.createElement("div");
    bar.className = "bar";
    this.buttons = {};
    const add = (key, onClick, cls = "") => {
      const b = doc.createElement("button");
      b.className = cls;
      b.addEventListener("click", onClick);
      bar.append(b);
      this.buttons[key] = b;
    };
    add("mic", () => this.actions.toggleMic());
    add("cam", () => this.actions.toggleCam());
    add("share", () => this.actions.toggleShare());
    add("leave", () => this.actions.leave(), "end");
    this.buttons.leave.innerHTML = svg("hangup");
    this.buttons.leave.title = "Leave call";
    doc.body.append(video, bar);
    this.last = "";
    this.refresh();
    win.addEventListener("pagehide", () => this.close());
  }

  /** Other browsers: a picture-in-picture video; mic / camera / hang-up go through the media session buttons. */
  async openVideo(stream) {
    const video = Object.assign(document.createElement("video"), { muted: true, playsInline: true });
    video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;right:0";
    video.srcObject = stream;
    document.body.append(video);
    this.video = video;
    await video.play();
    const ms = navigator.mediaSession;
    const handle = (action, fn) => {
      try {
        ms?.setActionHandler(action, fn);
      } catch {
        /* this browser doesn't offer that button */
      }
    };
    handle("togglemicrophone", () => this.actions.toggleMic());
    handle("togglecamera", () => this.actions.toggleCam());
    handle("hangup", () => this.actions.leave());
    video.addEventListener("leavepictureinpicture", () => this.close(), { once: true });
    await video.requestPictureInPicture();
  }

  /** Keep the buttons in step with the meeting (also after changes made in the main window). */
  refresh() {
    const s = this.actions.state();
    try {
      navigator.mediaSession?.setMicrophoneActive?.(s.mic);
      navigator.mediaSession?.setCameraActive?.(s.cam);
    } catch {
      /* not supported */
    }
    if (!this.win) return;
    const key = `${s.mic}${s.cam}${s.screen}${s.canShare}`;
    if (key === this.last) return;
    this.last = key;
    const { mic, cam, share } = this.buttons;
    mic.innerHTML = svg(s.mic ? "mic" : "micOff");
    mic.className = s.mic ? "" : "off";
    mic.title = s.mic ? "Turn off microphone" : "Turn on microphone";
    cam.innerHTML = svg(s.cam ? "cam" : "camOff");
    cam.className = s.cam ? "" : "off";
    cam.title = s.cam ? "Turn off camera" : "Turn on camera";
    share.innerHTML = svg("present");
    share.className = s.screen ? "on" : "";
    share.title = s.screen ? "Stop presenting" : "Present your screen";
    share.disabled = !s.screen && !s.canShare;
  }

  close() {
    this.stopTick?.();
    this.stopTick = null;
    if (this.win && !this.win.closed) this.win.close();
    this.win = null;
    if (this.video) {
      if (document.pictureInPictureElement === this.video) document.exitPictureInPicture().catch(() => {});
      this.video.remove();
      this.video = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.drawer = null;
  }
}
