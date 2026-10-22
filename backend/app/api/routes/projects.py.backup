
import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pymongo.database import Database

from app.api.deps import get_current_user
from app.db.mongo import get_db

router = APIRouter()
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads"
MAX_VIDEO_SIZE = 500 * 1024 * 1024
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".webm"}


def now():
    return datetime.now(timezone.utc)


def serialize(project):
    return {
        "projectId": str(project["_id"]),
        "name": project["name"],
        "duration": project.get("duration"),
        "status": project.get("status", "ready"),
        "createdAt": project["created_at"].isoformat(),
        "updatedAt": project["updated_at"].isoformat(),
        "thumbnail": None,
    }


def owned_project(db, project_id, user):
    if not ObjectId.is_valid(project_id):
        raise HTTPException(404, "Project not found")
    project = db["projects"].find_one({
        "_id": ObjectId(project_id),
        "user_id": user["_id"],
    })
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.get("/projects")
def list_projects(
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    projects = db["projects"].find({"user_id": user["_id"]}).sort("updated_at", -1)
    return {"projects": [serialize(p) for p in projects]}


@router.post("/projects")
async def create_project(
    video: UploadFile = File(...),
    name: str = Form(...),
    duration: float | None = Form(None),
    transcript: str | None = Form(None),
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    ext = Path(video.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Upload an MP4, MOV, or WebM video.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / stored_name
    total = 0

    try:
        with file_path.open("wb") as output:
            while chunk := await video.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_VIDEO_SIZE:
                    raise HTTPException(413, "Video must be 500 MB or smaller.")
                output.write(chunk)

        segments = []
        if transcript:
            try:
                segments = json.loads(transcript)
                if not isinstance(segments, list):
                    raise ValueError()
            except (ValueError, json.JSONDecodeError):
                raise HTTPException(400, "Transcript must be a JSON array.")

        timestamp = now()
        doc = {
            "user_id": user["_id"],
            "name": (name.strip() or "Untitled project")[:200],
            "filename": stored_name,
            "original_filename": video.filename or stored_name,
            "file_size": total,
            "duration": duration,
            "transcript": segments,
            "status": "ready",
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        result = db["projects"].insert_one(doc)
        doc["_id"] = result.inserted_id
        return {"project": serialize(doc), **serialize(doc)}
    except Exception:
        if file_path.exists():
            file_path.unlink()
        raise
    finally:
        await video.close()


@router.get("/projects/{project_id}")
def get_project(
    project_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    project = owned_project(db, project_id, user)
    data = serialize(project)
    data.update({
        "videoUrl": f"/projects/{project_id}/video",
        "transcript": project.get("transcript", []),
    })
    return {"project": data, **data}


@router.get("/projects/{project_id}/video")
def get_project_video(
    project_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    project = owned_project(db, project_id, user)
    path = UPLOAD_DIR / project["filename"]
    if not path.is_file():
        raise HTTPException(404, "Video file not found")
    return FileResponse(
        path,
        media_type="video/mp4" if path.suffix.lower() == ".mp4" else "application/octet-stream",
        filename=project.get("original_filename", path.name),
        content_disposition_type="inline",
    )


@router.patch("/projects/{project_id}")
def rename_project(
    project_id: str,
    payload: dict,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        raise HTTPException(422, "Project name is required")
    project = owned_project(db, project_id, user)
    db["projects"].update_one(
        {"_id": project["_id"]},
        {"$set": {"name": name.strip()[:200], "updated_at": now()}},
    )
    project["name"] = name.strip()[:200]
    return {"project": serialize(project), **serialize(project)}


@router.post("/projects/{project_id}/duplicate")
def duplicate_project(
    project_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    source = owned_project(db, project_id, user)
    timestamp = now()
    copy = {
        **source,
        "_id": ObjectId(),
        "name": f'{source["name"]} (copy)'[:200],
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    db["projects"].insert_one(copy)
    return {"project": serialize(copy), **serialize(copy)}


@router.delete("/projects/{project_id}")
def delete_project(
    project_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    project = owned_project(db, project_id, user)
    db["projects"].delete_one({"_id": project["_id"]})
    path = UPLOAD_DIR / project["filename"]
    if path.is_file():
        path.unlink()
    return {"message": "Project deleted"}


@router.get("/exports")
def list_exports(user: dict = Depends(get_current_user)):
    return {"exports": []}
