'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Select } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, readCsrfToken } from '@/lib/api-client';
import { ChatHistory, type ConversationSummary } from './ChatHistory';
import { ChatInput } from './ChatInput';
import { MessageBubble, type DisplayMessage } from './MessageBubble';
import { SuggestedQuestions } from './SuggestedQuestions';

const WINDOWS = [
  { value: '1', label: 'آخر 24 ساعة' },
  { value: '7', label: 'آخر 7 أيام' },
  { value: '30', label: 'آخر 30 يوماً' },
  { value: '90', label: 'آخر 90 يوماً' },
];

interface ConversationDetail {
  id: string;
  title: string | null;
  messages: { id: string; role: 'USER' | 'ASSISTANT'; content: string; createdAt: string }[];
}

export function ChatWindow({ configured }: { configured: boolean }) {
  const toast = useToast();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [windowDays, setWindowDays] = useState('7');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    try {
      const data = await api.get<{ conversations: ConversationSummary[] }>(
        '/api/assistant/conversations',
      );
      setConversations(data.conversations);
    } catch {
      // فشل جلب القائمة لا يمنع طرح سؤال جديد، فلا يُعطَّل شيء بسببه
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // التمرير يتبع آخر سطر أثناء التدفّق
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function openConversation(id: string) {
    setActiveId(id);
    setMessages([]);
    try {
      const data = await api.get<{ conversation: ConversationDetail }>(
        `/api/assistant/conversations/${id}`,
      );
      setMessages(
        data.conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        })),
      );
    } catch (error) {
      toast.error(
        'تعذّر فتح المحادثة',
        error instanceof ApiClientError ? error.message : undefined,
      );
    }
  }

  function startNew() {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setInput('');
  }

  async function removeConversation(id: string) {
    try {
      await api.delete(`/api/assistant/conversations/${id}`);
      if (activeId === id) startNew();
      await refreshList();
      toast.success('حُذفت المحادثة');
    } catch (error) {
      toast.error('تعذّر الحذف', error instanceof ApiClientError ? error.message : undefined);
    } finally {
      setDeleteTarget(null);
    }
  }

  /*
   * الإرسال عبر fetch لا عبر عميل الـ API.
   *
   * العميل يقرأ الجسم دفعةً واحدة، وهذا الردّ تيّار أحداث يُقرأ مقطعاً
   * مقطعاً. فالطلب يُبنى هنا، ويحمل رمز الحماية نفسه الذي يحمله العميل —
   * من الدالة نفسها لا من نسخة ثانية تنحرف عنها.
   */
  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: DisplayMessage = { id: `u-${Date.now()}`, role: 'USER', content: text };
    const draftId = `a-${Date.now()}`;
    setMessages((current) => [
      ...current,
      userMessage,
      { id: draftId, role: 'ASSISTANT', content: '', pending: true },
    ]);
    setInput('');
    setBusy(true);

    let conversationId = activeId;

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': readCsrfToken() },
        body: JSON.stringify({
          message: text,
          conversationId: activeId ?? undefined,
          windowDays: Number(windowDays),
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? 'تعذّر إرسال السؤال');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // أحداث SSE مفصولة بسطرين فارغين؛ الجزء الأخير قد يكون ناقصاً
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          const eventLine = chunk.split('\n').find((line) => line.startsWith('event: '));
          const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7).trim();
          const payload = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;

          if (event === 'meta' && typeof payload.conversationId === 'string') {
            conversationId = payload.conversationId;
            setActiveId(payload.conversationId);
          } else if (event === 'delta' && typeof payload.text === 'string') {
            const delta = payload.text;
            setMessages((current) =>
              current.map((message) =>
                message.id === draftId
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            );
          } else if (event === 'error' && typeof payload.message === 'string') {
            throw new Error(payload.message);
          }
        }
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === draftId ? { ...message, pending: false } : message,
        ),
      );
      if (conversationId) await refreshList();
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages((current) =>
          current.map((message) =>
            message.id === draftId
              ? { ...message, pending: false, content: message.content || '— أُوقف التوليد —' }
              : message,
          ),
        );
      } else {
        const message = error instanceof Error ? error.message : 'تعذّر إرسال السؤال';
        setMessages((current) => current.filter((item) => item.id !== draftId));
        toast.error('تعذّر إنتاج الإجابة', message);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <>
      {/*
        الارتفاع يُحسب بخصم ما فوق النافذة فعلاً: الشريط العلوي (4rem)،
        وحشوة المحتوى، وترويسة الصفحة. وكان الخصم 10rem فيقع حقل الإدخال
        تحت طيّة الشاشة على ارتفاع 900 بكسل — وحقلُ إدخالٍ لا يُرى هو
        شاشةٌ لا تعمل.
      */}
      <div className="flex h-[calc(100dvh-17rem)] min-h-96 overflow-hidden rounded-lg border border-border bg-background">
      <div className="hidden lg:block">
        <ChatHistory
          conversations={conversations}
          activeId={activeId}
          onSelect={openConversation}
          onCreate={startNew}
          onDelete={setDeleteTarget}
          loading={loadingList}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
          <p className="truncate text-sm font-semibold text-heading">
            {conversations.find((item) => item.id === activeId)?.title ?? 'محادثة جديدة'}
          </p>
          <Select
            wrapperClassName="w-40"
            aria-label="نطاق التحليل الزمني"
            value={windowDays}
            onChange={(event) => setWindowDays(event.target.value)}
          >
            {WINDOWS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {!configured && (
            <Alert tone="warning" title="المساعد غير مهيّأ">
              لم يتم ضبط مفتاح OpenAI. أضف OPENAI_API_KEY في ملف البيئة ثم أعد تشغيل الخدمة.
            </Alert>
          )}

          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <SuggestedQuestions onPick={(question) => void send(question)} />
            </div>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
          <div ref={bottomRef} />
        </div>

        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={() => void send(input)}
          onStop={() => abortRef.current?.abort()}
          busy={busy}
          disabled={!configured}
        />
      </div>

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteTarget && void removeConversation(deleteTarget)}
          title="حذف المحادثة"
          message="ستُحذف المحادثة وكل رسائلها. لا يمكن التراجع."
          confirmLabel="حذف"
        />
      </div>
    </>
  );
}
