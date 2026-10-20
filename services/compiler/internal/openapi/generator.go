// Package openapi generates OpenAPI 3.1 specifications from an IRDocument.
package openapi

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/harsh/backendgen/services/compiler/internal/ir"
)

// Generate produces a valid OpenAPI 3.1 JSON specification from the given IR.
// Output is deterministic: identical IR always produces identical JSON bytes.
func Generate(doc *ir.IRDocument) (json.RawMessage, error) {
	spec := map[string]interface{}{
		"openapi": "3.1.0",
		"info": map[string]interface{}{
			"title":       doc.Project.Name + " API",
			"version":     "1.0.0",
			"description": fmt.Sprintf("Auto-generated API for %s (%s)", doc.Project.Name, doc.Project.Database),
		},
		"servers": []map[string]interface{}{
			{"url": "http://localhost:3000", "description": "Local development server"},
		},
	}

	// ───── Components: Schemas ─────
	schemas := make(map[string]interface{})
	for _, ent := range doc.Entities {
		schemas[ent.Name] = buildEntitySchema(ent)
		schemas[ent.Name+"Create"] = buildCreateSchema(ent)
		schemas[ent.Name+"Update"] = buildUpdateSchema(ent)
	}

	// Error schema
	schemas["Error"] = map[string]interface{}{
		"type": "object",
		"properties": sortedProps(map[string]interface{}{
			"error":   map[string]interface{}{"type": "string"},
			"message": map[string]interface{}{"type": "string"},
		}),
		"required": []string{"error", "message"},
	}

	components := map[string]interface{}{
		"schemas": sortedMap(schemas),
	}

	// JWT security scheme
	if doc.Auth.Enabled {
		components["securitySchemes"] = map[string]interface{}{
			"BearerAuth": map[string]interface{}{
				"type":         "http",
				"scheme":       "bearer",
				"bearerFormat": "JWT",
				"description":  "JWT Bearer token authentication",
			},
		}
	}

	spec["components"] = components

	// ───── Paths ─────
	paths := make(map[string]interface{})

	// Sort endpoints by entityId for determinism
	endpoints := make([]ir.EndpointConfig, len(doc.Endpoints))
	copy(endpoints, doc.Endpoints)
	sort.Slice(endpoints, func(i, j int) bool {
		return endpoints[i].EntityID < endpoints[j].EntityID
	})

	for _, ep := range endpoints {
		ent := doc.EntityByID(ep.EntityID)
		if ent == nil {
			continue
		}

		basePath := fmt.Sprintf("/api/%s", strings.ToLower(ir.ToPlural(ent.Name)))
		itemPath := fmt.Sprintf("%s/{id}", basePath)

		collectionOps := make(map[string]interface{})
		itemOps := make(map[string]interface{})

		for _, op := range ep.Ops {
			switch op {
			case ir.OpList:
				collectionOps["get"] = buildListOp(ent, ep, doc)
			case ir.OpCreate:
				collectionOps["post"] = buildCreateOp(ent, ep, doc)
			case ir.OpGet:
				itemOps["get"] = buildGetOp(ent, ep, doc)
			case ir.OpUpdate:
				itemOps["put"] = buildUpdateOp(ent, ep, doc)
			case ir.OpDelete:
				itemOps["delete"] = buildDeleteOp(ent, ep, doc)
			}
		}

		if len(collectionOps) > 0 {
			paths[basePath] = sortedMap(collectionOps)
		}
		if len(itemOps) > 0 {
			paths[itemPath] = sortedMap(itemOps)
		}
	}

	// Auth endpoints
	if doc.Auth.Enabled {
		paths["/api/auth/register"] = map[string]interface{}{
			"post": map[string]interface{}{
				"tags":        []string{"Auth"},
				"summary":     "Register a new user",
				"operationId": "authRegister",
				"requestBody": map[string]interface{}{
					"required": true,
					"content": map[string]interface{}{
						"application/json": map[string]interface{}{
							"schema": map[string]interface{}{
								"type": "object",
								"properties": sortedProps(map[string]interface{}{
									"email":    map[string]interface{}{"type": "string", "format": "email"},
									"password": map[string]interface{}{"type": "string", "minLength": 8},
								}),
								"required": []string{"email", "password"},
							},
						},
					},
				},
				"responses": map[string]interface{}{
					"201": map[string]interface{}{
						"description": "User registered successfully",
						"content": map[string]interface{}{
							"application/json": map[string]interface{}{
								"schema": map[string]interface{}{
									"type": "object",
									"properties": sortedProps(map[string]interface{}{
										"token": map[string]interface{}{"type": "string"},
										"user": map[string]interface{}{
											"type": "object",
											"properties": sortedProps(map[string]interface{}{
												"email": map[string]interface{}{"type": "string"},
												"id":    map[string]interface{}{"type": "string", "format": "uuid"},
												"role":  map[string]interface{}{"type": "string"},
											}),
										},
									}),
								},
							},
						},
					},
				},
			},
		}
		paths["/api/auth/login"] = map[string]interface{}{
			"post": map[string]interface{}{
				"tags":        []string{"Auth"},
				"summary":     "Login with credentials",
				"operationId": "authLogin",
				"requestBody": map[string]interface{}{
					"required": true,
					"content": map[string]interface{}{
						"application/json": map[string]interface{}{
							"schema": map[string]interface{}{
								"type": "object",
								"properties": sortedProps(map[string]interface{}{
									"email":    map[string]interface{}{"type": "string", "format": "email"},
									"password": map[string]interface{}{"type": "string"},
								}),
								"required": []string{"email", "password"},
							},
						},
					},
				},
				"responses": map[string]interface{}{
					"200": map[string]interface{}{
						"description": "Login successful",
						"content": map[string]interface{}{
							"application/json": map[string]interface{}{
								"schema": map[string]interface{}{
									"type": "object",
									"properties": sortedProps(map[string]interface{}{
										"token": map[string]interface{}{"type": "string"},
									}),
								},
							},
						},
					},
					"401": map[string]interface{}{
						"description": "Invalid credentials",
					},
				},
			},
		}
	}

	spec["paths"] = sortedMap(paths)

	// Global security requirement
	if doc.Auth.Enabled {
		spec["security"] = []map[string]interface{}{
			{"BearerAuth": []string{}},
		}
	}

	// Deterministic JSON marshalling with sorted keys
	data, err := marshalSorted(spec)
	if err != nil {
		return nil, fmt.Errorf("marshal openapi: %w", err)
	}

	return json.RawMessage(data), nil
}

// ───── Schema builders ─────

func buildEntitySchema(ent ir.Entity) map[string]interface{} {
	props := make(map[string]interface{})
	required := make([]string, 0)

	for _, fld := range ent.Fields {
		props[fld.Name] = fieldToJSONSchema(&fld)
		if fld.IsRequired() {
			required = append(required, fld.Name)
		}
	}

	schema := map[string]interface{}{
		"type":       "object",
		"properties": sortedProps(props),
	}
	if len(required) > 0 {
		sort.Strings(required)
		schema["required"] = required
	}
	return schema
}

func buildCreateSchema(ent ir.Entity) map[string]interface{} {
	props := make(map[string]interface{})
	required := make([]string, 0)

	for _, fld := range ent.Fields {
		// Skip auto-generated PK and auto-default fields from create schema
		if fld.IsPK() && fld.Default != nil {
			continue
		}
		if fld.Name == "createdAt" || fld.Name == "updatedAt" {
			continue
		}
		props[fld.Name] = fieldToJSONSchema(&fld)
		if fld.IsRequired() && fld.Default == nil {
			required = append(required, fld.Name)
		}
	}

	schema := map[string]interface{}{
		"type":       "object",
		"properties": sortedProps(props),
	}
	if len(required) > 0 {
		sort.Strings(required)
		schema["required"] = required
	}
	return schema
}

func buildUpdateSchema(ent ir.Entity) map[string]interface{} {
	props := make(map[string]interface{})

	for _, fld := range ent.Fields {
		if fld.IsPK() {
			continue
		}
		if fld.Name == "createdAt" || fld.Name == "updatedAt" {
			continue
		}
		props[fld.Name] = fieldToJSONSchema(&fld)
	}

	return map[string]interface{}{
		"type":       "object",
		"properties": sortedProps(props),
	}
}

func fieldToJSONSchema(fld *ir.Field) map[string]interface{} {
	schema := make(map[string]interface{})

	switch fld.Type {
	case ir.FieldString:
		schema["type"] = "string"
	case ir.FieldInt:
		schema["type"] = "integer"
	case ir.FieldDecimal:
		schema["type"] = "number"
	case ir.FieldBool:
		schema["type"] = "boolean"
	case ir.FieldTimestamp:
		schema["type"] = "string"
		schema["format"] = "date-time"
	case ir.FieldUUID:
		schema["type"] = "string"
		schema["format"] = "uuid"
	case ir.FieldJSON:
		schema["type"] = "object"
	case ir.FieldEnum:
		schema["type"] = "string"
		if len(fld.EnumValues) > 0 {
			schema["enum"] = fld.EnumValues
		}
	}

	if fld.Default != nil {
		schema["default"] = fld.Default
	}

	return schema
}

// ───── Path operation builders ─────

func buildListOp(ent *ir.Entity, ep ir.EndpointConfig, doc *ir.IRDocument) map[string]interface{} {
	op := map[string]interface{}{
		"tags":        []string{ent.Name},
		"summary":     fmt.Sprintf("List all %s", ir.ToPlural(ent.Name)),
		"operationId": fmt.Sprintf("list%s", ir.ToPlural(ent.Name)),
		"parameters": []map[string]interface{}{
			{"name": "limit", "in": "query", "schema": map[string]interface{}{"type": "integer", "default": 20}},
			{"name": "offset", "in": "query", "schema": map[string]interface{}{"type": "integer", "default": 0}},
		},
		"responses": map[string]interface{}{
			"200": map[string]interface{}{
				"description": fmt.Sprintf("List of %s", strings.ToLower(ir.ToPlural(ent.Name))),
				"content": map[string]interface{}{
					"application/json": map[string]interface{}{
						"schema": map[string]interface{}{
							"type":  "array",
							"items": map[string]interface{}{"$ref": fmt.Sprintf("#/components/schemas/%s", ent.Name)},
						},
					},
				},
			},
		},
	}
	addSecurity(op, ep, doc)
	return op
}

func buildCreateOp(ent *ir.Entity, ep ir.EndpointConfig, doc *ir.IRDocument) map[string]interface{} {
	op := map[string]interface{}{
		"tags":        []string{ent.Name},
		"summary":     fmt.Sprintf("Create a new %s", ent.Name),
		"operationId": fmt.Sprintf("create%s", ent.Name),
		"requestBody": map[string]interface{}{
			"required": true,
			"content": map[string]interface{}{
				"application/json": map[string]interface{}{
					"schema": map[string]interface{}{"$ref": fmt.Sprintf("#/components/schemas/%sCreate", ent.Name)},
				},
			},
		},
		"responses": map[string]interface{}{
			"201": map[string]interface{}{
				"description": fmt.Sprintf("%s created successfully", ent.Name),
				"content": map[string]interface{}{
					"application/json": map[string]interface{}{
						"schema": map[string]interface{}{"$ref": fmt.Sprintf("#/components/schemas/%s", ent.Name)},
					},
				},
			},
			"400": map[string]interface{}{
				"description": "Validation error",
				"content": map[string]interface{}{
					"application/json": map[string]interface{}{
						"schema": map[string]interface{}{"$ref": "#/components/schemas/Error"},
					},
				},
			},
		},
	}
	addSecurity(op, ep, doc)
	return op
}

func buildGetOp(ent *ir.Entity, ep ir.EndpointConfig, doc *ir.IRDocument) map[string]interface{} {
	op := map[string]interface{}{
		"tags":        []string{ent.Name},
		"summary":     fmt.Sprintf("Get a %s by ID", ent.Name),
		"operationId": fmt.Sprintf("get%s", ent.Name),
		"parameters": []map[string]interface{}{
			{"name": "id", "in": "path", "required": true, "schema": map[string]interface{}{"type": "string", "format": "uuid"}},
		},
		"responses": map[string]interface{}{
			"200": map[string]interface{}{
				"description": fmt.Sprintf("A single %s", ent.Name),
				"content": map[string]interface{}{
					"application/json": map[string]interface{}{
						"schema": map[string]interface{}{"$ref": fmt.Sprintf("#/components/schemas/%s", ent.Name)},
					},
				},
			},
			"404": map[string]interface{}{
				"description": fmt.Sprintf("%s not found", ent.Name),
			},
		},
	}
	addSecurity(op, ep, doc)
	return op
}

func buildUpdateOp(ent *ir.Entity, ep ir.EndpointConfig, doc *ir.IRDocument) map[string]interface{} {
	op := map[string]interface{}{
		"tags":        []string{ent.Name},
		"summary":     fmt.Sprintf("Update a %s", ent.Name),
		"operationId": fmt.Sprintf("update%s", ent.Name),
		"parameters": []map[string]interface{}{
			{"name": "id", "in": "path", "required": true, "schema": map[string]interface{}{"type": "string", "format": "uuid"}},
		},
		"requestBody": map[string]interface{}{
			"required": true,
			"content": map[string]interface{}{
				"application/json": map[string]interface{}{
					"schema": map[string]interface{}{"$ref": fmt.Sprintf("#/components/schemas/%sUpdate", ent.Name)},
				},
			},
		},
		"responses": map[string]interface{}{
			"200": map[string]interface{}{
				"description": fmt.Sprintf("%s updated successfully", ent.Name),
				"content": map[string]interface{}{
					"application/json": map[string]interface{}{
						"schema": map[string]interface{}{"$ref": fmt.Sprintf("#/components/schemas/%s", ent.Name)},
					},
				},
			},
			"404": map[string]interface{}{
				"description": fmt.Sprintf("%s not found", ent.Name),
			},
		},
	}
	addSecurity(op, ep, doc)
	return op
}

func buildDeleteOp(ent *ir.Entity, ep ir.EndpointConfig, doc *ir.IRDocument) map[string]interface{} {
	op := map[string]interface{}{
		"tags":        []string{ent.Name},
		"summary":     fmt.Sprintf("Delete a %s", ent.Name),
		"operationId": fmt.Sprintf("delete%s", ent.Name),
		"parameters": []map[string]interface{}{
			{"name": "id", "in": "path", "required": true, "schema": map[string]interface{}{"type": "string", "format": "uuid"}},
		},
		"responses": map[string]interface{}{
			"204": map[string]interface{}{
				"description": fmt.Sprintf("%s deleted successfully", ent.Name),
			},
			"404": map[string]interface{}{
				"description": fmt.Sprintf("%s not found", ent.Name),
			},
		},
	}
	addSecurity(op, ep, doc)
	return op
}

func addSecurity(op map[string]interface{}, ep ir.EndpointConfig, doc *ir.IRDocument) {
	if ep.AuthRequired && doc.Auth.Enabled {
		op["security"] = []map[string]interface{}{
			{"BearerAuth": []string{}},
		}
	}
}

// ───── Deterministic JSON helpers ─────

// sortedProps wraps a properties map to ensure deterministic JSON key order.
func sortedProps(m map[string]interface{}) *orderedMap {
	return newOrderedMap(m)
}

// sortedMap wraps any map for deterministic JSON key order.
func sortedMap(m map[string]interface{}) *orderedMap {
	return newOrderedMap(m)
}

type orderedMap struct {
	keys   []string
	values map[string]interface{}
}

func newOrderedMap(m map[string]interface{}) *orderedMap {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return &orderedMap{keys: keys, values: m}
}

func (om *orderedMap) MarshalJSON() ([]byte, error) {
	var sb strings.Builder
	sb.WriteByte('{')
	for i, k := range om.keys {
		if i > 0 {
			sb.WriteByte(',')
		}
		keyBytes, err := json.Marshal(k)
		if err != nil {
			return nil, err
		}
		sb.Write(keyBytes)
		sb.WriteByte(':')
		valBytes, err := marshalSorted(om.values[k])
		if err != nil {
			return nil, err
		}
		sb.Write(valBytes)
	}
	sb.WriteByte('}')
	return []byte(sb.String()), nil
}

// marshalSorted recursively marshals a value with all map keys sorted.
func marshalSorted(v interface{}) ([]byte, error) {
	switch val := v.(type) {
	case *orderedMap:
		return val.MarshalJSON()
	case map[string]interface{}:
		om := newOrderedMap(val)
		return om.MarshalJSON()
	case []interface{}:
		var sb strings.Builder
		sb.WriteByte('[')
		for i, item := range val {
			if i > 0 {
				sb.WriteByte(',')
			}
			b, err := marshalSorted(item)
			if err != nil {
				return nil, err
			}
			sb.Write(b)
		}
		sb.WriteByte(']')
		return []byte(sb.String()), nil
	default:
		return json.Marshal(v)
	}
}
