import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getAccountScope } from '@/lib/auth/account-scope';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { getPlatformDirectory } from '@/lib/queries/platform-directory';
import { PlatformsClient } from './platforms-client';

export const metadata: Metadata = { title: 'المنصات' };

/*
 * المنصات — دليل الحسابات مصنّفةً في مجموعاتها.
 *
 * كانت الشاشة بطاقةً لكلّ منصة بثلاثة أرقام، ولا شيء تحتها. والسؤال الذي
 * يُفتح من أجله دليلُ المصادر هو «من نرصد؟ وماذا نشر؟» — لا «كم منصة؟».
 * فصارت المنصات شريطاً يصفّي، والحسابات بطاقاتٍ تحته، كلٌّ في تصنيفه،
 * والضغطُ على الحساب يفتح منشوراته كلّها.
 *
 * ★ وتبقى قراءةً لا تشغيلاً.
 *
 *   الشاشة متاحة لكلّ من يرى المنصات — المستخدم العادي معهم — فلا تحمل
 *   شيئاً من إعدادات الاستخراج ولا سجلّ تشغيله: اسمٌ وصورة وأرقام
 *   منشوراته، وهو ما يراه القارئ على كلّ منشورٍ أصلاً. وتفاصيل التشغيل
 *   تبقى في «الحسابات» لمن يملك إذنها.
 */
export default async function PlatformsPage() {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.PLATFORMS_VIEW)) notFound();

  const scope = await getAccountScope();
  const directory = await getPlatformDirectory(scope);

  return (
    <PlatformsClient
      directory={directory}
      canOpenPosts={can(user, PERMISSIONS.POSTS_VIEW)}
      canManagePlatforms={can(user, PERMISSIONS.PLATFORMS_MANAGE)}
      canManageAccounts={can(user, PERMISSIONS.ACCOUNTS_MANAGE)}
    />
  );
}
