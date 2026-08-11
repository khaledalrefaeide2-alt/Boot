"""Input normalisation and safe rendering of citizen/operator text.

The platform stores **no HTML anywhere**. Official updates, corrections and
guidance are plain text; the renderer turns blank lines into paragraphs at
display time. That removes the entire stored-XSS class rather than trying to
sanitise a markup subset, and it costs nothing an emergency bulletin needs.
"""

from __future__ import annotations

import re
import unicodedata
from html import escape

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_EXCESS_BLANKS = re.compile(r"\n{3,}")
_WHITESPACE = re.compile(r"[ \t]+")
#: Arabic-Indic and Eastern Arabic-Indic digits, mapped to ASCII so that a
#: phone number typed either way matches the directory.
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def clean_text(value: str | None, *, max_length: int = 20_000) -> str:
    """Normalise free text: strip control characters, collapse whitespace, cap length."""
    if not value:
        return ""
    text = unicodedata.normalize("NFC", value)
    text = _CONTROL_CHARS.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _WHITESPACE.sub(" ", text)
    text = _EXCESS_BLANKS.sub("\n\n", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    return text.strip()[:max_length]


def clean_line(value: str | None, *, max_length: int = 500) -> str:
    """Single-line variant: newlines become spaces."""
    return clean_text(value, max_length=max_length).replace("\n", " ").strip()[:max_length]


def normalize_digits(value: str) -> str:
    return value.translate(_ARABIC_DIGITS)


def normalize_question(value: str) -> str:
    """Key used to cluster near-identical citizen questions.

    Strips Arabic diacritics, unifies alef/ya/ta-marbuta variants, drops
    punctuation. Two spellings of the same question then share a key, which is
    what the FAQ frequency counter and the information-gap report rely on.
    """
    text = clean_line(value, max_length=500).lower()
    text = normalize_digits(text)
    text = re.sub(r"[ً-ْـ]", "", text)  # harakat + tatweel
    text = re.sub(r"[أإآٱ]", "ا", text)
    text = text.replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    # Drop punctuation by Unicode category rather than by character range.
    # Arabic punctuation (؟ ، ؛) lives inside the Arabic block, so a range-based
    # class keeps it and "…ستفتح؟" then fails to cluster with "…ستفتح ؟".
    text = "".join(
        ch if unicodedata.category(ch)[0] in ("L", "N") else " " for ch in text
    )
    return re.sub(r"\s+", " ", text).strip()


def paragraphs(value: str | None) -> list[str]:
    """Split stored plain text into paragraphs for template rendering."""
    if not value:
        return []
    return [block.strip() for block in value.split("\n\n") if block.strip()]


def escape_text(value: str | None) -> str:
    """Explicit escape for the rare place that builds a string outside Jinja."""
    return escape(value or "", quote=True)


_SAFE_URL_SCHEMES = ("https://", "http://")


def safe_url(value: str | None) -> str | None:
    """Allow only http(s) links, blocking ``javascript:`` and friends."""
    if not value:
        return None
    url = clean_line(value, max_length=500)
    if not url.lower().startswith(_SAFE_URL_SCHEMES):
        return None
    return url
