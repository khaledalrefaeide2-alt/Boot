# Database

Portable SQLAlchemy 2.0 models run unchanged on **PostgreSQL** (production) and
**SQLite** (development, demo, tests). Status and role values are plain strings
with Python-side constants rather than native `ENUM` types, so adding a value
is a code change instead of a migration and the same DDL works on both engines.

## Entity relationships

```
                       ┌──────────┐
                       │  crises  │
                       └────┬─────┘
       ┌────────────────────┼───────────────────┬──────────────┐
       │                    │                   │              │
┌──────▼────────┐   ┌───────▼────┐   ┌──────────▼──┐   ┌───────▼──────┐
│official_updates│   │   rumors   │   │  guidance   │   │rag_documents │
└──────┬────────┘   └─────┬──────┘   └──────┬──────┘   └───────┬──────┘
       │                  │                 │                  │
       │  source_id       │ evidence_source │ source_id        │ source_id
       └──────────┬───────┴─────────────────┴──────────────────┘
                  │
          ┌───────▼──────────┐          ┌──────────────────┐
          │ official_sources │          │ document_chunks  │──▶ embeddings
          └──────────────────┘          └──────────────────┘

┌───────┐   created_by / approved_by / reviewed_by / added_by
│ users │──────────────────────────────────────────────────────▶ content tables
└───┬───┘
    │        ┌───────────────┐   ┌────────────┐   ┌───────────────┐
    ├───────▶│ user_sessions │   │ audit_logs │   │ notifications │
    │        └───────────────┘   └────────────┘   └───────────────┘
    │
    └── system_settings.updated_by

┌───────────────┐   ┌──────────────┐   ┌────────────────┐   ┌──────────┐
│ conversations │──▶│ conv_messages│   │ user_questions │   │ reports  │
└───────────────┘   └──────────────┘   └────────────────┘   └──────────┘
                                                │ conversation_id
┌──────────────────────┐   ┌────────┐
│ assistance_services  │   │ alerts │──▶ official_updates (related_update_id)
└──────────────────────┘   └────────┘
```

## Tables

### `crises`
`id · code(unique) · type · title · severity(low|medium|high) ·
status(ongoing|under_control|ended) · description · start_date · end_date ·
is_active · is_demo · created_at · updated_at`

Exactly one row carries `is_active`; setting it clears the others in the same
transaction.

### `official_updates`
`id · title · content · citizen_summary · citizen_summary_approved · category ·
importance · status · source_id→official_sources · organization · source_url ·
verified · crisis_id · published_at · scheduled_for · created_by · approved_by ·
is_demo`

`content` is always the verbatim official text. `citizen_summary` is the
AI-drafted plain-language version and is inert until
`citizen_summary_approved` is set by a human. `organization` is denormalised so
a published update keeps its attribution if the source is later renamed.

### `rumors`
`id · claim · raw_submission · source_platform · seen_where ·
related_to_crisis · crisis_id · submitter_ip_hash · spread_score · risk_score ·
status · ai_classification · ai_confidence · ai_correction · ai_rationale ·
ai_citations · correction · explanation · evidence_source_id · evidence_url ·
reviewed_by · checked_at · published · published_at · report_count · is_demo`

The `ai_*` columns are advisory and are the only ones AI code writes. The
citizen-visible fields (`correction`, `explanation`, `status`) are written by
`rumors.review()`, which requires a human actor. `published` is flipped only by
`rumors.publish()`.

### `official_sources`
`id · name · slug(unique) · organization · url · type · trust_level(1–5) ·
logo_url · social_links · verification_status · why_trusted · is_active ·
is_demo`

`trust_level` drives retrieval reranking and caps the trust of any document
attributed to the source.

### `assistance_services`
`id · organization · phone · service_type · hours · website · location ·
latitude · longitude · status · notes · sort_order · is_demo`

The highest-risk table in the schema: every change is audited with its previous
value, and the safety layer treats these numbers as the only ones an AI answer
may contain that are not literally present in retrieved evidence.

### `faqs` · `guidance`
FAQs carry a `frequency` counter incremented when a citizen question matches;
it drives the popular list and the information-gap report. Guidance is
segmented by `phase` (before/during/after) and `audience`.

### `rag_documents` · `document_chunks`
Documents hold provenance (`source_id`, `organization`, `trust_level`,
`published_at`, `topic`, `crisis_id`), lifecycle (`status`, `chunk_count`,
`error`) and `injection_flagged`. Chunks hold `text`, `chunk_metadata` (a copy
of the parent's provenance, so retrieval reranks without a join),
`embedding` and their own `injection_flagged`.

### `users` · `user_sessions`
Users store a bcrypt hash (cost 12) plus lockout state. Sessions store the
**SHA-256 of the token**, never the token, along with a CSRF token, an idle
marker (`last_seen_at`), an absolute expiry and a revocation timestamp.

### `audit_logs`
`id · user_id · user_email · role · action · object_type · object_id ·
old_value · new_value · ip_hash · user_agent · created_at`

Append-only from the application: `audit.record()` is the only writer in the
codebase and there is no update or delete path. Actor email and role are
denormalised so entries stay readable after a user is renamed or removed.

### `user_questions`
Telemetry behind the AI quality dashboard: `question · normalized · intent ·
answered · answer_text · confidence · flagged_low_confidence ·
retrieval_failed · provider · citations · feedback · human_correction ·
corrected_by · conversation_id`. `normalized` is the clustering key.

### `reports` · `alerts` · `notifications` · `system_settings` ·
### `conversations` · `conversation_messages`
Reports carry `routed_to` — a *suggested* destination, never a delivery claim.
`system_settings` is a JSON key/value store holding `emergency_mode` and
`ai_config`, written only through the audited settings service.

## Indexing

Indexed by default: every foreign key; `crises.is_active`;
`official_updates(status, published_at, category, importance)`;
`rumors(status, published, submitter_ip_hash)`; `faqs(status, frequency)`;
`rag_documents(status, trust_level)`; `document_chunks.document_id`;
`user_questions(normalized, confidence, flagged_low_confidence, created_at)`;
`audit_logs(action, object_type, object_id, user_email, created_at)`;
`user_sessions.token_hash`.

Recommended additional indexes on PostgreSQL:

```sql
CREATE INDEX idx_updates_public
  ON official_updates (published_at DESC) WHERE status = 'published';
CREATE INDEX idx_rumors_public
  ON rumors (published_at DESC) WHERE published = true;
```

## Vectors: JSON now, pgvector later

Embeddings are stored as a JSON array of floats, which is portable and correct
for the demo's scale (retrieval scans a bounded candidate pool and scores in
Python). It will not scale past roughly ten thousand chunks.

The swap is contained to one function, `retrieval.retrieve()`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE document_chunks ADD COLUMN embedding_vec vector(512);
UPDATE document_chunks
   SET embedding_vec = embedding::text::vector
 WHERE embedding IS NOT NULL;
CREATE INDEX ON document_chunks
  USING hnsw (embedding_vec vector_cosine_ops);
```

Then replace the candidate query with an ANN search ordered by
`embedding_vec <=> :query_vec`, and keep the existing lexical score, rerank and
conflict detection unchanged. `RetrievedChunk` is the interface boundary and
does not change, so nothing above `retrieval.py` is affected.

## Migrations

`create_all()` runs at startup, which suits development and the demo. For
production, adopt Alembic before the first deployment:

```bash
alembic init migrations
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

and remove the `create_all()` call from `main.py`'s startup hook.

## Hardening the audit trail in the database

The application is append-only by construction; belt and braces at the database
level:

```sql
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;

CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
```

## Retention

| Data | Suggested retention |
|---|---|
| Audit logs | 2 years (regulatory) |
| `user_questions` | 90 days, then aggregate counts only |
| `conversations` / `conversation_messages` | 30 days |
| `reports` | 1 year after closure |
| `user_sessions` (revoked/expired) | 30 days |

IP addresses are never stored — only salted hashes — so retention policy
governs question text and report content rather than network identifiers.
