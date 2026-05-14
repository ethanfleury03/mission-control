import { describe, expect, it } from 'vitest';
import {
  prismaPhoneCallToDomain,
  prismaPhoneRetellAgentToDomain,
} from '../db-mappers';

function date(value: number) {
  return new Date(value);
}

describe('prismaPhoneCallToDomain Retell fields', () => {
  it('maps per-call cost, agent identity, recording links, and analysis flags', () => {
    const call = {
      id: 'phone_call_1',
      providerCallId: 'retell_call_1',
      campaignId: null,
      listId: null,
      listEntryId: null,
      agentProfileKey: 'retell',
      agentId: 'agent_1',
      agentName: 'Front Desk',
      agentVersion: 7,
      callType: 'phone_call',
      direction: 'outbound',
      fromNumber: '+12015550101',
      toNumber: '+12015550102',
      providerStatus: 'ended',
      disposition: 'booked',
      bookedFlag: true,
      summary: 'The lead booked a follow-up.',
      transcript: 'Agent: hello',
      recordingUrl: 'https://retell.example/recording.wav',
      recordingMultiChannelUrl: 'https://retell.example/recording-multi.wav',
      publicLogUrl: 'https://retell.example/public-log',
      knowledgeBaseRetrievedContentsUrl: 'https://retell.example/kb.json',
      disconnectionReason: 'user_hangup',
      userSentiment: 'positive',
      callSuccessful: true,
      inVoicemail: false,
      costCents: 178,
      costJson: JSON.stringify({
        combined_cost: 178,
        total_duration_seconds: 93,
        total_duration_unit_price: 0.116,
        product_costs: [
          {
            product: 'elevenlabs_tts',
            cost: 26,
            unit_price: 0.06,
            is_transfer_leg_cost: false,
          },
        ],
      }),
      dynamicVariablesJson: JSON.stringify({ crm_record_id: 'lead_1' }),
      metadataJson: JSON.stringify({ companyName: 'Acme', contactName: 'Jane', phoneNumber: '+12015550102' }),
      analysisJson: JSON.stringify({ custom_analysis_data: { intent: 'book' } }),
      rawPayloadJson: JSON.stringify({ call_id: 'retell_call_1' }),
      startedAt: date(1714608475945),
      endedAt: date(1714608568945),
      durationMs: 93000,
      createdAt: date(1714608475945),
      updatedAt: date(1714608568945),
    };

    const domain = prismaPhoneCallToDomain(call as Parameters<typeof prismaPhoneCallToDomain>[0]);

    expect(domain).toMatchObject({
      providerCallId: 'retell_call_1',
      agentId: 'agent_1',
      agentName: 'Front Desk',
      agentVersion: 7,
      callType: 'phone_call',
      direction: 'outbound',
      fromNumber: '+12015550101',
      toNumber: '+12015550102',
      phoneNumber: '+12015550102',
      userSentiment: 'positive',
      callSuccessful: true,
      inVoicemail: false,
      costCents: 178,
      recordingMultiChannelUrl: 'https://retell.example/recording-multi.wav',
      publicLogUrl: 'https://retell.example/public-log',
      knowledgeBaseRetrievedContentsUrl: 'https://retell.example/kb.json',
    });
    expect(domain.cost).toEqual({
      combinedCents: 178,
      totalDurationSeconds: 93,
      totalDurationUnitPrice: 0.116,
      productCosts: [
        {
          product: 'elevenlabs_tts',
          costCents: 26,
          unitPrice: 0.06,
          isTransferLegCost: false,
        },
      ],
    });
  });
});

describe('prismaPhoneRetellAgentToDomain', () => {
  it('maps cached Retell voice agents for settings and dashboards', () => {
    const syncedAt = date(1714608475945);
    const domain = prismaPhoneRetellAgentToDomain({
      id: 'agent_cache_1',
      agentId: 'agent_1',
      version: 4,
      agentName: 'Front Desk',
      voiceId: 'retell-Cimo',
      voiceModel: 'eleven_turbo_v2',
      responseEngineJson: JSON.stringify({ type: 'retell-llm', llm_id: 'llm_1' }),
      rawPayloadJson: JSON.stringify({ agent_id: 'agent_1' }),
      isPublished: true,
      lastModifiedAt: date(1714608000000),
      syncedAt,
      createdAt: syncedAt,
      updatedAt: syncedAt,
    } as Parameters<typeof prismaPhoneRetellAgentToDomain>[0]);

    expect(domain).toMatchObject({
      agentId: 'agent_1',
      version: 4,
      agentName: 'Front Desk',
      voiceId: 'retell-Cimo',
      voiceModel: 'eleven_turbo_v2',
      responseEngine: { type: 'retell-llm', llm_id: 'llm_1' },
      isPublished: true,
      syncedAt: syncedAt.toISOString(),
    });
  });
});
