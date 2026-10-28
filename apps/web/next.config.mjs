const staticDemo = process.env.NEXT_PUBLIC_STATIC_DEMO === 'true';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
];

const config = {
  reactStrictMode: true,
  poweredByHeader: false
};

if (staticDemo) {
  config.output = 'export';
  config.trailingSlash = true;
  config.images = { unoptimized: true };
} else {
  config.headers = async () => [{ source: '/:path*', headers: securityHeaders }];
}

export default config;
