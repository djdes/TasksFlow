import type { NextConfig } from "next";
import { execSync } from "child_process";
import { readFileSync } from "fs";

function getBuildId(): string {
  // CI writes .build-sha before tarball
  try {
    const sha = readFileSync(".build-sha", "utf-8").trim();
    return sha.slice(0, 7);
  } catch {
    // Fallback: local dev with git
    try {
      return execSync("git rev-parse --short HEAD").toString().trim();
    } catch {
      return "dev";
    }
  }
}

function getBuildTime(): string {
  try {
    return readFileSync(".build-time", "utf-8").trim();
  } catch {
    return new Date().toISOString();
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: getBuildId(),
    NEXT_PUBLIC_BUILD_TIME: getBuildTime(),
  },
};

export default nextConfig;
