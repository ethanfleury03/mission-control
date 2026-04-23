import { describe, expect, it } from 'vitest';
import {
  deriveBookedFlag,
  isConnectedCall,
  normalizeCallDisposition,
  shouldRetryDisposition,
} from '../dispositions';

describe('normalizeCallDisposition', () => {
  it('maps voicemail disconnections to voicemail', () => {
    expect(
      normalizeCallDisposition({
        disconnection_reason: 'voicemail_reached',
      }),
    ).toBe('voicemail');
  });

  it('detects booked outcomes from the analysis summary', () => {
    const call = {
      call_analysis: {
        call_summary: 'The prospect agreed and booked a fifteen minute call for Tuesday afternoon.',
      },
    };
    expect(normalizeCallDisposition(call)).toBe('booked');
    expect(deriveBookedFlag(call, 'booked')).toBe(true);
  });

  it('detects wrong person and do-not-call phrases', () => {
    expect(
      normalizeCallDisposition({
        call_analysis: {
          call_summary: 'They said this is the wrong person and someone else owns labels.',
        },
      }),
    ).toBe('wrong_person');

    expect(
      normalizeCallDisposition({
        call_analysis: {
          call_summary: 'Please remove me and stop calling this number.',
        },
      }),
    ).toBe('do_not_call');
  });
});

describe('call connection helpers', () => {
  it('treats dial no answer as not connected and retryable', () => {
    expect(
      isConnectedCall({
        disconnection_reason: 'dial_no_answer',
      }),
    ).toBe(false);
    expect(shouldRetryDisposition('no_answer')).toBe(true);
  });
});
