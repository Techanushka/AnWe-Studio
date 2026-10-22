
"""Supabase Storage helpers. Keep secret keys on the backend only."""

from functools import lru_cache
from pathlib import Path

import config
from supabase import create_client


CLOUD_PREFIX = "cloud:"


def is_cloud_file(value: str | None) -> bool:
    return bool(value and value.startswith(CLOUD_PREFIX))


def cloud_key(value: str) -> str:
    if is_cloud_file(value):
        return value[len(CLOUD_PREFIX):]
    return value


def cloud_ref(object_path: str) -> str:
    return f"{CLOUD_PREFIX}{object_path}"


@lru_cache(maxsize=1)
def get_supabase():
    url = getattr(config, "SUPABASE_URL", "").strip()
    key = getattr(config, "SUPABASE_SERVICE_ROLE_KEY", "").strip()

    if not url or not key:
        raise RuntimeError(
            "Supabase is not configured. Check backend/.env"
        )

    return create_client(url, key)


def upload_file(local_path: Path, object_path: str, content_type: str) -> str:
    with open(local_path, "rb") as file:
        get_supabase().storage.from_(
            config.SUPABASE_BUCKET
        ).upload(
            path=object_path,
            file=file,
            file_options={
                "content-type": content_type,
                "upsert": "true",
            },
        )

    return object_path


def create_signed_url(object_path: str, expires_in: int = 3600) -> str:
    result = get_supabase().storage.from_(
        config.SUPABASE_BUCKET
    ).create_signed_url(object_path, expires_in)

    if isinstance(result, dict):
        url = result.get("signedURL") or result.get("signedUrl")
        if url:
            return url

    raise RuntimeError("Supabase did not return a signed URL.")


def delete_cloud_files(object_paths: list[str]) -> None:
    paths = list(dict.fromkeys(path for path in object_paths if path))
    if paths:
        get_supabase().storage.from_(config.SUPABASE_BUCKET).remove(paths)


def copy_cloud_file(source_path: str, destination_path: str) -> str:
    get_supabase().storage.from_(config.SUPABASE_BUCKET).copy(
        source_path,
        destination_path,
    )
    return destination_path
