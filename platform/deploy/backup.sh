#!/usr/bin/env bash
# =============================================================================
# نسخة احتياطية من قاعدة البيانات
#
#   يدوياً:   ./deploy/backup.sh
#   يومياً:   يُضاف إلى crontab — انظر DEPLOY.md
#
# النسخة تُكتب داخل حاوية القاعدة إلى /backups، وهو مجلد ./backups على
# الخادم. لا تُكتب عبر الشبكة ولا تحتاج فتح منفذ القاعدة.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

DC="./deploy/dc.sh"   # مصدر واحد لأمر compose — انظر dc.sh
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="monitoring-${STAMP}.dump"

# القيم تُقرأ من ملف البيئة نفسه الذي يشغّل المنصة، فلا تتفرّق النسختان
set -a
# shellcheck disable=SC1091
source .env.production
set +a

USER_NAME="${POSTGRES_USER:-monitor}"
DB_NAME="${POSTGRES_DB:-monitoring}"

mkdir -p backups

echo "⏳ أخذ نسخة من قاعدة ${DB_NAME}…"
# النسخة تُكتب على المُخرَج القياسي ويستقبلها الخادم المضيف، لا داخل الحاوية:
# مستخدم postgres داخل الحاوية لا يملك بالضرورة صلاحية الكتابة في مجلد
# مملوك لمستخدم الخادم، والفشل يظهر عندها كخطأ صلاحيات غامض لا كعطل واضح.
# و-T إلزامية: بدونها يُخصَّص طرفية فتُفسد البايتات الثنائية للنسخة.
#
# صيغة custom لا نص: تُستعاد انتقائياً وتُضغط تلقائياً وتقاوم اختلاف الإصدارات.
$DC exec -T postgres \
  pg_dump -U "$USER_NAME" -d "$DB_NAME" -F c > "backups/${FILE}"

# ملف مفقود أو بحجم صفر يعني فشلاً صامتاً — يُكشف الآن لا يوم الاستعادة
if [ ! -s "backups/${FILE}" ]; then
  echo "✗ النسخة فارغة أو لم تُكتب — راجع:  ./deploy/dc.sh logs postgres" >&2
  rm -f "backups/${FILE}"
  exit 1
fi

SIZE="$(du -h "backups/${FILE}" | cut -f1)"
echo "✅ ${FILE} (${SIZE})"

echo "🧹 حذف النسخ الأقدم من ${KEEP_DAYS} يوماً…"
find backups -name 'monitoring-*.dump' -type f -mtime "+${KEEP_DAYS}" -print -delete

echo "📦 النسخ المتاحة:"
ls -1sh backups/monitoring-*.dump 2>/dev/null | tail -5
