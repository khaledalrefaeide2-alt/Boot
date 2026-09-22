import 'server-only';
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { mediaRoot } from '@/lib/media/store';

/*
 * التقليم مفصولٌ عن المخزن.
 *
 * ليس تنظيماً: قراءة المجلّدات بمسارات تُحسب وقت التشغيل تجعل Next يتتبّع
 * المشروع كلّه في حزمة أي مسار يستوردها — والمسار الذي يقدّم صورة لا يحتاج
 * التقليم أصلاً، إنما يحتاجه العامل وحده.
 */

/**
 * تنظيف المخزن حين يتجاوز سقفه.
 *
 * الأقدمُ وصولاً يُحذف أولاً لا الأقدمُ إنشاءً: المنشور الذي لم يُفتح منذ
 * سنة أولى بالحذف من منشور قديم يُراجَع كل أسبوع. وحذفُ الملف لا يفقد شيئاً
 * لا رجعة فيه — يُعاد جلبه إن كان رابطه حيّاً، وإلا فقد كان ميتاً أصلاً.
 */
export async function pruneStore(maxBytes: number): Promise<{ removed: number; bytes: number }> {
  const root = mediaRoot();
  const files: { path: string; size: number; atime: number }[] = [];

  let shards: string[];
  try {
    shards = await readdir(root);
  } catch {
    return { removed: 0, bytes: 0 };
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
        if (info.isFile()) files.push({ path: full, size: info.size, atime: info.atimeMs });
      } catch {
        // ملف اختفى بين القراءة والفحص — لا شيء يُفعل
      }
    }
  }

  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total <= maxBytes) return { removed: 0, bytes: total };

  files.sort((a, b) => a.atime - b.atime);

  let remaining = total;
  let removed = 0;
  for (const file of files) {
    if (remaining <= maxBytes) break;
    try {
      await unlink(file.path);
      remaining -= file.size;
      removed += 1;
    } catch {
      // محذوف أصلاً
    }
  }

  return { removed, bytes: remaining };
}
