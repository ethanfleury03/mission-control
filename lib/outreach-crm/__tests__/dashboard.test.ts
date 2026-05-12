import { describe, expect, it } from 'vitest';

import { buildOutreachDashboardFromSources } from '../dashboard';
import type { HubSpotOutreachContact, OutreachStateSnapshot } from '../types';

describe('Outreach CRM dashboard derivation', () => {
  it('merges HubSpot identity with Sasha outreach state and derives KPIs', () => {
    const now = new Date('2026-05-05T16:00:00.000Z');
    const hubspotContacts: HubSpotOutreachContact[] = [
      {
        id: '101',
        properties: {
          email: 'active@example.com',
          firstname: 'Avery',
          lastname: 'Active',
          company: 'HubSpot Company',
          jobtitle: 'Operations Lead',
          lastmodifieddate: '2026-05-05T14:00:00.000Z',
        },
      },
    ];
    const state: OutreachStateSnapshot = {
      generatedAt: '2026-05-05T15:00:00.000Z',
      contacts: {
        'active@example.com': {
          email: 'active@example.com',
          company: 'State Company',
          touch_count: 1,
          sent_at: '2026-05-04T19:00:00.000Z',
          last_outbound_at: '2026-05-04T19:00:00.000Z',
          next_followup_allowed_at: '2026-05-07T19:00:00.000Z',
        },
        'bounce@example.com': {
          email: 'bounce@example.com',
          name: 'Bo Bounce',
          company: 'Bounce Co',
          touch_count: 1,
          sent_at: '2026-05-04T19:00:00.000Z',
          reply_status: 'bounce',
          last_reply_at: '2026-05-04T20:00:00.000Z',
          last_reply_snippet: 'Recipient address rejected.',
          stopped: true,
          stop_reason: 'bounce/undeliverable detected',
        },
        'positive@example.com': {
          email: 'positive@example.com',
          name: 'Pat Positive',
          company: 'Positive Co',
          touch_count: 1,
          sent_at: '2026-05-04T19:00:00.000Z',
          positive_reply: true,
          last_reply_at: '2026-05-05T13:00:00.000Z',
          last_reply_snippet: 'Yes, interested in a quick walkthrough next week.',
        },
        'due@example.com': {
          email: 'due@example.com',
          name: 'Dee Due',
          company: 'Due Co',
          touch_count: 1,
          sent_at: '2026-04-30T19:00:00.000Z',
          last_outbound_at: '2026-04-30T19:00:00.000Z',
          next_followup_allowed_at: '2026-05-04T19:00:00.000Z',
        },
      },
    };

    const dashboard = buildOutreachDashboardFromSources({ hubspotContacts, state, now });

    expect(dashboard.source).toBe('hubspot+state');
    expect(dashboard.kpis).toMatchObject({
      totalContacts: 4,
      active: 3,
      initialSent: 4,
      replies: 2,
      positive: 1,
      bouncedStopped: 1,
      dueFollowUp: 1,
    });
    expect(dashboard.replyRate).toBe(50);
    expect(dashboard.followUpHealth).toMatchObject({
      dueToday: 1,
      scheduled: 1,
      needsReview: 0,
      blocked: 1,
      severity: 'warning',
    });
    expect(dashboard.contacts.find((contact) => contact.email === 'active@example.com')).toMatchObject({
      hubspotContactId: '101',
      name: 'Avery Active',
      company: 'HubSpot Company',
      stage: 'Initial Sent',
    });
    expect(dashboard.contacts.find((contact) => contact.email === 'due@example.com')?.stage).toBe(
      'Due: 3-Day Follow-Up',
    );
    expect(dashboard.replies.map((reply) => reply.status)).toEqual(['Positive', 'Bounced']);
  });

  it('does not count no-reply activity as replies or reply rate', () => {
    const now = new Date('2026-05-05T16:00:00.000Z');
    const state: OutreachStateSnapshot = {
      generatedAt: '2026-05-05T15:00:00.000Z',
      contacts: {
        'sent@example.com': {
          email: 'sent@example.com',
          touch_count: 1,
          sent_at: '2026-05-04T19:00:00.000Z',
          reply_status: 'no_reply',
        },
        'placeholder-review@example.com': {
          email: 'placeholder-review@example.com',
          touch_count: 1,
          sent_at: '2026-05-04T19:00:00.000Z',
          reply_status: 'needs_review',
        },
        'actual-reply@example.com': {
          email: 'actual-reply@example.com',
          touch_count: 1,
          sent_at: '2026-05-04T19:00:00.000Z',
          reply_status: 'out_of_office',
          last_reply_at: '2026-05-05T13:00:00.000Z',
          last_reply_snippet: 'I am out of office this week.',
        },
      },
    };

    const dashboard = buildOutreachDashboardFromSources({ hubspotContacts: [], state, now });

    expect(dashboard.kpis.initialSent).toBe(3);
    expect(dashboard.kpis.replies).toBe(1);
    expect(dashboard.replyRate).toBe(33.3);
    expect(dashboard.replies.map((reply) => reply.email)).toEqual(['actual-reply@example.com']);
    expect(dashboard.followUpHealth.needsReview).toBe(0);
  });

  it('keeps already-touched owner-assigned contacts in the four-touch lifecycle stages', () => {
    const now = new Date('2026-05-12T15:00:00.000Z');
    const state: OutreachStateSnapshot = {
      generatedAt: '2026-05-12T15:00:00.000Z',
      contacts: {
        'followed-up@example.com': {
          email: 'followed-up@example.com',
          touch_count: 2,
          last_outbound_at: '2026-05-11T20:28:23.545Z',
          next_followup_allowed_at: '2026-05-16T20:28:23.545Z',
          reply_status: 'no_reply',
          hubspot_owner_id: '161787514',
          hs_all_owner_ids: '161787514',
        },
        'due-owner@example.com': {
          email: 'due-owner@example.com',
          touch_count: 1,
          last_outbound_at: '2026-05-08T15:00:00.000Z',
          next_followup_allowed_at: '2026-05-11T15:00:00.000Z',
          reply_status: 'no_reply',
          hubspot_owner_id: '161787514',
        },
      },
    };

    const dashboard = buildOutreachDashboardFromSources({ hubspotContacts: [], state, now });

    expect(dashboard.contacts.find((contact) => contact.email === 'followed-up@example.com')).toMatchObject({
      stage: '3-Day Follow-Up Sent',
      stageId: 'three_day_followup_sent',
    });
    expect(dashboard.contacts.find((contact) => contact.email === 'due-owner@example.com')).toMatchObject({
      stage: 'Due: 3-Day Follow-Up',
      stageId: 'due_3_day_followup',
    });
    expect(dashboard.pipelineColumns?.find((column) => column.id === 'three_day_followup_sent')?.count).toBe(1);
    expect(dashboard.pipelineColumns?.find((column) => column.id === 'due_3_day_followup')?.count).toBe(1);
  });
});
