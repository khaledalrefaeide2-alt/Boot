# FB Intel — Facebook Analytics & Social Intelligence Platform

An enterprise-grade web application for professional social media intelligence and
Facebook content analytics. Monitor hashtags and keywords, discover viral content,
track engagement over time, compare competitors, and export professional reports —
all from one premium dashboard, similar in spirit to BuzzSumo but focused on
Facebook analytics and social listening.

> Works fully offline out of the box with a built-in demo data provider. Plug in
> **any** third-party Facebook Direct API from the Settings page — no keys are ever
> hardcoded.

---

## ✨ Features

| Module | Highlights |
| --- | --- |
| **Dashboard** | KPI cards, daily-activity trend, trending hashtags/keywords, viral posts, most-active pages, recent searches, live API usage |
| **Keyword Explorer** | Mentions, engagement, reach, sentiment, popularity, related keywords, 30-day trend, save to collections, filters |
| **Hashtag Explorer** | Mentions, engagement, trending score, growth, top pages/posts, engagement distribution, timeline, multi-hashtag compare |
| **Content Discovery** | Search public posts; sort by viral/newest/engagement/comments/shares; media previews, engagement rate, language |
| **Trending Center** | Daily / weekly / monthly trends, top-growing hashtags & keywords, emerging topics |
| **Competitor Analysis** | Compare up to 5 pages across followers, engagement, posting frequency, growth — radar + table |
| **Reports Center** | Executive / Trend / Hashtag / Keyword / Engagement / Competitor templates → **CSV / Excel / PDF** |
| **Search History** | Every search stored; favorite, soft-delete, restore, filter by type |
| **Collections** | Folders for favorite hashtags, keywords, reports & searches |
| **Alerts Center** | Threshold alerts on keywords/hashtags/pages/engagement; evaluated on a timer + on demand → notifications |
| **Settings** | API management (key/secret/base URL, test/disconnect, rate-limit monitor, logs), local database management, general, security, about |
| **User Management** | Admin / Editor / Viewer roles with role-based access control |
| **Global Search** | One box across keywords, hashtags, pages, posts, reports & history |
| **Notifications** | In-app center for trends, alerts, warnings, errors |

Plus: light/dark/system themes, responsive layout, Framer Motion animations,
loading skeletons, glassmorphism top bar, and an official brand palette.

---

## 🧱 Tech Stack

**Frontend** — Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS ·
Framer Motion · Apache ECharts · next-themes · Zustand · Axios

**Backend** — Node.js · Express · TypeScript · REST API · JWT auth · Zod validation ·
Helmet · rate limiting · bcrypt

**Database** — SQLite by default (better-sqlite3); PostgreSQL supported as an
optional upgrade

---

## 📁 Project Structure

```
.
├── server/                     # Express + TypeScript REST API
│   ├── src/
│   │   ├── config/             # Env-driven configuration
│   │   ├── db/                 # SQLite connection, schema.sql, seed
│   │   ├── middleware/         # auth (JWT + RBAC), error handling
│   │   ├── providers/          # Social provider adapters (mock + HTTP)
│   │   ├── routes/             # REST endpoints per module
│   │   ├── services/           # settings, alerts, reports, audit, factory…
│   │   ├── types/              # Shared types + SocialProvider interface
│   │   └── utils/              # AES-256-GCM secret encryption, seeded RNG
│   └── package.json
│
└── web/                        # Next.js frontend
    ├── src/
    │   ├── app/                # App Router pages ( (app) route group is auth-guarded )
    │   ├── components/         # Sidebar, Topbar, Chart, KPI cards, filters, icons…
    │   ├── hooks/              # useAuth, useFetch, useIsDark
    │   ├── lib/                # api client, chart options, formatters
    │   └── styles/             # Tailwind globals + design tokens
    └── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (tested on Node 22)

### 1. Backend

```bash
cd server
cp .env.example .env          # then edit secrets for production
npm install
npm run seed                  # creates the SQLite DB + demo data + admin user
npm run dev                   # http://localhost:4000
```

The seed creates three demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@fbintel.local` | `Admin123!` |
| Editor | `editor@fbintel.local` | `Password123!` |
| Viewer | `viewer@fbintel.local` | `Password123!` |

### 2. Frontend

```bash
cd web
cp .env.example .env
npm install
npm run dev                   # http://localhost:3000
```

Open **http://localhost:3000** and sign in with the admin account above.
The Next.js dev server proxies `/api/*` to the backend (`API_PROXY_TARGET`).

### Production build

```bash
# backend
cd server && npm run build && npm start
# frontend
cd web && npm run build && npm start
```

---

## 🔌 Connecting a real Facebook Direct API

No API key is hardcoded. To use live data:

1. Sign in and go to **Settings → API**.
2. Switch provider mode to **Third-party Direct API**.
3. Enter your **Base URL**, **API Key** (and optional **Secret**), then **Save**.
4. Click **Test connection**.

Keys are **encrypted at rest** with AES-256-GCM (`SETTINGS_ENCRYPTION_KEY`) and are
never returned to the client in plaintext (they are masked). Every outbound call is
timed and written to `api_logs`, powering the rate-limit monitor and API logs view.

Because real providers differ, response mapping lives in one place —
`server/src/providers/httpProvider.ts` (`normalizePost`). Adjust the field mapping
to match your provider's payload.

---

## 🧩 Extending to other platforms

The provider layer is platform-agnostic (`SocialProvider` interface in
`server/src/types`). Instagram, Threads, X, YouTube, TikTok, LinkedIn, Reddit or
Google Trends adapters can be added under `server/src/providers/` and wired in
`services/provider.factory.ts` **without touching the routes or the frontend**.

---

## ⚙️ Configuration (server `.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated allowed origins |
| `JWT_SECRET` | — | **Change in production** |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `DB_CLIENT` | `sqlite` | `sqlite` or `postgres` |
| `SQLITE_PATH` | `./data/fbintel.db` | SQLite file path |
| `DATABASE_URL` | — | Postgres connection string (when `DB_CLIENT=postgres`) |
| `SETTINGS_ENCRYPTION_KEY` | — | 32-byte hex key for encrypting stored API keys (`openssl rand -hex 32`) |

---

## 🔐 Security

- JWT authentication with role-based access control (Admin / Editor / Viewer)
- API keys encrypted at rest (AES-256-GCM) and masked in transport
- Input validation with Zod on every write endpoint
- Helmet security headers + per-route rate limiting
- Audit log of security-relevant actions
- Secrets via environment variables — nothing hardcoded

---

## 📡 API Overview

All endpoints are under `/api`. Protected routes require `Authorization: Bearer <token>`.

```
POST   /api/auth/login | /register | /change-password    GET /api/auth/me
GET    /api/dashboard
GET    /api/analytics/keywords | /keywords/compare
GET    /api/analytics/hashtags | /hashtags/compare
GET    /api/analytics/content
GET    /api/analytics/competitors/pages
GET    /api/analytics/trending
GET    /api/history   POST /:id/favorite|restore  DELETE /:id
CRUD   /api/collections  (+ /:id/items)
CRUD   /api/alerts       (+ POST /evaluate)
GET    /api/notifications  POST /:id/read | /read-all
CRUD   /api/reports      (+ GET /:id/download)
GET    /api/settings  PUT /  PUT /api  POST /api/test|disconnect  GET /api/logs|status
GET    /api/database/health|export|backup  POST /initialize|optimize|clear-cache|reset
GET    /api/search        (global)
CRUD   /api/users         (admin only)
```

---

## 🗄️ Local Database Management

From **Settings → Database**: view health & storage, initialize, optimize (VACUUM),
export to JSON, back up the SQLite file, clear cache, or reset analytics data
(users & settings preserved).

---

## 📄 License

Provided as-is for demonstration and internal use.
