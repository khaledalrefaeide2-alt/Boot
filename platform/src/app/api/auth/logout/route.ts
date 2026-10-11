import { jsonError, jsonOk, requireCsrf } from '@/lib/api';
import { destroySession, getSession } from '@/lib/auth/session';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

export async function POST() {
  try {
    /*
     * الخروج يحتاج رمز الحماية كبقية الطلبات المغيّرة.
     *
     * ★ وكان وحده بلا فحص.
     *
     *   فصفحةٌ خبيثة يفتحها الموظّف تستطيع أن تُرسل الطلب نيابةً عنه
     *   فتُخرجه من المنصّة. وليس ذلك أذىً بالغاً، غير أنّه يصير أداةً
     *   حين يُكرَّر: من أُخرج ثلاث مرّات يُعيد الدخول في أوّل صفحةٍ
     *   تشبه صفحة الدخول تُعرض عليه.
     *
     *   والرمز متاحٌ هنا بلا كلفة: العميل يُرسله مع كلّ طلبٍ غير GET،
     *   والكوكيان قائمتان لحظةَ الخروج.
     */
    await requireCsrf();

    const user = await getSession();
    await destroySession();
    if (user) {
      await audit(user, { action: AUDIT_ACTIONS.LOGOUT, entityType: 'auth', entityId: user.id });
    }
    return jsonOk({ redirectTo: '/login' });
  } catch (error) {
    return jsonError(error);
  }
}
