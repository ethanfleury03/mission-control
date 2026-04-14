import { cookies } from 'next/headers';

/** Cookie set by the hub UI when user disables OpenClaw polling (mirrors DISABLE_OPENCLAW behavior). */
export const OPENCLAW_OFF_COOKIE = 'mc_openclaw_off';

export function envOpenClawDisabled(): boolean {
  return process.env.DISABLE_OPENCLAW === '1' || process.env.DISABLE_OPENCLAW === 'true';
}

/** True when OpenClaw should be skipped: env var or client cookie. */
export async function isOpenClawDisabledForRequest(): Promise<boolean> {
  if (envOpenClawDisabled()) return true;
  const jar = await cookies();
  return jar.get(OPENCLAW_OFF_COOKIE)?.value === '1';
}
