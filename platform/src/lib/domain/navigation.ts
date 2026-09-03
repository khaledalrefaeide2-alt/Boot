import { PERMISSIONS, type Permission } from '@/lib/auth/rbac';
import type { NavIconName } from './nav-icons';

export interface NavItem {
  href: string;
  label: string;
  /** اسم الأيقونة — نص وليس مكوّناً، لأن أقسام التنقل تعبر حدّ الخادم/العميل */
  icon: NavIconName;
  /** الصلاحية اللازمة لرؤية العنصر — بدونها يُخفى تماماً */
  permission?: Permission;
  /** مطابقة تامة للمسار بدل البادئة */
  exact?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** تنقّل لوحة العرض — متاح لكل المستخدمين حسب صلاحياتهم */
export const VIEWER_NAV: NavSection[] = [
  {
    title: 'الرصد',
    items: [
      { href: '/', label: 'النظرة العامة', icon: 'LayoutDashboard', exact: true },
      { href: '/posts', label: 'المنشورات', icon: 'Newspaper', permission: PERMISSIONS.POSTS_VIEW },
      { href: '/analytics', label: 'الإحصائيات', icon: 'BarChart3', permission: PERMISSIONS.POSTS_VIEW },
      { href: '/ops', label: 'غرفة العمليات', icon: 'MonitorPlay', permission: PERMISSIONS.POSTS_VIEW },
    ],
  },
  {
    title: 'المصادر',
    items: [
      { href: '/platforms', label: 'المنصات', icon: 'Building2', permission: PERMISSIONS.PLATFORMS_VIEW },
      { href: '/accounts', label: 'الحسابات', icon: 'UsersRound', permission: PERMISSIONS.ACCOUNTS_VIEW },
      { href: '/compare', label: 'مقارنة الحسابات', icon: 'Gauge', permission: PERMISSIONS.ACCOUNTS_VIEW },
    ],
  },
  {
    title: 'المخرجات',
    items: [
      { href: '/reports', label: 'التقارير', icon: 'FileSpreadsheet', permission: PERMISSIONS.REPORTS_VIEW },
      { href: '/dashboards', label: 'اللوحات المحفوظة', icon: 'ListChecks', permission: PERMISSIONS.DASHBOARDS_SAVE },
      { href: '/notifications', label: 'التنبيهات', icon: 'Bell' },
    ],
  },
];

/** تنقّل لوحة الإدارة */
export const ADMIN_NAV: NavSection[] = [
  {
    title: 'الإدارة',
    items: [
      { href: '/admin', label: 'لوحة تحكم الإدارة', icon: 'Gauge', permission: PERMISSIONS.ADMIN_ACCESS, exact: true },
      { href: '/admin/users', label: 'المستخدمون', icon: 'Users', permission: PERMISSIONS.USERS_VIEW },
    ],
  },
  {
    title: 'المصادر والاستخراج',
    items: [
      { href: '/admin/platforms', label: 'المنصات', icon: 'Building2', permission: PERMISSIONS.PLATFORMS_MANAGE },
      { href: '/admin/accounts', label: 'الحسابات', icon: 'UsersRound', permission: PERMISSIONS.ACCOUNTS_MANAGE },
      { href: '/admin/extractions', label: 'عمليات الاستخراج', icon: 'Activity', permission: PERMISSIONS.EXTRACTION_VIEW },
      { href: '/admin/review', label: 'مراجعة البيانات', icon: 'ClipboardList', permission: PERMISSIONS.POSTS_REVIEW },
    ],
  },
  {
    title: 'التصنيف',
    items: [
      { href: '/admin/keywords', label: 'الكلمات المفتاحية', icon: 'Tags', permission: PERMISSIONS.TAXONOMY_MANAGE },
      { href: '/admin/hashtags', label: 'الهاشتاغات', icon: 'Hash', permission: PERMISSIONS.TAXONOMY_MANAGE },
      { href: '/admin/topics', label: 'التصنيفات', icon: 'Shapes', permission: PERMISSIONS.TAXONOMY_MANAGE },
    ],
  },
  {
    title: 'النظام',
    items: [
      { href: '/admin/templates', label: 'القوالب والتقارير', icon: 'FileText', permission: PERMISSIONS.REPORTS_TEMPLATES },
      { href: '/admin/audit', label: 'السجلات والنشاطات', icon: 'ScrollText', permission: PERMISSIONS.AUDIT_VIEW },
      { href: '/admin/settings', label: 'الإعدادات', icon: 'Cog', permission: PERMISSIONS.SETTINGS_MANAGE },
    ],
  },
];

/** تصفية أقسام التنقل حسب صلاحيات المستخدم */
export function filterNav(sections: NavSection[], permissions: Permission[]): NavSection[] {
  const owned = new Set(permissions);
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || owned.has(item.permission)),
    }))
    .filter((section) => section.items.length > 0);
}
