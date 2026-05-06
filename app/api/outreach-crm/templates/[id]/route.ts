import { NextResponse } from 'next/server';

import { requireAuth } from '@/app/api/_lib/require-auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPAIGN_NAME = 'Sasha-Outreach';
const MAX_NAME = 120;
const MAX_CATEGORY = 80;
const MAX_SUBJECT = 240;
const MAX_DESCRIPTION = 500;
const MAX_BODY = 20000;

type RouteContext = { params: Promise<{ id: string }> };

function cleanString(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function parseTemplateInput(body: any) {
  const name = cleanString(body?.name, MAX_NAME);
  const category = cleanString(body?.category, MAX_CATEGORY) || 'general';
  const subject = cleanString(body?.subject, MAX_SUBJECT);
  const templateBody = cleanString(body?.body, MAX_BODY);
  const description = cleanString(body?.description, MAX_DESCRIPTION);
  const isActive = typeof body?.isActive === 'boolean' ? body.isActive : true;
  return { name, category, subject, body: templateBody, description, isActive };
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const input = parseTemplateInput(body);
  if (!input.name) {
    return NextResponse.json({ error: 'Template name is required.' }, { status: 400 });
  }
  if (!input.subject && !input.body) {
    return NextResponse.json({ error: 'Add a subject or body before saving.' }, { status: 400 });
  }

  const existing = await prisma.outreachEmailTemplate.findFirst({ where: { id, campaignName: CAMPAIGN_NAME } });
  if (!existing) {
    return NextResponse.json({ error: 'template_not_found' }, { status: 404 });
  }

  const template = await prisma.outreachEmailTemplate.update({
    where: { id },
    data: {
      ...input,
      updatedBy: auth.authed.email,
    },
  });

  return NextResponse.json({ template });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const existing = await prisma.outreachEmailTemplate.findFirst({ where: { id, campaignName: CAMPAIGN_NAME } });
  if (!existing) {
    return NextResponse.json({ error: 'template_not_found' }, { status: 404 });
  }

  await prisma.outreachEmailTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
