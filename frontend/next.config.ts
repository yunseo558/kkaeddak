import path from "node:path";

import type { NextConfig } from "next";

const backendOrigin =
  process.env.KKAEDDAK_BACKEND_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, ".."),
  },
  transpilePackages: ["@kkaeddak/api-client"],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
