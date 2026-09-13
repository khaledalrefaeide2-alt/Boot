'use client';

import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DisplayMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  pending?: boolean;
}

/*
 * عرض Markdown بلا مكتبة.
 *
 * المُحوِّل هنا يقتصر على ما يُنتجه النموذج فعلاً: عناوين، وقوائم،
 * وثخين، وأسطر. ولا يمرّ منه HTML خام إطلاقاً — النصّ يُقسَّم ويُبنى
 * عناصرَ React، ولا يُستعمل dangerouslySetInnerHTML في أيّ موضع.
 *
 * وهذا ليس اقتصاداً في الحزم بل قرار أمني: جواب النموذج مبنيٌّ جزئياً
 * على نصوص منشورات كتبها أشخاص خارج المنصة، فأيّ مسارٍ يحقن HTML منها
 * في الصفحة هو ثغرة XSS مكتملة.
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} className="font-semibold text-heading">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="ltr rounded bg-surface-2 px-1 py-0.5 text-xs">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="my-2 space-y-1 pe-5">
        {list.map((item, index) => (
          <li key={`${key}-${index}`} className="list-disc text-sm leading-relaxed">
            {renderInline(item, `${key}-${index}`)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const key = `b-${index}`;

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet?.[1] !== undefined) {
      list.push(bullet[1]);
      return;
    }
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (numbered?.[1] !== undefined) {
      list.push(numbered[1]);
      return;
    }
    flushList(`l-${index}`);

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading?.[2] !== undefined) {
      blocks.push(
        <p key={key} className="mt-3 mb-1 text-sm font-bold text-heading">
          {renderInline(heading[2], key)}
        </p>,
      );
      return;
    }

    if (line.trim() === '') return;
    blocks.push(
      <p key={key} className="my-1.5 text-sm leading-relaxed">
        {renderInline(line, key)}
      </p>,
    );
  });

  flushList('l-final');
  return blocks;
}

export function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'USER';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-surface-2 text-muted-foreground' : 'bg-primary-soft text-primary-soft-foreground',
        )}
        aria-hidden
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div
        className={cn(
          'min-w-0 max-w-[min(46rem,85%)] rounded-lg px-4 py-3',
          isUser
            ? 'bg-surface-2 text-foreground'
            : 'border border-border bg-surface text-foreground shadow-elev-1',
        )}
      >
        <p className="sr-only">{isUser ? 'رسالتك' : 'رد المساعد'}</p>
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        ) : message.content ? (
          <div>{renderMarkdown(message.content)}</div>
        ) : (
          <p className="text-sm text-muted-foreground">المساعد يفكّر…</p>
        )}

        {message.pending && message.content && (
          <span className="ms-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-primary align-middle" aria-hidden />
        )}
      </div>
    </div>
  );
}
