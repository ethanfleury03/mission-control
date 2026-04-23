import type { PhoneCallDisposition } from './types';

type RetellCallLike = Record<string, unknown>;

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function lower(value: string): string {
  return value.trim().toLowerCase();
}

export function isConnectedCall(call: RetellCallLike): boolean {
  const disconnectionReason = lower(readString(call.disconnection_reason));
  if (disconnectionReason.startsWith('dial_')) return false;
  if (disconnectionReason === 'voicemail_reached') return false;

  const started = Number(call.start_timestamp ?? 0);
  const duration = Number(call.duration_ms ?? 0);
  return started > 0 || duration > 0;
}

export function normalizeCallDisposition(call: RetellCallLike): PhoneCallDisposition {
  const disconnectionReason = lower(readString(call.disconnection_reason));
  const analysis = readRecord(call.call_analysis);
  const custom = readRecord(analysis.custom_analysis_data);
  const summary = lower(
    readString(analysis.call_summary) ||
      readString(call.call_summary) ||
      readString(call.transcript),
  );

  const explicitDisposition = lower(readString(custom.disposition));
  const allowed: PhoneCallDisposition[] = [
    'booked',
    'callback_requested',
    'wrong_person',
    'voicemail',
    'not_interested',
    'do_not_call',
    'no_answer',
    'busy',
    'failed',
    'unknown',
  ];
  if (allowed.includes(explicitDisposition as PhoneCallDisposition)) {
    return explicitDisposition as PhoneCallDisposition;
  }

  if (custom.booked === true || custom.meeting_booked === true) return 'booked';
  if (analysis.in_voicemail === true || disconnectionReason.includes('voicemail')) return 'voicemail';
  if (disconnectionReason.includes('busy')) return 'busy';
  if (disconnectionReason.includes('no_answer')) return 'no_answer';
  if (disconnectionReason.includes('failed') || lower(readString(call.call_status)) === 'error') return 'failed';

  if (/(remove me|take me off|stop calling|do not call|don't call)/.test(summary)) return 'do_not_call';
  if (/(wrong person|not the right person|someone else handles|someone else owns)/.test(summary)) {
    return 'wrong_person';
  }
  if (/(call back|callback|reach back|another time|later this week|next week works)/.test(summary)) {
    return 'callback_requested';
  }
  if (/(not interested|no interest|not relevant|not a fit|we are all set)/.test(summary)) {
    return 'not_interested';
  }
  if (/(booked|scheduled|calendar invite|put .* calendar|set up .* call|confirmed .* time)/.test(summary)) {
    return 'booked';
  }

  return 'unknown';
}

export function deriveBookedFlag(call: RetellCallLike, disposition: PhoneCallDisposition): boolean {
  if (disposition === 'booked') return true;
  const analysis = readRecord(call.call_analysis);
  const custom = readRecord(analysis.custom_analysis_data);
  if (custom.booked === true || custom.meeting_booked === true) return true;

  const summary = lower(readString(analysis.call_summary) || readString(call.call_summary));
  return /(booked|scheduled|calendar invite|confirmed .* time)/.test(summary);
}

export function shouldRetryDisposition(disposition: PhoneCallDisposition): boolean {
  return disposition === 'no_answer' || disposition === 'busy';
}

export function isConnectedDisposition(disposition: PhoneCallDisposition): boolean {
  return !['no_answer', 'busy', 'failed', 'voicemail'].includes(disposition);
}
