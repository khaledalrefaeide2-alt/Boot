'use client';

import { useState } from 'react';
import { Filter, Minus, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/button-group';
import { Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import {
  countTerms,
  describeGroup,
  hasMultipleTerms,
  MAX_SEARCH_GROUPS,
  MAX_SEARCH_TERMS,
  parseSearchTerms,
} from '@/lib/domain/search-terms';
import { cn } from '@/lib/utils';
import {
  DATE_RANGES,
  POST_TYPE_LABELS,
  CONTENT_LABELS,
  SENTIMENT_LABELS,
  SEVERITY_LEVELS,
  LANGUAGE_LABELS,
  STANCE_METRIC,
} from '@/lib/domain/constants';

export interface PostFilterState {
  q: string;
  /** نمط تعدّد الكلمات: كلّها أو أيٌّ منها */
  qMode: 'all' | 'any';
  /** مجموعة الحسابات — بُعد مستقل عن المنصة */
  groupId: string;
  platformId: string;
  accountId: string;
  postType: string;
  sentiment: string;
  /** وسم محتوى بعينه */
  label: string;
  /** أدنى درجة خطورة — '' يعني بلا حصر */
  minSeverity: string;
  /** حال التصنيف: '' الكل، 'yes' مصنَّف، 'no' بانتظار التصنيف */
  analyzed: string;
  language: string;
  topicId: string;
  hashtag: string;
  country: string;
  range: string;
  from: string;
  to: string;
}

export const EMPTY_FILTERS: PostFilterState = {
  q: '',
  qMode: 'all',
  groupId: '',
  platformId: '',
  accountId: '',
  postType: '',
  sentiment: '',
  label: '',
  minSeverity: '',
  analyzed: '',
  language: '',
  topicId: '',
  hashtag: '',
  country: '',
  range: '30d',
  from: '',
  to: '',
};

export interface FilterOptions {
  platforms: { id: string; name: string }[];
  accounts: { id: string; name: string; platformId: string; groupId: string | null }[];
  groups: { id: string; name: string }[];
  topics: { id: string; name: string }[];
  /** مواضيع البحث المحفوظة — سطرُ بحثٍ باسم */
  searchTopics: { id: string; name: string; query: string }[];
}

/** عدد الفلاتر المفعّلة — يُعرض للمستخدم ليعرف لماذا النتائج محدودة */
export function activeFilterCount(filters: PostFilterState): number {
  let count = 0;
  /*
   * النمط لا يُعدّ فلتراً بذاته.
   *
   * لأنّه لا يضيّق شيئاً بلا كلمات: عدّاد يقول «فلتران» على سطر بحثٍ
   * واحد يدفع الموظّف إلى البحث عن فلترٍ ثانٍ لا وجود له.
   */
  if (filters.q) count += 1;
  if (filters.groupId) count += 1;
  if (filters.platformId) count += 1;
  if (filters.accountId) count += 1;
  if (filters.postType) count += 1;
  if (filters.sentiment) count += 1;
  if (filters.label) count += 1;
  if (filters.minSeverity) count += 1;
  if (filters.analyzed) count += 1;
  if (filters.language) count += 1;
  if (filters.topicId) count += 1;
  if (filters.hashtag) count += 1;
  if (filters.country) count += 1;
  if (filters.range !== '30d') count += 1;
  return count;
}

/**
 * شريط الفلاتر الموحّد لكل شاشات الرصد.
 * صف واحد فوق المحتوى، والفلاتر المتقدمة تُطوى لتبقى الشاشة هادئة.
 */
export function FilterBar({
  filters,
  options,
  onChange,
  onReset,
  showSearch = true,
  className,
}: {
  filters: PostFilterState;
  options: FilterOptions;
  onChange: (filters: PostFilterState) => void;
  onReset: () => void;
  showSearch?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.q);

  function set<K extends keyof PostFilterState>(key: K, value: PostFilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  /*
   * «بانتظار التصنيف» يمسح الوسم والخطورة معه.
   *
   * غيرُ المصنَّف بلا وسمٍ ولا درجةٍ بالضرورة، فاجتماعُهما طلبٌ متناقض
   * جوابُه الصادق صفر. وشاشةٌ تُرجع صفراً عن طلبٍ يبدو معقولاً تُقرأ
   * عطلاً؛ فيُمسح المتناقض عند الاختيار بدل أن يُترك فخّاً.
   */
  function setAnalyzed(value: string) {
    onChange(
      value === 'no'
        ? { ...filters, analyzed: value, label: '', minSeverity: '' }
        : { ...filters, analyzed: value },
    );
  }

  /*
   * قائمة الحسابات تضيق بالمجموعة والمنصة معاً.
   *
   * البُعدان مستقلان: «وزارات» فيها حسابات على المنصات الثلاث، وفيسبوك فيه
   * حسابات من كل المجموعات. فاختيار أحدهما يضيّق القائمة، واختيارهما معاً
   * يضيّقها أكثر — ولا يُلغي أحدهما الآخر.
   */
  const accounts = options.accounts.filter(
    (account) =>
      (!filters.platformId || account.platformId === filters.platformId) &&
      (!filters.groupId || account.groupId === filters.groupId),
  );

  const count = activeFilterCount(filters);

  /*
   * ما فُهم من السطر يُعرض قبل الضغط لا بعده.
   *
   * ★ وهذا هو جوهر الميزة، لا خيار النمط.
   *
   *   قواعد كهذه — عبارةٌ بين علامتَي تنصيص، وناقصٌ للاستبعاد — تُكتب في
   *   سطر مساعدة لا يقرؤه أحد، فيكتب الموظّف «"وزارة الكهرباء» بعلامة
   *   واحدة ويرى نتائج لا يفهمها. والشرائح تحت الحقل تقول له ما فُهم
   *   بالضبط، فيصحّح قبل أن يبحث لا بعد أن يشكّ.
   *
   * والقراءة من `searchInput` لا من `filters.q`: المعروض ما سيُبحث عنه
   * عند الضغط، لا ما بُحث عنه قبل قليل.
   */
  const parsed = parseSearchTerms(searchInput);
  const showTerms = hasMultipleTerms(parsed) || parsed.dropped.length > 0;

  /*
   * اسمُ حسابٍ كُتب في سطر البحث.
   *
   * ★ وهذا ما يحلّ محلّ البحث في اسم الحساب لا إلغاؤه.
   *
   *   كان الحدّ يُطابَق في اسم الحساب أيضاً. وهو جدولٌ آخر، فشرطُه يُجبر
   *   القاعدة على مسح جدول المنشورات كلّه في كلّ بحث — ثلاثون ضعفاً
   *   مقيسةً على خمسين ألف منشور. فخرج من الاستعلام.
   *
   *   وخروجُه صامتاً يترك من كتب «حلب اليوم» أمام نتيجةٍ لا يفهم سببها.
   *   وقائمة الحسابات محمَّلةٌ في الشاشة أصلاً، فتُطابَق هنا بلا استعلام:
   *   يُقال له إنّ هناك حساباً بهذا الاسم، ويُعطى زرّاً يُحوّله إلى فلتر
   *   الحساب — وهو ما كان يريده فعلاً.
   */
  const accountHint =
    searchInput.trim().length >= 2 && !filters.accountId
      ? options.accounts.find((account) => account.name.includes(searchInput.trim()))
      : undefined;

  /** الضغط يُثبّت الكلمات والنمط معاً — فلا يُطبَّق نمطٌ على كلماتٍ قديمة */
  function apply(mode: PostFilterState['qMode'] = filters.qMode) {
    onChange({ ...filters, q: searchInput.trim(), qMode: mode });
  }

  return (
    <div className={cn('rounded-lg border border-border bg-surface shadow-elev-1 no-print', className)}>
      <div className="flex flex-wrap items-end gap-3 px-4 py-3">
        {showSearch && (
          <form
            className="flex min-w-56 flex-1 items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
          >
            <Input
              wrapperClassName="flex-1"
              label="بحث"
              placeholder="كلمة أو أكثر… كهرباء|تيار للمرادفات، «عبارة» بعلامتين، و-كلمة للاستبعاد"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <Button size="icon" type="submit" variant="secondary" aria-label="بحث">
              <Search className="h-4 w-4" aria-hidden />
            </Button>
          </form>
        )}

        {/*
          الموضوع المحفوظ يكتب سطره في حقل البحث ولا يُطبَّق من خلفه.

          ★ وهذا هو القرار الذي يستحقّ الشرح.

            كان يمكن أن يُرسَل معرّفُ الموضوع إلى الخادم فيقرأ سطره هناك.
            وثمنُه أنّ الموظّف يرى اسماً ونتائجَ ولا يرى ما بينهما: لا
            يعرف بأيّ كلماتٍ بُحث، ولا لماذا ظهر منشورٌ لا يخصّ الموضوع،
            ولا كيف يضيّق بحثه قليلاً دون أن يُحرّر الموضوع على كلّ من
            يستعمله.

            وكتابةُ السطر في الحقل تجعل الموضوع نقطةَ بداية لا صندوقاً
            مغلقاً: يراه، ويعدّله لنفسه، ويقرأ من الشرائح ما فُهم منه.
            ويبقى الرابط صالحاً للمشاركة لأنه يحمل السطر نفسه لا معرّفاً
            يتغيّر معناه إن حرّره أحد غداً.
        */}
        {showSearch && options.searchTopics.length > 0 && (
          <Select
            wrapperClassName="w-44"
            label="موضوع محفوظ"
            value=""
            onChange={(event) => {
              const topic = options.searchTopics.find((item) => item.id === event.target.value);
              if (!topic) return;
              setSearchInput(topic.query);
              onChange({ ...filters, q: topic.query, qMode: 'all' });
            }}
          >
            <option value="">اختر موضوعاً…</option>
            {options.searchTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </Select>
        )}

        <Select
          wrapperClassName="w-40"
          label="الفترة"
          value={filters.range}
          onChange={(event) => set('range', event.target.value)}
        >
          {DATE_RANGES.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
          ))}
          <option value="all">كل الفترات</option>
        </Select>

        {/*
          المجموعة قبل المنصة في الترتيب: الموظف يبدأ من «أيّ مجموعة أرصد»
          ثم يضيّق، لا العكس. وتصفير الحساب عند تغييرها ضروري — الحساب
          المختار قد لا ينتمي إلى المجموعة الجديدة فيبقى فلتراً خفيّاً
          يُرجع صفر نتائج بلا سبب ظاهر.
        */}
        <Select
          wrapperClassName="w-44"
          label="المجموعة"
          value={filters.groupId}
          onChange={(event) => onChange({ ...filters, groupId: event.target.value, accountId: '' })}
        >
          <option value="">كل المجموعات</option>
          {options.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </Select>

        <Select
          wrapperClassName="w-40"
          label="المنصة"
          value={filters.platformId}
          onChange={(event) => onChange({ ...filters, platformId: event.target.value, accountId: '' })}
        >
          <option value="">كل المنصات</option>
          {options.platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </Select>

        <Select
          wrapperClassName="w-48"
          label="الحساب"
          value={filters.accountId}
          onChange={(event) => set('accountId', event.target.value)}
        >
          <option value="">كل الحسابات</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>

        <Button variant="secondary" onClick={() => setExpanded((value) => !value)}>
          <Filter className="h-4 w-4" aria-hidden />
          فلاتر إضافية
          {count > 0 && (
            <Badge tone="primary" size="sm">
              {count}
            </Badge>
          )}
        </Button>

        {count > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchInput('');
              onReset();
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            إعادة ضبط
          </Button>
        )}
      </div>

      {/*
        صفٌّ يظهر عند الكلمة الثانية ويغيب عند الأولى.
        فالبحث بكلمةٍ واحدة — وهو أكثر ما يقع — يبقى كما كان بلا زيادة،
        ولا يُعرض خيار نمطٍ لا معنى له على كلمةٍ واحدة.
      */}
      {showSearch && accountHint && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2 text-2xs">
          <span className="text-muted-foreground">
            «{accountHint.name}» اسمُ حسابٍ مرصود — والبحث النصّي يبحث في المنشورات لا في أسماء
            الحسابات.
          </span>
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => {
              setSearchInput('');
              onChange({ ...filters, q: '', accountId: accountHint.id });
            }}
          >
            اعرض منشورات هذا الحساب
          </button>
        </div>
      )}

      {showSearch && showTerms && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-4 py-2.5">
          <span className="text-2xs text-muted-foreground">يُبحث عن:</span>

          <ul className="flex flex-wrap items-center gap-1.5">
            {/*
              المجموعة شريحةٌ واحدة تقول «كهرباء أو تيار».

              لا شريحةً لكل مرادف: الشرائح المتجاورة تُقرأ شروطاً مجتمعة
              — وهو عكس معنى المجموعة تماماً. والمرادفات داخل شريحةٍ
              واحدة بـ«أو» بينها تقول ما تعنيه بلا سطر شرح.
            */}
            {parsed.include.map((group) => (
              <li key={`in-${group.join('|')}`}>
                <Badge tone="primary" size="sm">
                  {describeGroup(group)}
                </Badge>
              </li>
            ))}
            {parsed.exclude.map((term) => (
              <li key={`out-${term}`}>
                <Badge tone="danger" size="sm">
                  <Minus className="h-3 w-3" aria-hidden />
                  {term}
                </Badge>
              </li>
            ))}
          </ul>

          {/*
            المُسقَط يُقال ولا يُكتم.

            حدٌّ من حرف واحد، أو مكرَّر، يُسقَط بصمت فيظنّ الموظّف أنّه
            بحث به — ويقرأ نتيجةً أوسع ممّا طلب على أنّها ما طلبه.
          */}
          {parsed.dropped.length > 0 && (
            <span className="text-2xs text-warning">
              أُسقط: {parsed.dropped.join('، ')} — حرفٌ واحد أو مكرَّر أو أطول من الحدّ
            </span>
          )}

          {countTerms(parsed) >= MAX_SEARCH_TERMS && (
            <span className="num text-2xs text-warning">
              الحدّ الأقصى {MAX_SEARCH_TERMS} كلمة
            </span>
          )}
          {parsed.include.length >= MAX_SEARCH_GROUPS && (
            <span className="num text-2xs text-warning">
              الحدّ الأقصى {MAX_SEARCH_GROUPS} شروط
            </span>
          )}

          {parsed.include.length > 1 && (
            <div className="ms-auto">
              <Segmented
                label="نمط تعدّد الكلمات"
                value={filters.qMode}
                onChange={(mode) => apply(mode)}
                options={[
                  { value: 'all', label: 'كل الكلمات' },
                  { value: 'any', label: 'أيّ كلمة' },
                ]}
                size="sm"
              />
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div className="grid gap-3 border-t border-border px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          {filters.range === 'custom' && (
            <>
              <Input
                label="من تاريخ"
                type="date"
                value={filters.from}
                onChange={(event) => set('from', event.target.value)}
              />
              <Input
                label="إلى تاريخ"
                type="date"
                value={filters.to}
                onChange={(event) => set('to', event.target.value)}
              />
            </>
          )}

          <Select
            label="نوع المنشور"
            value={filters.postType}
            onChange={(event) => set('postType', event.target.value)}
          >
            <option value="">كل الأنواع</option>
            {Object.entries(POST_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <Select
            label={STANCE_METRIC.compact}
            value={filters.sentiment}
            onChange={(event) => set('sentiment', event.target.value)}
          >
            <option value="">كل الحالات</option>
            {Object.entries(SENTIMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          {/*
            حالُ التصنيف أوّلُ الثلاثة.

            «أرني ما لم يُصنَّف بعد» سؤالُ من يشكّ أنّ التصنيف متوقّف —
            وهو سؤالٌ عن المنصة لا عن المحتوى، فيسبق سؤالَي الخطورة
            والوسم. وجوابُه عددٌ يراه ينقص بنفسه كلّ بضع دقائق.
          */}
          <Select
            label="حال التصنيف"
            value={filters.analyzed}
            onChange={(event) => setAnalyzed(event.target.value)}
          >
            <option value="">المصنَّف وغيره</option>
            <option value="yes">المصنَّف وحده</option>
            <option value="no">بانتظار التصنيف</option>
          </Select>

          {/*
            الخطورة قبل الوسم في الترتيب.

            «أرني ما خطورته ٤ فأعلى» سؤالُ من يبحث عن خطرٍ لا يعرف شكله
            بعد — وهو أوّل ما يُسأل. والوسم سؤالُ من يعرف ما يبحث عنه.
          */}
          <Select
            label="أدنى درجة خطورة"
            value={filters.minSeverity}
            onChange={(event) => set('minSeverity', event.target.value)}
          >
            <option value="">كل الدرجات</option>
            {[5, 4, 3, 2, 1].map((level) => (
              <option key={level} value={String(level)}>
                {SEVERITY_LEVELS[level]?.short} فأعلى — {SEVERITY_LEVELS[level]?.label}
              </option>
            ))}
          </Select>

          <Select
            label="وسم المحتوى"
            value={filters.label}
            onChange={(event) => set('label', event.target.value)}
          >
            <option value="">كل الوسوم</option>
            {Object.entries(CONTENT_LABELS).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>

          <Select
            label="التصنيف"
            value={filters.topicId}
            onChange={(event) => set('topicId', event.target.value)}
          >
            <option value="">كل التصنيفات</option>
            {options.topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </Select>

          <Select
            label="اللغة"
            value={filters.language}
            onChange={(event) => set('language', event.target.value)}
          >
            <option value="">كل اللغات</option>
            {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <Input
            label="الهاشتاق"
            placeholder="بدون #"
            value={filters.hashtag}
            onChange={(event) => set('hashtag', event.target.value)}
          />

          <Input
            label="الدولة أو الموقع"
            value={filters.country}
            onChange={(event) => set('country', event.target.value)}
          />
        </div>
      )}
    </div>
  );
}

/** تحويل حالة الفلاتر إلى معاملات رابط */
export function filtersToParams(filters: PostFilterState): Record<string, string> {
  const params: Record<string, string> = { range: filters.range };
  if (filters.q) params.q = filters.q;
  // النمط يُرسَل مع الكلمات وحدها — وبلا بحثٍ لا معنى له في الرابط
  if (filters.q && filters.qMode === 'any') params.qMode = 'any';
  if (filters.groupId) params.groupId = filters.groupId;
  if (filters.platformId) params.platformId = filters.platformId;
  if (filters.accountId) params.accountId = filters.accountId;
  if (filters.postType) params.postType = filters.postType;
  if (filters.sentiment) params.sentiment = filters.sentiment;
  /*
   * ★ وهذه الثلاثة كانت تسقط هنا صامتةً.
   *
   *   الوسم والخطورة لهما مربّعان في الشريط، ويُعدّان في «الفلاتر
   *   المفعّلة»، ويُفهمهما الخادم — ولم يكونا يُرسَلان. فالموظّف يختار
   *   «خطورة ٤ فأعلى» فيرى الشاشة كما كانت، ويستنتج أن التصنيف لا يعمل.
   *   وهو عطبٌ لا يظهر في سجلّ ولا في فحص: الطلب ينجح، والجواب صحيحٌ عن
   *   سؤالٍ لم يُسأل.
   */
  if (filters.label) params.label = filters.label;
  if (filters.minSeverity) params.minSeverity = filters.minSeverity;
  if (filters.analyzed) params.analyzed = filters.analyzed;
  if (filters.language) params.language = filters.language;
  if (filters.topicId) params.topicId = filters.topicId;
  if (filters.hashtag) params.hashtag = filters.hashtag;
  if (filters.country) params.country = filters.country;
  if (filters.range === 'custom') {
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
  }
  return params;
}
