import { NextResponse } from 'next/server';
import { isAiExtractionAvailable } from '@/lib/directory-scraper/extract-with-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = isAiExtractionAvailable();
  const model = process.env.DIRECTORY_SCRAPER_AI_MODEL ?? 'openai/gpt-4o-mini';
  return NextResponse.json({
    configured,
    model: configured ? model : undefined,
    hint: configured
      ? undefined
      : 'Set OPENROUTER_API_KEY in your .env to enable AI-powered company-name extraction. Get a key at https://openrouter.ai',
  });
}
