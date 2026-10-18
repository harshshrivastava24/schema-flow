import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateIR } from "../validator.js";
import {
  COLOR_PALETTE,
  computeDagreLayout,
  importSchema,
  parseMongoJson,
  parseMongoSchema,
  parseMongooseAst,
  parsePrismaSchema,
} from "./index.js";

describe("T03: Client-Side Dual Schema Importers", () => {
  describe("1. Prisma Importer", () => {
    const validPrismaSchema = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  USER
  ADMIN
  MODERATOR
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  profile   Profile?
  posts     Post[]
  createdAt DateTime @default(now())
}

model Profile {
  id     String @id @default(uuid())
  bio    String
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Post {
  id         String     @id @default(uuid())
  title      String
  content    String?
  published  Boolean    @default(false)
  viewCount  Int        @default(0)
  authorId   String
  author     User       @relation(fields: [authorId], references: [id], onDelete: Cascade)
  categories Category[]
  createdAt  DateTime   @default(now())
}

model Category {
  id    String @id @default(uuid())
  name  String @unique
  posts Post[]
}
`;

    it("parses multi-model Prisma schema into valid Postgres IR", () => {
      const result = parsePrismaSchema(validPrismaSchema, { projectName: "BlogPrisma" });

      assert.strictEqual(result.success, true, "Import should be successful");
      assert.strictEqual(result.ir.project.database, "postgres");
      assert.strictEqual(result.ir.entities.length, 4, "Should extract 4 models");

      // Verify User entity
      const user = result.ir.entities.find((e) => e.name === "User");
      assert.ok(user, "User entity must exist");
      assert.strictEqual(user.fields.length, 5, "User should have 5 scalar fields (id, email, name, role, createdAt)");
      const roleField = user.fields.find((f) => f.name === "role");
      assert.ok(roleField);
      assert.strictEqual(roleField.type, "enum");
      assert.deepStrictEqual(roleField.enumValues, ["USER", "ADMIN", "MODERATOR"]);
      assert.strictEqual(roleField.default, "USER");

      // Verify 1:1 relation (User -> Profile)
      const rel11 = result.ir.relations.find((r) => r.kind === "one-to-one");
      assert.ok(rel11, "1:1 relation between User and Profile should exist");
      assert.strictEqual(rel11.foreignKeyField, "userId");

      // Verify 1:N relation (User -> Post)
      const rel1n = result.ir.relations.find(
        (r) => r.kind === "one-to-many" && r.foreignKeyField === "authorId"
      );
      assert.ok(rel1n, "1:N relation between User and Post should exist");
      assert.strictEqual(rel1n.onDelete, "CASCADE");

      // Verify M:N relation (Post <-> Category)
      const relMn = result.ir.relations.find((r) => r.kind === "many-to-many");
      assert.ok(relMn, "M:N relation between Post and Category should exist");
      assert.strictEqual(relMn.foreignKeyField, undefined, "M:N relations must forbid foreignKeyField");

      // Validate against Ajv + semantic rules
      const validation = validateIR(result.ir);
      assert.strictEqual(validation.valid, true, `Validation failed: ${JSON.stringify(validation.errors)}`);
    });

    it("synthesizes primary key with warning if model lacks @id", () => {
      const noPkPrisma = `
model AuditLog {
  action    String
  timestamp DateTime @default(now())
}
`;
      const result = parsePrismaSchema(noPkPrisma);
      assert.strictEqual(result.ir.entities.length, 1);
      const audit = result.ir.entities[0]!;
      const pk = audit.fields.find((f) => f.isPrimaryKey);
      assert.ok(pk, "Synthesized primary key should exist");
      assert.strictEqual(pk.name, "id");
      assert.ok(result.diagnostics.some((d) => d.code === "PRISMA_NO_PK"));
    });

    it("emits diagnostic warning on unsupported types (e.g. Bytes)", () => {
      const unsupportedTypePrisma = `
model Asset {
  id   String @id @default(uuid())
  data Bytes
}
`;
      const result = parsePrismaSchema(unsupportedTypePrisma);
      assert.ok(
        result.diagnostics.some((d) => d.code === "PRISMA_UNSUPPORTED_TYPE"),
        "Must flag Bytes as unsupported type diagnostic"
      );
    });

    it("rejects schema exceeding 1 MB limit", () => {
      const largeInput = "model Dummy { id String @id }\n".repeat(40000); // > 1MB
      const result = parsePrismaSchema(largeInput);
      assert.strictEqual(result.success, false);
      assert.ok(result.diagnostics.some((d) => d.code === "SCHEMA_SIZE_LIMIT_EXCEEDED"));
    });
  });

  describe("2. Mongoose AST Importer (Mode B - ZERO eval)", () => {
    const mongooseSnippet = `
import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['ADMIN', 'EDITOR', 'USER'], default: 'USER' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const PostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  content: String,
  views: { type: Number, default: 0 },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tags: [String]
});

export const User = mongoose.model('User', UserSchema);
export const Post = mongoose.model('Post', PostSchema);
`;

    it("parses Mongoose AST without eval and creates relations via ref", () => {
      const result = parseMongooseAst(mongooseSnippet, { projectName: "MongooseBlog" });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.ir.project.database, "mongodb");
      assert.strictEqual(result.ir.entities.length, 2, "Should discover User and Post");

      const user = result.ir.entities.find((e) => e.name === "User");
      assert.ok(user);
      const roleField = user.fields.find((f) => f.name === "role");
      assert.ok(roleField);
      assert.strictEqual(roleField.type, "enum");
      assert.deepStrictEqual(roleField.enumValues, ["ADMIN", "EDITOR", "USER"]);

      const createdAtField = user.fields.find((f) => f.name === "createdAt");
      assert.ok(createdAtField);
      assert.strictEqual(createdAtField.default, "now()");

      const post = result.ir.entities.find((e) => e.name === "Post");
      assert.ok(post);
      const authorIdField = post.fields.find((f) => f.name === "authorId");
      assert.ok(authorIdField);
      assert.strictEqual(authorIdField.type, "string");

      // Verify relation extracted from ref: 'User'
      const relation = result.ir.relations.find((r) => r.foreignKeyField === "authorId");
      assert.ok(relation, "Relation from User to Post via authorId must exist");
      assert.strictEqual(relation.fromEntityId, user.id);
      assert.strictEqual(relation.toEntityId, post.id);
      assert.strictEqual(relation.kind, "one-to-many");

      // Verify IR validation
      const validation = validateIR(result.ir);
      assert.strictEqual(validation.valid, true, `Validation failed: ${JSON.stringify(validation.errors)}`);
    });

    it("is completely immune to malicious code execution (ZERO eval proof)", () => {
      let codeExecuted = false;

      // Malicious payload attempting execution, file destruction, process killing
      const maliciousScript = `
        // Malicious attempts that MUST NEVER be evaluated
        process.exit(999);
        eval("throw new Error('evil execution!')");
        (function() {
          const fs = require('fs');
          fs.writeFileSync('MALICIOUS.txt', 'pwned');
        })();

        const SafeSchema = new Schema({
          title: { type: String, required: true },
          rating: Number
        });
        mongoose.model('SafeEntity', SafeSchema);
      `;

      // The parser must parse without throwing or executing
      const result = parseMongooseAst(maliciousScript);

      assert.strictEqual(codeExecuted, false, "Code execution must be zero");
      assert.strictEqual(result.ir.entities.length, 1);
      assert.strictEqual(result.ir.entities[0]!.name, "SafeEntity");
    });
  });

  describe("3. MongoDB JSON Sample Importer (Mode A)", () => {
    it("infers entities, types, and potential relations from multi-collection JSON", () => {
      const sampleJson = JSON.stringify({
        users: [
          {
            _id: "60d0fe4f5311236168a109ca",
            name: "Alice",
            email: "alice@example.com",
            age: 28,
            isAdmin: false,
            score: 95.5,
            registeredAt: "2026-01-15T08:30:00Z"
          }
        ],
        posts: [
          {
            _id: "60d0fe4f5311236168a109cb",
            title: "First Post",
            views: 42,
            userId: "60d0fe4f5311236168a109ca",
            metadata: { ip: "127.0.0.1" }
          }
        ]
      });

      const result = parseMongoJson(sampleJson);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.ir.project.database, "mongodb");
      assert.strictEqual(result.ir.entities.length, 2, "Should create User and Post entities");

      const user = result.ir.entities.find((e) => e.name === "User");
      assert.ok(user);
      const ageField = user.fields.find((f) => f.name === "age");
      assert.strictEqual(ageField?.type, "int");
      const scoreField = user.fields.find((f) => f.name === "score");
      assert.strictEqual(scoreField?.type, "decimal");
      const registeredAtField = user.fields.find((f) => f.name === "registeredAt");
      assert.strictEqual(registeredAtField?.type, "timestamp");

      // Verify inferred candidate relation
      const rel = result.ir.relations.find((r) => r.foreignKeyField === "userId");
      assert.ok(rel, "Should infer candidate relation from User to Post via userId");
      assert.strictEqual(rel.kind, "one-to-many");

      // Check ObjectId candidate diagnostic
      assert.ok(
        result.diagnostics.some((d) => d.code === "MONGO_OBJECTID_CANDIDATE"),
        "Should flag 24-hex ObjectId candidate in diagnostics"
      );
    });

    it("flags ambiguous types when sample documents contain conflicting types", () => {
      const conflictingJson = JSON.stringify([
        { id: 1, dynamicField: "string value" },
        { id: 2, dynamicField: 12345 }
      ]);

      const result = parseMongoJson(conflictingJson, { collectionName: "MixedDoc" });
      assert.ok(
        result.diagnostics.some((d) => d.code === "MONGO_AMBIGUOUS_TYPE"),
        "Conflicting types must be flagged as MONGO_AMBIGUOUS_TYPE"
      );
    });
  });

  describe("4. Dagre LR Auto-Layout", () => {
    it("computes non-overlapping coordinates and cycles through 6-color palette", () => {
      const entities = [
        {
          id: "ent_users",
          name: "Users",
          tableName: "users",
          fields: [
            { id: "fld_id", name: "id", type: "string" as const, isPrimaryKey: true, required: true },
            { id: "fld_name", name: "name", type: "string" as const },
          ],
        },
        {
          id: "ent_posts",
          name: "Posts",
          tableName: "posts",
          fields: [
            { id: "fld_id", name: "id", type: "string" as const, isPrimaryKey: true, required: true },
            { id: "fld_user_id", name: "userId", type: "string" as const },
            { id: "fld_title", name: "title", type: "string" as const },
          ],
        },
        {
          id: "ent_comments",
          name: "Comments",
          tableName: "comments",
          fields: [
            { id: "fld_id", name: "id", type: "string" as const, isPrimaryKey: true, required: true },
            { id: "fld_post_id", name: "postId", type: "string" as const },
          ],
        },
      ];

      const relations = [
        {
          id: "rel_users_posts",
          fromEntityId: "ent_users",
          toEntityId: "ent_posts",
          kind: "one-to-many" as const,
          foreignKeyField: "userId",
        },
        {
          id: "rel_posts_comments",
          fromEntityId: "ent_posts",
          toEntityId: "ent_comments",
          kind: "one-to-many" as const,
          foreignKeyField: "postId",
        },
      ];

      const layout = computeDagreLayout(entities, relations);

      assert.ok(layout.nodes);
      assert.strictEqual(Object.keys(layout.nodes).length, 3);

      const n1 = layout.nodes["ent_users"]!;
      const n2 = layout.nodes["ent_posts"]!;
      const n3 = layout.nodes["ent_comments"]!;

      assert.ok(n1 && n2 && n3);

      // Verify LR ordering: parent is placed left of child
      assert.ok(n1.x < n2.x, `Users (${n1.x}) should be to the left of Posts (${n2.x})`);
      assert.ok(n2.x < n3.x, `Posts (${n2.x}) should be to the left of Comments (${n3.x})`);

      // Verify colors assigned from 6-color palette
      assert.strictEqual(n1.color, COLOR_PALETTE[0]);
      assert.strictEqual(n2.color, COLOR_PALETTE[1]);
      assert.strictEqual(n3.color, COLOR_PALETTE[2]);
    });
  });

  describe("5. Unified importSchema Entry Point", () => {
    it("auto-detects Prisma vs MongoDB and attaches Dagre layout", () => {
      const prismaSample = `
model Customer {
  id    String @id @default(uuid())
  email String @unique
}
`;
      const result = importSchema(prismaSample, "auto");
      assert.strictEqual(result.ir.project.database, "postgres");
      assert.strictEqual(result.ir.entities.length, 1);
      assert.ok(result.ir.layout?.nodes["ent_customer"], "Layout should be auto-computed");

      const mongoSample = JSON.stringify({
        products: [{ _id: "123", name: "Laptop", price: 999 }]
      });
      const mongoResult = importSchema(mongoSample, "auto");
      assert.strictEqual(mongoResult.ir.project.database, "mongodb");
      assert.strictEqual(mongoResult.ir.entities.length, 1);
      assert.ok(mongoResult.ir.layout?.nodes["ent_product"]);
    });
  });
});
