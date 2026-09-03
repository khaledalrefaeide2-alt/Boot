import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  Cog,
  FileSpreadsheet,
  FileText,
  Gauge,
  Hash,
  LayoutDashboard,
  ListChecks,
  MonitorPlay,
  Newspaper,
  ScrollText,
  Shapes,
  Tags,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

/**
 * خريطة أسماء أيقونات التنقل.
 * أقسام التنقل تُبنى في الخادم وتُمرَّر إلى مكوّن عميل، ولا يمكن تمرير الدوال
 * عبر هذا الحدّ — لذلك نمرّر الاسم ونحلّه هنا داخل العميل.
 */
export const NAV_ICONS = {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  Cog,
  FileSpreadsheet,
  FileText,
  Gauge,
  Hash,
  LayoutDashboard,
  ListChecks,
  MonitorPlay,
  Newspaper,
  ScrollText,
  Shapes,
  Tags,
  Users,
  UsersRound,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;

export function navIcon(name: NavIconName): LucideIcon {
  return NAV_ICONS[name];
}
