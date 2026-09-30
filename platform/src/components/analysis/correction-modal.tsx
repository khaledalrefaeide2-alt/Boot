'use client';

import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Select, Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { CONTENT_LABELS, SEVERITY_LEVELS, sortLabels, STANCE_METRIC } from '@/lib/domain/constants';

const STANCE = [
  { value: 'SUPPORTIVE', label: 'مؤيّد لسياسات الدولة' },
  { value: 'OPPOSED', label: 'معارض لسياسات الدولة' },
  { value: 'NEUTRAL', label: 'محايد' },
  { value: 'MIXED', label: 'مختلط' },
  { value: 'UNCLEAR', label: 'غير واضح' },
];

/*
 * «مختلط» ليس خياراً هنا.
 *
 * السياسة تحسمه: ما جمع مدحاً ونقداً سلبيٌّ بعلامة «محتوى مختلط»، لا
 * صنفٌ ثالث. وتركُه في القائمة يجعل المراجع يصحّح إلى قيمة لا يقبلها
 * النموذج ولا تعرفها التقارير، فيختلف الإنسان والآلة على منشورٍ واحد
 * بمعيارين — وهو أسوأ ممّا يصلحه التصحيح.
 */
const SENTIMENT = [
  { value: 'POSITIVE', label: 'إيجابي' },
  { value: 'NEGATIVE', label: 'سلبي' },
  { value: 'NEUTRAL', label: 'محايد' },
  { value: 'UNKNOWN', label: 'غير محسوم' },
];

const RISK = [
  { value: 'INCITEMENT_VIOLENCE', label: 'تحريض على العنف' },
  { value: 'SECTARIAN_REGIONAL', label: 'نفس طائفي أو مناطقي' },
  { value: 'HATE_SPEECH', label: 'خطاب كراهية' },
  { value: 'THREAT', label: 'تهديد' },
  { value: 'PLATFORM_POLICY', label: 'مخالفة معايير المنصات' },
];

/**
 * نافذة تصحيح التحليل.
 *
 * كل حقل اختياري عدا التعليل. ولو أُلزم المراجع بإعادة كتابة كلّ شيء
 * لنسخ ما لم يقصد تغييره، فعلّم النموذج ما لم يُرِد تعليمه.
 */
export function CorrectionModal({
  postId,
  open,
  current,
  onClose,
  onSaved,
}: {
  postId: string;
  open: boolean;
  current: {
    stance: string;
    sentiment: string;
    riskFlags: string[];
    labels?: string[];
    severityLevel?: number;
  } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [stance, setStance] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [flags, setFlags] = useState<string[]>([]);
  const [touchedFlags, setTouchedFlags] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  /*
   * ★ «هل مسّها؟» حالةٌ مستقلّة عن قيمتها.
   *
   *   المصفوفة الفارغة تحتمل معنيين: «محا المراجع الوسوم» و«لم يفتح
   *   القسم أصلاً». ولو أُرسلت الفارغةُ في الحالة الثانية لتعلّم النموذج
   *   من كلّ تصحيحٍ للمشاعر أنّ المراجعين ينزعون الوسوم.
   */
  const [touchedLabels, setTouchedLabels] = useState(false);
  const [severity, setSeverity] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStance('');
    setSentiment('');
    setFlags(current?.riskFlags ?? []);
    setTouchedFlags(false);
    setLabels(current?.labels ?? []);
    setTouchedLabels(false);
    setSeverity('');
    setNote('');
  }, [open, current]);

  async function submit() {
    setBusy(true);
    try {
      await api.post(`/api/posts/${postId}/analyze/correct`, {
        ...(stance ? { stance } : {}),
        ...(sentiment ? { sentiment } : {}),
        ...(touchedFlags ? { riskFlags: flags } : {}),
        ...(touchedLabels ? { labels } : {}),
        ...(severity !== '' ? { severityLevel: Number(severity) } : {}),
        note: note.trim(),
      });
      toast.success('حُفظ التصحيح', 'سيُستعمل مثالاً في التحليلات المشابهة');
      onSaved();
      onClose();
    } catch (error) {
      toast.error('تعذّر الحفظ', error instanceof ApiClientError ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const changed = Boolean(stance || sentiment || touchedFlags || touchedLabels || severity !== '');
  const canSubmit = changed && note.trim().length >= 10;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="تصحيح التحليل"
      description="يُصلح تصنيف هذا المنشور، ويُستعمل مثالاً تتعلّم منه التحليلات المشابهة."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={!canSubmit} loading={busy}>
            <GraduationCap className="h-4 w-4" aria-hidden />
            احفظ وعلّم
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="info">
          صحّح ما تراه خطأً فقط. ما تتركه فارغاً يبقى كما هو ولا يدخل التعليم.
        </Alert>

        <Select
          label="الموقف الصحيح"
          value={stance}
          onChange={(event) => setStance(event.target.value)}
          hint="اتركه فارغاً إن كان الموقف صحيحاً"
        >
          <option value="">— بلا تغيير —</option>
          {STANCE.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>

        <Select
          label={`${STANCE_METRIC.compact} الصحيح`}
          value={sentiment}
          onChange={(event) => setSentiment(event.target.value)}
          hint="اتركه فارغاً إن كان التصنيف صحيحاً"
        >
          <option value="">— بلا تغيير —</option>
          {SENTIMENT.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>

        {/*
          الخطورة قبل الوسوم: هي أوّل ما يُراجَع، وكثيراً ما يكون الخطأ
          فيها وحدها — وسمٌ صحيح بدرجةٍ مبالغٍ فيها أو مُهوَّنة.
        */}
        <Select
          label="درجة الخطورة الصحيحة"
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
          hint="اتركها فارغةً إن كانت الدرجة صحيحة — و«٠» حكمٌ بأنّه بلا مشكلة"
        >
          <option value="">— بلا تغيير —</option>
          {[0, 1, 2, 3, 4, 5].map((level) => (
            <option key={level} value={String(level)}>
              {SEVERITY_LEVELS[level]?.short} — {SEVERITY_LEVELS[level]?.label}
            </option>
          ))}
        </Select>

        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">
            وسوم المحتوى
          </legend>
          <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
            {sortLabels(Object.keys(CONTENT_LABELS)).map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                  checked={labels.includes(value)}
                  onChange={(event) => {
                    setTouchedLabels(true);
                    setLabels((prev) =>
                      event.target.checked
                        ? [...prev, value]
                        : prev.filter((label) => label !== value),
                    );
                  }}
                />
                <span className="text-sm text-foreground">{CONTENT_LABELS[value]?.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-2xs text-muted-foreground">
            ما لم تفتحه يبقى كما هو. ونزعُ الوسوم كلها حكمٌ يُتعلَّم منه كغيره.
          </p>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">
            إشارات المحتوى الضارّ (تُشتقّ من الوسوم — تبقى للشاشات القديمة)
          </legend>
          <div className="space-y-1.5">
            {RISK.map((item) => (
              <label key={item.value} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
                  checked={flags.includes(item.value)}
                  onChange={(event) => {
                    setTouchedFlags(true);
                    setFlags((current_) =>
                      event.target.checked
                        ? [...current_, item.value]
                        : current_.filter((flag) => flag !== item.value),
                    );
                  }}
                />
                <span className="text-sm text-foreground">{item.label}</span>
              </label>
            ))}
          </div>
          {touchedFlags && flags.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              بلا إشارات — سيتعلّم النموذج أن مثل هذا النصّ ليس محتوى ضارّاً.
            </p>
          )}
        </fieldset>

        <Textarea
          label="لماذا؟"
          required
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="مثال: النصّ ينتقد أداء الخدمات ولا يدعو إلى تقويض الدولة، فهو معارضة مشروعة لا تحريض."
          hint="هذا أنفع حقل: المثال يقول «ماذا»، وتعليلك يقول «لماذا» — وبه يُعمَّم على حالات مشابهة."
        />
      </div>
    </Modal>
  );
}
