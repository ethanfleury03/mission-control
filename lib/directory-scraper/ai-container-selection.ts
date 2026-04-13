import type { CandidateContainer } from './discover-candidate-containers';

export interface ContainerAiInput {
  id: number;
  selectorPath: string;
  tagName: string;
  textSample: string;
  linkCount: number;
  keywordHits: string[];
  repeatedChildSummary: string;
  score: number;
}

export interface ContainerAiResult {
  chosenIds: number[];
  reasonCodes: string[];
}

/**
 * Optional: pick roster container indices using OpenAI when configured.
 * Must return only ids present in the input; never fabricate DOM.
 */
export async function chooseBestRosterContainersWithAi(containers: ContainerAiInput[]): Promise<ContainerAiResult | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || containers.length === 0) return null;

  const model = process.env.DIRECTORY_SCRAPER_AI_MODEL?.trim() || 'minimax/minimax-m2.7';
  const body = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' as const },
    messages: [
      {
        role: 'system' as const,
        content: `You select which numbered containers are most likely to hold a member/company roster on an association or directory web page.
Rules:
- Output ONLY valid JSON: {"chosenIds": number[], "reasonCodes": string[]}
- chosenIds must be a subset of the provided id values (0..n-1). Max 5 ids.
- Do not invent container ids.
- reasonCodes: short machine tokens (e.g. roster_keywords, high_link_density).`,
      },
      {
        role: 'user' as const,
        content: JSON.stringify({ containers }),
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
    const parsed = JSON.parse(raw) as { chosenIds?: unknown; reasonCodes?: unknown };
    const ids = Array.isArray(parsed.chosenIds)
      ? parsed.chosenIds.filter((x): x is number => typeof x === 'number' && Number.isInteger(x))
      : [];
    const valid = new Set(containers.map((c) => c.id));
    const chosenIds = ids.filter((id) => valid.has(id)).slice(0, 5);
    const reasonCodes = Array.isArray(parsed.reasonCodes)
      ? parsed.reasonCodes.filter((x): x is string => typeof x === 'string').slice(0, 12)
      : [];
    return { chosenIds, reasonCodes };
  } catch {
    return null;
  }
}

export function containersToAiPayload(containers: CandidateContainer[]): ContainerAiInput[] {
  return containers.slice(0, 12).map((c, i) => ({
    id: i,
    selectorPath: c.selectorPath,
    tagName: c.tagName,
    textSample: c.textPreview.slice(0, 400),
    linkCount: c.linkCount,
    keywordHits: c.keywordHits,
    repeatedChildSummary: c.repeatedChildSummary,
    score: c.score,
  }));
}
