#!/usr/bin/env bash
# =============================================================================
# تنظيف قرص الخادم — بلا مساسٍ ببيانات المنصة.
#
#   ./deploy/cleanup.sh            # ينظّف ويطبع ما تحرّر
#   ./deploy/cleanup.sh --dry-run  # يعرض ما سيُحذف ولا يحذف
#
# ★ لماذا هذا الملفّ موجود أصلاً:
#
#   امتلأ القرص إلى ٧٩٪ فظُنّ أنّ السبب تراكمُ المنشورات، وكاد شهرٌ كامل
#   من الرصد يُحذف. والقياس قال غير ذلك: قاعدة البيانات والوسائط والتصدير
#   مجتمعةً ٣ جيجابايت، وذاكرةُ بناء Docker وحدها ٢٤٫٧ — ثمانيةُ أضعافها.
#
#   وكلّ `up -d --build` يُخلّف طبقاتٍ لا تُحذف من تلقائها. ستّ عشرة نشرة
#   متتالية تكفي لملء قرصٍ من خمسين جيجابايت.
#
# ولا يلمس هذا الملفّ: قاعدة البيانات، ولا مجلّدات Docker المستعملة،
# ولا صورةً تعمل منها حاوية. يحذف ذاكرة البناء، والصور المعلّقة، والنسخ
# الاحتياطية الأقدم من المدّة المحدّدة.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

# كم نسخة احتياطية تبقى — بالعدد لا بالعمر، فالعدد مضمون والعمر يتفاجأ
KEEP_BACKUPS="${KEEP_BACKUPS:-3}"

human() { numfmt --to=iec --suffix=B "${1:-0}" 2>/dev/null || echo "${1:-0}"; }

echo "── قبل التنظيف ──────────────────────────────"
df -h / | tail -1
docker system df 2>/dev/null || echo "✗ تعذّر قراءة حالة Docker"
echo

if [ "$DRY_RUN" = 1 ]; then
  echo ">> عرضٌ فقط — لن يُحذف شيء"
  echo
  echo "ذاكرة البناء القابلة للاسترجاع:"
  docker system df --format '{{.Type}}\t{{.Reclaimable}}' 2>/dev/null | grep -i 'build' || true
  echo
  echo "النسخ التي ستُحذف (يبقى أحدث ${KEEP_BACKUPS}):"
  ls -1t backups/monitoring-*.dump 2>/dev/null | tail -n "+$((KEEP_BACKUPS + 1))" || echo "  لا شيء"
  exit 0
fi

echo "🧹 ذاكرة بناء Docker…"
docker builder prune -af

echo "🧹 الصور المعلّقة (لا حاوية تستعملها)…"
docker image prune -f

# ملفّات السجلّ تنمو بلا سقفٍ ما لم يُضبط daemon.json — انظر deploy/daemon.json
echo "🧹 النسخ الاحتياطية — يبقى أحدث ${KEEP_BACKUPS}…"
if [ -d backups ]; then
  ls -1t backups/monitoring-*.dump 2>/dev/null \
    | tail -n "+$((KEEP_BACKUPS + 1))" \
    | while read -r old; do
        echo "   حُذف $(basename "$old")"
        rm -f "$old"
      done
fi

echo
echo "── بعد التنظيف ──────────────────────────────"
df -h / | tail -1
docker system df 2>/dev/null || true

cat <<'NOTE'

★ ولمنع التكرار: طبّق سقفاً دائماً على ذاكرة البناء مرّةً واحدة.
  انظر deploy/daemon.json وفقرة «القرص» في DEPLOY.md.
NOTE
