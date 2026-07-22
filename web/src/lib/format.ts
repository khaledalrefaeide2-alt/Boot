export function compact(n: number | undefined | null): string {
  if (n == null) return '—';
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function num(n: number | undefined | null): string {
  if (n == null) return '—';
  return Intl.NumberFormat('en').format(n);
}

export function pct(n: number | undefined | null, digits = 1): string {
  if (n == null) return '—';
  const s = n.toFixed(digits);
  return `${n > 0 ? '+' : ''}${s}%`;
}

export function relTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function sentimentLabel(v: number): { label: string; color: string } {
  if (v > 0.25) return { label: 'Positive', color: '#16a34a' };
  if (v < -0.25) return { label: 'Negative', color: '#dc2626' };
  return { label: 'Neutral', color: '#64748b' };
}
