import type { NextConfig } from "next";

/**
 * Gate 12 §48 — baseline security headers found entirely absent by the
 * hostile audit (no headers() function existed at all before this). This
 * is deliberately NOT a Content-Security-Policy: a CSP wrong enough to
 * break Next.js's own inline hydration script/style injection is worse
 * than no CSP, and verifying one is safe requires real browser testing
 * this audit did not run. These four are low-risk, framework-agnostic,
 * and do not depend on knowing every script/style source Next.js injects:
 * - X-Content-Type-Options: stops MIME-sniffing a response into an
 *   unintended content type.
 * - Referrer-Policy: avoids leaking full URLs (which can carry job ids)
 *   to third-party origins when following an outbound link.
 * - X-Frame-Options + frame-ancestors: no legitimate reason for this app
 *   to be framed by another origin; blocks clickjacking.
 * - Permissions-Policy: opts out of browser features this app never uses.
 * See evidence/system-audit/headers-audit section of
 * evidence/system-audit/nextjs-boundary-audit.md for what remains (CSP).
 */
async function headers() {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    },
  ];
}

const nextConfig: NextConfig = {
  transpilePackages: ["@marked/core", "@marked/config"],
  headers,
};

export default nextConfig;
