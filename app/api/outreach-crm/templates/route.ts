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

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const templates = await prisma.outreachEmailTemplate.findMany({
    where: { campaignName: CAMPAIGN_NAME },
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
  });

  return NextResponse.json({ templates }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const input = parseTemplateInput(body);
  if (!input.name) {
    return NextResponse.json({ error: 'Template name is required.' }, { status: 400 });
  }
  if (!input.subject && !input.body) {
    return NextResponse.json({ error: 'Add a subject or body before saving.' }, { status: 400 });
  }

  const template = await prisma.outreachEmailTemplate.create({
    data: {
      ...input,
      campaignName: CAMPAIGN_NAME,
      createdBy: auth.authed.email,
      updatedBy: auth.authed.email,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
