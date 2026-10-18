import type { DatabaseType, IRDocument } from "../types.js";

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface ImporterDiagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  line?: number;
  column?: number;
  entity?: string;
  field?: string;
  suggestion?: string;
}

export interface ImporterOptions {
  projectName?: string;
  layout?: boolean;
  generateEndpoints?: boolean;
  defaultDatabase?: DatabaseType;
  collectionName?: string;
}

export interface ImportStats {
  entityCount: number;
  relationCount: number;
  fieldCount: number;
  parseTimeMs: number;
}

export interface ImportResult {
  success: boolean;
  ir: IRDocument;
  diagnostics: ImporterDiagnostic[];
  stats: ImportStats;
}
