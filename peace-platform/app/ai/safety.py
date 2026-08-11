"""AI safety layer: prompt-injection defence and post-generation validation.

Two halves.

**Ingest-time** — :func:`scan_for_injection` inspects text entering the
knowledge base for instruction-shaped content. Flagged passages stay searchable
for operators but are excluded from citizen-facing answers and are labelled as
untrusted in the prompt.

**Answer-time** — :func:`validate_answer` is the last gate before a citizen sees
anything. It is mechanical, not another model call: an answer that cites nothing,
that contains a phone number absent from the evidence, or that claims government
authority is *replaced*, not merely flagged. The rules hold no matter which
provider produced the text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.ai.providers.base import LLMAnswer, RetrievedChunk
from app.security.sanitize import normalize_digits

# --- Prompt injection --------------------------------------------------------

_INJECTION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("override", re.compile(r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions?", re.I)),
    ("override", re.compile(r"disregard\s+(all\s+)?(previous|prior|the\s+above)", re.I)),
    ("override", re.compile(r"تجاهل\s+(كل\s+)?(التعليمات|الأوامر)")),
    ("persona", re.compile(r"you\s+are\s+now\s+(a|an|the)\b", re.I)),
    ("persona", re.compile(r"(act|behave)\s+as\s+(if|though|a|an)\b", re.I)),
    ("exfiltration", re.compile(r"(reveal|print|show|output|repeat)\s+.{0,24}(system\s+prompt|instructions|secret|api[_\s-]?key)", re.I)),
    ("exfiltration", re.compile(r"أظهر\s+.{0,24}(التعليمات|المفتاح)")),
    ("citation_suppression", re.compile(r"(do\s+not|don'?t|never)\s+(cite|mention|include)\s+.{0,24}source", re.I)),
    ("role_markers", re.compile(r"<\|?(system|assistant|human)\|?>", re.I)),
    ("role_markers", re.compile(r"^\s*(system|assistant)\s*:", re.I | re.M)),
    ("authority", re.compile(r"(you\s+(are|have)\s+(now\s+)?(authori[sz]ed|permission)\s+to)", re.I)),
)


@dataclass
class InjectionScan:
    flagged: bool = False
    categories: list[str] = field(default_factory=list)
    excerpts: list[str] = field(default_factory=list)


def scan_for_injection(text: str) -> InjectionScan:
    """Look for instruction-shaped content in untrusted document text."""
    scan = InjectionScan()
    if not text:
        return scan
    for category, pattern in _INJECTION_PATTERNS:
        match = pattern.search(text)
        if match:
            scan.flagged = True
            if category not in scan.categories:
                scan.categories.append(category)
            start = max(0, match.start() - 40)
            scan.excerpts.append(text[start : match.end() + 40].replace("\n", " ")[:160])
    return scan


# --- Answer validation -------------------------------------------------------

#: Sequences that could be read as a contact number. Deliberately broad: a false
#: positive costs a citation check, a false negative could publish a number that
#: does not exist.
_PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\d\s\-()]{4,}\d)(?!\w)")
_CITATION_RE = re.compile(r"\[(\d{1,2})\]")

_AUTHORITY_CLAIMS = (
    re.compile(r"\b(i|we)\s+(hereby\s+)?(order|decree|declare|authori[sz]e|approve)\b", re.I),
    re.compile(r"\bas\s+(the|a)\s+(government|ministry|authority|official)\b", re.I),
    re.compile(r"\b(i|we)\s+have\s+(dispatched|sent|notified|alerted)\b", re.I),
    re.compile(r"(بصفتي|بصفتنا)\s+(الجهة|الحكومة|السلطة)"),
    re.compile(r"(قمنا|قمت)\s+ب(إرسال|إبلاغ|تحويل)"),
)

#: Words that, in a question, mean the citizen needs a human emergency service
#: rather than an information lookup.
_HIGH_RISK_TERMS = (
    "trapped", "drowning", "bleeding", "unconscious", "collapse", "rescue",
    "fire", "dying", "suicide", "attack", "gas leak", "electrocuted",
    "محاصر", "يغرق", "ينزف", "فاقد الوعي", "انهيار", "إنقاذ", "حريق",
    "يموت", "انتحار", "تسرب غاز", "صعقة",
)


class Verdict:
    OK = "ok"
    INSUFFICIENT = "insufficient_evidence"
    ESCALATE = "escalate_to_human"
    BLOCKED = "blocked"


@dataclass
class ValidationResult:
    verdict: str
    text: str
    citations: list[dict] = field(default_factory=list)
    confidence: float = 0.0
    #: Machine-readable reasons, recorded in telemetry and shown to operators.
    reasons: list[str] = field(default_factory=list)
    #: Set when the citizen should be pointed at an emergency service.
    recommend_emergency_contact: bool = False
    escalated: bool = False


def is_high_risk(question: str) -> bool:
    lowered = question.lower()
    return any(term in lowered for term in _HIGH_RISK_TERMS)


def extract_phone_candidates(text: str) -> set[str]:
    """Digit-only forms of anything phone-shaped in ``text``."""
    found: set[str] = set()
    for match in _PHONE_RE.finditer(normalize_digits(text or "")):
        digits = re.sub(r"\D", "", match.group())
        # 3 digits is a short emergency code; below that it is a year or count.
        if 3 <= len(digits) <= 15:
            found.add(digits)
    return found


def validate_answer(
    answer: LLMAnswer,
    *,
    question: str,
    chunks: list[RetrievedChunk],
    confidence: float,
    ai_config: dict,
    known_phone_numbers: set[str],
) -> ValidationResult:
    """Final gate before an answer reaches a citizen.

    Order matters: the cheapest disqualifying checks run first, and any failure
    that could mislead replaces the answer entirely rather than annotating it.
    """
    reasons: list[str] = []
    high_risk = is_high_risk(question)

    if answer.refused:
        return ValidationResult(
            verdict=Verdict.ESCALATE,
            text="",
            confidence=0.0,
            reasons=["provider_refused"],
            recommend_emergency_contact=high_risk,
            escalated=True,
        )

    if answer.truncated:
        reasons.append("generation_truncated")

    if answer.insufficient_evidence or not answer.text.strip():
        return ValidationResult(
            verdict=Verdict.INSUFFICIENT,
            text="",
            confidence=0.0,
            reasons=reasons + ["insufficient_evidence"],
            recommend_emergency_contact=high_risk,
            escalated=high_risk,
        )

    text = answer.text.strip()

    # 1. Authority impersonation — never repairable, always blocked.
    if any(pattern.search(text) for pattern in _AUTHORITY_CLAIMS):
        return ValidationResult(
            verdict=Verdict.BLOCKED,
            text="",
            confidence=0.0,
            reasons=reasons + ["authority_impersonation"],
            recommend_emergency_contact=high_risk,
            escalated=True,
        )

    # 2. Citations must resolve to passages that were actually retrieved.
    by_label = {chunk.label: chunk for chunk in chunks}
    cited_labels = {int(m) for m in _CITATION_RE.findall(text)}
    cited_labels |= {int(x) for x in answer.used_labels}
    valid_labels = {label for label in cited_labels if label in by_label}

    if cited_labels - valid_labels:
        reasons.append("phantom_citation")
    if ai_config.get("require_citations", True) and not valid_labels:
        return ValidationResult(
            verdict=Verdict.INSUFFICIENT,
            text="",
            confidence=0.0,
            reasons=reasons + ["no_citations"],
            recommend_emergency_contact=high_risk,
            escalated=True,
        )

    # 3. Every phone number in the answer must exist in the evidence or in the
    #    verified services directory. This is the rule that makes "the AI cannot
    #    invent an emergency number" a property of the system, not a hope.
    evidence_numbers: set[str] = set(known_phone_numbers)
    for chunk in chunks:
        evidence_numbers |= extract_phone_candidates(chunk.text)
    invented = {
        number
        for number in extract_phone_candidates(text)
        if number not in evidence_numbers
    }
    if invented:
        return ValidationResult(
            verdict=Verdict.BLOCKED,
            text="",
            confidence=0.0,
            reasons=reasons + ["ungrounded_phone_number"],
            recommend_emergency_contact=True,
            escalated=True,
        )

    # 4. Confidence floor.
    threshold = float(ai_config.get("min_confidence", 0.45))
    if confidence < threshold:
        return ValidationResult(
            verdict=Verdict.INSUFFICIENT,
            text="",
            confidence=confidence,
            reasons=reasons + ["below_confidence_threshold"],
            recommend_emergency_contact=high_risk,
            escalated=True,
        )

    citations = [by_label[label].citation() for label in sorted(valid_labels)]
    return ValidationResult(
        verdict=Verdict.OK,
        text=text,
        citations=citations,
        confidence=confidence,
        reasons=reasons,
        # Even a good answer refers a person in danger to a human service.
        recommend_emergency_contact=high_risk,
        escalated=high_risk or bool(reasons),
    )


def is_restricted(question: str, ai_config: dict) -> str | None:
    """Return the restricted topic a question falls under, if any."""
    lowered = question.lower()
    topic_terms = {
        "medical_treatment": ("dose", "dosage", "medicine", "prescribe", "treatment",
                              "جرعة", "دواء", "علاج", "وصفة"),
        "legal_advice": ("sue", "lawsuit", "legal right", "compensation claim",
                         "قضية", "محكمة", "تعويض قانوني", "حقي القانوني"),
        "casualty_figures": ("death toll", "how many died", "casualties", "victims count",
                             "عدد الوفيات", "عدد القتلى", "كم شخص مات", "الضحايا"),
    }
    for topic in ai_config.get("restricted_topics", []):
        for term in topic_terms.get(topic, ()):
            if term in lowered:
                return topic
    return None
