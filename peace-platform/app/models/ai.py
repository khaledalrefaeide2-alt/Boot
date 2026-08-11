"""RAG knowledge base, assistant conversations and AI quality telemetry."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import DocumentStatus, TimestampMixin


class RagDocument(Base, TimestampMixin):
    """A knowledge source: an uploaded file, a pasted text, or a URL.

    ``trust_level`` and ``published_at`` are copied onto every chunk so the
    retriever can rerank without a join, and so a chunk retains the trust it was
    indexed with even if the document is later edited.
    """

    __tablename__ = "rag_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("official_sources.id", ondelete="SET NULL"), index=True
    )
    organization: Mapped[str] = mapped_column(String(160), default="")
    doc_type: Mapped[str] = mapped_column(String(64), default="document")
    url: Mapped[str | None] = mapped_column(String(500))
    file_path: Mapped[str | None] = mapped_column(String(500))
    file_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    topic: Mapped[str | None] = mapped_column(String(120), index=True)
    crisis_id: Mapped[int | None] = mapped_column(ForeignKey("crises.id", ondelete="SET NULL"))

    trust_level: Mapped[int] = mapped_column(Integer, default=3, index=True)
    status: Mapped[str] = mapped_column(String(32), default=DocumentStatus.PENDING, index=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    added_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    #: Set when the ingest scanner spots prompt-injection-shaped text inside the
    #: document. Flagged chunks are still retrievable but are labelled untrusted
    #: and are never allowed to carry instructions. See app/ai/safety.py.
    injection_flagged: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class DocumentChunk(Base):
    """A retrievable passage.

    The embedding is stored as a JSON array of floats, which is portable across
    SQLite and PostgreSQL. For production scale, docs/AI_RAG.md describes the
    drop-in swap to a pgvector ``vector`` column — the retriever's interface does
    not change.
    """

    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("rag_documents.id", ondelete="CASCADE"), index=True
    )
    ordinal: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)
    token_estimate: Mapped[int] = mapped_column(Integer, default=0)
    #: Copied from the parent document at index time for rerank without a join.
    chunk_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    embedding: Mapped[list | None] = mapped_column(JSON)
    injection_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Conversation(Base, TimestampMixin):
    """An anonymous assistant conversation, keyed by an opaque browser cookie."""

    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_key: Mapped[str] = mapped_column(String(64), index=True)
    locale: Mapped[str] = mapped_column(String(8), default="ar")


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    citations: Mapped[list | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class UserQuestion(Base):
    """Telemetry for every question asked of the assistant.

    This is the AI quality surface: unanswered questions, low-confidence
    answers, retrieval failures and citizen feedback all land here, and the
    quality dashboard reads nothing else.
    """

    __tablename__ = "user_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    question: Mapped[str] = mapped_column(Text)
    #: Normalised form used to cluster near-duplicate questions.
    normalized: Mapped[str] = mapped_column(String(500), index=True)
    intent: Mapped[str | None] = mapped_column(String(64), index=True)
    answered: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    answer_text: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float, index=True)
    flagged_low_confidence: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    retrieval_failed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    provider: Mapped[str | None] = mapped_column(String(32))
    citations: Mapped[list | None] = mapped_column(JSON)
    #: null | "helpful" | "not_helpful"
    feedback: Mapped[str | None] = mapped_column(String(16), index=True)
    #: Set when an operator supplies a corrected answer.
    human_correction: Mapped[str | None] = mapped_column(Text)
    corrected_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    conversation_id: Mapped[int | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
