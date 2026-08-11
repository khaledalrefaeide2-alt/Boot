# Security

Treated as a government-grade public system: anonymous citizens submit free
text, operators publish information people act on in an emergency, and the
knowledge base ingests untrusted documents.

## Threat model

| Threat | Impact | Control |
|---|---|---|
| Unauthorised publication of official information | Citizens act on false information | RBAC enforced in the service layer; publication is a distinct permission and a distinct audited action |
| Compromised operator account | Same, plus data disclosure | Bcrypt cost 12, lockout, short sessions, immediate revocation on role change or suspension, full audit trail |
| CSRF against a dashboard action | Unauthorised publish/edit | Per-session CSRF token on every state-changing request, HTML and JSON alike |
| Stored XSS via citizen or operator input | Session theft, defacement | **No HTML is stored anywhere**; Jinja2 autoescaping; strict CSP with no inline script |
| Prompt injection via an uploaded document | AI leaks instructions or emits attacker text | Instruction/data separation, ingest scanning, exclusion from citizen retrieval, output validation |
| AI fabricating an emergency number | Someone dials a number that does not exist | Mechanical grounding check against evidence and the audited directory |
| Malicious file upload | RCE, stored malware | Extension + MIME + magic-byte agreement, size cap, random filename, stored outside the web root, never served back |
| Abuse of citizen submission forms | Flooding, spam | Per-bucket rate limiting keyed on a hashed IP |
| Session hijacking | Account takeover | HttpOnly + SameSite=Strict + Secure cookies; only a SHA-256 of the token is stored |
| Open redirect on login | Phishing | `next` is constrained to `/dash` paths |
| Enumeration of accounts | Targeted attack | Identical error and comparable timing for unknown vs wrong password |
| Disclosure of unpublished content | Premature or wrong information | Public queries filter on published state; submission endpoints return no identifier |

## Authentication

* Bcrypt, cost 12. Minimum 12 characters and three of four character classes.
  Passwords over 72 bytes are rejected rather than silently truncated, because
  truncation makes two different passwords equivalent.
* Five failed attempts lock the account for 15 minutes; the correct password is
  refused while the lock stands.
* Unknown accounts still run a dummy hash comparison, and every failure path
  raises the same error with the same message.

## Sessions

* 256-bit random token; the database stores only its SHA-256, so a database
  disclosure yields no usable cookies.
* Cookie flags: `HttpOnly`, `SameSite=Strict`, `Secure` in production, `Path=/`.
* Two expiries, both checked on every request: idle (60 min, default) and
  absolute (12 h, default).
* Revocation is immediate and is triggered by logout, suspension, role change
  and password reset. Permissions are read from the account on every request,
  so a demoted user cannot retain access for the life of their session.

## CSRF

Each session carries its own token. Every state-changing HTML form submits it
in a hidden field; cookie-authenticated JSON writes must send it as
`X-CSRF-Token`. Validation is a constant-time comparison against *that
session's* token, so a token leaked from another session is useless.

## Input and output

The platform **stores no HTML**. Official updates, corrections, guidance and
citizen text are plain text; paragraphs are reconstructed at render time. That
removes the entire stored-XSS class rather than trying to sanitise a markup
subset, and costs an emergency bulletin nothing.

* `clean_text()` / `clean_line()`: NFC normalisation, control-character
  stripping, whitespace collapsing, length caps.
* `safe_url()`: only `http(s)`, blocking `javascript:`, `data:` and `file:`.
* Jinja2 autoescaping is on for every template.
* Pydantic validates API payloads; service functions validate again, because
  they are also reachable from the dashboard and from scripts.

## Content Security Policy

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; form-action 'self';
frame-ancestors 'none'; base-uri 'self'; object-src 'none'
```

**No `unsafe-inline`, anywhere.** That constraint is load-bearing and shaped
the templates: there is not a single inline `style` or `<script>` in the
codebase. The confidence bar's width comes from a `data-pct` attribute matched
by rules in the external stylesheet, and client-side translations arrive in a
`data-i18n` attribute rather than an inline script. A browser check asserts
zero CSP violations.

Also sent: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`,
`Cross-Origin-Opener-Policy`, HSTS in production, and `Cache-Control: no-store`
on every `/dash` response.

## File uploads

Three independent checks must all pass: declared extension (final suffix of the
basename, so `payload.pdf.exe` is rejected), declared MIME type, and the file's
actual magic bytes — with text formats additionally required to decode as
UTF-8. Files are capped at `MAX_UPLOAD_MB`, written under a random name with
mode `0600` into `UPLOAD_DIR` (outside the static root), and **never served
back to a browser**. Encrypted PDFs are rejected; PDFs with no text layer are
rejected with an instruction to OCR them, rather than being indexed as empty.

## Rate limiting

Fixed-window counters keyed on `(bucket, hashed IP)`:

| Bucket | Budget |
|---|---|
| `login` | 10 / 5 min |
| `assistant` | 20 / 5 min |
| `rumor_submit`, `report_submit` | 5 / 10 min |
| `feedback` | 30 / 10 min |
| `search` | 60 / 1 min |

Read paths are generous on purpose: during an emergency people refresh a lot
and must never be locked out of information.

**Known limitation, stated rather than hidden:** the limiter is in-process and
is therefore correct for a single worker. For a multi-worker deployment, swap
the counter store for Redis — `ratelimit.check()` is the seam and nothing else
changes. See `docs/DEPLOYMENT.md`.

## Privacy

* IP addresses are **never stored**. Citizen submissions, audit entries and
  sessions carry a salted SHA-256 instead, which is enough to rate-limit and to
  spot a flood of identical submissions.
* `X-Forwarded-For` is trusted only in production (behind a known proxy);
  otherwise any client could choose its own rate-limit bucket.
* Citizens are never asked to register. The contact field on a report is
  optional and labelled as such.
* No third-party requests of any kind — the CSP forbids them and the site makes
  none.

## Audit trail

`audit.record()` is the only writer of `audit_logs` in the codebase, and there
is no update or delete path. Each entry holds actor, role, action, object,
before/after values, hashed IP, user agent and timestamp; actor identity is
denormalised so entries survive a user being renamed or removed.

Audited actions include: login success/failure/lockout/logout; update create,
edit, publish, archive, AI suggestion; rumor submit, AI analysis, review,
publish, unpublish, archive; FAQ create/edit/merge; service create/edit/status
(with the previous phone number); source create/edit; alert create/deactivate;
report submit/triage; crisis create/edit; emergency-mode toggle; AI config
change; knowledge add/reindex/disable; AI answer corrected; user
create/edit/role change/suspend/password reset.

To enforce append-only in PostgreSQL as well, see `docs/DATABASE.md`.

## Secrets

Everything comes from the environment. `SECRET_KEY` and `IP_HASH_SALT` are
mandatory in production — startup raises without them — and `COOKIE_SECURE=false`
in production is refused outright. In development an ephemeral key is generated,
which means sessions do not survive a restart: the safe failure mode. Templates
receive only `Settings.public_settings()`, so no secret can reach the browser
through the render context. The interactive API docs are disabled in production.

## Verification

`python3 -m pytest` covers, among others: unauthorised publication (service
level, per role), the rumor publication gate, invented phone numbers including
Arabic-Indic digits, authority impersonation, phantom citations, missing
citations, the confidence floor, session hashing/expiry/revocation, role-change
revocation, password policy, URL scheme filtering, upload validation, CSRF
rejection, open-redirect prevention, rate limiting, and prompt-injection
detection and exclusion.

## Deliberate limitations

Stated plainly rather than left for discovery:

1. **In-process rate limiting** — single-worker only (above).
2. **No 2FA.** For a real deployment, add TOTP for `system_admin` and
   `ops_supervisor` before go-live.
3. **Uploads are not virus-scanned.** Files are never executed or served, but
   ClamAV in the ingest path is the right addition for a real deployment.
4. **`create_all()` at startup** suits development; production should adopt
   Alembic and drop that call.
5. **Privacy policy and terms are placeholders** and are labelled as such in
   the UI; they need legal review before any real use.
