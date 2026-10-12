import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import { QueryProvider } from '@/components/query-provider';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'منصة رصد وتحليل المنصات الإعلامية',
    template: '%s — منصة الرصد',
  },
  description: 'نظام داخلي لرصد وتحليل المحتوى المنشور على المنصات الإعلامية',
  robots: { index: false, follow: false, nocache: true },
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1120' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/*
          الخط مستضاف محلياً (public/fonts) ومُعرَّف في globals.css — لا طلب
          خارجي وقت التشغيل، فتعمل الهوية البصرية كاملة على شبكة معزولة.

          يُحمَّل مسبقاً وزنان عربيّان لا أكثر: 400 للمتن و700 للعناوين
          والأرقام، وهما ما يقع في أوّل ما يُرى. وكلّ تحميلٍ مسبق يزاحم
          ما سواه على الشبكة، فالأوزان الأخرى تصل عند الحاجة.
        */}
        <link
          rel="preload"
          href="/fonts/plex-arabic-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/plex-arabic-700.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <ToastProvider>{children}</ToastProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
