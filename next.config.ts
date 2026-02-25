import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Work around unstable dev-only Segment Explorer runtime errors in Next 15.
    devtoolSegmentExplorer: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "xtewwwycvapskgvfnliq.supabase.co",
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      canvas: false,
    };
    return config;
  },
  serverExternalPackages: ["@anthropic-ai/sdk", "exceljs", "pdf-lib"],
};

export default nextConfig;
