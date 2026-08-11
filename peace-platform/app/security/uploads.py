"""Secure handling of knowledge-base file uploads.

Three independent checks must all pass: declared extension, declared MIME type,
and the file's actual magic bytes. Files are stored outside the static root
under a random name, so nothing uploaded is ever served back to a browser.
"""

from __future__ import annotations

import hashlib
import secrets
from pathlib import Path

from app.config import get_settings


class UploadError(ValueError):
    pass


#: extension -> (allowed MIME types, magic-byte prefixes; empty tuple = text)
ALLOWED: dict[str, tuple[tuple[str, ...], tuple[bytes, ...]]] = {
    ".pdf": (("application/pdf",), (b"%PDF-",)),
    ".txt": (("text/plain", "application/octet-stream"), ()),
    ".md": (("text/plain", "text/markdown", "application/octet-stream"), ()),
}


def validate(filename: str, content_type: str | None, data: bytes) -> str:
    """Validate an upload and return its normalised extension."""
    settings = get_settings()

    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise UploadError(f"File exceeds the {settings.max_upload_mb} MB limit.")
    if not data:
        raise UploadError("File is empty.")

    # Take only the final suffix of the basename: "a.pdf.exe" -> ".exe" (rejected),
    # and any directory component in the client-supplied name is discarded.
    suffix = Path(Path(filename).name).suffix.lower()
    if suffix not in ALLOWED:
        raise UploadError(f"Unsupported file type '{suffix or filename}'.")

    allowed_types, magic_prefixes = ALLOWED[suffix]
    if content_type and content_type.split(";")[0].strip() not in allowed_types:
        raise UploadError(f"Declared content type '{content_type}' does not match '{suffix}'.")

    if magic_prefixes and not any(data.startswith(p) for p in magic_prefixes):
        raise UploadError("File content does not match its extension.")
    if not magic_prefixes:
        # Text formats: require it to actually decode as UTF-8.
        try:
            data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise UploadError("Text file must be valid UTF-8.") from exc

    return suffix


def store(data: bytes, suffix: str) -> tuple[Path, str]:
    """Write the file under a random name. Returns ``(path, sha256)``."""
    settings = get_settings()
    directory = settings.upload_path
    directory.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(data).hexdigest()
    path = directory / f"{secrets.token_hex(16)}{suffix}"
    path.write_bytes(data)
    path.chmod(0o600)
    return path, digest
