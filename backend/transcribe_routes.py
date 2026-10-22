"""POST /transcribe  (multipart: file, language)  ->  newline-delimited JSON stream (login required):
  {"type":"info","duration":..,"language":"en","languageProbability":0.99}
  {"type":"segment","start":..,"end":..,"text":"..","words":[{"start","end","word","probability"}]}
  {"type":"done"}   or   {"type":"error","message":".."}
faster-whisper is optional: without it this endpoint answers 503 and the app transcribes in the browser instead."""
import json
import logging
import os
import tempfile
from contextlib import suppress

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

import config
from deps import require_user

log = logging.getLogger("anwe.transcribe")
router = APIRouter(tags=["transcribe"])
LANGS = {"english": "en", "hindi": "hi", "spanish": "es", "french": "fr", "german": "de", "portuguese": "pt", "arabic": "ar"}
_model = None


def whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except ImportError:
        return False


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        log.info("Loading Whisper model %s (%s, %s)", config.WHISPER_MODEL, config.WHISPER_DEVICE, config.WHISPER_COMPUTE)
        _model = WhisperModel(config.WHISPER_MODEL, device=config.WHISPER_DEVICE, compute_type=config.WHISPER_COMPUTE)
    return _model


def ndjson(obj: dict) -> str:
    return json.dumps(obj, ensure_ascii=False) + "\n"


@router.post("/transcribe")
def transcribe(file: UploadFile = File(...), language: str = Form("auto"), _user: dict = Depends(require_user)):
    if not whisper_available():
        raise HTTPException(503, "The transcription server isn’t installed. Run: pip install -r requirements-transcribe.txt")
    lang_key = (language or "auto").strip().lower()
    if lang_key == "auto":
        lang = None
    elif lang_key in LANGS:
        lang = LANGS[lang_key]
    elif len(lang_key) == 2:
        lang = lang_key
    else:
        raise HTTPException(400, f"Unsupported language: {language}")

    suffix = os.path.splitext(file.filename or "")[1] or ".bin"
    fd, path = tempfile.mkstemp(suffix=suffix)
    size = 0
    try:
        with os.fdopen(fd, "wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > config.MAX_BYTES:
                    raise HTTPException(413, "That video is too large for the server.")
                out.write(chunk)
    except Exception:
        with suppress(OSError):
            os.remove(path)
        raise

    def events():
        try:
            segments, info = get_model().transcribe(
                path, language=lang, task="transcribe", beam_size=5, best_of=5,
                vad_filter=True, vad_parameters={"min_silence_duration_ms": 500, "speech_pad_ms": 300},
                condition_on_previous_text=False, word_timestamps=True,
                no_speech_threshold=0.6, compression_ratio_threshold=2.4, log_prob_threshold=-1.0,
            )
            yield ndjson({"type": "info", "duration": info.duration, "language": info.language,
                          "languageProbability": round(info.language_probability, 3)})
            for seg in segments:
                text = seg.text.strip()
                if not text:
                    continue
                words = [{"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word.strip(),
                          "probability": round(w.probability, 3)} for w in (seg.words or [])]
                yield ndjson({"type": "segment", "start": round(seg.start, 3), "end": round(seg.end, 3), "text": text, "words": words})
            yield ndjson({"type": "done"})
        except Exception:
            log.exception("Transcription failed")
            yield ndjson({"type": "error", "message": "Transcription failed on the server."})
        finally:
            with suppress(OSError):
                os.remove(path)

    return StreamingResponse(events(), media_type="application/x-ndjson")
