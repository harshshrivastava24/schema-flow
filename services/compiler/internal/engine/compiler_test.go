package engine

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/harsh/backendgen/services/compiler/internal/ir"
)

// ───── Test Helpers ─────

func boolPtr(v bool) *bool { return &v }

// makeBlogIR returns the canonical Blog IR fixture (matches packages/ir-schema/src/templates/blog.json).
func makeBlogIR() ir.IRDocument {
	return ir.IRDocument{
		IRVersion: "1.0",
		Project:   ir.ProjectConfig{Name: "blog-api", Database: ir.Postgres},
		Entities: []ir.Entity{
			{
				ID: "ent_user", Name: "User", TableName: "users",
				Fields: []ir.Field{
					{ID: "fld_user_id", Name: "id", Type: ir.FieldUUID, Required: boolPtr(true), Unique: boolPtr(true), IsPrimaryKey: boolPtr(true), Default: "uuid()"},
					{ID: "fld_user_email", Name: "email", Type: ir.FieldString, Required: boolPtr(true), Unique: boolPtr(true)},
					{ID: "fld_user_name", Name: "name", Type: ir.FieldString, Required: boolPtr(true)},
					{ID: "fld_user_role", Name: "role", Type: ir.FieldEnum, Required: boolPtr(true), EnumValues: []string{"ADMIN", "AUTHOR", "USER"}, Default: "USER"},
					{ID: "fld_user_createdAt", Name: "createdAt", Type: ir.FieldTimestamp, Required: boolPtr(true), Default: "now()"},
				},
			},
			{
				ID: "ent_post", Name: "Post", TableName: "posts",
				Fields: []ir.Field{
					{ID: "fld_post_id", Name: "id", Type: ir.FieldUUID, Required: boolPtr(true), Unique: boolPtr(true), IsPrimaryKey: boolPtr(true), Default: "uuid()"},
					{ID: "fld_post_title", Name: "title", Type: ir.FieldString, Required: boolPtr(true)},
					{ID: "fld_post_slug", Name: "slug", Type: ir.FieldString, Required: boolPtr(true), Unique: boolPtr(true)},
					{ID: "fld_post_content", Name: "content", Type: ir.FieldString, Required: boolPtr(true)},
					{ID: "fld_post_authorId", Name: "authorId", Type: ir.FieldUUID, Required: boolPtr(true)},
					{ID: "fld_post_published", Name: "published", Type: ir.FieldBool, Required: boolPtr(true), Default: false},
					{ID: "fld_post_createdAt", Name: "createdAt", Type: ir.FieldTimestamp, Required: boolPtr(true), Default: "now()"},
				},
			},
			{
				ID: "ent_comment", Name: "Comment", TableName: "comments",
				Fields: []ir.Field{
					{ID: "fld_comment_id", Name: "id", Type: ir.FieldUUID, Required: boolPtr(true), Unique: boolPtr(true), IsPrimaryKey: boolPtr(true), Default: "uuid()"},
					{ID: "fld_comment_body", Name: "body", Type: ir.FieldString, Required: boolPtr(true)},
					{ID: "fld_comment_postId", Name: "postId", Type: ir.FieldUUID, Required: boolPtr(true)},
					{ID: "fld_comment_authorId", Name: "authorId", Type: ir.FieldUUID, Required: boolPtr(true)},
					{ID: "fld_comment_createdAt", Name: "createdAt", Type: ir.FieldTimestamp, Required: boolPtr(true), Default: "now()"},
				},
			},
			{
				ID: "ent_tag", Name: "Tag", TableName: "tags",
				Fields: []ir.Field{
					{ID: "fld_tag_id", Name: "id", Type: ir.FieldUUID, Required: boolPtr(true), Unique: boolPtr(true), IsPrimaryKey: boolPtr(true), Default: "uuid()"},
					{ID: "fld_tag_name", Name: "name", Type: ir.FieldString, Required: boolPtr(true), Unique: boolPtr(true)},
				},
			},
		},
		Relations: []ir.Relation{
			{ID: "rel_user_posts", FromEntityID: "ent_user", ToEntityID: "ent_post", Kind: ir.OneToMany, ForeignKeyField: "authorId", OnDelete: ir.Cascade},
			{ID: "rel_post_comments", FromEntityID: "ent_post", ToEntityID: "ent_comment", Kind: ir.OneToMany, ForeignKeyField: "postId", OnDelete: ir.Cascade},
			{ID: "rel_user_comments", FromEntityID: "ent_user", ToEntityID: "ent_comment", Kind: ir.OneToMany, ForeignKeyField: "authorId", OnDelete: ir.Cascade},
			{ID: "rel_post_tags", FromEntityID: "ent_post", ToEntityID: "ent_tag", Kind: ir.ManyToMany},
		},
		Endpoints: []ir.EndpointConfig{
			{EntityID: "ent_user", Ops: []ir.EndpointOp{ir.OpList, ir.OpGet, ir.OpCreate, ir.OpUpdate, ir.OpDelete}, AuthRequired: true},
			{EntityID: "ent_post", Ops: []ir.EndpointOp{ir.OpList, ir.OpGet, ir.OpCreate, ir.OpUpdate, ir.OpDelete}, AuthRequired: false},
			{EntityID: "ent_comment", Ops: []ir.EndpointOp{ir.OpList, ir.OpGet, ir.OpCreate, ir.OpDelete}, AuthRequired: true},
			{EntityID: "ent_tag", Ops: []ir.EndpointOp{ir.OpList, ir.OpGet, ir.OpCreate}, AuthRequired: false},
		},
		Auth: ir.AuthConfig{Enabled: true, Strategy: "jwt", Roles: []string{"ADMIN", "AUTHOR", "USER"}},
	}
}

// makeMinimalIR returns the simplest valid postgres IR with one entity.
func makeMinimalIR() ir.IRDocument {
	return ir.IRDocument{
		IRVersion: "1.0",
		Project:   ir.ProjectConfig{Name: "test_app", Database: ir.Postgres},
		Entities: []ir.Entity{
			{
				ID: "ent_item", Name: "Item", TableName: "items",
				Fields: []ir.Field{
					{ID: "fld_item_id", Name: "id", Type: ir.FieldUUID, Required: boolPtr(true), Unique: boolPtr(true), IsPrimaryKey: boolPtr(true), Default: "uuid()"},
					{ID: "fld_item_name", Name: "name", Type: ir.FieldString, Required: boolPtr(true)},
				},
			},
		},
		Relations: []ir.Relation{},
		Endpoints: []ir.EndpointConfig{
			{EntityID: "ent_item", Ops: []ir.EndpointOp{ir.OpList, ir.OpGet, ir.OpCreate}, AuthRequired: false},
		},
		Auth: ir.AuthConfig{Enabled: false, Strategy: "jwt", Roles: []string{}},
	}
}

// ───── Test: Preview Protocol Framing ─────

func TestPreviewProtocol(t *testing.T) {
	req := &ir.CompileRequest{
		Operation: "preview",
		Target:    "typescript",
		IR:        makeBlogIR(),
	}

	result, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile preview failed: %v", err)
	}

	// Must produce files
	if len(result.Files) == 0 {
		t.Fatal("expected generated files, got none")
	}

	// Must produce OpenAPI
	if len(result.OpenAPI) == 0 {
		t.Fatal("expected OpenAPI output, got empty")
	}

	// Preview files must have paths
	previewFiles := ToPreviewFiles(result.Files)
	for _, pf := range previewFiles {
		if pf.Path == "" {
			t.Error("preview file has empty path")
		}
	}

	// Verify OpenAPI is valid JSON with expected fields
	var oapi map[string]interface{}
	if err := json.Unmarshal(result.OpenAPI, &oapi); err != nil {
		t.Fatalf("OpenAPI is not valid JSON: %v", err)
	}
	if oapi["openapi"] != "3.1.0" {
		t.Errorf("expected openapi 3.1.0, got %v", oapi["openapi"])
	}
}

// ───── Test: Download Protocol Framing ─────

func TestDownloadProtocol(t *testing.T) {
	req := &ir.CompileRequest{
		Operation: "download",
		Target:    "typescript",
		IR:        makeBlogIR(),
	}

	result, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile download failed: %v", err)
	}

	zipData, err := BuildZip(result.Files)
	if err != nil {
		t.Fatalf("BuildZip failed: %v", err)
	}

	// ZIP must be non-empty
	if len(zipData) == 0 {
		t.Fatal("expected non-empty ZIP output")
	}

	// ZIP must be readable
	reader, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		t.Fatalf("ZIP is not valid: %v", err)
	}

	if len(reader.File) == 0 {
		t.Fatal("ZIP contains no files")
	}

	// All ZIP files must have fixed timestamps
	for _, f := range reader.File {
		if f.Modified.Year() != 2026 || f.Modified.Month() != 1 || f.Modified.Day() != 1 {
			t.Errorf("file %s has non-deterministic timestamp: %v", f.Name, f.Modified)
		}
	}
}

// ───── Test: Canonical SQL DDL Generation ─────

func TestPostgresDDL(t *testing.T) {
	req := &ir.CompileRequest{
		Operation: "preview",
		Target:    "typescript",
		IR:        makeBlogIR(),
	}

	result, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile failed: %v", err)
	}

	// Find the SQL migration file
	var sqlContent string
	for _, f := range result.Files {
		if f.Path == "generated/migrations/0001_init.sql" {
			sqlContent = string(f.Content)
			break
		}
	}

	if sqlContent == "" {
		t.Fatal("no SQL migration file generated")
	}

	// Must contain pgcrypto extension
	if !strings.Contains(sqlContent, `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`) {
		t.Error("SQL missing pgcrypto extension")
	}

	// Must contain enum type for user role
	if !strings.Contains(sqlContent, "CREATE TYPE users_role AS ENUM") {
		t.Error("SQL missing enum type for users_role")
	}

	// Must contain all tables
	for _, table := range []string{"users", "posts", "comments", "tags"} {
		if !strings.Contains(sqlContent, fmt.Sprintf("CREATE TABLE %s", table)) {
			t.Errorf("SQL missing CREATE TABLE %s", table)
		}
	}

	// Must contain M:N join table (alphabetical order: posts_tags)
	if !strings.Contains(sqlContent, "CREATE TABLE posts_tags") {
		t.Error("SQL missing M:N join table posts_tags")
	}

	// Must contain FK constraints
	if !strings.Contains(sqlContent, "FOREIGN KEY") {
		t.Error("SQL missing FOREIGN KEY constraints")
	}

	// Must contain ON DELETE CASCADE
	if !strings.Contains(sqlContent, "ON DELETE CASCADE") {
		t.Error("SQL missing ON DELETE CASCADE")
	}

	// Must contain FK indexes
	if !strings.Contains(sqlContent, "CREATE INDEX") {
		t.Error("SQL missing FK indexes")
	}

	// Users table must come before posts (topological order)
	usersIdx := strings.Index(sqlContent, "CREATE TABLE users")
	postsIdx := strings.Index(sqlContent, "CREATE TABLE posts")
	if usersIdx > postsIdx {
		t.Error("topological order violated: users should come before posts")
	}
}

// ───── Test: OpenAPI 3.1 Output ─────

func TestOpenAPI31(t *testing.T) {
	req := &ir.CompileRequest{
		Operation: "preview",
		Target:    "typescript",
		IR:        makeBlogIR(),
	}

	result, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile failed: %v", err)
	}

	var oapi map[string]interface{}
	if err := json.Unmarshal(result.OpenAPI, &oapi); err != nil {
		t.Fatalf("OpenAPI JSON parse failed: %v", err)
	}

	// Version check
	if oapi["openapi"] != "3.1.0" {
		t.Errorf("expected openapi 3.1.0, got %v", oapi["openapi"])
	}

	// Must have paths
	paths, ok := oapi["paths"]
	if !ok {
		t.Fatal("OpenAPI missing paths")
	}
	pathsMap, ok := paths.(map[string]interface{})
	if !ok {
		t.Fatal("OpenAPI paths is not an object")
	}

	// Must have CRUD paths for entities
	expectedPaths := []string{"/api/users", "/api/users/{id}", "/api/posts", "/api/posts/{id}"}
	for _, p := range expectedPaths {
		if _, exists := pathsMap[p]; !exists {
			t.Errorf("OpenAPI missing path %s", p)
		}
	}

	// Must have auth endpoints
	if _, exists := pathsMap["/api/auth/register"]; !exists {
		t.Error("OpenAPI missing /api/auth/register")
	}
	if _, exists := pathsMap["/api/auth/login"]; !exists {
		t.Error("OpenAPI missing /api/auth/login")
	}

	// Must have components with schemas
	components, ok := oapi["components"].(map[string]interface{})
	if !ok {
		t.Fatal("OpenAPI missing components")
	}
	schemas, ok := components["schemas"]
	if !ok {
		t.Fatal("OpenAPI missing schemas")
	}

	// Check schema names exist
	schemasMap, ok := schemas.(map[string]interface{})
	if !ok {
		t.Fatal("OpenAPI schemas is not an object")
	}
	for _, name := range []string{"User", "Post", "Comment", "Tag", "Error"} {
		if _, exists := schemasMap[name]; !exists {
			t.Errorf("OpenAPI missing schema %s", name)
		}
	}

	// Must have JWT security scheme
	secSchemes, ok := components["securitySchemes"].(map[string]interface{})
	if !ok {
		t.Fatal("OpenAPI missing securitySchemes")
	}
	if _, exists := secSchemes["BearerAuth"]; !exists {
		t.Error("OpenAPI missing BearerAuth security scheme")
	}
}

// ───── Test: Stable File Ordering ─────

func TestStableFileOrdering(t *testing.T) {
	req := &ir.CompileRequest{
		Operation: "preview",
		Target:    "typescript",
		IR:        makeBlogIR(),
	}

	result1, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile 1 failed: %v", err)
	}

	result2, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile 2 failed: %v", err)
	}

	if len(result1.Files) != len(result2.Files) {
		t.Fatalf("file count mismatch: %d vs %d", len(result1.Files), len(result2.Files))
	}

	for i := range result1.Files {
		if result1.Files[i].Path != result2.Files[i].Path {
			t.Errorf("file order mismatch at index %d: %s vs %s", i, result1.Files[i].Path, result2.Files[i].Path)
		}
	}

	// Verify files are sorted alphabetically
	for i := 1; i < len(result1.Files); i++ {
		if result1.Files[i].Path < result1.Files[i-1].Path {
			t.Errorf("files not sorted: %s comes after %s", result1.Files[i].Path, result1.Files[i-1].Path)
		}
	}
}

// ───── Test: Unsupported Target Diagnostics ─────

func TestUnsupportedTarget(t *testing.T) {
	req := &ir.CompileRequest{
		Operation: "preview",
		Target:    "rust",
		IR:        makeMinimalIR(),
	}

	result, err := Compile(req)
	if err == nil {
		t.Fatal("expected error for unsupported target")
	}

	if result == nil {
		t.Fatal("expected non-nil result with diagnostics")
	}

	found := false
	for _, d := range result.Diagnostics {
		if strings.Contains(d.Message, "unsupported target") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected diagnostic about unsupported target")
	}
}

// ───── Test: Unsupported Target-Database Combination ─────

func TestUnsupportedTargetDB(t *testing.T) {
	mongoIR := makeMinimalIR()
	mongoIR.Project.Database = ir.MongoDB

	req := &ir.CompileRequest{
		Operation: "preview",
		Target:    "python",
		IR:        mongoIR,
	}

	result, err := Compile(req)
	if err == nil {
		t.Fatal("expected error for python+mongodb")
	}

	if result == nil {
		t.Fatal("expected non-nil result with diagnostics")
	}

	found := false
	for _, d := range result.Diagnostics {
		if strings.Contains(d.Message, "does not support database") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected diagnostic about unsupported database for target")
	}
}

// ───── Test: Byte-Identical ZIP Output (FR-25) ─────

func TestDeterministicZip(t *testing.T) {
	req := &ir.CompileRequest{
		Operation: "download",
		Target:    "typescript",
		IR:        makeBlogIR(),
	}

	result1, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile 1 failed: %v", err)
	}
	zip1, err := BuildZip(result1.Files)
	if err != nil {
		t.Fatalf("BuildZip 1 failed: %v", err)
	}

	result2, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile 2 failed: %v", err)
	}
	zip2, err := BuildZip(result2.Files)
	if err != nil {
		t.Fatalf("BuildZip 2 failed: %v", err)
	}

	if !bytes.Equal(zip1, zip2) {
		t.Errorf("ZIPs are not byte-identical (len1=%d, len2=%d)", len(zip1), len(zip2))

		// Report first byte difference
		minLen := len(zip1)
		if len(zip2) < minLen {
			minLen = len(zip2)
		}
		for i := 0; i < minLen; i++ {
			if zip1[i] != zip2[i] {
				t.Errorf("first difference at byte %d: 0x%02x vs 0x%02x", i, zip1[i], zip2[i])
				break
			}
		}
	}
}

// ───── Test: Minimal IR Compilation ─────

func TestMinimalCompile(t *testing.T) {
	req := &ir.CompileRequest{
		Operation: "preview",
		Target:    "typescript",
		IR:        makeMinimalIR(),
	}

	result, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile failed: %v", err)
	}

	if len(result.Files) == 0 {
		t.Fatal("expected generated files")
	}

	if len(result.OpenAPI) == 0 {
		t.Fatal("expected OpenAPI output")
	}

	// Should have migration SQL
	hasMigration := false
	for _, f := range result.Files {
		if strings.HasSuffix(f.Path, ".sql") {
			hasMigration = true
			break
		}
	}
	if !hasMigration {
		t.Error("expected SQL migration file for postgres target")
	}
}

// ───── Test: MongoDB IR (no DDL) ─────

func TestMongoDBNoDDL(t *testing.T) {
	mongoIR := makeMinimalIR()
	mongoIR.Project.Database = ir.MongoDB

	req := &ir.CompileRequest{
		Operation: "preview",
		Target:    "typescript",
		IR:        mongoIR,
	}

	result, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile failed: %v", err)
	}

	// MongoDB should NOT produce SQL migration files
	for _, f := range result.Files {
		if strings.HasSuffix(f.Path, ".sql") {
			t.Errorf("MongoDB target should not produce SQL file: %s", f.Path)
		}
	}

	// But should still produce OpenAPI
	if len(result.OpenAPI) == 0 {
		t.Fatal("expected OpenAPI output for MongoDB")
	}
}

// ───── Test: IR Validation Failure ─────

func TestIRValidationFailure(t *testing.T) {
	badIR := ir.IRDocument{
		IRVersion: "2.0", // wrong version
		Project:   ir.ProjectConfig{Name: "test", Database: ir.Postgres},
		Entities:  []ir.Entity{},
		Relations: []ir.Relation{},
		Endpoints: []ir.EndpointConfig{},
		Auth:      ir.AuthConfig{Enabled: false, Strategy: "jwt", Roles: []string{}},
	}

	req := &ir.CompileRequest{
		Operation: "preview",
		Target:    "typescript",
		IR:        badIR,
	}

	_, err := Compile(req)
	if err == nil {
		t.Fatal("expected error for invalid IR version")
	}

	if !strings.Contains(err.Error(), "IR validation failed") {
		t.Errorf("expected IR validation error, got: %v", err)
	}
}

// ───── Test: ZIP Entry Structure ─────

func TestZipEntryStructure(t *testing.T) {
	req := &ir.CompileRequest{
		Operation: "download",
		Target:    "go",
		IR:        makeBlogIR(),
	}

	result, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile failed: %v", err)
	}

	zipData, err := BuildZip(result.Files)
	if err != nil {
		t.Fatalf("BuildZip failed: %v", err)
	}

	reader, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		t.Fatalf("ZIP read failed: %v", err)
	}

	// Check expected files exist
	fileSet := make(map[string]bool)
	for _, f := range reader.File {
		fileSet[f.Name] = true
	}

	expectedFiles := []string{
		"generated/migrations/0001_init.sql",
		"generated/openapi.json",
		"generated/README.md",
		"generated/.env.example",
		"generated/Dockerfile",
		"generated/docker-compose.yml",
		"custom/hooks/.gitkeep",
	}

	for _, expected := range expectedFiles {
		if !fileSet[expected] {
			t.Errorf("ZIP missing expected file: %s", expected)
		}
	}
}

// ───── Benchmark: 20-Entity Compilation ─────

func BenchmarkCompile20Entities(b *testing.B) {
	irDoc := make20EntityIR()
	req := &ir.CompileRequest{
		Operation: "download",
		Target:    "typescript",
		IR:        irDoc,
	}

	// Warmup
	result, err := Compile(req)
	if err != nil {
		b.Fatalf("Compile warmup failed: %v", err)
	}
	if _, err := BuildZip(result.Files); err != nil {
		b.Fatalf("BuildZip warmup failed: %v", err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		result, err := Compile(req)
		if err != nil {
			b.Fatalf("Compile failed: %v", err)
		}
		if _, err := BuildZip(result.Files); err != nil {
			b.Fatalf("BuildZip failed: %v", err)
		}
	}
}

// make20EntityIR generates a 20-entity IR fixture for benchmarking.
func make20EntityIR() ir.IRDocument {
	entities := make([]ir.Entity, 20)
	endpoints := make([]ir.EndpointConfig, 20)
	var relations []ir.Relation

	for i := 0; i < 20; i++ {
		name := fmt.Sprintf("Entity%02d", i)
		tableName := fmt.Sprintf("entity_%02d", i)
		entID := fmt.Sprintf("ent_%02d", i)

		fields := []ir.Field{
			{ID: fmt.Sprintf("fld_%02d_id", i), Name: "id", Type: ir.FieldUUID, Required: boolPtr(true), Unique: boolPtr(true), IsPrimaryKey: boolPtr(true), Default: "uuid()"},
			{ID: fmt.Sprintf("fld_%02d_name", i), Name: "name", Type: ir.FieldString, Required: boolPtr(true)},
			{ID: fmt.Sprintf("fld_%02d_value", i), Name: "value", Type: ir.FieldInt, Required: boolPtr(false)},
			{ID: fmt.Sprintf("fld_%02d_active", i), Name: "active", Type: ir.FieldBool, Required: boolPtr(true), Default: true},
			{ID: fmt.Sprintf("fld_%02d_created", i), Name: "createdAt", Type: ir.FieldTimestamp, Required: boolPtr(true), Default: "now()"},
		}

		// Every even entity has a FK to the previous odd entity
		if i > 0 && i%2 == 0 {
			fkFieldID := fmt.Sprintf("fld_%02d_parent", i)
			fields = append(fields, ir.Field{
				ID: fkFieldID, Name: "parentId", Type: ir.FieldUUID, Required: boolPtr(true),
			})
			relations = append(relations, ir.Relation{
				ID:              fmt.Sprintf("rel_%02d_parent", i),
				FromEntityID:    fmt.Sprintf("ent_%02d", i-1),
				ToEntityID:      entID,
				Kind:            ir.OneToMany,
				ForeignKeyField: "parentId",
				OnDelete:        ir.Cascade,
			})
		}

		entities[i] = ir.Entity{ID: entID, Name: name, TableName: tableName, Fields: fields}
		endpoints[i] = ir.EndpointConfig{
			EntityID: entID,
			Ops:      []ir.EndpointOp{ir.OpList, ir.OpGet, ir.OpCreate, ir.OpUpdate, ir.OpDelete},
			AuthRequired: false,
		}
	}

	return ir.IRDocument{
		IRVersion: "1.0",
		Project:   ir.ProjectConfig{Name: "bench_app", Database: ir.Postgres},
		Entities:  entities,
		Relations: relations,
		Endpoints: endpoints,
		Auth:      ir.AuthConfig{Enabled: true, Strategy: "jwt", Roles: []string{"ADMIN", "USER"}},
	}
}

// ───── Test: 20-Entity Smoke Test ─────

func TestCompile20Entities(t *testing.T) {
	irDoc := make20EntityIR()
	req := &ir.CompileRequest{
		Operation: "download",
		Target:    "typescript",
		IR:        irDoc,
	}

	result, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile 20-entity failed: %v", err)
	}

	zipData, err := BuildZip(result.Files)
	if err != nil {
		t.Fatalf("BuildZip 20-entity failed: %v", err)
	}

	if len(zipData) == 0 {
		t.Fatal("expected non-empty ZIP for 20-entity fixture")
	}

	// Verify ZIP is readable and contains migration + openapi
	reader, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		t.Fatalf("ZIP read failed: %v", err)
	}

	hasMigration := false
	hasOpenAPI := false
	for _, f := range reader.File {
		if strings.Contains(f.Name, "0001_init.sql") {
			hasMigration = true
		}
		if strings.Contains(f.Name, "openapi.json") {
			hasOpenAPI = true
		}
	}

	if !hasMigration {
		t.Error("20-entity ZIP missing migration file")
	}
	if !hasOpenAPI {
		t.Error("20-entity ZIP missing openapi.json")
	}
}

// ───── Test: DDL Topological Order with Deep Chain ─────

func TestDDLTopologicalOrder(t *testing.T) {
	// Create a chain: A <- B <- C (C depends on B, B depends on A)
	irDoc := ir.IRDocument{
		IRVersion: "1.0",
		Project:   ir.ProjectConfig{Name: "topo_test", Database: ir.Postgres},
		Entities: []ir.Entity{
			{ID: "ent_c", Name: "C", TableName: "table_c", Fields: []ir.Field{
				{ID: "fld_c_id", Name: "id", Type: ir.FieldUUID, Required: boolPtr(true), Unique: boolPtr(true), IsPrimaryKey: boolPtr(true), Default: "uuid()"},
				{ID: "fld_c_b_id", Name: "bId", Type: ir.FieldUUID, Required: boolPtr(true)},
			}},
			{ID: "ent_a", Name: "A", TableName: "table_a", Fields: []ir.Field{
				{ID: "fld_a_id", Name: "id", Type: ir.FieldUUID, Required: boolPtr(true), Unique: boolPtr(true), IsPrimaryKey: boolPtr(true), Default: "uuid()"},
			}},
			{ID: "ent_b", Name: "B", TableName: "table_b", Fields: []ir.Field{
				{ID: "fld_b_id", Name: "id", Type: ir.FieldUUID, Required: boolPtr(true), Unique: boolPtr(true), IsPrimaryKey: boolPtr(true), Default: "uuid()"},
				{ID: "fld_b_a_id", Name: "aId", Type: ir.FieldUUID, Required: boolPtr(true)},
			}},
		},
		Relations: []ir.Relation{
			{ID: "rel_a_b", FromEntityID: "ent_a", ToEntityID: "ent_b", Kind: ir.OneToMany, ForeignKeyField: "aId", OnDelete: ir.Cascade},
			{ID: "rel_b_c", FromEntityID: "ent_b", ToEntityID: "ent_c", Kind: ir.OneToMany, ForeignKeyField: "bId", OnDelete: ir.Cascade},
		},
		Endpoints: []ir.EndpointConfig{
			{EntityID: "ent_a", Ops: []ir.EndpointOp{ir.OpList}, AuthRequired: false},
			{EntityID: "ent_b", Ops: []ir.EndpointOp{ir.OpList}, AuthRequired: false},
			{EntityID: "ent_c", Ops: []ir.EndpointOp{ir.OpList}, AuthRequired: false},
		},
		Auth: ir.AuthConfig{Enabled: false, Strategy: "jwt", Roles: []string{}},
	}

	req := &ir.CompileRequest{Operation: "preview", Target: "typescript", IR: irDoc}
	result, err := Compile(req)
	if err != nil {
		t.Fatalf("Compile failed: %v", err)
	}

	var sqlContent string
	for _, f := range result.Files {
		if f.Path == "generated/migrations/0001_init.sql" {
			sqlContent = string(f.Content)
			break
		}
	}

	// A must come before B, and B before C
	aIdx := strings.Index(sqlContent, "CREATE TABLE table_a")
	bIdx := strings.Index(sqlContent, "CREATE TABLE table_b")
	cIdx := strings.Index(sqlContent, "CREATE TABLE table_c")

	if aIdx < 0 || bIdx < 0 || cIdx < 0 {
		t.Fatal("missing one or more CREATE TABLE statements")
	}

	if aIdx > bIdx {
		t.Error("topological order violated: table_a should come before table_b")
	}
	if bIdx > cIdx {
		t.Error("topological order violated: table_b should come before table_c")
	}
}
