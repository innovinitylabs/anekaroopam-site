import type { NextConfig } from "next";

/**
 * Allow Next/Image for R2 public CDN hosts.
 * Hostname comes from R2_PUBLIC_BASE_URL when set; otherwise common patterns.
 */
function r2RemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const patterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];
  const base = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (base) {
    try {
      const url = new URL(base);
      patterns.push({
        protocol: url.protocol.replace(":", "") as "http" | "https",
        hostname: url.hostname,
        pathname: "/**",
      });
    } catch {
      /* ignore invalid env at build time */
    }
  }
  // Cloudflare R2 public bucket / custom domain wildcards are env-specific;
  // absolute URLs also work with unoptimized fallback in ArchiveGrid.
  return patterns;
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["@jsquash/avif", "sharp"],
  images: {
    remotePatterns: r2RemotePatterns(),
  },
};

export default nextConfig;
