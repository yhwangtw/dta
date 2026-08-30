import packageJson from "@/package.json";
import { getAgentRegistry } from "@/lib/agents/agent-registry";
import { loadDtaConfig } from "@/lib/config/env";

export function buildA2AAgentCard(): Record<string, unknown> {
  const config = loadDtaConfig();
  const keycloakSecurity = config.authMode === "keycloak" && config.keycloakIssuer ? {
    securitySchemes: {
      keycloak: {
        openIdConnectSecurityScheme: {
          openIdConnectUrl: `${config.keycloakIssuer}/.well-known/openid-configuration`,
        },
      },
    },
    securityRequirements: [{ keycloak: [] }],
  } : {};
  return {
    name: "Digital Transformation Agent",
    description: "Department Agent hub for source-backed meeting intelligence and product-management delivery artifacts.",
    supportedInterfaces: [{
      url: `${config.publicBaseUrl}/a2a/v1`,
      protocolBinding: "HTTP+JSON",
      protocolVersion: "1.0",
    }],
    provider: {
      organization: config.providerOrganization,
      url: config.providerUrl,
    },
    version: packageJson.version,
    documentationUrl: `${config.publicBaseUrl}/docs/agent-platform`,
    capabilities: { streaming: true, pushNotifications: false, extendedAgentCard: false },
    ...keycloakSecurity,
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["application/json", "text/markdown"],
    // The unauthenticated card advertises only unrestricted capabilities.
    // Role-scoped Department Agents are discoverable from authenticated
    // /api/agents instead of leaking internal capability names publicly.
    skills: getAgentRegistry().list()
      .filter((agent) => !agent.allowedRoles?.length)
      .flatMap((agent) => agent.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      examples: skill.id === "meeting-minutes"
        ? ["Generate review-ready minutes from this transcript", "Extract decisions and action items from this meeting"]
        : skill.id === "pm-analysis"
          ? ["Turn this approved requirement into a PRD and delivery plan"]
          : [`Use ${agent.displayName} for this department task`],
      inputModes: skill.inputModes.filter((mode) => mode === "text/plain" || mode === "application/json"),
      outputModes: skill.outputModes,
      metadata: {
        agentId: agent.id,
        ...(skill.id === "meeting-minutes" ? { mediaUploadEndpoint: `${config.publicBaseUrl}/api/meeting-agent/extract` } : {}),
      },
      }))),
  };
}
