# Promote to prod (runbook)

Status: DRAFT. Do not merge or create prod resources until:
1. Mevin decides where prod lives (same GCP project `sermon-editor-509615`, or a new project).
2. The durable sermon store ships (Backend; Firestore recommended) and QA's durability gate passes.
3. Security review, if Mevin brings Security back.

## How promotion works
- Promotion never rebuilds. It redeploys the exact image digests QA passed on staging,
  pinned in `deploy/prod-release.env`. Changing the pin is a reviewed PR.
- `Promote to prod` is manual (workflow_dispatch) and runs in the GitHub `production`
  Environment, which requires an approver before any step runs.
- The run also refuses to deploy unless `PROD_STORAGE_READY=true` on that Environment.

## One-time setup (after the decisions above)
- GitHub Environment `production`: required reviewer = `mevingorayah`; deployment branch = `main` only.
- Environment variables: `GCP_PROJECT_ID`, `GCP_REGION`, `SOURCE_IMAGE_BASE`
  (e.g. `europe-west2-docker.pkg.dev/sermon-editor-509615/sermon-editor`),
  `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` (deploy SA `gha-prod@…`),
  `PROD_RUNTIME_SERVICE_ACCOUNT` (runtime SA for the services), `EXPORT_SERVICE_URL`,
  `PROD_STORAGE_READY`.
- `gha-prod` gets only: Cloud Run Admin on the prod project, Service Account User on the
  runtime SA, Artifact Registry Reader on the image repo, Workload Identity User for
  `repo:mevingorayah/sermon-editor-presenter` restricted to environment `production`.
  No Artifact Registry Writer (prod never pushes images).
- Click-by-click console steps for Mevin will be written once the project decision is made.

## Rollback
Set the pin back to the previous release in a PR, merge, and re-run `Promote to prod`,
or in Cloud Run switch traffic to the previous revision.
