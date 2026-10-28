import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const apiProxy =
  process.env.DICTABLY_API_PROXY?.trim() || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

// S4: rewrites only in next dev — static export warns/ignores them at build.
if (process.env.NODE_ENV === "development") {
  nextConfig.rewrites = async () => [
    {
      source: "/api/:path*",
      destination: `${apiProxy}/api/:path*`,
    },
  ];
}

export default withNextIntl(nextConfig);
