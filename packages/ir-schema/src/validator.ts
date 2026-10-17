import _Ajv, { ErrorObject } from "ajv";
import _addFormats from "ajv-formats";
import { irSchema } from "./schema.js";
import {
  IRDocument,
  ValidationResult,
  IRValidationError,
  Entity,
  Field,
  Relation,
  EndpointConfig
} from "./types.js";
import {
  isValidIdentifier,
  isValidEnumValue,
  isReservedWord,
  isAllowedDefault,
  MAX_ENTITIES,
  MAX_FIELDS_PER_ENTITY
} from "./security.js";

const AjvClass: any = (_Ajv as any).default ?? _Ajv;
const addFormatsFn: any = (_addFormats as any).default ?? _addFormats;

const ajv = new AjvClass({ allErrors: true, strict: false });
addFormatsFn(ajv);
const validateAjv = ajv.compile(irSchema);

export function validateIR(data: unknown): ValidationResult {
  const errors: IRValidationError[] = [];

  // Step 1: Structural Schema Validation via Ajv
  const isSchemaValid = validateAjv(data);
  if (!isSchemaValid && validateAjv.errors) {
    for (const err of validateAjv.errors) {
      errors.push(mapAjvErrorToIRValidationError(err));
    }
    // If top-level structure is broken, return early
    if (typeof data !== "object" || data === null || !("entities" in data)) {
      return { valid: false, errors };
    }
  }

  const doc = data as IRDocument;

  // Step 2: Hard Limits Validation
  if (doc.entities && doc.entities.length > MAX_ENTITIES) {
    errors.push({
      path: "/entities",
      message: `Project exceeds maximum entity limit of ${MAX_ENTITIES} (found ${doc.entities.length})`,
      rule: "LIMIT_MAX_ENTITIES"
    });
  }

  // Step 3: Entity-level & Field-level Validations
  const entityMap = new Map<string, Entity>();
  const entityNames = new Set<string>();
  const tableNames = new Set<string>();

  if (Array.isArray(doc.entities)) {
    for (let eIdx = 0; eIdx < doc.entities.length; eIdx++) {
      const entity = doc.entities[eIdx];
      if (!entity) continue;
      const entityId = entity.id;
      const entityPath = `/entities/${eIdx}`;

      // Check entity ID uniqueness
      if (entityMap.has(entityId)) {
        errors.push({
          path: `${entityPath}/id`,
          message: `Duplicate entity ID '${entityId}'`,
          rule: "UNIQUE_ENTITY_ID",
          entityId
        });
      } else {
        entityMap.set(entityId, entity);
      }

      // Check entity name identifier regex & reserved words
      if (!isValidIdentifier(entity.name)) {
        errors.push({
          path: `${entityPath}/name`,
          message: `Entity name '${entity.name}' is not a valid identifier (must match ^[A-Za-z_][A-Za-z0-9_]{0,63}$)`,
          rule: "VALID_IDENTIFIER",
          entityId
        });
      } else if (isReservedWord(entity.name)) {
        errors.push({
          path: `${entityPath}/name`,
          message: `Entity name '${entity.name}' is a reserved language/SQL keyword`,
          rule: "RESERVED_IDENTIFIER",
          entityId
        });
      }

      // Check entity name uniqueness (case-insensitive)
      const lowerName = entity.name.toLowerCase();
      if (entityNames.has(lowerName)) {
        errors.push({
          path: `${entityPath}/name`,
          message: `Duplicate entity name '${entity.name}'`,
          rule: "UNIQUE_ENTITY_NAME",
          entityId
        });
      } else {
        entityNames.add(lowerName);
      }

      // Check table name identifier & uniqueness
      if (!isValidIdentifier(entity.tableName)) {
        errors.push({
          path: `${entityPath}/tableName`,
          message: `Table name '${entity.tableName}' is not a valid identifier`,
          rule: "VALID_IDENTIFIER",
          entityId
        });
      } else if (isReservedWord(entity.tableName)) {
        errors.push({
          path: `${entityPath}/tableName`,
          message: `Table name '${entity.tableName}' is a reserved SQL keyword`,
          rule: "RESERVED_IDENTIFIER",
          entityId
        });
      }

      const lowerTable = entity.tableName.toLowerCase();
      if (tableNames.has(lowerTable)) {
        errors.push({
          path: `${entityPath}/tableName`,
          message: `Duplicate table name '${entity.tableName}'`,
          rule: "UNIQUE_TABLE_NAME",
          entityId
        });
      } else {
        tableNames.add(lowerTable);
      }

      // Fields limit
      if (Array.isArray(entity.fields)) {
        if (entity.fields.length > MAX_FIELDS_PER_ENTITY) {
          errors.push({
            path: `${entityPath}/fields`,
            message: `Entity '${entity.name}' exceeds maximum field limit of ${MAX_FIELDS_PER_ENTITY} (found ${entity.fields.length})`,
            rule: "LIMIT_MAX_FIELDS",
            entityId
          });
        }

        const fieldIds = new Set<string>();
        const fieldNames = new Set<string>();
        let primaryKeyCount = 0;
        let pkField: Field | undefined;

        for (let fIdx = 0; fIdx < entity.fields.length; fIdx++) {
          const field = entity.fields[fIdx];
          if (!field) continue;
          const fieldPath = `${entityPath}/fields/${fIdx}`;
          const fieldId = field.id;

          // Field ID uniqueness within entity
          if (fieldIds.has(fieldId)) {
            errors.push({
              path: `${fieldPath}/id`,
              message: `Duplicate field ID '${fieldId}' in entity '${entity.name}'`,
              rule: "UNIQUE_FIELD_ID",
              entityId,
              fieldId
            });
          } else {
            fieldIds.add(fieldId);
          }

          // Field name identifier & reserved words
          if (!isValidIdentifier(field.name)) {
            errors.push({
              path: `${fieldPath}/name`,
              message: `Field name '${field.name}' is not a valid identifier`,
              rule: "VALID_IDENTIFIER",
              entityId,
              fieldId
            });
          } else if (isReservedWord(field.name)) {
            errors.push({
              path: `${fieldPath}/name`,
              message: `Field name '${field.name}' is a reserved keyword`,
              rule: "RESERVED_IDENTIFIER",
              entityId,
              fieldId
            });
          }

          // Mongo _id check
          if (doc.project?.database === "mongodb" && field.name === "_id") {
            errors.push({
              path: `${fieldPath}/name`,
              message: `Explicit field name '_id' is forbidden in MongoDB targets (managed automatically)`,
              rule: "FORBIDDEN_FIELD_NAME",
              entityId,
              fieldId
            });
          }

          // Field name uniqueness within entity
          const lowerFieldName = field.name.toLowerCase();
          if (fieldNames.has(lowerFieldName)) {
            errors.push({
              path: `${fieldPath}/name`,
              message: `Duplicate field name '${field.name}' in entity '${entity.name}'`,
              rule: "UNIQUE_FIELD_NAME",
              entityId,
              fieldId
            });
          } else {
            fieldNames.add(lowerFieldName);
          }

          // Primary key tracking
          if (field.isPrimaryKey) {
            primaryKeyCount++;
            pkField = field;
            if (!field.required) {
              errors.push({
                path: `${fieldPath}/required`,
                message: `Primary key field '${field.name}' must be required`,
                rule: "PRIMARY_KEY_REQUIRED",
                entityId,
                fieldId
              });
            }
          }

          // Enum values validation
          if (field.type === "enum") {
            if (!field.enumValues || field.enumValues.length === 0) {
              errors.push({
                path: `${fieldPath}/enumValues`,
                message: `Enum field '${field.name}' must define non-empty 'enumValues'`,
                rule: "ENUM_VALUES_REQUIRED",
                entityId,
                fieldId
              });
            } else {
              const seenEnumValues = new Set<string>();
              for (const ev of field.enumValues) {
                if (!isValidEnumValue(ev)) {
                  errors.push({
                    path: `${fieldPath}/enumValues`,
                    message: `Enum value '${ev}' in field '${field.name}' is invalid (must match ^[A-Za-z0-9_-]{1,64}$)`,
                    rule: "VALID_ENUM_VALUE",
                    entityId,
                    fieldId
                  });
                }
                if (seenEnumValues.has(ev)) {
                  errors.push({
                    path: `${fieldPath}/enumValues`,
                    message: `Duplicate enum value '${ev}' in field '${field.name}'`,
                    rule: "UNIQUE_ENUM_VALUE",
                    entityId,
                    fieldId
                  });
                }
                seenEnumValues.add(ev);
              }
            }
          }

          // Default value validation
          if (field.default !== undefined) {
            const defaultCheck = isAllowedDefault(field.default, field.type, field.enumValues);
            if (!defaultCheck.allowed) {
              errors.push({
                path: `${fieldPath}/default`,
                message: `Invalid default value '${String(field.default)}' for field '${field.name}': ${defaultCheck.reason}`,
                rule: "INVALID_DEFAULT_VALUE",
                entityId,
                fieldId
              });
            }
          }
        }

        // Exactly one primary key required
        if (primaryKeyCount === 0) {
          errors.push({
            path: `${entityPath}/fields`,
            message: `Entity '${entity.name}' must have exactly one primary key (none found)`,
            rule: "MISSING_PRIMARY_KEY",
            entityId
          });
        } else if (primaryKeyCount > 1) {
          errors.push({
            path: `${entityPath}/fields`,
            message: `Entity '${entity.name}' must have exactly one primary key (found ${primaryKeyCount})`,
            rule: "MULTIPLE_PRIMARY_KEYS",
            entityId
          });
        }

        // Database PK type compatibility
        if (pkField && doc.project?.database === "postgres") {
          if (pkField.type !== "uuid" && pkField.type !== "int" && pkField.type !== "string") {
            errors.push({
              path: `${entityPath}/fields/${entity.fields.indexOf(pkField)}/type`,
              message: `PostgreSQL primary key '${pkField.name}' must be of type 'uuid', 'int', or 'string'`,
              rule: "INCOMPATIBLE_PK_TYPE",
              entityId,
              fieldId: pkField.id
            });
          }
        }
      }
    }
  }

  // Step 4: Relation Validations
  const relationIds = new Set<string>();
  const requiredFkEdges: Array<{ from: string; to: string; relationId: string }> = [];

  if (Array.isArray(doc.relations)) {
    for (let rIdx = 0; rIdx < doc.relations.length; rIdx++) {
      const rel = doc.relations[rIdx];
      if (!rel) continue;
      const relPath = `/relations/${rIdx}`;
      const relId = rel.id;

      if (relationIds.has(relId)) {
        errors.push({
          path: `${relPath}/id`,
          message: `Duplicate relation ID '${relId}'`,
          rule: "UNIQUE_RELATION_ID",
          relationId: relId
        });
      } else {
        relationIds.add(relId);
      }

      const fromEntity = entityMap.get(rel.fromEntityId);
      const toEntity = entityMap.get(rel.toEntityId);

      if (!fromEntity) {
        errors.push({
          path: `${relPath}/fromEntityId`,
          message: `Dangling relation: fromEntityId '${rel.fromEntityId}' does not exist`,
          rule: "DANGLING_RELATION_SOURCE",
          relationId: relId
        });
      }

      if (!toEntity) {
        errors.push({
          path: `${relPath}/toEntityId`,
          message: `Dangling relation: toEntityId '${rel.toEntityId}' does not exist`,
          rule: "DANGLING_RELATION_TARGET",
          relationId: relId
        });
      }

      if (!fromEntity || !toEntity) {
        continue;
      }

      const fromPk = fromEntity.fields.find((f) => f.isPrimaryKey);

      if (rel.kind === "one-to-one" || rel.kind === "one-to-many") {
        if (!rel.foreignKeyField) {
          errors.push({
            path: `${relPath}/foreignKeyField`,
            message: `Relation '${relId}' of kind '${rel.kind}' requires 'foreignKeyField'`,
            rule: "MISSING_FOREIGN_KEY_FIELD",
            relationId: relId
          });
        } else {
          // Foreign key must exist on toEntity
          const fkField = toEntity.fields.find((f) => f.name === rel.foreignKeyField);
          if (!fkField) {
            errors.push({
              path: `${relPath}/foreignKeyField`,
              message: `Foreign key field '${rel.foreignKeyField}' does not exist on target entity '${toEntity.name}'`,
              rule: "FOREIGN_KEY_NOT_FOUND",
              relationId: relId,
              entityId: toEntity.id
            });
          } else {
            // Check type compatibility between PK and FK
            if (fromPk && fkField.type !== fromPk.type) {
              errors.push({
                path: `${relPath}/foreignKeyField`,
                message: `Foreign key field '${fkField.name}' type '${fkField.type}' does not match source primary key '${fromPk.name}' type '${fromPk.type}'`,
                rule: "FOREIGN_KEY_TYPE_MISMATCH",
                relationId: relId,
                entityId: toEntity.id,
                fieldId: fkField.id
              });
            }

            // For one-to-one relations, FK should be unique
            if (rel.kind === "one-to-one" && !fkField.unique) {
              errors.push({
                path: `${relPath}/kind`,
                message: `One-to-one relation foreign key field '${fkField.name}' on entity '${toEntity.name}' must be unique`,
                rule: "ONE_TO_ONE_REQUIRES_UNIQUE_FK",
                relationId: relId,
                entityId: toEntity.id,
                fieldId: fkField.id
              });
            }

            // onDelete: SET_NULL requires foreign key to be nullable (required === false or undefined)
            if (rel.onDelete === "SET_NULL" && fkField.required) {
              errors.push({
                path: `${relPath}/onDelete`,
                message: `onDelete 'SET_NULL' is invalid because foreign key field '${fkField.name}' is marked required`,
                rule: "SET_NULL_ON_REQUIRED_FK",
                relationId: relId,
                entityId: toEntity.id,
                fieldId: fkField.id
              });
            }

            // Track required FK for cycle detection
            if (fkField.required) {
              requiredFkEdges.push({
                from: toEntity.id,
                to: fromEntity.id,
                relationId: relId
              });
            }

            // Self-referencing check
            if (rel.fromEntityId === rel.toEntityId && fkField.required) {
              errors.push({
                path: `${relPath}`,
                message: `Self-referencing relation on entity '${fromEntity.name}' cannot have a required foreign key field (creates impossible insertion cycle)`,
                rule: "SELF_REFERENCING_CYCLE",
                relationId: relId,
                entityId: fromEntity.id,
                fieldId: fkField.id
              });
            }
          }
        }
      } else if (rel.kind === "many-to-many") {
        if (rel.foreignKeyField) {
          errors.push({
            path: `${relPath}/foreignKeyField`,
            message: `Many-to-many relation '${relId}' must not define 'foreignKeyField' (join table is automatically generated)`,
            rule: "FORBIDDEN_MANY_TO_MANY_FK",
            relationId: relId
          });
        }
      }
    }

    // Check circular dependencies of non-nullable foreign keys between entities
    const cycleDetected = detectRequiredFkCycle(requiredFkEdges);
    if (cycleDetected) {
      errors.push({
        path: "/relations",
        message: `Cyclic non-nullable foreign key dependency detected: ${cycleDetected.join(" -> ")}`,
        rule: "CIRCULAR_REQUIRED_FK_CYCLE"
      });
    }
  }

  // Step 5: Endpoints Validations
  if (Array.isArray(doc.endpoints)) {
    const endpointEntities = new Set<string>();
    for (let epIdx = 0; epIdx < doc.endpoints.length; epIdx++) {
      const ep = doc.endpoints[epIdx];
      if (!ep) continue;
      const epPath = `/endpoints/${epIdx}`;

      if (!entityMap.has(ep.entityId)) {
        errors.push({
          path: `${epPath}/entityId`,
          message: `Endpoint references non-existent entityId '${ep.entityId}'`,
          rule: "DANGLING_ENDPOINT_ENTITY",
          entityId: ep.entityId
        });
      }

      if (endpointEntities.has(ep.entityId)) {
        errors.push({
          path: `${epPath}/entityId`,
          message: `Duplicate endpoint configuration for entityId '${ep.entityId}'`,
          rule: "DUPLICATE_ENDPOINT_ENTITY",
          entityId: ep.entityId
        });
      } else {
        endpointEntities.add(ep.entityId);
      }

      if (!ep.ops || ep.ops.length === 0) {
        errors.push({
          path: `${epPath}/ops`,
          message: `Endpoint configuration for entityId '${ep.entityId}' must specify at least one op`,
          rule: "EMPTY_ENDPOINT_OPS",
          entityId: ep.entityId
        });
      }
    }
  }

  // Step 6: Auth Validations
  if (doc.auth) {
    if (doc.auth.enabled) {
      if (!Array.isArray(doc.auth.roles) || doc.auth.roles.length === 0) {
        errors.push({
          path: "/auth/roles",
          message: `When auth is enabled, 'roles' must be a non-empty array`,
          rule: "AUTH_ROLES_REQUIRED"
        });
      } else {
        const seenRoles = new Set<string>();
        for (const role of doc.auth.roles) {
          if (!isValidIdentifier(role)) {
            errors.push({
              path: "/auth/roles",
              message: `Role '${role}' is not a valid identifier`,
              rule: "VALID_IDENTIFIER"
            });
          }
          if (seenRoles.has(role)) {
            errors.push({
              path: "/auth/roles",
              message: `Duplicate role '${role}' in auth config`,
              rule: "UNIQUE_ROLE"
            });
          }
          seenRoles.add(role);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function mapAjvErrorToIRValidationError(err: ErrorObject): IRValidationError {
  const path = err.instancePath || "/";
  let entityId: string | undefined;
  let fieldId: string | undefined;
  let relationId: string | undefined;

  // Extract entityId / fieldId / relationId if present in path
  const entityMatch = path.match(/\/entities\/(\d+)/);
  const fieldMatch = path.match(/\/entities\/\d+\/fields\/(\d+)/);
  const relationMatch = path.match(/\/relations\/(\d+)/);

  return {
    path,
    message: err.message || "Schema validation failed",
    rule: `SCHEMA_${(err.keyword || "ERROR").toUpperCase()}`,
    entityId,
    fieldId,
    relationId
  };
}

function detectRequiredFkCycle(
  edges: Array<{ from: string; to: string; relationId: string }>
): string[] | null {
  const adj = new Map<string, string[]>();
  for (const { from, to } of edges) {
    if (from === to) continue; // self-relations already caught
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  for (const node of adj.keys()) {
    if (hasCycleDFS(node, adj, visited, recStack, path)) {
      return path;
    }
  }

  return null;
}

function hasCycleDFS(
  curr: string,
  adj: Map<string, string[]>,
  visited: Set<string>,
  recStack: Set<string>,
  path: string[]
): boolean {
  visited.add(curr);
  recStack.add(curr);
  path.push(curr);

  const neighbors = adj.get(curr) || [];
  for (const neighbor of neighbors) {
    if (!visited.has(neighbor)) {
      if (hasCycleDFS(neighbor, adj, visited, recStack, path)) {
        return true;
      }
    } else if (recStack.has(neighbor)) {
      path.push(neighbor);
      return true;
    }
  }

  recStack.delete(curr);
  path.pop();
  return false;
}
