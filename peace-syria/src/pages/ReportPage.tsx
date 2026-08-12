import { useRef, useState, type ChangeEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileImage,
  Flag,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { cx } from '../lib/utils';
import { useToast } from '../components/Toast';
import { InlineAlert, PageHeader, Spinner } from '../components/ui';

const steps = [
  { id: 1, title: 'المحتوى المُبلَّغ عنه', hint: 'أين رأيت المحتوى وما نوعه؟' },
  { id: 2, title: 'الوصف والأدلة', hint: 'اشرح الضرر وأرفق لقطة شاشة' },
  { id: 3, title: 'المراجعة والإرسال', hint: 'تأكّد من البيانات قبل الإرسال' },
];

const platforms = ['فيسبوك', 'إكس (تويتر)', 'واتساب', 'تيليغرام', 'إنستغرام', 'يوتيوب', 'تيك توك', 'أخرى'];

const violationTypes = [
  { value: 'تحريض على العنف', description: 'دعوة صريحة لإيذاء أشخاص أو ممتلكات' },
  { value: 'خطاب كراهية ضد فئة', description: 'إهانة أو تجريد من الإنسانية لفئة أو طائفة أو منطقة' },
  { value: 'تهديد شخصي', description: 'تهديد مباشر موجّه لشخص بعينه' },
  { value: 'شائعة خطرة', description: 'معلومة كاذبة قد تسبب ذعراً أو ضرراً' },
  { value: 'حملة منظمة', description: 'حسابات متعددة تستهدف شخصاً أو مجموعة' },
];

interface ReportForm {
  platform: string;
  type: string;
  url: string;
  description: string;
  attachmentName: string | null;
  contactEmail: string;
}

const emptyForm: ReportForm = {
  platform: platforms[0],
  type: violationTypes[0].value,
  url: '',
  description: '',
  attachmentName: null,
  contactEmail: '',
};

export default function ReportPage() {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ReportForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const update = <K extends keyof ReportForm>(field: K, value: ReportForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }));

  const onPickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.warning('الرجاء اختيار صورة (PNG أو JPG).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.warning('حجم الصورة يتجاوز ٥ ميغابايت.');
      return;
    }
    update('attachmentName', file.name);
    toast.success('أُرفقت لقطة الشاشة');
  };

  const validateStep = (current: number) => {
    if (current === 1) {
      if (form.url.trim().length < 5) {
        toast.warning('أدخل رابط المحتوى المُبلَّغ عنه.');
        return false;
      }
    }
    if (current === 2 && form.description.trim().length < 20) {
      toast.warning('اكتب وصفاً لا يقل عن ٢٠ حرفاً.');
      return false;
    }
    return true;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((current) => Math.min(3, current + 1));
  };

  const back = () => setStep((current) => Math.max(1, current - 1));

  const submit = async () => {
    if (!validateStep(1) || !validateStep(2)) return;

    setSubmitting(true);
    try {
      const { report } = await api.submitReport({
        url: form.url.trim(),
        platform: form.platform,
        type: form.type,
        description: form.description.trim(),
        attachmentName: form.attachmentName,
        contactEmail: form.contactEmail.trim() || null,
      });
      setReference(report.reference);
      toast.success('تم استلام بلاغك');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setForm(emptyForm);
    setStep(1);
    setReference(null);
  };

  if (reference) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-6">
        <div className="card flex flex-col items-center gap-4 p-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" aria-hidden />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">وصل بلاغك بنجاح</h1>
          <p className="max-w-md text-sm leading-7 text-slate-500">
            سيراجع الفريق المحتوى خلال ٤٨ ساعة. احتفظ بالرقم المرجعي للمتابعة.
          </p>
          <div className="rounded-2xl border border-dashed border-teal-300 bg-teal-50 px-6 py-4">
            <p className="text-xs font-bold text-teal-700">الرقم المرجعي</p>
            <p className="nums mt-1 text-2xl font-extrabold tracking-widest text-teal-900">{reference}</p>
          </div>

          <InlineAlert variant="warning">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>إن كان هناك خطر مباشر على حياة شخص، لا تكتفِ بالبلاغ هنا وتواصل مع الجهات المختصة فوراً.</span>
          </InlineAlert>

          <button type="button" onClick={resetAll} className="btn-secondary">
            <Flag className="h-4 w-4" aria-hidden />
            إرسال بلاغ آخر
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="حماية المجتمع"
        title="الإبلاغ عن خطاب كراهية"
        description="بلاغك يساعد على رصد المحتوى التحريضي والتعامل معه. لا تشارك المحتوى ولا تتفاعل معه قبل الإبلاغ."
      />

      {/* Stepper */}
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((item) => {
          const done = step > item.id;
          const active = step === item.id;
          return (
            <li
              key={item.id}
              className={cx(
                'flex items-center gap-3 rounded-2xl border px-4 py-3 transition',
                active ? 'border-teal-300 bg-teal-50' : done ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white',
              )}
            >
              <span
                className={cx(
                  'nums flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold',
                  active ? 'bg-teal-600 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500',
                )}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : item.id}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-800">{item.title}</span>
                <span className="block truncate text-xs text-slate-400">{item.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <section className="card space-y-6 p-6 sm:p-8">
        {step === 1 ? (
          <div className="animate-fade-in space-y-5">
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700">نوع المخالفة</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {violationTypes.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => update('type', item.value)}
                    className={cx(
                      'rounded-2xl border p-4 text-right transition',
                      form.type === item.value
                        ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300',
                    )}
                  >
                    <span className="block text-sm font-bold text-slate-800">{item.value}</span>
                    <span className="mt-1 block text-xs leading-6 text-slate-500">{item.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="report-platform" className="text-xs font-bold text-slate-700">
                  المنصة
                </label>
                <select
                  id="report-platform"
                  value={form.platform}
                  onChange={(event) => update('platform', event.target.value)}
                  className="input"
                >
                  {platforms.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="report-url" className="text-xs font-bold text-slate-700">
                  رابط المحتوى <span className="text-red-500">*</span>
                </label>
                <input
                  id="report-url"
                  dir="ltr"
                  value={form.url}
                  onChange={(event) => update('url', event.target.value)}
                  className="input text-left"
                  placeholder="https://…"
                />
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="animate-fade-in space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="report-description" className="text-xs font-bold text-slate-700">
                وصف المحتوى والضرر المتوقع <span className="text-red-500">*</span>
              </label>
              <textarea
                id="report-description"
                rows={6}
                value={form.description}
                onChange={(event) => update('description', event.target.value.slice(0, 3000))}
                className="input resize-y leading-8"
                placeholder="ماذا يقول المحتوى؟ من يستهدف؟ ولماذا تعتقد أنه خطر؟ لا تنسخ العبارات المسيئة كاملة إن أمكن."
              />
              <p className="nums text-left text-xs text-slate-400">{form.description.length}/3000</p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700">لقطة شاشة (اختياري)</span>
              {form.attachmentName ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-teal-800">
                    <FileImage className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{form.attachmentName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => update('attachmentName', null)}
                    className="rounded-xl p-2 text-teal-700 transition hover:bg-white"
                    aria-label="إزالة المرفق"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-slate-500 transition hover:border-teal-400 hover:bg-teal-50/50 hover:text-teal-700"
                >
                  <Upload className="h-6 w-6" aria-hidden />
                  <span className="text-sm font-bold">اختر صورة أو اسحبها إلى هنا</span>
                  <span className="text-xs">PNG أو JPG بحد أقصى ٥ ميغابايت</span>
                </button>
              )}
              <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
              <p className="text-[11px] leading-5 text-slate-400">
                في هذه النسخة التجريبية يُسجَّل اسم الملف فقط ولا تُرفع الصورة إلى الخادم.
              </p>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="animate-fade-in space-y-5">
            <dl className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
              {[
                { label: 'نوع المخالفة', value: form.type },
                { label: 'المنصة', value: form.platform },
                { label: 'الرابط', value: form.url },
                { label: 'الوصف', value: form.description },
                { label: 'المرفق', value: form.attachmentName ?? 'لا يوجد' },
              ].map((row) => (
                <div key={row.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem,1fr]">
                  <dt className="text-xs font-bold text-slate-500">{row.label}</dt>
                  <dd className="break-words text-sm leading-7 text-slate-800">{row.value}</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-1.5">
              <label htmlFor="report-email" className="text-xs font-bold text-slate-700">
                بريد للتواصل (اختياري)
              </label>
              <input
                id="report-email"
                type="email"
                dir="ltr"
                value={form.contactEmail}
                onChange={(event) => update('contactEmail', event.target.value)}
                className="input text-left"
                placeholder="you@example.com"
              />
              <p className="text-xs text-slate-400">يُستخدم لإعلامك بنتيجة البلاغ فقط، ولا يُنشر.</p>
            </div>

            <InlineAlert variant="warning">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>البلاغات الكيدية تُضعف قدرة الفريق على معالجة الحالات الحقيقية. تأكد من صحة ما ترسله.</span>
            </InlineAlert>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <button type="button" onClick={back} disabled={step === 1 || submitting} className="btn-secondary">
            <ArrowRight className="h-4 w-4" aria-hidden />
            السابق
          </button>

          {step < 3 ? (
            <button type="button" onClick={next} className="btn-primary">
              التالي
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={submitting} className="btn-primary">
              {submitting ? <Spinner /> : <Send className="h-4 w-4" aria-hidden />}
              {submitting ? 'جارٍ الإرسال…' : 'إرسال البلاغ'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
