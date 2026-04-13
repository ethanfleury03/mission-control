export type CandidateLabel = 'company' | 'not_company' | 'uncertain';

export interface CandidateForAi {
  id: number;
  text: string;
  method: string;
}

export interface ClassificationAiResult {
  labels: Record<number, CandidateLabel>;
}

/**
 * Classify existing candidate strings only. Output keys must be input ids.
 */
export async function classifyCompanyCandidatesWithAi(
  candidates: CandidateForAi[],
): Promise<ClassificationAiResult | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || candidates.length === 0) return null;

  const model = process.env.DIRECTORY_SCRAPER_AI_MODEL?.trim() || 'openai/gpt-4o-mini';
  const supportsJsonFormat =
    model.startsWith('openai/') || model.startsWith('gpt-') || model === 'o1' || model === 'o3-mini';
  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    ...(supportsJsonFormat ? { response_format: { type: 'json_object' } } : {}),
    messages: [
      {
        role: 'system' as const,
        content: `You label pre-extracted text snippets from web pages as likely organization/company names vs not.
Rules:
- Output ONLY JSON: {"labels": {"0":"company"|"not_company"|"uncertain", ...}} using the exact numeric ids as string keys.
- You must not change, paraphrase, or invent any company name strings.
- Only use ids provided in the input.`,
      },
      {
        role: 'user' as const,
        content: JSON.stringify({ candidates }),
      },
    ],
  };

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://arrsys.com',
        'X-Title': 'Arrow Hub Directory Scraper',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { labels?: Record<string, string> };
    const labels: Record<number, CandidateLabel> = {};
    const validIds = new Set(candidates.map((c) => c.id));
    if (parsed.labels && typeof parsed.labels === 'object') {
      for (const [k, v] of Object.entries(parsed.labels)) {
        const id = Number(k);
        if (!validIds.has(id)) continue;
        if (v === 'company' || v === 'not_company' || v === 'uncertain') labels[id] = v;
      }
    }
    return { labels };
  } catch {
    return null;
  }
}
