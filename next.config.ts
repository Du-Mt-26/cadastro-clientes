import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

// Read version directly from package.json (works in all environments)
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Expose app version to client-side via process.env.NEXT_PUBLIC_APP_VERSION
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version || '0.0.0',
  },
  // Performance optimizations
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'date-fns',
    ],
  },
  // Ensure heavy server-only deps are not bundled for client
  serverExternalPackages: [
    'googleapis',
    'xlsx',
    'docx',
    'bcryptjs',
    'otplib',
  ],
};

export default nextConfig;
