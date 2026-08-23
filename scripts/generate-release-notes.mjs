#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [tag, output = "/tmp/release-notes.md"] = process.argv.slice(2);
if (!/^v\d{4}\.\d{2}\.\d{2}(?:-[1-9]\d*)?$/.test(tag ?? "")) {
  throw new Error("Usage: generate-release-notes.mjs <vYYYY.MM.DD[-N]> [output]");
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

let previous = "";
try { previous = git(["describe", "--tags", "--abbrev=0", `${tag}^`]); } catch {}
const range = previous ? `${previous}..${tag}` : tag;
const log = git(["log", "--pretty=format:%s|||%h", range]);
const categories = new Map([
  ["Features", []],
  ["Bug fixes", []],
  ["Documentation", []],
  ["Refactoring", []],
  ["Operations and chores", []],
  ["Other changes", []],
]);

for (const line of log.split("\n").filter(Boolean)) {
  const separator = line.lastIndexOf("|||");
  const subject = line.slice(0, separator);
  const hash = line.slice(separator + 3);
  const prefix = subject.match(/^([a-z]+)(?:\([^)]*\))?!?:/i)?.[1]?.toLowerCase();
  const target = prefix === "feat" ? "Features"
    : prefix === "fix" ? "Bug fixes"
      : prefix === "docs" ? "Documentation"
        : prefix === "refactor" ? "Refactoring"
          : prefix === "chore" || prefix === "ci" || prefix === "build" ? "Operations and chores"
            : "Other changes";
  categories.get(target).push(`- ${subject.replace(/^[a-z]+(?:\([^)]*\))?!?:\s*/i, "")} (\`${hash}\`)`);
}

const lines = [`## Digital Transformation Agent ${tag}`, ""];
for (const [title, entries] of categories) {
  if (!entries.length) continue;
  lines.push(`### ${title}`, "", ...entries, "");
}
if (previous) {
  lines.push("---", "", `**Full changelog**: https://github.com/${process.env.GITHUB_REPOSITORY ?? "yhwangtw/dta"}/compare/${previous}...${tag}`, "");
}
writeFileSync(output, `${lines.join("\n")}\n`);
