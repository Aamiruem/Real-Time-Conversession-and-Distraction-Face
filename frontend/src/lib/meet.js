// Video meetings over WebRTC. The backend only introduces people (/ws/meet/{code}); audio and video flow
// directly between browsers, encrypted end to end by them (DTLS-SRTP). Everyone connects to everyone (mesh).
import { getToken, wsBase } from "./api";
import { applyEffect } from "./backgroundEffects";

export const QUALITY = {
  hd: { label: "HD 720p", video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, bitrate: 1_800_000 },
  fullhd: { label: "Full HD 1080p", video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, bitrate: 3_500_000 },
  saver: { label: "Data saver 360p", video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } }, bitrate: 450_000 },
};
const SCREEN_BITRATE = 2_500_000;
const AUDIO_BITRATE = 64_000; // Opus: clear, natural speech
// echo cancellation + noise suppression + automatic gain, 48 kHz mono: the "studio" settings of Meet / Zoom
export const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 };

export async function openMedia({ quality = "hd", videoId, audioId, video = true, audio = true } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: video && { ...QUALITY[quality].video, ...(videoId ? { deviceId: { exact: videoId } } : { facingMode: "user" }) },
    audio: audio && { ...AUDIO, ...(audioId && { deviceId: { exact: audioId } }) },
  });
  stream.getVideoTracks().forEach((t) => (t.contentHint = "motion")); // faces: keep it smooth
  stream.getAudioTracks().forEach((t) => (t.contentHint = "speech"));
  return stream;
}

export async function listDevices() {
  const all = await navigator.mediaDevices.enumerateDevices();
  const named = (kind, base) =>
    all.filter((d) => d.kind === kind && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || `${base} ${i + 1}` }));
  return { cameras: named("videoinput", "Camera"), mics: named("audioinput", "Microphone"), speakers: named("audiooutput", "Speaker") };
}

/** Upload bitrate per connection: everyone sends a copy to everyone, so more people = less per copy. */
export function videoBitrate(base, others) {
  if (others <= 1) return base;
  if (others <= 3) return Math.round(base * 0.55);
  return Math.round(base * 0.3);
}

/** Connection quality from round-trip time (s) and packet loss (0-1). */
export function rate(rtt, loss) {
  if (rtt == null) return "unknown";
  if (rtt < 0.15 && loss < 0.02) return "good";
  if (rtt < 0.4 && loss < 0.08) return "fair";
  return "poor";
}

export const inviteLink = (code) => `${window.location.origin}/app/meet?code=${code}`;

export class Meeting {
  /** @param {string} code  @param {{stream: MediaStream, quality: string, onChange: (s) => void}} opts */
  constructor(code, { stream, quality = "hd", effect = { id: "none" }, onChange }) {
    this.code = code;
    this.stream = stream;
    this.quality = quality;
    this.onChange = onChange;
    this.pcs = new Map(); // peer id -> { pc, polite, makingOffer, ignoreOffer, stream, lastStats }
    this.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    this.screen = null;
    this.effect = effect; // { id, image }: background blur / replacement
    this.fx = null; // { track, stop } while an effect runs
    this.retries = 0;
    this.state = { status: "connecting", you: null, peers: {}, chat: [], reactions: [], started: null };
  }

  emit(patch) {
    this.state = { ...this.state, ...patch };
    this.onChange?.(this.state);
  }

  setPeer(id, patch) {
    const cur = this.state.peers[id] ?? { id };
    this.emit({ peers: { ...this.state.peers, [id]: { ...cur, ...patch } } });
  }

  connect() {
    const ws = new WebSocket(`${wsBase()}/ws/meet/${this.code}?token=${encodeURIComponent(getToken() ?? "")}`);
    this.ws = ws;
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(e.data));
      } catch (err) {
        console.warn("meet: bad message", err);
      }
    };
    ws.onclose = (e) => {
      if (this.state.status === "left" || this.ws !== ws) return;
      if (e.code === 4403 || this.state.status === "full") return this.emit({ status: "full" });
      if (e.code === 4401) return this.emit({ status: "unauthorized" });
      // network blip: rejoin (as a new participant; the others drop the old connection)
      this.closeAll();
      if (this.retries++ < 5) {
        this.emit({ status: "reconnecting", peers: {} });
        setTimeout(() => this.state.status === "reconnecting" && this.connect(), 1500 * this.retries);
      } else this.emit({ status: "disconnected" });
    };
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  async onMessage(m) {
    switch (m.type) {
      case "welcome": {
        this.retries = 0;
        this.iceServers = m.ice_servers?.length ? m.ice_servers : this.iceServers;
        const peers = Object.fromEntries(m.peers.map((p) => [p.id, p]));
        this.emit({ status: "joined", you: m.you, peers, chat: m.chat ?? [], started: m.started * 1000 });
        this.send({ type: "state", ...this.localState() });
        for (const p of m.peers) this.createPC(p.id); // the newcomer calls everyone (their tracks trigger the offers)
        break;
      }
      case "joined":
        this.setPeer(m.id, m); // their offer arrives as a "signal"
        break;
      case "state":
        this.setPeer(m.id, m);
        break;
      case "left": {
        this.closePC(m.id);
        const { [m.id]: _gone, ...rest } = this.state.peers;
        this.emit({ peers: rest });
        this.applyBitrates();
        break;
      }
      case "signal":
        await this.onSignal(m);
        break;
      case "chat":
        this.emit({ chat: [...this.state.chat, m].slice(-200) });
        break;
      case "react": {
        const r = { ...m, key: `${Date.now()}-${Math.random()}` };
        this.emit({ reactions: [...this.state.reactions, r] });
        setTimeout(() => this.emit({ reactions: this.state.reactions.filter((x) => x.key !== r.key) }), 4000);
        break;
      }
      case "full":
        this.emit({ status: "full", maxPeople: m.max_people });
        break;
      default:
    }
  }

  localState() {
    const a = this.stream?.getAudioTracks()[0];
    const v = this.stream?.getVideoTracks()[0];
    return { mic: !!a?.enabled, cam: !!v && v.readyState === "live" && v.enabled, screen: !!this.screen, hand: !!this.hand };
  }

  // ------------------------------------------------------------ WebRTC ("perfect negotiation")
  /** What we send for a kind right now: the mic, or the screen share / live camera (null = camera off). */
  localTrack(kind) {
    if (kind === "audio") return this.stream?.getAudioTracks()[0] ?? null;
    const cam = this.stream?.getVideoTracks()[0];
    return this.screen ?? (cam?.readyState === "live" ? (this.fx?.track ?? cam) : null);
  }

  /** Your own preview: the camera with its effect (a stable object while nothing changes). */
  get displayStream() {
    if (this.screen) return this.screenStream;
    const v = this.localTrack("video");
    if (this._display?.getVideoTracks()[0] !== v) this._display = v ? new MediaStream([v]) : this.stream;
    return this._display;
  }

  /** Background blur / replacement (see backgroundEffects.js); applies to the live camera and survives camera off/on. */
  async setEffect(effect) {
    this.effect = effect;
    this.fx?.stop();
    this.fx = null;
    const cam = this.stream?.getVideoTracks()[0];
    if (cam?.readyState === "live" && effect.id !== "none") this.fx = await applyEffect(cam, effect.id, effect.image);
    if (!this.screen) await this.replace("video", this.localTrack("video"));
    this.emit({});
  }

  /**
   * One audio + one video slot per connection, both send-and-receive, so camera on/off and screen share are
   * just replaceTrack (instant, no renegotiation). The caller creates the slots; the answerer adopts the
   * caller's slots when the offer arrives (see onSignal) instead of adding its own.
   */
  createPC(id, answerer = false) {
    if (this.pcs.has(id)) return this.pcs.get(id);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: "max-bundle" });
    const entry = { pc, polite: this.state.you > id, makingOffer: false, ignoreOffer: false, stream: new MediaStream(),
                    adopt: answerer };
    this.pcs.set(id, entry);
    if (!answerer) {
      for (const kind of ["audio", "video"]) {
        const t = pc.addTransceiver(kind, { direction: "sendrecv", streams: this.stream ? [this.stream] : [] });
        t.sender.replaceTrack(this.localTrack(kind)).catch(() => {});
      }
    }

    pc.ontrack = ({ track }) => {
      entry.stream.getTracks().filter((t) => t.kind === track.kind).forEach((t) => entry.stream.removeTrack(t));
      entry.stream.addTrack(track);
      this.setPeer(id, { stream: entry.stream, tracks: entry.stream.getTracks().length });
    };
    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        this.send({ type: "signal", to: id, description: pc.localDescription });
      } catch (e) {
        console.warn("meet: offer failed", e);
      } finally {
        entry.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => candidate && this.send({ type: "signal", to: id, candidate });
    pc.onconnectionstatechange = () => {
      this.setPeer(id, { connection: pc.connectionState });
      if (pc.connectionState === "connected") this.applyBitrates();
      if (pc.connectionState === "failed") pc.restartIce(); // new network path (Wi-Fi <-> mobile, VPN…)
    };
    return entry;
  }

  async onSignal({ from, description, candidate }) {
    const entry = this.pcs.get(from) ?? this.createPC(from, true);
    const { pc } = entry;
    try {
      if (description) {
        const collision = description.type === "offer" && (entry.makingOffer || pc.signalingState !== "stable");
        entry.ignoreOffer = !entry.polite && collision;
        if (entry.ignoreOffer) return;
        await pc.setRemoteDescription(description);
        if (entry.adopt && description.type === "offer") {
          // answering a new caller: send our mic and camera on the slots they offered
          entry.adopt = false;
          for (const t of pc.getTransceivers()) {
            t.direction = "sendrecv";
            if (this.stream) t.sender.setStreams?.(this.stream);
            await t.sender.replaceTrack(this.localTrack(t.receiver.track.kind));
          }
        }
        if (description.type === "offer") {
          await pc.setLocalDescription();
          this.send({ type: "signal", to: from, description: pc.localDescription });
        }
      } else if (candidate) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (e) {
          if (!entry.ignoreOffer) throw e;
        }
      }
    } catch (e) {
      console.warn("meet: signaling error", e);
    }
  }

  sender(entry, kind) {
    return entry.pc.getTransceivers().find((t) => t.receiver.track.kind === kind)?.sender;
  }

  /** Bitrate, resolution and smoothness per connection (re-run when people join or leave, or on screen share). */
  applyBitrates() {
    const others = this.pcs.size;
    for (const entry of this.pcs.values()) {
      for (const [kind, max, pref] of [
        ["video", this.screen ? SCREEN_BITRATE : videoBitrate(QUALITY[this.quality].bitrate, others), this.screen ? "maintain-resolution" : "balanced"],
        ["audio", AUDIO_BITRATE, null],
      ]) {
        const s = this.sender(entry, kind);
        if (!s) continue;
        const p = s.getParameters();
        if (!p.encodings?.length) continue; // not negotiated yet: called again once connected
        p.encodings[0].maxBitrate = max;
        if (pref) p.degradationPreference = pref;
        s.setParameters(p).catch(() => {});
      }
    }
  }

  async replace(kind, track) {
    await Promise.all([...this.pcs.values()].map((e) => this.sender(e, kind)?.replaceTrack(track ?? null)));
  }

  // ------------------------------------------------------------ controls
  /** Mute / unmute; if you joined without a microphone, unmuting asks for it. */
  async setMic(on) {
    if (on && !this.stream.getAudioTracks().length) {
      const fresh = (await openMedia({ video: false })).getAudioTracks()[0];
      this.stream.addTrack(fresh);
      this.stream = new MediaStream(this.stream.getTracks());
      await this.replace("audio", fresh);
    }
    this.stream.getAudioTracks().forEach((t) => (t.enabled = on));
    this.send({ type: "state", mic: on });
  }

  /** Camera off really stops it (the camera light goes off); on asks for a fresh track. */
  async setCam(on, videoId) {
    const old = this.stream.getVideoTracks()[0];
    if (!on) {
      this.fx?.stop();
      this.fx = null;
      old?.stop();
      if (!this.screen) await this.replace("video", null);
    } else {
      const fresh = (await openMedia({ quality: this.quality, videoId, audio: false })).getVideoTracks()[0];
      if (old) this.stream.removeTrack(old);
      this.stream.addTrack(fresh);
      this.stream = new MediaStream(this.stream.getTracks()); // a new object, so previews pick up the new camera
      if (this.effect.id !== "none") this.fx = await applyEffect(fresh, this.effect.id, this.effect.image);
      if (!this.screen) await this.replace("video", this.localTrack("video"));
    }
    this.send({ type: "state", cam: on });
  }

  async switchMic(audioId) {
    const fresh = (await openMedia({ audioId, video: false })).getAudioTracks()[0];
    const old = this.stream.getAudioTracks()[0];
    fresh.enabled = old ? old.enabled : true;
    old?.stop();
    if (old) this.stream.removeTrack(old);
    this.stream.addTrack(fresh);
    this.stream = new MediaStream(this.stream.getTracks());
    await this.replace("audio", fresh);
  }

  async setQuality(quality, videoId) {
    this.quality = quality;
    const cam = this.stream.getVideoTracks()[0];
    if (cam?.readyState === "live") {
      await cam.applyConstraints(QUALITY[quality].video).catch(() => this.setCam(true, videoId));
    }
    this.applyBitrates();
  }

  async shareScreen() {
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    const track = display.getVideoTracks()[0];
    track.contentHint = "detail"; // slides and code: keep text sharp
    this.screen = track;
    this.screenStream = new MediaStream([track]); // one stable object for your own preview
    track.onended = () => this.stopShare(); // the browser's own "Stop sharing" button
    await this.replace("video", track);
    this.applyBitrates();
    this.send({ type: "state", screen: true });
    return display;
  }

  async stopShare() {
    if (!this.screen) return;
    this.screen.stop();
    this.screen = null;
    this.screenStream = null;
    await this.replace("video", this.localTrack("video")); // back to the camera, with its background effect
    this.applyBitrates();
    this.send({ type: "state", screen: false });
  }

  setHand(up) {
    this.hand = up;
    this.send({ type: "state", hand: up });
  }

  chat(text) {
    if (text.trim()) this.send({ type: "chat", text: text.trim() });
  }

  react(emoji) {
    this.send({ type: "react", emoji });
  }

  /** Live connection quality per person (round-trip time + packet loss of what they send you). */
  async pollStats() {
    for (const [id, entry] of this.pcs) {
      try {
        const stats = await entry.pc.getStats();
        let rtt = null,
          lost = 0,
          got = 0;
        stats.forEach((s) => {
          if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded") rtt = s.currentRoundTripTime ?? rtt;
          if (s.type === "inbound-rtp") {
            lost += s.packetsLost ?? 0;
            got += s.packetsReceived ?? 0;
          }
        });
        const prev = entry.lastStats ?? { lost: 0, got: 0 };
        const dLost = lost - prev.lost,
          dGot = got - prev.got;
        entry.lastStats = { lost, got };
        const loss = dGot + dLost > 0 ? dLost / (dGot + dLost) : 0;
        if (this.state.peers[id]) this.setPeer(id, { quality: rate(rtt, loss), rtt });
      } catch {
        /* connection closing */
      }
    }
  }

  closePC(id) {
    this.pcs.get(id)?.pc.close();
    this.pcs.delete(id);
  }

  closeAll() {
    for (const id of [...this.pcs.keys()]) this.closePC(id);
  }

  leave() {
    this.fx?.stop();
    this.emit({ status: "left" });
    this.ws?.close();
    this.closeAll();
    this.screen?.stop();
  }
}

/** Who is talking: audio level (0-1) per stream, sampled from Web Audio analysers. */
export class LevelMeter {
  ctx = null;
  nodes = new Map();
  add(id, stream) {
    if (!stream?.getAudioTracks().length) return;
    const node = this.nodes.get(id);
    if (node?.stream === stream && node.trackId === stream.getAudioTracks()[0].id) return;
    node?.source.disconnect();
    this.ctx ??= new AudioContext();
    const source = this.ctx.createMediaStreamSource(stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    this.nodes.set(id, { stream, source, analyser, trackId: stream.getAudioTracks()[0].id, buf: new Uint8Array(analyser.fftSize) });
  }
  remove(id) {
    this.nodes.get(id)?.source.disconnect();
    this.nodes.delete(id);
  }
  levels() {
    const out = {};
    for (const [id, n] of this.nodes) {
      n.analyser.getByteTimeDomainData(n.buf);
      let sum = 0;
      for (const v of n.buf) sum += ((v - 128) / 128) ** 2;
      out[id] = Math.min(1, Math.sqrt(sum / n.buf.length) * 4);
    }
    return out;
  }
  close() {
    this.nodes.forEach((n) => n.source.disconnect());
    this.nodes.clear();
    this.ctx?.close().catch(() => {});
  }
}
