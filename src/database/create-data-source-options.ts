export interface CreateDataSourceOptions {
  /** Run pending migrations during initialize(). Defaults to RUN_MIGRATIONS_ON_START. */
  migrationsRun?: boolean;
}
