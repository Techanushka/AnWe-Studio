# Anwe Studio – transcription server

Highest-accuracy speech-to-text (faster-whisper, Whisper large-v3 by default) with Silero VAD, beam search and word timestamps.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # optional; or set the variables in your shell
uvicorn main:app --port 8000
```

Then in `frontend/.env`: `VITE_TRANSCRIBE_URL=http://localhost:8000` and restart `npm run dev`.

* **GPU (recommended for large-v3):** NVIDIA GPU with CUDA 12 + cuDNN 9, `WHISPER_COMPUTE=float16`.
* **CPU only:** use `WHISPER_MODEL=small` (or `medium`) with `WHISPER_COMPUTE=int8`. large-v3 on CPU works but is slow.
* The first start downloads the model from Hugging Face (large-v3 is about 3 GB).
* This server has no login check yet. Put it behind your auth before exposing it to the internet.
