# =============================================================================
# منصة رصد وتحليل المنصات الإعلامية — صورة موحّدة لتطبيق الويب وللعامل الخلفي
# =============================================================================
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

# --- تثبيت الاعتماديات ---
FROM base AS deps
COPY package.json package-lock.json ./
# إعدادات مقاومة لتذبذب الشبكة: تحميل 358 حزمة قد يتعثر على اتصال غير مستقر،
# فنزيد عدد المحاولات ومهلة كل طلب بدل أن يفشل البناء كله من أول تعثّر
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 180000 \
  && npm config set fetch-timeout 600000 \
  && npm ci --no-audit --no-fund

# --- البناء ---
FROM deps AS builder
COPY . .
# قيم وهمية للبناء فقط — لا اتصال فعلي بالقاعدة أثناء توليد العميل وبناء الصفحات
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV SESSION_SECRET="build-time-placeholder-secret-value-0123456789"
ENV NODE_ENV=production
RUN npm run build

# --- التشغيل ---
FROM base AS runner
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# تجريد أحرف CR التي يضيفها Git على ويندوز — بدونها تفشل نقطة الدخول داخل الحاوية
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/exports && chown -R nextjs:nodejs /app/exports

USER nextjs
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["web"]
