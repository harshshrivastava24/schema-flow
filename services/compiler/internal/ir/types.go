// Package ir defines the Go-side representation of the IRDocument v1.0 contract
// and protocol envelopes for stdin/stdout compiler communication.
package ir

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// IR_VERSION is the canonical IR contract version this compiler supports.
const IR_VERSION = "1.0"

// ───── Portable field types ─────

type FieldType string

const (
	FieldString    FieldType = "string"
	FieldInt       FieldType = "int"
	FieldDecimal   FieldType = "decimal"
	FieldBool      FieldType = "bool"
	FieldTimestamp FieldType = "timestamp"
	FieldUUID      FieldType = "uuid"
	FieldJSON      FieldType = "json"
	FieldEnum      FieldType = "enum"
)

// ───── Relation kinds & on-delete actions ─────

type RelationKind string

const (
	OneToOne   RelationKind = "one-to-one"
	OneToMany  RelationKind = "one-to-many"
	ManyToMany RelationKind = "many-to-many"
)

type OnDeleteAction string

const (
	Restrict OnDeleteAction = "RESTRICT"
	Cascade  OnDeleteAction = "CASCADE"
	SetNull  OnDeleteAction = "SET_NULL"
)

// ───── Database type ─────

type DatabaseType string

const (
	Postgres DatabaseType = "postgres"
	MongoDB  DatabaseType = "mongodb"
)

// ───── IR Domain Structs ─────

type Field struct {
	ID           string      `json:"id"`
	Name         string      `json:"name"`
	Type         FieldType   `json:"type"`
	Required     *bool       `json:"required,omitempty"`
	Unique       *bool       `json:"unique,omitempty"`
	IsPrimaryKey *bool       `json:"isPrimaryKey,omitempty"`
	Default      interface{} `json:"default,omitempty"`
	EnumValues   []string    `json:"enumValues,omitempty"`
}

type Entity struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	TableName string  `json:"tableName"`
	Fields    []Field `json:"fields"`
}

type Relation struct {
	ID              string         `json:"id"`
	FromEntityID    string         `json:"fromEntityId"`
	ToEntityID      string         `json:"toEntityId"`
	Kind            RelationKind   `json:"kind"`
	ForeignKeyField string         `json:"foreignKeyField,omitempty"`
	OnDelete        OnDeleteAction `json:"onDelete,omitempty"`
}

type EndpointOp string

const (
	OpList   EndpointOp = "list"
	OpGet    EndpointOp = "get"
	OpCreate EndpointOp = "create"
	OpUpdate EndpointOp = "update"
	OpDelete EndpointOp = "delete"
)

type EndpointConfig struct {
	EntityID     string       `json:"entityId"`
	Ops          []EndpointOp `json:"ops"`
	AuthRequired bool         `json:"authRequired"`
}

type AuthConfig struct {
	Enabled  bool     `json:"enabled"`
	Strategy string   `json:"strategy"`
	Roles    []string `json:"roles"`
}

type ProjectConfig struct {
	Name     string       `json:"name"`
	Database DatabaseType `json:"database"`
}

// IRDocument is the full canonical IR v1.0 contract.
// Layout is deliberately excluded — the compiler receives only the semantic projection.
type IRDocument struct {
	IRVersion string           `json:"irVersion"`
	Project   ProjectConfig    `json:"project"`
	Entities  []Entity         `json:"entities"`
	Relations []Relation       `json:"relations"`
	Endpoints []EndpointConfig `json:"endpoints"`
	Auth      AuthConfig       `json:"auth"`
}

// ───── Compile Protocol Envelopes ─────

type CompileRequest struct {
	Operation string      `json:"operation"` // "preview" | "download"
	Target    string      `json:"target"`    // e.g. "typescript", "python", "go"
	IR        IRDocument  `json:"ir"`
}

// PreviewFile describes a single generated file in the preview response.
type PreviewFile struct {
	Path     string `json:"path"`
	Language string `json:"language,omitempty"`
}

// Diagnostic is a structured warning or error from the compiler.
type Diagnostic struct {
	Severity string `json:"severity"` // "error" | "warning" | "info"
	Message  string `json:"message"`
	Path     string `json:"path,omitempty"`
}

// PreviewResponse is the JSON envelope for operation=preview.
type PreviewResponse struct {
	OpenAPI         json.RawMessage `json:"openapi"`
	Files           []PreviewFile   `json:"files"`
	Diagnostics     []Diagnostic    `json:"diagnostics"`
	CompilerVersion string          `json:"compilerVersion"`
}

// ErrorResponse is returned on stdin parse or validation failures.
type ErrorResponse struct {
	Error       string       `json:"error"`
	Diagnostics []Diagnostic `json:"diagnostics,omitempty"`
}

// ───── Identifier validation ─────

var identifierRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,63}$`)
var projectNameRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// ValidateIdentifier checks that a string is a safe identifier per the IR contract.
func ValidateIdentifier(name, context string) error {
	if !identifierRe.MatchString(name) {
		return fmt.Errorf("%s: invalid identifier %q (must match ^[A-Za-z_][A-Za-z0-9_]{0,63}$)", context, name)
	}
	return nil
}

// ValidateIR performs lightweight semantic checks the Go compiler needs
// beyond JSON deserialization — identifier safety, entity/field presence, PK existence.
func ValidateIR(doc *IRDocument) []Diagnostic {
	var diags []Diagnostic

	if doc.IRVersion != IR_VERSION {
		diags = append(diags, Diagnostic{
			Severity: "error",
			Message:  fmt.Sprintf("unsupported irVersion %q, expected %q", doc.IRVersion, IR_VERSION),
		})
	}

	if !projectNameRe.MatchString(doc.Project.Name) {
		diags = append(diags, Diagnostic{
			Severity: "error",
			Message:  fmt.Sprintf("project.name: invalid name %q (must match ^[A-Za-z0-9_-]{1,64}$)", doc.Project.Name),
		})
	}

	entityIDs := make(map[string]bool)
	for i, ent := range doc.Entities {
		entityIDs[ent.ID] = true
		if err := ValidateIdentifier(ent.Name, fmt.Sprintf("entities[%d].name", i)); err != nil {
			diags = append(diags, Diagnostic{Severity: "error", Message: err.Error()})
		}
		if err := ValidateIdentifier(ent.TableName, fmt.Sprintf("entities[%d].tableName", i)); err != nil {
			diags = append(diags, Diagnostic{Severity: "error", Message: err.Error()})
		}

		hasPK := false
		for j, fld := range ent.Fields {
			if err := ValidateIdentifier(fld.Name, fmt.Sprintf("entities[%d].fields[%d].name", i, j)); err != nil {
				diags = append(diags, Diagnostic{Severity: "error", Message: err.Error()})
			}
			if fld.IsPrimaryKey != nil && *fld.IsPrimaryKey {
				hasPK = true
			}
		}
		if !hasPK {
			diags = append(diags, Diagnostic{
				Severity: "error",
				Message:  fmt.Sprintf("entity %q has no primary key field", ent.Name),
			})
		}
	}

	for i, rel := range doc.Relations {
		if !entityIDs[rel.FromEntityID] {
			diags = append(diags, Diagnostic{
				Severity: "error",
				Message:  fmt.Sprintf("relations[%d].fromEntityId %q not found", i, rel.FromEntityID),
			})
		}
		if !entityIDs[rel.ToEntityID] {
			diags = append(diags, Diagnostic{
				Severity: "error",
				Message:  fmt.Sprintf("relations[%d].toEntityId %q not found", i, rel.ToEntityID),
			})
		}
	}

	validDB := map[DatabaseType]bool{Postgres: true, MongoDB: true}
	if !validDB[doc.Project.Database] {
		diags = append(diags, Diagnostic{
			Severity: "error",
			Message:  fmt.Sprintf("unsupported database %q", doc.Project.Database),
		})
	}

	return diags
}

// ───── Helper predicates ─────

// IsRequired returns true when the field's required flag is explicitly true.
func (f *Field) IsRequired() bool {
	return f.Required != nil && *f.Required
}

// IsUnique returns true when the field's unique flag is explicitly true.
func (f *Field) IsUnique() bool {
	return f.Unique != nil && *f.Unique
}

// IsPK returns true when the field is marked as primary key.
func (f *Field) IsPK() bool {
	return f.IsPrimaryKey != nil && *f.IsPrimaryKey
}

// PrimaryKeyField returns the first primary key field of the entity, or nil.
func (e *Entity) PrimaryKeyField() *Field {
	for i := range e.Fields {
		if e.Fields[i].IsPK() {
			return &e.Fields[i]
		}
	}
	return nil
}

// EntityByID looks up an entity by ID. Returns nil if not found.
func (doc *IRDocument) EntityByID(id string) *Entity {
	for i := range doc.Entities {
		if doc.Entities[i].ID == id {
			return &doc.Entities[i]
		}
	}
	return nil
}

// ToLowerSnake converts a PascalCase or camelCase string to lower_snake_case.
func ToLowerSnake(s string) string {
	var result strings.Builder
	for i, r := range s {
		if r >= 'A' && r <= 'Z' {
			if i > 0 {
				result.WriteByte('_')
			}
			result.WriteRune(r + ('a' - 'A'))
		} else {
			result.WriteRune(r)
		}
	}
	return result.String()
}

// ToPlural provides a naive English pluralizer (sufficient for table/route names).
func ToPlural(s string) string {
	if s == "" {
		return s
	}
	lower := strings.ToLower(s)
	if strings.HasSuffix(lower, "s") || strings.HasSuffix(lower, "x") ||
		strings.HasSuffix(lower, "ch") || strings.HasSuffix(lower, "sh") {
		return s + "es"
	}
	if strings.HasSuffix(lower, "y") && len(lower) > 1 {
		prev := lower[len(lower)-2]
		if prev != 'a' && prev != 'e' && prev != 'i' && prev != 'o' && prev != 'u' {
			return s[:len(s)-1] + "ies"
		}
	}
	return s + "s"
}
