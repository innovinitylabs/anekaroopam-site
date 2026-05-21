import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@jsquash/avif", "sharp"],
};

export default nextConfig;
