import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  // A wrong turn outside both languages still lands in the farm's own 404.
  experimental: { globalNotFound: true },
  async headers() {
    return [
      {
        source: "/:dir(img|plates|layers|products|brand|icons|textures)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
