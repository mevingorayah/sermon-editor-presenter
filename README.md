# sermon-editor-presenter

Sermon editor + preaching presenter for pastors.

## Modes

- **Editing** (`/edit`) — TipTap block editor + study chrome
- **Preaching** (`/preach`) — read-only Reading Mode (typography, themes, bionic, calibration → DOCX/PDF)

## Stack

- Next.js (App Router)
- TipTap (headless block editor)
- Dual Cloud Run services (light shell + heavier export worker)

## Status

Scaffold in progress — App Build Pod.

## DevOps

- CI: `.github/workflows/ci.yml` (lint/test/build + Trivy image scan)
- Staging: `.github/workflows/deploy-staging.yml` — needs GCP env vars (see `docs/runbook-staging.md`)
- Shell vs export: `Dockerfile` (512Mi) and `Dockerfile.export` (2Gi, fonts)
- Next.js: set `output: "standalone"` in `next.config` so these images boot on Cloud Run
