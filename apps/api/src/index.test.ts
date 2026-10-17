import assert from "node:assert";
import test from "node:test";
import { getStatus, API_VERSION } from "./index.js";

test("getStatus returns healthy status and API version", () => {
  const status = getStatus();
  assert.strictEqual(status.status, "ok");
  assert.strictEqual(status.apiVersion, API_VERSION);
  assert.strictEqual(status.irVersion, "1.0");
});
