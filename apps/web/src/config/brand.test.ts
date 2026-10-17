import assert from "node:assert";
import test from "node:test";
import { APP_NAME } from "./brand.js";

test("APP_NAME defaults to BackendGen or environment variable", () => {
  assert.ok(typeof APP_NAME === "string");
  assert.ok(APP_NAME.length > 0);
  assert.strictEqual(APP_NAME, "BackendGen");
});
