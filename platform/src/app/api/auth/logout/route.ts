import { jsonError, jsonOk } from '@/lib/api';
import { destroySession, getSession } from '@/lib/auth/session';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

export async function POST() {
  try {
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
