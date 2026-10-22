package engine

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"go/format"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/harsh/backendgen/services/compiler/internal/ddl"
	"github.com/harsh/backendgen/services/compiler/internal/ir"
	"github.com/harsh/backendgen/services/compiler/internal/openapi"
)

// CompilerVersion is the current compiler version string.
const CompilerVersion = "1.0.0"

// fixedTime is the deterministic timestamp used for all ZIP entry headers (FR-25).
var fixedTime = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

// GeneratedFile represents one file in the compiler's in-memory output buffer.
type GeneratedFile struct {
	Path     string
	Content  []byte
	Language string
}

// CompileResult holds the full compiler output for a single compilation.
type CompileResult struct {
	Files       []GeneratedFile
	OpenAPI     json.RawMessage
	Diagnostics []ir.Diagnostic
}

// Compile performs a full compilation: validates the IR, generates DDL/OpenAPI,
// and produces a deterministic in-memory file set. Templates are not yet used
// (T06+); this task provides the core pipeline and test fixture.
func Compile(req *ir.CompileRequest) (*CompileResult, error) {
	result := &CompileResult{}

	// ───── Phase 1: Validate IR ─────
	diags := ir.ValidateIR(&req.IR)
	if len(diags) > 0 {
		for _, d := range diags {
			if d.Severity == "error" {
				result.Diagnostics = diags
				return result, fmt.Errorf("IR validation failed: %s", diags[0].Message)
			}
		}
		result.Diagnostics = append(result.Diagnostics, diags...)
	}

	// ───── Phase 2: Check target support ─────
	supportedTargets := map[string]map[ir.DatabaseType]bool{
		"typescript": {ir.Postgres: true, ir.MongoDB: true},
		"python":     {ir.Postgres: true},
		"go":         {ir.Postgres: true},
	}

	targetDBs, targetExists := supportedTargets[req.Target]
	if !targetExists {
		result.Diagnostics = append(result.Diagnostics, ir.Diagnostic{
			Severity: "error",
			Message:  fmt.Sprintf("unsupported target %q", req.Target),
		})
		return result, fmt.Errorf("unsupported target %q", req.Target)
	}

	if !targetDBs[req.IR.Project.Database] {
		result.Diagnostics = append(result.Diagnostics, ir.Diagnostic{
			Severity: "error",
			Message:  fmt.Sprintf("target %q does not support database %q", req.Target, req.IR.Project.Database),
		})
		return result, fmt.Errorf("target %q does not support database %q", req.Target, req.IR.Project.Database)
	}

	// ───── Phase 3: Generate core files ─────
	var files []GeneratedFile

	// 3a. PostgreSQL DDL migration
	if req.IR.Project.Database == ir.Postgres {
		sqlContent, err := ddl.GeneratePostgresDDL(&req.IR)
		if err != nil {
			return nil, fmt.Errorf("DDL generation failed: %w", err)
		}
		files = append(files,
			GeneratedFile{
				Path:     "generated/migrations/0001_init.sql",
				Content:  []byte(sqlContent),
				Language: "sql",
			},
			GeneratedFile{
				Path:     "migrations/0001_init.sql",
				Content:  []byte(sqlContent),
				Language: "sql",
			},
		)
	}

	// 3b. OpenAPI 3.1 specification
	oapiJSON, err := openapi.Generate(&req.IR)
	if err != nil {
		return nil, fmt.Errorf("OpenAPI generation failed: %w", err)
	}

	// Pretty-print OpenAPI for the output file
	var oapiBuf bytes.Buffer
	if err := json.Indent(&oapiBuf, oapiJSON, "", "  "); err != nil {
		return nil, fmt.Errorf("format openapi: %w", err)
	}
	files = append(files, GeneratedFile{
		Path:     "generated/openapi.json",
		Content:  oapiBuf.Bytes(),
		Language: "json",
	})
	result.OpenAPI = oapiJSON

	// 3c. Target templates or core scaffold fallback
	var targetFiles []GeneratedFile
	targetsDir, err := FindTargetsDir()
	if err == nil {
		targetPath := filepath.Join(targetsDir, req.Target)
		manifest, err := LoadManifest(targetPath)
		if err == nil && manifest.SupportsDatabase(string(req.IR.Project.Database)) {
			rendered, err := RenderTargetTemplates(&req.IR, req.Target, targetPath, manifest)
			if err != nil {
				return nil, fmt.Errorf("render target templates: %w", err)
			}
			targetFiles = rendered
		}
	}

	if len(targetFiles) > 0 {
		files = append(files, targetFiles...)

		// Ensure OpenAPI is also copied into src/generated/openapi.json for local reference
		hasSrcOpenAPI := false
		for _, f := range files {
			if f.Path == "src/generated/openapi.json" {
				hasSrcOpenAPI = true
				break
			}
		}
		if !hasSrcOpenAPI {
			files = append(files, GeneratedFile{
				Path:     "src/generated/openapi.json",
				Content:  oapiBuf.Bytes(),
				Language: "json",
			})
		}
	} else {
		// Fallback scaffold for targets/databases not yet templated
		readmeContent := generateReadme(&req.IR, req.Target)
		files = append(files, GeneratedFile{
			Path:     "generated/README.md",
			Content:  []byte(readmeContent),
			Language: "markdown",
		})

		envContent := generateEnvExample(&req.IR)
		files = append(files, GeneratedFile{
			Path:     "generated/.env.example",
			Content:  []byte(envContent),
			Language: "dotenv",
		})

		dockerContent := generateDockerfile(req.Target)
		files = append(files, GeneratedFile{
			Path:     "generated/Dockerfile",
			Content:  []byte(dockerContent),
			Language: "dockerfile",
		})

		composeContent := generateDockerCompose(&req.IR, req.Target)
		files = append(files, GeneratedFile{
			Path:     "generated/docker-compose.yml",
			Content:  []byte(composeContent),
			Language: "yaml",
		})

		files = append(files, GeneratedFile{
			Path:     "custom/hooks/.gitkeep",
			Content:  []byte(""),
			Language: "",
		})
	}

	// ───── Phase 4: Sort all files alphabetically (FR-25) ─────
	sort.Slice(files, func(i, j int) bool {
		return files[i].Path < files[j].Path
	})

	result.Files = files
	return result, nil
}

// BuildZip creates a deterministic in-memory ZIP archive from the compiled files.
// File paths are sorted, timestamps are fixed, permissions are constant (FR-25).
func BuildZip(files []GeneratedFile) ([]byte, error) {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)

	for _, f := range files {
		header := &zip.FileHeader{
			Name:     f.Path,
			Method:   zip.Deflate,
			Modified: fixedTime,
		}
		header.SetMode(0644)

		// Directories: ensure trailing slash and directory mode
		if strings.HasSuffix(f.Path, "/") {
			header.SetMode(0755)
		}

		writer, err := w.CreateHeader(header)
		if err != nil {
			return nil, fmt.Errorf("zip create header %s: %w", f.Path, err)
		}

		content := f.Content

		// Auto-format .go files with gofmt
		if strings.HasSuffix(f.Path, ".go") && len(content) > 0 {
			if formatted, err := format.Source(content); err == nil {
				content = formatted
			}
			// If gofmt fails, use the original content
		}

		if _, err := writer.Write(content); err != nil {
			return nil, fmt.Errorf("zip write %s: %w", f.Path, err)
		}
	}

	if err := w.Close(); err != nil {
		return nil, fmt.Errorf("zip close: %w", err)
	}

	return buf.Bytes(), nil
}

// ToPreviewFiles converts GeneratedFiles to the preview response format.
func ToPreviewFiles(files []GeneratedFile) []ir.PreviewFile {
	result := make([]ir.PreviewFile, len(files))
	for i, f := range files {
		result[i] = ir.PreviewFile{
			Path:     f.Path,
			Language: f.Language,
		}
	}
	return result
}

// ───── Scaffold generators ─────

func generateReadme(doc *ir.IRDocument, target string) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# %s\n\n", doc.Project.Name))
	sb.WriteString(fmt.Sprintf("Generated by SchemaFlow Compiler v%s\n\n", CompilerVersion))
	sb.WriteString(fmt.Sprintf("- **Target:** %s\n", target))
	sb.WriteString(fmt.Sprintf("- **Database:** %s\n", doc.Project.Database))
	sb.WriteString(fmt.Sprintf("- **Entities:** %d\n", len(doc.Entities)))
	sb.WriteString(fmt.Sprintf("- **Relations:** %d\n\n", len(doc.Relations)))
	sb.WriteString("## Getting Started\n\n")
	sb.WriteString("1. Copy `.env.example` to `.env` and configure\n")
	sb.WriteString("2. Run `docker compose up` to start the database\n")
	sb.WriteString("3. Run the application with the appropriate command for your target\n\n")
	sb.WriteString("## Project Structure\n\n")
	sb.WriteString("- `generated/` — Compiler-owned files (regenerated on compile)\n")
	sb.WriteString("- `custom/hooks/` — Developer-owned extension hooks (preserved on regeneration)\n")
	return sb.String()
}

func generateEnvExample(doc *ir.IRDocument) string {
	var sb strings.Builder
	sb.WriteString("# Auto-generated environment template\n")
	sb.WriteString("NODE_ENV=development\n")
	sb.WriteString("PORT=3000\n\n")

	switch doc.Project.Database {
	case ir.Postgres:
		sb.WriteString("DATABASE_URL=postgresql://postgres:password@localhost:5432/")
		sb.WriteString(strings.ReplaceAll(doc.Project.Name, "-", "_"))
		sb.WriteString("\n")
	case ir.MongoDB:
		sb.WriteString("MONGODB_URI=mongodb://localhost:27017/")
		sb.WriteString(strings.ReplaceAll(doc.Project.Name, "-", "_"))
		sb.WriteString("\n")
	}

	if doc.Auth.Enabled {
		sb.WriteString("\nJWT_SECRET=change-me-to-a-secure-random-string\n")
		sb.WriteString("JWT_EXPIRES_IN=24h\n")
	}
	return sb.String()
}

func generateDockerfile(target string) string {
	var sb strings.Builder
	sb.WriteString("# Auto-generated Dockerfile\n")

	switch target {
	case "typescript":
		sb.WriteString("FROM node:22-alpine\n")
		sb.WriteString("WORKDIR /app\n")
		sb.WriteString("COPY package*.json ./\n")
		sb.WriteString("RUN npm ci --production\n")
		sb.WriteString("COPY . .\n")
		sb.WriteString("EXPOSE 3000\n")
		sb.WriteString("USER node\n")
		sb.WriteString("CMD [\"node\", \"dist/index.js\"]\n")
	case "python":
		sb.WriteString("FROM python:3.12-slim\n")
		sb.WriteString("WORKDIR /app\n")
		sb.WriteString("COPY requirements.txt ./\n")
		sb.WriteString("RUN pip install --no-cache-dir -r requirements.txt\n")
		sb.WriteString("COPY . .\n")
		sb.WriteString("EXPOSE 3000\n")
		sb.WriteString("USER nobody\n")
		sb.WriteString("CMD [\"uvicorn\", \"app.main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"3000\"]\n")
	case "go":
		sb.WriteString("FROM golang:1.23-alpine AS builder\n")
		sb.WriteString("WORKDIR /app\n")
		sb.WriteString("COPY go.* ./\n")
		sb.WriteString("RUN go mod download\n")
		sb.WriteString("COPY . .\n")
		sb.WriteString("RUN CGO_ENABLED=0 go build -o /server ./cmd/server\n\n")
		sb.WriteString("FROM alpine:3.19\n")
		sb.WriteString("COPY --from=builder /server /server\n")
		sb.WriteString("EXPOSE 3000\n")
		sb.WriteString("USER nobody\n")
		sb.WriteString("CMD [\"/server\"]\n")
	default:
		sb.WriteString("FROM alpine:3.19\n")
		sb.WriteString("# Target-specific Dockerfile to be generated by target templates\n")
	}

	return sb.String()
}

func generateDockerCompose(doc *ir.IRDocument, target string) string {
	var sb strings.Builder
	sb.WriteString("# Auto-generated docker-compose.yml\n")
	sb.WriteString("version: '3.8'\n\n")
	sb.WriteString("services:\n")
	sb.WriteString("  app:\n")
	sb.WriteString("    build: .\n")
	sb.WriteString("    ports:\n")
	sb.WriteString("      - '3000:3000'\n")
	sb.WriteString("    env_file:\n")
	sb.WriteString("      - .env\n")
	sb.WriteString("    depends_on:\n")

	switch doc.Project.Database {
	case ir.Postgres:
		sb.WriteString("      - db\n\n")
		sb.WriteString("  db:\n")
		sb.WriteString("    image: postgres:16-alpine\n")
		sb.WriteString("    environment:\n")
		sb.WriteString("      POSTGRES_DB: ")
		sb.WriteString(strings.ReplaceAll(doc.Project.Name, "-", "_"))
		sb.WriteString("\n")
		sb.WriteString("      POSTGRES_USER: postgres\n")
		sb.WriteString("      POSTGRES_PASSWORD: password\n")
		sb.WriteString("    ports:\n")
		sb.WriteString("      - '5432:5432'\n")
		sb.WriteString("    volumes:\n")
		sb.WriteString("      - pgdata:/var/lib/postgresql/data\n\n")
		sb.WriteString("volumes:\n")
		sb.WriteString("  pgdata:\n")
	case ir.MongoDB:
		sb.WriteString("      - db\n\n")
		sb.WriteString("  db:\n")
		sb.WriteString("    image: mongo:7\n")
		sb.WriteString("    ports:\n")
		sb.WriteString("      - '27017:27017'\n")
		sb.WriteString("    volumes:\n")
		sb.WriteString("      - mongodata:/data/db\n\n")
		sb.WriteString("volumes:\n")
		sb.WriteString("  mongodata:\n")
	}

	_ = target
	return sb.String()
}
