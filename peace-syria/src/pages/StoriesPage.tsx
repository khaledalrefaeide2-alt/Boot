import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { HeartHandshake, PenLine, Send, Sparkles } from 'lucide-react';
import type { Story } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../components/Toast';
import { StoryCard } from '../components/StoryCard';
import { ShareModal } from '../components/ShareModal';
import { Modal } from '../components/Modal';
import { EmptyState, ErrorState, InlineAlert, PageHeader, SkeletonCards, Spinner } from '../components/ui';

interface StoryForm {
  name: string;
  location: string;
  title: string;
  content: string;
}

const emptyForm: StoryForm = { name: '', location: '', title: '', content: '' };

function SubmitStoryModal({ open, onClose, onSubmitted }: { open: boolean; onClose: () => void; onSubmitted: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<StoryForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof StoryForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.content.trim().length < 30) {
      toast.warning('اكتب القصة بما لا يقل عن ٣٠ حرفاً.');
      return;
    }

    setSubmitting(true);
    try {
      await api.submitStory({
        name: form.name.trim(),
        location: form.location.trim(),
        title: form.title.trim(),
        content: form.content.trim(),
      });
      toast.success('شكراً لك! وصلت قصتك وستُنشر بعد مراجعتها.');
      setForm(emptyForm);
      onSubmitted();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="شاركنا قصتك"
      description="قصة حقيقية عن تعاون أو تضامن رأيته بعينك. تُراجَع القصص قبل نشرها."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="story-name" className="text-xs font-bold text-slate-700">
              الاسم أو الكنية <span className="text-red-500">*</span>
            </label>
            <input
              id="story-name"
              required
              minLength={2}
              value={form.name}
              onChange={update('name')}
              className="input"
              placeholder="يمكنك استخدام اسم مستعار"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="story-location" className="text-xs font-bold text-slate-700">
              المكان <span className="text-red-500">*</span>
            </label>
            <input
              id="story-location"
              required
              minLength={2}
              value={form.location}
              onChange={update('location')}
              className="input"
              placeholder="مثال: حلب"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="story-title" className="text-xs font-bold text-slate-700">
            عنوان القصة <span className="text-red-500">*</span>
          </label>
          <input
            id="story-title"
            required
            minLength={4}
            value={form.title}
            onChange={update('title')}
            className="input"
            placeholder="جملة قصيرة تلخّص القصة"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="story-content" className="text-xs font-bold text-slate-700">
            نص القصة <span className="text-red-500">*</span>
          </label>
          <textarea
            id="story-content"
            required
            minLength={30}
            rows={6}
            value={form.content}
            onChange={update('content')}
            className="input resize-y leading-8"
            placeholder="ماذا حدث؟ من شارك؟ وما الأثر الذي تركه على الناس؟"
          />
          <p className="nums text-left text-xs text-slate-400">{form.content.length} حرفاً</p>
        </div>

        <InlineAlert>
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden />
          <span>تجنّب ذكر أسماء كاملة أو عناوين دقيقة لأشخاص دون إذنهم، حفاظاً على سلامتهم.</span>
        </InlineAlert>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            إلغاء
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? <Spinner /> : <Send className="h-4 w-4" aria-hidden />}
            إرسال القصة
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [sharing, setSharing] = useState<Story | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getStories('approved');
      setStories(data.stories);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="من المجتمع"
        title="قصص إيجابية"
        description="قصص حقيقية يرويها الناس عن التعاون والتضامن في الحياة اليومية. كل قصة تُراجَع قبل نشرها."
        actions={
          <button type="button" onClick={() => setFormOpen(true)} className="btn-primary">
            <PenLine className="h-4 w-4" aria-hidden />
            شاركنا قصتك
          </button>
        }
      />

      <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-l from-emerald-50 to-teal-50 p-6 sm:p-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
            <HeartHandshake className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-emerald-900">لماذا القصص الإيجابية؟</h2>
            <p className="mt-1 max-w-2xl text-sm leading-7 text-emerald-800/80">
              الشائعة تنتشر لأنها تُروى كقصة. مواجهتها لا تكون بالنفي وحده، بل بقصص حقيقية تُظهر ما يفعله الناس فعلاً
              حين تشتد الأزمات: يتشاركون الخبز والماء والمعلومة الصحيحة.
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <SkeletonCards count={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : stories.length === 0 ? (
        <EmptyState
          icon={<HeartHandshake className="h-6 w-6" />}
          title="لا توجد قصص منشورة بعد"
          description="كن أول من يشارك قصة تضامن من حيّه أو مدينته."
          action={
            <button type="button" onClick={() => setFormOpen(true)} className="btn-primary">
              <PenLine className="h-4 w-4" aria-hidden />
              شاركنا قصتك
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} onShare={setSharing} />
          ))}
        </div>
      )}

      <SubmitStoryModal open={formOpen} onClose={() => setFormOpen(false)} onSubmitted={load} />
      <ShareModal
        open={Boolean(sharing)}
        onClose={() => setSharing(null)}
        title={sharing?.title ?? ''}
        text={sharing ? `${sharing.content}\n\n— ${sharing.name}، ${sharing.location}` : ''}
      />
    </div>
  );
}
