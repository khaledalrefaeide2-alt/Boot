'use client';

import { useState } from 'react';
import { AlertTriangle, Bot, RefreshCw, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';

export interface PostAnalysisView {
  stance: string;
  sentiment: string;
  confidence: number;
  rationale: string;
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
}: {
  postId: string;
  analysis: PostAnalysisView | null;
  canAnalyze: boolean;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState(analysis);
  const [busy, setBusy] = useState(false);

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
        title="التحليل الآلي"
        action={
          canAnalyze && (
            <Button size="sm" variant="secondary" onClick={run} loading={busy}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {current ? 'إعادة التحليل' : 'حلّل الآن'}
            </Button>
          )
        }
      />
      <CardBody className="space-y-4">
        {!current ? (
          <p className="text-sm text-muted-foreground">لم يُحلَّل هذا المنشور بعد.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={stance!.tone}>{stance!.label}</Badge>
              <Badge tone={severity!.tone}>{severity!.label}</Badge>
              <span className="num text-xs text-muted-foreground">
                الثقة {Math.round(current.confidence * 100)}%
              </span>
            </div>

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

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">التعليل</p>
              <p className="text-sm leading-relaxed text-foreground">{current.rationale}</p>
            </div>

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
    </Card>
  );
}
