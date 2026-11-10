import { and, eq, getTableColumns, isNull, type SQL, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  AnyPgColumn,
  PgTable,
  PgUpdateSetSource,
} from "drizzle-orm/pg-core";
import { ApiException } from "../api-response.js";
import type { commonColumns } from "./common-columns.js";

type CommonField = keyof ReturnType<typeof commonColumns>;
type ManagedTable = PgTable & {
  id: AnyPgColumn<{ data: string }>;
  version: AnyPgColumn<{ data: number }>;
  deletedAt: AnyPgColumn;
  updatedAt: AnyPgColumn;
  updatedBy: AnyPgColumn;
};

type VersionedWrite = {
  id: string;
  version: number;
  actorId: string | null;
  scope: SQL;
};

const managedFields = new Set<CommonField>([
  "id",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
  "deletedAt",
  "version",
]);

export class Repository<T extends ManagedTable> {
  constructor(
    protected readonly db: Pick<NodePgDatabase, "select" | "update">,
    protected readonly table: T,
  ) {}

  private query(scope: SQL, includeDeleted: boolean, id?: string) {
    return this.db
      .select(getTableColumns(this.table))
      .from(this.table as PgTable)
      .where(
        and(
          scope,
          id === undefined ? undefined : eq(this.table.id, id),
          includeDeleted ? undefined : isNull(this.table.deletedAt),
        ),
      )
      .$dynamic();
  }

  async findMany(scope: SQL): Promise<T["$inferSelect"][]> {
    return (await this.query(scope, false).execute()) as T["$inferSelect"][];
  }

  private async readById(
    id: string,
    scope: SQL,
    includeDeleted: boolean,
  ): Promise<T["$inferSelect"] | undefined> {
    const rows = (await this.query(scope, includeDeleted, id)
      .limit(1)
      .execute()) as T["$inferSelect"][];
    return rows[0];
  }

  findById(id: string, scope: SQL) {
    return this.readById(id, scope, false);
  }

  withDeleted() {
    return {
      findMany: async (scope: SQL): Promise<T["$inferSelect"][]> =>
        (await this.query(scope, true).execute()) as T["$inferSelect"][],
      findById: (id: string, scope: SQL) => this.readById(id, scope, true),
    };
  }

  updateWithVersion(
    input: VersionedWrite,
    changes: Partial<Omit<T["$inferInsert"], CommonField>>,
  ) {
    const columns = getTableColumns(this.table);
    const patch = Object.fromEntries(
      Object.entries(changes).filter(
        ([key]) =>
          Object.hasOwn(columns, key) && !managedFields.has(key as CommonField),
      ),
    );
    return this.write(input, patch);
  }

  softDeleteWithVersion(input: VersionedWrite) {
    return this.write(input, { deletedAt: sql`now()` });
  }

  private async write(input: VersionedWrite, changes: Record<string, unknown>) {
    const patch = {
      ...changes,
      updatedAt: sql`now()`,
      updatedBy: input.actorId,
      version: sql`${this.table.version} + 1`,
    } as PgUpdateSetSource<T>;
    const rows = (await this.db
      .update(this.table)
      .set(patch)
      .where(
        and(
          input.scope,
          eq(this.table.id, input.id),
          eq(this.table.version, input.version),
          isNull(this.table.deletedAt),
        ),
      )
      .returning()
      .execute()) as T["$inferSelect"][];
    const [row] = rows;
    if (!row) throw new ApiException(90002);
    return row;
  }
}
