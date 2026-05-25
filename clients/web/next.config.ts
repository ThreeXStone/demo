import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/contracts"],
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@repo/contracts': require.resolve('@repo/contracts'),
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/:path*",
      },
    ];
  },
};

export default nextConfig;
