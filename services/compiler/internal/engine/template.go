package engine

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/template"
	"unicode"

	"github.com/harsh/backendgen/services/compiler/internal/ir"
)

// View models for template rendering

type ProjectView struct {
	IR           *ir.IRDocument
	Project      ir.ProjectConfig
	Target       string
	Database     string
	Entities     []EntityView
	Auth         ir.AuthConfig
	HasAuth      bool
	Version      string
	AuthEntity   *EntityView
}

type EntityView struct {
	ID           string
	Name         string // e.g. "User", "Post"
	CamelName    string // e.g. "user", "post"
	SnakeName    string // e.g. "user", "post"
	PluralName   string // e.g. "users", "posts"
	TableName    string // e.g. "users", "posts"
	Fields       []FieldView
	PrimaryKey   FieldView
	Relations    []RelationView
	Endpoints    EndpointView
	HasAuth      bool // endpoint authRequired && auth.enabled
	IsAuthEntity bool // e.g. User entity when auth enabled
	Project      *ProjectView
}

type FieldView struct {
	ID           string
	Name         string
	CamelName    string
	SnakeName    string
	Type         ir.FieldType
	TsType       string
	MongooseType string
	ZodType      string
	Required        bool
	Unique          bool
	IsPrimaryKey    bool
	IsAutoTimestamp bool
	Default         string
	EnumValues   []string
	RefEntity    string
}

type RelationView struct {
	ID              string
	FromEntityID    string
	ToEntityID      string
	TargetEntity    string
	Kind            ir.RelationKind
	ForeignKeyField string
	OnDelete        ir.OnDeleteAction
}

type EndpointView struct {
	Ops          map[string]bool
	AuthRequired bool
}

// FindTargetsDir searches for the root targets directory across common relative paths
// and by walking up parent directories.
func FindTargetsDir() (string, error) {
	if custom := os.Getenv("TARGETS_DIR"); custom != "" {
		if fi, err := os.Stat(custom); err == nil && fi.IsDir() {
			return custom, nil
		}
	}

	dir, err := os.Getwd()
	if err != nil {
		dir = "."
	}

	for i := 0; i < 8; i++ {
		candidate := filepath.Join(dir, "targets")
		if fi, err := os.Stat(candidate); err == nil && fi.IsDir() {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return "", fmt.Errorf("targets directory not found (checked TARGETS_DIR and parent directories)")
}

// String casing helpers

func splitWords(s string) []string {
	var words []string
	var current []rune

	runes := []rune(s)
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		if r == '_' || r == '-' || r == ' ' {
			if len(current) > 0 {
				words = append(words, string(current))
				current = nil
			}
			continue
		}

		if unicode.IsUpper(r) {
			if len(current) > 0 {
				// If previous is lowercase, or next is lowercase, break word
				prevLower := unicode.IsLower(runes[i-1])
				nextLower := i+1 < len(runes) && unicode.IsLower(runes[i+1])
				if prevLower || (nextLower && len(current) > 1) {
					words = append(words, string(current))
					current = nil
				}
			}
		}
		current = append(current, r)
	}

	if len(current) > 0 {
		words = append(words, string(current))
	}
	return words
}

func PascalCase(s string) string {
	words := splitWords(s)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + strings.ToLower(w[1:])
		}
	}
	return strings.Join(words, "")
}

func CamelCase(s string) string {
	p := PascalCase(s)
	if len(p) == 0 {
		return ""
	}
	return strings.ToLower(p[:1]) + p[1:]
}

func SnakeCase(s string) string {
	words := splitWords(s)
	for i, w := range words {
		words[i] = strings.ToLower(w)
	}
	return strings.Join(words, "_")
}

// BuildProjectView constructs the complete view model from an IR document.
func BuildProjectView(doc *ir.IRDocument, target string) (*ProjectView, error) {
	pv := &ProjectView{
		IR:       doc,
		Project:  doc.Project,
		Target:   target,
		Database: string(doc.Project.Database),
		HasAuth:  doc.Auth.Enabled,
		Auth:     doc.Auth,
		Version:  CompilerVersion,
	}

	// Map entity ID -> entity name
	entityNameMap := make(map[string]string)
	for _, ent := range doc.Entities {
		entityNameMap[ent.ID] = ent.Name
	}

	// Map entity ID -> relation list
	relationsMap := make(map[string][]RelationView)
	for _, rel := range doc.Relations {
		rv := RelationView{
			ID:              rel.ID,
			FromEntityID:    rel.FromEntityID,
			ToEntityID:      rel.ToEntityID,
			TargetEntity:    entityNameMap[rel.ToEntityID],
			Kind:            rel.Kind,
			ForeignKeyField: rel.ForeignKeyField,
			OnDelete:        rel.OnDelete,
		}
		relationsMap[rel.FromEntityID] = append(relationsMap[rel.FromEntityID], rv)
	}

	// Map entity ID -> endpoints config
	endpointsMap := make(map[string]EndpointView)
	for _, ep := range doc.Endpoints {
		ev := EndpointView{
			Ops:          make(map[string]bool),
			AuthRequired: ep.AuthRequired,
		}
		for _, op := range ep.Ops {
			ev.Ops[string(op)] = true
		}
		endpointsMap[ep.EntityID] = ev
	}

	// Build EntityViews
	for _, ent := range doc.Entities {
		tableName := ent.TableName
		if tableName == "" {
			tableName = strings.ToLower(ent.Name) + "s"
		}

		ev := EntityView{
			ID:         ent.ID,
			Name:       ent.Name,
			CamelName:  CamelCase(ent.Name),
			SnakeName:  SnakeCase(ent.Name),
			PluralName: tableName,
			TableName:  tableName,
			Project:    pv,
		}

		if ep, ok := endpointsMap[ent.ID]; ok {
			ev.Endpoints = ep
			ev.HasAuth = ep.AuthRequired && pv.HasAuth
		} else {
			ev.Endpoints = EndpointView{
				Ops: map[string]bool{"list": true, "get": true, "create": true, "update": true, "delete": true},
			}
		}

		// Auth entity detection (User or matching role model)
		if pv.HasAuth && (strings.EqualFold(ent.Name, "User") || strings.EqualFold(ent.Name, "Account")) {
			ev.IsAuthEntity = true
			pv.AuthEntity = &ev
		}

		// Process fields
		for _, f := range ent.Fields {
			fv := FieldView{
				ID:        f.ID,
				Name:      f.Name,
				CamelName: CamelCase(f.Name),
				SnakeName: SnakeCase(f.Name),
				Type:      f.Type,
			}

			if f.Required != nil {
				fv.Required = *f.Required
			}
			if f.Unique != nil {
				fv.Unique = *f.Unique
			}
			if f.IsPrimaryKey != nil {
				fv.IsPrimaryKey = *f.IsPrimaryKey
				if fv.IsPrimaryKey {
					ev.PrimaryKey = fv
				}
			}

			// Format defaults
			if f.Default != nil {
				switch d := f.Default.(type) {
				case string:
					if d == "uuid()" {
						fv.Default = "" // generated on insert
					} else if d == "now()" {
						fv.Default = "Date.now"
						fv.IsAutoTimestamp = true
					} else {
						fv.Default = fmt.Sprintf("'%s'", d)
					}
				case bool:
					fv.Default = fmt.Sprintf("%t", d)
				case float64:
					fv.Default = fmt.Sprintf("%v", d)
				default:
					fv.Default = fmt.Sprintf("%v", d)
				}
			}

			// Map types
			switch f.Type {
			case ir.FieldString:
				fv.TsType = "string"
				fv.MongooseType = "String"
				if f.Name == "email" {
					fv.ZodType = "z.string().email('Invalid email address')"
				} else {
					fv.ZodType = "z.string()"
				}
			case ir.FieldInt:
				fv.TsType = "number"
				fv.MongooseType = "Number"
				fv.ZodType = "z.number().int()"
			case ir.FieldDecimal:
				fv.TsType = "number"
				fv.MongooseType = "Number"
				fv.ZodType = "z.number()"
			case ir.FieldBool:
				fv.TsType = "boolean"
				fv.MongooseType = "Boolean"
				fv.ZodType = "z.boolean()"
			case ir.FieldTimestamp:
				fv.TsType = "Date"
				fv.MongooseType = "Date"
				fv.ZodType = "z.string().or(z.date())"
			case ir.FieldUUID:
				fv.TsType = "string"
				fv.MongooseType = "String"
				fv.ZodType = "z.string()"
			case ir.FieldJSON:
				fv.TsType = "Record<string, unknown> | unknown[]"
				fv.MongooseType = "Schema.Types.Mixed"
				fv.ZodType = "z.record(z.unknown()).or(z.array(z.unknown()))"
			case ir.FieldEnum:
				fv.EnumValues = f.EnumValues
				var quoted []string
				for _, v := range f.EnumValues {
					quoted = append(quoted, fmt.Sprintf("'%s'", v))
				}
				fv.TsType = strings.Join(quoted, " | ")
				fv.MongooseType = "String"
				fv.ZodType = fmt.Sprintf("%s%sEnum", ev.Name, PascalCase(f.Name))
			}

			// Check if this field is a foreign key
			for _, rel := range doc.Relations {
				if rel.ToEntityID == ent.ID && rel.ForeignKeyField == f.Name {
					fv.RefEntity = entityNameMap[rel.FromEntityID]
					break
				}
			}

			ev.Fields = append(ev.Fields, fv)
		}

		if rels, ok := relationsMap[ent.ID]; ok {
			ev.Relations = rels
		}

		pv.Entities = append(pv.Entities, ev)
	}

	return pv, nil
}

// RenderTargetTemplates executes templates defined in manifest.yaml for the given target and IR.
func RenderTargetTemplates(doc *ir.IRDocument, target string, targetDir string, m *Manifest) ([]GeneratedFile, error) {
	pv, err := BuildProjectView(doc, target)
	if err != nil {
		return nil, fmt.Errorf("build project view: %w", err)
	}

	funcMap := template.FuncMap{
		"lower":  strings.ToLower,
		"upper":  strings.ToUpper,
		"pascal": PascalCase,
		"camel":  CamelCase,
		"snake":  SnakeCase,
	}

	templates := m.FilterTemplates(string(doc.Project.Database))
	var outFiles []GeneratedFile

	for _, entry := range templates {
		srcPath := filepath.Join(targetDir, entry.Source)
		tmplBytes, err := os.ReadFile(srcPath)
		if err != nil {
			return nil, fmt.Errorf("read template %s: %w", srcPath, err)
		}

		tmpl, err := template.New(entry.Source).Funcs(funcMap).Parse(string(tmplBytes))
		if err != nil {
			return nil, fmt.Errorf("parse template %s: %w", entry.Source, err)
		}

		if entry.PerEntity {
			for _, ent := range pv.Entities {
				var buf bytes.Buffer
				if err := tmpl.Execute(&buf, ent); err != nil {
					return nil, fmt.Errorf("execute template %s for %s: %w", entry.Source, ent.Name, err)
				}

				outPath := entry.Output
				outPath = strings.ReplaceAll(outPath, "{{entity.name}}", ent.Name)
				outPath = strings.ReplaceAll(outPath, "{{entity.snake}}", ent.SnakeName)
				outPath = strings.ReplaceAll(outPath, "{{entity.camel}}", ent.CamelName)

				outFiles = append(outFiles, GeneratedFile{
					Path:     outPath,
					Content:  buf.Bytes(),
					Language: entry.Language,
				})
			}
		} else {
			var buf bytes.Buffer
			if err := tmpl.Execute(&buf, pv); err != nil {
				return nil, fmt.Errorf("execute template %s: %w", entry.Source, err)
			}

			outFiles = append(outFiles, GeneratedFile{
				Path:     entry.Output,
				Content:  buf.Bytes(),
				Language: entry.Language,
			})
		}
	}

	return outFiles, nil
}
