import { afterEach, describe, expect, it } from 'vitest';
import { evaluateOutreachActionGuardrails, type OutreachGuardrailContact } from '../guardrails';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function contact(overrides: Partial<OutreachGuardrailContact> = {}): OutreachGuardrailContact {
  return {
    id: 'contact_1',
    email: 'maya@example.com',
    name: 'Maya Chen',
    company: 'Northstar Dealer Group',
    active: true,
    inSourceList: true,
    ownerId: '',
    assignedTo: '',
    stopped: false,
    touchCount: 0,
    ...overrides,
  };
}

describe('Outreach CRM send guardrails', () => {
  it('blocks proactive sends when the contact is removed from the HubSpot source list', () => {
    const decision = evaluateOutreachActionGuardrails({
      actionType: 'send_first_touch',
      contact: contact({ inSourceList: false }),
      now: new Date('2026-05-05T16:00:00.000Z'),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockedReasons).toContain('contact_not_in_configured_outreach_list');
  });

  it('blocks assigned or owned HubSpot contacts', () => {
    const decision = evaluateOutreachActionGuardrails({
      actionType: 'send_first_touch',
      contact: contact({ ownerId: '123', assignedTo: 'ethan' }),
      now: new Date('2026-05-05T16:00:00.000Z'),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockedReasons).toEqual(
      expect.arrayContaining(['hubspot_owner_id_must_be_empty', 'assigned_to_must_be_empty']),
    );
  });

  it('requires Shaan on CC when a caller supplies the send envelope', () => {
    const decision = evaluateOutreachActionGuardrails({
      actionType: 'send_first_touch',
      contact: contact(),
      ccEmails: ['ethan@arrsys.com'],
      now: new Date('2026-05-05T16:00:00.000Z'),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockedReasons).toContain('required_shaan_cc_missing');
  });

  it('blocks first touches after the conservative daily cap', () => {
    process.env.OUTREACH_CRM_FIRST_TOUCH_DAILY_CAP = '10';
    const decision = evaluateOutreachActionGuardrails({
      actionType: 'send_first_touch',
      contact: contact(),
      firstTouchesToday: 10,
      now: new Date('2026-05-05T16:00:00.000Z'),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockedReasons).toContain('first_touch_daily_cap_reached');
  });

  it('allows a due follow-up inside the run cap', () => {
    const decision = evaluateOutreachActionGuardrails({
      actionType: 'send_followup',
      contact: contact({
        touchCount: 1,
        lastOutboundAt: '2026-04-30T19:00:00.000Z',
        nextFollowupAllowedAt: '2026-05-04T19:00:00.000Z',
      }),
      followupsThisRun: 4,
      now: new Date('2026-05-05T16:00:00.000Z'),
    });

    expect(decision.allowed).toBe(true);
  });

  it('marks sensitive replies as human-review instead of sendable', () => {
    const decision = evaluateOutreachActionGuardrails({
      actionType: 'send_reply',
      contact: contact({
        touchCount: 1,
        lastReplyAt: '2026-05-05T14:00:00.000Z',
        replyStatus: 'pricing/legal unclear',
        lastReplySnippet: 'Can you clarify pricing and legal terms?',
      }),
      now: new Date('2026-05-05T16:00:00.000Z'),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.needsHuman).toBe(true);
    expect(decision.blockedReasons).toContain('reply_needs_human');
  });

  it('allows safe positive replies through the ask-availability flow', () => {
    const decision = evaluateOutreachActionGuardrails({
      actionType: 'send_reply',
      contact: contact({
        touchCount: 1,
        positiveReply: true,
        lastReplyAt: '2026-05-05T14:00:00.000Z',
        replyStatus: 'positive',
        lastReplySnippet: 'Yes, interested in a quick walkthrough next week.',
      }),
      now: new Date('2026-05-05T16:00:00.000Z'),
    });

    expect(decision.allowed).toBe(true);
  });

  it('allows read-only deep sync without requiring a contact or send envelope', () => {
    const decision = evaluateOutreachActionGuardrails({
      actionType: 'deep_sync',
      now: new Date('2026-05-05T16:00:00.000Z'),
    });

    expect(decision.allowed).toBe(true);
    expect(decision.blockedReasons).toEqual([]);
  });
});
