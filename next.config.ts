import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // The data folder holds runtime files (some root-owned, e.g. the VPN log); never trace it into the build.
  outputFileTracingExcludes: { "*": ["./data/**"] },
};

export default nextConfig;
