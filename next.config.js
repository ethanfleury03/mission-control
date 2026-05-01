/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Cloud Run / standalone output needs Prisma native bits copied in.
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/.prisma/**',
      './node_modules/@prisma/**',
      './node_modules/@napi-rs/**',
      './node_modules/pdf-parse/dist/**',
    ],
  },
}

module.exports = nextConfig
