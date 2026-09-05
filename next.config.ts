import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Type and lint errors must fail the build. Do not disable these.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  experimental: {
    serverActions: {
      // Next's Server Action body parser defaults to 1MB. File uploads go
      // through `uploadFileAction` as a Server Action (docs/architecture/
      // files.md), so this must cover the largest per-kind limit in
      // `features/files/domain/file-types.ts` (500MB for video) plus a
      // little headroom — the real, precise limits are enforced there, not
      // here; this is only the outer ceiling.
      bodySizeLimit: "512mb",
    },
  },
};

export default nextConfig;
