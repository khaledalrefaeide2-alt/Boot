#!/usr/bin/env bash
# =============================================================================
# إعداد منصة الرصد على ماك ولينكس
# التشغيل من مجلد platform:   bash setup.sh
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"
ENV_PATH=".env"

echo
echo "  إعداد منصة رصد وتحليل المنصات الإعلامية"
echo "  ----------------------------------------"
echo

if [ -f "$ENV_PATH" ]; then
  read -r -p "يوجد ملف .env بالفعل. هل تريد استبداله؟ (y/n) " answer
  [ "$answer" = "y" ] || { echo "أُلغي الإعداد."; exit 0; }
fi

read_required() {
  local prompt="$1" min="$2" hint="$3" value=""
  while true; do
    read -r -p "$prompt: " value
    if [ "${#value}" -ge "$min" ] && [[ "$value" != *'"'* ]] && [[ "$value" != *'#'* ]]; then
      printf '%s' "$value"
      return
    fi
    echo "  $hint" >&2
  done
}

echo "اكتب القيم التالية بحروف لاتينية وأرقام:"
echo

DB_PASSWORD=$(read_required "كلمة مرور قاعدة البيانات (8 محارف فأكثر)" 8 "قصيرة جداً أو تحتوي على محرف ممنوع")
OWNER_EMAIL=$(read_required "بريدك الإلكتروني للدخول" 5 "بريد غير صالح")
OWNER_NAME=$(read_required "اسمك (بحروف لاتينية)" 2 "قصير جداً")
OWNER_PASS=$(read_required "كلمة مرور دخولك (10 محارف فأكثر وتحتوي على رقم)" 10 "يجب ألا تقل عن 10 محارف")
read -r -p "رمز Apify (اضغط Enter لتخطيه الآن): " APIFY_TOKEN
APIFY_TOKEN="${APIFY_TOKEN:-}"

SESSION_SECRET=$(openssl rand -base64 48 2>/dev/null || head -c 48 /dev/urandom | base64)

cat > "$ENV_PATH" <<EOF
# أُنشئ هذا الملف بواسطة setup.sh — لا تشاركه مع أحد فهو يحوي أسراراً
POSTGRES_USER="monitor"
POSTGRES_DB="monitoring"
POSTGRES_PASSWORD="$DB_PASSWORD"
DATABASE_URL="postgresql://monitor:$DB_PASSWORD@localhost:5432/monitoring?schema=public"
REDIS_URL="redis://localhost:6379"
SESSION_SECRET="$SESSION_SECRET"
SESSION_TTL_DAYS="7"
APP_URL="http://localhost:3000"
APIFY_TOKEN="$APIFY_TOKEN"
APIFY_API_BASE="https://api.apify.com/v2"
APIFY_MAX_ITEMS_HARD_CAP="1000"
APIFY_RUN_TIMEOUT_SECONDS="900"
SEED_OWNER_EMAIL="$OWNER_EMAIL"
SEED_OWNER_NAME="$OWNER_NAME"
SEED_OWNER_PASSWORD="$OWNER_PASS"
NODE_ENV="development"
EOF

chmod 600 "$ENV_PATH"

echo
echo "  تم إنشاء ملف .env بنجاح"
[ -z "$APIFY_TOKEN" ] && echo "  ملاحظة: رمز Apify فارغ — الموقع سيعمل لكن الاستخراج معطّل حتى تضيفه"
echo
echo "  الخطوة التالية:"
echo "      docker compose up -d --build"
echo
echo "  ثم افتح المتصفح على http://localhost:3000"
echo "  وسجّل الدخول بالبريد: $OWNER_EMAIL"
echo
