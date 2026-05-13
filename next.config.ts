import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
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
