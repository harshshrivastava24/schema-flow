import { validateIR } from "../validator.js";
import { computeDagreLayout } from "./layout-dagre.js";
import { parseMongoJson, parseMongoSchema, parseMongooseAst } from "./mongo-importer.js";
import { parsePrismaSchema } from "./prisma-importer.js";
import type { ImporterOptions, ImportResult } from "./types.js";

export * from "./types.js";
export * from "./layout-dagre.js";
export * from "./prisma-importer.js";
export * from "./mongo-importer.js";

export type SchemaFormat = "prisma" | "mongodb" | "auto";

/**
 * Unified entry point for importing existing schemas (Prisma, Mongoose AST, MongoDB JSON)
 * into a validated IRDocument with optional Dagre LR auto-layout.
 */
export function importSchema(
  input: string,
  kind: SchemaFormat = "auto",
  options?: ImporterOptions
): ImportResult {
  const resolvedKind = resolveSchemaKind(input, kind);

  let result: ImportResult;
  if (resolvedKind === "prisma") {
    result = parsePrismaSchema(input, options);
  } else {
    result = parseMongoSchema(input, options);
  }

  // Apply Dagre auto-layout by default unless explicitly disabled
  if (options?.layout !== false && result.ir.entities.length > 0) {
    const layout = computeDagreLayout(result.ir.entities, result.ir.relations);
    result.ir.layout = layout;
  }

  // Validate candidate IR against IR v1.0 specifications & semantic rules
  if (result.ir.entities.length > 0) {
    const validation = validateIR(result.ir);
    if (!validation.valid) {
      result.success = false;
      for (const err of validation.errors) {
        result.diagnostics.push({
          severity: "error",
          code: `IR_VALIDATION_${err.rule.toUpperCase()}`,
          message: `IR Validation Error [${err.rule}]: ${err.message}`,
          entity: err.entityId,
          field: err.fieldId,
        });
      }
    }
  }

  return result;
}

function resolveSchemaKind(input: string, kind: SchemaFormat): "prisma" | "mongodb" {
  if (kind === "prisma" || kind === "mongodb") {
    return kind;
  }

  const trimmed = input.trim();

  // JSON detection
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "mongodb";
  }

  // Mongoose keywords
  if (
    trimmed.includes("new Schema") ||
    trimmed.includes("mongoose.Schema") ||
    trimmed.includes("mongoose.model") ||
    trimmed.includes("Schema.Types.ObjectId")
  ) {
    return "mongodb";
  }

  // Prisma keywords
  if (
    trimmed.includes("model ") ||
    trimmed.includes("datasource ") ||
    trimmed.includes("generator ") ||
    trimmed.includes("@id") ||
    trimmed.includes("@default") ||
    trimmed.includes("@relation")
  ) {
    return "prisma";
  }

  // Default to prisma for relational schemas
  return "prisma";
}
