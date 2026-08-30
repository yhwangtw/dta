import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
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

  it("publishes and verifies the matching Helm chart as a Docker Hub OCI artifact", () => {
    expect(workflow).toContain("chart_only:");
    expect(workflow).toContain("chart_version: ${{ steps.version.outputs.chart_version }}");
    expect(workflow).toContain("uses: azure/setup-helm@v5");
    expect(workflow).toContain("HELM_CHART_REF: oci://registry-1.docker.io/yhwangtn/dta-agent-platform");
    expect(workflow).toContain('helm push "$archive" "oci://${HELM_REGISTRY}/${HELM_NAMESPACE}"');
    expect(workflow).toContain('helm template dta "$HELM_CHART_REF"');
    expect(workflow).toContain("image_digest: ${{ steps.push.outputs.digest }}");
    expect(workflow).toContain("scripts/stamp-helm-release-image.mjs");
    expect(workflow).toContain('"docker.io/${DOCKERHUB_IMAGE_NAME}" \\');
    expect(workflow).toContain('grep -Fq "image: \\"docker.io/${DOCKERHUB_IMAGE_NAME}@${IMAGE_DIGEST}\\""');
    expect(workflow).toContain("needs: [prepare, container, helm-chart]");
  });

  it("does not leave a stale production digest in source Helm values", () => {
    const defaults = read("deploy/helm/dta-agent-platform/values.yaml");
    const values = read("deploy/helm/dta-agent-platform/values.company-example.yaml");
    expect(defaults).toContain("repository: docker.io/yhwangtn/dta");
    expect(defaults).toContain('digest: ""');
    expect(values).toContain('tag: "REPLACE_WITH_RELEASE_TAG"');
    expect(values).not.toMatch(/digest: sha256:[a-f0-9]{64}/);
  });

  it("stamps both packaged values files with one immutable release image", () => {
    const root = mkdtempSync(join(tmpdir(), "dta-helm-release-"));
    const chart = join(root, "chart");
    const digest = `sha256:${"a".repeat(64)}`;
    try {
      cpSync(resolve(process.cwd(), "deploy/helm/dta-agent-platform"), chart, { recursive: true });
      execFileSync(process.execPath, [
        resolve(process.cwd(), "scripts/stamp-helm-release-image.mjs"),
        chart,
        "docker.io/yhwangtn/dta",
        "v2026.08.30",
        digest,
      ]);
      for (const file of ["values.yaml", "values.company-example.yaml"]) {
        const stamped = readFileSync(join(chart, file), "utf8");
        expect(stamped).toContain('repository: "docker.io/yhwangtn/dta"');
        expect(stamped).toContain('tag: "v2026.08.30"');
        expect(stamped).toContain(`digest: "${digest}"`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
