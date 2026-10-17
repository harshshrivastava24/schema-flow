import assert from "node:assert";
import test from "node:test";
import { IR_VERSION } from "./index.js";

test("ir-schema exports valid IR_VERSION 1.0", () => {
  assert.strictEqual(IR_VERSION, "1.0");
});
