import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.105", "188.115.184.88"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination:
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/:path*",
      },
      {
        source: "/ws/:path*",
        destination:
          process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8000/ws/:path*",
      },
    ];
  },
};

export default nextConfig;
