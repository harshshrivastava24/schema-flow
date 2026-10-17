import { IR_VERSION } from "@schemaflow/ir-schema";

export const API_VERSION = "0.1.0";

export function getStatus() {
  return {
    status: "ok",
    apiVersion: API_VERSION,
    irVersion: IR_VERSION
  };
}

console.log(`[API] Initialized SchemaFlow API v${API_VERSION} (IR v${IR_VERSION})`);
