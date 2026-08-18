# Digital Transformation Agent — Brand Guidelines v0.1

## Quick Reference

- **Product name:** Digital Transformation Agent
- **Short name:** DTA
- **Category:** Department digital transformation agent and human control plane
- **Primary color:** Transformation Violet (`#7C3AED`)
- **Workflow accent:** Signal Cyan (`#0891B2`)
- **Primary font:** Inter with Noto Sans TC fallback
- **Voice:** clear, accountable, calm

## Positioning

Digital Transformation Agent moves department transformation work from intent to measurable impact. It connects meetings, decisions, PDLC delivery, specialist agents, and human governance in one traceable workspace. Teams can operate it directly through the DTA interface, while a company-level orchestrator can call the same bounded capabilities through stable contracts.

### Primary message

Move digital transformation from intent to impact.

### Supporting messages

- Align transformation goals through source-backed meeting decisions.
- Deliver approved changes through specialist agents and PDLC workflows.
- Govern evidence, exceptions, ownership, and measurable outcomes.
- Serve both human teams and company orchestrators without splitting the operating model.

## Visual Identity

### Mark

The compact mark is `DTA` inside a rounded square. Use the full product name in high-context surfaces and the short mark in navigation, favicons, and compact headers.

Do not reuse the former Pi or tGD mark as the DTA product identity. Pi remains an implementation detail of the runtime.

### Color roles

| Role | Color | Usage |
|---|---|---|
| Transformation Violet | `#7C3AED` | Primary actions, active navigation, brand mark |
| Signal Cyan | `#0891B2` | Workflow links, orchestration, informational emphasis |
| Ink | `#1E1B4B` | Light-mode foreground |
| Canvas | `#FAF5FF` | Light-mode branded background |
| White | `#FFFFFF` | Cards and primary text on violet |
| Danger | `#DC2626` | Failures and destructive actions only |

Application components must consume semantic CSS tokens rather than hardcoded colors. Every normal text pair must meet WCAG AA contrast.

### Typography

- Headings: Inter 600–700
- Body: Inter 400–500
- Traditional Chinese: Noto Sans TC 400–700
- Machine identifiers, timestamps, and IDs: JetBrains Mono

### Icons

Use the existing Lucide-style outlined icon language with consistent stroke weight. Do not use emoji as structural icons.

## Voice and Tone

| Trait | We are | We are not |
|---|---|---|
| Clear | Outcome-first and specific | Jargon-heavy or vague |
| Accountable | Explicit about source, owner, status, and approval | Pretending an inference is a fact |
| Calm | Direct and useful during failures | Alarmist or theatrical |

Use Taiwan-standard Traditional Chinese in the default department experience. Prefer `待確認`, `負責人`, `期限`, and `執行紀錄` over ambiguous system language.

## Product Architecture Language

- **DTA:** the department platform and orchestration endpoint
- **Agent:** a bounded department capability with a contract and owner
- **Workflow:** a repeatable multi-step process that may call one or more agents
- **Review:** a human decision gate
- **Artifact:** an approved output such as minutes, a PRD, or a report
- **Run:** one execution with a traceable status and result

## Experience Principles

1. Workflows and outcomes lead; chat is an interaction method.
2. Human review is visible, never hidden behind an agent status.
3. Every generated decision can show its source and execution history.
4. Department tools stay approachable; developer controls use progressive disclosure.
5. Desktop and mobile keep the same top-level navigation hierarchy.
6. The home experience leads with transformation outcomes; platform architecture supports the story instead of becoming the story.
