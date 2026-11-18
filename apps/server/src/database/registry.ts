import type { DatabaseConfig } from "@smart-sport/config/env";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

export const DRIZZLE = Symbol("DRIZZLE");

export class DataSourceRegistry {
  private readonly sources = new Map<string, string>();
  private readonly connections = new Map<
    string,
    { pool: pg.Pool; db: NodePgDatabase }
  >();
  private closing: Promise<void> | undefined;

  constructor(config: DatabaseConfig) {
    this.sources.set("default", config.DATABASE_URL);
    for (const [key, url] of Object.entries(config.EXTRA_DATASOURCES)) {
      this.sources.set(key, url);
    }
  }

  /** 配置键不含连接串，供逐数据源迁移和投递。 */
  keys() {
    return [...this.sources.keys()];
  }

  get(key = "default") {
    if (this.closing) throw new Error("数据源已关闭");
    const existing = this.connections.get(key);
    if (existing) return existing;
    const connectionString = this.sources.get(key);
    if (!connectionString) throw new Error("未配置的数据源");
    const pool = new pg.Pool({
      connectionString,
      connectionTimeoutMillis: 2000,
    });
    pool.on("error", () =>
      console.error("PostgreSQL 空闲连接异常，连接池已移除该连接"),
    );
    const source = { pool, db: drizzle(pool) };
    this.connections.set(key, source);
    return source;
  }

  onApplicationShutdown() {
    this.closing ??= Promise.all(
      [...this.connections.values()].map(({ pool }) => pool.end()),
    ).then(() => undefined);
    return this.closing;
  }
}
