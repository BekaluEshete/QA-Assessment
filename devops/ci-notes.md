# CI/CD Pipeline Notes

**Author:** Bekalu Eshete

---

## 1. What the CI Pipeline Does

The GitHub Actions workflow (`.github/workflows/ci.yml`) triggers on
every push and pull request to `main`, `master`, and `develop` branches.
It runs the following jobs in sequence inside a single quality-gate job:

| Step | Command | Fails CI? |
|---|---|---|
| 1. Checkout | `actions/checkout@v4` | — |
| 2. Set up Node 20 | `actions/setup-node@v4` | — |
| 3. Install dependencies | `npm install --legacy-peer-deps` | Yes |
| 4. Run linter | `npm run lint` | Yes |
| 5. Build project | `npm run build` | Yes |
| 6. Run unit tests | `npm test -- --passWithNoTests --coverage` | Yes |
| 7. Upload coverage | `actions/upload-artifact@v4` | No (`if: always()`) |

The pipeline also provisions a PostgreSQL 16 service container so that
future integration/E2E tests can run against a real database.

### Key Design Decisions

- **Single job, sequential steps:** Lint → Build → Test. Each step
  depends on the previous one succeeding. If lint fails, the build
  doesn't run — fast failure saves CI minutes.
- **`--passWithNoTests`:** The current repository may have zero spec
  files. This flag prevents the pipeline from failing when there are no
  tests to run, while still collecting coverage on any that exist.
- **`--coverage`:** Generates a coverage report that is uploaded as a
  build artifact for review.
- **PostgreSQL service container:** Pre-configured so that when API and
  E2E tests are added, they can connect to `localhost:5432` without
  changes to the workflow.
- **`npm` cache:** `cache: 'npm'` caches the npm cache directory across
  workflow runs, speeding up dependency installation.

---

## 2. How to Extend Toward Continuous Deployment

### Stage 1: Add Integration & E2E Tests (Current → CI)

Add a second job that depends on `quality-gate`:

```yaml
  integration-tests:
    needs: quality-gate
    runs-on: ubuntu-latest
    services:
      postgres: # same config as above
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm install --legacy-peer-deps
      - run: npm run build
      - run: npm run migration:run   # apply schema to test DB
      - run: npm run test:e2e         # run E2E suite
```

### Stage 2: Build & Push Docker Image (CI → CD)

On merge to `main`, build the Docker image and push to a registry:

```yaml
  docker-build-push:
    needs: [quality-gate, integration-tests]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
```

### Stage 3: Deploy (CD)

After the image is pushed, deploy to staging or production. Example
with AWS ECS:

```yaml
  deploy-staging:
    needs: docker-build-push
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - run: |
          aws ecs update-service --cluster ella-cluster \
            --service ella-api-staging --force-new-deployment
```

### Deployment Promotion Flow

```
  Push to feature branch → PR → CI runs (lint, build, test)
                                        ↓
  Merge to main → CI passes → Build & push Docker image
                                        ↓
  Image tagged with commit SHA → Auto-deploy to staging
                                        ↓
  Manual approval → Promote to production
```

### Guardrails for CD

- **Never deploy on PRs** — CD only triggers on merge to `main`.
- **Use GitHub Environments** for staging/production with required
  reviewers for production.
- **Pin image tags** to the commit SHA (`:${{ github.sha }}`), not just
  `:latest`, for traceability and rollback.
- **Health check after deploy** — verify `GET /health` returns 200
  before marking the deployment successful.
- **Rollback plan** — keep the previous image tag; redeploy the
  previous SHA if health checks fail.

---

## 3. Assumptions

- The `GITHUB_TOKEN` is automatically available for GHCR (GitHub
  Container Registry) authentication.
- AWS credentials would be stored as repository secrets.
- The Dockerfile issues (devDeps in prod, `.env` baked in) should be
  fixed before the Docker build step is added — see BUGS.md.
