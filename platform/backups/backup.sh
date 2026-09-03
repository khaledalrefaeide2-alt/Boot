#!/usr/bin/env bash
# نسخة احتياطية لقاعدة البيانات — شغّلها من مجلد المشروع
set -euo pipefail
STAMP=$(date +%Y-%m-%d_%H%M%S)
OUT="backups/monitoring_${STAMP}.dump"
echo "⏳ إنشاء نسخة احتياطية..."
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-monitor}" -d "${POSTGRES_DB:-monitoring}" -Fc > "$OUT"
echo "✅ تمت النسخة: $OUT"
echo "   الاستعادة: docker compose exec -T postgres pg_restore -U ${POSTGRES_USER:-monitor} -d ${POSTGRES_DB:-monitoring} --clean --if-exists < $OUT"
