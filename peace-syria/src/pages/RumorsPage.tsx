import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Lightbulb,
  Plus,
  Search,
  ShieldAlert,
  ShieldQuestion,
  Sparkles,
  X,
} from 'lucide-react';
import type { Rumor, RumorVerification } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { cx, useDebounced } from '../lib/utils';
import { useToast } from '../components/Toast';
import { RumorCard, verdictTone } from '../components/RumorCard';
import { ShareModal } from '../components/ShareModal';
import { Modal } from '../components/Modal';
import {
  Badge,
  EmptyState,
  ErrorState,
  InlineAlert,
  PageHeader,
  ScoreBar,
  SkeletonCards,
  Spinner,
} from '../components/ui';

const submitCategories = ['أمن وسلامة', 'خدمات ومعيشة', 'صحة', 'اتصالات', 'احتيال رقمي', 'تحريض', 'غير مصنّف'];

function VerificationResult({ result }: { result: RumorVerification }) {
  const tone = verdictTone(result.status);

  return (
    <div className="animate-fade-in space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx('chip gap-1.5 text-sm', tone.chip)}>
          <AlertTriangle className="h-4 w-4" aria-hidden />
          النتيجة: {result.status}
        </span>
        <Badge tone="slate">{result.category}</Badge>
        {result.riskLevel ? (
          <Badge tone={result.riskLevel === 'مرتفع' ? 'red' : result.riskLevel === 'متوسط' ? 'amber' : 'emerald'}>
            الخطورة: {result.riskLevel}
          </Badge>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold text-slate-600">
          <span>مؤشر المصداقية</span>
          <span className="nums">{result.credibilityScore}%</span>
        </div>
        <ScoreBar value={result.credibilityScore} tone={tone.bar} />
        <p className="text-[11px] text-slate-400">كلما انخفض المؤشر، ازداد احتمال أن يكون الادعاء غير صحيح.</p>
      </div>

      <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
        <div className="mb-2 flex items-center gap-2 text-teal-800">
          <BadgeCheck className="h-4 w-4" aria-hidden />
          <span className="text-xs font-extrabold">التصحيح</span>
        </div>
        <p className="text-sm leading-8 text-teal-900">{result.correction}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center gap-2 text-slate-700">
          <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden />
          <span className="text-xs font-extrabold">نصيحة قبل النشر</span>
        </div>
        <p className="text-sm leading-8 text-slate-600">{result.advice}</p>
      </div>

      {result.reasoning ? (
        <details className="group rounded-2xl border border-slate-200 p-4">
          <summary className="cursor-pointer list-none text-xs font-extrabold text-slate-600 transition group-open:text-teal-700">
            مؤشرات التحليل التي اعتُمد عليها
          </summary>
          <p className="mt-2 text-sm leading-7 text-slate-500">{result.reasoning}</p>
        </details>
      ) : null}

      <InlineAlert variant="warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          التحليل آلي ولا يعتمد على تصفّح مباشر للمصادر. اعتبره نقطة انطلاق للتحقق، وارجع دائماً إلى الجهات الرسمية
          والمنصات المتخصصة بالتحقق.
        </span>
      </InlineAlert>
    </div>
  );
}

function SubmitRumorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [claim, setClaim] = useState('');
  const [category, setCategory] = useState(submitCategories[0]);
  const [source, setSource] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (claim.trim().length < 10) {
      toast.warning('اكتب نص الشائعة بما لا يقل عن ١٠ أحرف.');
      return;
    }

    setSubmitting(true);
    try {
      await api.submitRumor({ claim: claim.trim(), category, source: source.trim() });
      toast.success('وصلنا بلاغك، سيراجعه فريق التحقق قبل النشر.');
      setClaim('');
      setSource('');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="أرسل شائعة للتحقق"
      description="سيراجع فريق التحقق ما ترسله ثم يُنشر مع التصحيح الموثّق."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="rumor-claim" className="text-xs font-bold text-slate-700">
            نص الشائعة كما وصلتك <span className="text-red-500">*</span>
          </label>
          <textarea
            id="rumor-claim"
            value={claim}
            onChange={(event) => setClaim(event.target.value.slice(0, 2000))}
            rows={5}
            className="input resize-y leading-7"
            placeholder="انسخ الرسالة أو المنشور كما وصلك دون تعديل…"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="rumor-category" className="text-xs font-bold text-slate-700">
              التصنيف
            </label>
            <select
              id="rumor-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="input"
            >
              {submitCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="rumor-source" className="text-xs font-bold text-slate-700">
              أين رأيتها؟ (اختياري)
            </label>
            <input
              id="rumor-source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              className="input"
              placeholder="مجموعة واتساب، صفحة فيسبوك…"
            />
          </div>
        </div>

        <InlineAlert>
          <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden />
          <span>لا ترفق بيانات شخصية تخصّك أو تخص غيرك، ولا تعِد نشر الشائعة قبل التحقق منها.</span>
        </InlineAlert>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            إلغاء
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden />}
            إرسال للتحقق
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function RumorsPage() {
  const toast = useToast();

  const [text, setText] = useState('');
  const [result, setResult] = useState<RumorVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [rumors, setRumors] = useState<Rumor[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [category, setCategory] = useState('all');

  const [submitOpen, setSubmitOpen] = useState(false);
  const [sharing, setSharing] = useState<Rumor | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const data = await api.getRumors({ q: debouncedSearch.trim() || undefined, category });
      setRumors(data.rumors);
      setCategories(data.categories);
    } catch (err) {
      setListError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, category]);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 10) {
      toast.warning('الصق نص الشائعة أولاً (١٠ أحرف على الأقل).');
      return;
    }

    setVerifying(true);
    setVerifyError(null);
    try {
      setResult(await api.verifyRumor(trimmed));
      toast.success('اكتمل التحقق');
    } catch (err) {
      setResult(null);
      setVerifyError(errorMessage(err));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="التحقق"
        title="شائعة وتصحيح"
        description="افحص أي ادعاء يصلك عبر الذكاء الاصطناعي، أو تصفّح قاعدة الشائعات التي تحقّق منها الفريق مسبقاً."
        actions={
          <button type="button" onClick={() => setSubmitOpen(true)} className="btn-secondary">
            <Plus className="h-4 w-4" aria-hidden />
            أرسل شائعة للتحقق
          </button>
        }
      />

      {/* Live verification */}
      <section className="grid gap-6 lg:grid-cols-5">
        <div className="card space-y-4 p-6 lg:col-span-3">
          <div className="flex items-center gap-2 text-slate-700">
            <ShieldAlert className="h-5 w-5 text-teal-600" aria-hidden />
            <h2 className="text-sm font-extrabold">تحقّق فوري من ادعاء</h2>
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 3000))}
            rows={7}
            placeholder="الصق الرسالة أو المنشور الذي تشك فيه…"
            className="input resize-y leading-8"
            aria-label="نص الشائعة"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={verify} disabled={verifying} className="btn-primary flex-1 sm:flex-none">
              {verifying ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {verifying ? 'جارٍ التحقق…' : 'تحقّق الآن'}
            </button>
            {text || result ? (
              <button
                type="button"
                onClick={() => {
                  setText('');
                  setResult(null);
                  setVerifyError(null);
                }}
                className="btn-secondary"
              >
                <X className="h-4 w-4" aria-hidden />
                مسح
              </button>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-2">
          {verifying ? (
            <div className="card flex flex-col items-center justify-center gap-4 p-10 text-center">
              <Spinner className="h-8 w-8 text-teal-600" />
              <p className="text-sm font-semibold text-slate-600">يجري تحليل الادعاء…</p>
            </div>
          ) : verifyError ? (
            <ErrorState message={verifyError} onRetry={verify} />
          ) : result ? (
            <VerificationResult result={result} />
          ) : (
            <div className="card space-y-3 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <ShieldQuestion className="h-6 w-6" aria-hidden />
              </div>
              <h2 className="text-base font-extrabold text-slate-900">ثلاث علامات تكشف الشائعة</h2>
              <ul className="space-y-2.5 text-sm leading-7 text-slate-600">
                <li>• لا تذكر مصدراً محدداً يمكن الرجوع إليه.</li>
                <li>• تستعجلك على المشاركة «قبل الحذف».</li>
                <li>• تستخدم لغة انفعالية وتعميماً على فئة كاملة.</li>
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Verified database */}
      <section className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">قاعدة الشائعات المُتحقَّق منها</h2>
            <p className="text-sm text-slate-500">شائعات راجعها الفريق ونشر تصحيحها الموثّق.</p>
          </div>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث في الشائعات…"
              className="input pr-11"
              aria-label="بحث في الشائعات"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={cx(
              'chip border transition',
              category === 'all'
                ? 'border-teal-600 bg-teal-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-700',
            )}
          >
            الكل
          </button>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cx(
                'chip border transition',
                category === item
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-700',
              )}
            >
              {item}
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonCards count={4} />
        ) : listError ? (
          <ErrorState message={listError} onRetry={load} />
        ) : rumors.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert className="h-6 w-6" />}
            title="لا توجد شائعات مطابقة"
            description="جرّب كلمة بحث أخرى، أو أرسل شائعة جديدة ليتحقق منها الفريق."
            action={
              <button type="button" onClick={() => setSubmitOpen(true)} className="btn-primary">
                <Plus className="h-4 w-4" aria-hidden />
                أرسل شائعة
              </button>
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {rumors.map((rumor) => (
              <RumorCard key={rumor.id} rumor={rumor} onShare={setSharing} />
            ))}
          </div>
        )}
      </section>

      <SubmitRumorModal open={submitOpen} onClose={() => setSubmitOpen(false)} />
      <ShareModal
        open={Boolean(sharing)}
        onClose={() => setSharing(null)}
        title={`تصحيح: ${sharing?.claim ?? ''}`}
        text={sharing?.correction ?? ''}
      />
    </div>
  );
}
