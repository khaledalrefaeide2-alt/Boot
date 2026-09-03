import { ShieldCheck } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">منصة الرصد والتحليل</p>
            <p className="text-xs text-muted-foreground">نظام داخلي — الدخول للمخوّلين فقط</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="px-4 py-5 text-center text-xs text-muted-foreground">
        <p>جميع محاولات الدخول تُسجَّل. الاستخدام مقصور على الغرض الرسمي المصرّح به.</p>
      </footer>
    </div>
  );
}
