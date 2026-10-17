import test from "node:test";
import assert from "node:assert/strict";
import { validateIR } from "./validator.js";
import { blogTemplate, shopTemplate, trackerTemplate } from "./templates/index.js";
import { IRDocument } from "./types.js";

function createValidBaseIR(): IRDocument {
  return {
    irVersion: "1.0",
    project: {
      name: "test-api",
      database: "postgres"
    },
    entities: [
      {
        id: "ent_user",
        name: "User",
        tableName: "users",
        fields: [
          {
            id: "fld_user_id",
            name: "id",
            type: "uuid",
            required: true,
            unique: true,
            isPrimaryKey: true,
            default: "uuid()"
          },
          {
            id: "fld_user_email",
            name: "email",
            type: "string",
            required: true,
            unique: true
          }
        ]
      },
      {
        id: "ent_post",
        name: "Post",
        tableName: "posts",
        fields: [
          {
            id: "fld_post_id",
            name: "id",
            type: "uuid",
            required: true,
            unique: true,
            isPrimaryKey: true,
            default: "uuid()"
          },
          {
            id: "fld_post_authorId",
            name: "authorId",
            type: "uuid",
            required: true
          },
          {
            id: "fld_post_title",
            name: "title",
            type: "string",
            required: true
          }
        ]
      }
    ],
    relations: [
      {
        id: "rel_user_posts",
        fromEntityId: "ent_user",
        toEntityId: "ent_post",
        kind: "one-to-many",
        foreignKeyField: "authorId",
        onDelete: "CASCADE"
      }
    ],
    endpoints: [
      {
        entityId: "ent_user",
        ops: ["list", "get", "create", "update", "delete"],
        authRequired: true
      },
      {
        entityId: "ent_post",
        ops: ["list", "get", "create"],
        authRequired: false
      }
    ],
    auth: {
      enabled: true,
      strategy: "jwt",
      roles: ["ADMIN", "USER"]
    },
    layout: {
      nodes: {
        ent_user: { x: 100, y: 100 },
        ent_post: { x: 400, y: 100 }
      }
    }
  };
}

test("starter templates: blog.json passes validation", () => {
  const result = validateIR(blogTemplate);
  assert.equal(result.valid, true, `Blog errors: ${JSON.stringify(result.errors)}`);
  assert.equal(result.errors.length, 0);
});

test("starter templates: shop.json passes validation", () => {
  const result = validateIR(shopTemplate);
  assert.equal(result.valid, true, `Shop errors: ${JSON.stringify(result.errors)}`);
  assert.equal(result.errors.length, 0);
});

test("starter templates: tracker.json passes validation", () => {
  const result = validateIR(trackerTemplate);
  assert.equal(result.valid, true, `Tracker errors: ${JSON.stringify(result.errors)}`);
  assert.equal(result.errors.length, 0);
});

test("valid base IR passes validation", () => {
  const ir = createValidBaseIR();
  const result = validateIR(ir);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("rejects missing top-level required properties", () => {
  const ir = { irVersion: "1.0" };
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule.startsWith("SCHEMA_")));
});

test("rejects invalid irVersion", () => {
  const ir = createValidBaseIR();
  (ir as any).irVersion = "2.0";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
});

test("rejects template/SQL injection in entity name: User\"; DROP TABLE--", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.name = 'User"; DROP TABLE--';
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (e) => e.entityId === "ent_user" && (e.rule === "VALID_IDENTIFIER" || e.rule.startsWith("SCHEMA_"))
    )
  );
});

test("rejects template/SQL injection in field name", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.fields[1]!.name = "email'; DELETE FROM users;--";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.fieldId === "fld_user_email"));
});

test("rejects dangerous SQL injection in default string value", () => {
  const ir = createValidBaseIR();
  ir.entities[1]!.fields[2]!.default = "safe'; DROP TABLE posts;--";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "INVALID_DEFAULT_VALUE"));
});

test("rejects reserved word for entity name", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.name = "Select";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "RESERVED_IDENTIFIER"));
});

test("rejects reserved word for table name", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.tableName = "where";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "RESERVED_IDENTIFIER"));
});

test("rejects reserved word for field name", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.fields[1]!.name = "delete";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "RESERVED_IDENTIFIER"));
});

test("rejects explicit '_id' field name in mongodb target", () => {
  const ir = createValidBaseIR();
  ir.project.database = "mongodb";
  ir.entities[0]!.fields[1]!.name = "_id";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "FORBIDDEN_FIELD_NAME" || e.rule === "RESERVED_IDENTIFIER"));
});

test("rejects duplicate entity names (case-insensitive)", () => {
  const ir = createValidBaseIR();
  ir.entities[1]!.name = "user"; // matches "User"
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "UNIQUE_ENTITY_NAME"));
});

test("rejects duplicate table names", () => {
  const ir = createValidBaseIR();
  ir.entities[1]!.tableName = "users";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "UNIQUE_TABLE_NAME"));
});

test("rejects duplicate field IDs within entity", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.fields[1]!.id = "fld_user_id";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "UNIQUE_FIELD_ID"));
});

test("rejects duplicate field names within entity", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.fields[1]!.name = "id";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "UNIQUE_FIELD_NAME"));
});

test("rejects entity with no primary key", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.fields[0]!.isPrimaryKey = false;
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "MISSING_PRIMARY_KEY"));
});

test("rejects entity with multiple primary keys", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.fields[1]!.isPrimaryKey = true;
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "MULTIPLE_PRIMARY_KEYS"));
});

test("rejects primary key marked as required: false", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.fields[0]!.required = false;
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "PRIMARY_KEY_REQUIRED"));
});

test("rejects enum field without enumValues", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.fields.push({
    id: "fld_user_role",
    name: "role",
    type: "enum",
    required: true
  });
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "ENUM_VALUES_REQUIRED"));
});

test("rejects enum field with invalid enum value characters", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.fields.push({
    id: "fld_user_role",
    name: "role",
    type: "enum",
    required: true,
    enumValues: ["VALID_ROLE", "INVALID ROLE WITH SPACES!"]
  });
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "VALID_ENUM_VALUE" || e.rule.startsWith("SCHEMA_")));
});

test("rejects enum field with duplicate enum values", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.fields.push({
    id: "fld_user_role",
    name: "role",
    type: "enum",
    required: true,
    enumValues: ["ADMIN", "ADMIN"]
  });
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "UNIQUE_ENUM_VALUE"));
});

test("rejects invalid default value for boolean field", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.fields.push({
    id: "fld_user_active",
    name: "active",
    type: "bool",
    required: true,
    default: "not_a_bool"
  });
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "INVALID_DEFAULT_VALUE"));
});

test("rejects invalid default value for int field", () => {
  const ir = createValidBaseIR();
  ir.entities[0]!.fields.push({
    id: "fld_user_age",
    name: "age",
    type: "int",
    required: true,
    default: "12.34"
  });
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "INVALID_DEFAULT_VALUE"));
});

test("rejects dangling relation fromEntityId", () => {
  const ir = createValidBaseIR();
  ir.relations[0]!.fromEntityId = "ent_nonexistent";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "DANGLING_RELATION_SOURCE"));
});

test("rejects dangling relation toEntityId", () => {
  const ir = createValidBaseIR();
  ir.relations[0]!.toEntityId = "ent_nonexistent";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "DANGLING_RELATION_TARGET"));
});

test("rejects one-to-many relation missing foreignKeyField", () => {
  const ir = createValidBaseIR();
  delete ir.relations[0]!.foreignKeyField;
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "MISSING_FOREIGN_KEY_FIELD"));
});

test("rejects one-to-many relation referencing non-existent foreignKeyField", () => {
  const ir = createValidBaseIR();
  ir.relations[0]!.foreignKeyField = "nonExistentField";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "FOREIGN_KEY_NOT_FOUND"));
});

test("rejects relation with FK type mismatch", () => {
  const ir = createValidBaseIR();
  ir.entities[1]!.fields[1]!.type = "string"; // authorId is string, but User.id is uuid
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "FOREIGN_KEY_TYPE_MISMATCH"));
});

test("rejects one-to-one relation without unique constraint on FK", () => {
  const ir = createValidBaseIR();
  ir.relations[0]!.kind = "one-to-one";
  // authorId is not unique
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "ONE_TO_ONE_REQUIRES_UNIQUE_FK"));
});

test("rejects onDelete SET_NULL on required FK", () => {
  const ir = createValidBaseIR();
  ir.relations[0]!.onDelete = "SET_NULL";
  ir.entities[1]!.fields[1]!.required = true;
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "SET_NULL_ON_REQUIRED_FK"));
});

test("rejects many-to-many relation with foreignKeyField specified", () => {
  const ir = createValidBaseIR();
  ir.relations[0]!.kind = "many-to-many";
  ir.relations[0]!.foreignKeyField = "authorId";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "FORBIDDEN_MANY_TO_MANY_FK"));
});

test("rejects self-referencing relation with required foreign key (cycle)", () => {
  const ir = createValidBaseIR();
  // Add self-referencing managerId field to User
  ir.entities[0]!.fields.push({
    id: "fld_user_managerId",
    name: "managerId",
    type: "uuid",
    required: true // Impossible insert cycle
  });
  ir.relations.push({
    id: "rel_user_manager",
    fromEntityId: "ent_user",
    toEntityId: "ent_user",
    kind: "one-to-many",
    foreignKeyField: "managerId"
  });
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "SELF_REFERENCING_CYCLE"));
});

test("rejects non-nullable circular foreign keys between entities", () => {
  const ir = createValidBaseIR();
  // User -> Post (rel_user_posts) authorId is required
  // Now add required bestPostId on User referencing Post
  ir.entities[0]!.fields.push({
    id: "fld_user_bestPostId",
    name: "bestPostId",
    type: "uuid",
    required: true
  });
  ir.relations.push({
    id: "rel_post_user_best",
    fromEntityId: "ent_post",
    toEntityId: "ent_user",
    kind: "one-to-one",
    foreignKeyField: "bestPostId"
  });
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "CIRCULAR_REQUIRED_FK_CYCLE"));
});

test("rejects exceeding entity hard limit (50 entities)", () => {
  const ir = createValidBaseIR();
  for (let i = 3; i <= 55; i++) {
    ir.entities.push({
      id: `ent_${i}`,
      name: `Entity${i}`,
      tableName: `table_${i}`,
      fields: [
        {
          id: `fld_${i}_id`,
          name: "id",
          type: "uuid",
          required: true,
          isPrimaryKey: true
        }
      ]
    });
  }
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "LIMIT_MAX_ENTITIES" || e.rule.startsWith("SCHEMA_")));
});

test("rejects dangling endpoint entityId", () => {
  const ir = createValidBaseIR();
  ir.endpoints[0]!.entityId = "ent_nonexistent";
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "DANGLING_ENDPOINT_ENTITY"));
});

test("rejects empty endpoint ops", () => {
  const ir = createValidBaseIR();
  ir.endpoints[0]!.ops = [];
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "EMPTY_ENDPOINT_OPS"));
});

test("rejects invalid auth role identifier", () => {
  const ir = createValidBaseIR();
  ir.auth.roles = ["VALID_ROLE", "invalid role!"];
  const result = validateIR(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "VALID_IDENTIFIER" || e.rule.startsWith("SCHEMA_")));
});
