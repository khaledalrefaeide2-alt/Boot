import { Activity, Layers, ShieldCheck } from 'lucide-react';
import { Tilt } from '@/components/ui/tilt';

/**
 * لوحة التعريف بجانب نموذج الدخول.
 *
 * شاشة الدخول هي السطح الوحيد في المنصة الذي يحتمل أجواءً بصرية: لا جداول
 * فيها تُمسح ولا أرقام تُقارن، ووظيفتها أن تقول ما هذا النظام قبل أن يدخله
 * الموظف. أما شاشات التشغيل فكثافتها هي وظيفتها، والعمق فيها يزاحم البيانات.
 *
 * التسلسل البصري ثلاث طبقات صريحة:
 *   الطبقة 0 — تدرّج خلفي ثابت، لا يتحرك ولا يُقرأ، يصنع مصدر الضوء.
 *   الطبقة 1 — بطاقات القدرات، ترتفع عن السطح وتميل مع المؤشر.
 *   الطبقة 2 — العنوان والنصّ، فوق الجميع وبأعلى تباين.
 *
 * تُخفى عن الشاشات الصغيرة كلياً (`hidden lg:flex`): على الجوال يجب أن يقع
 * حقل البريد في أول شاشة بلا تمرير، وأي مقدّمة قبله تؤخّر الغرض.
 */

const CAPABILITIES = [
  {
    icon: Activity,
    title: 'رصد مستمر',
    body: 'استخراج مجدول من المنصات مع تتبّع حالة كل عملية',
    metric: '٣ منصات',
  },
  {
    icon: Layers,
    title: 'تحليل موحّد',
    body: 'تصنيف وتحليل مشاعر ولوحات مقارنة بين الحسابات',
    metric: 'لوحات حيّة',
  },
  {
    icon: ShieldCheck,
    title: 'صلاحيات دقيقة',
    body: 'لكل مستخدم نطاق بيانات محدّد وسجل تدقيق كامل',
    metric: 'مُدقَّق',
  },
] as const;

export function HeroPanel() {
  return (
    <section
      className="relative hidden overflow-hidden rounded-xl border border-border p-8 lg:flex lg:flex-col lg:justify-center"
      aria-labelledby="hero-title"
    >
      {/*
        الطبقة 0: مصدر الضوء. عنصر مستقل خلف المحتوى بدل تدرّج على الحاوية
        نفسها، فلا يرث شفافيةً ولا يتداخل مع طمس الزجاج فوقه.
      */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-primary-soft via-surface to-surface-2"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-24 start-[-6rem] h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />

      <div className="relative">
        <p className="num mb-3 text-xs font-medium tracking-widest text-subtle-foreground">
          MEDIA MONITORING
        </p>
        <h1 id="hero-title" className="text-3xl font-bold leading-tight text-foreground">
          منصة رصد وتحليل
          <br />
          المنصات الإعلامية
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          نظام داخلي يجمع منشورات الحسابات المرصودة، ويحلّلها، ويعرضها في لوحات ومقارنات
          وتقارير قابلة للتصدير.
        </p>

        <ul className="mt-8 space-y-3">
          {CAPABILITIES.map(({ icon: Icon, title, body, metric }) => (
            <li key={title}>
              <Tilt>
                <article className="glass flex items-start gap-3 rounded-lg p-4 shadow-elev-2">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-elev-1"
                    aria-hidden
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                      {/*
                        الخط الأحادي للبيانات الدقيقة كما يوصي نظام التصميم،
                        لكن بمكدس محلي لا بخط من مصدر خارجي: المنصة قد تعمل
                        على شبكة معزولة، وطلب خط من الإنترنت يفقد الهوية عند
                        الانقطاع ويسرّب طلباً من جهاز كل موظف.
                      */}
                      <span className="num shrink-0 font-mono text-[0.6875rem] text-subtle-foreground">
                        {metric}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </article>
              </Tilt>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
