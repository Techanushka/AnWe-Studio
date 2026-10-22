
"""Project routes: uploads, metadata, transcripts and cloud/local playback."""

import json
import re
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel

import cloud_storage
import config
import store
from deps import require_user
from files import parse_range

router = APIRouter(tags=["projects"])

PID = re.compile(r"^[0-9a-f]{32}$")
VIDEO_TYPES = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
}
THUMB_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_THUMB = 2 * 1024 * 1024
MAX_STATE = 4 * 1024 * 1024
MAX_TRANSCRIPT = 8 * 1024 * 1024


class RenameBody(BaseModel):
    name: str


class TranscriptBody(BaseModel):
    segments: list[dict]
    duration: float | None = None


def check_pid(pid: str) -> str:
    if not PID.fullmatch(pid):
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
    for segment in value:
        if not isinstance(segment, dict) or not isinstance(segment.get("text"), str):
            raise HTTPException(400, "Each transcript line needs start, end and text.")
        try:
            start, end = float(segment["start"]), float(segment["end"])
        except (KeyError, TypeError, ValueError):
            raise HTTPException(400, "Each transcript line needs numeric start and end times.")

        if start < 0 or end < start:
            raise HTTPException(400, "Transcript times are invalid.")

        item = {"start": start, "end": end, "text": segment["text"]}
        if isinstance(segment.get("words"), list):
            item["words"] = segment["words"]
        out.append(item)

    if len(json.dumps(out)) > MAX_TRANSCRIPT:
        raise HTTPException(413, "That transcript is too large.")

    return out


def save_upload(upload: UploadFile, dest: Path, limit: int, too_big: str) -> int:
    size = 0
    with open(dest, "wb") as output:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > limit:
                raise HTTPException(413, too_big)
            output.write(chunk)
    return size


def owned(user: dict, pid: str) -> dict:
    row = store.get_project_row(user["id"], check_pid(pid))
    if not row:
        raise HTTPException(404, "We couldn’t find that project.")
    return row


def _local_path(uid: str, pid: str, stored_name: str | None) -> Path:
    if not stored_name or cloud_storage.is_cloud_file(stored_name):
        raise HTTPException(404, "Local file not found.")
    return store.project_dir(uid, pid) / stored_name


@router.get("/projects")
def list_projects(user: dict = Depends(require_user)):
    return {"projects": store.list_projects(user["id"])}


@router.post("/projects", status_code=201)
def create_project(
    request: Request,
    user: dict = Depends(require_user),
    video: UploadFile = File(...),
    name: str = Form(""),
    duration: float | None = Form(None),
    transcript: str = Form(""),
    thumbnail: UploadFile | None = File(None),
):
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

    uploaded_cloud_paths = []
    try:
        local_video_name = f"video{ext}"
        local_video_path = folder / local_video_name

        if save_upload(
            video,
            local_video_path,
            config.MAX_BYTES,
            "That video is larger than the server allows.",
        ) == 0:
            raise HTTPException(400, "That file is empty.")

        local_thumb_name = None
        local_thumb_path = None

        if thumbnail and thumbnail.filename and thumbnail.content_type in THUMB_TYPES:
            local_thumb_name = f"thumbnail{THUMB_TYPES[thumbnail.content_type]}"
            local_thumb_path = folder / local_thumb_name
            save_upload(
                thumbnail,
                local_thumb_path,
                MAX_THUMB,
                "That thumbnail is too large.",
            )

        video_key = f"{user['id']}/{pid}/{local_video_name}"
        cloud_storage.upload_file(local_video_path, video_key, VIDEO_TYPES[ext])
        uploaded_cloud_paths.append(video_key)
        stored_video = cloud_storage.cloud_ref(video_key)

        stored_thumbnail = None
        if local_thumb_path and local_thumb_name:
            thumb_key = f"{user['id']}/{pid}/{local_thumb_name}"
            thumb_type = thumbnail.content_type
            cloud_storage.upload_file(local_thumb_path, thumb_key, thumb_type)
            uploaded_cloud_paths.append(thumb_key)
            stored_thumbnail = cloud_storage.cloud_ref(thumb_key)

        project = store.create_project(
            user["id"],
            title,
            duration if duration and duration > 0 else None,
            stored_video,
            VIDEO_TYPES[ext],
            pid,
            stored_thumbnail,
            segments,
        )

        # Remove temporary local copies after both cloud upload and DB insert succeed.
        shutil.rmtree(folder, ignore_errors=True)

    except Exception as exc:
        if uploaded_cloud_paths:
            try:
                cloud_storage.delete_cloud_files(uploaded_cloud_paths)
            except Exception:
                pass

        shutil.rmtree(folder, ignore_errors=True)

        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(502, f"Could not save the video to cloud storage: {exc}") from exc

    finally:
        awaitable = None
        try:
            video.file.close()
        except Exception:
            pass
        if thumbnail:
            try:
                thumbnail.file.close()
            except Exception:
                pass

    return {"project": project}


@router.get("/projects/{pid}")
def get_project(pid: str, user: dict = Depends(require_user)):
    owned(user, pid)
    return {"project": store.project_detail(user["id"], pid)}


@router.patch("/projects/{pid}")
def rename(pid: str, body: RenameBody, user: dict = Depends(require_user)):
    owned(user, pid)
    result = store.rename_project(user["id"], pid, clean_name(body.name))
    if not result:
        raise HTTPException(404, "Project not found.")
    return {"project": result}


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
    try:
        project = store.duplicate_project(user["id"], pid)
    except Exception as exc:
        raise HTTPException(502, f"Could not duplicate this project: {exc}") from exc
    if not project:
        raise HTTPException(404, "Project not found.")
    return {"project": project}


@router.delete("/projects/{pid}")
def delete(pid: str, user: dict = Depends(require_user)):
    owned(user, pid)
    try:
        deleted = store.delete_project(user["id"], pid)
    except Exception as exc:
        raise HTTPException(502, f"Could not delete this project's cloud files: {exc}") from exc
    if not deleted:
        raise HTTPException(404, "Project not found.")
    return {"ok": True}


def stream_file(path: Path, media_type: str, request: Request, cache: str = "private, max-age=3600"):
    if not path.is_file():
        raise HTTPException(404, "File not found.")

    size = path.stat().st_size
    if size == 0:
        raise HTTPException(404, "File is empty.")

    parsed = parse_range(request.headers.get("range"), size)
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": cache,
        "X-Content-Type-Options": "nosniff",
    }

    if parsed == "invalid":
        raise HTTPException(416, "Range not satisfiable.")

    start, end, status = (0, size - 1, 200) if parsed is None else (parsed[0], parsed[1], 206)
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(end - start + 1)

    def chunks():
        with open(path, "rb") as file:
            file.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                data = file.read(min(1024 * 1024, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    return StreamingResponse(
        chunks(),
        status_code=status,
        media_type=media_type,
        headers=headers,
    )


@router.get("/projects/{pid}/video")
def video(pid: str, request: Request, user: dict = Depends(require_user)):
    row = owned(user, pid)
    stored = row["video_file"]

    if not stored:
        raise HTTPException(404, "This project has no video.")

    if cloud_storage.is_cloud_file(stored):
        try:
            url = cloud_storage.create_signed_url(cloud_storage.cloud_key(stored))
        except Exception as exc:
            raise HTTPException(502, "Could not create a cloud video link.") from exc
        return RedirectResponse(url=url, status_code=307)

    return stream_file(
        _local_path(user["id"], pid, stored),
        row["video_type"] or "video/mp4",
        request,
    )


@router.get("/projects/{pid}/thumbnail")
def thumbnail(pid: str, request: Request, user: dict = Depends(require_user)):
    row = owned(user, pid)
    stored = row["thumbnail_file"]

    if not stored:
        raise HTTPException(404, "No thumbnail.")

    if cloud_storage.is_cloud_file(stored):
        try:
            url = cloud_storage.create_signed_url(cloud_storage.cloud_key(stored))
        except Exception as exc:
            raise HTTPException(502, "Could not create a cloud thumbnail link.") from exc
        return RedirectResponse(url=url, status_code=307)

    ext = Path(stored).suffix.lower()
    kind = {value: key for key, value in THUMB_TYPES.items()}.get(ext, "image/jpeg")

    return stream_file(
        _local_path(user["id"], pid, stored),
        kind,
        request,
        cache="private, max-age=86400",
    )


@router.get("/exports")
def exports(user: dict = Depends(require_user)):
    """Exports are not produced by the editor yet."""
    return {"exports": []}
