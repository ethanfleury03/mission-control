import { prisma } from '@/lib/prisma';

import { ALLOWED_HD, type GoogleProfileShape } from './hd-guard';

type GoogleIdentityProfile = GoogleProfileShape & {
  sub?: unknown;
  name?: unknown;
  picture?: unknown;
};

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function upsertAppUserFromGoogleProfile(profile: GoogleIdentityProfile) {
  const email = cleanString(profile.email).toLowerCase();
  const googleSub = cleanString(profile.sub);
  const hostedDomain = cleanString(profile.hd).toLowerCase() || ALLOWED_HD;
  const name = cleanString(profile.name);
  const image = cleanString(profile.picture);

  if (!email.endsWith(`@${ALLOWED_HD}`)) {
    throw new Error('Sign-in is restricted to @arrsys.com Google accounts.');
  }

  if (!googleSub) {
    throw new Error('Google sign-in did not return a stable user identifier.');
  }

  const existing = await prisma.appUser.findFirst({
    where: {
      OR: [{ email }, { googleSub }],
    },
  });

  if (existing) {
    return prisma.appUser.update({
      where: { id: existing.id },
      data: {
        email,
        googleSub,
        hostedDomain,
        name,
        image,
        lastLoginAt: new Date(),
      },
    });
  }

  return prisma.appUser.create({
    data: {
      email,
      googleSub,
      hostedDomain,
      name,
      image,
      lastLoginAt: new Date(),
    },
  });
}

export async function getAppUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return prisma.appUser.findUnique({ where: { email: normalized } });
}
