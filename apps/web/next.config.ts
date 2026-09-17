import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@marked/core", "@marked/config"],
};

export default nextConfig;
