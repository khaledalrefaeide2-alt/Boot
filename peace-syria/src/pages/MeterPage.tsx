import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eraser,
  Gauge,
  Lightbulb,
  ScanText,
  Sparkles,
  Users,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import type { MeterResult } from '../../shared/types';
import { copyToClipboard, cx, scoreTone } from '../lib/utils';
import { useToast } from '../components/Toast';
import { Badge, CircularProgress, ErrorState, InlineAlert, PageHeader, Spinner } from '../components/ui';

const MAX_LENGTH = 4000;

const samples = [
  {
    label: 'مثال: نص فيه تعميم',
    text: 'كل سكان الحي الفلاني نفس الشي، ما بينفع الحكي معن أبداً، كلهن سبب المشاكل يلي عم تصير.',
  },
  {
    label: 'مثال: نص غاضب',
    text: 'خلص ما عاد في صبر، لازم نوقف هالتصرفات بأي طريقة وما بيهم شو بيصير بعدين.',
  },
  {
    label: 'مثال: نص هادئ',
    text: 'أدعو الجميع للتحقق من الأخبار قبل مشاركتها، ولنتذكر أن كل عائلة في الحي تريد ما نريده: الأمان.',
  },
];

export default function MeterPage() {
  const toast = useToast();
  const [text, setText] = useState('');
  const [result, setResult] = useState<MeterResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 10) {
      toast.warning('اكتب نصاً لا يقل عن ١٠ أحرف لتحليله.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setResult(await api.analyzeText(trimmed));
      toast.success('اكتمل التحليل');
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const copyRewritten = async () => {
    if (!result?.rewrittenText) return;
    const ok = await copyToClipboard(result.rewrittenText);
    ok ? toast.success('تم نسخ الصياغة البديلة') : toast.error('تعذّر النسخ، انسخ النص يدوياً.');
  };

  const tone = result ? scoreTone(result.safetyScore) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="أداة الفحص"
        title="مقياس لغة السلام"
        description="الصق نصّك قبل نشره، وسيحلّله الذكاء الاصطناعي بحثاً عن التحريض والتعميم، ويقترح صياغة بديلة تحافظ على رسالتك بلغة أكثر أماناً."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Input side */}
        <section className="card space-y-4 p-6 lg:col-span-3">
          <div className="flex items-center gap-2 text-slate-700">
            <ScanText className="h-5 w-5 text-teal-600" aria-hidden />
            <h2 className="text-sm font-extrabold">النص المراد فحصه</h2>
          </div>

          <div className="relative">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, MAX_LENGTH))}
              rows={9}
              placeholder="اكتب أو الصق النص هنا… مثال: منشور تنوي نشره على فيسبوك أو تعليق ترد به على نقاش."
              className="input resize-y leading-8"
              aria-label="النص المراد فحصه"
            />
            <span className="nums pointer-events-none absolute bottom-3 left-4 text-xs font-semibold text-slate-400">
              {text.length}/{MAX_LENGTH}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {samples.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => setText(sample.text)}
                className="chip border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
              >
                {sample.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={analyze} disabled={loading} className="btn-primary flex-1 sm:flex-none">
              {loading ? <Spinner /> : <Gauge className="h-4 w-4" aria-hidden />}
              {loading ? 'جارٍ التحليل…' : 'حلّل النص'}
            </button>
            <button
              type="button"
              onClick={() => {
                setText('');
                setResult(null);
                setError(null);
              }}
              disabled={loading || (!text && !result)}
              className="btn-secondary"
            >
              <Eraser className="h-4 w-4" aria-hidden />
              مسح
            </button>
          </div>

          <p className="text-xs leading-6 text-slate-400">
            لا يُحفظ نصّك على الخادم؛ يُرسل للتحليل ثم تُعاد النتيجة مباشرة إليك.
          </p>
        </section>

        {/* Result side */}
        <section className="space-y-4 lg:col-span-2">
          {loading ? (
            <div className="card flex flex-col items-center justify-center gap-4 p-10 text-center">
              <Spinner className="h-8 w-8 text-teal-600" />
              <p className="text-sm font-semibold text-slate-600">يقرأ الذكاء الاصطناعي نصّك الآن…</p>
              <p className="text-xs text-slate-400">قد تستغرق العملية بضع ثوانٍ.</p>
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={analyze} />
          ) : result && tone ? (
            <div className={cx('card space-y-5 p-6', tone.border)}>
              <div className="flex flex-col items-center gap-3 text-center">
                <CircularProgress value={result.safetyScore} ringClass={tone.ring} caption="من ١٠٠" label="درجة سلامة اللغة" />
                <div>
                  <p className={cx('text-sm font-extrabold', tone.text)}>لغة {tone.label}</p>
                  {result.tone ? <p className="text-xs text-slate-500">النبرة: {result.tone}</p> : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div
                  className={cx(
                    'rounded-2xl border p-3 text-center',
                    result.isCalm ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50',
                  )}
                >
                  <CheckCircle2
                    className={cx('mx-auto h-5 w-5', result.isCalm ? 'text-emerald-600' : 'text-amber-600')}
                    aria-hidden
                  />
                  <p className="mt-1.5 text-xs font-bold text-slate-700">النبرة</p>
                  <p className={cx('text-xs font-semibold', result.isCalm ? 'text-emerald-700' : 'text-amber-700')}>
                    {result.isCalm ? 'هادئة' : 'انفعالية'}
                  </p>
                </div>
                <div
                  className={cx(
                    'rounded-2xl border p-3 text-center',
                    result.hasGeneralization ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50',
                  )}
                >
                  <Users
                    className={cx('mx-auto h-5 w-5', result.hasGeneralization ? 'text-red-600' : 'text-emerald-600')}
                    aria-hidden
                  />
                  <p className="mt-1.5 text-xs font-bold text-slate-700">التعميم</p>
                  <p
                    className={cx(
                      'text-xs font-semibold',
                      result.hasGeneralization ? 'text-red-700' : 'text-emerald-700',
                    )}
                  >
                    {result.hasGeneralization ? 'موجود' : 'غير موجود'}
                  </p>
                </div>
              </div>

              {result.safetyScore >= 80 ? (
                <InlineAlert variant="success">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>نصّك آمن للنشر. شكراً لاختيارك لغة تبني ولا تهدم.</span>
                </InlineAlert>
              ) : (
                <InlineAlert variant={result.safetyScore >= 35 ? 'warning' : 'error'}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {result.safetyScore >= 35
                      ? 'النص يحتاج تعديلاً قبل النشر؛ راجع الصياغة البديلة بالأسفل.'
                      : 'النص يحتوي لغة قد تُفهم كتحريض أو كراهية. لا يُنصح بنشره كما هو.'}
                  </span>
                </InlineAlert>
              )}

              <div className="space-y-2">
                <h3 className="text-xs font-extrabold text-slate-700">تحليل موجز</h3>
                <p className="text-sm leading-7 text-slate-600">{result.analysis}</p>
              </div>

              {result.flaggedPhrases?.length ? (
                <div className="space-y-2">
                  <h3 className="text-xs font-extrabold text-slate-700">عبارات تستدعي الانتباه</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.flaggedPhrases.map((phrase, index) => (
                      <Badge key={`${phrase}-${index}`} tone="red">
                        {phrase}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.rewrittenText ? (
                <div className="space-y-2 rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-xs font-extrabold text-teal-800">
                      <Sparkles className="h-4 w-4" aria-hidden />
                      صياغة بديلة مقترحة
                    </h3>
                    <button type="button" onClick={copyRewritten} className="btn-ghost px-2.5 py-1.5 text-xs text-teal-700">
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      نسخ
                    </button>
                  </div>
                  <p className="text-sm leading-8 text-teal-900">{result.rewrittenText}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="card space-y-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                <Lightbulb className="h-6 w-6" aria-hidden />
              </div>
              <h2 className="text-base font-extrabold text-slate-900">كيف يعمل المقياس؟</h2>
              <ul className="space-y-3 text-sm leading-7 text-slate-600">
                <li className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
                  يفحص النبرة العامة: هل الكلام هادئ أم انفعالي؟
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
                  يرصد التعميم على فئة أو طائفة أو منطقة أو قومية.
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
                  يمنح درجة سلامة من ١٠٠ ويشرح سببها.
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
                  يقترح صياغة بديلة تحفظ رسالتك بلغة سلمية.
                </li>
              </ul>
              <InlineAlert>
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                <span>النتيجة إرشادية وليست حكماً نهائياً؛ القرار الأخير يبقى لك.</span>
              </InlineAlert>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
