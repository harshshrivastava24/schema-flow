# Project Progress & Session Handoff State

## Current Active State (AI Reads This First)
- **Active Branch:** `working` (Merge target: `staging` | Protected: `main`)
- **Last Completed Task:** `T1` — Monorepo & Foundation Setup
- **Next Task to Execute:** `T2` — `packages/ir-schema` — IR v1.0 JSON Schema, `Ajv` validator (Postgres + Mongo rules), starter IRs
- **Recent Context Summary:** Polyglot monorepo scaffolded with `pnpm` workspaces (`@schemaflow/ir-schema`, `@schemaflow/api`, `@schemaflow/web`) and Go 1.23+ compiler (`services/compiler`). Strict TypeScript base, initial unit tests, multi-stage Dockerfile, docker-compose, and GitHub Actions CI skeleton are established and passing 100%.

## Latest Completed Context (T01)
- **Files Added / Changed:**
  - `package.json` (Root workspace script runners)
  - `pnpm-workspace.yaml` (Workspace package paths)
  - `tsconfig.base.json` (`strict: true`, `noUncheckedIndexedAccess: true`)
  - `.gitignore`, `.env.example`, `.nvmrc`
  - `packages/ir-schema/package.json`, `packages/ir-schema/tsconfig.json`, `packages/ir-schema/src/index.ts`, `packages/ir-schema/src/index.test.ts`
  - `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/index.ts`, `apps/api/src/index.test.ts`
  - `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/src/config/brand.ts`, `apps/web/src/index.ts`, `apps/web/src/config/brand.test.ts`
  - `services/compiler/go.mod`, `services/compiler/cmd/compiler/main.go`, `services/compiler/cmd/compiler/main_test.go`
  - `infra/Dockerfile`, `infra/docker-compose.yml`, `.github/workflows/ci.yml`
- **Verification Status:** All TypeScript builds, tests, typechecks, and Go unit tests passing green.

---

## Task Checklist
- [x] **T1:** Monorepo setup (`pnpm` + Go 1.23), Multi-stage `Dockerfile`, CI skeleton (`4h`)
- [ ] **T2:** `packages/ir-schema` — IR v1.0 JSON Schema, `Ajv` validator (Postgres + Mongo rules), starter IRs (`5h`)
- [ ] **T3:** Dual Schema Importer — Relational (Prisma/SQL) + MongoDB (Mongoose/JSON) -> IR + Dagre auto-layout (`5h`)
- [ ] **T4:** Go Compiler Core (`services/compiler`) — `goroutine` template engine + in-memory `.zip` & OpenAPI 3.1 (`6h`)
- [ ] **T5:** Hand-written TypeScript + Express 5 + Mongoose reference app + shared CRUD acceptance runner (`4h`)
- [ ] **T6:** `/targets/typescript` — MongoDB (Mongoose) templates passing acceptance tests (`6h`)
- [ ] **T7:** `/targets/typescript` — PostgreSQL (Drizzle + SQL migrations) templates passing acceptance tests (`7h`)
- [ ] **T8:** UI Foundation, Stitch Light + Obsidian Dark tokens, Welcome Screen & Dual Import Modal (`7h`)
- [ ] **T9:** Drag-and-Drop React Flow Canvas, Simple/Advanced Nodes, Obsidian Glowing Edges & Inspector (`14h`)
- [ ] **T10:** Instant OpenAPI 3.1 Mock Preview Drawer (`@scalar/api-reference`) & File Tree Viewer (`4h`)
- [ ] **T11:** Fastify Control Plane API (`apps/api`) + Neon Postgres + `ICompilerAdapter` zip streaming (`7h`)
- [ ] **T12:** `/targets/python` — FastAPI + SQLAlchemy + Postgres templates passing acceptance tests (`7h`)
- [ ] **T13:** `/targets/go` — chi + pgx + Postgres templates passing acceptance tests (`7h`)[cite: 1]
- [ ] **T14:** Free Cloud Deployment (Vercel + Multi-stage container + Neon + Grafana Cloud + Terraform) (`4h`)
- [ ] **T15:** Final README, Architecture Diagram, `DECISIONS.md` review, `FLOW.md` review & Demo Video (`2h`)