import { Copy, Link2, MessageCircle, Send, Share2 } from 'lucide-react';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { copyToClipboard } from '../lib/utils';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  text: string;
}

/** Share sheet for posts, stories and rumor corrections. */
export function ShareModal({ open, onClose, title, text }: ShareModalProps) {
  const toast = useToast();
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const payload = `${title}\n\n${text}\n\n— سلام في سوريا`;
  const encoded = encodeURIComponent(payload);
  const encodedUrl = encodeURIComponent(shareUrl);

  const targets = [
    {
      key: 'whatsapp',
      label: 'واتساب',
      href: `https://wa.me/?text=${encoded}`,
      icon: MessageCircle,
      className: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100',
    },
    {
      key: 'telegram',
      label: 'تيليغرام',
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encoded}`,
      icon: Send,
      className: 'bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-100',
    },
    {
      key: 'x',
      label: 'إكس (تويتر)',
      href: `https://twitter.com/intent/tweet?text=${encoded}`,
      icon: Share2,
      className: 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-200',
    },
  ];

  const handleCopy = async (value: string, message: string) => {
    const ok = await copyToClipboard(value);
    ok ? toast.success(message) : toast.error('تعذّر النسخ، انسخ النص يدوياً.');
  };

  return (
    <Modal open={open} onClose={onClose} title="مشاركة المحتوى" description="انشر الرسالة كما هي أو انسخها لتعديلها." size="sm">
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="mt-2 line-clamp-4 text-sm leading-7 text-slate-600">{text}</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {targets.map(({ key, label, href, icon: Icon, className }) => (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-xs font-bold transition ${className}`}
            >
              <Icon className="h-6 w-6" aria-hidden />
              {label}
            </a>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-secondary" onClick={() => handleCopy(payload, 'تم نسخ النص')}>
            <Copy className="h-4 w-4" aria-hidden />
            نسخ النص
          </button>
          <button type="button" className="btn-secondary" onClick={() => handleCopy(shareUrl, 'تم نسخ الرابط')}>
            <Link2 className="h-4 w-4" aria-hidden />
            نسخ رابط الصفحة
          </button>
        </div>
      </div>
    </Modal>
  );
}
