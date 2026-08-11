"""Knowledge ingestion pipeline.

    document / URL / text
      -> extract -> clean -> chunk -> metadata -> embed -> store

Every chunk is scanned for prompt injection on the way in (see safety.py) and
inherits its parent document's organisation, trust level and publication date so
the retriever can rerank without a join.
"""

from __future__ import annotations

import logging
import re

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.ai.providers import get_embedder
from app.ai.safety import scan_for_injection
from app.models import DocumentChunk, DocumentStatus, OfficialSource, RagDocument, utcnow
from app.security.rbac import Permission
from app.security.sanitize import clean_line, clean_text, safe_url
from app.services import audit
from app.services.context import Actor

logger = logging.getLogger("peace.ai.ingest")

TARGET_CHUNK_CHARS = 900
CHUNK_OVERLAP_CHARS = 150
MIN_CHUNK_CHARS = 120


class ExtractionError(RuntimeError):
    pass


# --- Extraction --------------------------------------------------------------


def extract_text(data: bytes, suffix: str) -> str:
    """Pull plain text out of an uploaded file."""
    if suffix == ".pdf":
        return _extract_pdf(data)
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ExtractionError("File is not valid UTF-8 text.") from exc


def _extract_pdf(data: bytes) -> str:
    try:
        import io

        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - depends on install extras
        raise ExtractionError(
            "PDF support requires the 'pypdf' package. Install it, or paste the "
            "document text directly."
        ) from exc

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ExtractionError("Encrypted PDFs are not accepted.")
        pages = [page.extract_text() or "" for page in reader.pages]
    except ExtractionError:
        raise
    except Exception as exc:  # noqa: BLE001 - malformed PDFs are expected input
        raise ExtractionError("Could not read this PDF.") from exc

    text = "\n\n".join(p for p in pages if p.strip())
    if not text.strip():
        raise ExtractionError(
            "No text layer found. This looks like a scanned PDF; OCR it first."
        )
    return text


# --- Cleaning and chunking ---------------------------------------------------

_HYPHEN_BREAK = re.compile(r"(\w)-\n(\w)")
_PAGE_NUMBER_LINE = re.compile(r"^\s*[-–—]?\s*\d{1,4}\s*[-–—]?\s*$", re.M)


def clean_document_text(text: str) -> str:
    """Undo the artefacts that PDF extraction leaves behind."""
    text = _HYPHEN_BREAK.sub(r"\1\2", text)  # de-hyphenate across line breaks
    text = _PAGE_NUMBER_LINE.sub("", text)  # drop bare page numbers
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return clean_text(text, max_length=2_000_000)


def chunk_text(text: str) -> list[str]:
    """Split into overlapping, paragraph-aligned passages.

    Paragraph boundaries are respected wherever possible so a chunk rarely cuts
    a sentence in half — a truncated instruction is exactly the kind of evidence
    that produces a dangerous partial answer. The overlap keeps a fact that
    straddles a boundary retrievable from both sides.
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        if len(paragraph) > TARGET_CHUNK_CHARS * 2:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(_split_long(paragraph))
            continue

        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= TARGET_CHUNK_CHARS:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = paragraph
    if current:
        chunks.append(current)

    if not chunks:
        return []

    # Prepend a tail of the previous chunk so boundary facts stay findable.
    with_overlap = [chunks[0]]
    for index in range(1, len(chunks)):
        tail = chunks[index - 1][-CHUNK_OVERLAP_CHARS:]
        with_overlap.append(f"{tail.strip()}\n\n{chunks[index]}")
    return [c for c in with_overlap if len(c) >= MIN_CHUNK_CHARS or len(chunks) == 1]


def _split_long(paragraph: str) -> list[str]:
    sentences = re.split(r"(?<=[.!؟?])\s+", paragraph)
    out: list[str] = []
    current = ""
    for sentence in sentences:
        candidate = f"{current} {sentence}".strip()
        if len(candidate) <= TARGET_CHUNK_CHARS:
            current = candidate
        else:
            if current:
                out.append(current)
            current = sentence[:TARGET_CHUNK_CHARS]
    if current:
        out.append(current)
    return out


# --- Indexing ----------------------------------------------------------------


def index_document(db: DbSession, actor: Actor, document: RagDocument, raw_text: str) -> int:
    """Chunk, scan, embed and store. Returns the chunk count."""
    document.status = DocumentStatus.PROCESSING
    db.commit()

    try:
        cleaned = clean_document_text(raw_text)
        if not cleaned:
            raise ExtractionError("Document contains no readable text.")

        pieces = chunk_text(cleaned)
        if not pieces:
            raise ExtractionError("Document produced no usable passages.")

        # Replace any previous chunks so a reindex is idempotent.
        for old in db.scalars(
            select(DocumentChunk).where(DocumentChunk.document_id == document.id)
        ).all():
            db.delete(old)
        db.flush()

        embedder = get_embedder()
        vectors = embedder.embed(pieces)

        doc_scan = scan_for_injection(cleaned)
        document.injection_flagged = doc_scan.flagged

        published = document.published_at.isoformat() if document.published_at else None
        now = utcnow()
        for ordinal, (piece, vector) in enumerate(zip(pieces, vectors)):
            chunk_scan = scan_for_injection(piece)
            db.add(
                DocumentChunk(
                    document_id=document.id,
                    ordinal=ordinal,
                    text=piece,
                    token_estimate=max(1, len(piece) // 4),
                    chunk_metadata={
                        "source_id": document.source_id,
                        "organization": document.organization,
                        "title": document.title,
                        "topic": document.topic,
                        "crisis_id": document.crisis_id,
                        "trust_level": document.trust_level,
                        "published_at": published,
                        "url": document.url,
                        "injection_categories": chunk_scan.categories,
                    },
                    embedding=vector,
                    injection_flagged=chunk_scan.flagged,
                    created_at=now,
                )
            )

        document.chunk_count = len(pieces)
        document.status = DocumentStatus.INDEXED
        document.error = None
        db.commit()

        if doc_scan.flagged:
            logger.warning(
                "ingest.injection_detected document=%s categories=%s",
                document.id,
                doc_scan.categories,
            )
        return len(pieces)

    except Exception as exc:  # noqa: BLE001 - record the failure, don't crash the request
        db.rollback()
        document.status = DocumentStatus.FAILED
        document.error = str(exc)[:500]
        document.chunk_count = 0
        db.commit()
        logger.error("ingest.failed document=%s error=%s", document.id, exc)
        raise


def add_document(
    db: DbSession,
    actor: Actor,
    *,
    title: str,
    raw_text: str,
    source_id: int | None = None,
    doc_type: str = "document",
    url: str | None = None,
    file_path: str | None = None,
    file_hash: str | None = None,
    topic: str | None = None,
    crisis_id: int | None = None,
    trust_level: int = 3,
    published_at=None,
    is_demo: bool = False,
) -> RagDocument:
    """Register a knowledge source and index it. Audited."""
    actor.require(Permission.KNOWLEDGE_MANAGE)
    if not 1 <= int(trust_level) <= 5:
        raise ValueError("trust_level must be between 1 and 5")

    organization = ""
    if source_id is not None:
        source = db.get(OfficialSource, source_id)
        if source is None:
            raise LookupError("official source not found")
        organization = source.name
        # A document is never more trusted than the organisation it came from.
        trust_level = min(int(trust_level), source.trust_level)

    document = RagDocument(
        title=clean_line(title, max_length=255),
        source_id=source_id,
        organization=organization,
        doc_type=doc_type,
        url=safe_url(url),
        file_path=file_path,
        file_hash=file_hash,
        topic=clean_line(topic, max_length=120) or None,
        crisis_id=crisis_id,
        trust_level=int(trust_level),
        published_at=published_at,
        added_by=actor.user_id,
        status=DocumentStatus.PENDING,
        is_demo=is_demo,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    try:
        count = index_document(db, actor, document, raw_text)
    finally:
        audit.record(
            db,
            actor,
            audit.Action.KNOWLEDGE_ADD,
            object_type="rag_document",
            object_id=document.id,
            new_value={
                "title": document.title,
                "status": document.status,
                "chunks": document.chunk_count,
                "injection_flagged": document.injection_flagged,
            },
        )
    logger.info("ingest.indexed document=%s chunks=%s", document.id, count)
    return document


def set_document_status(
    db: DbSession, actor: Actor, document_id: int, status: str
) -> RagDocument:
    """Enable or disable a source. Disabled documents are never retrieved."""
    actor.require(Permission.KNOWLEDGE_MANAGE)
    if status not in DocumentStatus.ALL:
        raise ValueError(f"invalid document status '{status}'")
    document = db.get(RagDocument, document_id)
    if document is None:
        raise LookupError("document not found")

    before = document.status
    document.status = status
    db.commit()
    db.refresh(document)
    audit.record(
        db,
        actor,
        audit.Action.KNOWLEDGE_DISABLE,
        object_type="rag_document",
        object_id=document.id,
        old_value={"status": before},
        new_value={"status": status},
    )
    return document


def list_documents(db: DbSession, *, limit: int = 200) -> list[RagDocument]:
    return list(
        db.scalars(select(RagDocument).order_by(RagDocument.created_at.desc()).limit(limit)).all()
    )
