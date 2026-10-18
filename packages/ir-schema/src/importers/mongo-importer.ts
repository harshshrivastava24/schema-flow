import { parse } from "@babel/parser";
import {
  IDENTIFIER_REGEX,
  MAX_ENTITIES,
  MAX_FIELDS_PER_ENTITY,
  MAX_SCHEMA_SIZE_BYTES,
} from "../security.js";
import type {
  AuthConfig,
  EndpointConfig,
  Entity,
  Field,
  FieldType,
  IRDocument,
  ProjectConfig,
  Relation,
  RelationKind,
} from "../types.js";
import type { ImporterDiagnostic, ImporterOptions, ImportResult } from "./types.js";

// ============================================================================
// Mode A: MongoDB JSON Sample Importer
// ============================================================================

export function parseMongoJson(
  jsonText: string,
  options?: ImporterOptions
): ImportResult {
  const startTime = Date.now();
  const diagnostics: ImporterDiagnostic[] = [];

  if (jsonText.length > MAX_SCHEMA_SIZE_BYTES) {
    diagnostics.push({
      severity: "error",
      code: "SCHEMA_SIZE_LIMIT_EXCEEDED",
      message: `JSON input size (${jsonText.length} bytes) exceeds limit of ${MAX_SCHEMA_SIZE_BYTES} bytes (1 MB).`,
    });
    return {
      success: false,
      ir: createEmptyMongoIR(options?.projectName ?? "MongoImport"),
      diagnostics,
      stats: { entityCount: 0, relationCount: 0, fieldCount: 0, parseTimeMs: Date.now() - startTime },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    diagnostics.push({
      severity: "error",
      code: "MONGO_JSON_PARSE_ERROR",
      message: `Invalid JSON format: ${err instanceof Error ? err.message : String(err)}`,
    });
    return {
      success: false,
      ir: createEmptyMongoIR(options?.projectName ?? "MongoImport"),
      diagnostics,
      stats: { entityCount: 0, relationCount: 0, fieldCount: 0, parseTimeMs: Date.now() - startTime },
    };
  }

  // Determine structure: Multi-collection dict vs single array vs single object
  const collectionsMap = new Map<string, Array<Record<string, unknown>>>();

  if (Array.isArray(parsed)) {
    const colName = options?.collectionName ?? "Document";
    const docs = parsed.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
    collectionsMap.set(colName, docs);
  } else if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    const keys = Object.keys(obj);
    const looksLikeMultiCollection =
      keys.length > 0 &&
      keys.every((k) => Array.isArray(obj[k]) && (obj[k] as unknown[]).every((i) => typeof i === "object" && i !== null));

    if (looksLikeMultiCollection) {
      for (const k of keys) {
        collectionsMap.set(k, (obj[k] as Array<Record<string, unknown>>) ?? []);
      }
    } else {
      const colName = options?.collectionName ?? "Document";
      collectionsMap.set(colName, [obj]);
    }
  }

  const entities: Entity[] = [];
  const entityIdByName = new Map<string, string>();

  // Assign entity IDs
  for (const [rawColName] of collectionsMap.entries()) {
    const safeName = capitalize(singularize(sanitizeIdentifier(rawColName)));
    const entityId = `ent_${safeName.toLowerCase()}`;
    entityIdByName.set(safeName, entityId);
  }

  // Process collections into entities
  for (const [rawColName, docs] of collectionsMap.entries()) {
    const entityName = capitalize(singularize(sanitizeIdentifier(rawColName)));
    const entityId = entityIdByName.get(entityName)!;

    if (!IDENTIFIER_REGEX.test(entityName)) {
      diagnostics.push({
        severity: "error",
        code: "INVALID_IDENTIFIER",
        message: `Inferred collection entity name '${entityName}' is invalid.`,
        entity: entityName,
      });
    }

    const fieldMap = new Map<
      string,
      {
        types: Set<string>;
        hasNull: boolean;
        sampleValue: unknown;
        occurrences: number;
      }
    >();

    const docCount = docs.length;

    for (const doc of docs) {
      for (const [key, val] of Object.entries(doc)) {
        if (!fieldMap.has(key)) {
          fieldMap.set(key, { types: new Set(), hasNull: false, sampleValue: val, occurrences: 0 });
        }
        const info = fieldMap.get(key)!;
        info.occurrences++;

        if (val === null || val === undefined) {
          info.hasNull = true;
        } else {
          info.types.add(inferPrimitiveType(val));
        }
      }
    }

    const fields: Field[] = [];
    let hasPk = false;

    // Check if _id is present
    const hasRawId = fieldMap.has("_id");
    const hasCleanId = fieldMap.has("id");

    for (const [rawFieldName, info] of fieldMap.entries()) {
      if (rawFieldName === "_id") {
        hasPk = true;
        fields.unshift({
          id: "fld_id",
          name: "id",
          type: "string",
          required: true,
          isPrimaryKey: true,
          default: "uuid()",
        });
        continue;
      }

      if (rawFieldName === "id" && !hasRawId) {
        hasPk = true;
        fields.unshift({
          id: "fld_id",
          name: "id",
          type: "string",
          required: true,
          isPrimaryKey: true,
          default: "uuid()",
        });
        continue;
      }

      const safeFieldName = sanitizeIdentifier(rawFieldName);
      if (!IDENTIFIER_REGEX.test(safeFieldName)) {
        diagnostics.push({
          severity: "error",
          code: "INVALID_IDENTIFIER",
          message: `Inferred field name '${rawFieldName}' in collection '${entityName}' is invalid.`,
          entity: entityName,
          field: rawFieldName,
        });
      }

      // Infer single resolved type
      const { fieldType, warning } = resolveInferredType(info.types, info.sampleValue);
      if (warning) {
        diagnostics.push({
          severity: "warning",
          code: "MONGO_AMBIGUOUS_TYPE",
          message: `Field '${safeFieldName}' in '${entityName}': ${warning}. Candidate type '${fieldType}' inferred for review.`,
          entity: entityName,
          field: safeFieldName,
          suggestion: "Confirm or update the inferred field type in the inspector.",
        });
      }

      // Check ObjectId candidate reference
      if (
        typeof info.sampleValue === "string" &&
        /^[0-9a-fA-F]{24}$/.test(info.sampleValue)
      ) {
        diagnostics.push({
          severity: "info",
          code: "MONGO_OBJECTID_CANDIDATE",
          message: `Field '${safeFieldName}' in '${entityName}' contains 24-hex characters typical of an ObjectId reference.`,
          entity: entityName,
          field: safeFieldName,
        });
      }

      const isRequired = !info.hasNull && info.occurrences === docCount;

      fields.push({
        id: `fld_${safeFieldName.toLowerCase()}`,
        name: safeFieldName,
        type: fieldType,
        required: isRequired,
      });
    }

    if (!hasPk) {
      fields.unshift({
        id: "fld_id",
        name: "id",
        type: "string",
        required: true,
        isPrimaryKey: true,
        default: "uuid()",
      });
      diagnostics.push({
        severity: "info",
        code: "MONGO_SYNTHESIZED_PK",
        message: `Collection '${entityName}' did not supply an _id field; added standard UUID 'id' primary key.`,
        entity: entityName,
      });
    }

    if (fields.length > MAX_FIELDS_PER_ENTITY) {
      diagnostics.push({
        severity: "error",
        code: "FIELD_LIMIT_EXCEEDED",
        message: `Entity '${entityName}' has ${fields.length} fields, exceeding limit of ${MAX_FIELDS_PER_ENTITY}.`,
        entity: entityName,
      });
    }

    entities.push({
      id: entityId,
      name: entityName,
      tableName: rawColName.toLowerCase(),
      fields,
    });
  }

  if (entities.length > MAX_ENTITIES) {
    diagnostics.push({
      severity: "error",
      code: "ENTITY_LIMIT_EXCEEDED",
      message: `Inferred ${entities.length} entities, exceeding limit of ${MAX_ENTITIES}.`,
    });
  }

  // Infer potential relations across collections
  const relations: Relation[] = [];
  const entityNames = entities.map((e) => e.name);

  for (const entity of entities) {
    for (const field of entity.fields) {
      // Look for fields ending in Id (e.g., userId, authorId)
      if (field.name.endsWith("Id") && field.name.length > 2) {
        const targetPrefix = field.name.slice(0, -2);
        const matchedEntity = entities.find(
          (e) =>
            e.name.toLowerCase() === targetPrefix.toLowerCase() ||
            e.name.toLowerCase() === singularize(targetPrefix).toLowerCase()
        );

        if (matchedEntity && matchedEntity.id !== entity.id) {
          const relId = `rel_${matchedEntity.id.replace("ent_", "")}_${entity.id.replace("ent_", "")}_1n`;
          if (!relations.some((r) => r.id === relId)) {
            relations.push({
              id: relId,
              fromEntityId: matchedEntity.id,
              toEntityId: entity.id,
              kind: "one-to-many",
              foreignKeyField: field.name,
              onDelete: "CASCADE",
            });
            diagnostics.push({
              severity: "info",
              code: "MONGO_INFERRED_RELATION",
              message: `Inferred candidate 1:N relation from '${matchedEntity.name}' to '${entity.name}' via field '${field.name}'.`,
              entity: entity.name,
              field: field.name,
              suggestion: "Review and confirm this relation in the canvas.",
            });
          }
        }
      }
    }
  }

  const endpoints: EndpointConfig[] = entities.map((e) => ({
    entityId: e.id,
    ops: ["list", "get", "create", "update", "delete"],
    authRequired: false,
  }));

  const hasUserEntity = entities.some(
    (e) => e.name.toLowerCase() === "user" || e.name.toLowerCase() === "account"
  );

  const ir: IRDocument = {
    irVersion: "1.0",
    project: {
      name: sanitizeIdentifier(options?.projectName ?? "MongoImport"),
      database: "mongodb",
    },
    entities,
    relations,
    endpoints,
    auth: {
      enabled: hasUserEntity,
      strategy: "jwt",
      roles: ["user", "admin"],
    },
  };

  const hasErrors = diagnostics.some((d) => d.severity === "error");

  return {
    success: !hasErrors,
    ir,
    diagnostics,
    stats: {
      entityCount: entities.length,
      relationCount: relations.length,
      fieldCount: entities.reduce((acc, e) => acc + e.fields.length, 0),
      parseTimeMs: Date.now() - startTime,
    },
  };
}

// ============================================================================
// Mode B: Mongoose AST Parser (ZERO eval, pure Babel parser AST traversal)
// ============================================================================

export function parseMongooseAst(
  sourceCode: string,
  options?: ImporterOptions
): ImportResult {
  const startTime = Date.now();
  const diagnostics: ImporterDiagnostic[] = [];

  if (sourceCode.length > MAX_SCHEMA_SIZE_BYTES) {
    diagnostics.push({
      severity: "error",
      code: "SCHEMA_SIZE_LIMIT_EXCEEDED",
      message: `Source code size (${sourceCode.length} bytes) exceeds limit of ${MAX_SCHEMA_SIZE_BYTES} bytes (1 MB).`,
    });
    return {
      success: false,
      ir: createEmptyMongoIR(options?.projectName ?? "MongooseImport"),
      diagnostics,
      stats: { entityCount: 0, relationCount: 0, fieldCount: 0, parseTimeMs: Date.now() - startTime },
    };
  }

  // Parse JS/TS AST safely without ANY evaluation
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(sourceCode, {
      sourceType: "module",
      plugins: ["typescript"],
      errorRecovery: true,
    });
  } catch (err) {
    diagnostics.push({
      severity: "error",
      code: "MONGOOSE_SYNTAX_ERROR",
      message: `Could not parse Mongoose source code: ${err instanceof Error ? err.message : String(err)}`,
    });
    return {
      success: false,
      ir: createEmptyMongoIR(options?.projectName ?? "MongooseImport"),
      diagnostics,
      stats: { entityCount: 0, relationCount: 0, fieldCount: 0, parseTimeMs: Date.now() - startTime },
    };
  }

  // Data structure to hold discovered schemas
  interface DiscoveredSchema {
    varName: string;
    modelName?: string;
    schemaNode: Record<string, unknown>; // Babel AST ObjectExpression
    line: number;
  }

  const discoveredSchemas: DiscoveredSchema[] = [];
  const modelNameToVarName = new Map<string, string>();
  const varNameToModelName = new Map<string, string>();

  // Step 1: Scan top-level AST body for Schema instantiation & Model registrations
  for (const stmt of ast.program.body) {
    // Check variable declarations: const UserSchema = new Schema({ ... })
    if (stmt.type === "VariableDeclaration") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const decl of (stmt as any).declarations) {
        if (decl.id?.type === "Identifier" && decl.init) {
          const varName = decl.id.name;
          const init = decl.init;

          // Check if init is new Schema({...}) or new mongoose.Schema({...})
          const schemaObjNode = extractSchemaObjectExpression(init);
          if (schemaObjNode) {
            discoveredSchemas.push({
              varName,
              schemaNode: schemaObjNode,
              line: stmt.loc?.start?.line ?? 1,
            });
          }

          // Check if init is mongoose.model('User', UserSchema)
          const modelCall = extractModelCall(init);
          if (modelCall) {
            modelNameToVarName.set(modelCall.modelName, modelCall.schemaVar);
            varNameToModelName.set(modelCall.schemaVar, modelCall.modelName);
          }
        }
      }
    }

    // Check expression statements: mongoose.model('User', UserSchema)
    if (stmt.type === "ExpressionStatement") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expr = (stmt as any).expression;
      const modelCall = extractModelCall(expr);
      if (modelCall) {
        modelNameToVarName.set(modelCall.modelName, modelCall.schemaVar);
        varNameToModelName.set(modelCall.schemaVar, modelCall.modelName);

        // Or direct inline: mongoose.model('User', new Schema({ ... }))
        if (modelCall.inlineSchemaNode) {
          discoveredSchemas.push({
            varName: `${modelCall.modelName}Schema`,
            modelName: modelCall.modelName,
            schemaNode: modelCall.inlineSchemaNode,
            line: stmt.loc?.start?.line ?? 1,
          });
        }
      }
    }
  }

  if (discoveredSchemas.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "MONGOOSE_NO_SCHEMA_FOUND",
      message: "No Mongoose Schema definitions (new Schema({...}) or mongoose.Schema({...})) found in input.",
    });
    return {
      success: false,
      ir: createEmptyMongoIR(options?.projectName ?? "MongooseImport"),
      diagnostics,
      stats: { entityCount: 0, relationCount: 0, fieldCount: 0, parseTimeMs: Date.now() - startTime },
    };
  }

  const entities: Entity[] = [];
  const entityIdByName = new Map<string, string>();

  // Link model names to schemas
  for (const s of discoveredSchemas) {
    const modelName =
      s.modelName ||
      varNameToModelName.get(s.varName) ||
      cleanSchemaVarName(s.varName);

    const safeModelName = sanitizeIdentifier(capitalize(modelName));
    const entityId = `ent_${safeModelName.toLowerCase()}`;
    entityIdByName.set(safeModelName, entityId);
  }

  // Relations collected during field processing
  interface MongooseRelationCandidate {
    fromEntityName: string;
    toEntityName: string;
    fieldName: string;
    line: number;
  }
  const relationCandidates: MongooseRelationCandidate[] = [];

  // Step 2: Process each schema's AST ObjectExpression
  for (const s of discoveredSchemas) {
    const rawModelName =
      s.modelName ||
      varNameToModelName.get(s.varName) ||
      cleanSchemaVarName(s.varName);

    const modelName = sanitizeIdentifier(capitalize(rawModelName));
    const entityId = entityIdByName.get(modelName)!;

    if (!IDENTIFIER_REGEX.test(modelName)) {
      diagnostics.push({
        severity: "error",
        code: "INVALID_IDENTIFIER",
        message: `Mongoose model name '${modelName}' is not a valid identifier.`,
        line: s.line,
        entity: modelName,
      });
    }

    const fields: Field[] = [];
    let hasPk = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = (s.schemaNode as any).properties || [];

    for (const prop of properties) {
      // Must be an ObjectProperty or Property
      if (prop.type !== "ObjectProperty" && prop.type !== "Property") {
        continue;
      }

      const fieldName = prop.key?.name || prop.key?.value;
      if (!fieldName || typeof fieldName !== "string") {
        continue;
      }

      const line = prop.loc?.start?.line ?? s.line;

      // Handle _id or id
      if (fieldName === "_id" || fieldName === "id") {
        hasPk = true;
        fields.unshift({
          id: "fld_id",
          name: "id",
          type: "string",
          required: true,
          isPrimaryKey: true,
          default: "uuid()",
        });
        continue;
      }

      const safeFieldName = sanitizeIdentifier(fieldName);
      if (!IDENTIFIER_REGEX.test(safeFieldName)) {
        diagnostics.push({
          severity: "error",
          code: "INVALID_IDENTIFIER",
          message: `Field '${fieldName}' in model '${modelName}' is invalid identifier.`,
          line,
          entity: modelName,
          field: fieldName,
        });
      }

      // Parse field AST definition
      const parsedField = parseMongooseFieldAst(prop.value, line, modelName, safeFieldName);

      if (parsedField.diagnostic) {
        diagnostics.push(parsedField.diagnostic);
      }

      if (parsedField.refModel) {
        relationCandidates.push({
          fromEntityName: parsedField.refModel,
          toEntityName: modelName,
          fieldName: safeFieldName,
          line,
        });
      }

      const fieldObj: Field = {
        id: `fld_${safeFieldName.toLowerCase()}`,
        name: safeFieldName,
        type: parsedField.type,
        required: parsedField.required ?? false,
      };

      if (parsedField.unique) fieldObj.unique = true;
      if (parsedField.default !== undefined) fieldObj.default = parsedField.default;
      if (parsedField.enumValues && parsedField.enumValues.length > 0) {
        fieldObj.enumValues = parsedField.enumValues;
      }

      fields.push(fieldObj);
    }

    // Ensure _id exists for Mongoose
    if (!hasPk) {
      fields.unshift({
        id: "fld_id",
        name: "id",
        type: "string",
        required: true,
        isPrimaryKey: true,
        default: "uuid()",
      });
    }

    if (fields.length > MAX_FIELDS_PER_ENTITY) {
      diagnostics.push({
        severity: "error",
        code: "FIELD_LIMIT_EXCEEDED",
        message: `Model '${modelName}' has ${fields.length} fields, exceeding limit of ${MAX_FIELDS_PER_ENTITY}.`,
        line: s.line,
        entity: modelName,
      });
    }

    entities.push({
      id: entityId,
      name: modelName,
      tableName: modelName.toLowerCase(),
      fields,
    });
  }

  // Step 3: Resolve Relations from `ref: '...'`
  const relations: Relation[] = [];

  for (const cand of relationCandidates) {
    const parentSafeName = sanitizeIdentifier(capitalize(cand.fromEntityName));
    const parentEntityId = entityIdByName.get(parentSafeName);
    const childEntityId = entityIdByName.get(cand.toEntityName);

    if (parentEntityId && childEntityId) {
      const relId = `rel_${parentEntityId.replace("ent_", "")}_${childEntityId.replace("ent_", "")}_1n`;
      if (!relations.some((r) => r.id === relId)) {
        relations.push({
          id: relId,
          fromEntityId: parentEntityId,
          toEntityId: childEntityId,
          kind: "one-to-many",
          foreignKeyField: cand.fieldName,
          onDelete: "CASCADE",
        });
      }
    } else {
      diagnostics.push({
        severity: "warning",
        code: "MONGOOSE_UNRESOLVED_REF",
        message: `Field '${cand.fieldName}' references model '${cand.fromEntityName}', but that model was not found in the parsed schema.`,
        line: cand.line,
        entity: cand.toEntityName,
        field: cand.fieldName,
      });
    }
  }

  const endpoints: EndpointConfig[] = entities.map((e) => ({
    entityId: e.id,
    ops: ["list", "get", "create", "update", "delete"],
    authRequired: false,
  }));

  const hasUserEntity = entities.some(
    (e) => e.name.toLowerCase() === "user" || e.name.toLowerCase() === "account"
  );

  const ir: IRDocument = {
    irVersion: "1.0",
    project: {
      name: sanitizeIdentifier(options?.projectName ?? "MongooseImport"),
      database: "mongodb",
    },
    entities,
    relations,
    endpoints,
    auth: {
      enabled: hasUserEntity,
      strategy: "jwt",
      roles: ["user", "admin"],
    },
  };

  const hasErrors = diagnostics.some((d) => d.severity === "error");

  return {
    success: !hasErrors,
    ir,
    diagnostics,
    stats: {
      entityCount: entities.length,
      relationCount: relations.length,
      fieldCount: entities.reduce((acc, e) => acc + e.fields.length, 0),
      parseTimeMs: Date.now() - startTime,
    },
  };
}

// Unified MongoDB Importer (Auto-detects JSON vs Mongoose AST)
export function parseMongoSchema(
  input: string,
  options?: ImporterOptions
): ImportResult {
  const trimmed = input.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseMongoJson(input, options);
  }
  return parseMongooseAst(input, options);
}

// ============================================================================
// Internal Helpers for AST Traversal
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSchemaObjectExpression(node: any): any | null {
  if (!node) return null;

  // new Schema({ ... })
  if (node.type === "NewExpression" || node.type === "CallExpression") {
    const callee = node.callee;
    const isSchema =
      (callee?.type === "Identifier" && callee.name === "Schema") ||
      (callee?.type === "MemberExpression" &&
        callee.property?.type === "Identifier" &&
        callee.property.name === "Schema");

    if (isSchema && node.arguments && node.arguments.length > 0) {
      const arg0 = node.arguments[0];
      if (arg0?.type === "ObjectExpression") {
        return arg0;
      }
    }
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractModelCall(node: any): { modelName: string; schemaVar: string; inlineSchemaNode?: any } | null {
  if (!node || node.type !== "CallExpression") return null;

  const callee = node.callee;
  const isModel =
    (callee?.type === "Identifier" && callee.name === "model") ||
    (callee?.type === "MemberExpression" &&
      callee.property?.type === "Identifier" &&
      callee.property.name === "model");

  if (isModel && node.arguments && node.arguments.length >= 2) {
    const arg0 = node.arguments[0];
    const arg1 = node.arguments[1];

    let modelName = "";
    if (arg0?.type === "StringLiteral" || (arg0?.type === "Literal" && typeof arg0.value === "string")) {
      modelName = arg0.value;
    }

    if (!modelName) return null;

    if (arg1?.type === "Identifier") {
      return { modelName, schemaVar: arg1.name };
    }

    // Inline new Schema({...})
    const inline = extractSchemaObjectExpression(arg1);
    if (inline) {
      return { modelName, schemaVar: `${modelName}Schema`, inlineSchemaNode: inline };
    }
  }

  return null;
}

// Helper: Parse Mongoose field definition AST node
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMongooseFieldAst(
  node: any,
  line: number,
  modelName: string,
  fieldName: string
): {
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  default?: string | number | boolean;
  enumValues?: string[];
  refModel?: string;
  diagnostic?: ImporterDiagnostic;
} {
  if (!node) {
    return { type: "string" };
  }

  // Short form: `name: String` or `age: Number` or `createdAt: Date`
  if (node.type === "Identifier") {
    return { type: mapMongooseTypeName(node.name) };
  }

  // Member expression: `type: Schema.Types.ObjectId`
  if (node.type === "MemberExpression") {
    const memberName = getMemberExpressionName(node);
    if (memberName.includes("ObjectId")) {
      return { type: "string" };
    }
    if (memberName.includes("Mixed")) {
      return { type: "json" };
    }
    return { type: "string" };
  }

  // Array form: `tags: [String]`
  if (node.type === "ArrayExpression") {
    return {
      type: "json",
      diagnostic: {
        severity: "info",
        code: "MONGOOSE_ARRAY_MAPPED_JSON",
        message: `Field '${fieldName}' in '${modelName}' is an array type; mapped to IR json field.`,
        line,
        entity: modelName,
        field: fieldName,
      },
    };
  }

  // Full object definition: `{ type: String, required: true, ... }`
  if (node.type === "ObjectExpression") {
    let fieldType: FieldType = "string";
    let required = false;
    let unique = false;
    let defaultValue: string | number | boolean | undefined;
    let enumValues: string[] | undefined;
    let refModel: string | undefined;
    let diagnostic: ImporterDiagnostic | undefined;

    for (const prop of node.properties) {
      if (prop.type !== "ObjectProperty" && prop.type !== "Property") continue;
      const keyName = prop.key?.name || prop.key?.value;
      const val = prop.value;

      if (keyName === "type") {
        if (val.type === "Identifier") {
          fieldType = mapMongooseTypeName(val.name);
        } else if (val.type === "MemberExpression") {
          const mem = getMemberExpressionName(val);
          if (mem.includes("ObjectId")) {
            fieldType = "string";
          } else if (mem.includes("Mixed")) {
            fieldType = "json";
          }
        } else if (val.type === "StringLiteral" || (val.type === "Literal" && typeof val.value === "string")) {
          if (val.value.toLowerCase() === "objectid") {
            fieldType = "string";
          } else {
            fieldType = mapMongooseTypeName(val.value);
          }
        } else if (val.type === "ArrayExpression") {
          fieldType = "json";
        }
      } else if (keyName === "required") {
        if (val.type === "BooleanLiteral" || (val.type === "Literal" && typeof val.value === "boolean")) {
          required = Boolean(val.value);
        }
      } else if (keyName === "unique") {
        if (val.type === "BooleanLiteral" || (val.type === "Literal" && typeof val.value === "boolean")) {
          unique = Boolean(val.value);
        }
      } else if (keyName === "ref") {
        if (val.type === "StringLiteral" || (val.type === "Literal" && typeof val.value === "string")) {
          refModel = val.value;
          fieldType = "string";
        }
      } else if (keyName === "enum") {
        if (val.type === "ArrayExpression") {
          const items: string[] = [];
          for (const el of val.elements) {
            if (el?.type === "StringLiteral" || (el?.type === "Literal" && typeof el.value === "string")) {
              items.push(el.value);
            }
          }
          if (items.length > 0) {
            enumValues = items;
            fieldType = "enum";
          }
        }
      } else if (keyName === "default") {
        if (val.type === "StringLiteral" || (val.type === "Literal" && typeof val.value === "string")) {
          defaultValue = val.value;
        } else if (val.type === "NumericLiteral" || (val.type === "Literal" && typeof val.value === "number")) {
          defaultValue = val.value;
        } else if (val.type === "BooleanLiteral" || (val.type === "Literal" && typeof val.value === "boolean")) {
          defaultValue = val.value;
        } else if (val.type === "MemberExpression" && getMemberExpressionName(val) === "Date.now") {
          defaultValue = "now()";
        }
      }
    }

    return {
      type: fieldType,
      required,
      unique,
      default: defaultValue,
      enumValues,
      refModel,
      diagnostic,
    };
  }

  return { type: "string" };
}

// Map Mongoose type identifier to FieldType
function mapMongooseTypeName(name: string): FieldType {
  switch (name) {
    case "String":
      return "string";
    case "Number":
      return "int";
    case "Boolean":
      return "bool";
    case "Date":
      return "timestamp";
    case "Mixed":
    case "Object":
      return "json";
    case "Buffer":
      return "string";
    default:
      return "string";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMemberExpressionName(node: any): string {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") {
    const obj = getMemberExpressionName(node.object);
    const prop = node.property?.name || "";
    return obj ? `${obj}.${prop}` : prop;
  }
  return "";
}

function cleanSchemaVarName(varName: string): string {
  return varName.replace(/schema$/i, "") || varName;
}

function inferPrimitiveType(val: unknown): string {
  if (typeof val === "boolean") return "bool";
  if (typeof val === "number") {
    return Number.isInteger(val) ? "int" : "decimal";
  }
  if (typeof val === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) return "timestamp";
    if (/^[0-9a-fA-F-]{36}$/.test(val)) return "uuid";
    return "string";
  }
  if (Array.isArray(val)) return "json";
  if (typeof val === "object" && val !== null) {
    // Mongo extended JSON
    if ("$oid" in val) return "string";
    if ("$date" in val) return "timestamp";
    return "json";
  }
  return "string";
}

function resolveInferredType(
  types: Set<string>,
  sampleValue: unknown
): { fieldType: FieldType; warning?: string } {
  if (types.size === 0) {
    return { fieldType: "string" };
  }
  if (types.size === 1) {
    const single = Array.from(types)[0]! as FieldType;
    return { fieldType: single };
  }
  if (types.has("decimal") && types.has("int") && types.size === 2) {
    return { fieldType: "decimal" };
  }
  // Mixed types: flag as ambiguous
  const typesStr = Array.from(types).join(", ");
  return {
    fieldType: "json",
    warning: `Multiple conflicting types observed in sample [${typesStr}]`,
  };
}

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function singularize(s: string): string {
  if (s.endsWith("ies") && s.length > 3) {
    return s.slice(0, -3) + "y";
  }
  if (s.endsWith("es") && s.length > 2 && (s.endsWith("shes") || s.endsWith("ches") || s.endsWith("xes"))) {
    return s.slice(0, -2);
  }
  if (s.endsWith("s") && !s.endsWith("ss") && s.length > 1) {
    return s.slice(0, -1);
  }
  return s;
}

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function createEmptyMongoIR(name: string): IRDocument {
  return {
    irVersion: "1.0",
    project: {
      name,
      database: "mongodb",
    },
    entities: [],
    relations: [],
    endpoints: [],
    auth: {
      enabled: false,
      strategy: "jwt",
      roles: ["user", "admin"],
    },
  };
}
