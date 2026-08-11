# Architecture

## 1. Shape of the system

One Python service. Four layers, each depending only on the one beneath it:

```
┌───────────────────────────────────────────────────────────────┐
│  Presentation                                                 │
│    app/web/public.py    server-rendered citizen portal        │
│    app/web/dash.py      operations dashboard                  │
│    app/api/v1.py        JSON API                              │
│    app/templates/       Jinja2 · app/static/ CSS + JS         │
├───────────────────────────────────────────────────────────────┤
│  Services — business logic, permissions, auditing             │
│    crisis · updates · rumors · faqs · guidance · directory    │
│    alerts · reports · users · dashboard · settings_store      │
├───────────────────────────────────────────────────────────────┤
│  Capabilities                                                 │
│    app/ai/       ingest · retrieval · safety · assistant      │
│    app/security/ rbac · sessions · csrf · passwords · uploads │
├───────────────────────────────────────────────────────────────┤
│  Data — SQLAlchemy models, PostgreSQL or SQLite               │
└───────────────────────────────────────────────────────────────┘
```

**The rule that shapes everything else:** a route handler never mutates state
directly. It parses input, then calls a service function. Every mutating
service function takes an `Actor`, checks its own permission, and writes an
audit record. That is what makes it impossible to add a privileged operation
with no authorization and no audit trail — there is nowhere to put the code
that would lack one.

Concretely, publishing a rumor from the dashboard and publishing it from the
JSON API both land in `rumors.publish()`, which enforces the same three
preconditions in both cases.

## 2. Request lifecycle

```
request
  → SecurityHeadersMiddleware        CSP, HSTS, frame/referrer/permissions policy
  → route dependency                 locale · Actor · session · permission gate
  → CSRF check                       state-changing requests only
  → rate limit                       citizen write paths and login
  → service function                 permission re-check + audit + commit
  → template or JSON
  → response (+ no-store on /dash)
```

Errors never reach a citizen raw. `main.py` installs two handlers: one turns
`HTTPException` into a calm localised page (or JSON under `/api/`), the other
catches everything else, logs it with a correlation id, and shows that id to
the user so support can find it.

## 3. Why server-rendered

See the README for the full reasoning. The architectural consequence: the
presentation layer is stateless and thin, the JSON API is a peer of the HTML
UI rather than its backend, and both are served by one process with one
deployment and one authorization implementation.

Progressive enhancement is a hard rule here. `static/js/app.js` wraps its whole
initialisation in `try/catch`, and every form it enhances has a working
server-side POST handler. If the script fails to load, the site degrades to
full-page reloads and loses nothing else.

## 4. Route map

### Public

| Route | Purpose |
|---|---|
| `GET /` | Crisis status, quick actions, emergency numbers, latest updates, trending rumors |
| `GET /updates` · `/updates/{id}` | Official updates: filter, search, paginate, detail |
| `GET /rumors` · `/rumors/{id}` | Published verification results and the shareable card |
| `GET,POST /rumors/submit` | Citizen submits a claim |
| `GET,POST /assistant` | AI assistant (POST is the no-JavaScript path) |
| `GET /services` | Emergency directory, grouped, one-tap calling |
| `GET /guidance` | Before / during / after, segmented by audience |
| `GET /faq` | FAQ with search and category filters |
| `GET,POST /report` | Report a problem, with routing advice |
| `GET /sources` | Trusted sources and why each is trusted |
| `GET /about` · `/about/{governance,privacy,terms}` | Governance and policy |
| `GET /search` | Cross-content search |
| `POST /prefs/low-data` · `GET /prefs/lang/{locale}` | Presentation preferences (cookies) |

### Dashboard (`/dash`, authenticated, per-route permission)

`login` · `logout` · overview · `crisis` (+ emergency mode) · `updates` ·
`rumors` (+ detail, analyse, review, publish, unpublish) · `faqs` · `services` ·
`alerts` · `reports` · `sources` · `knowledge` (+ upload) · `ai` (config) ·
`ai/playground` (retrieval inspector) · `ai/quality` · `users` · `audit`.

### JSON API (`/api/v1`)

Reads: `health`, `health/ready`, `crisis/current`, `updates`, `updates/{id}`,
`rumors`, `rumors/{id}`, `services`, `faqs`, `guidance`, `sources`,
`alerts/active`.
Citizen writes (rate-limited): `assistant/ask`, `assistant/feedback`,
`rumors/submit`, `reports`.
Privileged (session cookie + `X-CSRF-Token`): `admin/rumors/{id}/publish`,
`admin/updates/{id}/publish`.

## 5. RBAC matrix

Defined once in `app/security/rbac.py` and consulted by both the route
dependency and the service function.

| Permission | admin | content editor | rumor reviewer | ops supervisor | AI admin | viewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `dashboard.view` | ● | ● | ● | ● | ● | ● |
| `updates.view` | ● | ● | ● | ● | ● | ● |
| `updates.create` / `edit` | ● | ● | | | | |
| `updates.publish` / `archive` | ● | ● | | | | |
| `rumors.view` | ● | ● | ● | ● | ● | ● |
| `rumors.review` | ● | | ● | | | |
| `rumors.publish` / `archive` | ● | | ● | | | |
| `faqs.manage` | ● | ● | | | | |
| `guidance.manage` | ● | ● | | | | |
| `services.manage` | ● | | | | | |
| `sources.manage` | ● | | | | ● | |
| `alerts.manage` | ● | | | ● | | |
| `reports.manage` | ● | | | ● | | |
| `knowledge.manage` | ● | | | | ● | |
| `ai.config` | ● | | | | ● | |
| `ai.quality.view` | ● | | | ● | ● | ● |
| `users.view` / `users.manage` | ● | | | | | |
| `audit.view` | ● | | | ● | | |
| `crisis.manage` / `emergency.toggle` | ● | | | ● | | |

Two deliberate choices:

* **`users.view` and `audit.view` are not part of "read-only".** The account
  directory reveals who holds which role and the audit log records every
  sensitive action; both are administrative surfaces. A viewer gets neither.
* **No role but `system_admin` both manages users and publishes content.** A
  compromised editor account cannot escalate by creating an admin.

Changing a role or suspending an account revokes that user's live sessions
immediately, because permissions are read from the account on every request.

## 6. Governance flows

### Official update

```
draft ──edit──> draft ──[updates.publish]──> published ──> archived
                  │
                  └─ AI citizen summary → stored UNAPPROVED
                        └─[updates.publish]→ approved → visible beside the original
```

The original official text is always on the detail page. An AI summary sits
above it, is labelled as such, and is only rendered once approved — the public
template and the JSON serialiser both check `citizen_summary_approved`.

### Rumor verification — the platform's central rule

```
citizen submits
      ↓
  unverified ──[AI analysis: writes ai_* columns only]──> under_review
      ↓
  human review  [rumors.review]  verdict + correction text (required)
      ↓
  verified / misleading / false / resolved      ← still NOT public
      ↓
  human publish [rumors.publish]                ← the only gate
      ↓
  visible at /rumors
```

`rumors.publish()` refuses unless all three hold: a concluded verdict, a
correction of at least ten characters, and a non-null `reviewed_by`. An AI
classification at confidence 1.0 satisfies none of them. `list_public()` and
`get_public()` filter on `published=True`, so there is no query path by which
an unpublished rumor reaches a citizen.

### Citizen report

Reports are stored and triaged; `route_suggestion()` returns *advice about who
to contact*. The confirmation page leads with the fact that nothing was
forwarded anywhere. If a real integration is ever added, `services/reports.py`
and `templates/public/report_received.html` are the two places that change —
together.

## 7. Emergency mode

A single audited key in `system_settings`, toggled by `ops_supervisor` or
`system_admin`. When enabled it adds `emergency-mode` to `<body>`, which:
raises the visual weight of the crisis block, pins emergency numbers to the top
of the home page via `order: -1`, and — if `hide_nonessential` is set — hides
the sources and FAQ previews.

It deliberately does **not** turn the interface red. Panic is a failure mode;
red is reserved for genuine emergency semantics.

## 8. Internationalisation

`app/i18n.py` holds one catalogue per locale; Arabic is complete and English is
a working subset that falls back to Arabic per key. Direction comes from the
locale (`rtl`/`ltr`) and the stylesheet uses logical properties throughout
(`inset-inline-start`, `padding-inline`, `border-inline-start`), so no rule is
duplicated per direction. A missing key renders as the key itself, which makes
a gap visible instead of blank.

The AI orchestrator returns *message keys* rather than sentences for its canned
responses, keeping translation out of the business layer.

## 9. Performance

* No web fonts (system stack renders Arabic well), no framework, no build step.
* 12–25 KB HTML per page; 22 KB CSS and 9 KB JS, both cacheable and shared.
* Low-data mode (a cookie, no login) drops shadows, animation and images.
* Skeleton, empty, error and offline states exist for every async surface.
* Dashboard responses are `no-store`; static assets are served with ETags.
