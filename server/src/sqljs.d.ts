declare module "sql.js" {
  export interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }
  export interface Statement {
    bind(values: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }
  export default function initSqlJs(config?: unknown): Promise<{ Database: new (data?: BufferSource) => Database }>;
}
