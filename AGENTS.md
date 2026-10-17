# AGENTS.md — AI Execution Contract & Guardrails

## 1. Mandatory Session Startup Protocol
At the start of EVERY chat session, before writing any code, you MUST read:
1. `AGENTS.md` (this file)
2. `docs/PROGRESS.md` (to see what was completed recently and which Task `T-xx` is next)
3. `docs/DECISIONS.md` (to respect all prior architectural decisions)
4. `docs/FLOW.md` (to understand existing code flows and file connections)
5. `docs/SRS.md` (specifically the section for the current Task `T-xx`)

After reading, output a **5-line Task Plan** (Goal, Files to Create/Modify, Decisions to Log, Verification Command) and wait for user approval before writing code.

---

## 2. Strict Git Branching Law (`working` -> `staging` ONLY)
- **Active Development Branch:** Always verify you are on the `working` branch (`git branch --show-current`) before editing any file. All work and commits happen on `working`.
- **Staging Merge:** Only after ALL tests/builds pass AND `docs/PROGRESS.md`, `docs/DECISIONS.md`, and `docs/FLOW.md` are updated for the task, run:
  ```bash
  git add .
  git commit -m "feat(T-xx): <short summary>"
  git checkout staging
  git merge working --no-ff -m "merge(T-xx): merge working into staging"
  git checkout working
  ```
- **FORBIDDEN BRANCH (`main`):** You are STRICTLY FORBIDDEN from running `git checkout main`, `git merge` into `main`, or `git push origin main`. Only the human developer touches `main`.

---

## 3. Mandatory Documentation Updates (End of Every Task)
No task `T-xx` is considered finished until you update all three living docs:
1. **`docs/PROGRESS.md`: Mark T-xx complete, update the ## `Latest Completed Context` section with exact files added/changed, and set `Current Next Task` to the specific next task dictated by the `Master_Execution_T01-T15.md` (e.g., T06 leads to T03). Do not blindly increment the task number.
2. **`docs/DECISIONS.md`:** Append a new entry (`### [ADR-0XX] Task T-xx: <Title>`) explaining every design, schema, library, or implementation decision you made during the task and why.
3. **`docs/FLOW.md`:** Append or update the step-by-step code execution flow for the module you just built (showing exact file paths, function names, inputs, and outputs so the developer can trace the code effortlessly).

---

## 4. Technical & Design Non-Negotiables
- **Brand Constant:** Never hardcode the app title; import `APP_NAME` from `apps/web/src/config/brand.ts`.
- **Target × Database P0 Matrix:**
  - `typescript` (Express 5): Supports BOTH `mongodb` (Mongoose) AND `postgres` (Drizzle).
  - `python` (FastAPI): Supports `postgres` (SQLAlchemy 2.0).
  - `go` (chi): Supports `postgres` (`pgx/v5`).
- **Dual Schema Importer:** Must support both **Relational** (`schema.prisma`, SQL `CREATE TABLE`) and **MongoDB** (`Mongoose` schema, MongoDB JSON) with `@dagrejs/dagre` auto-layout.
- **UI & Edge Design:**
  - Follow `/design` Stitch screens for Light Mode (*Industrial Concrete*) and pair with *Obsidian Studio* for Dark Mode.
  - Both themes MUST share identical sharp geometry (`--radius: 2px`, `--border-w: 1.5px`, `3px 3px 0px` hard offset shadows, `#B5F425` Acid Lime accent).
  - **Edges:** Use the **Obsidian Glowing Animated Bezier Edge** (`getBezierPath` with outer blur glow + centered mode-aware pill badge) in **BOTH Light Mode and Dark Mode**.
- **Anti-Hallucination:** Never invent file paths, never modify passing tests to hide a bug, and keep diffs strictly scoped to the active task `T-xx`[cite: 1].