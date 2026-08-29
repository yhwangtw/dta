# Digital Transformation Agent

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh-TW.md">繁體中文</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.de.md"><strong>Deutsch</strong></a>
</p>

**DTA ist eine Meeting-first Agent-Plattform für Fachbereiche. Sie verwandelt Gespräche und Dateien in geprüfte, nachvollziehbare Arbeitsergebnisse.**

Derselbe serverseitige Agent-Kern ist über Web, TUI, CLI, REST und A2A nutzbar. Der Meeting Agent strukturiert Besprechungen; der PM Agent überführt freigegebene Anforderungen in Produktdokumente und Entwicklungsaufgaben. Ein unternehmensweiter Orchestrator kann stabile Agent Contracts aufrufen, ohne den internen Pi Runtime kennen zu müssen.

> Diese Seite ist eine kompakte Übersicht. Die vollständige Installations- und Betriebsanleitung steht im [englischen README](./README.md) und im [traditionell-chinesischen README](./README.zh-TW.md).

<p align="center">
  <img src="./docs/screenshots/dta-home.png" alt="DTA Meeting Agent home" width="1200">
</p>

## Kernfunktionen

| Agent / Einstieg | Funktion |
|---|---|
| **Meeting Agent** | Erstellt aus Transcript, TXT, Markdown, DOCX, Audio oder Video Zusammenfassung, Entscheidungen, Aufgaben und Anforderungen |
| **PM Agent** | Erstellt aus Anforderungen URD, PRD, User Stories, Akzeptanzkriterien, Designkontext und Task Plan |
| **Web / TUI / CLI** | Bedient denselben Agent-Kern im Browser oder Terminal |
| **REST / A2A 1.0** | Startet und verfolgt Agent Runs über einen Unternehmens-Orchestrator |
| **Adapter** | Konfiguriert lokales Dateisystem, MinIO, Keycloak, n8n, Speech-to-Text und Vision ohne Neuaufbau des Images |

Meeting-Ergebnisse werden nicht nur als Markdown, sondern als strukturierte Runs, Artifacts und Actions gespeichert. Nachgelagerte Aktionen erfordern standardmäßig eine menschliche Freigabe.

## Aus dem Quellcode starten

Voraussetzungen: Node.js 22+, npm 10+ und Git.

```bash
git clone https://github.com/yhwangtw/dta.git
cd dta
cp .env.example .env.local
npm ci
npm run dev
```

Danach `http://localhost:30141` öffnen.

```bash
# CLI
npm run dta -- run meeting --task "Fasse dieses Transcript zusammen" --transcript ./meeting.txt
npm run dta -- run pm --task "Erstelle aus dieser Anforderung ein PRD und einen Task Plan"

# Interaktive TUI
npm run tui -- meeting
```

`setup.sh` ist ein Production Installer, der den Checkout mit `origin/main` synchronisiert. Nicht in einem Entwicklungs-Checkout mit uncommitteten Änderungen ausführen.

## Docker und Helm

Veröffentlichte Artifacts:

```text
Docker image: yhwangtn/dta
OCI Helm chart: oci://registry-1.docker.io/yhwangtn/dta-agent-platform
```

```bash
docker pull yhwangtn/dta:v2026.08.29
docker run --rm -p 30141:30141 \
  -e DTA_AUTH_MODE=none \
  -e DTA_ARTIFACT_STORE=local \
  -e DTA_MEMORY_STORE=local \
  -e DTA_WORKFLOW_PROVIDER=none \
  -e DTA_TRANSCRIPTION_PROVIDER=none \
  -e DTA_VISION_PROVIDER=none \
  -v dta-data:/data \
  yhwangtn/dta:v2026.08.29
```

Im Unternehmensbetrieb müssen Chart-Version und Image-Digest separat fixiert werden. Die Chart-Version wählt nicht automatisch ein gleichnamiges Image. Details: [Deployment guide](./docs/deployment.md) und [Helm documentation](./deploy/helm/dta-agent-platform/README.md).

## Externe Contracts

```text
POST /api/agents/meeting/run
POST /api/agents/pm/run
GET  /api/agent-runs/{runId}
GET  /api/agent-runs/{runId}/events

GET  /.well-known/agent-card.json
POST /a2a/v1/message:send
POST /a2a/v1/message:stream
```

Pi-spezifische Sessions und Events werden nicht über die externen APIs offengelegt.

## Wichtige Production-Grenzen

- Der Pi Session Runtime ist process-local; aktuell ist deshalb `replicas: 1` erforderlich.
- Der Browser-Login erfolgt über einen Keycloak-fähigen Ingress/Proxy. DTA übernimmt validierte Identity Headers.
- Audio- und Videoverarbeitung benötigt einen externen Speech-to-Text Provider; visuelle Analyse zusätzlich einen optionalen Vision Provider.
- Vor dem Rollout sollten Identity, Storage, Workflows und Media mit `dta pilot-check --live` validiert werden.

## Weitere Dokumentation

- [Architecture](./docs/architecture.md)
- [Deployment](./docs/deployment.md)
- [Company pilot readiness](./docs/company-pilot-readiness.md)
- [Meeting media pipeline](./docs/meeting-media-pipeline.md)
- [n8n integration](./docs/n8n.md)
