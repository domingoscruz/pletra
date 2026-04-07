import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: "/api/image-proxy",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "walter-r2.trakt.tv",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "walter.trakt.tv",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "media.trakt.tv",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "secure.gravatar.com",
        pathname: "/avatar/**",
      },
    ],
  },
};

export default nextConfig;
