import test from "node:test";
import assert from "node:assert/strict";
import { computeSemanticHash, canonicalizeIR } from "./hash.js";
import { blogTemplate, shopTemplate, trackerTemplate } from "./templates/index.js";
import { IRDocument } from "./types.js";

function getTestIR(): IRDocument {
  return JSON.parse(JSON.stringify(blogTemplate));
}

test("computeSemanticHash returns a 64-character SHA-256 hex string", () => {
  const hash = computeSemanticHash(blogTemplate);
  assert.equal(typeof hash, "string");
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("starter templates have distinct semantic hashes", () => {
  const blogHash = computeSemanticHash(blogTemplate);
  const shopHash = computeSemanticHash(shopTemplate);
  const trackerHash = computeSemanticHash(trackerTemplate);

  assert.notEqual(blogHash, shopHash);
  assert.notEqual(shopHash, trackerHash);
  assert.notEqual(blogHash, trackerHash);
});

test("layout-hash invariance: moving node coordinates does NOT change semantic hash", () => {
  const irA = getTestIR();
  const irB = getTestIR();

  // Move node in irB
  if (irB.layout && irB.layout.nodes["ent_user"]) {
    irB.layout.nodes["ent_user"].x = 9999;
    irB.layout.nodes["ent_user"].y = -8888;
  }

  const hashA = computeSemanticHash(irA);
  const hashB = computeSemanticHash(irB);

  assert.equal(hashA, hashB, "Hash must be invariant to layout x/y changes");
});

test("layout-hash invariance: changing node colors or adding nodes does NOT change semantic hash", () => {
  const irA = getTestIR();
  const irB = getTestIR();

  if (irB.layout) {
    if (irB.layout.nodes["ent_user"]) {
      irB.layout.nodes["ent_user"].color = "#ff0000";
    }
    irB.layout.nodes["ent_new_scratch"] = { x: 50, y: 50, color: "blue" };
  }

  const hashA = computeSemanticHash(irA);
  const hashB = computeSemanticHash(irB);

  assert.equal(hashA, hashB, "Hash must be invariant to layout color and new nodes");
});

test("layout-hash invariance: omitting layout entirely does NOT change semantic hash", () => {
  const irA = getTestIR();
  const irB = getTestIR();

  delete irB.layout;

  const hashA = computeSemanticHash(irA);
  const hashB = computeSemanticHash(irB);

  assert.equal(hashA, hashB, "Hash must be identical whether layout is present or omitted");
});

test("key ordering invariance: reordering object keys does NOT change semantic hash", () => {
  const irA = getTestIR();
  // Create object with keys in reverse order
  const irB: any = {
    auth: irA.auth,
    endpoints: irA.endpoints,
    relations: irA.relations,
    entities: irA.entities,
    project: {
      database: irA.project.database,
      name: irA.project.name
    },
    irVersion: irA.irVersion
  };

  const hashA = computeSemanticHash(irA);
  const hashB = computeSemanticHash(irB);

  assert.equal(hashA, hashB, "Hash must be invariant to key order");
});

test("array ordering invariance: reordering entities array does NOT change semantic hash", () => {
  const irA = getTestIR();
  const irB = getTestIR();

  // Reverse entities array
  irB.entities = [...irB.entities].reverse();

  const hashA = computeSemanticHash(irA);
  const hashB = computeSemanticHash(irB);

  assert.equal(hashA, hashB, "Hash must be invariant to entities array order because IDs are sorted");
});

test("array ordering invariance: reordering fields array does NOT change semantic hash", () => {
  const irA = getTestIR();
  const irB = getTestIR();

  // Reverse fields array of first entity
  irB.entities[0]!.fields = [...irB.entities[0]!.fields].reverse();

  const hashA = computeSemanticHash(irA);
  const hashB = computeSemanticHash(irB);

  assert.equal(hashA, hashB, "Hash must be invariant to fields array order");
});

test("semantic sensitivity: modifying entity name changes semantic hash", () => {
  const irA = getTestIR();
  const irB = getTestIR();

  irB.entities[0]!.name = "Author";

  const hashA = computeSemanticHash(irA);
  const hashB = computeSemanticHash(irB);

  assert.notEqual(hashA, hashB, "Modifying entity name must alter hash");
});

test("semantic sensitivity: adding a field changes semantic hash", () => {
  const irA = getTestIR();
  const irB = getTestIR();

  irB.entities[0]!.fields.push({
    id: "fld_user_bio",
    name: "bio",
    type: "string",
    required: false
  });

  const hashA = computeSemanticHash(irA);
  const hashB = computeSemanticHash(irB);

  assert.notEqual(hashA, hashB, "Adding a field must alter hash");
});

test("semantic sensitivity: modifying relation onDelete changes semantic hash", () => {
  const irA = getTestIR();
  const irB = getTestIR();

  irB.relations[0]!.onDelete = "RESTRICT";

  const hashA = computeSemanticHash(irA);
  const hashB = computeSemanticHash(irB);

  assert.notEqual(hashA, hashB, "Changing relation onDelete must alter hash");
});

test("canonicalizeIR excludes layout", () => {
  const ir = getTestIR();
  const canonical = canonicalizeIR(ir);

  assert.equal("layout" in canonical, false);
});
