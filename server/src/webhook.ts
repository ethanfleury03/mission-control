/**
 * Send webhook to OpenClaw gateway when registry changes.
 * Does not crash on failure; logs errors.
 */

const WEBHOOK_URL = process.env.MISSION_CONTROL_WEBHOOK_URL?.trim();
const WEBHOOK_SECRET = process.env.MISSION_CONTROL_WEBHOOK_SECRET?.trim();

export function notifyRegistryUpdated(changed: string[]): void {
  if (!WEBHOOK_URL) return;
  const payload = JSON.stringify({
    changed,
    timestamp: new Date().toISOString(),
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload).toString(),
  };
  if (WEBHOOK_SECRET) {
    headers['X-Mission-Control-Secret'] = WEBHOOK_SECRET;
  }
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers,
    body: payload,
  }).catch((err) => {
    console.warn('[mission-control] webhook failed:', err.message);
  });
}
