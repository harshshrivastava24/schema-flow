# Master Execution Backlog: T01–T15 (v3.2 — Execution-Ready)

> **Planning estimate:** 92 hours is a rough initial estimate, not a delivery promise. Re-estimate after the first generated backend passes end-to-end tests.
> **Execution rule:** Follow the dependency-safe order below, not numeric task order. Complete verification and update `docs/PROGRESS.md` before tagging and merging.
>
> **Required execution order:** `T01 → T02 → T04 → T05 → T06 → T03 → T07 → T08 → T09 → T10 → T11 → T12 → T13 → T14 → T15`.
>
> **Milestone A:** T01, T02, T04, T05, T06 must pass before importer/UI work. This proves one generated backend works end to end. T03 is deliberately delayed until after this vertical slice, matching the SRS.

---

## Summary Schedule & Time Budget

**Important:** Task numbers identify work packages, not mandatory chronological order. Execute in the dependency-safe order stated above. T03 intentionally follows T06 so importer work does not delay the first end-to-end generated backend.



| Task | Phase | Title | Est. Hours | Suggested Day |
|---|---|---|---|---|
| **T01** | Phase 1: Foundation | Monorepo, Governance Files, Multi-Stage Docker & CI Skeleton | **4h** | Day 1 |
| **T02** | Phase 1: Foundation | `packages/ir-schema`: IR v1.0 Schema, Security Validator & Hasher | **5h** | Day 2 |
| **T03** | Phase 2: After vertical slice | `packages/ir-schema`: Client-Side Prisma & Mongo/Mongoose AST Importers | **7h** | After T06 |
| **T04** | Phase 2: Compiler Core | `services/compiler`: Go Engine, Canonical SQL DDL & Zip Streamer | **7h** | After T02 |
| **T05** | Phase 3: First vertical slice | Reference App (TS + Express 5 + Mongoose) & Shared Acceptance Runner | **4h** | After T04 |
| **T06** | Phase 3: First vertical slice | `/targets/typescript` (MongoDB / Mongoose Plugin) + CI Integration | **6h** | After T05 |
| **T07** | Phase 3: TS Targets | `/targets/typescript` (PostgreSQL / Drizzle Plugin + Canonical SQL) | **7h** | Days 9–10 |
| **T08** | Phase 4: Visual UI | `apps/web`: Theme Tokens, Topbar, Mode Toggle & Welcome/Import Screen | **7h** | Days 11–12 |
| **T09** | Phase 4: Visual UI | `apps/web`: Infinite React Flow Canvas, Nodes, GPU-Safe Edges & Inspector | **16h** | Days 13–16 |
| **T10** | Phase 4: Visual UI | `apps/web`: Instant Preview Drawer (Scalar OpenAPI + Code File Tree) | **4h** | Day 17 |
| **T11** | Phase 5: Platform API | `apps/api`: Fastify Control Plane, Auth, Guest Mode & `ICompilerAdapter` | **8h** | Days 18–19 |
| **T12** | Phase 6: Polyglot | `/targets/python`: FastAPI + SQLAlchemy 2.0 + Canonical SQL Target | **7h** | Day 20 |
| **T13** | Phase 6: Polyglot | `/targets/go`: chi + pgx/v5 + Canonical SQL Target | **7h** | Day 21 |
| **T14** | Phase 7: Launch | Production Cloud Deployment, Prometheus Metrics & Trivy CI Gate | **5h** | Day 22 |
| **T15** | Phase 7: Launch | Final Documentation, Architecture Polish & 3-Min Demo Video | **2h** | Day 23 |

---

# Task T01: Monorepo Setup, Governance Files, Multi-Stage Docker & CI Skeleton
* **Estimated Time:** 4 Hours
* **Dependencies:** None
* **Branch & Tag:** Work on `working` → tag `t01-done` → merge `--no-ff` to `staging`

### 1. Objective
Initialize the `pnpm` + Go polyglot monorepo, create governance files (`AGENTS.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/FLOW.md`, `docs/ui-spec.md`), add minimal compilable packages, and establish a CI skeleton. Add a buildable Dockerfile skeleton; defer final runtime packaging and blocking security gates until the required artifacts exist.

### 2. Exact Files to Create / Modify
* `package.json` (root workspace scripts: `build`, `test`, `lint`, `typecheck`)
* `pnpm-workspace.yaml` (`packages/*`, `apps/*`)
* `tsconfig.base.json` (strict TS config: `strict: true`, `noUncheckedIndexedAccess: true`)
* `.gitignore`, `.env.example`, `.nvmrc`
* `packages/ir-schema/package.json`, `packages/ir-schema/tsconfig.json`, `packages/ir-schema/src/index.ts`
* `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/index.ts`
* `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/src/config/brand.ts` (`export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "BackendGen";`)
* `services/compiler/go.mod` (`module github.com/harsh/backendgen/services/compiler`)
* `services/compiler/cmd/compiler/main.go` (minimal CLI printing `{"status":"ok","version":"1.0.0"}` on `--version`)
* `services/compiler/cmd/compiler/main_test.go` (initial unit test)
* `infra/Dockerfile` (initial buildable multi-stage skeleton; final compiler and target-template packaging is verified in T14)
* `infra/docker-compose.yml` (`postgres:16-alpine`, `api`, `web`)
* `.github/workflows/ci.yml` (runs checks that exist at this milestone; Trivy may initially be informational/non-blocking until dependency and container baselines are established)

### 3. Verification Commands & Exit Criteria
```bash
pnpm install
pnpm build
pnpm test
cd services/compiler && go test -v ./... && cd ../..


- **Done When:** All 4 commands exit `0`, `docs/PROGRESS.md` and `docs/FLOW.md` are updated, commit is tagged `t01-done`, and merged `--no-ff` to `staging`.

# Task T02: `packages/ir-schema` — IR v1.0 Contract, Security Validator & Semantic Hasher

- **Estimated Time:** 5 Hours
- **Dependencies:** T01
- **Branch & Tag:** Work on `working` → tag `t02-done` → merge `--no-ff` to `staging`

### 1. Objective

Implement the canonical IR v1.0 TypeScript types, JSON Schema (`Ajv`), semantic + anti-template-injection security validator (`FR-12`), decoupled `layout` schema (`FR-14`), deterministic semantic `SHA-256` content hasher (`FR-13`), and the 3 starter template IRs (`blog`, `shop`, `tracker`).

### 2. Exact Files to Create / Modify

- `packages/ir-schema/src/types.ts` (Full TypeScript interfaces: `IRDocument`, `ProjectConfig`, `Entity`, `Field`, `Relation`, `EndpointConfig`, `AuthConfig`, `CanvasLayout`)
- `packages/ir-schema/src/schema.json` (Strict JSON Schema Draft-07/2020-12 definition)
- `packages/ir-schema/src/security.ts`:
  - Identifier regex: `^[A-Za-z_][A-Za-z0-9_]{0,63}$` for entity, table, field, and role names.
  - Enum value regex: `^[A-Za-z0-9_-]{1,64}$`.
  - Default value allowlist: `uuid()`, `now()`, boolean literals (`"true"`, `"false"`), numeric literals, or valid enum member.
  - Reserved word blocklist (SQL, MongoDB `_id`, JS/TS, Python, Go keywords).
  - Hard limits: max `50` entities, max `100` fields per entity.
- `packages/ir-schema/src/validator.ts`:
  - Combines `Ajv` structural validation + semantic checks (no duplicate entity/field names, every entity has exactly one PK, no dangling `fromEntityId`/`toEntityId`, no non-nullable self-referencing FK cycles, `project.database` compatibility check).
  - Returns structured `{ valid: boolean, errors: IRValidationError[] }` with `entityId` / `fieldId` / `relationId` pointers for UI badges (`FR-05`).
- `packages/ir-schema/src/hash.ts`:
  - `computeSemanticHash(ir: IRDocument): string` — extracts ONLY `{ irVersion, project, entities, relations, endpoints, auth }` (explicitly excluding `layout`), recursively sorts object keys, and returns hex `SHA-256`.
- `packages/ir-schema/src/templates/` (`blog.json`, `shop.json`, `tracker.json` — valid starter IRs with pre-populated `layout.nodes`).
- `packages/ir-schema/tests/validator.test.ts` & `packages/ir-schema/tests/hash.test.ts` (Vitest suite covering valid IRs, SQL/Mongo reserved words, code-injection strings like `User"; DROP TABLE--`, dangling FKs, and proving that changing `layout.nodes[id].x` does NOT change `computeSemanticHash(ir)`).

### 3. Verification Commands & Exit Criteria

```bash
pnpm --filter @backendgen/ir-schema build
pnpm --filter @backendgen/ir-schema test

```

- **Done When:** 100% of unit tests (minimum 20 test cases) pass, including template injection rejection and layout-hash invariance.

# Task T03: `packages/ir-schema` — Client-Side Dual Schema Importer (Prisma + Mongo/Mongoose AST)

- **Estimated Time:** 7 Hours (3h Prisma + 3h Mongo/Mongoose AST + 1h Dagre layout & tests)
- **Dependencies:** T02
- **Branch & Tag:** Work on `working` → tag `t03-done` → merge `--no-ff` to `staging`

### 1. Objective

After T06 proves end-to-end generation for one target, build browser-side importers for documented subsets of Prisma schema, Mongoose AST, and sample MongoDB JSON. Import produces candidate IR plus warnings for user review; it does not promise to reconstruct an authoritative schema from a sample document.

### 2. Exact Files to Create / Modify

- `packages/ir-schema/src/importers/prisma-importer.ts`:
  - Parses `model <Name> { ... }` and `enum <Name> { ... }` blocks from `schema.prisma`.
  - Maps only explicitly supported Prisma syntax, types, attributes, and relation forms. Unsupported or ambiguous syntax returns actionable diagnostics instead of being silently approximated.
  - Sets `project.database = "postgres"`.
- `packages/ir-schema/src/importers/mongo-importer.ts`:
  - **Mode A (MongoDB JSON Sample):** Accepts JSON objects or named collection samples and infers candidate field types. Ambiguous types and possible ObjectId references are marked for user confirmation.
  - **Mode B (Mongoose AST Parser — ZERO `eval`):** Uses `@babel/parser` (`sourceType: "module"`, plugins `["typescript"]`) to parse `new Schema({ ... })` or `mongoose.Schema({ ... })` AST nodes. Reads ONLY static `ObjectExpression`, `Identifier`, and `Literal` nodes (`type: String`, `required: true`, `unique: true`, `enum: [...]`, `ref: 'User'`). Rejects any function execution.
  - Sets `project.database = "mongodb"`.
- `packages/ir-schema/src/importers/layout-dagre.ts`:
  - Runs `@dagrejs/dagre` (`rankdir: "LR"`, `nodesep: 80`, `ranksep: 140`) over imported entities and relations, populating `ir.layout.nodes[entityId] = { x, y, color }` cycling through the 6-color palette (`lime`, `coral`, `teal`, `amber`, `violet`, `sky`).
- `packages/ir-schema/src/importers/index.ts` (Unified `importSchema(input: string, kind: 'prisma' | 'mongodb'): ImportResult` entry point).
- `packages/ir-schema/tests/importers.test.ts` (Tests multi-model Prisma schema, Mongoose schema with `ref` and `enum`, raw Mongo JSON, malicious JS `process.exit(1)` inside Mongoose input, and verifies Dagre assigns non-overlapping `{ x, y }` coordinates).

### 3. Verification Commands & Exit Criteria

```bash
pnpm --filter @backendgen/ir-schema build
pnpm --filter @backendgen/ir-schema test

```

- **Done When:** Supported inputs produce valid IR or actionable diagnostics; malicious JavaScript is never executed; ambiguous inference is flagged for review. Record importer timing, but do not make `<50 ms` a blocking requirement without representative fixtures.

# Task T04: `services/compiler` — Go Compiler Core, Canonical SQL DDL & Deterministic Zip Engine

- **Estimated Time:** 7 Hours
- **Dependencies:** T02
- **Branch & Tag:** Work on `working` → tag `t04-done` → merge `--no-ff` to `staging`

### 1. Objective

Build the stateless Go compiler CLI invoked by the API adapter. Define the target manifest contract and renderer interface, semantic IR validation, canonical PostgreSQL DDL, OpenAPI 3.1 generation, and deterministic in-memory ZIP output. Render sequentially first. Include a minimal test target/fixture so protocol tests do not depend on T06. Do not add an HTTP mode unless a concrete caller requires it.

### 2. Exact Files to Create / Modify

- `services/compiler/internal/ir/types.go` (Go structs matching `IRDocument` v1.0 + identifier sanitization check).
- `services/compiler/internal/ddl/postgres_ddl.go`:
  - **Canonical SQL Generator:** Given any `postgres` IR, emits deterministic `migrations/0001_init.sql` with `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`, enum `CREATE TYPE` statements, `CREATE TABLE` in topological dependency order, foreign keys (`ON DELETE CASCADE/SET NULL/RESTRICT`), explicit `N:M` join tables, and `CREATE INDEX` on foreign keys and unique fields.
- `services/compiler/internal/openapi/generator.go`:
  - Generates a valid **OpenAPI 3.1 (`openapi.json`)** specification with schemas, CRUD paths (`/api/<entities>`, `/api/<entities>/{id}`), JWT Bearer security schemes, and realistic example payloads for `@scalar/api-reference`.
- `services/compiler/internal/engine/manifest.go` (Loads `/targets/<lang>/manifest.yaml` and selects `/storage/mongodb` or `/storage/postgres` template sets).
- `services/compiler/internal/engine/renderer.go`:
  - Renders templates sequentially initially; add concurrency only if profiling demonstrates a benefit and deterministic output is preserved.
  - Runs `go/format` (`gofmt`) automatically on generated `.go` files.
  - Sorts all output file paths alphabetically and writes them into an in-memory `archive/zip` buffer with fixed header timestamp `2026-01-01T00:00:00Z` (`FR-25`).
- `services/compiler/cmd/compiler/main.go`:
  - Accepts one UTF-8 JSON request on stdin terminated by EOF. For `operation=preview`, stdout is JSON `{ openapi, files: [{ path, language? }], diagnostics, compilerVersion }`; generated source contents are not included. For `operation=download`, stdout contains raw ZIP bytes only. Logs go to stderr; never append JSON after ZIP bytes. Exit status indicates failure.
- `services/compiler/internal/engine/compiler_test.go` (Tests protocol framing, canonical SQL generation, OpenAPI 3.1 output, stable file ordering, unsupported-target diagnostics, and byte-identical ZIP output. Include a 20-entity benchmark, but do not fail CI solely for missing the 100 ms goal before a baseline is established).

### 3. Verification Commands & Exit Criteria

```bash
cd services/compiler && go test -v -race ./... && cd ../..

```

- **Done When:** Go tests pass with `-race`; preview/download framing is tested; unsupported inputs fail cleanly; identical requests produce byte-identical ZIPs. Record the benchmark and environment.

# Task T05: Reference App (`typescript` + `mongodb`) & Shared HTTP Acceptance Runner

- **Estimated Time:** 4 Hours
- **Dependencies:** T04
- **Branch & Tag:** Work on `working` → tag `t05-done` → merge `--no-ff` to `staging`

### 1. Objective

Write the clean, hand-crafted reference application for **TypeScript + Express 5 + Mongoose (`mongodb`)** using the `blog.json` starter IR, and build the language-agnostic **Shared Acceptance Test Runner** that every generated backend (TS+Mongo, TS+Postgres, Python+Postgres, Go+Postgres) must pass in CI.

### 2. Exact Files to Create / Modify

- `targets/typescript/reference-app-mongo/`:
  - `package.json`, `tsconfig.json`, `.env.example`, `Dockerfile`, `docker-compose.yml`
  - `src/generated/` (`server.ts`, `db.ts`, `models/User.ts`, `models/Post.ts`, `routes/user.routes.ts`, `routes/post.routes.ts`, `middleware/auth.ts`, `openapi.json`)
  - `src/custom/hooks/` (typed pre/post hook stubs demonstrating the `generated/` vs `custom/` ownership split)
- `packages/acceptance-suite/` (or `tests/acceptance/run-acceptance.ts`):
  - Language-agnostic HTTP test script (using Node `fetch` / Vitest) that takes `BASE_URL`:
    1. `GET /healthz` → `200 OK`
    2. `POST /api/auth/register` & `POST /api/auth/login` → returns valid JWT token
    3. `POST /api/users` (Create entity) → `201 Created` (validates Zod/Pydantic/Go schema validation on bad input → `400`)
    4. `GET /api/users` (List entities) & `GET /api/users/:id` (Get by ID) → `200 OK`
    5. `PATCH /api/users/:id` (Update entity) → `200 OK`
    6. `DELETE /api/users/:id` (Delete entity) → `204/200` and subsequent `GET` → `404`

### 3. Verification Commands & Exit Criteria

```bash
cd targets/typescript/reference-app-mongo && pnpm install && pnpm tsc --noEmit && pnpm test && cd ../../..

```

- **Done When:** The reference app passes `tsc --noEmit` with zero errors and passes the CRUD + Auth acceptance test suite (using `mongodb-memory-server` locally or Mongo service container in CI).

# Task T06: `/targets/typescript` — MongoDB (Express 5 + Mongoose) Plugin & CI Matrix

- **Estimated Time:** 6 Hours
- **Dependencies:** T04, T05
- **Branch & Tag:** Work on `working` → tag `t06-done` → merge `--no-ff` to `staging`

### 1. Objective

Extract the hand-written TS+Mongo reference app into Go templates under `/targets/typescript/storage/mongodb` so `polyglot-compiler` can generate a complete runnable **TypeScript + Express 5 + Mongoose + Zod + JWT** backend from any valid MongoDB IR.

### 2. Exact Files to Create / Modify

- `targets/typescript/manifest.yaml` (declares only implemented capabilities: initially `mongodb`; add `postgres` only after T07 passes its acceptance suite)
- `targets/typescript/storage/mongodb/templates/`:
  - `package.json.tmpl`, `tsconfig.json.tmpl`, `Dockerfile.tmpl`, `docker-compose.yml.tmpl`, `.env.example.tmpl`, `README.md.tmpl`
  - `src/generated/db.ts.tmpl`, `src/generated/app.ts.tmpl`, `src/generated/auth.ts.tmpl`
  - `src/generated/models/{{entity.snake}}.model.ts.tmpl` (handles `_id` → `id` virtual transform, `ObjectId` refs for `1:N` and `[ObjectId]` arrays for `N:M`, and Mongoose indexes)
  - `src/generated/schemas/{{entity.snake}}.schema.ts.tmpl` (Zod validation schemas)
  - `src/generated/routes/{{entity.snake}}.routes.ts.tmpl` (Express 5 CRUD handlers honoring `endpoints[].ops` and `authRequired`)
- `services/compiler/internal/engine/ts_mongo_test.go` (Compiles `blog` IR with `database: "mongodb"`, extracts to temp dir, runs `tsc --noEmit` + acceptance suite).
- Update `.github/workflows/ci.yml` to add the `ts-mongodb` static check (`tsc --noEmit`) + acceptance job.

### 3. Verification Commands & Exit Criteria

```bash
cd services/compiler && go test -v -run TestCompileTypeScriptMongo ./... && cd ../..

```

- **Done When:** Go compiler generates a TS+Mongo project from `blog.json`; generated code builds, starts against MongoDB, and passes the shared HTTP CRUD/auth acceptance suite. Record generation timing without making `<100 ms` a blocking gate.

# Task T07: `/targets/typescript` — PostgreSQL (Express 5 + Drizzle + Canonical SQL) Plugin

- **Estimated Time:** 7 Hours
- **Dependencies:** T04, T06
- **Branch & Tag:** Work on `working` → tag `t07-done` → merge `--no-ff` to `staging`

### 1. Objective

Implement `/targets/typescript/storage/postgres` so `polyglot-compiler` generates a runnable **TypeScript + Express 5 + Drizzle ORM (`pg`) + Zod + JWT** backend. Apply the compiler-emitted canonical `migrations/0001_init.sql` through an explicit migration command and migration ledger, not by replaying raw DDL on every application startup.

### 2. Exact Files to Create / Modify

- `targets/typescript/storage/postgres/templates/`:
  - `package.json.tmpl` (includes `drizzle-orm`, `pg`, `zod`, `express`, `jsonwebtoken`)
  - `src/generated/db.ts.tmpl` (connects `pg.Pool`; applies migrations through an explicit command and migration ledger, not by replaying raw DDL on every app startup)
  - `src/generated/schema.ts.tmpl` (Drizzle `pgTable`, `uuid`, `varchar`, `integer`, `numeric`, `boolean`, `timestamp`, `pgEnum`, and join tables matching `0001_init.sql`)
  - `src/generated/routes/{{entity.snake}}.routes.ts.tmpl` (Drizzle CRUD queries honoring `endpoints[].ops` and `authRequired`)
  - `Dockerfile.tmpl`, `docker-compose.yml.tmpl` (`postgres:16-alpine`), `.env.example.tmpl`
- `services/compiler/internal/engine/ts_postgres_test.go` (Verifies `0001_init.sql` + Drizzle codegen passes `tsc --noEmit` and CRUD tests).
- Update `.github/workflows/ci.yml` to run `ts-postgres` static check + Postgres service container acceptance test.

### 3. Verification Commands & Exit Criteria

```bash
cd services/compiler && go test -v -run TestCompileTypeScriptPostgres ./... && cd ../..

```

- **Done When:** Generated TS+Postgres project passes `tsc --noEmit`, applies `migrations/0001_init.sql` cleanly against Postgres, and passes all shared CRUD + Auth acceptance tests.

# Task T08: `apps/web` — UI Foundation, Dual Theme Tokens, Welcome Screen & Schema Importer UI

- **Estimated Time:** 7 Hours
- **Dependencies:** T02, T03
- **Branch & Tag:** Work on `working` → tag `t08-done` → merge `--no-ff` to `staging`

### 1. Objective

Build the Next.js frontend foundation implementing the **Unified Theme System** (Stitch Industrial Concrete Light + Obsidian Studio Dark via `data-theme="light|dark"`), the **Zustand + Zundo (Undo/Redo) IR Store**, the Topbar (`Simple` / `Advanced` mode toggle, Database selector `Postgres` / `MongoDB`, Theme toggle), and **Stitch Screen 1 (Welcome / Launch Screen)** with the 3 one-click starter templates. Import tabs are enabled only after T03 passes; unsupported formats must show diagnostics rather than fabricate IR (`Blog`, `Online Store`, `Task Tracker`).

### 2. Exact Files to Create / Modify

- `apps/web/src/styles/tokens.css` (Exact CSS variables from `docs/ui-spec.md`: `--radius-sm: 2px`, `--border-w: 1.5px`, `3px 3px 0px` hard offset shadows, `#B5F425` primary accent, 6-color entity header variables).
- `apps/web/src/store/useProjectStore.ts`:
  - Zustand store wrapped with `zundo` (`temporal`) middleware for Undo/Redo (`FR-06`) and `localStorage` persistence for Guest Mode (`FR-40`).
  - State: `ir: IRDocument`, `validationErrors: IRValidationError[]`, `displayMode: 'simple' | 'advanced'`, `theme: 'light' | 'dark'`, `selectedNodeId`, `selectedEdgeId`, `isPreviewOpen`.
  - Actions: `loadTemplate(name)`, `importSchemaText(text, kind)`, `addEntity()`, `updateEntity()`, `deleteEntity()`, `addField()`, `updateField()`, `removeField()`, `addRelation()`, `updateNodePosition()`, `toggleEndpointOp()`.
- `apps/web/src/components/layout/Topbar.tsx` (Brand logo using `APP_NAME`, Project Name input, DB badge/selector, `Simple | Advanced` segmented pill control, Theme switch, `IMPORT`, `PREVIEW`, and Acid Lime `GENERATE` CTA button).
- `apps/web/src/components/welcome/WelcomeScreen.tsx` (Stitch Screen 1):
  - Mode selector cards (`Simple Mode` vs `Advanced Mode`).
  - **Dual Schema Importer Modal/Tabs:** Tab A (`Relational — schema.prisma`) and Tab B (`MongoDB — Mongoose Schema / JSON`) calling `importSchema()` from `@backendgen/ir-schema` in the browser with sample "Load Example" buttons and instant validation feedback.
  - 3 Starter Template cards (`Blog & Publications`, `Online Store`, `Task & Project Tracker`).
- `apps/web/tests/store.test.ts` (Vitest unit tests verifying template loading, Prisma/Mongo import into store, Simple/Advanced mode toggle, and Undo/Redo state restoration).

### 3. Verification Commands & Exit Criteria

```bash
pnpm --filter @backendgen/web build
pnpm --filter @backendgen/web test

```

- **Done When:** Next.js builds cleanly, Light and Dark themes switch with zero layout shift, and both Starter Templates and Prisma/Mongoose imports populate the Zustand store with positioned nodes.

# Task T09: `apps/web` — Infinite React Flow Canvas, Entity Nodes, GPU-Safe Obsidian Edges & Inspector

- **Estimated Time:** 16 Hours (Split across 3–4 days: 5h Entity Nodes + 4h GPU-Safe Edges + 5h Right Inspector + 2h Dock & Shortcuts)
- **Dependencies:** T08
- **Branch & Tag:** Work on `working` → tag `t09-done` → merge `--no-ff` to `staging`

### 1. Objective

Implement the core interactive visual modeling experience (Stitch Screens 2 & 3): the React Flow (`@xyflow/react`) infinite canvas, custom **Entity Node Cards** (adapting dynamically between `Simple` and `Advanced` modes with the 6-color header palette and validation error badges), **GPU-safe Obsidian Bezier Relation Edges** (glowing and animated on hover/selected), the **Left Icon Rail & Bottom Floating Dock** (`[+ ADD BLOCK]`, Undo/Redo, Zoom, Auto-Layout), and the **Right Inspector Panel** (`FIELDS`, `API`, `RULES` tabs).

### 2. Exact Files to Create / Modify

- `apps/web/src/components/canvas/BackendCanvas.tsx`:
  - Wraps `@xyflow/react` `<ReactFlow>`, `<Background variant="dots" />`, `<MiniMap />`, drag-and-drop block creation (`onDrop`), keyboard shortcuts (`Delete`/`Backspace`, `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, `Ctrl/Cmd+S`), and syncs node dragging strictly to `ir.layout.nodes[id]` (`FR-14`).
- `apps/web/src/components/canvas/EntityNode.tsx`:
  - Sharp `2px` radius card with `3px 3px 0px` offset shadow and 6-color header bar (`lime`, `coral`, `teal`, `amber`, `violet`, `sky`).
  - **Simple Mode:** Friendly type labels (`Text`, `Number`, `Yes/No`, `Date & Time`, `Choice List`), hides system `id`/`*_id` rows.
  - **Advanced Mode:** Shows `string`, `uuid`, `int`, `timestamp` + `[PK]`, `[FK]`, `[UQ]`, `[REQ]` mono badges.
  - Displays real-time warning/error badge (`FR-05`) from `validationErrors` if entity or fields are invalid.
- `apps/web/src/components/canvas/ObsidianRelationEdge.tsx` (`FR-03`, `FR-56`):
  - Uses `getBezierPath`. Renders crisp `2px` stroke colored by source entity header color.
  - **GPU Protection Rule:** Renders the outer glow path (`strokeWidth={6}`, `filter="drop-shadow(...)"`) and CSS `strokeDasharray` animation **ONLY when `selected` or `isHovered` is true** (and respects `prefers-reduced-motion`).
  - Renders centered interactive pill badge (`EdgeLabelRenderer`) showing `HAS MANY` / `MANY TO MANY` in Simple Mode and `1 : N` / `N : M` in Advanced Mode.
- `apps/web/src/components/canvas/BottomDock.tsx` & `LeftRail.tsx`:
  - `[+ ADD ENTITY]`, `[+ AUTH BLOCK]`, `[AUTO LAYOUT]` (re-runs Dagre), Undo/Redo buttons, Zoom controls.
- `apps/web/src/components/inspector/RightInspector.tsx`:
  - **Tab 1 (`FIELDS`):** Add, rename, change type, reorder, toggle `required`/`unique`, edit `default` & `enumValues`, change entity header color.
  - **Tab 2 (`API`):** Toggle REST CRUD endpoints (`GET list`, `GET by id`, `POST create`, `PATCH update`, `DELETE`) and `authRequired` lock switch (`FR-04`).
  - **Tab 3 (`RULES` / Relations & Auth):** Configure relation cardinality (`1:1`, `1:N`, `N:M`), `onDelete` behavior (`CASCADE`, `SET NULL`), and JWT Auth roles (`FR-07`).
- `apps/web/tests/canvas.test.ts` (Component/store integration tests verifying node creation, field editing, relation linking, validation badge triggering, and 30-edge render performance).

### 3. Verification Commands & Exit Criteria

```bash
pnpm --filter @backendgen/web build
pnpm --filter @backendgen/web test

```

- **Done When:** Full drag-and-drop entity creation, field editing, edge linking, Simple/Advanced switching, Undo/Redo, and live validation badges work smoothly in both Light and Dark themes.

# Task T10: `apps/web` — Instant Interactive API Preview & Code File Tree Drawer

- **Estimated Time:** 4 Hours
- **Dependencies:** T09
- **Branch & Tag:** Work on `working` → tag `t10-done` → merge `--no-ff` to `staging`

### 1. Objective

Build the slide-over **Instant Preview Drawer (`FR-34`)** triggered from the Topbar `PREVIEW` button with two tabs:

1. **Tab 1 (`API PLAYGROUND`):** Renders the live OpenAPI 3.1 specification inside `@scalar/api-reference` (or interactive endpoint tester) with realistic mock responses generated from the active IR.
2. **Tab 2 (`GENERATED FILES`):** Renders a clean, collapsible directory tree (`src/generated/...`, `migrations/0001_init.sql`, `Dockerfile`, `openapi.json`) and a syntax-highlighted read-only `<pre><code>` viewer with a "Copy File" button and Target selector (`TypeScript + Mongo`, `TypeScript + Postgres`, `Python + FastAPI`, `Go + chi`).

### 2. Exact Files to Create / Modify

- `apps/web/src/components/preview/PreviewDrawer.tsx` (Slide-over drawer with Target selector dropdown and `API Playground | File Tree` tabs).
- `apps/web/src/components/preview/OpenApiPlayground.tsx` (Embeds `@scalar/api-reference-react` or lightweight fallback OpenAPI 3.1 interactive inspector).
- `apps/web/src/components/preview/FileTreeViewer.tsx` (Collapsible folder tree + syntax-highlighted code pane + file size indicator + Copy button).
- `apps/web/src/lib/client-preview-fallback.ts` (Shows a clear unavailable state if the compiler API is offline. It may preview the current IR locally, but must never label placeholder, stale, or fabricated files as compiler output. When connected, call `POST /api/compile/preview`.)

### 3. Verification Commands & Exit Criteria

```bash
pnpm --filter @backendgen/web build
pnpm --filter @backendgen/web test

```

- **Done When:** Clicking `PREVIEW` opens the drawer, switches between OpenAPI and generated files for targets whose compiler support and acceptance tests are green; unsupported targets are disabled with a clear status, and builds with zero TypeScript errors.

# Task T11: `apps/api` — Fastify Control Plane, Auth, Guest Mode, DB & `ICompilerAdapter`

- **Estimated Time:** 8 Hours
- **Dependencies:** T04, T10
- **Branch & Tag:** Work on `working` → tag `t11-done` → merge `--no-ff` to `staging`

### 1. Objective

Implement the Node.js/Fastify Control Plane (`apps/api`) with Drizzle ORM + PostgreSQL (Neon Serverless compatible), `argon2` + Bearer JWT authentication, **Guest Mode support** (so unauthenticated users can compile and download `.zip` archives immediately), semantic `SHA-256` version deduplication (`FR-13`), lightweight layout autosave (`PATCH /api/projects/:id/layout`), Prometheus `/metrics`, and the hexagonal `ICompilerAdapter` (`LocalBinaryCompilerAdapter`) bridging Fastify to the Go `polyglot-compiler` binary. Configure a same-origin Next.js rewrite to the API service URL. Treat it as routing convenience, not an authentication or CSRF security control.

### 2. Exact Files to Create / Modify

- `apps/api/src/db/schema.ts` (Drizzle schema: `users`, `projects`, `ir_versions`, `builds`).
- `apps/api/src/adapters/compiler.port.ts`:
  - Defines `ICompilerAdapter` interface (`preview(ir, target)` and `compileZip(ir, target)`).
  - Implements `LocalBinaryCompilerAdapter` (spawns `COMPILER_BIN_PATH` via `child_process.spawn`, pipes IR JSON to `stdin`, separates preview JSON from ZIP-only download stdout, captures stderr separately, enforces request/output limits and a configurable timeout, and supports ZIP streaming where feasible).
  - Cloud-queue mode is out of scope for v1; do not expose a selectable mode that cannot run.
- `apps/api/src/routes/auth.routes.ts` (`POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me` with `argon2` hashing and Bearer JWT).
- `apps/api/src/routes/projects.routes.ts`:
  - `GET /api/projects`, `POST /api/projects`, `DELETE /api/projects/:id`
  - `GET /api/projects/:id/ir`, `PUT /api/projects/:id/ir` (computes `computeSemanticHash(ir)`; creates a new `ir_versions` row ONLY if `content_hash` changed since the latest version; always updates `projects.layout_json`).
  - `PATCH /api/projects/:id/layout` (updates `projects.layout_json` in place without creating a new `ir_versions` row).
  - `GET /api/projects/:id/versions` (returns version history with `version_number`, `content_hash`, `created_at`).
- `apps/api/src/routes/compile.routes.ts`:
  - `POST /api/compile/preview` and `POST /api/compile/download` (available to guests and authenticated users, rate-limited and size-limited; preview returns JSON, download streams `application/zip` with `Content-Disposition: attachment`).
- `apps/api/src/routes/observability.routes.ts` (`GET /healthz`, `GET /readyz`, `GET /metrics` via `prom-client`).
- `apps/web/next.config.mjs` (Configures `/api/:path*` rewrite proxy to `process.env.API_INTERNAL_URL || 'http://localhost:4000/api/:path*'`).
- `apps/api/tests/api.test.ts` (Integration tests verifying Auth, Semantic Hash deduplication on `PUT /ir`, `PATCH /layout` non-versioning, and live Go compiler `.zip` streaming).

### 3. Verification Commands & Exit Criteria

```bash
pnpm --filter @backendgen/api build
pnpm --filter @backendgen/api test

```

- **Done When:** Clicking `GENERATE` invokes Fastify → Go compiler and downloads a valid ZIP; compile timing is measured separately. Saving an IR where only node coordinates changed does not increment the semantic version.

# Task T12: `/targets/python` — FastAPI + SQLAlchemy 2.0 + Pydantic v2 + Canonical SQL Target

- **Estimated Time:** 7 Hours
- **Dependencies:** T04, T05
- **Branch & Tag:** Work on `working` → tag `t12-done` → merge `--no-ff` to `staging`

### 1. Objective

Create the decoupled `/targets/python` plugin so `polyglot-compiler` generates a complete, idiomatic **Python 3.12 + FastAPI + SQLAlchemy 2.0 + Pydantic v2 + JWT** backend for PostgreSQL that applies the compiler's canonical `migrations/0001_init.sql` through an explicit migration command and migration ledger and passes both static analysis (`ruff check`, `python -m compileall`) and the shared HTTP CRUD/Auth acceptance suite.

### 2. Exact Files to Create / Modify

- `targets/python/manifest.yaml` (declares `database: ["postgres"]` and template mappings).
- `targets/python/storage/postgres/templates/`:
  - `requirements.txt.tmpl` / `pyproject.toml.tmpl`, `Dockerfile.tmpl`, `docker-compose.yml.tmpl`, `.env.example.tmpl`, `README.md.tmpl`
  - `app/generated/database.py.tmpl` (SQLAlchemy engine + startup execution of `migrations/0001_init.sql`)
  - `app/generated/models.py.tmpl` (SQLAlchemy 2.0 `Mapped` / `mapped_column` models matching `0001_init.sql`)
  - `app/generated/schemas.py.tmpl` (Pydantic v2 `Create`, `Update`, and `Response` models with strict field validation)
  - `app/generated/auth.py.tmpl` (JWT `/api/auth/register`, `/api/auth/login`, and `get_current_user` dependency)
  - `app/generated/routers/{{entity.snake}}.py.tmpl` (FastAPI `APIRouter` implementing toggled CRUD endpoints)
  - `app/main.py.tmpl` (FastAPI app mounting `/healthz`, `/api/auth`, entity routers, and `openapi.json`)
  - `app/custom/hooks.py.tmpl` (Safe custom hook stubs)
- `services/compiler/internal/engine/python_postgres_test.go` (Compiles `blog.json` to Python target, runs `python -m compileall` + `ruff check` if installed, and validates generated files).
- Update `.github/workflows/ci.yml` to add the `python-postgres` static check + Postgres CRUD acceptance test job.

### 3. Verification Commands & Exit Criteria

```bash
cd services/compiler && go test -v -run TestCompilePythonPostgres ./... && cd ../..

```

- **Done When:** Generated Python + FastAPI project passes `python -m compileall` / `ruff check` and passes 100% of the shared HTTP CRUD + Auth acceptance tests against PostgreSQL.

# Task T13: `/targets/go` — chi Router + pgx/v5 + Canonical SQL Target

- **Estimated Time:** 7 Hours
- **Dependencies:** T04, T05
- **Branch & Tag:** Work on `working` → tag `t13-done` → merge `--no-ff` to `staging`

### 1. Objective

Create the decoupled `/targets/go` plugin so `polyglot-compiler` generates a **Go + `chi/v5` + `jackc/pgx/v5` + JWT** backend for PostgreSQL that formats cleanly via `gofmt`, passes `go vet ./...` and `go build ./...`, and applies `migrations/0001_init.sql` through an explicit migration command and migration ledger, and passes the shared HTTP CRUD/Auth acceptance suite.

### 2. Exact Files to Create / Modify

- `targets/go/manifest.yaml` (declares `database: ["postgres"]` and template mappings).
- `targets/go/storage/postgres/templates/`:
  - `go.mod.tmpl`, `Dockerfile.tmpl`, `docker-compose.yml.tmpl`, `.env.example.tmpl`, `README.md.tmpl`
  - `cmd/server/main.go.tmpl` (connects `pgxpool`, executes `migrations/0001_init.sql`, mounts `chi` router and `/healthz`)
  - `internal/generated/models.go.tmpl` (Go structs with `json` tags and request validation)
  - `internal/generated/auth.go.tmpl` (JWT signup/login handlers and Bearer middleware)
  - `internal/generated/handlers_{{entity.snake}}.go.tmpl` (Parameterized `pgx` SQL CRUD handlers for `list`, `get`, `create`, `update`, `delete`)
  - `internal/custom/hooks.go.tmpl` (Custom business logic hook stubs)
- `services/compiler/internal/engine/go_postgres_test.go` (Compiles `blog.json` to Go target, runs `gofmt` check, `go vet ./...`, and `go build ./...`).
- Update `.github/workflows/ci.yml` to add the `go-postgres` static check (`go vet`) + Postgres CRUD acceptance test job.

### 3. Verification Commands & Exit Criteria

```bash
cd services/compiler && go test -v -run TestCompileGoPostgres ./... && cd ../..

```

- **Done When:** Generated Go project compiles cleanly with `go vet ./... && go build ./...` and passes 100% of the shared HTTP CRUD + Auth acceptance tests against PostgreSQL.

# Task T14: Production Cloud Deployment, Observability & Security Gate

- **Estimated Time:** 5 Hours
- **Dependencies:** T11, T12, T13
- **Branch & Tag:** Work on `working` → tag `t14-done` → merge `--no-ff` to `staging`

### 1. Objective

Finalize the production deployment pipeline: verify the multi-stage image packages the API, compiler binary, and implemented target templates; run as non-root and measure memory rather than enforcing an unverified `<550 MB` cap, add declarative cloud deployment configs (`infra/render.yaml` / `koyeb.yaml`), verify `/metrics` Prometheus instrumentation for Grafana Cloud, and ensure the full 4-target CI matrix + `Trivy` security scan is green.

### 2. Exact Files to Create / Modify

- `infra/Dockerfile` (Verify `/targets` templates and `/usr/local/bin/polyglot-compiler` are copied into the final runtime stage with non-root permissions and `HEALTHCHECK` configured).
- `infra/docker-compose.yml` (Full local self-hosted stack verification).
- `infra/render.yaml` (Declarative free-tier Blueprint for deploying the multi-stage API+Compiler Docker container + Neon Postgres connection).
- `infra/prometheus.yml` (Local Prometheus / Grafana Cloud scrape config targeting `/metrics`).
- `.github/workflows/ci.yml` (Verify all 4 P0 target acceptance jobs + `Trivy` scan run cleanly).

### 3. Verification Commands & Exit Criteria

```bash
docker build -f infra/Dockerfile -t backendgen-api:latest .
pnpm build && pnpm test
cd services/compiler && go test -v ./... && cd ../..

```

- **Done When:** Multi-stage Docker image builds cleanly, container boots as non-root, serves `/healthz` and `/readyz`, preview/download work, and the supported-target CI matrix is green. Record latency and memory measurements.

# Task T15: Final Documentation, Architecture Polish & 3-Minute Demo Video

- **Estimated Time:** 2 Hours
- **Dependencies:** T14
- **Branch & Tag:** Work on `working` → tag `t15-done` → merge `--no-ff` to `staging` → Harsh reviews and merges `staging` to `main`

### 1. Objective

Polish the repository for technical evaluators and interviewers: write a comprehensive root `README.md` with Mermaid architecture diagrams, measured benchmark numbers with hardware, runtime, fixture size, warm/cold methodology, and memory-measurement method; do not publish targets as achieved unless measured, live deployment links, and a 2–3 minute walkthrough video script demonstrating only implemented and verified features; show schema import only if T03 is complete and supported targets only when their acceptance suites pass.

### 2. Exact Files to Create / Modify

- `README.md` (Architecture overview, quickstart commands, 4-target feature matrix, security & determinism highlights, screenshots).
- `docs/DECISIONS.md` (Final review of all ADRs recorded during `T01`–`T14`).
- `docs/FLOW.md` (Final verification that every documented file path matches the repository tree).
- `docs/PROGRESS.md` (Mark all 15 tasks `[x]` complete).

### 3. Verification Commands & Exit Criteria

```bash
pnpm build && pnpm test
cd services/compiler && go test ./... && cd ../..
git status

```

- **Done When:** All 15 tasks are marked `[x]` in `docs/PROGRESS.md`, `t15-done` is tagged and merged to `staging`, and the project is ready for your final merge into `main`.


---

## Mandatory Rules for Splitting This Backlog into Individual Task Files

Every `Txx.md` file must retain these sections:

1. **Task ID and title**
2. **Dependencies** — list task IDs and the exact artifacts/contracts expected from them.
3. **Allowed scope** — files this task may create/change and files it must not refactor.
4. **Preflight** — inspect `AGENTS.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/FLOW.md`, the SRS, git status, and dependency acceptance evidence.
5. **Implementation steps** — ordered steps; no unrelated refactors or speculative features.
6. **Verification commands** — exact commands and working directory.
7. **Acceptance criteria** — observable behavior, not just file existence or a successful build.
8. **Failure behavior** — if dependencies are missing, tests fail, or scope exceeds the estimate, stop and report evidence. Do not mark the task complete.
9. **Handoff** — update progress, flow/decision docs when applicable, list changed files and test output, then commit/tag/merge only after verification passes.

### Cross-Task Contracts That Must Never Drift

- **Compiler protocol:** preview returns JSON `{ openapi, files: [{ path, language? }], diagnostics, compilerVersion }`; download returns raw ZIP bytes only. Logs go to stderr.
- **Supported targets:** advertise only targets whose build and shared acceptance tests pass. Do not show an unimplemented target as available.
- **Migrations:** apply PostgreSQL migrations through an explicit migration command/entrypoint and track them in a migration ledger. Do not replay non-idempotent DDL on every startup.
- **Acceptance responses:** create returns `201`; delete returns `204`; missing resources return `404`; validation errors `400`; uniqueness conflicts `409`; unauthenticated requests `401`.
- **Authentication:** platform auth and generated-app auth are separate. The Next.js rewrite is not a security boundary. Never log passwords, tokens, or secrets.
- **Schema import:** parse only documented subsets. Never use `eval` or `new Function`; unsupported syntax produces actionable diagnostics. Sample JSON inference is provisional and requires review where ambiguous.
- **Custom code:** compiler-owned `generated/` may be regenerated; user-owned `custom/` must be preserved.
- **Performance/resource claims:** benchmark and report; do not fail a task against `<100 ms` or `<550 MB` until a reproducible baseline is agreed and measured.
- **No fake success:** never label placeholder, stale, or fabricated generated code as compiler output.

### Task Completion Checklist

- [ ] Acceptance criteria verified on the current commit.
- [ ] Relevant unit/integration tests pass; generated targets run against real DB services in CI.
- [ ] No unrelated files or dependencies changed without explanation.
- [ ] `docs/PROGRESS.md` records evidence and remaining limitations.
- [ ] `docs/FLOW.md` and `docs/DECISIONS.md` updated when applicable.
- [ ] Commit, task tag, and merge completed only after verification passes.
- [ ] The next task's dependencies exist and match the SRS contracts.

If any acceptance criterion cannot be met, mark the task **blocked/incomplete**, record the failing command and output, and do not create its `tXX-done` tag.
