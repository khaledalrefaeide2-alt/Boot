import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ApiError,
  errors,
  guardMutationRate,
  jsonError,
  jsonOk,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { ImportError, parseAccountsWorkbook, MAX_IMPORT_ROWS } from '@/lib/accounts/import';

/** حدّ حجم الملف — أوسع بكثير من ٥٠٠ صف نصّي، ويمنع رفع ملف ضخم بالخطأ */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * استيراد الحسابات من ملف Excel، بوضعين على المسار نفسه.
 *
 * `preview` يقرأ ويحكم على كل صف دون أن يكتب شيئاً، و`commit` يحفظ الصفوف
 * الصالحة وحدها. الملف يُرفع في كل وضع من جديد بدل حفظ نتيجة المعاينة على
 * الخادم: حالة مؤقتة بين طلبين تحتاج عمراً وتنظيفاً، والقراءة رخيصة.
 *
 * والحكم لا يُؤخذ من العميل: `commit` يعيد التحليل من الملف نفسه، فلا يكفي
 * أن يرسل أحدهم قائمة صفوف «صالحة» ليُكتب ما فيها.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.ACCOUNTS_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const form = await request.formData().catch(() => null);
    if (!form) throw errors.badRequest('لم يصل أي ملف');

    const file = form.get('file');
    if (!(file instanceof File)) throw errors.badRequest('اختر ملف Excel أولاً');
    if (file.size === 0) throw errors.badRequest('الملف فارغ');
    if (file.size > MAX_FILE_BYTES) {
      throw errors.badRequest('حجم الملف يتجاوز 5 ميغابايت');
    }

    const mode = form.get('mode') === 'commit' ? 'commit' : 'preview';
    const report = await parseAccountsWorkbook(await file.arrayBuffer());

    if (mode === 'preview') return jsonOk({ mode, ...report });

    const ready = report.rows.filter((row) => row.data !== null);
    if (ready.length === 0) {
      throw errors.badRequest('لا يوجد صف صالح للاستيراد في هذا الملف');
    }

    /*
     * الحفظ في معاملة واحدة: استيراد نصفه ناجح ونصفه فاشل يترك المستخدم
     * أمام قائمة لا يعرف أين توقفت، وإعادة المحاولة تضاعف ما نجح.
     */
    const created = await prisma.$transaction(
      ready.map((row) =>
        prisma.account.create({
          data: { ...row.data!, isActive: row.data!.status === 'ACTIVE', createdById: actor.id },
          select: { id: true },
        }),
      ),
    );

    await audit(actor, {
      action: AUDIT_ACTIONS.ACCOUNTS_IMPORTED,
      entityType: 'account',
      summary: `استيراد ${created.length} حساباً من ملف Excel`,
      metadata: {
        fileName: file.name,
        imported: created.length,
        skippedDuplicates: report.duplicates,
        skippedErrors: report.errors,
      },
    });

    return jsonOk({
      mode,
      imported: created.length,
      duplicates: report.duplicates,
      errors: report.errors,
      rows: report.rows,
    });
  } catch (error) {
    if (error instanceof ImportError) return jsonError(new ApiError(400, error.message));
    return jsonError(error);
  }
}

/** حدود الاستيراد — تقرؤها الواجهة لتعرضها قبل الرفع */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.ACCOUNTS_MANAGE);
    return jsonOk({ maxRows: MAX_IMPORT_ROWS, maxFileBytes: MAX_FILE_BYTES });
  } catch (error) {
    return jsonError(error);
  }
}
