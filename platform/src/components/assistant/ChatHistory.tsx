'use client';

import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatRelativeTime } from '@/lib/utils';

export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
  _count: { messages: number };
}

/** قائمة المحادثات السابقة — مملوكة للمستخدم الحالي وحده */
export function ChatHistory({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  loading,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  return (
    <aside className="flex h-full w-full flex-col border-e border-border bg-surface lg:w-64">
      <div className="border-b border-border p-3">
        <Button className="w-full" onClick={onCreate}>
          <Plus className="h-4 w-4" aria-hidden />
          محادثة جديدة
        </Button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="المحادثات السابقة">
        {loading ? (
          <p className="p-3 text-xs text-muted-foreground">جارٍ التحميل…</p>
        ) : conversations.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">لا توجد محادثات بعد.</p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <div
                  className={cn(
                    'group flex items-center gap-1 rounded-md transition-colors',
                    activeId === conversation.id ? 'bg-primary-soft' : 'hover:bg-surface-2',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-start focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                    aria-current={activeId === conversation.id}
                  >
                    <MessageSquare
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        activeId === conversation.id
                          ? 'text-primary-soft-foreground'
                          : 'text-subtle-foreground',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {conversation.title || 'محادثة بلا عنوان'}
                      </span>
                      <span className="block text-2xs text-subtle-foreground">
                        {formatRelativeTime(conversation.updatedAt)}
                      </span>
                    </span>
                  </button>

                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0 text-danger opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => onDelete(conversation.id)}
                    aria-label={`حذف ${conversation.title || 'المحادثة'}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
