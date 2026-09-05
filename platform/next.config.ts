import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /*
   * جذر المشروع مثبّت صراحةً.
   *
   * Next يستنتج الجذر بالبحث عن ملف قفل الاعتماديات صعوداً، فإن وُجد
   * package-lock.json شارد في مجلد المستخدم — وهو ما يحدث عند تشغيل npm
   * في المجلد الخطأ مرة واحدة — استنتج جذراً خاطئاً وأطلق تحذيراً.
   * التثبيت يجعل البناء واحداً على كل جهاز مهما كان محيطه.
   */
  turbopack: { root: projectRoot },
  reactStrictMode: true,
  poweredByHeader: false,
  // مكتبات خادمية بحتة يجب ألا تُحزَّم في حزمة العميل
  serverExternalPackages: ['@prisma/client', 'bullmq', 'ioredis', 'exceljs', 'bcryptjs', 'pg'],
  images: {
    // نخزّن روابط الوسائط فقط ولا نحمّل الملفات — نسمح بالمصادر البعيدة للعرض المصغّر
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    dangerouslyAllowSVG: false,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // النظام داخلي — لا يُفهرس إطلاقاً
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ];
  },
};

export default nextConfig;
