const TARGET_RATE = 16000; // Whisper expects 16 kHz mono

/** Decodes the audio track of a video file in the browser and returns 16 kHz mono samples. */
export async function extractAudio16k(file) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx || !OfflineCtx) throw new Error('This browser can’t read audio from video files. Try the latest Chrome, Edge or Firefox.');

  const bytes = await file.arrayBuffer();
  const ctx = new Ctx();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } catch {
    throw new Error('We couldn’t read an audio track from this video. It may have no sound, or use a format this browser can’t decode.');
  } finally {
    ctx.close?.();
  }

  // Resample + mix down to mono with an offline context.
  const offline = new OfflineCtx(1, Math.max(1, Math.ceil(decoded.duration * TARGET_RATE)), TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice(); // copy so the buffer can be transferred to the worker
}
