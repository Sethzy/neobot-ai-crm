import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";

import { securityHeaders } from "./src/lib/security-headers";

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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  experimental: {
    // Work around unstable dev-only Segment Explorer runtime errors in Next 15.
    devtoolSegmentExplorer: false,
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@radix-ui/react-radio-group",
      "framer-motion",
      "class-variance-authority",
      "recharts",
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
      {
        protocol: "https",
        hostname: "models.dev",
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
  serverExternalPackages: ["bash-tool", "just-bash"],
};

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
});
