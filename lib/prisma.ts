import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaUrl: string | undefined;
};

const LOCAL_DATABASE_URL = 'file:./dev.db';

function resolveDatabaseUrl() {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  if (tursoUrl) return tursoUrl;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) return databaseUrl;

  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
  return LOCAL_DATABASE_URL;
}

function createPrismaClient(databaseUrl: string): PrismaClient {
  // Vitest sets NODE_ENV=test; always use local file Prisma engine for tests (see vitest.setup DATABASE_URL).
  const tursoUrl =
    process.env.NODE_ENV !== 'test' ? process.env.TURSO_DATABASE_URL?.trim() : '';
  if (tursoUrl) {
    const libsql = createClient({
      url: databaseUrl,
      authToken: process.env.TURSO_AUTH_TOKEN?.trim(),
    });
    return new PrismaClient({ adapter: new PrismaLibSQL(libsql) });
  }
  return new PrismaClient();
}

const activePrismaUrl = resolveDatabaseUrl();
const shouldReusePrisma =
  globalForPrisma.prisma !== undefined && globalForPrisma.prismaUrl === activePrismaUrl;

export const prisma: PrismaClient = shouldReusePrisma
  ? globalForPrisma.prisma!
  : createPrismaClient(activePrismaUrl);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaUrl = activePrismaUrl;
}
