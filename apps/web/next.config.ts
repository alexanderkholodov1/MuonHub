/**
 * MuonHub web app (spec 0088). A static export served by Firebase Hosting (ADR-005): no server
 * rendering, no dynamic route segments — entity ids travel as query parameters.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["@muonhub/ui"],
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
