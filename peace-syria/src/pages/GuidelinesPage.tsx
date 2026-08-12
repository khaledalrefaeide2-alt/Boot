import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, Search, ShieldCheck } from 'lucide-react';
import type { Guideline } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { cx } from '../lib/utils';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '../components/ui';

function AccordionItem({
  item,
  open,
  onToggle,
}: {
  item: Guideline;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cx(
        'overflow-hidden rounded-2xl border transition',
        open ? 'border-teal-200 bg-teal-50/40 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-right"
      >
        <span className="flex items-center gap-3">
          <span
            className={cx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition',
              open ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500',
            )}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-bold text-slate-800">{item.question}</span>
        </span>
        <ChevronDown
          className={cx('h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="animate-fade-in border-t border-teal-100 px-5 py-4 pr-[4.25rem]">
          <p className="text-sm leading-8 text-slate-600">{item.answer}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function GuidelinesPage() {
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getGuidelines();
      setGuidelines(data.guidelines);
      setCategories(data.categories);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim();
    return guidelines.filter((item) => {
      const inCategory = category === 'all' || item.category === category;
      const inSearch = !q || item.question.includes(q) || item.answer.includes(q) || item.category.includes(q);
      return inCategory && inSearch;
    });
  }, [guidelines, search, category]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="الدليل"
        title="إرشادات عامة"
        description="أسئلة متكررة حول الأمان الرقمي، التحقق من الأخبار، ومواجهة خطاب الكراهية بلغة هادئة."
      />

      <section className="card space-y-4 p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث في الإرشادات… مثال: تحقق، كلمة مرور، تعميم"
            className="input pr-11"
            aria-label="بحث في الإرشادات"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={cx(
              'chip border transition',
              category === 'all'
                ? 'border-teal-600 bg-teal-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-700',
            )}
          >
            كل المواضيع
          </button>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cx(
                'chip border transition',
                category === item
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-700',
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <LoadingBlock label="جارٍ تحميل الإرشادات…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title="لا توجد نتائج مطابقة"
          description="جرّب كلمة أبسط أو اختر موضوعاً آخر من التصنيفات."
          action={
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategory('all');
              }}
              className="btn-secondary"
            >
              عرض كل الإرشادات
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <AccordionItem
              key={item.id}
              item={item}
              open={openId === item.id}
              onToggle={() => setOpenId((current) => (current === item.id ? null : item.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
