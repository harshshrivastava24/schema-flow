package engine

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/harsh/backendgen/services/compiler/internal/ir"
)

func TestCompileTypeScriptPostgres(t *testing.T) {
	// Prepare Blog IR with PostgreSQL database
	blogIR := makeBlogIR()
	blogIR.Project.Database = ir.Postgres

	req := &ir.CompileRequest{
		Operation: "download",
		Target:    "typescript",
		IR:        blogIR,
	}

	// 1. Time the compilation
	compileStart := time.Now()
	result, err := Compile(req)
	compileDuration := time.Since(compileStart)
	if err != nil {
		t.Fatalf("Compile failed: %v", err)
	}
	t.Logf("Compiled TypeScript+PostgreSQL project in %v (%d files)", compileDuration, len(result.Files))

	// 2. Verify key output files exist in compiler result
	fileMap := make(map[string]GeneratedFile)
	for _, f := range result.Files {
		fileMap[f.Path] = f
	}

	requiredFiles := []string{
		"package.json",
		"tsconfig.json",
		"Dockerfile",
		"docker-compose.yml",
		".env.example",
		"README.md",
		"src/index.ts",
		"src/generated/db.ts",
		"src/generated/migrate.ts",
		"src/generated/schema.ts",
		"src/generated/server.ts",
		"src/generated/app.ts",
		"src/generated/auth.ts",
		"src/generated/middleware/auth.ts",
		"src/generated/routes/auth.routes.ts",
		"src/generated/schemas/user.schema.ts",
		"src/generated/schemas/post.schema.ts",
		"src/generated/routes/user.routes.ts",
		"src/generated/routes/post.routes.ts",
		"src/custom/hooks/user.hooks.ts",
		"src/custom/hooks/post.hooks.ts",
		"src/custom/hooks/index.ts",
		"tests/acceptance.test.ts",
		"generated/openapi.json",
		"migrations/0001_init.sql",
	}

	for _, reqFile := range requiredFiles {
		if _, exists := fileMap[reqFile]; !exists {
			t.Errorf("missing required file in generated output: %s", reqFile)
		}
	}

	// 3. Extract generated files to temporary directory
	tempDir := t.TempDir()
	for _, f := range result.Files {
		targetPath := filepath.Join(tempDir, filepath.FromSlash(f.Path))
		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			t.Fatalf("mkdir failed for %s: %v", targetPath, err)
		}
		if err := os.WriteFile(targetPath, f.Content, 0644); err != nil {
			t.Fatalf("write file failed for %s: %v", targetPath, err)
		}
	}

	// 4. Link or install dependencies
	repoRoot, err := findRepoRoot()
	if err != nil {
		t.Fatalf("find repo root failed: %v", err)
	}

	acceptanceModules := filepath.Join(repoRoot, "packages", "acceptance-suite", "node_modules")
	targetModules := filepath.Join(tempDir, "node_modules")

	if fi, err := os.Stat(acceptanceModules); err == nil && fi.IsDir() {
		if runtime.GOOS == "windows" {
			out, err := exec.Command("cmd", "/c", "mklink", "/J", targetModules, acceptanceModules).CombinedOutput()
			if err != nil {
				t.Logf("mklink /J warning: %v (%s), will fallback to npm install", err, string(out))
			}
		} else {
			_ = os.Symlink(acceptanceModules, targetModules)
		}
	}

	// Ensure @schemaflow/acceptance-suite is linked in node_modules
	schemaflowDir := filepath.Join(targetModules, "@schemaflow")
	_ = os.MkdirAll(schemaflowDir, 0755)
	suitePkgPath := filepath.Join(schemaflowDir, "acceptance-suite")
	realSuitePkg := filepath.Join(repoRoot, "packages", "acceptance-suite")
	if _, err := os.Stat(suitePkgPath); err != nil {
		if runtime.GOOS == "windows" {
			_ = exec.Command("cmd", "/c", "mklink", "/J", suitePkgPath, realSuitePkg).Run()
		} else {
			_ = os.Symlink(realSuitePkg, suitePkgPath)
		}
	}

	// Verify node_modules exists, otherwise run pnpm install
	if _, err := os.Stat(filepath.Join(tempDir, "node_modules")); err != nil {
		t.Log("node_modules link unavailable, running pnpm install...")
		cmd := exec.Command("pnpm", "install")
		cmd.Dir = tempDir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("pnpm install failed: %v\n%s", err, string(out))
		}
	}

	// 5. Run TypeScript typecheck (tsc --noEmit)
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node executable not found in PATH, skipping static check and acceptance test")
	}

	t.Log("Running tsc --noEmit in generated project...")
	var tscCmd *exec.Cmd
	if runtime.GOOS == "windows" {
		tscBin := filepath.Join(tempDir, "node_modules", ".bin", "tsc.cmd")
		if _, err := os.Stat(tscBin); err == nil {
			tscCmd = exec.Command(tscBin, "--noEmit")
		} else {
			tscCmd = exec.Command("cmd", "/c", "npx", "tsc", "--noEmit")
		}
	} else {
		tscBin := filepath.Join(tempDir, "node_modules", ".bin", "tsc")
		if _, err := os.Stat(tscBin); err == nil {
			tscCmd = exec.Command(tscBin, "--noEmit")
		} else {
			tscCmd = exec.Command("npx", "tsc", "--noEmit")
		}
	}
	tscCmd.Dir = tempDir
	if out, err := tscCmd.CombinedOutput(); err != nil {
		t.Fatalf("Generated TypeScript project failed typecheck:\n%s", string(out))
	}
	t.Log("TypeScript typecheck passed (0 errors)")

	// 6. Build with tsc to dist/
	var buildCmd *exec.Cmd
	if runtime.GOOS == "windows" {
		tscBin := filepath.Join(tempDir, "node_modules", ".bin", "tsc.cmd")
		if _, err := os.Stat(tscBin); err == nil {
			buildCmd = exec.Command(tscBin)
		} else {
			buildCmd = exec.Command("cmd", "/c", "npx", "tsc")
		}
	} else {
		tscBin := filepath.Join(tempDir, "node_modules", ".bin", "tsc")
		if _, err := os.Stat(tscBin); err == nil {
			buildCmd = exec.Command(tscBin)
		} else {
			buildCmd = exec.Command("npx", "tsc")
		}
	}
	buildCmd.Dir = tempDir
	if out, err := buildCmd.CombinedOutput(); err != nil {
		t.Fatalf("tsc build failed:\n%s", string(out))
	}

	// 7. Run shared acceptance suite via node --test
	t.Log("Running shared acceptance test suite against generated backend...")
	testCmd := exec.Command("node", "--test", "dist/tests/acceptance.test.js")
	testCmd.Dir = tempDir
	testOut, err := testCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("Generated backend failed acceptance suite:\n%s", string(testOut))
	}

	if !strings.Contains(string(testOut), "pass 1") && !strings.Contains(string(testOut), "ok 1") {
		t.Errorf("acceptance test output missing pass confirmation:\n%s", string(testOut))
	}
	t.Logf("Acceptance suite passed successfully:\n%s", string(testOut))
}
