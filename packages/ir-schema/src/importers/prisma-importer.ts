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
  OnDeleteAction,
  ProjectConfig,
  Relation,
  RelationKind,
} from "../types.js";
import type { ImporterDiagnostic, ImporterOptions, ImportResult } from "./types.js";

interface RawPrismaField {
  name: string;
  rawType: string;
  isOptional: boolean;
  isList: boolean;
  attributes: Map<string, string>;
  line: number;
}

interface RawPrismaModel {
  name: string;
  tableName: string;
  fields: RawPrismaField[];
  blockAttributes: Map<string, string>;
  line: number;
}

interface RawPrismaEnum {
  name: string;
  values: string[];
  line: number;
}

export function parsePrismaSchema(
  schemaText: string,
  options?: ImporterOptions
): ImportResult {
  const startTime = Date.now();
  const diagnostics: ImporterDiagnostic[] = [];

  if (schemaText.length > MAX_SCHEMA_SIZE_BYTES) {
    diagnostics.push({
      severity: "error",
      code: "SCHEMA_SIZE_LIMIT_EXCEEDED",
      message: `Schema input size (${schemaText.length} bytes) exceeds maximum limit of ${MAX_SCHEMA_SIZE_BYTES} bytes (1 MB).`,
    });
    return {
      success: false,
      ir: createEmptyIR(options?.projectName ?? "PrismaImport"),
      diagnostics,
      stats: {
        entityCount: 0,
        relationCount: 0,
        fieldCount: 0,
        parseTimeMs: Date.now() - startTime,
      },
    };
  }

  const { models, enums, parseDiagnostics } = tokenizeAndExtractBlocks(schemaText);
  diagnostics.push(...parseDiagnostics);

  if (models.length > MAX_ENTITIES) {
    diagnostics.push({
      severity: "error",
      code: "ENTITY_LIMIT_EXCEEDED",
      message: `Found ${models.length} models, exceeding max entity limit of ${MAX_ENTITIES}.`,
    });
  }

  // Map enums
  const enumMap = new Map<string, string[]>();
  for (const enm of enums) {
    enumMap.set(enm.name, enm.values);
  }

  // Model names set for relation detection
  const modelNames = new Set(models.map((m) => m.name));

  const entities: Entity[] = [];
  const modelToEntityId = new Map<string, string>();

  // Assign stable entity IDs
  for (const model of models) {
    const safeEntityName = sanitizeIdentifier(model.name);
    const entityId = `ent_${safeEntityName.toLowerCase()}`;
    modelToEntityId.set(model.name, entityId);
  }

  // Temporary container for relation references
  interface RelationCandidate {
    fromModel: string;
    toModel: string;
    relationField: string;
    foreignKeyField?: string;
    referencesField?: string;
    isFromList: boolean;
    isOptional: boolean;
    onDelete?: OnDeleteAction;
    line: number;
  }

  const relationCandidates: RelationCandidate[] = [];

  // Convert models to IR entities and fields
  for (const model of models) {
    const entityId = modelToEntityId.get(model.name)!;
    const safeModelName = sanitizeIdentifier(model.name);

    if (!IDENTIFIER_REGEX.test(safeModelName)) {
      diagnostics.push({
        severity: "error",
        code: "INVALID_IDENTIFIER",
        message: `Model name '${model.name}' is not a valid identifier matching ${IDENTIFIER_REGEX}.`,
        line: model.line,
        entity: model.name,
      });
    }

    const fields: Field[] = [];
    let hasPrimaryKey = false;

    // Check composite primary keys
    if (model.blockAttributes.has("id")) {
      diagnostics.push({
        severity: "warning",
        code: "PRISMA_COMPOSITE_PK",
        message: `Model '${model.name}' uses composite primary key @@id(${model.blockAttributes.get("id")}). IR v1 supports single primary keys; please designate a primary key field.`,
        line: model.line,
        entity: model.name,
      });
    }

    // Process fields
    for (const rawField of model.fields) {
      // Check if this field is a relation (types matching another model)
      if (modelNames.has(rawField.rawType)) {
        const relationAttr = rawField.attributes.get("relation");
        let foreignKeyField: string | undefined;
        let referencesField: string | undefined;
        let onDelete: OnDeleteAction | undefined;

        if (relationAttr) {
          const fieldsMatch = relationAttr.match(/fields:\s*\[([^\]]+)\]/);
          if (fieldsMatch && fieldsMatch[1]) {
            foreignKeyField = fieldsMatch[1].trim().split(",")[0]?.trim();
          }

          const referencesMatch = relationAttr.match(/references:\s*\[([^\]]+)\]/);
          if (referencesMatch && referencesMatch[1]) {
            referencesField = referencesMatch[1].trim().split(",")[0]?.trim();
          }

          const onDeleteMatch = relationAttr.match(/onDelete:\s*([A-Za-z]+)/);
          if (onDeleteMatch && onDeleteMatch[1]) {
            const rawAction = onDeleteMatch[1].toUpperCase();
            if (rawAction === "CASCADE") onDelete = "CASCADE";
            else if (rawAction === "SETNULL") onDelete = "SET_NULL";
            else if (rawAction === "RESTRICT" || rawAction === "NOACTION") onDelete = "RESTRICT";
          }
        }

        relationCandidates.push({
          fromModel: model.name,
          toModel: rawField.rawType,
          relationField: rawField.name,
          foreignKeyField,
          referencesField,
          isFromList: rawField.isList,
          isOptional: rawField.isOptional,
          onDelete,
          line: rawField.line,
        });

        // Relation navigation fields are NOT scalar database columns in IR v1
        continue;
      }

      // Scalar field processing
      const safeFieldName = sanitizeIdentifier(rawField.name);
      if (!IDENTIFIER_REGEX.test(safeFieldName)) {
        diagnostics.push({
          severity: "error",
          code: "INVALID_IDENTIFIER",
          message: `Field '${rawField.name}' in model '${model.name}' is not a valid identifier.`,
          line: rawField.line,
          entity: model.name,
          field: rawField.name,
        });
      }

      const isPk = rawField.attributes.has("id");
      const isUnique = isPk || rawField.attributes.has("unique");
      const isRequired = isPk ? true : !rawField.isOptional;

      if (isPk) {
        hasPrimaryKey = true;
      }

      // Map field type
      const { type: fieldType, enumValues, diagnostic } = mapPrismaType(
        rawField.rawType,
        enumMap,
        rawField.line,
        model.name,
        rawField.name
      );

      if (diagnostic) {
        diagnostics.push(diagnostic);
      }

      // Map default value
      const rawDefault = rawField.attributes.get("default");
      let defaultValue: string | number | boolean | undefined;

      if (rawDefault !== undefined) {
        defaultValue = mapPrismaDefault(rawDefault, fieldType, enumValues);
      } else if (isPk && fieldType === "string") {
        defaultValue = "uuid()";
      }

      const fieldId = `fld_${safeFieldName.toLowerCase()}`;
      const fieldObj: Field = {
        id: fieldId,
        name: safeFieldName,
        type: fieldType,
        required: isRequired,
      };

      if (isPk) fieldObj.isPrimaryKey = true;
      if (isUnique) fieldObj.unique = true;
      if (defaultValue !== undefined) fieldObj.default = defaultValue;
      if (enumValues && enumValues.length > 0) fieldObj.enumValues = enumValues;

      fields.push(fieldObj);
    }

    // If no PK was declared, synthesize a standard UUID 'id' primary key
    if (!hasPrimaryKey) {
      const existingIdField = fields.find((f) => f.name.toLowerCase() === "id");
      if (existingIdField) {
        existingIdField.isPrimaryKey = true;
        existingIdField.required = true;
        if (!existingIdField.default && existingIdField.type === "string") {
          existingIdField.default = "uuid()";
        }
        diagnostics.push({
          severity: "info",
          code: "PRISMA_INFERRED_PK",
          message: `Designated existing field '${existingIdField.name}' as primary key for model '${model.name}'.`,
          line: model.line,
          entity: model.name,
        });
      } else {
        fields.unshift({
          id: "fld_id",
          name: "id",
          type: "string",
          required: true,
          isPrimaryKey: true,
          default: "uuid()",
        });
        diagnostics.push({
          severity: "warning",
          code: "PRISMA_NO_PK",
          message: `Model '${model.name}' does not declare a primary key (@id). A default UUID 'id' primary key was added.`,
          line: model.line,
          entity: model.name,
          suggestion: "Add an @id attribute to designate the primary key field.",
        });
      }
    }

    if (fields.length > MAX_FIELDS_PER_ENTITY) {
      diagnostics.push({
        severity: "error",
        code: "FIELD_LIMIT_EXCEEDED",
        message: `Model '${model.name}' has ${fields.length} fields, exceeding limit of ${MAX_FIELDS_PER_ENTITY}.`,
        line: model.line,
        entity: model.name,
      });
    }

    entities.push({
      id: entityId,
      name: safeModelName,
      tableName: model.tableName || safeModelName.toLowerCase(),
      fields,
    });
  }

  // Resolve Relations
  const relations: Relation[] = [];
  const processedPairs = new Set<string>();

  for (let i = 0; i < relationCandidates.length; i++) {
    const candidate = relationCandidates[i]!;
    const fromModel = candidate.fromModel;
    const toModel = candidate.toModel;

    // Look for reciprocal candidate
    const reciprocalIndex = relationCandidates.findIndex(
      (c, idx) =>
        idx !== i &&
        c.fromModel === toModel &&
        c.toModel === fromModel
    );

    const reciprocal = reciprocalIndex >= 0 ? relationCandidates[reciprocalIndex] : undefined;

    // Unique pair signature
    const pairKey = [fromModel, toModel].sort().join("::");
    if (processedPairs.has(pairKey) && !candidate.foreignKeyField) {
      continue;
    }

    const fromEntityId = modelToEntityId.get(fromModel);
    const toEntityId = modelToEntityId.get(toModel);

    if (!fromEntityId || !toEntityId) continue;

    // Many-to-Many case (both sides are lists)
    if (candidate.isFromList && reciprocal?.isFromList) {
      if (!processedPairs.has(pairKey)) {
        processedPairs.add(pairKey);
        relations.push({
          id: `rel_${fromEntityId.replace("ent_", "")}_${toEntityId.replace("ent_", "")}_mn`,
          fromEntityId,
          toEntityId,
          kind: "many-to-many",
        });
      }
      continue;
    }

    // If candidate defines foreignKeyField, it is the child (N side in 1:N or dependent in 1:1)
    if (candidate.foreignKeyField) {
      processedPairs.add(pairKey);
      const parentEntityId = toEntityId;
      const childEntityId = fromEntityId;

      // Determine if 1:1 or 1:N:
      // If parent side has a single object reference (not list), it is 1:1
      const isOneToOne = reciprocal ? !reciprocal.isFromList : false;
      const kind: RelationKind = isOneToOne ? "one-to-one" : "one-to-many";

      // If 1:1, verify the child entity foreignKeyField is marked unique
      if (isOneToOne) {
        const childEntity = entities.find((e) => e.id === childEntityId);
        const fkField = childEntity?.fields.find((f) => f.name === candidate.foreignKeyField);
        if (fkField && !fkField.unique) {
          fkField.unique = true;
        }
      }

      relations.push({
        id: `rel_${parentEntityId.replace("ent_", "")}_${childEntityId.replace("ent_", "")}_${isOneToOne ? "11" : "1n"}`,
        fromEntityId: parentEntityId,
        toEntityId: childEntityId,
        kind,
        foreignKeyField: candidate.foreignKeyField,
        onDelete: candidate.onDelete ?? (isOneToOne ? "CASCADE" : "CASCADE"),
      });
      continue;
    }

    // If candidate is list and no reciprocal with FK yet, wait for reciprocal or infer
    if (candidate.isFromList && !reciprocal) {
      processedPairs.add(pairKey);
      const childEntity = entities.find((e) => e.id === toEntityId);
      const inferredFk = `${fromModel.toLowerCase()}Id`;
      const hasFk = childEntity?.fields.some((f) => f.name === inferredFk);

      if (hasFk) {
        relations.push({
          id: `rel_${fromEntityId.replace("ent_", "")}_${toEntityId.replace("ent_", "")}_1n`,
          fromEntityId,
          toEntityId,
          kind: "one-to-many",
          foreignKeyField: inferredFk,
          onDelete: "CASCADE",
        });
      } else {
        diagnostics.push({
          severity: "warning",
          code: "PRISMA_UNRESOLVED_RELATION",
          message: `Relation from '${fromModel}' to '${toModel}' lacks an explicit foreign key on '${toModel}'.`,
          line: candidate.line,
          entity: fromModel,
        });
      }
    }
  }

  // Endpoints
  const endpoints: EndpointConfig[] = entities.map((e) => ({
    entityId: e.id,
    ops: ["list", "get", "create", "update", "delete"],
    authRequired: false,
  }));

  // Auth config
  const hasUserEntity = entities.some(
    (e) => e.name.toLowerCase() === "user" || e.name.toLowerCase() === "account"
  );
  const auth: AuthConfig = {
    enabled: hasUserEntity,
    strategy: "jwt",
    roles: ["user", "admin"],
  };

  const project: ProjectConfig = {
    name: sanitizeIdentifier(options?.projectName ?? "PrismaSchema"),
    database: "postgres",
  };

  const ir: IRDocument = {
    irVersion: "1.0",
    project,
    entities,
    relations,
    endpoints,
    auth,
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

// Helper: Tokenize Prisma schema blocks
function tokenizeAndExtractBlocks(schemaText: string): {
  models: RawPrismaModel[];
  enums: RawPrismaEnum[];
  parseDiagnostics: ImporterDiagnostic[];
} {
  const models: RawPrismaModel[] = [];
  const enums: RawPrismaEnum[] = [];
  const parseDiagnostics: ImporterDiagnostic[] = [];

  const lines = schemaText.split(/\r?\n/);
  let currentBlockType: "model" | "enum" | "datasource" | "generator" | null = null;
  let currentBlockName = "";
  let currentBlockStartLine = 0;
  let currentModelFields: RawPrismaField[] = [];
  let currentBlockAttributes = new Map<string, string>();
  let currentEnumValues: string[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx]!;
    const lineNumber = lineIdx + 1;

    // Strip comments
    let line = rawLine;
    const commentIdx = line.indexOf("//");
    if (commentIdx >= 0) {
      line = line.substring(0, commentIdx);
    }
    line = line.trim();

    if (!line) continue;

    if (!currentBlockType) {
      const modelMatch = line.match(/^model\s+([A-Za-z0-9_]+)\s*\{?$/);
      if (modelMatch && modelMatch[1]) {
        currentBlockType = "model";
        currentBlockName = modelMatch[1];
        currentBlockStartLine = lineNumber;
        currentModelFields = [];
        currentBlockAttributes = new Map();
        continue;
      }

      const enumMatch = line.match(/^enum\s+([A-Za-z0-9_]+)\s*\{?$/);
      if (enumMatch && enumMatch[1]) {
        currentBlockType = "enum";
        currentBlockName = enumMatch[1];
        currentBlockStartLine = lineNumber;
        currentEnumValues = [];
        continue;
      }

      const otherBlockMatch = line.match(/^(datasource|generator)\s+([A-Za-z0-9_]+)\s*\{?$/);
      if (otherBlockMatch && otherBlockMatch[1]) {
        currentBlockType = otherBlockMatch[1] as "datasource" | "generator";
        currentBlockName = otherBlockMatch[2] ?? "";
        currentBlockStartLine = lineNumber;
        continue;
      }
    } else {
      // Check block end
      if (line.includes("}")) {
        if (currentBlockType === "model") {
          let tableName = currentBlockName.toLowerCase();
          const mapAttr = currentBlockAttributes.get("map");
          if (mapAttr) {
            tableName = mapAttr.replace(/["']/g, "");
          }

          models.push({
            name: currentBlockName,
            tableName,
            fields: currentModelFields,
            blockAttributes: currentBlockAttributes,
            line: currentBlockStartLine,
          });
        } else if (currentBlockType === "enum") {
          enums.push({
            name: currentBlockName,
            values: currentEnumValues,
            line: currentBlockStartLine,
          });
        }
        currentBlockType = null;
        currentBlockName = "";
        continue;
      }

      if (currentBlockType === "model") {
        // Block attribute: @@id, @@unique, @@map
        if (line.startsWith("@@")) {
          const blockAttrMatch = line.match(/^@@([A-Za-z0-9_]+)(?:\((.*)\))?$/);
          if (blockAttrMatch && blockAttrMatch[1]) {
            currentBlockAttributes.set(blockAttrMatch[1], (blockAttrMatch[2] ?? "").trim());
          }
          continue;
        }

        // Field definition: <name> <type>[?|[]] [@attr...]
        const fieldMatch = line.match(/^([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)(\?|\[\])?(.*)$/);
        if (fieldMatch && fieldMatch[1] && fieldMatch[2]) {
          const fieldName = fieldMatch[1];
          const rawType = fieldMatch[2];
          const modifier = fieldMatch[3];
          const restAttrs = fieldMatch[4] ?? "";

          const isOptional = modifier === "?";
          const isList = modifier === "[]";

          const attributes = parseAttributes(restAttrs);

          currentModelFields.push({
            name: fieldName,
            rawType,
            isOptional,
            isList,
            attributes,
            line: lineNumber,
          });
        } else {
          parseDiagnostics.push({
            severity: "warning",
            code: "PRISMA_UNPARSED_LINE",
            message: `Could not parse line: '${line}' in model '${currentBlockName}'.`,
            line: lineNumber,
            entity: currentBlockName,
          });
        }
      } else if (currentBlockType === "enum") {
        const valMatch = line.match(/^([A-Za-z0-9_]+)/);
        if (valMatch && valMatch[1]) {
          currentEnumValues.push(valMatch[1]);
        }
      }
    }
  }

  return { models, enums, parseDiagnostics };
}

// Parse attributes e.g. @id @default(uuid()) @relation(fields: [authorId], references: [id])
function parseAttributes(attrString: string): Map<string, string> {
  const result = new Map<string, string>();
  let i = 0;
  const s = attrString.trim();

  while (i < s.length) {
    if (s[i] === "@") {
      i++;
      let attrName = "";
      while (i < s.length && /[A-Za-z0-9_]/.test(s[i]!)) {
        attrName += s[i];
        i++;
      }

      let attrValue = "";
      if (i < s.length && s[i] === "(") {
        let depth = 1;
        i++;
        while (i < s.length && depth > 0) {
          if (s[i] === "(") depth++;
          else if (s[i] === ")") depth--;
          if (depth > 0) {
            attrValue += s[i];
          }
          i++;
        }
      }

      if (attrName) {
        result.set(attrName, attrValue.trim());
      }
    } else {
      i++;
    }
  }

  return result;
}

// Map Prisma Types to IR FieldType
function mapPrismaType(
  rawType: string,
  enumMap: Map<string, string[]>,
  line: number,
  modelName: string,
  fieldName: string
): { type: FieldType; enumValues?: string[]; diagnostic?: ImporterDiagnostic } {
  switch (rawType) {
    case "String":
      return { type: "string" };
    case "Int":
      return { type: "int" };
    case "BigInt":
      return {
        type: "int",
        diagnostic: {
          severity: "info",
          code: "PRISMA_TYPE_CONVERSION",
          message: `Field '${fieldName}' in model '${modelName}': Prisma BigInt mapped to IR 64-bit int.`,
          line,
          entity: modelName,
          field: fieldName,
        },
      };
    case "Float":
    case "Decimal":
      return { type: "decimal" };
    case "Boolean":
      return { type: "bool" };
    case "DateTime":
      return { type: "timestamp" };
    case "Json":
      return { type: "json" };
    case "Bytes":
      return {
        type: "string",
        diagnostic: {
          severity: "warning",
          code: "PRISMA_UNSUPPORTED_TYPE",
          message: `Field '${fieldName}' in model '${modelName}': Bytes type is not supported in IR v1; mapped to string.`,
          line,
          entity: modelName,
          field: fieldName,
          suggestion: "Use base64-encoded string or json representation for binary data.",
        },
      };
    default:
      if (enumMap.has(rawType)) {
        return {
          type: "enum",
          enumValues: enumMap.get(rawType),
        };
      }
      return {
        type: "string",
        diagnostic: {
          severity: "warning",
          code: "PRISMA_UNKNOWN_TYPE",
          message: `Field '${fieldName}' in model '${modelName}': unrecognized type '${rawType}'; falling back to string.`,
          line,
          entity: modelName,
          field: fieldName,
        },
      };
  }
}

// Map Prisma default value syntax to IR default value
function mapPrismaDefault(
  rawDefault: string,
  fieldType: FieldType,
  enumValues?: string[]
): string | number | boolean | undefined {
  const trimmed = rawDefault.trim();

  if (trimmed === "autoincrement()") {
    return undefined;
  }
  if (trimmed === "uuid()") {
    return "uuid()";
  }
  if (trimmed === "cuid()") {
    return "uuid()";
  }
  if (trimmed === "now()") {
    return "now()";
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Numeric literal
  if (/^-?\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // String literal "value" or 'value'
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  // Enum literal identifier
  if (fieldType === "enum" && enumValues && enumValues.includes(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function createEmptyIR(name: string): IRDocument {
  return {
    irVersion: "1.0",
    project: {
      name,
      database: "postgres",
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
