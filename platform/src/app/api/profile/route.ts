import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonError, jsonOk, parseBody, requireAuth, requireCsrf } from '@/lib/api';
import { updateProfileSchema } from '@/lib/validation/auth';

export async function GET() {
  try {
    const user = await requireAuth();
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        jobTitle: true,
        phone: true,
        lastLoginAt: true,
        createdAt: true,
        mustChangePassword: true,
      },
    });
    return jsonOk({ profile, permissions: user.permissions });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth();
    await requireCsrf();
    const input = await parseBody(request, updateProfileSchema);

    const profile = await prisma.user.update({
      where: { id: user.id },
      data: { name: input.name, jobTitle: input.jobTitle, phone: input.phone },
      select: { id: true, name: true, jobTitle: true, phone: true },
    });

    return jsonOk({ profile });
  } catch (error) {
    return jsonError(error);
  }
}
