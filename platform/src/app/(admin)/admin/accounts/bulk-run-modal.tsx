'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Play, TriangleAlert } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { arabicPlural } from '@/lib/utils';

export interface RunTarget {
  id: string;
  name: string;
  platformCode: string;
  platformName: string;
}

interface Outcome {
  accountId: string;
  name: string;
  platformName: string;
  runId: string | null;
  queued: boolean;
  reason: string | null;
}

interface BulkResponse {
  started: number;
  failed: number;
  outcomes: Outcome[];
  message: string;
}

/**
 * تشغيل الاستخراج على حساب واحد أو على عدة حسابات — بالنافذة نفسها.
 *
 * التشغيل الفردي حالة خاصة من الجماعي لا مساراً ثانياً: مسار واحد يعني
 * فلاتر إلزامية واحدة وتقريراً واحداً، ولا يبقى زرّ في الشاشة يرسل طلباً
 * ناقصاً لأن أحداً نسي تحديثه حين تغيّرت الشروط.
 *
 * والخيارات الخاصة بمنصة بعينها لا تظهر إلا إن كان بين المحدَّد حساب
 * عليها: عرض «ترتيب نتائج إكس» لدفعة كلها فيسبوك سؤال بلا معنى.
 */
export function BulkRunModal({
  targets,
  onClose,
  onStarted,
}: {
  targets: RunTarget[];
  onClose: () => void;
  onStarted: () => void;
}) {
  const toast = useToast();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [maxItems, setMaxItems] = useState('');
  const [sort, setSort] = useState<'Latest' | 'Top'>('Latest');
  const [resultsType, setResultsType] = useState<'posts' | 'reels'>('posts');
  const [report, setReport] = useState<BulkResponse | null>(null);

  const open = targets.length > 0;

  // كل فتح يبدأ من صفحة نظيفة، فلا تُشغَّل دفعة بفلاتر دفعة سابقة
  useEffect(() => {
    if (!open) return;
    setFromDate('');
    setToDate('');
    setMaxItems('');
    setSort('Latest');
    setResultsType('posts');
    setReport(null);
  }, [open, targets]);

  const hasX = targets.some((t) => t.platformCode === 'x' || t.platformCode === 'twitter');
  const hasInstagram = targets.some((t) => t.platformCode === 'instagram');

  const today = new Date().toISOString().slice(0, 10);
  const parsedMax = Number.parseInt(maxItems, 10);
  const maxValid = Number.isInteger(parsedMax) && parsedMax >= 1 && parsedMax <= 1000;
  const rangeValid = Boolean(fromDate) && Boolean(toDate) && fromDate <= toDate;
  const canSubmit = rangeValid && maxValid;

  const mutation = useMutation({
    mutationFn: () =>
      api.post<BulkResponse>('/api/extractions/bulk', {
        accountIds: targets.map((target) => target.id),
        fromDate,
        toDate,
        maxItems: parsedMax,
        ...(hasX ? { sort } : {}),
        ...(hasInstagram ? { resultsType } : {}),
      }),
    onSuccess: (data) => {
      setReport(data);
      if (data.started > 0) {
        toast.success(
          `بدأت ${data.started} ${arabicPlural(data.started, {
            one: 'عملية',
            two: 'عملية',
            few: 'عمليات',
            many: 'عملية',
          })}`,
          data.message,
        );
        onStarted();
      } else {
        toast.error('لم تبدأ أي عملية', data.message);
      }
    },
    onError: (error) =>
      toast.error('تعذّر التشغيل', error instanceof ApiClientError ? error.message : undefined),
  });

  const plural = arabicPlural(targets.length, {
    one: 'حساب',
    two: 'حساب',
    few: 'حسابات',
    many: 'حساباً',
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={targets.length === 1 ? `تشغيل استخراج: ${targets[0]!.name}` : 'تشغيل استخراج جماعي'}
      description={
        report
          ? 'نتيجة التشغيل لكل حساب'
          : `حدّد النطاق الزمني وأقصى عدد للمنشورات — تُطبَّق على ${targets.length} ${plural}`
      }
      footer={
        report ? (
          <Button onClick={onClose}>إغلاق</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
              إلغاء
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
              disabled={!canSubmit}
            >
              <Play className="h-4 w-4" aria-hidden />
              تشغيل {targets.length} {plural}
            </Button>
          </>
        )
      }
    >
      {report ? (
        <div className="space-y-3">
          {report.failed === 0 ? (
            <Alert tone="success">بدأت كل العمليات. تابع تقدّمها من شاشة عمليات الاستخراج.</Alert>
          ) : report.started === 0 ? (
            <Alert tone="danger">لم تبدأ أي عملية. الأسباب لكل حساب في الجدول أدناه.</Alert>
          ) : (
            <Alert tone="warning">
              بدأت <span className="num font-semibold">{report.started}</span> وتعذّرت{' '}
              <span className="num font-semibold">{report.failed}</span>. الحسابات التي لم تبدأ لم
              يتغيّر فيها شيء، ويمكن إعادة المحاولة بعد معالجة السبب.
            </Alert>
          )}

          <TableWrapper className="max-h-72 overflow-y-auto rounded-md border border-border">
            <Table>
              <THead>
                <TR>
                  <TH>الحساب</TH>
                  <TH>المنصة</TH>
                  <TH>النتيجة</TH>
                </TR>
              </THead>
              <TBody>
                {report.outcomes.map((outcome) => (
                  <TR key={outcome.accountId}>
                    <TD className="max-w-56 truncate font-medium">{outcome.name}</TD>
                    <TD className="text-xs">{outcome.platformName}</TD>
                    <TD>
                      {outcome.runId ? (
                        <Badge tone="success">
                          <CheckCircle2 className="h-3 w-3" aria-hidden />
                          بدأت
                        </Badge>
                      ) : (
                        <span className="flex items-start gap-1.5 text-xs text-danger">
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          {outcome.reason}
                        </span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert tone="info">
            كل حساب عملية مستقلة على حصة Apify. الفلاتر أدناه تُطبَّق على المحدَّد كله، والحساب
            الذي لديه عملية قائمة أو كان معطّلاً يُتخطّى ويُذكر سببه.
          </Alert>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              type="date"
              label="من تاريخ"
              value={fromDate}
              max={toDate || today}
              onChange={(event) => setFromDate(event.target.value)}
              required
            />
            <Input
              type="date"
              label="إلى تاريخ"
              value={toDate}
              min={fromDate || undefined}
              max={today}
              onChange={(event) => setToDate(event.target.value)}
              required
            />
            <Input
              type="number"
              label="أقصى عدد للمنشورات"
              value={maxItems}
              min={1}
              max={1000}
              placeholder="100"
              onChange={(event) => setMaxItems(event.target.value)}
              hint="لكل حساب على حدة"
              required
            />
          </div>

          {(hasX || hasInstagram) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {hasX && (
                <Select
                  label="ترتيب النتائج"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as 'Latest' | 'Top')}
                  hint="حسابات إكس وحدها"
                >
                  <option value="Latest">الأحدث</option>
                  <option value="Top">الأعلى تفاعلاً</option>
                </Select>
              )}
              {hasInstagram && (
                <Select
                  label="نوع المحتوى"
                  value={resultsType}
                  onChange={(event) => setResultsType(event.target.value as 'posts' | 'reels')}
                  hint="حسابات إنستغرام وحدها"
                >
                  <option value="posts">منشورات</option>
                  <option value="reels">ريلز</option>
                </Select>
              )}
            </div>
          )}

          {targets.length > 1 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-subtle-foreground">
                الحسابات المحدَّدة
              </p>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2">
                <ul className="space-y-1">
                  {targets.map((target) => (
                    <li
                      key={target.id}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm"
                    >
                      <span className="truncate">{target.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {target.platformName}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
