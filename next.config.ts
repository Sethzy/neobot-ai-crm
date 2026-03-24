import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/agents",
        destination: "/market/agents",
        permanent: true,
      },
      {
        source: "/agents/:path*",
        destination: "/market/agents/:path*",
        permanent: true,
      },
      {
        source: "/properties",
        destination: "/market/properties",
        permanent: true,
      },
      {
        source: "/properties/:path*",
        destination: "/market/properties/:path*",
        permanent: true,
      },
      {
        source: "/hdb",
        destination: "/market/hdb",
        permanent: true,
      },
      {
        source: "/hdb/:path*",
        destination: "/market/hdb/:path*",
        permanent: true,
      },
      {
        source: "/agencies",
        destination: "/market/agencies",
        permanent: true,
      },
      {
        source: "/agencies/:path*",
        destination: "/market/agencies/:path*",
        permanent: true,
      },
      {
        source: "/areas",
        destination: "/market/areas",
        permanent: true,
      },
      {
        source: "/areas/:path*",
        destination: "/market/areas/:path*",
        permanent: true,
      },
    ];
  },
  experimental: {
    // Work around unstable dev-only Segment Explorer runtime errors in Next 15.
    devtoolSegmentExplorer: false,
    // Cache Turbopack compilation to disk — faster restarts and page loads
    turbopackFileSystemCacheForDev: true,
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
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
  turbopack: {
    resolveAlias: {
      canvas: { browser: "./empty-module.js" },
    },
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
