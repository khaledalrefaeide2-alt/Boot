'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FolderInput } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { arabicPlural } from '@/lib/utils';

export interface GroupTarget {
  id: string;
  name: string;
}

interface AssignResponse {
  updated: number;
  skipped: number;
  groupName: string | null;
}

/** عدد الأسماء المعروضة قبل الاختصار — يكفي للتعرّف بلا أن تطول النافذة */
const PREVIEW = 12;

/**
 * إسناد الحسابات المحدَّدة إلى مجموعة واحدة — أو نزع مجموعتها.
 *
 * النافذة تعرض ما سيُنقل قبل النقل لا بعده. والإسناد الجماعي يكتب فوق
 * مجموعة قائمة بلا سؤال، فمعرفة «أيّ حسابات بالضبط» قبل الضغط هي الفرق
 * بين تصحيحٍ مقصود وبين إعادة تصنيف عشرين حساباً لم يكن أحد ينوي لمسها.
 */
export function AssignGroupModal({
  targets,
  groups,
  open,
  onClose,
  onAssigned,
}: {
  targets: GroupTarget[];
  groups: { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const toast = useToast();
  const [groupId, setGroupId] = useState('');
  const [confirmedRemoval, setConfirmedRemoval] = useState(false);

  // كل فتح يبدأ من اختيار فارغ، فلا تُسنَد دفعة إلى مجموعة دفعة سابقة
  useEffect(() => {
    if (!open) return;
    setGroupId('');
    setConfirmedRemoval(false);
  }, [open, targets]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<AssignResponse>('/api/accounts/bulk-group', {
        accountIds: targets.map((target) => target.id),
        groupId: groupId || null,
      }),
    onSuccess: (data) => {
      const plural = arabicPlural(data.updated, {
        one: 'حساب',
        two: 'حساب',
        few: 'حسابات',
        many: 'حساباً',
      });
      toast.success(
        data.groupName ? `أُسنِد إلى ${data.groupName}` : 'نُزعت المجموعة',
        `${data.updated} ${plural}` +
          (data.skipped > 0 ? ` — و${data.skipped} خارج نطاقك لم تُنقل` : ''),
      );
      onAssigned();
      onClose();
    },
    onError: (error) =>
      toast.error('تعذّر الإسناد', error instanceof ApiClientError ? error.message : undefined),
  });

  const plural = arabicPlural(targets.length, {
    one: 'حساب',
    two: 'حساب',
    few: 'حسابات',
    many: 'حساباً',
  });

  const removing = groupId === '';
  const canSubmit = !removing || confirmedRemoval;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="إسناد إلى مجموعة"
      description={`ستُطبَّق على ${targets.length} ${plural} محدَّدة`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            إلغاء
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            loading={mutation.isPending}
          >
            <FolderInput className="h-4 w-4" aria-hidden />
            {removing ? 'نزع المجموعة' : 'إسناد'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="المجموعة"
          value={groupId}
          onChange={(event) => {
            setGroupId(event.target.value);
            setConfirmedRemoval(false);
          }}
          hint="الإسناد يستبدل المجموعة الحالية لكل حساب محدَّد"
        >
          <option value="">— بلا مجموعة (نزع) —</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </Select>

        {/*
          النزع لا يُنفَّذ بخيار افتراضي.
          «بلا مجموعة» هو أول عنصر في القائمة، فمن يفتح النافذة ويضغط
          دون قراءة يقع عليه. والتأكيد الصريح يجعله فعلاً مقصوداً.
        */}
        {removing && (
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-warning/25 bg-warning-soft px-3 py-2">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--warning)]"
              checked={confirmedRemoval}
              onChange={(event) => setConfirmedRemoval(event.target.checked)}
            />
            <span className="text-sm text-warning">
              أؤكّد نزع المجموعة عن هذه الحسابات — ستختفي من تصفية المجموعات حتى تُسنَد من جديد.
            </span>
          </label>
        )}

        {groups.length === 0 && (
          <Alert tone="warning" title="لا توجد مجموعات مفعّلة">
            أنشئ المجموعات أولاً من تهيئة البيانات الأولية.
          </Alert>
        )}

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">الحسابات المحدَّدة</p>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {targets.slice(0, PREVIEW).map((target) => (
              <Badge key={target.id} tone="neutral" size="sm">
                {target.name}
              </Badge>
            ))}
            {targets.length > PREVIEW && (
              <Badge tone="info" size="sm">
                +{targets.length - PREVIEW}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
