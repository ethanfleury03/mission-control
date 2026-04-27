import { prisma } from '@/lib/prisma';

export interface AuthEventInput {
  type: string;
  actorEmail?: string;
  targetEmail?: string;
  ip?: string;
  userAgent?: string;
  route?: string;
  action?: string;
  detail?: Record<string, unknown>;
}

function safeJson(value: Record<string, unknown> | undefined): string {
  if (!value) return '{}';
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

export function getRequestAuditMeta(request: Request): Pick<AuthEventInput, 'ip' | 'userAgent'> {
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  return {
    ip: forwardedFor.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '',
    userAgent: request.headers.get('user-agent') || '',
  };
}

export async function recordAuthEvent(input: AuthEventInput): Promise<void> {
  try {
    await prisma.authEventLog.create({
      data: {
        type: input.type,
        actorEmail: (input.actorEmail || '').trim().toLowerCase(),
        targetEmail: (input.targetEmail || '').trim().toLowerCase(),
        ip: input.ip || '',
        userAgent: input.userAgent || '',
        route: input.route || '',
        action: input.action || '',
        detailJson: safeJson(input.detail),
      },
    });
  } catch (error) {
    console.warn('Auth audit log write failed', error);
  }
}
