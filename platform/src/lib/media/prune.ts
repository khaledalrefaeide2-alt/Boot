import 'server-only';
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { mediaRoot } from '@/lib/media/store';

/*
 * التقليم مفصولٌ عن المخزن.
 *
 * ليس تنظيماً: قراءة المجلّدات بمسارات تُحسب وقت التشغيل تجعل Next يتتبّع
 * المشروع كلّه في حزمة أي مسار يستوردها — والمسار الذي يقدّم صورة لا يحتاج
 * التقليم أصلاً، إنما يحتاجه العامل وحده.
 */

/** أقصى ما يُحذف في دورة واحدة — دورةٌ تحذف عشرة آلاف ملف تشلّ القرص */
const MAX_DELETIONS = 5_000;

export interface PruneResult {
  /** ملفات لا يشير إليها منشور — تُحذف أولاً دائماً */
  orphans: number;
  /** ملفات حيّة حُذفت لبلوغ السقف — وهي خسارةٌ حقيقية تُعلن */
  evicted: number;
  /** ما بقي من حجم بعد التقليم */
  bytes: number;
}

/**
 * تنظيف المخزن.
 *
 * ★ اليتيم قبل الحيّ — وهذا هو التغيير الذي يهمّ.
 *
 *   كان التقليم يرتّب الملفّات كلّها بآخر قراءة ويحذف الأقدم حتى يبلغ
 *   السقف، بلا أن يسأل أيُّها ما زال مستعمَلاً. وأكثر ما في المخزن يتيم:
 *   مفتاح الصورة كان بصمةَ رابطها الموقَّع، ورابط فيسبوك يتغيّر توقيعه مع
 *   كلّ استخراج — فالصورة الواحدة تُحفظ مرّةً بعد كلّ تشغيل تحت مفتاح
 *   جديد، وتبقى نسخُها القديمة على القرص لا يشير إليها أحد.
 *
 *   فكان التقليم يحذف مصغّرةً حيّة معروضة في بطاقة، ويُبقي عشر نُسَخ
 *   ميتة من صورةٍ أخرى. والنتيجة «تعذّر عرض الوسائط» على منشورٍ صورته
 *   كانت عندنا بالأمس.
 *
 *   وقد أُصلح المفتاح كذلك (`canonicalMediaUrl`)، فلا تتولّد اليتامى بعد
 *   اليوم — وهذا يُنظّف ما تراكم منها.
 *
 * ★ وما يُحذف حيّاً يُنسى مفتاحه في القاعدة.
 *
 *   ملفٌّ حُذف ومفتاحه باقٍ في الصفّ حالةٌ كاذبة: المنشور يقول «صورتي
 *   محفوظة» والقرص يقول لا. فيُفرَّغ المفتاح، وتُرفع محاولاته إلى الحدّ
 *   حتى لا تُعيد المكنسة جلبه — وإلا دار القرصُ في حلقة: يُجلب فيمتلئ،
 *   فيُقلَّم فيُجلب.
 */
export async function pruneStore(
  maxBytes: number,
  maxAttempts = 4,
): Promise<PruneResult> {
  const root = mediaRoot();
  const files: { path: string; key: string; size: number; atime: number }[] = [];

  let shards: string[];
  try {
    shards = await readdir(root);
  } catch {
    return { orphans: 0, evicted: 0, bytes: 0 };
  }

  for (const shard of shards) {
    const dir = path.join(root, shard);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        const info = await stat(full);
        if (!info.isFile()) continue;
        files.push({
          path: full,
          key: entry.replace(/\.webp$/, ''),
          size: info.size,
          atime: info.atimeMs,
        });
      } catch {
        // ملف اختفى بين القراءة والفحص — لا شيء يُفعل
      }
    }
  }

  if (files.length === 0) return { orphans: 0, evicted: 0, bytes: 0 };

  /*
   * المفاتيح المستعمَلة تُقرأ مرّة واحدة.
   *
   * خمسون ألف مفتاح بأربعين حرفاً نحو مليونَي بايت في الذاكرة — أرخص
   * بكثير من استعلامٍ لكلّ ملف. و`posts.mediaKey` وحده يشير إلى هذا
   * المخزن: صور الحسابات تُخزَّن روابطَ لا ملفات.
   */
  const rows = await prisma.post.findMany({
    where: { mediaKey: { not: null } },
    select: { mediaKey: true },
  });
  const live = new Set(rows.flatMap((row) => (row.mediaKey ? [row.mediaKey] : [])));

  let remaining = files.reduce((sum, file) => sum + file.size, 0);
  let orphans = 0;
  let deletions = 0;

  for (const file of files) {
    if (deletions >= MAX_DELETIONS) break;
    if (live.has(file.key)) continue;
    try {
      await unlink(file.path);
      remaining -= file.size;
      orphans += 1;
      deletions += 1;
    } catch {
      // محذوف أصلاً
    }
  }

  if (remaining <= maxBytes || deletions >= MAX_DELETIONS) {
    return { orphans, evicted: 0, bytes: remaining };
  }

  /*
   * ما بقي فوق السقف يُحذف بالأقدم قراءةً لا بالأقدم إنشاءً.
   *
   * المنشور الذي لم يُفتح منذ سنة أولى بالحذف من منشور قديم يُراجَع كلّ
   * أسبوع. وبلوغُ هذا الموضع أصلاً علامةٌ على أنّ السقف صار أضيق من
   * الأرشيف — والعلاج رفعُ `MEDIA_MAX_MB` لا الاعتياد على فقد الصور.
   */
  const survivors = files
    .filter((file) => live.has(file.key))
    .sort((a, b) => a.atime - b.atime);

  const evictedKeys: string[] = [];
  for (const file of survivors) {
    if (remaining <= maxBytes || deletions >= MAX_DELETIONS) break;
    try {
      await unlink(file.path);
      remaining -= file.size;
      evictedKeys.push(file.key);
      deletions += 1;
    } catch {
      // محذوف أصلاً
    }
  }

  if (evictedKeys.length > 0) {
    await prisma.post
      .updateMany({
        where: { mediaKey: { in: evictedKeys } },
        data: { mediaKey: null, mediaAttempts: maxAttempts },
      })
      .catch(() => undefined);
  }

  return { orphans, evicted: evictedKeys.length, bytes: remaining };
}
