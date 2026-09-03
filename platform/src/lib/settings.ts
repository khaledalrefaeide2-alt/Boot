import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db';

/** قيم الإعدادات الافتراضية إذا لم تُعرَّف في القاعدة */
const DEFAULTS: Record<string, unknown> = {
  'app.name': 'منصة رصد وتحليل المنصات الإعلامية',
  'app.organization': '',
  'data.retentionDays': 365,
  'extraction.defaultMaxItems': 100,
  'extraction.defaultWindowDays': 30,
  'alerts.highEngagementThreshold': 1000,
  'alerts.negativeSentimentRatio': 0.4,
};

/** قراءة كل الإعدادات دفعة واحدة — مُخزّنة على مستوى الطلب */
export const getAllSettings = cache(async (): Promise<Record<string, unknown>> => {
  try {
    const rows = await prisma.setting.findMany({ select: { key: true, value: true } });
    const map: Record<string, unknown> = { ...DEFAULTS };
    for (const row of rows) map[row.key] = row.value;
    return map;
  } catch {
    return { ...DEFAULTS };
  }
});

/** قراءة إعداد واحد بنوع محدد */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const settings = await getAllSettings();
  const value = settings[key];
  return (value === undefined || value === null ? fallback : value) as T;
}

/** اسم المنصة المعروض في الترويسة والتقارير */
export async function getAppName(): Promise<string> {
  return getSetting('app.name', 'منصة رصد وتحليل المنصات الإعلامية');
}

/** الإعدادات التي يحتاجها منطق الاستخراج والتنبيهات */
export async function getOperationalSettings() {
  const settings = await getAllSettings();
  return {
    defaultMaxItems: Number(settings['extraction.defaultMaxItems'] ?? 100),
    defaultWindowDays: Number(settings['extraction.defaultWindowDays'] ?? 30),
    highEngagementThreshold: Number(settings['alerts.highEngagementThreshold'] ?? 1000),
    negativeSentimentRatio: Number(settings['alerts.negativeSentimentRatio'] ?? 0.4),
    retentionDays: Number(settings['data.retentionDays'] ?? 365),
    organization: String(settings['app.organization'] ?? ''),
    appName: String(settings['app.name'] ?? 'منصة رصد وتحليل المنصات الإعلامية'),
  };
}
