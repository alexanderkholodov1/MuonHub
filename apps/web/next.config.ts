/**
 * Next.js configuration — MuonHub web app.
 *
 * output: "export"  — Phase A: static export for Firebase Hosting (no SSR).
 *                     Phase B (optional): remove this to enable SSR on Supabase/Red Clara.
 *
 * transpilePackages: ensures @muonhub/ui (workspace package) is transpiled
 *                    by Next.js rather than assumed to be pre-compiled CJS.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",

  // Transpile workspace UI package so Next.js processes its JSX/TSX
  transpilePackages: ["@muonhub/ui"],

  // Strict mode for surfacing React concurrency bugs early
  reactStrictMode: true,

  // Image optimization is unavailable in static export mode
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
