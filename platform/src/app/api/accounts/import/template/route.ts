import { attachmentHeaders, jsonError, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { buildImportTemplate } from '@/lib/accounts/import';

/** قالب Excel جاهز بالأعمدة المطلوبة وورقة تشرح القيم المقبولة */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.ACCOUNTS_MANAGE);

    const buffer = await buildImportTemplate();
    const fileName = 'قالب-استيراد-الحسابات.xlsx';

    // القالب يحمل أسماء المنصات المسجلة، فلا يُخزَّن مؤقتاً
    return new Response(new Uint8Array(buffer), {
      headers: attachmentHeaders(fileName, 'accounts-import-template.xlsx', buffer.length),
    });
  } catch (error) {
    return jsonError(error);
  }
}
