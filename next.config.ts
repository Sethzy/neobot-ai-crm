import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  experimental: {
    // Work around unstable dev-only Segment Explorer runtime errors in Next 15.
    devtoolSegmentExplorer: false,
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "react-icons",
      "@radix-ui/react-radio-group",
      "framer-motion",
      "class-variance-authority",
      "recharts",
      "@react-pdf-viewer/core",
      "@react-pdf-viewer/default-layout",
      "@react-pdf-viewer/highlight",
      "react-day-picker",
      "react-markdown",
      "jszip",
    ],
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

export default withBundleAnalyzer(nextConfig);
