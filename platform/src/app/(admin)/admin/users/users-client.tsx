'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, KeyRound, Plus, Search, ShieldOff, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Alert } from '@/components/ui/alert';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { ROLE_LABELS } from '@/lib/auth/rbac';
import { USER_STATUS_LABELS } from '@/lib/domain/constants';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';
import type { Role, UserStatus } from '@/generated/prisma';
import { UserFormModal } from './user-form-modal';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  jobTitle: string | null;
  phone: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  mustChangePassword: boolean;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  pendingCount: number;
}

const STATUS_TONE = {
  PENDING: 'warning',
  ACTIVE: 'success',
  DISABLED: 'danger',
} as const;

const ROLE_TONE = {
  OWNER: 'primary',
  ADMIN: 'info',
  SUPERVISOR: 'neutral',
  VIEWER: 'neutral',
} as const;

export function UsersClient({
  canCreate,
  canUpdate,
  canApprove,
  assignable,
  currentUserId,
}: {
  canCreate: boolean;
  canUpdate: boolean;
  canApprove: boolean;
  assignable: Role[];
  currentUserId: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [disableTarget, setDisableTarget] = useState<UserRow | null>(null);
  const [resetLink, setResetLink] = useState<{ name: string; url: string } | null>(null);

  const pageSize = 25;

  const query = useQuery({
    queryKey: ['admin-users', page, search, roleFilter, statusFilter],
    queryFn: () =>
      api.get<UsersResponse>(
        buildQuery('/api/admin/users', {
          page,
          pageSize,
          q: search,
          role: roleFilter,
          status: statusFilter,
        }),
      ),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      api.patch(`/api/admin/users/${id}`, { status }),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.status === 'ACTIVE' ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب',
      );
      setDisableTarget(null);
      void invalidate();
    },
    onError: (error) =>
      toast.error('تعذّر تنفيذ العملية', error instanceof ApiClientError ? error.message : undefined),
  });

  const resetMutation = useMutation({
    mutationFn: (user: UserRow) =>
      api.post<{ resetPath: string; expiresInMinutes: number }>(
        `/api/admin/users/${user.id}/reset-link`,
      ),
    onSuccess: (data, user) => {
      setResetLink({ name: user.name, url: `${window.location.origin}${data.resetPath}` });
      void invalidate();
    },
    onError: (error) =>
      toast.error('تعذّر توليد الرابط', error instanceof ApiClientError ? error.message : undefined),
  });

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  const data = query.data;

  return (
    <>
      <PageHeader
        title="إدارة المستخدمين"
        description="الحسابات تُنشأ يدوياً — لا يوجد تسجيل ذاتي في النظام"
        action={
          canCreate && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              مستخدم جديد
            </Button>
          )
        }
      />

      {data && data.pendingCount > 0 && statusFilter !== 'PENDING' && (
        <Alert tone="warning" className="mb-4">
          يوجد <span className="num font-semibold">{data.pendingCount}</span> مستخدم بانتظار
          الموافقة.{' '}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => {
              setStatusFilter('PENDING');
              setPage(1);
            }}
          >
            عرضهم الآن
          </button>
        </Alert>
      )}

      <Card>
        <form
          onSubmit={applySearch}
          className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3"
        >
          <Input
            wrapperClassName="min-w-52 flex-1"
            label="بحث"
            placeholder="الاسم أو البريد أو المسمى الوظيفي"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Select
            wrapperClassName="w-40"
            label="الدور"
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الأدوار</option>
            {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
          <Select
            wrapperClassName="w-40"
            label="الحالة"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            {(Object.keys(USER_STATUS_LABELS) as UserStatus[]).map((status) => (
              <option key={status} value={status}>
                {USER_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            <Search className="h-4 w-4" aria-hidden />
            بحث
          </Button>
        </form>

        {query.isPending ? (
          <SkeletonRows rows={6} />
        ) : query.isError ? (
          <ErrorState
            description={
              query.error instanceof ApiClientError ? query.error.message : 'تعذّر جلب المستخدمين'
            }
            action={
              <Button variant="secondary" onClick={() => query.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : !data || data.users.length === 0 ? (
          <EmptyState
            title="لا يوجد مستخدمون مطابقون"
            description="غيّر معايير البحث أو أنشئ مستخدماً جديداً"
            icon={Plus}
            action={
              canCreate && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  إنشاء مستخدم
                </Button>
              )
            }
          />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>المستخدم</TH>
                    <TH>الدور</TH>
                    <TH>الحالة</TH>
                    <TH>آخر دخول</TH>
                    <TH>تاريخ الإنشاء</TH>
                    <TH className="text-end">إجراءات</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.users.map((user) => (
                    <TR key={user.id}>
                      <TD>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{user.name}</p>
                          <p className="ltr truncate text-xs text-muted-foreground">{user.email}</p>
                          {user.jobTitle && (
                            <p className="truncate text-xs text-subtle-foreground">{user.jobTitle}</p>
                          )}
                        </div>
                      </TD>
                      <TD>
                        <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[user.status]}>
                          {USER_STATUS_LABELS[user.status]}
                        </Badge>
                      </TD>
                      <TD className="text-xs text-muted-foreground">
                        {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : 'لم يدخل بعد'}
                      </TD>
                      <TD className="text-xs text-muted-foreground">
                        {formatDateTime(user.createdAt)}
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          {canApprove && user.status === 'PENDING' && (
                            <Button
                              size="sm"
                              variant="soft"
                              onClick={() =>
                                statusMutation.mutate({ id: user.id, status: 'ACTIVE' })
                              }
                              loading={
                                statusMutation.isPending && statusMutation.variables?.id === user.id
                              }
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                              موافقة
                            </Button>
                          )}
                          {canUpdate && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setEditing(user);
                                  setFormOpen(true);
                                }}
                              >
                                تعديل
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="توليد رابط استعادة كلمة المرور"
                                onClick={() => resetMutation.mutate(user)}
                                loading={
                                  resetMutation.isPending && resetMutation.variables?.id === user.id
                                }
                              >
                                <KeyRound className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                              {user.status !== 'DISABLED' && user.id !== currentUserId && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-danger"
                                  title="تعطيل الحساب"
                                  onClick={() => setDisableTarget(user)}
                                >
                                  <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                                </Button>
                              )}
                              {user.status === 'DISABLED' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    statusMutation.mutate({ id: user.id, status: 'ACTIVE' })
                                  }
                                >
                                  تفعيل
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <UserFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        assignable={assignable}
        onSaved={() => {
          setFormOpen(false);
          void invalidate();
        }}
      />

      <ConfirmDialog
        open={Boolean(disableTarget)}
        onClose={() => setDisableTarget(null)}
        onConfirm={() =>
          disableTarget && statusMutation.mutate({ id: disableTarget.id, status: 'DISABLED' })
        }
        title="تعطيل الحساب"
        message={`سيتم تعطيل حساب ${disableTarget?.name ?? ''} وإنهاء جلساته فوراً. يمكن تفعيله لاحقاً.`}
        confirmLabel="تعطيل"
        loading={statusMutation.isPending}
      />

      <Modal
        open={Boolean(resetLink)}
        onClose={() => setResetLink(null)}
        title="رابط استعادة كلمة المرور"
        description={`سلّم هذا الرابط إلى ${resetLink?.name ?? ''} بقناة موثوقة`}
        footer={
          <Button
            onClick={() => {
              if (resetLink) void navigator.clipboard.writeText(resetLink.url);
              toast.success('نُسخ الرابط');
            }}
          >
            نسخ الرابط
          </Button>
        }
      >
        <div className="space-y-3">
          <Alert tone="warning">
            الرابط صالح لمدة ساعة واحدة ويُستخدم مرة واحدة فقط. لن يظهر مرة أخرى بعد إغلاق النافذة.
          </Alert>
          <p className="ltr break-all rounded-md border border-border bg-surface-2 p-3 text-xs">
            {resetLink?.url}
          </p>
        </div>
      </Modal>
    </>
  );
}
