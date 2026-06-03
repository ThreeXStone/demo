import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/chat/:path*",
        destination: "http://localhost:3002/chat/:path*",
      },
    ];
  },
};

export default nextConfig;
