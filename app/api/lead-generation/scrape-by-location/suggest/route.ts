import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fallbackSuggestions(prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes('cannabis')) {
    return {
      keywords: ['cannabis cultivator', 'cannabis producer', 'cannabis co packer', 'cannabis contract manufacturer', 'cannabis packaging'],
      regions: ['Toronto ON', 'Mississauga ON', 'Brampton ON', 'Hamilton ON', 'Kitchener ON'],
      source: 'fallback',
    };
  }
  return {
    keywords: ['digital label printer', 'label converter', 'packaging printer', 'commercial label printing', 'flexographic label printer', 'label manufacturer', 'packaging converter'],
    regions: ['Toronto ON', 'Mississauga ON', 'Brampton ON', 'Hamilton ON', 'Kitchener ON'],
    source: 'fallback',
  };
}

function extractJson(text: string) {
  const stripped = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
  return JSON.parse(stripped);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json(fallbackSuggestions(prompt));

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'x-title': 'Mission Control Lead Gen',
      },
      body: JSON.stringify({
        model: process.env.LEAD_GEN_AI_MODEL ?? process.env.RAG_LLM_MODEL ?? 'openai/gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content:
              'Return JSON only. Suggest concise Places/Maps search keywords and practical regions for B2B lead scraping. Shape: {"keywords":["..."],"regions":["..."]}. Keep keywords specific and not more than 10.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('empty model response');
    const parsed = extractJson(content);
    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 10) : [];
    const regions = Array.isArray(parsed.regions) ? parsed.regions.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 10) : [];
    if (keywords.length === 0 || regions.length === 0) throw new Error('missing fields');
    return NextResponse.json({ keywords, regions, source: 'openrouter' });
  } catch {
    return NextResponse.json(fallbackSuggestions(prompt));
  }
}
