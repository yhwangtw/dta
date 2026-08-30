import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chart = resolve(process.cwd(), "deploy/helm/dta-agent-platform");
const read = (path: string) => readFileSync(resolve(chart, path), "utf8");

describe("enterprise Helm controls", () => {
  it("ships opt-in network isolation with explicit ingress and egress configuration", () => {
    const values = read("values.yaml");
    const template = read("templates/networkpolicy.yaml");
    const helpers = read("templates/_helpers.tpl");
    expect(values).toContain("networkPolicy:");
    expect(template).toContain("kind: NetworkPolicy");
    expect(template).toContain("policyTypes:");
    expect(template).toContain("kubernetes.io/metadata.name: kube-system");
    expect(helpers).toContain("networkPolicy.ingressFrom is required");
    expect(helpers).toContain("networkPolicy.egress.extraRules");
  });

  it("supports authenticated Prometheus scraping, retention, and backup hooks", () => {
    const serviceMonitor = read("templates/servicemonitor.yaml");
    const retention = read("templates/retention-cronjob.yaml");
    const backup = read("templates/backup-cronjob.yaml");
    expect(serviceMonitor).toContain("kind: ServiceMonitor");
    expect(serviceMonitor).toContain("authorization:");
    expect(retention).toContain("kind: CronJob");
    expect(retention).toContain("DTA_RETENTION_TOKEN_HEADER");
    expect(retention).toContain("automountServiceAccountToken: false");
    expect(backup).toContain("readOnly: true");
    expect(backup).toContain("backupCronJob.image is required");
    expect(read("templates/_helpers.tpl")).toContain("backupCronJob.image must be pinned by sha256 digest");
  });

  it("keeps workload security and single-owner runtime invariants", () => {
    const values = read("values.yaml");
    const deployment = read("templates/deployment.yaml");
    const helpers = read("templates/_helpers.tpl");
    expect(values).toContain("runAsNonRoot: true");
    expect(values).toContain("allowPrivilegeEscalation: false");
    expect(values).toContain("readOnlyRootFilesystem: true");
    expect(deployment).toContain("automountServiceAccountToken: false");
    expect(helpers).toContain("replicaCount must remain 1");
  });

  it("renders every optional enterprise resource in pull-request and release CI", () => {
    const profile = read("ci/values-enterprise.yaml");
    const ci = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");
    const release = readFileSync(resolve(process.cwd(), ".github/workflows/release.yml"), "utf8");
    expect(profile).toContain("networkPolicy:");
    expect(profile).toContain("serviceMonitor:");
    expect(profile).toContain("retentionCronJob:");
    expect(profile).toContain("backupCronJob:");
    expect(ci).toContain("ci/values-enterprise.yaml");
    expect(release).toContain("ci/values-enterprise.yaml");
  });
});
