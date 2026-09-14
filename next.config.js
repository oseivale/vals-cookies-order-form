/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Turbopack is the default bundler for `next dev` and `next build` as of
  // Next.js 16 — no flag or config needed here. This app has no custom
  // webpack config and doesn't use Server Actions (all mutations go through
  // API route handlers), so there's nothing else to carry over from the
  // Next.js 14 config.
};

module.exports = nextConfig;
