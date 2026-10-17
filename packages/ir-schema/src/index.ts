export const IR_VERSION = "1.0";

export type DatabaseType = "postgres" | "mongodb";

export interface ProjectConfig {
  name: string;
  database: DatabaseType;
}

export interface IRDocument {
  irVersion: string;
  project: ProjectConfig;
  entities: unknown[];
  relations: unknown[];
  endpoints: unknown[];
  auth: {
    enabled: boolean;
    strategy: string;
    roles: string[];
  };
}
