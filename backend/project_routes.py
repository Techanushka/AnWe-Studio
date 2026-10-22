"""Projects: list/create/rename/duplicate/delete, video + thumbnail streaming, transcript and edit-state saving.
Every handler requires a logged-in user and only touches rows/files owned by that user."""
import json
import re
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import config
import store
from deps import require_user
from files import parse_range

router = APIRouter(tags=["projects"])
PID = re.compile(r"^[0-9a-f]{32}$")
VIDEO_TYPES = {".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm"}
THUMB_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_THUMB = 2 * 1024 * 1024
MAX_STATE = 4 * 1024 * 1024
MAX_TRANSCRIPT = 8 * 1024 * 1024


class RenameBody(BaseModel):
    name: str


class TranscriptBody(BaseModel):
    segments: list[dict]
    duration: float | None = None


def check_pid(pid: str) -> str:
    if not PID.match(pid):
        raise HTTPException(404, "Project not found.")
    return pid


def clean_name(name: str) -> str:
    name = " ".join((name or "").split())
    if not name or len(name) > 80:
        raise HTTPException(400, "Give your project a name under 80 characters.")
    return name


def clean_segments(value) -> list[dict]:
    if not isinstance(value, list):
        raise HTTPException(400, "Transcript must be a list of lines.")
    out = []
    for s in value:
        if not isinstance(s, dict) or not isinstance(s.get("text"), str):
            raise HTTPException(400, "Each transcript line needs start, end and text.")
        try:
            start, end = float(s["start"]), float(s["end"])
        except (KeyError, TypeError, ValueError):
            raise HTTPException(400, "Each transcript line needs numeric start and end times.")
        item = {"start": start, "end": end, "text": s["text"]}
        if isinstance(s.get("words"), list):
            item["words"] = s["words"]
        out.append(item)
    if len(json.dumps(out)) > MAX_TRANSCRIPT:
        raise HTTPException(413, "That transcript is too large.")
    return out


def save_upload(upload: UploadFile, dest: Path, limit: int, too_big: str) -> int:
    size = 0
    with open(dest, "wb") as out:
        while chunk := upload.file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                raise HTTPException(413, too_big)
            out.write(chunk)
    return size


@router.get("/projects")
def list_projects(user: dict = Depends(require_user)):
    return {"projects": store.list_projects(user["id"])}


@router.post("/projects", status_code=201)
def create_project(request: Request, user: dict = Depends(require_user), video: UploadFile = File(...), name: str = Form(""),
                   duration: float | None = Form(None), transcript: str = Form(""), thumbnail: UploadFile | None = File(None)):
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > config.MAX_BYTES + 8 * 1024 * 1024:
        raise HTTPException(413, "That video is larger than the server allows.")
    ext = Path(video.filename or "").suffix.lower()
    if ext not in VIDEO_TYPES:
        raise HTTPException(415, "Upload an MP4, MOV or WebM video.")
    segments = None
    if transcript.strip():
        try:
            segments = clean_segments(json.loads(transcript))
        except json.JSONDecodeError:
            raise HTTPException(400, "Transcript must be valid JSON.")
    stem = Path(video.filename or "").stem
    title = " ".join((name or stem or "Untitled project").split())[:80] or "Untitled project"

    pid = uuid.uuid4().hex
    folder = store.project_dir(user["id"], pid)
    folder.mkdir(parents=True, exist_ok=True)
    try:
        video_file = f"video{ext}"
        if save_upload(video, folder / video_file, config.MAX_BYTES, "That video is larger than the server allows.") == 0:
            raise HTTPException(400, "That file is empty.")
        thumb_file = None
        if thumbnail and thumbnail.filename and thumbnail.content_type in THUMB_TYPES:
            thumb_file = f"thumbnail{THUMB_TYPES[thumbnail.content_type]}"
            save_upload(thumbnail, folder / thumb_file, MAX_THUMB, "That thumbnail is too large.")
        project = store.create_project(user["id"], title, duration if duration and duration > 0 else None,
                                       video_file, VIDEO_TYPES[ext], pid, thumb_file, segments)
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    return {"project": project}


def owned(user: dict, pid: str) -> dict:
    row = store.get_project_row(user["id"], check_pid(pid))
    if not row:
        raise HTTPException(404, "We couldn’t find that project.")
    return row


@router.get("/projects/{pid}")
def get_project(pid: str, user: dict = Depends(require_user)):
    owned(user, pid)
    return {"project": store.project_detail(user["id"], pid)}


@router.patch("/projects/{pid}")
def rename(pid: str, body: RenameBody, user: dict = Depends(require_user)):
    owned(user, pid)
    return {"project": store.rename_project(user["id"], pid, clean_name(body.name))}


@router.put("/projects/{pid}/transcript")
def put_transcript(pid: str, body: TranscriptBody, user: dict = Depends(require_user)):
    owned(user, pid)
    segments = clean_segments(body.segments)
    store.save_transcript(user["id"], pid, segments, body.duration)
    return {"ok": True}


@router.put("/projects/{pid}/state")
def put_state(pid: str, body: dict, user: dict = Depends(require_user)):
    owned(user, pid)
    if len(json.dumps(body)) > MAX_STATE:
        raise HTTPException(413, "That edit history is too large to save.")
    return {"stateUpdatedAt": store.save_edit_state(user["id"], pid, body)}


@router.post("/projects/{pid}/duplicate", status_code=201)
def duplicate(pid: str, user: dict = Depends(require_user)):
    owned(user, pid)
    return {"project": store.duplicate_project(user["id"], pid)}


@router.delete("/projects/{pid}")
def delete(pid: str, user: dict = Depends(require_user)):
    owned(user, pid)
    store.delete_project(user["id"], pid)
    return {"ok": True}


def stream_file(path: Path, media_type: str, request: Request, cache: str = "private, max-age=3600"):
    if not path.is_file():
        raise HTTPException(404, "File not found.")
    size = path.stat().st_size
    parsed = parse_range(request.headers.get("range"), size)
    headers = {"Accept-Ranges": "bytes", "Cache-Control": cache, "X-Content-Type-Options": "nosniff"}
    if parsed == "invalid":
        raise HTTPException(416, "Range not satisfiable.")
    start, end, status = (0, size - 1, 200) if parsed is None else (parsed[0], parsed[1], 206)
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(end - start + 1)

    def chunks():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                data = f.read(min(1024 * 1024, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data
    return StreamingResponse(chunks(), status_code=status, media_type=media_type, headers=headers)


@router.get("/projects/{pid}/video")
def video(pid: str, request: Request, user: dict = Depends(require_user)):
    row = owned(user, pid)
    if not row["video_file"]:
        raise HTTPException(404, "This project has no video.")
    return stream_file(store.project_dir(user["id"], pid) / row["video_file"], row["video_type"] or "video/mp4", request)


@router.get("/projects/{pid}/thumbnail")
def thumbnail(pid: str, request: Request, user: dict = Depends(require_user)):
    row = owned(user, pid)
    if not row["thumbnail_file"]:
        raise HTTPException(404, "No thumbnail.")
    ext = Path(row["thumbnail_file"]).suffix
    kind = {v: k for k, v in THUMB_TYPES.items()}.get(ext, "image/jpeg")
    return stream_file(store.project_dir(user["id"], pid) / row["thumbnail_file"], kind, request, cache="private, max-age=86400")


@router.get("/exports")
def exports(user: dict = Depends(require_user)):
    """Export files aren't produced by the editor yet, so this is an honest empty list."""
    return {"exports": []}
