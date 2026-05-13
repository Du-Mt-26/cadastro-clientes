import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Expose app version to client-side via process.env.NEXT_PUBLIC_APP_VERSION
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '0.0.0',
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
