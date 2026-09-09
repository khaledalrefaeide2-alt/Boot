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

  /*
   * سقف ذاكرة البناء.
   *
   * البناء على منصات الاستضافة يُقتل عند حدّ ذاكرة الحاوية، وأخطر ما في هذا
   * الحدّ أن Node لا يراه: V8 يشتقّ حجم كومته من ذاكرة **المضيف** لا من حدّ
   * الحاوية، فيسمح لنفسه بالتوسّع إلى ما لا تملكه الحاوية ثم تُقتل العملية
   * بلا رسالة مفهومة. السقف الحقيقي يُضبط بـ NODE_OPTIONS في Dockerfile،
   * وهنا نقلّل ما يُطلب من الذاكرة أصلاً:
   */

  // عدد عمليات توليد الصفحات مثبَّت. الافتراضي أربع عمليات، كلٌّ منها عملية
  // Node كاملة بكومتها الخاصة تحمّل حزمة الخادم بأكملها. اثنتان تكفيان
  // لستين صفحة وتوفّران نصف الذاكرة في أثقل مرحلة من البناء.
  experimental: {
    cpus: 2,
    serverSourceMaps: false,
  },

  // خرائط المصدر تُولَّد افتراضياً في مرحلة ما قبل التصيير — وهي المرحلة
  // التي ينفد فيها الحدّ عادةً. وهي عديمة الفائدة هنا: النظام داخلي ولا
  // يُنقَّح من المتصفح، وأثر البناء لا يُنشر للعملاء.
  enablePrerenderSourceMaps: false,
  productionBrowserSourceMaps: false,
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
