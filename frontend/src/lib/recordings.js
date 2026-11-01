// Save a camera recording to the user's account: the details go to the database (SQL, mirrored to MongoDB), the
// video to S3. With S3 set up the browser uploads the video straight to S3 (any size); otherwise it goes through
// the API, which serverless hosts cap (Vercel: 4.5 MB), so a too-big video is downloaded to the device instead.
import { api } from "./api";

const ext = (blob) => (blob.type.includes("mp4") ? "mp4" : "webm");

/** Save `blob` with its details; resolves with the saved recording, or throws (the caller then keeps a local copy). */
export async function saveRecording(blob, { title, source, roomId, durationSec, quality = "medium", speed = "realtime", timeline = [] }) {
  const meta = new FormData();
  meta.append("title", title);
  meta.append("source", source);
  if (roomId) meta.append("room_id", String(roomId));
  meta.append("duration_sec", String(durationSec));
  meta.append("quality", quality);
  meta.append("speed", speed);
  meta.append("timeline", JSON.stringify(timeline));

  let direct = null;
  try {
    direct = await api("/recordings/upload-url", { method: "POST", json: { mime_type: blob.type } });
  } catch (e) {
    // 409 = no S3 on this server; 404 / 405 = an older server without direct upload: upload through the API below
    if (![404, 405, 409].includes(e.status)) throw e;
  }
  if (direct) {
    const put = await fetch(direct.url, { method: "PUT", body: blob, headers: direct.headers });
    if (!put.ok) throw new Error(`S3 upload failed (HTTP ${put.status}) — check the bucket's CORS settings`);
    meta.append("key", direct.key);
    return api("/recordings/register", { method: "POST", body: meta });
  }
  meta.append("video", blob, `recording.${ext(blob)}`);
  try {
    return await api("/recordings", { method: "POST", body: meta });
  } catch (e) {
    if (e.status === 413) throw new Error("This video is too big for the server without S3 storage");
    throw e;
  }
}

/** Hand the video to the user as a file (when saving to the account isn't possible). */
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: `${name}.${ext(blob)}` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
