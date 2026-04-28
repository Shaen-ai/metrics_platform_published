import type { NextConfig } from "next";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, "") || "http://localhost:8000";

/**
 * Next 16 has no `dist/esm/lib/constants.js`. Use a root-relative path — absolute paths get
 * wrongly prefixed with `./` by the bundler (`./Users/...`).
 */
const nextLibConstants = "./node_modules/next/dist/lib/constants.js";

const nextConfig: NextConfig = {
  /** Hide the bottom-left Next.js dev tools indicator (route / bundler bubble) in development */
  devIndicators: false,
  reactStrictMode: false,
  turbopack: {
    resolveAlias: {
      "next/dist/esm/lib/constants": nextLibConstants,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "tunzone.com",
      },
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/storage/:path*",
        destination: `${API_ORIGIN}/storage/:path*`,
      },
      {
        source: "/files/:path*",
        destination: `${API_ORIGIN}/files/:path*`,
      },
    ];
  },

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "next/dist/esm/lib/constants": nextLibConstants,
    };
    return config;
  },
};

export default nextConfig;
