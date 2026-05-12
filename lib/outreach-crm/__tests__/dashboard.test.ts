import { describe, expect, it } from 'vitest';

import { buildMultiAgentOutreachDashboardFromSnapshots, buildOutreachDashboardFromSources, deriveOutreachStage } from '../dashboard';
import type { HubSpotOutreachContact, OutreachAgentConfig, OutreachMembershipSnapshot, OutreachStateSnapshot } from '../types';

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
      active: 2,
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

  it('uses HubSpot membership to decide active, nurture, due, and terminal stages', () => {
    const now = new Date('2026-05-12T15:00:00.000Z');
    const agent: OutreachAgentConfig = {
      id: 'sasha',
      displayName: 'Sasha',
      email: 'sasha@arrsys.com',
      hubspotListName: 'Sasha-Outreach',
      hubspotListId: '102',
      enabled: true,
      dailySendCap: 50,
      sendDelaySeconds: 65,
    };
    const state: OutreachStateSnapshot = {
      generatedAt: now.toISOString(),
      agent,
      sourcePath: '/tmp/sasha/state.json',
      contacts: {
        'active-due@example.com': {
          email: 'active-due@example.com',
          hubspot_contact_id: '1',
          touch_count: 1,
          last_outbound_at: '2026-05-08T14:00:00.000Z',
          next_followup_allowed_at: '2026-05-11T14:00:00.000Z',
          reply_status: 'no_reply',
        },
        'active-future@example.com': {
          email: 'active-future@example.com',
          hubspot_contact_id: '2',
          touch_count: 1,
          last_outbound_at: '2026-05-11T14:00:00.000Z',
          next_followup_allowed_at: '2026-05-14T14:00:00.000Z',
          reply_status: 'no_reply',
        },
        'nurture-due@example.com': {
          email: 'nurture-due@example.com',
          hubspot_contact_id: '3',
          touch_count: 3,
          last_outbound_at: '2026-04-01T14:00:00.000Z',
          next_followup_allowed_at: '2026-05-01T14:00:00.000Z',
          reply_status: 'no_reply',
          nurture_status: 'nurtured',
        },
        'active-touch-three@example.com': {
          email: 'active-touch-three@example.com',
          hubspot_contact_id: '4',
          touch_count: 3,
          last_outbound_at: '2026-05-10T14:00:00.000Z',
          next_followup_allowed_at: '2026-05-11T14:00:00.000Z',
          reply_status: 'no_reply',
        },
        'maxed@example.com': {
          email: 'maxed@example.com',
          hubspot_contact_id: '5',
          touch_count: 4,
          last_outbound_at: '2026-05-01T14:00:00.000Z',
          reply_status: 'no_reply',
        },
        'human@example.com': {
          email: 'human@example.com',
          hubspot_contact_id: '6',
          touch_count: 1,
          last_outbound_at: '2026-05-08T14:00:00.000Z',
          next_followup_allowed_at: '2026-05-11T14:00:00.000Z',
          reply_status: 'needs_review',
          human_review_required: true,
        },
        'ooo@example.com': {
          email: 'ooo@example.com',
          hubspot_contact_id: '7',
          touch_count: 1,
          last_outbound_at: '2026-05-08T14:00:00.000Z',
          next_followup_allowed_at: '2026-05-11T14:00:00.000Z',
          reply_status: 'out_of_office',
        },
      },
    };
    const membership: OutreachMembershipSnapshot = {
      source: 'hubspot_membership',
      fetchedAt: now.toISOString(),
      activeListMemberIdsByAgent: { sasha: ['1', '2', '4', '5', '6', '7'] },
      nurturedListMemberIds: ['3'],
    };

    const dashboard = buildMultiAgentOutreachDashboardFromSnapshots({
      agents: [agent],
      snapshots: [state],
      membership,
      now,
    });
    const byEmail = new Map(dashboard.contacts.map((contact) => [contact.email, contact]));

    expect(byEmail.get('active-due@example.com')).toMatchObject({
      stageId: 'due_3_day_followup',
      campaignBucket: 'active_pool',
      dueNow: true,
    });
    expect(byEmail.get('active-future@example.com')).toMatchObject({
      stageId: 'initial_sent',
      campaignBucket: 'active_pool',
      dueNow: false,
    });
    expect(byEmail.get('nurture-due@example.com')).toMatchObject({
      stageId: 'due_30_day_followup',
      campaignBucket: 'nurture',
      dueNow: true,
    });
    expect(byEmail.get('active-touch-three@example.com')).toMatchObject({
      stageId: 'five_day_followup_sent',
      campaignBucket: 'inconsistent',
      dueNow: false,
    });
    expect(byEmail.get('active-touch-three@example.com')?.diagnostics).toContain('touch_3_plus_still_in_active_list');
    expect(byEmail.get('maxed@example.com')).toMatchObject({ stageId: 'thirty_day_followup_sent' });
    expect(byEmail.get('human@example.com')).toMatchObject({
      stageId: 'replied_needs_review',
      campaignBucket: 'terminal',
      isTerminal: true,
    });
    expect(byEmail.get('ooo@example.com')).toMatchObject({
      stageId: 'out_of_office_paused',
      campaignBucket: 'terminal',
      isTerminal: true,
    });
  });

  it('surfaces canonical membership diagnostics', () => {
    const now = new Date('2026-05-12T15:00:00.000Z');
    const agent: OutreachAgentConfig = {
      id: 'sasha',
      displayName: 'Sasha',
      email: 'sasha@arrsys.com',
      hubspotListName: 'Sasha-Outreach',
      hubspotListId: '102',
      enabled: true,
      dailySendCap: 50,
      sendDelaySeconds: 65,
    };
    const state: OutreachStateSnapshot = {
      generatedAt: now.toISOString(),
      agent,
      contacts: {
        'missing@example.com': {
          email: 'missing@example.com',
          touch_count: 1,
          last_outbound_at: '2026-05-10T14:00:00.000Z',
          reply_status: 'no_reply',
        },
        'conflict@example.com': {
          email: 'conflict@example.com',
          hubspot_contact_id: '9',
          touch_count: 2,
          last_outbound_at: '2026-05-10T14:00:00.000Z',
          next_followup_allowed_at: '2026-05-15T14:00:00.000Z',
          reply_status: 'no_reply',
        },
      },
    };
    const dashboard = buildMultiAgentOutreachDashboardFromSnapshots({
      agents: [agent],
      snapshots: [state],
      membership: {
        source: 'hubspot_membership',
        fetchedAt: now.toISOString(),
        activeListMemberIdsByAgent: { sasha: ['9'] },
        nurturedListMemberIds: ['9'],
      },
      now,
    });
    const byEmail = new Map(dashboard.contacts.map((contact) => [contact.email, contact]));

    expect(byEmail.get('missing@example.com')?.diagnostics).toContain('missing_hubspot_id');
    expect(byEmail.get('conflict@example.com')?.diagnostics).toContain('active_and_nurtured_membership_conflict');
    expect(byEmail.get('conflict@example.com')?.campaignBucket).toBe('inconsistent');
    expect(dashboard.diagnostics?.total).toBe(2);
    expect(dashboard.audit?.inconsistent).toBe(1);
  });

  it('does not require event arrays when deriving a row-shaped contact stage', () => {
    const now = new Date('2026-05-12T15:00:00.000Z');

    expect(
      deriveOutreachStage(
        {
          email: 'row-shaped@example.com',
          touchCount: 1,
          lastOutboundAt: '2026-05-08T14:00:00.000Z',
          nextFollowupAllowedAt: '2026-05-11T14:00:00.000Z',
          replyStatus: 'no_reply',
          positiveReply: false,
          humanReviewRequired: false,
          stopped: false,
          stopReason: '',
          bounceReason: '',
          status: '',
          isEligible: true,
          ineligibilityReasons: [],
        } as any,
        now,
      ),
    ).toBe('Due: 3-Day Follow-Up');
  });
});
