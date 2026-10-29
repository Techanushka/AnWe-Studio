"""Feature 6 – AI Highlight & Clip Generator.

POST /projects/{project_id}/ai/highlights   {min_seconds, max_seconds, count}
  -> {highlights:[{id,title,start,end,duration,reason,score}], provider, warning?, truncated?}

Pipeline: saved transcript -> LLM (Gemini, key stays on the server) scores moments -> we SNAP every clip to
transcript segment boundaries, force the requested duration, drop overlaps. Without a key (or if the provider
fails) a local keyword/pace scorer is used, so the button always returns something reviewable.
Reuses the helpers already in ai_routes.py.
"""
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ai_routes import _gemini, _json_response, _owned_transcript, _transcript_text
from deps import require_user

router = APIRouter(tags=["AI Highlights"])

LLM_CHAR_LIMIT = 45000  # same limit _transcript_text applies by default


class HighlightIn(BaseModel):
    min_seconds: int = Field(30, ge=5, le=600)
    max_seconds: int = Field(60, ge=10, le=900)
    count: int = Field(5, ge=1, le=10)


def _clean(segments: list[dict]) -> list[dict]:
    out = []
    for s in segments:
        try:
            a, b = float(s.get("start") or 0), float(s.get("end") or 0)
        except (TypeError, ValueError):
            continue
        if b > a:
            out.append({"start": a, "end": b, "text": str(s.get("text", "")).strip()})
    out.sort(key=lambda s: s["start"])
    return out


def _fit(start: float, end: float, segs: list[dict], lo: float, hi: float):
    """Snap [start,end] to segment edges, then grow/shrink by whole segments to land inside [lo,hi]."""
    first = next((i for i, s in enumerate(segs) if s["end"] > start), None)
    if first is None:
        return None
    last = first
    for i in range(first, len(segs)):
        if segs[i]["start"] < end:
            last = i
        else:
            break
    a, b = first, last

    def dur():
        return segs[b]["end"] - segs[a]["start"]

    while dur() < lo:
        if b + 1 < len(segs):
            b += 1
        elif a > 0:
            a -= 1
        else:
            break
    while dur() > hi and b > a:
        b -= 1
    s, e = segs[a]["start"], segs[b]["end"]
    if e - s > hi:  # one very long segment: hard-limit the length
        e = s + hi
    return round(s, 2), round(e, 2)


def _title(segs: list[dict], start: float, end: float) -> str:
    text = next((s["text"] for s in segs if s["end"] > start and s["start"] < end and s["text"]), "Highlight")
    first = re.split(r"(?<=[.!?।])\s", text)[0]
    return (first if len(first) <= 60 else first[:57].rstrip() + "…").strip() or "Highlight"


def _overlaps(a: dict, b: dict) -> bool:
    inter = max(0.0, min(a["end"], b["end"]) - max(a["start"], b["start"]))
    return inter / max(0.01, min(a["end"] - a["start"], b["end"] - b["start"])) > 0.3


def _finish(picks: list[dict], count: int) -> list[dict]:
    chosen: list[dict] = []
    for c in sorted(picks, key=lambda x: x["score"], reverse=True):
        if all(not _overlaps(c, k) for k in chosen):
            chosen.append(c)
        if len(chosen) >= count:
            break
    for c in chosen:
        c["id"] = uuid.uuid4().hex[:8]
        c["duration"] = round(c["end"] - c["start"], 2)
        c["score"] = round(c["score"], 1)
    return chosen


# ----------------------------------------------------------------------------- LLM path
def _from_llm(raw, segs, lo, hi, count):
    if not isinstance(raw, list):
        return []
    picks = []
    for h in raw:
        if not isinstance(h, dict):
            continue
        try:
            s, e = float(h.get("start")), float(h.get("end"))
        except (TypeError, ValueError):
            continue
        if e <= s:
            continue
        fit = _fit(s, e, segs, lo, hi)
        if not fit:
            continue
        try:
            score = max(0.0, min(10.0, float(h.get("score", 5))))
        except (TypeError, ValueError):
            score = 5.0
        picks.append({
            "title": str(h.get("title") or "").strip()[:80] or _title(segs, *fit),
            "start": fit[0], "end": fit[1],
            "reason": str(h.get("reason") or "").strip()[:300], "score": score,
        })
    return _finish(picks, count)


def _prompt(transcript: str, lo: int, hi: int, count: int) -> str:
    return (
        "You pick the best short-form clips from a video transcript.\n"
        'Return ONLY valid JSON: {"highlights":[{"title":string,"start":number,"end":number,"reason":string,"score":number}]}\n'
        "Rules:\n"
        f"- Return at most {count} highlights, best first. score is 1-10.\n"
        f"- Each clip must be {lo}-{hi} seconds long, and start/end must be timestamps that appear in the transcript brackets.\n"
        "- Clips must not overlap. Each clip must make sense on its own: a complete idea, story beat or answer.\n"
        "- title: at most 8 words, descriptive, nothing that is not in the transcript.\n"
        "- reason: one sentence on why this moment is engaging.\n"
        "TRANSCRIPT:\n" + transcript
    )


# ----------------------------------------------------------------------------- local fallback
HOOKS = re.compile(r"\b(important|key|secret|mistake|never|always|biggest|best|worst|remember|truth|why|how to|the reason|lesson|tip|problem|solution|surprising|amazing|incredible)\b", re.I)
FILLER = re.compile(r"\b(um+|uh+|erm|hmm+|you know|i mean|like)\b", re.I)


def _score(text: str, seconds: float):
    words = re.findall(r"[\w']+", text.lower())
    if not words:
        return 0.0, []
    wps = len(words) / max(seconds, 1.0)
    pace = min(wps / 2.8, 1.0)
    hooks = min(len(HOOKS.findall(text)), 4) / 4
    emphasis = min(text.count("?") + text.count("!"), 4) / 4
    numbers = min(len(re.findall(r"\b\d[\d,.]*\b", text)), 3) / 3
    filler = min(len(FILLER.findall(text)) / len(words) * 10, 1.0)
    score = 10 * (0.35 * pace + 0.30 * hooks + 0.15 * emphasis + 0.10 * numbers + 0.10 * (1 - filler))
    why = []
    if pace > 0.8:
        why.append("steady, dense speech")
    if hooks:
        why.append("strong key phrases")
    if emphasis:
        why.append("questions or emphasis")
    if numbers:
        why.append("concrete numbers")
    if filler < 0.2:
        why.append("few filler words")
    return score, why


def _local(segs, lo, hi, count):
    target = (lo + hi) / 2
    picks = []
    for i in range(len(segs)):
        j = i
        while j + 1 < len(segs) and segs[j]["end"] - segs[i]["start"] < target:
            j += 1
        s, e = segs[i]["start"], segs[j]["end"]
        if e - s < lo:
            continue
        if e - s > hi:
            e = s + hi
        text = " ".join(x["text"] for x in segs[i:j + 1])
        score, why = _score(text, e - s)
        picks.append({
            "title": _title(segs, s, e), "start": round(s, 2), "end": round(e, 2), "score": score,
            "reason": ("Picked for " + ", ".join(why) + ".") if why else "Picked by pace and content density.",
        })
    return _finish(picks, count)


@router.post("/projects/{project_id}/ai/highlights")
async def highlights(project_id: str, body: HighlightIn, user: dict = Depends(require_user)):
    _, segments = _owned_transcript(user, project_id)
    segs = _clean(segments)
    if not segs:
        raise HTTPException(422, "This project's transcript has no usable timestamps.")
    lo, hi = sorted((body.min_seconds, body.max_seconds))
    truncated = len(_transcript_text(segments, 10**9)) > LLM_CHAR_LIMIT

    items: list[dict] = []
    provider, warning = "local-heuristic", ""
    try:
        raw = await _gemini(_prompt(_transcript_text(segments), lo, hi, body.count))
        if raw is None:
            warning = "No GEMINI_API_KEY is set on the server, so the local keyword scorer picked these clips."
        else:
            items = _from_llm(_json_response(raw).get("highlights"), segs, lo, hi, body.count)
            provider = "gemini"
            if not items:
                warning = "The AI returned no usable clips, so the local keyword scorer picked these instead."
    except HTTPException as exc:
        if exc.status_code != 502:
            raise
        warning = "The AI provider is unavailable right now, so the local keyword scorer picked these clips."

    if not items:
        items, provider = _local(segs, lo, hi, body.count), "local-heuristic"
    return {"highlights": items, "provider": provider, "warning": warning, "truncated": truncated}
