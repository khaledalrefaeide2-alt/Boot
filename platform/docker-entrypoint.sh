#!/bin/sh
set -e

case "$1" in
  web)
    echo "⏳ تطبيق مهاجرات قاعدة البيانات..."
    npx prisma migrate deploy
    echo "🌱 تهيئة البيانات الأولية..."
    npx tsx prisma/seed.ts || echo "⚠️  تخطّي التهيئة الأولية"
    echo "🚀 تشغيل تطبيق الويب على المنفذ 3000"
    exec npm run start
    ;;
  worker)
    echo "⚙️  تشغيل العامل الخلفي"
    exec npx tsx src/worker/index.ts
    ;;
  *)
    exec "$@"
    ;;
esac
