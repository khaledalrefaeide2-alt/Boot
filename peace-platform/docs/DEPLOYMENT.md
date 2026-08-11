# Deployment and operations

## Local development

```bash
cd peace-platform
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))"
python3 -c "import secrets; print('IP_HASH_SALT=' + secrets.token_urlsafe(32))"
# paste both into .env

python3 -m seed.demo_data --reset
python3 -m uvicorn app.main:app --reload
```

* Site: <http://127.0.0.1:8000>
* Dashboard: <http://127.0.0.1:8000/dash/login> (the seeder prints credentials)
* API docs (development only): <http://127.0.0.1:8000/api/docs>

Optional: `pip install pypdf` to enable PDF upload; without it the platform
tells the operator to paste the text instead of failing obscurely.

## Tests

```bash
python3 -m pytest         # 131 tests, ~20s
python3 -m pytest -k rbac -v
```

The suite builds its own throwaway database in a temp directory and forces the
offline AI provider, so it never touches your development data and never makes
a network call.

## Production

### 1. Environment

```bash
APP_ENV=production
DEBUG=false
SECRET_KEY=<48+ random bytes>
IP_HASH_SALT=<32+ random bytes>
COOKIE_SECURE=true
DATABASE_URL=postgresql+psycopg://peace:<password>@db-host:5432/peace_platform
DEMO_MODE=false
ANTHROPIC_API_KEY=<key>        # omit to run the offline provider
LLM_MODEL=claude-opus-5
UPLOAD_DIR=/var/lib/peace/uploads
CORS_ORIGINS=                  # leave empty unless a separate frontend needs it
```

Startup **refuses to run** if `SECRET_KEY` or `IP_HASH_SALT` is missing in
production, or if `COOKIE_SECURE` is false. That is deliberate: these are the
three settings whose absence is silently catastrophic.

### 2. Database

```bash
createdb peace_platform
psql peace_platform -c "CREATE EXTENSION IF NOT EXISTS vector;"   # optional, for pgvector
```

Adopt Alembic before the first deployment and remove the `create_all()` call
from the startup hook (`app/main.py`); see `docs/DATABASE.md`.

### 3. First administrator

`seed.demo_data` is a demonstration seeder and must not run in production.
Create the first account explicitly:

```python
from app.db import session_scope
from app.models import User
from app.security.passwords import hash_password
from app.services import audit
from app.services.context import Actor

with session_scope() as db:
    admin = User(
        name="…", email="…", role="system_admin", status="active",
        password_hash=hash_password("…"), must_change_password=True,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    audit.record(db, Actor.system(), audit.Action.USER_CREATE,
                 object_type="user", object_id=admin.id,
                 new_value={"email": admin.email, "bootstrap": True})
```

Every later account is created through `/dash/users`, which is audited.

### 4. Run

```bash
gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 4 --bind 127.0.0.1:8000 \
  --access-logfile - --error-logfile -
```

> ⚠️ **Before running more than one worker, replace the rate limiter.** It is
> in-process, so with `--workers 4` each worker enforces its own counters and
> the effective budget is four times the configured one. `ratelimit.check()` is
> the seam: back `_HITS` with Redis (`INCR` + `EXPIRE`) and nothing else
> changes. Until then, run a single worker.

`systemd` unit:

```ini
[Unit]
Description=Peace Emergency Information Platform
After=network.target postgresql.service

[Service]
User=peace
WorkingDirectory=/opt/peace-platform
EnvironmentFile=/etc/peace/env
ExecStart=/opt/peace-platform/.venv/bin/gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker --workers 1 --bind 127.0.0.1:8000
Restart=always
RestartSec=5

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/peace
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
```

### 5. Reverse proxy

```nginx
server {
    listen 443 ssl http2;
    server_name platform.example.gov;

    ssl_certificate     /etc/ssl/certs/platform.pem;
    ssl_certificate_key /etc/ssl/private/platform.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Compression matters more than anything else here: HTML and CSS
    # compress by roughly 4x, which is the difference between usable and
    # not on a congested mobile network.
    gzip on;
    gzip_types text/html text/css application/javascript application/json image/svg+xml;
    gzip_min_length 512;

    client_max_body_size 30M;   # must exceed MAX_UPLOAD_MB

    location /static/ {
        alias /opt/peace-platform/app/static/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;   # AI answers can take tens of seconds
    }
}

server {
    listen 80;
    server_name platform.example.gov;
    return 301 https://$host$request_uri;
}
```

`X-Forwarded-For` is only trusted when `APP_ENV=production`, so a client cannot
spoof its own rate-limit bucket in development.

### 6. Docker

```dockerfile
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

RUN adduser --system --group --home /app peace
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=peace:peace . .
RUN mkdir -p /var/lib/peace/uploads && chown peace:peace /var/lib/peace/uploads

USER peace
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health')"

CMD ["gunicorn", "app.main:app", "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "1", "--bind", "0.0.0.0:8000"]
```

## Operations

### Health

| Endpoint | Meaning |
|---|---|
| `GET /health` | Liveness. No I/O; use for the container probe. |
| `GET /api/v1/health/ready` | Readiness: database reachable, AI provider resolved. `503` when the database is down. |

### Logging

Structured JSON to stdout, one line per event, ready for journald or a log
shipper. Notable loggers: `peace.audit` (every sensitive action),
`peace.ai.assistant` (escalations), `peace.ai.ingest` (injection detections),
`peace.ai.anthropic` (API failures, refusals, truncation), `peace` (startup,
unhandled errors with a correlation id).

### Alerts worth configuring

| Condition | Why |
|---|---|
| `ai.refusal` or `ai.api_error` rate rising | The assistant is degrading; the offline provider will take over silently otherwise |
| `ingest.injection_detected` | Someone uploaded a poisoned document |
| `auth.login.failure` spike from one hashed IP | Credential stuffing |
| Rumors pending review > threshold | The review queue is falling behind during an emergency |
| `/api/v1/health/ready` returning 503 | Database unavailable |

### Backups

```bash
pg_dump -Fc peace_platform > /backup/peace-$(date +%F).dump
tar czf /backup/uploads-$(date +%F).tar.gz /var/lib/peace/uploads
```

Audit logs are the record of who published what during an emergency; treat them
as the highest-value backup target and test restoration.

### Emergency runbook

**Publish an urgent update**
`/dash/updates` → create → publish. Add an alert at `/dash/alerts` (type
`urgent`) if it must appear site-wide. Consider enabling emergency mode at
`/dash/crisis`.

**A false rumor is spreading**
`/dash/rumors` → open the claim → *Run assessment* (advisory) → record the
verdict with correction text → **Publish verification**. All four steps are
audited; the first cannot substitute for the third.

**The AI is answering badly**
`/dash/ai` → raise `min_confidence`, or clear `assistant_enabled` to disable
the assistant entirely. Updates, numbers and FAQs keep working. Use
`/dash/ai/playground` to see what a question actually retrieves.

**An emergency number changed**
`/dash/services` → edit → save. The previous value is recorded in the audit
log; verify at `/dash/audit`.

**A knowledge source is wrong or poisoned**
`/dash/knowledge` → *Disable*. Retrieval stops using it immediately.

### Scaling notes

The first three things to change, in order:

1. Replace the in-process rate limiter with Redis, then raise the worker count.
2. Move embeddings to a pgvector column and swap the candidate query in
   `retrieval.retrieve()` for an ANN search (`docs/DATABASE.md`).
3. Cache the public read paths (`/`, `/updates`, `/services`) behind the proxy
   for 30–60 seconds. They are the traffic spike during an emergency and their
   content changes on the order of minutes.
