'use client';

/**
 * الحدُّ الأخير — يُعرض حين يسقط التخطيط الجذري نفسه.
 *
 * ★ ولا يستورد من المشروع شيئاً. وهذا شرطُ عملٍ لا تبسيط.
 *
 *   هذه الصفحة تحلّ محلّ التخطيط الجذري، فهي تُعرض تحديداً حين يسقط
 *   ذاك: مزوّدُ السمة، أو مزوّد الاستعلامات، أو ورقةُ الأنماط، أو الخطّ.
 *   فلو بنت هيئتها على أيٍّ من ذلك لبنت على ما سقط — وسقطت معه، فيرى
 *   الموظّف شاشةً بيضاء بلا كلمة.
 *
 *   فكلُّ ما فيها بين يديها: الأنماط داخلها، والخطّ خطُّ النظام، ولا
 *   مكوّن من مكوّنات الواجهة. ولو تعطّل كلُّ شيءٍ آخر فهي تُعرض.
 *
 * ★ والسمة تتبع نظام الجهاز لا اختيار المستخدم.
 *
 *   فاختياره محفوظٌ يقرأه مزوّد السمة، والمزوّد هو ما سقط. و
 *   `prefers-color-scheme` تأتي من المتصفّح بلا جافاسكربت ولا مزوّد —
 *   فتُقارب الصواب بلا أن تعتمد على شيء.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <style>{STYLE}</style>
        <main className="wrap" role="alert">
          <span className="mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 9v4m0 4h.01M10.3 3.9 2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          <h1>تعذّر تحميل التطبيق</h1>
          <p>
            حدث خطأ غير متوقّع قبل أن تكتمل الواجهة. أعد المحاولة — وإن تكرّر فأبلغ مشغّل النظام
            برقم الحادثة أدناه.
          </p>

          <div className="row">
            <button type="button" className="btn primary" onClick={reset}>
              إعادة المحاولة
            </button>
            {/*
              رابطٌ صريح لا `router.push`: المُوجّه نفسه قد يكون هو ما
              سقط، وإعادةُ تحميلٍ كاملةٌ تبني كلّ شيءٍ من جديد.
            */}
            <a className="btn" href="/">
              اللوحة الرئيسية
            </a>
          </div>

          {error.digest && (
            <p className="digest">
              رقم الحادثة: <span>{error.digest}</span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}

/*
 * الأنماط نصٌّ داخل الصفحة — لأنّ ورقة الأنماط الخارجية قد تكون هي ما
 * لم يُحمَّل. والخطّ خطُّ النظام: خطُّ المشروع يُحمَّل من التخطيط الجذري.
 */
const STYLE = `
  /*
   * ★ القيم منسوخةٌ من «globals.css» حرفاً بحرف — ويفحص «verify:contrast»
   *   أنّها لم تفترق. فلو تغيّرت الهوية هناك ولم تتغيّر هنا لظهرت صفحةُ
   *   خطأٍ من هويّةٍ أخرى، ولكانت نسخةً تُنسى بلا من يذكّر بها.
   */
  :root {
    --bg: #f5f7fa;            /* --background */
    --surface: #ffffff;       /* --surface */
    --text: #17263c;          /* --foreground */
    --muted: #56667d;         /* --muted-foreground */
    --line: #e2e8f0;          /* --border */
    --btn-line: #7f8a9b;      /* --border-input */
    --danger: #c0262d;        /* --danger */
    --danger-soft: #fdeced;   /* --danger-soft */
    --primary: #087f8c;       /* --brand-700 */
    --primary-hover: #066a75; /* --brand-800 */
    --primary-text: #ffffff;  /* --primary-foreground */
  }
  @media (prefers-color-scheme: dark) {
    /*
     * والتركواز في السمة الداكنة يُقلب: فاتحٌ بحبرٍ غامق لا العكس. ولو
     * نُسخ تركواز الفاتحة إلى هنا لظهر زرٌّ داكنٌ على أرضيةٍ داكنة.
     */
    :root {
      --bg: #0b1320;            /* --background */
      --surface: #121c2b;       /* --surface */
      --text: #e6edf5;          /* --foreground */
      --muted: #9aa9bc;         /* --muted-foreground */
      --line: #26344a;          /* --border */
      --btn-line: #66788f;      /* --border-input */
      --danger: #f87171;        /* --danger */
      --danger-soft: #2c1616;   /* --danger-soft */
      --primary: #45c2cd;       /* --brand-700 */
      --primary-hover: #6ad0d9; /* --brand-800 */
      --primary-text: #04191c;  /* --primary-foreground */
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background: var(--bg);
    color: var(--text);
    font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, system-ui, -apple-system, sans-serif;
    line-height: 1.9;
    -webkit-font-smoothing: antialiased;
  }
  .wrap {
    width: 100%;
    max-width: 30rem;
    padding: 32px 24px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
    text-align: center;
  }
  /* الرقاقة صندوقٌ مرن لا حشوةٌ على svg: الحشوة على عنصرٍ سطريّ لا تُركّزه */
  .mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    margin: 0 auto 18px;
    border-radius: 999px;
    background: var(--danger-soft);
    color: var(--danger);
  }
  .mark svg { width: 26px; height: 26px; }
  h1 { margin: 0 0 10px; font-size: 1.125rem; font-weight: 600; }
  p { margin: 0; font-size: 0.875rem; color: var(--muted); }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
    margin-top: 24px;
  }
  /*
   * حدُّ الزرّ الثانوي أغمق من حدّ البطاقة — ونسبةُ تمييزٍ لا ذوق.
   *
   * فحدُّ البطاقة زينةٌ لا يدلّ على شيء، أمّا حدُّ الزرّ فهو الدليلُ
   * الوحيد على أنّ هنا زرّاً: خلفيّتُه خلفيّةُ البطاقة نفسها. وحدٌّ
   * بنسبة ١٫٢ لا يُرى، فيبقى الفعل موجوداً لا مرئياً. وحدُّ الحقول
   * («--border-input») يعطي ٣٫٥ على الفاتح و٣٫٨ على الداكن — فوق حدّ ٣.
   */
  .btn {
    /* ٤٨ بكسلاً: هدفُ لمسٍ مريح على الجوال، وهذه الصفحة تُفتح عليه أيضاً */
    min-height: 48px;
    min-width: 8rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 20px;
    border: 1px solid var(--btn-line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.9375rem;
    text-decoration: none;
    cursor: pointer;
  }
  .btn.primary {
    border-color: transparent;
    background: var(--primary);
    color: var(--primary-text);
  }
  .btn.primary:hover { background: var(--primary-hover); }
  /* حلقةُ التركيز لا تُحذف: لوحةُ المفاتيح هي ما يبقى حين يسقط كلّ شيء */
  .btn:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
  .digest {
    margin-top: 20px;
    font-size: 0.75rem;
  }
  .digest span {
    direction: ltr;
    unicode-bidi: isolate;
    font-family: ui-monospace, 'Consolas', monospace;
    user-select: all;
  }
`;
