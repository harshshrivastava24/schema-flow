import { createHash } from "node:crypto";
import { IRDocument, SemanticIRDocument, Entity, Field, Relation, EndpointConfig } from "./types.js";

/**
 * Recursively sorts all keys in an object alphabetically.
 */
function canonicalizeValue(val: unknown): unknown {
  if (val === null || typeof val !== "object") {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((item) => canonicalizeValue(item));
  }

  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    result[key] = canonicalizeValue(obj[key]);
  }

  return result;
}

/**
 * Projects an IRDocument to its canonical SemanticIRDocument representation:
 * - Excludes `layout`
 * - Sorts entities by `id`
 * - Sorts fields within each entity by `id`
 * - Sorts relations by `id`
 * - Sorts endpoints by `entityId`
 * - Sorts auth.roles alphabetically
 * - Recursively sorts all object keys
 */
export function canonicalizeIR(ir: IRDocument): SemanticIRDocument {
  // Sort fields for an entity
  const sortFields = (fields: Field[]): Field[] => {
    return [...fields].sort((a, b) => a.id.localeCompare(b.id));
  };

  // Sort entities by id
  const sortedEntities: Entity[] = (ir.entities || [])
    .map((e) => ({
      ...e,
      fields: sortFields(e.fields || [])
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Sort relations by id
  const sortedRelations: Relation[] = [...(ir.relations || [])].sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  // Sort endpoints by entityId
  const sortedEndpoints: EndpointConfig[] = [...(ir.endpoints || [])].sort((a, b) =>
    a.entityId.localeCompare(b.entityId)
  );

  // Sort auth roles
  const sortedAuth = {
    ...ir.auth,
    roles: [...(ir.auth?.roles || [])].sort()
  };

  const semanticDoc: SemanticIRDocument = {
    irVersion: ir.irVersion,
    project: { ...ir.project },
    entities: sortedEntities,
    relations: sortedRelations,
    endpoints: sortedEndpoints,
    auth: sortedAuth
  };

  return canonicalizeValue(semanticDoc) as SemanticIRDocument;
}

/**
 * Computes a deterministic SHA-256 semantic content hash for an IRDocument.
 * Explicitly ignores layout/canvas positioning and key ordering.
 */
export function computeSemanticHash(ir: IRDocument): string {
  const canonical = canonicalizeIR(ir);
  const jsonString = JSON.stringify(canonical);
  return createHash("sha256").update(jsonString, "utf8").digest("hex");
}
