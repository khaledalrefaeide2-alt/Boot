import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
