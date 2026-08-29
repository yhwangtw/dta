import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("release registry contract", () => {
  const workflow = read(".github/workflows/release.yml");

  it("publishes every release to both GHCR and Docker Hub", () => {
    expect(workflow).toContain("GHCR_IMAGE_NAME: ${{ github.repository }}");
    expect(workflow).toContain("DOCKERHUB_IMAGE_NAME: yhwangtn/dta");
    expect(workflow).toContain("secrets.DOCKERHUB_USERNAME");
    expect(workflow).toContain("secrets.DOCKERHUB_TOKEN");
    expect(workflow).toContain("docker.io/${{ env.DOCKERHUB_IMAGE_NAME }}");
    expect(workflow).toContain("platforms: linux/amd64,linux/arm64");
    expect(workflow).toContain("Verify GHCR and Docker Hub manifests");
  });

  it("pins the company Helm example to the verified Docker Hub digest", () => {
    const values = read("deploy/helm/dta-agent-platform/values.company-example.yaml");
    expect(values).toContain("repository: yhwangtn/dta");
    expect(values).toContain("tag: \"v2026.08.28\"");
    expect(values).toContain("digest: sha256:a119a2a2b98c406c7e9b40fe625f558c54f262c1d94023c040215776d98cdd19");
  });
});
