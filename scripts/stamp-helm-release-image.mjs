#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function fail(message) {
  throw new Error(`Helm release image stamping failed: ${message}`);
}

export function stampImageValues(contents, { repository, tag, digest }) {
  const lines = contents.split("\n");
  let inImage = false;
  const replaced = new Set();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^image:\s*$/.test(line)) {
      inImage = true;
      continue;
    }
    if (inImage && /^\S/.test(line) && line.trim()) break;
    if (!inImage) continue;

    const match = line.match(/^(\s{2})(repository|tag|digest):/);
    if (!match) continue;
    const key = match[2];
    const value = key === "repository" ? repository : key === "tag" ? tag : digest;
    lines[index] = `${match[1]}${key}: ${JSON.stringify(value)}`;
    replaced.add(key);
  }

  for (const key of ["repository", "tag", "digest"]) {
    if (!replaced.has(key)) fail(`top-level image.${key} is missing`);
  }
  return lines.join("\n");
}

export function stampChart(chartPath, repository, tag, digest) {
  if (!/^[a-z0-9./_-]+$/.test(repository)) fail("invalid image repository");
  if (!/^v\d{4}\.\d{2}\.\d{2}(?:-[1-9]\d*)?$/.test(tag)) fail("invalid release tag");
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) fail("invalid image digest");

  for (const name of ["values.yaml", "values.company-example.yaml"]) {
    const path = join(chartPath, name);
    const stamped = stampImageValues(readFileSync(path, "utf8"), { repository, tag, digest });
    writeFileSync(path, stamped, "utf8");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , chartPath, repository, tag, digest] = process.argv;
  if (!chartPath || !repository || !tag || !digest) {
    console.error("Usage: stamp-helm-release-image.mjs <chart-path> <repository> <tag> <sha256:digest>");
    process.exit(2);
  }
  stampChart(chartPath, repository, tag, digest);
}
