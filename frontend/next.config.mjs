// All browser calls go to /api/* on this origin and are proxied to FastAPI (no CORS, one domain for SEO).
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://127.0.0.1:8010").replace(/\/$/, "");

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    proxyTimeout: 180_000, // first speech analysis loads the Whisper model
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
