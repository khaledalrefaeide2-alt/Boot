import { AmbientCanvas } from './ambient-canvas';

/**
 * اللوحة التعريفية بجانب نموذج الدخول.
 *
 * شاشة الدخول هي السطح الوحيد في المنصة الذي يحتمل أجواءً بصرية: لا جداول
 * فيها تُمسح ولا أرقام تُقارن، ووظيفتها أن تقول ما هذا النظام قبل أن يدخله
 * الموظف. أما شاشات التشغيل فكثافتها هي وظيفتها، والعمق فيها يزاحم البيانات.
 *
 * ★ ولا رقم حقيقي هنا إطلاقاً.
 *
 * المواصفة تطلب شريط مؤشرات ودليلاً اجتماعياً. وهذه الصفحة **عامة**: يفتحها
 * كل من يعرف العنوان قبل أن يسجّل دخوله. فعرض «١٤٨٧ منشوراً» أو «١٦١ ألف
 * إعجاب» عليها يسلّم حجم العملية ونشاطها لمن لم يُصرَّح له بشيء. الأرقام
 * الحقيقية محلّها لوحة النظرة العامة بعد الدخول، وما هنا وصفُ قدرات لا
 * قياسُ نشاط.
 *
 * والتسلسل البصري أربع طبقات صريحة:
 *   0 — حقل النقاط المنجرف (canvas ثنائي، لا يُقرأ ولا يُنقر)
 *   1 — هالة لونية ثابتة تصنع مصدر الضوء
 *   2 — العنوان والنصّ
 *   3 — قائمة القدرات القابلة للفتح
 *
 * تُخفى عن الشاشات الصغيرة كلياً: على الجوال يجب أن يقع حقل البريد في أول
 * شاشة بلا تمرير، وأي مقدّمة قبله تؤخّر الغرض.
 */

const CAPABILITIES = [
  {
    no: '01',
    title: 'رصد مستمر',
    body: 'استخراج مجدول من فيسبوك وإكس وإنستغرام، مع تتبّع حالة كل عملية ومهلتها وسقف عناصرها.',
  },
  {
    no: '02',
    title: 'استيراد وتطبيع',
    body: 'قراءة المنشورات وتوحيد حقولها على نموذج واحد، وبناء إحصاءات يومية لكل حساب.',
  },
  {
    no: '03',
    title: 'تصنيف وتحليل',
    body: 'مواضيع وكلمات مفتاحية ووسوم، وتحليل مشاعر، ومراجعة بشرية لما يحتاج قراراً.',
  },
  {
    no: '04',
    title: 'مقارنة ولوحات',
    body: 'لوحات محفوظة ومقارنات بين الحسابات والمنصات عبر الزمن بفلاتر قابلة للحفظ.',
  },
  {
    no: '05',
    title: 'تقارير وتصدير',
    body: 'قوالب تقارير جاهزة، وتصدير إلى Excel، وطباعة منسّقة إلى PDF.',
  },
  {
    no: '06',
    title: 'صلاحيات وتدقيق',
    body: 'نطاق بيانات محدّد لكل مستخدم، وسجل تدقيق كامل لكل عملية تغيير.',
  },
] as const;

export function HeroPanel() {
  return (
    <section
      className="relative hidden overflow-hidden rounded-2xl border border-border bg-surface p-8 lg:flex lg:flex-col lg:justify-center xl:p-10"
      aria-labelledby="hero-title"
    >
      <AmbientCanvas />

      {/*
        مصدر الضوء — عنصر مستقل خلف المحتوى لا تدرّج على الحاوية نفسها،
        فلا يرث شفافيةً ولا يتداخل مع طمس الزجاج فوقه.
      */}
      <div
        className="pointer-events-none absolute -top-32 start-[-8rem] h-96 w-96 rounded-full bg-primary/12 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[-10rem] end-[-6rem] h-80 w-80 rounded-full bg-accent/10 blur-3xl"
        aria-hidden
      />

      <div className="relative">
        <p className="overline overline-latin mb-4">Media Monitoring</p>

        <h1
          id="hero-title"
          className="display text-[length:var(--text-display-2)] leading-[var(--text-display-2--line-height)]"
        >
          منصة رصد وتحليل
          <br />
          المنصات الإعلامية
        </h1>

        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          نظام داخلي يجمع منشورات الحسابات المرصودة، ويحلّلها، ويعرضها في لوحات ومقارنات
          وتقارير قابلة للتصدير.
        </p>

        {/*
          الأكورديون بعنصر details الأصلي لا بحالة في React.
          يعمل بلا JavaScript، ويستجيب للوحة المفاتيح ولقارئ الشاشة بلا
          سطر واحد من aria، ولا يُدخل الصفحة في دورة ترطيب من أجل فتح فقرة.
        */}
        <ul className="mt-9 divide-y divide-border border-y border-border">
          {CAPABILITIES.map(({ no, title, body }) => (
            <li key={no}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 py-3 outline-none transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <span className="overline overline-latin w-6 shrink-0 text-primary">{no}</span>
                  <span className="flex-1 text-sm font-semibold text-foreground">{title}</span>
                  {/* علامة الفتح بـ CSS لا بأيقونة: خط واحد يدور 90 درجة */}
                  <span
                    className="h-2 w-2 shrink-0 rotate-45 border-b border-e border-subtle-foreground transition-transform duration-300 group-open:-rotate-[135deg]"
                    aria-hidden
                  />
                </summary>
                <p className="pb-4 pe-5 ps-9 text-xs leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
