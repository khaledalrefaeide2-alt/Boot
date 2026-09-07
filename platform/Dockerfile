# =============================================================================
# منصة رصد وتحليل المنصات الإعلامية — صورة موحّدة للويب والعامل والترحيلات
#
# صورة واحدة تخدم ثلاثة أدوار، يفرّق بينها أمر التشغيل لا محتوى الصورة:
#   web      →  npm run start:prod
#   worker   →  npm run worker:prod
#   migrate  →  npm run deploy:migrate   (أو deploy:bootstrap لأول نشر)
# =============================================================================
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

# --- تثبيت الاعتماديات ---------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
# إعدادات مقاومة لتذبذب الشبكة: تحميل 358 حزمة قد يتعثر على اتصال غير مستقر،
# فنزيد عدد المحاولات ومهلة كل طلب بدل أن يفشل البناء كله من أول تعثّر
#
# --ignore-scripts ضرورية لا تحسينية: سكربت postinstall في package.json يستدعي
# `prisma generate`، وهو يحتاج prisma/schema.prisma و prisma.config.ts — وكلاهما
# غير منسوخ بعد في هذه المرحلة. فكان البناء من نسخة نظيفة يفشل هنا برسالة
# «Could not find Prisma Schema». وتأجيل التوليد إلى مرحلة البناء يُبقي هذه
# الطبقة معتمدة على ملفَّي الحزم وحدهما، فلا يُعاد التثبيت مع كل تعديل شيفرة.
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 180000 \
  && npm config set fetch-timeout 600000 \
  && npm ci --ignore-scripts --no-audit --no-fund

# --- البناء ----------------------------------------------------------------
FROM deps AS builder
COPY . .
# `npm run build` = `prisma generate && next build` — التوليد هنا حيث المخطط حاضر.
#
# القيم الوهمية على سطر الأمر لا في ENV: تعليمة ENV تبقى في بيانات الصورة
# ويرثها كل ما يُبنى منها، فتظهر قيمة تشبه رابط قاعدة في صورة الإنتاج بلا
# داع. تمريرها للأمر وحده يجعلها تختفي بانتهائه.
#
# ولا اتصال بأي قاعدة هنا: البناء يحتاج وجود المتغيّرين ليجتاز التحقق في
# src/lib/env.ts عند جمع بيانات المسارات، لا ليتصل بشيء. (مُختبَر: البناء
# يفشل بلا المتغيّرين، وينجح بقيم وهمية لا تشير إلى خادم قائم.)
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" \
    SESSION_SECRET="build-time-placeholder-secret-value-0123456789" \
    NODE_ENV=production \
    npm run build

# --- التشغيل ---------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# الملكية تُضبط أثناء النسخ لا بعده: Next يكتب في .next/cache وقت التشغيل،
# وملفات مملوكة للجذر تجعل ذلك يفشل بصمت عند أول كتابة.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# src كاملاً: يحوي عميل Prisma المولَّد (src/generated) وشيفرة العامل معاً
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# تجريد أحرف CR التي يضيفها Git على ويندوز — بدونها تفشل نقطة الدخول داخل الحاوية
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/exports && chown -R nextjs:nodejs /app/exports

USER nextjs

# المنفذ الافتراضي للصورة. المنصات التي تحقن PORT يقرأه المشغّل تلقائياً،
# وAPP_PORT يغلبه عند الحاجة إلى تثبيت رقم بعينه. لا يُثبَّت أيٌّ منهما هنا
# حتى لا يُبطل ما تحقنه المنصة.
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["web"]
