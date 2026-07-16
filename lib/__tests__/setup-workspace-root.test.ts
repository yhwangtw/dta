import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { spawnSync } from "child_process";
import { afterEach, describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("workspace root setup", () => {
  it("pins Next.js tracing and Turbopack to the repository root", () => {
    const repositoryRoot = resolve(__dirname, "../..");

    expect(nextConfig).toMatchObject({
      outputFileTracingRoot: repositoryRoot,
      turbopack: { root: repositoryRoot },
    });
  });

  it("warns about an ancestor lockfile without modifying it", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "tgd-pi-web-setup-"));
    tempDirs.push(sandbox);

    const home = join(sandbox, "home", "user");
    const project = join(home, "tGD-pi-web");
    const fakeBin = join(sandbox, "bin");
    const ancestorLockfile = join(home, "package-lock.json");

    mkdirSync(project, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(join(project, "node_modules", ".bin"), { recursive: true });
    copyFileSync(resolve("setup.sh"), join(project, "setup.sh"));
    writeFileSync(join(project, "package-lock.json"), "{}\n");
    writeFileSync(ancestorLockfile, "{}\n");

    const fakeNpm = join(fakeBin, "npm");
    writeFileSync(fakeNpm, `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then
  echo "10.9.0"
fi
exit 0
`);
    chmodSync(fakeNpm, 0o755);

    const fakeTsc = join(project, "node_modules", ".bin", "tsc");
    writeFileSync(fakeTsc, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(fakeTsc, 0o755);

    const result = spawnSync("bash", [join(project, "setup.sh")], {
      cwd: dirname(project),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("偵測到上層 lockfile");
    expect(result.stdout).toContain(ancestorLockfile);
    expect(existsSync(ancestorLockfile)).toBe(true);
  });
});
