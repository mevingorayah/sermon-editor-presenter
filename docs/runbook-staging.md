# Staging runbook — sermon-editor-presenter

## Layout

| Service | Cloud Run name | Resources | Auth |
|---------|----------------|-----------|------|
| Editor / Preaching shell | `sermon-editor-shell-staging` | 512Mi / 1 CPU | public (staging) |
| DOCX/PDF export worker | `sermon-editor-export-staging` | 2Gi / 2 CPU | authenticated |

Promote to **prod** only when QA smoke + export gate are green on staging (Project Manager owns the readiness signal). Security findings = fail promote.

## One-time GCP setup (Mevin / DevOps)

1. Pick a GCP project (or reuse the one behind the old `europe-west2` Cloud Run draft). Region default: `europe-west2`.
2. Enable APIs: Cloud Run, Artifact Registry, IAM Credentials.
3. Create Artifact Registry Docker repo (e.g. `sermon-editor`).
4. Create a deploy service account with least privilege: Artifact Registry writer, Cloud Run admin on these two services, Service Account User.
5. Configure Workload Identity Federation for GitHub Actions (`mevingorayah/sermon-editor-presenter`).
6. In the GitHub repo → **Settings → Environments → `staging`**, set variables:
   - `GCP_PROJECT_ID`
   - `GCP_REGION` (e.g. `europe-west2`)
   - `ARTIFACT_REGISTRY_REPO`
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`
   - `GCP_SERVICE_ACCOUNT`
   - `EXPORT_SERVICE_URL` (set after first export deploy, or leave empty until Backend wires the client)
7. Enable **Actions** for the private repo. Run **Deploy staging** (workflow_dispatch) or merge to `main`.

Until those variables exist, the deploy workflow skips safely and prints a warning — CI still runs lint/test/build + image scan.

## Release gate

1. CI green on the commit.
2. Staging shell URL healthy.
3. QA smoke + export gate pass (calibration → DOCX/PDF fidelity).
4. Security: no open high/critical for promote.
5. Project Manager gives Mevin the go/no-go.

## Installing GitHub Actions

The GitHub token used by agents currently lacks the `workflow` scope, so Actions YAML cannot be pushed under `.github/workflows/` until Mevin reconnects GitHub with that scope (or pastes the files in the UI).

Canonical copies live in `deploy/github-workflows/`. After `workflow` scope is available:

```bash
mkdir -p .github/workflows
cp deploy/github-workflows/*.yml .github/workflows/
git add .github/workflows && git commit -m "ci: enable GitHub Actions workflows" && git push
```
