# Cloud Deployment Plan (Bonus)

**Author:** Bekalu Eshete
**Target platform:** AWS
**Level:** Beginner-friendly overview

---

## 1. Architecture Overview

```
                    ┌──────────────┐
                    │   Route 53   │  (DNS — api.ella.example.com)
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  ALB (HTTPS) │  (Application Load Balancer + TLS)
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌────▼─────┐
        │ ECS Task  │ │ECS Task│ │ ECS Task │  (Fargate — no servers)
        │ Ella API  │ │Ella API│ │ Ella API │
        └─────┬─────┘ └───┬────┘ └────┬─────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼───────┐
                    │  RDS Postgres │  (Managed DB — multi-AZ)
                    └──────────────┘
```

---

## 2. Components

### 2.1 Compute — AWS ECS with Fargate

- **Why ECS Fargate:** Serverless containers — no EC2 instances to manage.
  The Ella API Docker image runs as an ECS task.
- **How:** Create an ECS cluster, define a task that references the Docker
  image from Amazon ECR (Elastic Container Registry), and run multiple
  copies behind a load balancer.
- **Auto-scaling:** Set a target tracking policy on CPU utilization
  (e.g., scale up when CPU > 70%).

### 2.2 Database — Amazon RDS for PostgreSQL

- **Why RDS:** Managed PostgreSQL with automated backups, patching, and
  multi-AZ high availability.
- **How:** Create an RDS PostgreSQL 16 instance in a private subnet. The
  ECS tasks connect to it via the security group. `DB_HOST` is set to
  the RDS endpoint.
- **Backups:** Automated daily snapshots + point-in-time recovery (PITR)
  for the last 35 days.

### 2.3 Load Balancing — Application Load Balancer (ALB)

- **Why ALB:** Distributes HTTP traffic across ECS tasks, handles TLS
  termination, and performs health checks against `/health`.
- **How:** The ALB routes traffic on port 443 (HTTPS) to the ECS
  tasks on port 4000. Health check path: `/health`.

### 2.4 Networking — VPC with Public & Private Subnets

- **Public subnets:** ALB only.
- **Private subnets:** ECS tasks and RDS — no direct internet access.
- **NAT Gateway:** Allows ECS tasks to pull images from ECR and reach
  external APIs without being internet-facing.

### 2.5 DNS & TLS — Route 53 + ACM

- Route 53 maps `api.ella.example.com` to the ALB.
- AWS Certificate Manager (ACM) provides the TLS certificate.

---

## 3. Deployment Steps (High-Level)

### Step 1: Set Up the Container Registry

```bash
# Create an ECR repository
aws ecr create-repository --repository-name ella-api

# Build, tag, and push the Docker image
docker build -t ella-api .
docker tag ella-api:latest <aws-account-id>.dkr.ecr.us-east-1.amazonaws.com/ella-api:latest
docker push <aws-account-id>.dkr.ecr.us-east-1.amazonaws.com/ella-api:latest
```

### Step 2: Create the RDS Database

```bash
aws rds create-db-instance \
  --db-instance-identifier ella-prod-db \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --master-username ella_app_prod \
  --master-user-password <secure-password> \
  --allocated-storage 20 \
  --vpc-security-group-ids sg-xxxxxxxx \
  --db-subnet-group-name ella-db-subnet-group
```

### Step 3: Create the ECS Cluster & Service

1. Create an ECS cluster (`ella-prod-cluster`).
2. Register a task definition that specifies:
   - The ECR image URI
   - Environment variables (`DB_HOST`, `DB_PORT`, `DB_USERNAME`,
     `DB_PASSWORD`, `DB_DATABASE`) — with `DB_PASSWORD` sourced from
     AWS Secrets Manager.
   - Port mapping: `4000:4000`
3. Create an ECS service with:
   - Desired count: 2 (minimum for HA)
   - ALB target group on port 4000
   - Health check: `/health`

### Step 4: Configure DNS

Point Route 53 record to the ALB DNS name.

---

## 4. CI/CD Integration

The GitHub Actions pipeline (see `ci-notes.md`) automates steps 1–3:

1. On merge to `main` → build Docker image → push to ECR.
2. Update the ECS task definition with the new image tag.
3. Deploy the new task definition to the ECS service.
4. Wait for health check to pass.

---

## 5. Cost Considerations (Beginner)

| Component | Approx. Monthly Cost |
|---|---|
| ECS Fargate (2 tasks, 0.5 vCPU, 1 GB each) | ~$30 |
| RDS PostgreSQL (db.t3.medium, 20 GB) | ~$30 |
| ALB | ~$16 |
| NAT Gateway | ~$32 |
| Route 53 | ~$0.50 per zone |
| Data transfer | ~$10 (varies) |
| **Total (rough)** | **~$120/month** |

These are rough estimates for a small deployment. Costs scale with
usage and can be reduced with Savings Plans or by using smaller
instances for dev/staging.

---

## 6. Alternative Platforms

| Platform | Approach |
|---|---|
| **GCP** | Cloud Run (serverless containers) + Cloud SQL for PostgreSQL. Simpler than ECS — just push the image and Cloud Run handles scaling. |
| **Azure** | Azure Container Instances or App Service for Containers + Azure Database for PostgreSQL. |
| **Railway / Render** | Platform-as-a-Service — push the Docker image, they handle the rest. Easiest for beginners but less control. |

For a beginner, I would recommend starting with GCP Cloud Run because
it requires the least infrastructure configuration: push the image,
connect a managed PostgreSQL database, and Cloud Run handles scaling,
health checks, and TLS automatically.
