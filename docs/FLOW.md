# Code Execution & Data Flow Guide (`FLOW.md`)

> **Rule for AI Agent:** After completing any task `T-xx`, document the exact file-by-file, function-by-function execution flow here so the developer can understand how data moves through the codebase without reading every file from scratch.

---

## Overview of System Flows (Populated as Tasks T1–T15 Complete)
0. **Flow 0 (T01): Monorepo Foundation & Toolchain Execution Flow**
1. **Flow 1 (T2–T3): Schema Import & IR Validation Flow** — *(To be populated in T2 & T3)*
2. **Flow 2 (T4–T7, T12–T13): Go Compiler & Plugin Rendering Flow** — *(To be populated in T4)*
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