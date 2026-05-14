import crypto from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRetellListCallsPayload,
  getRetellCall,
  listRetellAgents,
  listRetellCalls,
  normalizeRetellListCallsResponse,
  verifyRetellSignature,
} from '../retell';

const ORIGINAL_RETELL_API_KEY = process.env.RETELL_API_KEY;
const ORIGINAL_PHONE_RETELL_API_KEY = process.env.PHONE_RETELL_API_KEY;

function restoreEnv(key: 'RETELL_API_KEY' | 'PHONE_RETELL_API_KEY', value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

afterEach(() => {
  restoreEnv('RETELL_API_KEY', ORIGINAL_RETELL_API_KEY);
  restoreEnv('PHONE_RETELL_API_KEY', ORIGINAL_PHONE_RETELL_API_KEY);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buildRetellListCallsPayload', () => {
  it('builds Retell v3 filter criteria for agent allowlists and pagination', () => {
    expect(
      buildRetellListCallsPayload({
        agentIds: ['agent_1', 'agent_2', 'agent_1', ''],
        lowerThresholdMs: 1714608475945,
        upperThresholdMs: 1714609999999,
        limit: 2000,
        paginationKey: 'next-page',
      }),
    ).toEqual({
      limit: 1000,
      sort_order: 'descending',
      filter_criteria: {
        agent: [{ agent_id: 'agent_1' }, { agent_id: 'agent_2' }],
        start_timestamp: {
          type: 'number',
          op: 'ge',
          value: 1714608475945,
        },
      },
      pagination_key: 'next-page',
    });
  });
});

describe('normalizeRetellListCallsResponse', () => {
  it('reads the v3 cursor pagination envelope', () => {
    expect(
      normalizeRetellListCallsResponse({
        items: [{ call_id: 'call_1' }, null, 'not-a-call'],
        pagination_key: 'next-page',
        has_more: true,
      }),
    ).toEqual({
      calls: [{ call_id: 'call_1' }],
      paginationKey: 'next-page',
      hasMore: true,
    });
  });
});

describe('Retell API client', () => {
  it('posts to v3 list-calls and parses the cursor response', async () => {
    process.env.RETELL_API_KEY = 'test-retell-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ call_id: 'call_1', agent_id: 'agent_1' }],
          pagination_key: 'next-page',
          has_more: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await listRetellCalls({ agentIds: ['agent_1'], limit: 25 });

    expect(result).toEqual({
      calls: [{ call_id: 'call_1', agent_id: 'agent_1' }],
      paginationKey: 'next-page',
      hasMore: true,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.retellai.com/v3/list-calls');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-retell-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      limit: 25,
      sort_order: 'descending',
      filter_criteria: {
        agent: [{ agent_id: 'agent_1' }],
      },
    });
  });

  it('keeps full call hydration on the v2 get-call endpoint', async () => {
    process.env.RETELL_API_KEY = 'test-retell-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ call_id: 'call/one', transcript: 'Agent: hello' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getRetellCall('call/one')).resolves.toEqual({
      call_id: 'call/one',
      transcript: 'Agent: hello',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.retellai.com/v2/get-call/call%2Fone');
  });

  it('loads latest voice agents from the root list-agents endpoint', async () => {
    process.env.RETELL_API_KEY = 'test-retell-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ agent_id: 'agent_1', agent_name: 'Front Desk', version: 4 }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listRetellAgents()).resolves.toEqual([
      { agent_id: 'agent_1', agent_name: 'Front Desk', version: 4 },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.retellai.com/list-agents?limit=1000&is_latest=true',
    );
  });
});

describe('verifyRetellSignature', () => {
  it('accepts current Retell timestamped signatures', () => {
    process.env.RETELL_API_KEY = 'webhook-secret';
    const rawBody = '{"event":"call_started","call":{"call_id":"call_1"}}';
    const timestamp = String(Date.now());
    const digest = crypto
      .createHmac('sha256', 'webhook-secret')
      .update(`${rawBody}${timestamp}`)
      .digest('hex');

    expect(verifyRetellSignature(rawBody, `v=${timestamp},d=${digest}`)).toBe(true);
    expect(verifyRetellSignature(`${rawBody}\n`, `v=${timestamp},d=${digest}`)).toBe(false);
  });

  it('rejects replayed timestamped signatures outside the five minute window', () => {
    process.env.RETELL_API_KEY = 'webhook-secret';
    const rawBody = '{"event":"call_ended","call":{"call_id":"call_1"}}';
    const timestamp = String(Date.now() - 6 * 60 * 1000);
    const digest = crypto
      .createHmac('sha256', 'webhook-secret')
      .update(`${rawBody}${timestamp}`)
      .digest('hex');

    expect(verifyRetellSignature(rawBody, `v=${timestamp},d=${digest}`)).toBe(false);
  });
});
