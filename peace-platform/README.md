# Peace Emergency Digital Information Platform

A calm, trustworthy public information platform for use during emergencies:
verified official updates, human-reviewed rumor verification, an emergency
services directory, safety guidance, and an AI assistant that answers **only**
from approved official sources and cites every one.

Its governing principle is enforced in code, not just in policy:

> **AI assists; humans approve.** Nothing an AI produces reaches a citizen
> until a person with the right permission explicitly publishes it.

Arabic-first (RTL), mobile-first, and built to work on a congested network.

---

## Contents

| Document | What it covers |
|---|---|
| `docs/ARCHITECTURE.md` | System design, module map, route map, request lifecycle |
| `docs/DATABASE.md` | Full schema, ERD, indexing, PostgreSQL notes |
| `docs/AI_RAG.md` | The RAG pipeline, safety layer, confidence model, prompts |
| `docs/SECURITY.md` | Threat model, controls, RBAC matrix, prompt-injection defence |
| `docs/DEPLOYMENT.md` | Running locally, production deployment, operations |

---

## Quick start

```bash
cd peace-platform
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Generate the two required secrets and paste them into .env:
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))"
python3 -c "import secrets; print('IP_HASH_SALT=' + secrets.token_urlsafe(32))"

python3 -m seed.demo_data --reset      # loads the demonstration dataset
python3 -m uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000>. The dashboard is at `/dash/login`; the seeder
prints demonstration credentials when it finishes.

**No API key is required to run the platform.** Without one it uses a
deterministic offline provider — see [AI providers](#ai-providers) below.

---

## Technology, and why

| Layer | Choice | Reasoning |
|---|---|---|
| Backend | FastAPI + SQLAlchemy 2.0 + Pydantic v2 | One coherent, typed Python service. Async-capable, small dependency surface. |
| Frontend | Server-rendered Jinja2 + ~9 KB of vanilla JS | See the note below. |
| Database | PostgreSQL in production, SQLite for dev/demo/tests | Identical models on both; no local database server needed to run the demo. |
| AI | Anthropic Claude (`claude-opus-5`) via the official SDK | Structured outputs give machine-checkable citations. Falls back to an offline provider. |
| Embeddings | Deterministic hashing embedder, or Voyage AI | Offline reproducibility by default; a learned model when you want one. |

### Why server-rendered instead of a React SPA

The brief suggested Next.js. This platform deliberately does not use it, for
reasons that come from the brief's own requirements:

* **Poor networks are a first-class requirement.** A page here is 12–25 KB of
  HTML plus a 22 KB stylesheet and 9 KB of JavaScript, all cacheable. A React
  build ships several hundred kilobytes before the first word is readable. When
  someone is standing in a flood trying to find out whether the road is open,
  that difference is the product.
* **Every page works with JavaScript disabled or broken.** Forms post normally
  and the server renders the result — including the AI assistant. JavaScript
  only upgrades the experience (answers appear in place instead of reloading).
  On a degraded connection the HTML often arrives when the JS does not.
* **One runtime, one deployment, one place where authorization lives.** A
  separate frontend would need its own build, its own deploy, and its own copy
  of routing and auth rules — three more things to get wrong.

The trade-off is real and worth stating: highly interactive UI is harder this
way. Nothing here needs it, and a JSON API (`/api/v1`) is exposed in full, so a
separate frontend can be added later without touching the service layer.

---

## AI providers

The platform always has a working assistant, and there is no configuration in
which it answers from a model's own knowledge.

| Configuration | Provider | Behaviour |
|---|---|---|
| `ANTHROPIC_API_KEY` set | `anthropic` | Claude, constrained by structured outputs; answers are grounded in retrieved passages and carry citations. |
| Key absent, or the API is unreachable | `extractive` | **Extraction, not generation**: every sentence returned is copied verbatim from a retrieved official passage. Hallucination is structurally impossible; the prose is correspondingly stiff. |

The active provider is shown to operators at `/dash/ai` and returned in the
assistant's JSON response, so a degraded mode is never silent.

---

## Testing

```bash
python3 -m pytest              # 131 tests, ~20s, no network access required
```

The suite covers the guarantees the platform makes, not just its plumbing:

| Guarantee | Tests |
|---|---|
| An unauthorised user cannot publish | `test_rbac.py` |
| A rumor cannot become public without human approval | `test_rumor_workflow.py` |
| The AI cannot invent an emergency number | `test_ai_safety.py` |
| Missing evidence yields "not enough verified information", never a guess | `test_ai_safety.py`, `test_rag.py` |
| Higher-trust and fresher sources outrank others; disabled ones vanish | `test_rag.py` |
| Sensitive operations are audited with before/after values | `test_audit_and_security.py` |
| Emergency mode changes the public UI | `test_api_and_ui.py` |
| Prompt injection in an uploaded document is neutralised | `test_ai_safety.py`, `test_rag.py` |

---

## Demonstration data

`DEMO_MODE=true` loads a single scenario — **Heavy Rain and Flood Emergency** —
comprising 1 crisis, 20 official sources, 12 assistance services, 6 published
updates, 10 FAQs, 16 guidance items, 8 indexed knowledge sources, 7 published
verifications and 3 rumors deliberately left unreviewed (so you can see that
they are invisible to citizens).

Every seeded record carries `is_demo`, every page that renders one labels it
**بيانات توضيحية / DEMONSTRATION DATA**, organisation names are fictional, and
all phone numbers use the reserved `555` range. Nothing here is presented as
real government information.

Demo credentials are printed by the seeder and are for a local instance only.

---

## Project layout

```
peace-platform/
├── app/
│   ├── main.py              application factory, error handling, logging
│   ├── config.py            environment-driven settings
│   ├── db.py                engine, session, declarative base
│   ├── i18n.py              Arabic (complete) and English catalogues
│   ├── models/              SQLAlchemy models, one module per domain
│   ├── security/            RBAC, sessions, CSRF, passwords, uploads, headers
│   ├── services/            business logic — permission checks + audit live here
│   ├── ai/
│   │   ├── providers/       Claude, offline extractive, embeddings
│   │   ├── ingest.py        extract → clean → chunk → embed → store
│   │   ├── retrieval.py     hybrid search, reranking, conflict detection
│   │   ├── safety.py        prompt-injection defence, answer validation
│   │   ├── assistant.py     the citizen-facing RAG orchestrator
│   │   └── rumor_analysis.py reviewer briefings
│   ├── api/v1.py            JSON API
│   ├── web/                 server-rendered public portal and dashboard
│   ├── templates/           Jinja2 (base, partials, public/, dash/)
│   └── static/              one stylesheet, one script, one icon
├── seed/demo_data.py        demonstration dataset
├── tests/                   pytest suite
└── docs/                    ARCHITECTURE, DATABASE, AI_RAG, SECURITY, DEPLOYMENT
```

---

## Environment variables

Every setting lives in `.env`; see `.env.example` for the annotated list. The
ones that matter most:

| Variable | Notes |
|---|---|
| `SECRET_KEY`, `IP_HASH_SALT` | **Required in production** — startup refuses without them. |
| `DATABASE_URL` | SQLite by default; `postgresql+psycopg://…` in production. |
| `COOKIE_SECURE` | **Must be `true` in production** — startup refuses otherwise. |
| `ANTHROPIC_API_KEY` | Optional. Absent ⇒ offline extractive provider. |
| `LLM_MODEL` | Defaults to `claude-opus-5`. |
| `DEMO_MODE` | Shows demonstration banners. Set `false` for real deployments. |

No secret is ever sent to the browser: templates receive only the fields listed
in `Settings.public_settings()`.

---

## What this platform does not do

Stated here because the same limits are stated to citizens on `/about`:

* It does **not** replace emergency services.
* It does **not** forward reports to any authority — no such integration
  exists, and the UI says so plainly rather than implying delivery.
* It does **not** publish AI-generated content without human approval.
* It does **not** speak for any government body.

## License and provenance

Demonstration software. Organisation names, contact numbers and bulletins in
the seeded dataset are fictional.
