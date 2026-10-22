package engine

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"text/template"
	"unicode"

	"github.com/harsh/backendgen/services/compiler/internal/ir"
)

// View models for template rendering

type ProjectView struct {
	IR                  *ir.IRDocument
	Project             ir.ProjectConfig
	Target              string
	Database            string
	Entities            []EntityView
	Auth                ir.AuthConfig
	HasAuth             bool
	Version             string
	AuthEntity          *EntityView
	Enums               []EnumView
	ManyToManyRelations []JoinTableView
}

type EnumView struct {
	Name       string
	SqlName    string
	Values     []string
	QuotedVals string
}

type JoinTableView struct {
	TableName string
	FromCol   string
	ToCol     string
	FromTable string
	ToTable   string
	FromPK    string
	ToPK      string
	FromType  string
	ToType    string
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
	ID              string
	Name            string
	CamelName       string
	SnakeName       string
	Type            ir.FieldType
	TsType          string
	MongooseType    string
	ZodType         string
	DrizzleColDef   string
	Required        bool
	Unique          bool
	IsPrimaryKey    bool
	IsAutoTimestamp bool
	Default         string
	EnumValues      []string
	RefEntity       string
	RefTable        string
	RefCol          string
	OnDelete        string
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

			// Drizzle column definition
			var colDef string
			switch f.Type {
			case ir.FieldUUID:
				if fv.IsPrimaryKey {
					colDef = fmt.Sprintf("uuid('%s').primaryKey().defaultRandom()", f.Name)
				} else {
					colDef = fmt.Sprintf("uuid('%s')", f.Name)
				}
			case ir.FieldString:
				if fv.IsPrimaryKey {
					colDef = fmt.Sprintf("text('%s').primaryKey()", f.Name)
				} else {
					colDef = fmt.Sprintf("text('%s')", f.Name)
				}
			case ir.FieldInt:
				if fv.IsPrimaryKey {
					colDef = fmt.Sprintf("integer('%s').primaryKey()", f.Name)
				} else {
					colDef = fmt.Sprintf("integer('%s')", f.Name)
				}
			case ir.FieldDecimal:
				colDef = fmt.Sprintf("numeric('%s')", f.Name)
			case ir.FieldBool:
				colDef = fmt.Sprintf("boolean('%s')", f.Name)
			case ir.FieldTimestamp:
				colDef = fmt.Sprintf("timestamp('%s', { withTimezone: true, mode: 'date' })", f.Name)
			case ir.FieldJSON:
				colDef = fmt.Sprintf("jsonb('%s')", f.Name)
			case ir.FieldEnum:
				colDef = fmt.Sprintf("%s_%s('%s')", tableName, f.Name, f.Name)
			}

			// Add constraints if not PK
			if !fv.IsPrimaryKey {
				if fv.Required {
					colDef += ".notNull()"
				}
				if fv.Unique {
					colDef += ".unique()"
				}
				if f.Default != nil {
					switch d := f.Default.(type) {
					case string:
						if d == "now()" {
							colDef += ".defaultNow()"
						} else if d != "uuid()" && d != "gen_random_uuid()" {
							colDef += fmt.Sprintf(".default('%s')", d)
						}
					case bool:
						colDef += fmt.Sprintf(".default(%t)", d)
					case float64:
						colDef += fmt.Sprintf(".default(%v)", d)
					}
				}
			}

			// Check if this field is a foreign key
			for _, rel := range doc.Relations {
				if rel.ToEntityID == ent.ID && rel.ForeignKeyField == f.Name {
					fv.RefEntity = entityNameMap[rel.FromEntityID]
					fromEnt := doc.EntityByID(rel.FromEntityID)
					if fromEnt != nil {
						fv.RefTable = fromEnt.TableName
						fromPK := fromEnt.PrimaryKeyField()
						if fromPK != nil {
							fv.RefCol = fromPK.Name
						}
						onDel := "cascade"
						if rel.OnDelete == ir.SetNull {
							onDel = "set null"
						} else if rel.OnDelete == ir.Restrict {
							onDel = "restrict"
						}
						fv.OnDelete = onDel
						colDef += fmt.Sprintf(".references(() => %sTable.%s, { onDelete: '%s' })", fromEnt.TableName, fv.RefCol, onDel)
					}
					break
				}
			}
			fv.DrizzleColDef = colDef

			ev.Fields = append(ev.Fields, fv)
		}

		if pv.Database == "postgres" && ev.IsAuthEntity && pv.HasAuth {
			hasPassword := false
			for _, f := range ev.Fields {
				if f.Name == "password" {
					hasPassword = true
					break
				}
			}
			if !hasPassword {
				ev.Fields = append(ev.Fields, FieldView{
					ID:            "fld_auth_password",
					Name:          "password",
					CamelName:     "password",
					SnakeName:     "password",
					Type:          ir.FieldString,
					TsType:        "string",
					MongooseType:  "String",
					ZodType:       "z.string().min(6)",
					DrizzleColDef: "text('password')",
					Required:      false,
				})
			}
		}

		if rels, ok := relationsMap[ent.ID]; ok {
			ev.Relations = rels
		}

		pv.Entities = append(pv.Entities, ev)
	}

	// ───── Collect Project Enums ─────
	var enums []EnumView
	seenEnums := make(map[string]bool)
	for _, ent := range doc.Entities {
		tableName := ent.TableName
		if tableName == "" {
			tableName = strings.ToLower(ent.Name) + "s"
		}
		for _, fld := range ent.Fields {
			if fld.Type == ir.FieldEnum && len(fld.EnumValues) > 0 {
				sqlName := fmt.Sprintf("%s_%s", tableName, fld.Name)
				if !seenEnums[sqlName] {
					seenEnums[sqlName] = true
					var quoted []string
					for _, v := range fld.EnumValues {
						quoted = append(quoted, fmt.Sprintf("'%s'", v))
					}
					enums = append(enums, EnumView{
						Name:       sqlName,
						SqlName:    sqlName,
						Values:     fld.EnumValues,
						QuotedVals: strings.Join(quoted, ", "),
					})
				}
			}
		}
	}
	sort.Slice(enums, func(i, j int) bool { return enums[i].SqlName < enums[j].SqlName })
	pv.Enums = enums

	// ───── Collect Many-to-Many Relations ─────
	var mnJoins []JoinTableView
	for _, rel := range doc.Relations {
		if rel.Kind == ir.ManyToMany {
			fromEnt := doc.EntityByID(rel.FromEntityID)
			toEnt := doc.EntityByID(rel.ToEntityID)
			if fromEnt == nil || toEnt == nil {
				continue
			}
			fromPK := fromEnt.PrimaryKeyField()
			toPK := toEnt.PrimaryKeyField()
			if fromPK == nil || toPK == nil {
				continue
			}
			tables := []string{fromEnt.TableName, toEnt.TableName}
			sort.Strings(tables)
			joinTable := fmt.Sprintf("%s_%s", tables[0], tables[1])
			fromCol := fmt.Sprintf("%s_id", ir.ToLowerSnake(fromEnt.Name))
			toCol := fmt.Sprintf("%s_id", ir.ToLowerSnake(toEnt.Name))
			if fromCol == toCol {
				fromCol = fromCol + "_a"
				toCol = toCol + "_b"
			}
			fromType := "uuid"
			if fromPK.Type == ir.FieldInt {
				fromType = "integer"
			} else if fromPK.Type == ir.FieldString {
				fromType = "text"
			}
			toType := "uuid"
			if toPK.Type == ir.FieldInt {
				toType = "integer"
			} else if toPK.Type == ir.FieldString {
				toType = "text"
			}
			mnJoins = append(mnJoins, JoinTableView{
				TableName: joinTable,
				FromCol:   fromCol,
				ToCol:     toCol,
				FromTable: fromEnt.TableName,
				ToTable:   toEnt.TableName,
				FromPK:    fromPK.Name,
				ToPK:      toPK.Name,
				FromType:  fromType,
				ToType:    toType,
			})
		}
	}
	pv.ManyToManyRelations = mnJoins

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
