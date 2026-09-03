import type { Role } from '@/generated/prisma';

/**
 * مصفوفة الصلاحيات — مصدر الحقيقة الوحيد للأدوار في الواجهة وفي الـ API معاً.
 */
export const PERMISSIONS = {
  ADMIN_ACCESS: 'admin.access',

  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_APPROVE: 'users.approve',
  USERS_DISABLE: 'users.disable',
  USERS_ROLES: 'users.roles',

  PLATFORMS_VIEW: 'platforms.view',
  PLATFORMS_MANAGE: 'platforms.manage',

  ACCOUNTS_VIEW: 'accounts.view',
  ACCOUNTS_MANAGE: 'accounts.manage',

  EXTRACTION_VIEW: 'extraction.view',
  EXTRACTION_RUN: 'extraction.run',
  EXTRACTION_CANCEL: 'extraction.cancel',
  EXTRACTION_SCHEDULE: 'extraction.schedule',

  POSTS_VIEW: 'posts.view',
  POSTS_REVIEW: 'posts.review',
  POSTS_EDIT: 'posts.edit',
  POSTS_DELETE: 'posts.delete',
  POSTS_CLASSIFY: 'posts.classify',

  TAXONOMY_MANAGE: 'taxonomy.manage',

  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',
  REPORTS_TEMPLATES: 'reports.templates',

  DASHBOARDS_SAVE: 'dashboards.save',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

/** صلاحيات المستخدم العادي — الحد الأدنى المشترك بين كل الأدوار */
const VIEWER_PERMISSIONS: Permission[] = [
  P.PLATFORMS_VIEW,
  P.ACCOUNTS_VIEW,
  P.POSTS_VIEW,
  P.REPORTS_VIEW,
  P.REPORTS_EXPORT,
  P.DASHBOARDS_SAVE,
];

/** صلاحيات المشرف — التشغيل والبيانات، بلا إدارة مستخدمين ولا إعدادات حساسة */
const SUPERVISOR_PERMISSIONS: Permission[] = [
  ...VIEWER_PERMISSIONS,
  P.ADMIN_ACCESS,
  P.PLATFORMS_MANAGE,
  P.ACCOUNTS_MANAGE,
  P.EXTRACTION_VIEW,
  P.EXTRACTION_RUN,
  P.EXTRACTION_CANCEL,
  P.EXTRACTION_SCHEDULE,
  P.POSTS_REVIEW,
  P.POSTS_EDIT,
  P.POSTS_DELETE,
  P.POSTS_CLASSIFY,
  P.TAXONOMY_MANAGE,
  P.REPORTS_TEMPLATES,
  P.AUDIT_VIEW,
];

/** صلاحيات مدير النظام — إدارة المستخدمين والإعدادات مع الاطلاع التشغيلي */
const ADMIN_PERMISSIONS: Permission[] = [
  ...SUPERVISOR_PERMISSIONS,
  P.USERS_VIEW,
  P.USERS_CREATE,
  P.USERS_UPDATE,
  P.USERS_APPROVE,
  P.USERS_DISABLE,
  P.USERS_ROLES,
  P.SETTINGS_MANAGE,
];

/** المالك — كل شيء */
const OWNER_PERMISSIONS: Permission[] = Object.values(P);

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: OWNER_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  SUPERVISOR: SUPERVISOR_PERMISSIONS,
  VIEWER: VIEWER_PERMISSIONS,
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'مالك المنصة',
  ADMIN: 'مدير النظام',
  SUPERVISOR: 'مشرف',
  VIEWER: 'مستخدم عادي',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: 'تحكم كامل بكل شيء، بما فيه الأدوار والإعدادات الحساسة',
  ADMIN: 'إدارة المستخدمين والموافقات والإعدادات العامة',
  SUPERVISOR: 'إدارة المنصات والحسابات والاستخراج ومراجعة البيانات',
  VIEWER: 'مشاهدة اللوحات والبحث والتصدير فقط',
};

/** ترتيب الأدوار من الأعلى صلاحية إلى الأدنى */
export const ROLE_RANK: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  SUPERVISOR: 2,
  VIEWER: 1,
};

export interface PermissionSubject {
  role: Role;
  /** صلاحيات إضافية ممنوحة فردياً فوق الدور */
  permissions?: unknown;
}

function extraPermissions(subject: PermissionSubject): Permission[] {
  const raw = subject.permissions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is Permission => typeof p === 'string');
}

/** هل يملك المستخدم هذه الصلاحية؟ */
export function can(subject: PermissionSubject | null | undefined, permission: Permission): boolean {
  if (!subject) return false;
  if (ROLE_PERMISSIONS[subject.role].includes(permission)) return true;
  return extraPermissions(subject).includes(permission);
}

/** هل يملك المستخدم أياً من هذه الصلاحيات؟ */
export function canAny(subject: PermissionSubject | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => can(subject, p));
}

/** هل يملك المستخدم كل هذه الصلاحيات؟ */
export function canAll(subject: PermissionSubject | null | undefined, permissions: Permission[]): boolean {
  return permissions.every((p) => can(subject, p));
}

/** قائمة الصلاحيات الفعلية للمستخدم — تُرسل إلى الواجهة لإخفاء ما لا يملكه */
export function effectivePermissions(subject: PermissionSubject): Permission[] {
  return Array.from(new Set([...ROLE_PERMISSIONS[subject.role], ...extraPermissions(subject)]));
}

/**
 * هل يجوز للمنفّذ التعديل على مستخدم بهذا الدور؟
 * القاعدة: لا يُعدَّل مستخدم في رتبة أعلى أو مساوية، إلا أن المالك يعدّل الجميع.
 */
export function canManageUserWithRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === 'OWNER') return true;
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole];
}

/** الأدوار التي يجوز للمنفّذ إسنادها */
export function assignableRoles(actorRole: Role): Role[] {
  const all: Role[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'VIEWER'];
  if (actorRole === 'OWNER') return all;
  return all.filter((r) => ROLE_RANK[actorRole] > ROLE_RANK[r]);
}
