export const IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
export const ENUM_VALUE_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

export const MAX_ENTITIES = 50;
export const MAX_FIELDS_PER_ENTITY = 100;
export const MAX_SCHEMA_SIZE_BYTES = 1024 * 1024; // 1 MB

export const SQL_RESERVED_WORDS = new Set([
  "ALL", "ALTER", "AND", "ANY", "AS", "ASC", "BETWEEN", "CASE", "CHECK",
  "COLUMN", "CONSTRAINT", "CREATE", "DATABASE", "DEFAULT", "DELETE", "DESC",
  "DISTINCT", "DROP", "ELSE", "EXISTS", "FOREIGN", "FROM", "GRANT",
  "HAVING", "IN", "INDEX", "INSERT", "INTO", "IS", "JOIN",
  "LIKE", "LIMIT", "NOT", "NULL", "OFFSET", "ON", "OR", "PRIMARY",
  "REFERENCES", "REVOKE", "SELECT", "SET", "TABLE", "THEN", "UNION",
  "UNIQUE", "UPDATE", "VALUES", "VIEW", "WHEN", "WHERE", "WITH"
]);

export const MONGO_RESERVED_WORDS = new Set([
  "_id", "$*", "__v", "id" // note: id can be used as field name in relational, but _id is strictly Mongo internal
]);

export const JS_TS_RESERVED_WORDS = new Set([
  "await", "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "implements", "import", "in",
  "instanceof", "interface", "let", "new", "null", "package", "private",
  "protected", "public", "return", "static", "super", "switch", "this",
  "throw", "true", "try", "typeof", "var", "void", "while", "with", "yield"
]);

export const PYTHON_RESERVED_WORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break",
  "class", "continue", "def", "del", "elif", "else", "except", "finally",
  "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
  "not", "or", "pass", "raise", "return", "try", "while", "with", "yield"
]);

export const GO_RESERVED_WORDS = new Set([
  "break", "case", "chan", "const", "continue", "default", "defer", "else",
  "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
  "map", "package", "range", "return", "select", "struct", "switch", "type",
  "var"
]);

// Combined lower-case lookup for checking identifier keywords
export const ALL_RESERVED_IDENTIFIERS = new Set<string>();

for (const set of [SQL_RESERVED_WORDS, JS_TS_RESERVED_WORDS, PYTHON_RESERVED_WORDS, GO_RESERVED_WORDS]) {
  for (const word of set) {
    ALL_RESERVED_IDENTIFIERS.add(word.toLowerCase());
  }
}
ALL_RESERVED_IDENTIFIERS.add("_id");
ALL_RESERVED_IDENTIFIERS.add("__v");

export function isValidIdentifier(name: string): boolean {
  return IDENTIFIER_REGEX.test(name);
}

export function isValidEnumValue(val: string): boolean {
  return ENUM_VALUE_REGEX.test(val);
}

export function isReservedWord(word: string): boolean {
  return ALL_RESERVED_IDENTIFIERS.has(word.toLowerCase());
}

export function isAllowedDefault(
  defaultValue: unknown,
  fieldType: string,
  enumValues?: string[]
): { allowed: boolean; reason?: string } {
  if (defaultValue === undefined || defaultValue === null) {
    return { allowed: true };
  }

  // Expression functions
  if (defaultValue === "uuid()") {
    if (fieldType === "uuid" || fieldType === "string") {
      return { allowed: true };
    }
    return { allowed: false, reason: `Default 'uuid()' is not compatible with field type '${fieldType}'` };
  }

  if (defaultValue === "now()") {
    if (fieldType === "timestamp") {
      return { allowed: true };
    }
    return { allowed: false, reason: `Default 'now()' is not compatible with field type '${fieldType}'` };
  }

  // Type-specific checks
  switch (fieldType) {
    case "bool":
      if (typeof defaultValue === "boolean" || defaultValue === "true" || defaultValue === "false") {
        return { allowed: true };
      }
      return { allowed: false, reason: `Default '${String(defaultValue)}' is not a valid boolean literal` };

    case "int":
      if (typeof defaultValue === "number" && Number.isInteger(defaultValue)) {
        return { allowed: true };
      }
      if (typeof defaultValue === "string" && /^-?\d+$/.test(defaultValue)) {
        return { allowed: true };
      }
      return { allowed: false, reason: `Default '${String(defaultValue)}' is not a valid integer` };

    case "decimal":
      if (typeof defaultValue === "number" && !Number.isNaN(defaultValue)) {
        return { allowed: true };
      }
      if (typeof defaultValue === "string" && /^-?\d+(\.\d+)?$/.test(defaultValue)) {
        return { allowed: true };
      }
      return { allowed: false, reason: `Default '${String(defaultValue)}' is not a valid decimal literal` };

    case "string":
      if (typeof defaultValue === "string") {
        // Disallow dangerous SQL / command injection chars in defaults
        if (/["';\-\-]|(\/\*)|(\*\/)/.test(defaultValue)) {
          return { allowed: false, reason: `Default string contains forbidden SQL/code injection characters` };
        }
        return { allowed: true };
      }
      return { allowed: false, reason: `Default '${String(defaultValue)}' is not a string` };

    case "uuid":
      if (typeof defaultValue === "string" && /^[0-9a-fA-F-]{36}$/.test(defaultValue)) {
        return { allowed: true };
      }
      return { allowed: false, reason: `Default '${String(defaultValue)}' is not a valid UUID format` };

    case "enum":
      if (typeof defaultValue === "string") {
        if (!enumValues || enumValues.length === 0) {
          return { allowed: false, reason: `Field has no enum values defined` };
        }
        if (!enumValues.includes(defaultValue)) {
          return { allowed: false, reason: `Default '${defaultValue}' is not one of enum values: [${enumValues.join(", ")}]` };
        }
        return { allowed: true };
      }
      return { allowed: false, reason: `Default enum value must be a string` };

    case "json":
      if (typeof defaultValue === "string") {
        try {
          JSON.parse(defaultValue);
          return { allowed: true };
        } catch {
          return { allowed: false, reason: `Default JSON string is not valid JSON` };
        }
      }
      return { allowed: true };

    default:
      return { allowed: false, reason: `Unsupported field type '${fieldType}' for default value` };
  }
}
