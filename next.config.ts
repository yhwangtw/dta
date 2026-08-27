import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };
let piVersion = "unknown";
try {
  const piPkgPath = join(__dirname, "node_modules/@earendil-works/pi-coding-agent/package.json");
  piVersion = (JSON.parse(readFileSync(piPkgPath, "utf8")) as { version: string }).version;
} catch { /* package not found, use default */ }

const nextConfig: NextConfig = {
  // Produce a traced runtime bundle for the container stage. Company-specific
  // configuration is still read from process.env when the container starts;
  // it is never embedded by this build setting.
  output: "standalone",
  // Never infer the workspace from lockfiles in parent directories. Without
  // these roots, a stray ~/package-lock.json can make output tracing scan the
  // entire home directory and make builds appear to hang.
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  // The dev-tools badge floats bottom-left, exactly over the icon rail's
  // bottom buttons (Models/Theme) — disable it.
  devIndicators: false,
  serverExternalPackages: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"],
  // The desktop preview may open the same local dev server through either
  // localhost or 127.0.0.1. Next 16 otherwise serves the HTML but blocks the
  // dev client/HMR request, leaving the page visible but not interactive.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.*.*"],
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default withBundleAnalyzer(nextConfig);
