'use client';

export interface FilterValues {
  dateFrom?: string;
  dateTo?: string;
  country?: string;
  language?: string;
  engagementLevel?: string;
  postType?: string;
  sort?: string;
}

const COUNTRIES = ['', 'US', 'GB', 'SA', 'AE', 'EG', 'DE', 'FR', 'BR', 'IN'];
const LANGS = ['', 'en', 'ar', 'es', 'fr', 'de', 'pt'];

export function Filters({
  value,
  onChange,
  showSort = false,
}: {
  value: FilterValues;
  onChange: (v: FilterValues) => void;
  showSort?: boolean;
}) {
  const set = (patch: Partial<FilterValues>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">From</label>
        <input type="date" className="input !py-1.5" value={value.dateFrom || ''} onChange={(e) => set({ dateFrom: e.target.value })} />
      </div>
      <div>
        <label className="label">To</label>
        <input type="date" className="input !py-1.5" value={value.dateTo || ''} onChange={(e) => set({ dateTo: e.target.value })} />
      </div>
      <div>
        <label className="label">Country</label>
        <select className="input !py-1.5" value={value.country || ''} onChange={(e) => set({ country: e.target.value })}>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c || 'Any'}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Language</label>
        <select className="input !py-1.5" value={value.language || ''} onChange={(e) => set({ language: e.target.value })}>
          {LANGS.map((l) => <option key={l} value={l}>{l || 'Any'}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Engagement</label>
        <select className="input !py-1.5" value={value.engagementLevel || 'any'} onChange={(e) => set({ engagementLevel: e.target.value })}>
          {['any', 'low', 'medium', 'high'].map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Post type</label>
        <select className="input !py-1.5" value={value.postType || 'any'} onChange={(e) => set({ postType: e.target.value })}>
          {['any', 'status', 'photo', 'video', 'link'].map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      {showSort && (
        <div>
          <label className="label">Sort by</label>
          <select className="input !py-1.5" value={value.sort || 'viral'} onChange={(e) => set({ sort: e.target.value })}>
            <option value="viral">Most Viral</option>
            <option value="newest">Newest</option>
            <option value="engagement">Highest Engagement</option>
            <option value="comments">Most Comments</option>
            <option value="shares">Most Shares</option>
          </select>
        </div>
      )}
    </div>
  );
}
