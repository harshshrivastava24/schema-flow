# Code Execution & Data Flow Guide (`FLOW.md`)

> **Rule for AI Agent:** After completing any task `T-xx`, document the exact file-by-file, function-by-function execution flow here so the developer can understand how data moves through the codebase without reading every file from scratch.

---

## Overview of System Flows (Populated as Tasks T1–T15 Complete)
0. **Flow 0 (T01): Monorepo Foundation & Toolchain Execution Flow**
1. **Flow 1 (T2–T3): Schema Import & IR Validation Flow**
2. **Flow 2 (T4–T7, T12–T13): Go Compiler & Plugin Rendering Flow** — *(T04 Core completed)*
3. **Flow 3 (T8–T10): Drag-and-Drop Canvas, Obsidian Edges & Zustand State Flow** — *(To be populated in T8 & T9)*
4. **Flow 4 (T11): API Control Plane to Go Binary Stream Flow** — *(To be populated in T11)*

---

## Flow 0: Monorepo Foundation & Toolchain Execution Flow (T01)

### 1. TypeScript Workspace Package Resolution & Build Flow
```text
Root `pnpm -r build / test / typecheck`
  │
  ├──> [packages/ir-schema]
  │      ├── Input: src/index.ts (exports IR_VERSION = "1.0", ProjectConfig, IRDocument)
  │      ├── Compilation: tsc (via tsconfig.base.json) -> dist/index.js + dist/index.d.ts
  │      └── Verification: node --test dist/**/*.test.js
  │
  ├──> [apps/api]
  │      ├── Dependency: @schemaflow/ir-schema (workspace:*)
  │      ├── Input: src/index.ts (imports IR_VERSION, exports getStatus(), API_VERSION)
  │      ├── Compilation: tsc -> dist/index.js
  │      └── Verification: node --test dist/**/*.test.js
  │
  └──> [apps/web]
         ├── Dependency: @schemaflow/ir-schema (workspace:*)
         ├── Input: src/config/brand.ts (exports APP_NAME from env or "BackendGen")
         ├── Compilation: tsc -> dist/index.js
         └── Verification: node --test dist/**/*.test.js
```

### 2. Go Compiler Execution Flow
```text
Shell / CI:
  services/compiler
    ├── `go test -v ./...`
    │     └── cmd/compiler/main_test.go: TestVersion verifies Version == "1.0.0"
    └── `go build -o bin/compiler ./cmd/compiler`
          └── CLI: ./bin/compiler --version
                └── stdout: {"status":"ok","version":"1.0.0"}
```

---

## Flow 1: IR Contract Validation & Canonical Semantic Hashing Flow (T02)

### 1. Structural & Semantic Validation Pipeline (`packages/ir-schema`)
```text
Raw JSON / Importer Output / Canvas IR
  │
  ▼
`validateIR(data: unknown)` (in packages/ir-schema/src/validator.ts)
  │
  ├── [Phase 1: Structural Ajv Validation]
  │     ├── Loads Draft-07 schema (src/schema.json via src/schema.ts)
  │     ├── Enforces required keys: irVersion, project, entities, relations, endpoints, auth
  │     └── Maps any Ajv schema errors to structured IRValidationError { path, message, rule }
  │
  ├── [Phase 2: Security & Lexical Guards] (src/security.ts)
  │     ├── Max limits: entities <= 50, fields per entity <= 100
  │     ├── Identifier regex: ^[A-Za-z_][A-Za-z0-9_]{0,63}$
  │     ├── Enum value regex: ^[A-Za-z0-9_-]{1,64}$
  │     ├── Default value allowlist: uuid(), now(), booleans, numerics, valid enum members
  │     └── Reserved keyword blocklist: SQL syntax keywords, Mongo _id, JS/TS, Python, Go
  │
  ├── [Phase 3: Semantic & Relational Integrity]
  │     ├── Entity IDs & Entity Names unique (case-insensitive)
  │     ├── Exactly 1 primary key per entity (required: true, type-compatible)
  │     ├── Field IDs & Field Names unique per entity
  │     ├── Relation fromEntityId / toEntityId existence (no dangling relations)
  │     ├── 1:1 and 1:N require foreignKeyField on toEntity with type matching source PK
  │     ├── 1:1 requires unique: true on foreignKeyField
  │     ├── onDelete: SET_NULL requires nullable foreignKeyField
  │     ├── M:N forbids foreignKeyField (join table generated automatically)
  │     └── Cycle detection (DFS): prevents non-nullable self-relations & circular FKs
  │
  └── Returns: { valid: boolean, errors: IRValidationError[] }
        └── With badge pointers: entityId, fieldId, relationId for Canvas node highlight
```

### 2. Canonical Semantic Content Hashing Pipeline (`packages/ir-schema`)
```text
IRDocument (including canvas layout & arbitrary key order)
  │
  ▼
`computeSemanticHash(ir: IRDocument)` (in packages/ir-schema/src/hash.ts)
  │
  ├── [Phase 1: Layout Stripping & Canonical Projection]
  │     ├── Explicitly ignores/strips `layout` (canvas x, y, color)
  │     ├── Retains strictly { irVersion, project, entities, relations, endpoints, auth }
  │     └── Normalizes array ordering:
  │           ├── entities sorted by id
  │           ├── fields within each entity sorted by id
  │           ├── relations sorted by id
  │           ├── endpoints sorted by entityId
  │           └── auth.roles sorted alphabetically
  │
  ├── [Phase 2: Recursive Key Sorting]
  │     └── `canonicalizeValue(val)` traverses and sorts all dictionary keys alphabetically
  │
  ├── [Phase 3: Deterministic SHA-256 Digest]
  │     ├── Serializes canonical structure to JSON string
  │     └── Computes createHash('sha256').update(jsonStr).digest('hex')
  │
  └── Returns: 64-character SHA-256 hex string (layout-invariant, stable content signature)
```

### 3. Dual Schema Importers & Dagre Auto-Layout Pipeline (T03)
```text
Raw Schema String (Prisma .prisma, Mongoose JS/TS, or MongoDB JSON)
  │
  ▼
`importSchema(input: string, kind: 'prisma' | 'mongodb' | 'auto', options?: ImporterOptions)`
(in packages/ir-schema/src/importers/index.ts)
  │
  ├── [Phase 1: Size Guard & Kind Detection]
  │     ├── Enforces MAX_SCHEMA_SIZE_BYTES (1 MB)
  │     └── Resolves kind ('auto' detects JSON '{', '[', Mongoose 'Schema', or Prisma 'model')
  │
  ├── [Phase 2: Specialized AST / Lexical Ingestion]
  │     │
  │     ├── Prisma Path (`parsePrismaSchema` in src/importers/prisma-importer.ts):
  │     │     ├── Tokenizes 'model', 'enum', 'datasource', and attribute blocks
  │     │     ├── Maps Prisma types (String, Int, Float, Boolean, DateTime, Json, Enum)
  │     │     ├── Resolves attributes: @id, @default(uuid()/now()), @unique, @relation
  │     │     ├── Deduces cardinalities: 1:1, 1:N, and implicit M:N (both sides list)
  │     │     ├── Actionable diagnostics for unsupported types (e.g., Bytes) or composite PKs
  │     │     └── Sets project.database = "postgres"
  │     │
  │     ├── Mongoose Path (`parseMongooseAst` in src/importers/mongo-importer.ts):
  │     │     ├── Zero-eval safety: @babel/parser parses AST without executing code
  │     │     ├── Traverses VariableDeclaration & CallExpression for new Schema({...})
  │     │     ├── Reads static ObjectExpression, Identifier, and Literal nodes
  │     │     ├── Maps type (String, Number, Boolean, Date, Mixed, ObjectId), required, unique
  │     │     ├── Converts ref: 'Model' to 1:N relations with foreignKeyField
  │     │     ├── Injects standard _id -> id UUID primary key
  │     │     └── Sets project.database = "mongodb"
  │     │
  │     └── Mongo JSON Sample Path (`parseMongoJson` in src/importers/mongo-importer.ts):
  │           ├── Ingests single object, array of documents, or multi-collection dictionaries
  │           ├── Infers types: int, decimal, bool, timestamp (ISO regex), uuid, string, json
  │           ├── Detects 24-hex ObjectId candidates & <name>Id relation candidates
  │           └── Normalizes _id / id primary keys with candidate confirmation diagnostics
  │
  ├── [Phase 3: Dagre LR Auto-Layout] (src/importers/layout-dagre.ts)
  │     ├── Builds @dagrejs/dagre graph with rankdir: "LR", nodesep: 80, ranksep: 140
  │     ├── Computes non-overlapping node center coordinates { x, y }
  │     ├── Offsets coordinates to positive canvas bounds (margin: 40px)
  │     └── Assigns node colors cycling through 6-color palette:
  │           ['lime', 'coral', 'teal', 'amber', 'violet', 'sky']
  │
  ├── [Phase 4: IR Validation & Diagnostics Collection]
  │     ├── Runs validateIR(candidateIR) against strict Draft-07 schema and semantic rules
  │     └── Appends any validation errors as structured ImporterDiagnostic entries
  │
  └── Returns: ImportResult { success: boolean, ir: IRDocument, diagnostics: ImporterDiagnostic[], stats }
```

---

## Flow 2: Go Compiler Core & Deterministic Packaging Pipeline (T04)

### 1. Stdin/Stdout CLI Protocol & Dispatch (`cmd/compiler/main.go`)
```text
Parent Process (apps/api / CLI / CI)
  │
  ├── [stdin]: UTF-8 JSON payload: `CompileRequest` { ir: IRDocument, target: "typescript"|"python"|"go", database: "postgres"|"mongodb", operation: "preview"|"download" }
  │
  ▼
`main()` in services/compiler/cmd/compiler/main.go
  │
  ├── [1. Read Stdin]: io.ReadAll(os.Stdin) up to EOF
  ├── [2. Unmarshal]: json.Unmarshal into `ir.CompileRequest`
  ├── [3. Semantic Guard]: `ir.ValidateIR(&req.IR)` (checks version, project name regex, entity identifiers, PK, relations, database)
  │     └── If invalid: writes `ir.ErrorResponse` JSON to stdout, exit code 1
  ├── [4. Engine Invocation]: `engine.Compile(&req)`
  │     └── If compilation error: writes `ir.ErrorResponse` JSON to stdout, exit code 1
  │
  └── [5. Protocol Output Branch]:
        ├── Case `operation == "preview"`:
        │     ├── Serializes `ir.PreviewResponse` { openapi: string, files: FilePreview[], diagnostics: Diagnostic[], compilerVersion: "1.0.0" }
        │     └── Writes formatted JSON to `os.Stdout`, exit code 0
        │
        └── Case `operation == "download"`:
              ├── Writes binary `.zip` archive bytes directly to `os.Stdout` (Content-Type: application/zip)
              ├── Any logs or telemetry emitted strictly to `os.Stderr`
              └── Exit code 0
```

### 2. Core Compiler Orchestration & DDL / OpenAPI Generation (`internal/engine/renderer.go`)
```text
`Compile(req *ir.CompileRequest)` (in internal/engine/renderer.go)
  │
  ├── [Step 1: Validate Target & Database Compatibility]
  │     └── Matrix checks:
  │           ├── typescript -> postgres | mongodb
  │           ├── python     -> postgres
  │           └── go         -> postgres
  │
  ├── [Step 2: Canonical PostgreSQL DDL Generation] (`internal/ddl/postgres_ddl.go`)
  │     ├── (Skipped if database == "mongodb")
  │     ├── `GeneratePostgresDDL(irDoc)`:
  │     │     ├── Emits `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`
  │     │     ├── Emits enum `CREATE TYPE ... AS ENUM (...)` (alphabetically sorted enum names & values)
  │     │     ├── Computes topological order of tables via Kahn's algorithm (resolving FK dependencies, alphabetical tie-break)
  │     │     ├── Generates `CREATE TABLE <tableName>`:
  │     │     │     ├── Column mappings: uuid (DEFAULT gen_random_uuid()), string/varchar, int/integer, decimal/numeric, bool/boolean, timestamp, json/jsonb, enum
  │     │     │     ├── Inlines `PRIMARY KEY` and `NOT NULL` constraints
  │     │     │     └── Inlines `FOREIGN KEY (...) REFERENCES ... ON DELETE ...`
  │     │     ├── Generates M:N Join Tables:
  │     │     │     ├── Derived table name `<entityA>_<entityB>` (lexicographical order)
  │     │     │     ├── Composite primary key `PRIMARY KEY (<entityA>_id, <entityB>_id)`
  │     │     │     └── Dual cascading foreign keys (`ON DELETE CASCADE`)
  │     │     └── Generates sorted `CREATE INDEX` on foreign key columns
  │     └── Appends `migrations/0001_init.sql` to compiled file set
  │
  ├── [Step 3: OpenAPI 3.1 Specification Generation] (`internal/openapi/generator.go`)
  │     ├── `GenerateOpenAPI(irDoc)`:
  │     │     ├── Builds OpenAPI 3.1.0 document with `orderedMap` (sorted keys for deterministic JSON output)
  │     │     ├── Generates `components.schemas`: `<Entity>`, `<Entity>Create`, `<Entity>Update`, `Error`
  │     │     ├── Generates REST paths for each entity:
  │     │     │     ├── `GET /api/<tableName>` (List with pagination params limit/offset)
  │     │     │     ├── `POST /api/<tableName>` (Create with `<Entity>Create` body)
  │     │     │     ├── `GET /api/<tableName>/{id}` (Read by ID)
  │     │     │     ├── `PUT /api/<tableName>/{id}` (Update with `<Entity>Update` body)
  │     │     │     └── `DELETE /api/<tableName>/{id}` (Delete by ID)
  │     │     ├── If `auth.enabled == true`:
  │     │     │     ├── Configures `components.securitySchemes.bearerAuth` (HTTP Bearer JWT)
  │     │     │     ├── Attaches global / path security requirements
  │     │     │     └── Injects `/api/auth/register` and `/api/auth/login` paths
  │     └── Appends `docs/openapi.json` to compiled file set
  │
  ├── [Step 4: Scaffold & Target Manifest Generation]
  │     ├── Emits `README.md` (project name, tech stack, start commands)
  │     ├── Emits `.env.example` (database URL, JWT secret, port)
  │     ├── Emits `Dockerfile` & `docker-compose.yml` (multi-stage container + database service)
  │     └── Emits `custom/hooks/.gitkeep` for user-defined hooks
  │
  └── Returns `*CompileResult` { Files: []GeneratedFile, Diagnostics: []Diagnostic }
```

### 3. Deterministic In-Memory ZIP Archiver (`internal/engine/renderer.go`)
```text
`BuildZip(files []GeneratedFile)` (in internal/engine/renderer.go)
  │
  ├── [Step 1: Path Normalization & Lexicographical Sort]
  │     ├── Converts Windows backslashes `\` to standard forward slashes `/`
  │     └── Sorts file entries alphabetically by path to guarantee deterministic order
  │
  ├── [Step 2: Code Formatting Hook]
  │     └── If file ends in `.go`, passes content through `go/format` (`gofmt`)
  │
  ├── [Step 3: Normalized Zip Header Injection]
  │     ├── Creates `zip.Writer` over in-memory `bytes.Buffer`
  │     ├── Header Name: normalized file path
  │     ├── Header Method: `zip.Deflate`
  │     ├── Header Modified: fixed timestamp `2026-01-01 00:00:00 UTC`
  │     └── Header Permissions: fixed Unix file mode `0644` (`-rw-r--r--`)
  │
  └── Returns `[]byte` (reproducible, byte-identical archive bytes)
```

