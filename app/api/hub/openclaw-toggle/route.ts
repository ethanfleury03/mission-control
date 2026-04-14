import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  envOpenClawDisabled,
  isOpenClawDisabledForRequest,
  OPENCLAW_OFF_COOKIE,
} from '../../_lib/is-openclaw-disabled';

const COOKIE_OPTS = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax' as const,
  httpOnly: false,
};

/** GET: current OpenClaw hub disable state (env + optional client cookie). */
export async function GET() {
  const jar = await cookies();
  const clientDisabled = jar.get(OPENCLAW_OFF_COOKIE)?.value === '1';
  const envDisabled = envOpenClawDisabled();
  return NextResponse.json({
    off: envDisabled || clientDisabled,
    envDisabled,
    clientDisabled,
  });
}

/** POST body: { off: boolean } — set/clear client cookie (ignored if env already disables). */
export async function POST(request: Request) {
  if (envOpenClawDisabled()) {
    return NextResponse.json(
      { error: 'OpenClaw is disabled by DISABLE_OPENCLAW env; toggle has no effect.', off: true, envDisabled: true },
      { status: 409 }
    );
  }

  let off = false;
  try {
    const body = await request.json();
    off = body?.off === true || body?.off === 'true' || body?.off === 1;
  } catch {
    /* empty body */
  }

  const jar = await cookies();
  if (off) {
    jar.set(OPENCLAW_OFF_COOKIE, '1', COOKIE_OPTS);
  } else {
    jar.delete(OPENCLAW_OFF_COOKIE);
  }

  const combined = await isOpenClawDisabledForRequest();
  return NextResponse.json({ off: combined, envDisabled: false, clientDisabled: off });
}
