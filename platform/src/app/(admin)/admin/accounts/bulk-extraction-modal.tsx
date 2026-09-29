'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { arabicPlural, formatNumber } from '@/lib/utils';

export interface LimitTarget {
  id: string;
  name: string;
  maxItemsPerRun: number;
}

interface BulkExtractionResponse {
  updated: number;
  skipped: number;
  changed: number;
  maxItemsPerRun: number;
}

/** عدد الأسماء المعروضة قبل الاختصار — يكفي للتعرّف بلا أن تطول النافذة */
const PREVIEW = 12;

/** قيم جاهزة تغطّي أكثر الحالات، فلا يُكتب الرقم في كل مرّة */
const PRESETS = [25, 50, 100, 200, 500];

/**
 * ضبط سقف المنشورات لعدّة حسابات دفعةً واحدة.
 *
 * السقف حاجز الفوترة على Apify: كلّ تشغيل يدفع بعدد ما يجلب. وضبطه
 * حساباً حساباً على أربعين حساباً أربعون فتحاً لنافذة وأربعون حفظاً —
 * فيُترك على قيمته الافتراضية، وتُدفع فاتورةٌ لم يقصدها أحد.
 *
 * ★ والنافذة تعرض المدى الحالي قبل التغيير.
 *
 *   من يحدّد أربعين حساباً لا يذكر سقف كلٍّ منها، وقد يكون بينها واحدٌ
 *   ضُبط بقصد على خمسمئة لأنه حساب رئيسي. والكتابة الجماعية تمحوه بلا
 *   أن يُسأل. فيُعرض «الحالي: من ٥٠ إلى ٥٠٠» — سطرٌ يوقف اليد حين يجب
 *   أن تتوقّف.
 */
export function BulkExtractionModal({
  targets,
  open,
  onClose,
  onSaved,
}: {
  targets: LimitTarget[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [value, setValue] = useState('100');

  /*
   * كل فتح يبدأ من القيمة السائدة في المحدَّد لا من آخر ما كُتب.
   *
   * فمن حدّد دفعةً كلّها على ٥٠ يجد ٥٠ لا ٥٠٠ من دفعةٍ سابقة — والرقم
   * الباقي من فتحةٍ ماضية أخطر من الفارغ، لأنه يبدو مقصوداً.
   */
  useEffect(() => {
    if (!open || targets.length === 0) return;
    const counts = new Map<number, number>();
    for (const target of targets) {
      counts.set(target.maxItemsPerRun, (counts.get(target.maxItemsPerRun) ?? 0) + 1);
    }
    const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 100;
    setValue(String(common));
  }, [open, targets]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<BulkExtractionResponse>('/api/accounts/bulk-extraction', {
        accountIds: targets.map((target) => target.id),
        maxItemsPerRun: Number(value),
      }),
    onSuccess: (data) => {
      const plural = arabicPlural(data.changed, {
        one: 'حساب',
        two: 'حساب',
        few: 'حسابات',
        many: 'حساباً',
      });
      toast.success(
        `صار السقف ${formatNumber(data.maxItemsPerRun)} منشوراً`,
        data.changed === 0
          ? 'كل الحسابات المحدَّدة كانت على هذه القيمة أصلاً'
          : `تغيّر ${data.changed} ${plural}` +
              (data.skipped > 0 ? ` — و${data.skipped} خارج نطاقك لم تُعدَّل` : ''),
      );
      onSaved();
      onClose();
    },
    onError: (error) =>
      toast.error('تعذّر الحفظ', error instanceof ApiClientError ? error.message : undefined),
  });

  const plural = arabicPlural(targets.length, {
    one: 'حساب',
    two: 'حساب',
    few: 'حسابات',
    many: 'حساباً',
  });

  const limits = targets.map((target) => target.maxItemsPerRun);
  const min = limits.length > 0 ? Math.min(...limits) : 0;
  const max = limits.length > 0 ? Math.max(...limits) : 0;

  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="سقف المنشورات في التشغيل الواحد"
      description={`ستُطبَّق على ${targets.length} ${plural} محدَّدة`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            إلغاء
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending}
            loading={mutation.isPending}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            طبّق على الكلّ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/*
          المدى الحالي قبل الجديد.

          يقول للموظف إن كان يوحّد قيماً متقاربة أم يمحو ضبطاً مقصوداً:
          «من ١٠٠ إلى ١٠٠» توحيدٌ بلا أثر، و«من ٥٠ إلى ٥٠٠» يعني أنّ في
          الدفعة حساباً ضُبط بقصد.
        */}
        <Alert tone={min === max ? 'info' : 'warning'} title="السقف الحالي في المحدَّد">
          {min === max ? (
            <>
              كلّها على <span className="num font-semibold">{formatNumber(min)}</span> منشوراً.
            </>
          ) : (
            <>
              يتراوح من <span className="num font-semibold">{formatNumber(min)}</span> إلى{' '}
              <span className="num font-semibold">{formatNumber(max)}</span> منشوراً.{' '}
              <strong>سيُستبدل الكلّ بقيمة واحدة</strong> — راجع القائمة أدناه قبل التطبيق.
            </>
          )}
        </Alert>

        <div className="space-y-2">
          <Input
            label="السقف الجديد"
            type="number"
            min={1}
            max={1000}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            hint="بين ١ و١٠٠٠. وهو سقف الفوترة على المزوّد — كل تشغيل يدفع بعدد ما يجلب."
            error={!valid && value !== '' ? 'القيمة يجب أن تكون بين ١ و١٠٠٠' : undefined}
          />

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                size="sm"
                variant={Number(value) === preset ? 'primary' : 'secondary'}
                onClick={() => setValue(String(preset))}
              >
                <span className="num">{formatNumber(preset)}</span>
              </Button>
            ))}
          </div>
        </div>

        {/*
          الأسماء تُعرض قبل التطبيق لا بعده.

          الكتابة الجماعية تمحو ضبطاً قائماً بلا سؤال، فمعرفة «أيّ حسابات
          بالضبط» قبل الضغط هي الفرق بين تصحيحٍ مقصود وبين إعادة ضبط
          عشرين حساباً لم يكن أحد ينوي لمسها.
        */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">الحسابات المحدَّدة</p>
          <ul className="flex flex-wrap gap-1.5">
            {targets.slice(0, PREVIEW).map((target) => (
              <li key={target.id}>
                <Badge tone="neutral" size="sm">
                  {target.name}
                  <span className="num text-subtle-foreground">
                    ({formatNumber(target.maxItemsPerRun)})
                  </span>
                </Badge>
              </li>
            ))}
            {targets.length > PREVIEW && (
              <li>
                <Badge tone="neutral" size="sm">
                  <span className="num">+{formatNumber(targets.length - PREVIEW)}</span> أخرى
                </Badge>
              </li>
            )}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
