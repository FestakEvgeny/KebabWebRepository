/**
 * The `embedded-postgres` package is ESM-only and ships no usable types for
 * CommonJS consumers; this ambient declaration types the API surface used by
 * src/database/dev-db.ts.
 */
declare module 'embedded-postgres' {
  interface EmbeddedPostgresOptions {
    databaseDir: string;
    user: string;
    password: string;
    port: number;
    persistent?: boolean;
  }

  export default class EmbeddedPostgres {
    constructor(options: EmbeddedPostgresOptions);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(database: string): Promise<void>;
  }
}
