'use client';

import { Segmented } from '@/components/ui/button-group';
import { useFilterOptions } from '@/lib/hooks/use-filters';

/*
 * تصنيف القسم: منصةً منصة، ومجموعةً مجموعة.
 *
 * «أبرز المنشورات» على المنصات كلها مجتمعةً يُخفي أكثر ممّا يُظهر: إكس
 * وفيسبوك لا يتقاسمان مقياساً — منشورٌ بألفَي إعجاب على فيسبوك عاديّ،
 * ومثلُه على إكس حدث. فتصدّر المنصة الأكثر نشاطاً القائمةَ دائماً وتغيب
 * البقية. والمجموعات كذلك: «وزارات» و«النخبة» لا يُقارَنان في قائمة واحدة.
 *
 * والتصنيف هنا يُضيّق ما اختارته فلاتر الصفحة ولا يُلغيه — إلا حين
 * يتعارضان، فيُقدَّم الأقرب إلى القارئ: ما ضغطه في القسم نفسه الآن.
 */

export interface SectionScope {
  platformId: string;
  groupId: string;
}

export const EMPTY_SCOPE: SectionScope = { platformId: '', groupId: '' };

/** يدمج تصنيف القسم مع فلاتر الصفحة — والقسم يغلب عند التعارض */
export function scopeParams(
  params: Record<string, string | number | undefined>,
  scope: SectionScope,
): Record<string, string | number | undefined> {
  return {
    ...params,
    ...(scope.platformId ? { platformId: scope.platformId } : {}),
    ...(scope.groupId ? { groupId: scope.groupId } : {}),
  };
}

export function ScopeTabs({
  value,
  onChange,
}: {
  value: SectionScope;
  onChange: (scope: SectionScope) => void;
}) {
  const options = useFilterOptions();
  const platforms = options.data?.platforms ?? [];
  const groups = options.data?.groups ?? [];

  /*
   * صفٌّ بخيار واحد لا يُعرض: «الكل» وحده ليس اختياراً، وعرضه يوهم أن ثمّة
   * ما يُختار ثم لا يجد القارئ غيره.
   */
  const showPlatforms = platforms.length > 1;
  const showGroups = groups.length > 0;

  if (!showPlatforms && !showGroups) return null;

  return (
    <div className="space-y-2">
      {showPlatforms && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="eyebrow shrink-0">المنصة</span>
          <Segmented
            variant="pills"
            size="sm"
            label="تصنيف حسب المنصة"
            value={value.platformId}
            onChange={(platformId) => onChange({ ...value, platformId })}
            options={[
              { value: '', label: 'كل المنصات' },
              ...platforms.map((platform) => ({ value: platform.id, label: platform.name })),
            ]}
          />
        </div>
      )}

      {showGroups && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="eyebrow shrink-0">المجموعة</span>
          <Segmented
            variant="pills"
            size="sm"
            label="تصنيف حسب المجموعة"
            value={value.groupId}
            onChange={(groupId) => onChange({ ...value, groupId })}
            options={[
              { value: '', label: 'كل المجموعات' },
              ...groups.map((group) => ({ value: group.id, label: group.name })),
            ]}
          />
        </div>
      )}
    </div>
  );
}
