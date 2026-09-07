#!/usr/bin/env bash
# =============================================================================
# اختصار لأمر compose الإنتاجي.
#
# الأمر الكامل طويل ويسهل نسيان جزء منه:
#   docker compose -f docker-compose.prod.yml --env-file .env.production ...
#
# ونسيان `-f` يشغّل ملف التطوير على الخادم الحيّ — بمنافذ قاعدة بيانات
# مكشوفة وبلا شهادة. فالاختصار هنا وقاية لا راحة.
#
#   ./deploy/dc.sh up -d --build
#   ./deploy/dc.sh ps
#   ./deploy/dc.sh logs -f app
#   ./deploy/dc.sh exec app npm run owner:reset -- "كلمة_جديدة"
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.production ]; then
  echo "✗ لا يوجد ملف .env.production في $(pwd)" >&2
  echo "  انسخ القالب أولاً:  cp .env.production.example .env.production" >&2
  exit 1
fi

exec docker compose -f docker-compose.prod.yml --env-file .env.production "$@"
