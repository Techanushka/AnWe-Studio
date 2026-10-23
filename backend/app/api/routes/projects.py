
import json
import mimetypes
import uuid
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from pymongo.database import Database

from app.api.deps import get_current_user
from app.db.mongo import get_db

import cloud_storage

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
    projects = db["projects"].find(
        {"user_id": user["_id"]}
    ).sort("updated_at", -1)

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

    segments = []
    if transcript:
        try:
            segments = json.loads(transcript)
            if not isinstance(segments, list):
                raise ValueError()
        except (ValueError, json.JSONDecodeError):
            raise HTTPException(400, "Transcript must be a JSON array.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    stored_name = f"{uuid.uuid4().hex}{ext}"
    local_path = UPLOAD_DIR / stored_name
    object_path = f"{user['_id']}/{stored_name}"

    total = 0
    cloud_uploaded = False

    try:
        # Read video into a temporary local file with a size limit.
        with local_path.open("wb") as output:
            while True:
                chunk = await video.read(1024 * 1024)
                if not chunk:
                    break

                total += len(chunk)
                if total > MAX_VIDEO_SIZE:
                    raise HTTPException(
                        413, "Video must be 500 MB or smaller."
                    )

                output.write(chunk)

        content_type = (
            mimetypes.guess_type(video.filename or "")[0]
            or "application/octet-stream"
        )

        # Upload the video to Supabase Storage.
        cloud_storage.upload_file(
            local_path,
            object_path,
            content_type,
        )
        cloud_uploaded = True

        timestamp = now()
        doc = {
            "user_id": user["_id"],
            "name": (name.strip() or "Untitled project")[:200],
            "filename": cloud_storage.cloud_ref(object_path),
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

    except Exception as exc:
        # Roll back cloud upload if project creation fails.
        if cloud_uploaded:
            try:
                cloud_storage.delete_cloud_files([object_path])
            except Exception:
                pass

        if local_path.exists():
            local_path.unlink()

        if isinstance(exc, HTTPException):
            raise

        raise HTTPException(
            500,
            f"Video upload failed: {str(exc)}",
        ) from exc

    finally:
        await video.close()
        # Do not keep a permanent local copy.
        if local_path.exists():
            local_path.unlink()


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
    filename = project["filename"]

    # Cloud-stored videos use a temporary signed playback URL.
    if cloud_storage.is_cloud_file(filename):
        try:
            signed_url = cloud_storage.create_signed_url(
                cloud_storage.cloud_key(filename),
                expires_in=3600,
            )
            return RedirectResponse(url=signed_url, status_code=307)
        except Exception as exc:
            raise HTTPException(
                502, "Could not create the cloud video URL."
            ) from exc

    # Backward compatibility for older local videos.
    path = UPLOAD_DIR / filename
    if not path.is_file():
        raise HTTPException(404, "Video file not found")

    return FileResponse(
        path,
        media_type=(
            mimetypes.guess_type(path.name)[0]
            or "application/octet-stream"
        ),
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
    clean_name = name.strip()[:200]

    db["projects"].update_one(
        {"_id": project["_id"]},
        {"$set": {"name": clean_name, "updated_at": now()}},
    )

    project["name"] = clean_name
    project["updated_at"] = now()

    return {"project": serialize(project), **serialize(project)}


@router.post("/projects/{project_id}/duplicate")
def duplicate_project(
    project_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    source = owned_project(db, project_id, user)
    source_filename = source["filename"]
    new_filename = source_filename

    if cloud_storage.is_cloud_file(source_filename):
        old_key = cloud_storage.cloud_key(source_filename)
        suffix = Path(source.get("original_filename", "")).suffix.lower()
        new_key = f"{user['_id']}/{uuid.uuid4().hex}{suffix}"

        try:
            cloud_storage.copy_cloud_file(old_key, new_key)
            new_filename = cloud_storage.cloud_ref(new_key)
        except Exception as exc:
            raise HTTPException(
                502, "Could not duplicate the cloud video."
            ) from exc
    else:
        source_path = UPLOAD_DIR / source_filename
        if source_path.is_file():
            new_filename = f"{uuid.uuid4().hex}{source_path.suffix}"
            import shutil
            shutil.copy2(source_path, UPLOAD_DIR / new_filename)

    timestamp = now()
    copy = {
        **source,
        "_id": ObjectId(),
        "filename": new_filename,
        "name": f'{source["name"]} (copy)'[:200],
        "created_at": timestamp,
        "updated_at": timestamp,
    }

    try:
        db["projects"].insert_one(copy)
    except Exception as exc:
        if cloud_storage.is_cloud_file(new_filename) and new_filename != source_filename:
            try:
                cloud_storage.delete_cloud_files([
                    cloud_storage.cloud_key(new_filename)
                ])
            except Exception:
                pass
        raise HTTPException(500, "Could not save duplicated project.") from exc

    return {"project": serialize(copy), **serialize(copy)}


@router.delete("/projects/{project_id}")
def delete_project(
    project_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    project = owned_project(db, project_id, user)
    filename = project["filename"]

    if cloud_storage.is_cloud_file(filename):
        try:
            cloud_storage.delete_cloud_files([
                cloud_storage.cloud_key(filename)
            ])
        except Exception as exc:
            raise HTTPException(
                502, "Could not delete the cloud video."
            ) from exc
    else:
        path = UPLOAD_DIR / filename
        if path.is_file():
            path.unlink()

    db["projects"].delete_one({"_id": project["_id"]})
    return {"message": "Project deleted"}


@router.get("/exports")
def list_exports(user: dict = Depends(get_current_user)):
    return {"exports": []}

