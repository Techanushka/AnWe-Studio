"""
Anwe Studio transcription server (FastAPI + faster-whisper).

POST /transcribe  (multipart: file, language)  ->  newline-delimited JSON stream:
  {"type":"info","duration":..,"language":"en","languageProbability":0.99}
  {"type":"segment","start":..,"end":..,"text":"..","words":[{"start","end","word","probability"}]}
  {"type":"done"}   or   {"type":"error","message":".."}
Word-level timestamps are included so the editor can cut by word.
"""
import json
import logging
import os
import tempfile
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel

log = logging.getLogger("anwe.transcribe")
MODEL_NAME = os.getenv("WHISPER_MODEL", "large-v3")
DEVICE = os.getenv("WHISPER_DEVICE", "auto")
COMPUTE = os.getenv("WHISPER_COMPUTE", "auto")
MAX_BYTES = int(os.getenv("MAX_UPLOAD_MB", "2048")) * 1024 * 1024
ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
LANGS = {"english": "en", "hindi": "hi", "spanish": "es", "french": "fr", "german": "de", "portuguese": "pt", "arabic": "ar"}

_model = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        log.info("Loading Whisper model %s (%s, %s)", MODEL_NAME, DEVICE, COMPUTE)
        _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE)
    return _model


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if os.getenv("PRELOAD", "1") == "1":
        get_model()
    yield


app = FastAPI(title="Anwe Studio transcription", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])


def ndjson(obj: dict) -> str:
    return json.dumps(obj, ensure_ascii=False) + "\n"


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("auto")):
    lang_key = (language or "auto").strip().lower()
    if lang_key == "auto":
        lang = None
    elif lang_key in LANGS:
        lang = LANGS[lang_key]
    elif len(lang_key) == 2:
        lang = lang_key
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {language}")

    suffix = os.path.splitext(file.filename or "")[1] or ".bin"
    fd, path = tempfile.mkstemp(suffix=suffix)
    size = 0
    try:
        with os.fdopen(fd, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(status_code=413, detail="That video is too large for the server.")
                out.write(chunk)
    except Exception:
        with suppress(OSError):
            os.remove(path)
        raise

    def events():
        try:
            segments, info = get_model().transcribe(
                path,
                language=lang,                      # None = detect from the audio
                task="transcribe",
                beam_size=5,                        # beam search is noticeably more accurate than greedy
                best_of=5,
                vad_filter=True,                    # Silero VAD: skip silence/noise, prevents invented text
                vad_parameters={"min_silence_duration_ms": 500, "speech_pad_ms": 300},
                condition_on_previous_text=False,   # stops one mistake from snowballing into repetition loops
                word_timestamps=True,
                no_speech_threshold=0.6,
                compression_ratio_threshold=2.4,
                log_prob_threshold=-1.0,
            )
            yield ndjson({"type": "info", "duration": info.duration, "language": info.language,
                          "languageProbability": round(info.language_probability, 3)})
            for seg in segments:
                text = seg.text.strip()
                if not text:
                    continue
                words = [{"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word.strip(),
                          "probability": round(w.probability, 3)} for w in (seg.words or [])]
                yield ndjson({"type": "segment", "start": round(seg.start, 3), "end": round(seg.end, 3),
                              "text": text, "words": words})
            yield ndjson({"type": "done"})
        except Exception:
            log.exception("Transcription failed")
            yield ndjson({"type": "error", "message": "Transcription failed on the server."})
        finally:
            with suppress(OSError):
                os.remove(path)

    return StreamingResponse(events(), media_type="application/x-ndjson")
