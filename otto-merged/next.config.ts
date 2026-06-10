import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React Server Components (default in Next.js 15)
  reactStrictMode: true,

  // Pin file-tracing to this project so an unrelated parent lockfile
  // (e.g. C:\Users\Ashwin\package-lock.json) isn't picked as the root.
  outputFileTracingRoot: process.cwd(),

  // Server-side environment variables surfaced to route handlers
  serverExternalPackages: ["stripe"],

  // Serve the static OTTO frontend (public/index.html) at the site root.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },

  // Custom headers for security hardening
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
