'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Download, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { arabicPlural } from '@/lib/utils';

type RowState = 'ready' | 'duplicate' | 'error';

interface ImportRow {
  line: number;
  state: RowState;
  message: string | null;
  name: string;
  url: string;
  platformName: string;
}

interface PreviewResponse {
  rows: ImportRow[];
  ready: number;
  duplicates: number;
  errors: number;
}

interface CommitResponse {
  imported: number;
  duplicates: number;
  errors: number;
}

const STATE_LABEL: Record<RowState, string> = {
  ready: 'جاهز للإضافة',
  duplicate: 'مكرر — يُتخطى',
  error: 'خطأ — يُتخطى',
};

const STATE_TONE: Record<RowState, 'success' | 'warning' | 'danger'> = {
  ready: 'success',
  duplicate: 'warning',
  error: 'danger',
};

/**
 * استيراد الحسابات من ملف Excel.
 *
 * الاستيراد على خطوتين لا خطوة واحدة: الملف يُقرأ ويُعرض حكم كل صف، ثم
 * يؤكّد المستخدم. إضافة مئة حساب بضغطة واحدة سهلة، وحذفها واحداً واحداً بعد
 * اكتشاف عمود مزاح ليس كذلك. والمعاينة تُظهر الخطأ قبل وقوعه لا بعده.
 *
 * الملف يُرفع مرتين: مرة للمعاينة ومرة للتنفيذ. والخادم يعيد قراءته في
 * الحالتين ولا يثق بما يرسله المتصفح عن الصفوف الصالحة.
 */
export function AccountsImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function close() {
    reset();
    onClose();
  }

  const previewMutation = useMutation({
    mutationFn: (chosen: File) => {
      const form = new FormData();
      form.append('file', chosen);
      form.append('mode', 'preview');
      return api.upload<PreviewResponse>('/api/accounts/import', form);
    },
    onSuccess: (data) => {
      setFileError(null);
      setPreview(data);
    },
    onError: (error) => {
      setPreview(null);
      setFileError(error instanceof ApiClientError ? error.message : 'تعذّرت قراءة الملف');
    },
  });

  const commitMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('file', file!);
      form.append('mode', 'commit');
      return api.upload<CommitResponse>('/api/accounts/import', form);
    },
    onSuccess: (data) => {
      toast.success(
        `أُضيف ${data.imported} ${arabicPlural(data.imported, {
          one: 'حساب',
          two: 'حساب',
          few: 'حسابات',
          many: 'حساباً',
        })}`,
        data.duplicates + data.errors > 0
          ? `تُخطّي ${data.duplicates + data.errors} صفاً`
          : undefined,
      );
      reset();
      onImported();
    },
    onError: (error) =>
      toast.error('تعذّر الاستيراد', error instanceof ApiClientError ? error.message : undefined),
  });

  function choose(chosen: File | undefined) {
    if (!chosen) return;
    if (!/\.xlsx$/i.test(chosen.name)) {
      setPreview(null);
      setFileError('الصيغة المقبولة .xlsx فقط. احفظ الملف من Excel بصيغة «مصنّف Excel»');
      return;
    }
    setFile(chosen);
    previewMutation.mutate(chosen);
  }

  const busy = previewMutation.isPending || commitMutation.isPending;

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="استيراد حسابات من ملف Excel"
      description="نزّل القالب، املأه، ثم ارفعه لمراجعة الصفوف قبل الإضافة"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            إلغاء
          </Button>
          <Button
            onClick={() => commitMutation.mutate()}
            loading={commitMutation.isPending}
            disabled={!preview || preview.ready === 0 || busy}
          >
            <Upload className="h-4 w-4" aria-hidden />
            {preview && preview.ready > 0 ? `استيراد ${preview.ready} حساباً` : 'استيراد'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-2 p-3">
          <FileSpreadsheet className="h-8 w-8 shrink-0 text-primary" aria-hidden />
          <div className="min-w-40 flex-1">
            <p className="text-sm font-medium text-foreground">القالب يحمل الأعمدة الصحيحة</p>
            <p className="text-xs text-muted-foreground">
              وفيه ورقة ثانية تشرح القيم المقبولة لكل عمود وأسماء المنصات المسجلة
            </p>
          </div>
          {/*
            بلا سمة download: الخادم يرسل Content-Disposition باسم الملف
            العربي، والسمة الفارغة تطغى عليه فيُحفظ الملف باسم «download».
            اسم واحد في مكان واحد أفضل من اسمين قد يفترقان.
          */}
          <a href="/api/accounts/import/template">
            <Button variant="secondary" type="button">
              <Download className="h-4 w-4" aria-hidden />
              تنزيل القالب
            </Button>
          </a>
        </div>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(event) => choose(event.target.files?.[0])}
          />
          <Button
            variant="secondary"
            type="button"
            onClick={() => inputRef.current?.click()}
            loading={previewMutation.isPending}
            disabled={busy}
          >
            <Upload className="h-4 w-4" aria-hidden />
            {file ? 'اختيار ملف آخر' : 'اختيار الملف'}
          </Button>
          {file && (
            <span className="ms-3 text-xs text-muted-foreground">{file.name}</span>
          )}
        </div>

        {fileError && <Alert tone="danger">{fileError}</Alert>}

        {preview && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-border p-2.5">
                <p className="num text-xl font-bold text-success">{preview.ready}</p>
                <p className="text-xs text-muted-foreground">جاهز للإضافة</p>
              </div>
              <div className="rounded-md border border-border p-2.5">
                <p className="num text-xl font-bold text-warning">{preview.duplicates}</p>
                <p className="text-xs text-muted-foreground">مكرر</p>
              </div>
              <div className="rounded-md border border-border p-2.5">
                <p className="num text-xl font-bold text-danger">{preview.errors}</p>
                <p className="text-xs text-muted-foreground">خطأ</p>
              </div>
            </div>

            {preview.ready === 0 ? (
              <Alert tone="danger">
                لا يوجد صف صالح للإضافة. راجع أسباب الرفض في الجدول أدناه ثم صحّح الملف وأعد رفعه.
              </Alert>
            ) : preview.duplicates + preview.errors > 0 ? (
              <Alert tone="warning">
                سيُضاف <span className="num font-semibold">{preview.ready}</span> حساباً وتُتخطّى
                بقية الصفوف. المتخطّى لا يُعدَّل ولا يُحذف، ويمكنك تصحيحه في الملف وإعادة الرفع لاحقاً.
              </Alert>
            ) : (
              <Alert tone="success">كل صفوف الملف صالحة وجاهزة للإضافة.</Alert>
            )}

            <TableWrapper className="max-h-72 overflow-y-auto rounded-md border border-border">
              <Table>
                <THead>
                  <TR>
                    <TH>الصف</TH>
                    <TH>اسم الحساب</TH>
                    <TH>المنصة</TH>
                    <TH>الحالة</TH>
                    <TH>الملاحظة</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.rows.map((row) => (
                    <TR key={row.line}>
                      <TD className="num text-muted-foreground">{row.line}</TD>
                      <TD>
                        <p className="max-w-56 truncate font-medium">{row.name || '—'}</p>
                        <p className="ltr max-w-56 truncate text-xs text-subtle-foreground">
                          {row.url}
                        </p>
                      </TD>
                      <TD className="text-xs">{row.platformName || '—'}</TD>
                      <TD>
                        <Badge tone={STATE_TONE[row.state]}>
                          {row.state === 'ready' ? (
                            <CheckCircle2 className="h-3 w-3" aria-hidden />
                          ) : (
                            <TriangleAlert className="h-3 w-3" aria-hidden />
                          )}
                          {STATE_LABEL[row.state]}
                        </Badge>
                      </TD>
                      <TD className="max-w-72 text-xs text-muted-foreground">
                        {row.message ?? '—'}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </>
        )}
      </div>
    </Modal>
  );
}
