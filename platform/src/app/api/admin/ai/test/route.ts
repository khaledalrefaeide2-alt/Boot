import { jsonError, jsonOk, requireCsrf, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { isAssistantConfigured, MISSING_KEY_MESSAGE } from '@/lib/assistant/config';
import { AssistantError, pingOpenAI, toAssistantError } from '@/lib/assistant/openai';

/*
 * اختبار اتصال OpenAI — للمدير وحده.
 *
 * ★ لا يظهر المفتاح في الاستجابة ولا جزءٌ منه ولا طوله ولا بادئته.
 *
 * «عرض آخر أربعة أحرف» عادةٌ شائعة وخاطئة هنا: صفحة الإعدادات تُفتح على
 * شاشة في مكتب، ولقطةٌ لها تكفي لتضييق البحث. والمطلوب من هذا المسار
 * جواب واحد — أيعمل المفتاح أم لا — وهو لا يحتاج إظهار شيء منه.
 */
export async function POST() {
  try {
    const actor = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    await requireCsrf();
    void actor;

    if (!isAssistantConfigured()) {
      return jsonOk({ success: false, message: MISSING_KEY_MESSAGE });
    }

    const result = await pingOpenAI();

    return jsonOk({
      success: true,
      chatModel: result.chatModel,
      embedModel: result.embedModel,
      message: 'تم الاتصال بـ OpenAI بنجاح',
    });
  } catch (error) {
    if (error instanceof AssistantError) {
      return jsonOk({ success: false, message: error.message });
    }
    const failure = toAssistantError(error);
    if (failure instanceof AssistantError && failure.code !== 'unknown') {
      return jsonOk({ success: false, message: failure.message });
    }
    return jsonError(error);
  }
}
