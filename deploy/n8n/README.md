# DTA n8n workflow packs

The JSON files in this directory are importable, deliberately inactive n8n workflows. Each workflow:

- accepts only the DTA `1.0` workflow envelope;
- validates workflow, execution, idempotency, run, user, and actor scopes;
- refuses unapproved Agent results;
- forwards the DTA idempotency key to the target system;
- reads endpoints and credentials from n8n environment variables or company-managed credentials;
- remains inactive after import so an administrator must inspect and explicitly publish it.

Required target configuration:

- Jira workflows: `JIRA_BASE_URL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`.
- Teams workflows: `TEAMS_WEBHOOK_URL`.
- Knowledge workflows: `KNOWLEDGE_BASE_WEBHOOK_URL`, `KNOWLEDGE_BASE_API_TOKEN`.

Before activation, replace environment expressions with the company's n8n credential objects when policy requires it, verify the target payload mapping, and exercise the webhook with a non-production project/team. Regenerate the checked-in packs with:

```bash
node scripts/generate-n8n-workflow-packs.mjs
```
