'use client';

import { useState } from 'react';
import { AlertTriangle, Bot, GraduationCap, RefreshCw, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { SENTIMENT_LABELS, SENTIMENT_TONE, STANCE_METRIC } from '@/lib/domain/constants';
import { CorrectionModal } from './correction-modal';

export interface PostAnalysisView {
  stance: string;
  sentiment: string;
  confidence: number;
  rationale: string;
  target: string | null;
  subject: string | null;
  evidence: string | null;
  isMixed: boolean;
  isRelayedCriticism: boolean;
  reviewReason: string | null;
  themes: string[];
  riskFlags: string[];
  riskSeverity: string;
  needsReview: boolean;
  model: string;
  createdAt: string;
}

const STANCE: Record<string, { label: string; tone: 'success' | 'danger' | 'neutral' | 'warning' }> = {
  SUPPORTIVE: { label: 'مؤيّد لسياسات الدولة', tone: 'success' },
  OPPOSED: { label: 'معارض لسياسات الدولة', tone: 'warning' },
  NEUTRAL: { label: 'محايد', tone: 'neutral' },
  MIXED: { label: 'مختلط', tone: 'neutral' },
  UNCLEAR: { label: 'غير واضح', tone: 'neutral' },
};

const RISK: Record<string, string> = {
  INCITEMENT_VIOLENCE: 'تحريض على العنف',
  SECTARIAN_REGIONAL: 'نفس طائفي أو مناطقي',
  HATE_SPEECH: 'خطاب كراهية',
  THREAT: 'تهديد',
  PLATFORM_POLICY: 'مخالفة معايير المنصات',
};

const SEVERITY: Record<string, { label: string; tone: 'danger' | 'warning' | 'neutral' }> = {
  HIGH: { label: 'خطورة عالية', tone: 'danger' },
  MEDIUM: { label: 'خطورة متوسطة', tone: 'warning' },
  LOW: { label: 'خطورة منخفضة', tone: 'warning' },
  NONE: { label: 'بلا إشارات', tone: 'neutral' },
};

/**
 * لوحة تحليل المنشور.
 *
 * الثقة والتعليل يُعرضان دائماً بجانب الحكم لا خلف زرّ.
 *
 * والسبب أن الحكم بلا دليله يُقرأ كحقيقة: «معارض» وحدها تُنقل وتُبنى
 * عليها قرارات، و«معارض (ثقة 48%) لأن النصّ ساخر ويحتمل المعنيين» تُراجَع.
 * وهذا الفرق هو كلّ الفرق بين أداة تحليل وأداة وسم.
 */
export function AnalysisPanel({
  postId,
  analysis,
  canAnalyze,
  canCorrect,
}: {
  postId: string;
  analysis: PostAnalysisView | null;
  canAnalyze: boolean;
  canCorrect: boolean;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState(analysis);
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const data = await api.post<{ analysis: PostAnalysisView }>(
        `/api/posts/${postId}/analyze`,
        {},
      );
      setCurrent({ ...data.analysis, model: '—', createdAt: new Date().toISOString() });
      toast.success('اكتمل التحليل');
    } catch (error) {
      toast.error(
        'تعذّر التحليل',
        error instanceof ApiClientError ? error.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  const stance = current ? (STANCE[current.stance] ?? STANCE.UNCLEAR!) : null;
  const severity = current ? (SEVERITY[current.riskSeverity] ?? SEVERITY.NONE!) : null;

  return (
    <Card>
      <CardHeader
        title="التصنيف الآلي"
        action={
          <div className="flex items-center gap-2">
            {canCorrect && current && (
              <Button size="sm" variant="secondary" onClick={() => setCorrecting(true)}>
                <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                صحّح وعلّم
              </Button>
            )}
            {canAnalyze && (
              <Button size="sm" variant="secondary" onClick={run} loading={busy}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                {current ? 'إعادة التحليل' : 'حلّل الآن'}
              </Button>
            )}
          </div>
        }
      />
      <CardBody className="space-y-4">
        {!current ? (
          <p className="text-sm text-muted-foreground">لم يُحلَّل هذا المنشور بعد.</p>
        ) : (
          <>
            {/*
              التصنيف يتصدّر لا الموقف.

              هو المؤشّر الذي تقيسه السياسة وتعرضه التقارير، والموقف
              مشتقٌّ منه. وكان الموقف وحده في الصدارة، فيقرأ المراجع
              «معارض لسياسات الدولة» عن منشور يشكو انقطاع المياه — وهي
              عبارة أثقل بكثير ممّا في النصّ.
            */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  SENTIMENT_TONE[current.sentiment as keyof typeof SENTIMENT_TONE] ?? 'neutral'
                }
              >
                {SENTIMENT_LABELS[current.sentiment as keyof typeof SENTIMENT_LABELS] ??
                  current.sentiment}
              </Badge>
              {current.isMixed && (
                <Badge tone="warning" size="sm">
                  محتوى مختلط
                </Badge>
              )}
              {current.isRelayedCriticism && (
                <Badge tone="info" size="sm">
                  نقل نقد
                </Badge>
              )}
              <Badge tone={stance!.tone} size="sm">
                {stance!.label}
              </Badge>
              <Badge tone={severity!.tone} size="sm">
                {severity!.label}
              </Badge>
              <span className="num text-xs text-muted-foreground">
                الثقة {Math.round(current.confidence * 100)}%
              </span>
            </div>

            <p className="text-2xs leading-relaxed text-subtle-foreground">
              {STANCE_METRIC.caveat}
            </p>

            {/*
              تنبيه الثقة المنخفضة صريح لا مضمر في رقم.
              قارئ الشاشة يمرّ على «48%» فلا يتوقّف؛ والجملة توقفه.
            */}
            {current.confidence < 0.6 && (
              <p className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                ثقة منخفضة — هذا التصنيف ترجيح لا نتيجة، ويحتاج قراءة بشرية.
              </p>
            )}

            {current.reviewReason && (
              <p className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {current.reviewReason}
              </p>
            )}

            {current.riskFlags.length > 0 && (
              <div className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2.5">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-danger">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                  إشارات محتوى ضارّ
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {current.riskFlags.map((flag) => (
                    <li key={flag}>
                      <Badge tone="danger" size="sm">
                        {RISK[flag] ?? flag}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-2xs leading-relaxed text-danger">
                  هذه ملاحظات على النصّ لا أحكام. القرار في شاشة المراجعة.
                </p>
              </div>
            )}

            {(current.target || current.subject) && (
              <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
                {current.target && (
                  <>
                    <dt className="text-xs font-medium text-muted-foreground">الجهة المستهدفة</dt>
                    <dd className="text-foreground">{current.target}</dd>
                  </>
                )}
                {current.subject && (
                  <>
                    <dt className="text-xs font-medium text-muted-foreground">الموضوع</dt>
                    <dd className="text-foreground">{current.subject}</dd>
                  </>
                )}
              </dl>
            )}

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">سبب التصنيف</p>
              <p className="text-sm leading-relaxed text-foreground">{current.rationale}</p>
            </div>

            {/*
              الدليل مقتطفٌ حرفيّ تُحقَّق مطابقتُه لنصّ المنشور قبل الحفظ.
              وما لم يطابق لا يصل إلى هنا أصلاً — فما يُعرض بين قوسين
              مقروءٌ في المنشور لا مصوغٌ من النموذج.
            */}
            {current.evidence && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">الدليل من النصّ</p>
                <blockquote className="border-s-2 border-primary/40 ps-3 text-sm leading-relaxed text-foreground">
                  «{current.evidence}»
                </blockquote>
              </div>
            )}

            {current.themes.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">الموضوعات</p>
                <ul className="flex flex-wrap gap-1.5">
                  {current.themes.map((theme) => (
                    <li key={theme}>
                      <Badge tone="neutral" size="sm">
                        {theme}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="flex items-center gap-1.5 border-t border-border pt-3 text-2xs text-subtle-foreground">
              <Bot className="h-3 w-3" aria-hidden />
              تحليل آلي بنموذج {current.model} — يُراجَع ولا يُعتمد وحده في أي إجراء.
            </p>
          </>
        )}
      </CardBody>

      <CorrectionModal
        postId={postId}
        open={correcting}
        current={
          current
            ? {
                stance: current.stance,
                sentiment: current.sentiment,
                riskFlags: current.riskFlags,
              }
            : null
        }
        onClose={() => setCorrecting(false)}
        onSaved={() => {
          // الصفحة تُعاد قراءتها من الخادم، فيظهر التصحيح موسوماً يدوياً
          window.location.reload();
        }}
      />
    </Card>
  );
}
