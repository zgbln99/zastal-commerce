/** @type {import('next').NextConfig} */
// Security headers applied by the storefront itself; the per-request CSP with a nonce lives in proxy.ts and Nginx adds HSTS at the TLS edge.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://127.0.0.1:8880/api/:path*' }];
  },
};
export default nextConfig;
