export const IR_VERSION = "1.0";

export type DatabaseType = "postgres" | "mongodb";

export type FieldType =
  | "string"
  | "int"
  | "decimal"
  | "bool"
  | "timestamp"
  | "uuid"
  | "json"
  | "enum";

export interface ProjectConfig {
  name: string;
  database: DatabaseType;
}

export interface Field {
  id: string; // fld_*
  name: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  isPrimaryKey?: boolean;
  default?: string | number | boolean;
  enumValues?: string[];
}

export interface Entity {
  id: string; // ent_*
  name: string;
  tableName: string;
  fields: Field[];
}

export type RelationKind = "one-to-one" | "one-to-many" | "many-to-many";
export type OnDeleteAction = "RESTRICT" | "CASCADE" | "SET_NULL";

export interface Relation {
  id: string; // rel_*
  fromEntityId: string;
  toEntityId: string;
  kind: RelationKind;
  foreignKeyField?: string;
  onDelete?: OnDeleteAction;
}

export type EndpointOp = "list" | "get" | "create" | "update" | "delete";

export interface EndpointConfig {
  entityId: string;
  ops: EndpointOp[];
  authRequired: boolean;
}

export interface AuthConfig {
  enabled: boolean;
  strategy: "jwt";
  roles: string[];
}

export interface NodeLayout {
  x: number;
  y: number;
  color?: string;
}

export interface CanvasLayout {
  nodes: Record<string, NodeLayout>;
}

export interface IRDocument {
  irVersion: "1.0";
  project: ProjectConfig;
  entities: Entity[];
  relations: Relation[];
  endpoints: EndpointConfig[];
  auth: AuthConfig;
  layout?: CanvasLayout;
}

export interface SemanticIRDocument {
  irVersion: "1.0";
  project: ProjectConfig;
  entities: Entity[];
  relations: Relation[];
  endpoints: EndpointConfig[];
  auth: AuthConfig;
}

export interface IRValidationError {
  path: string;
  message: string;
  rule: string;
  entityId?: string;
  fieldId?: string;
  relationId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: IRValidationError[];
}
