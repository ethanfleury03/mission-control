/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Cloud Run / standalone output needs Prisma + LibSQL native bits copied in.
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/.prisma/**',
      './node_modules/@prisma/**',
      './node_modules/@libsql/**',
    ],
  },
}

module.exports = nextConfig
