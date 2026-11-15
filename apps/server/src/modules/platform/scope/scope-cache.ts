import {
  type DataScopeOption,
  type VisibleScope,
  visibleScopeSchema,
} from "@smart-sport/contracts";
import { Redis } from "ioredis";
import { z } from "zod";
import {
  containsSchool,
  readScope,
  writeScope,
} from "./scope-cache-scripts.js";

const entrySchema = z.object({
  revision: z.string(),
  storage: z.enum(["json", "set"]),
  count: z.int().nonnegative(),
  scope: visibleScopeSchema,
});
export type SchoolMembership = boolean | "all";

export class ScopeCache {
  private readonly redis: Redis;
  constructor(url: string) {
    this.redis = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 0,
    });
    this.redis.on("error", () => {});
  }
  private keys(id: string, option: DataScopeOption) {
    const key = `scope:${id}:${option}`;
    return ["ctx:database-revision", "ctx:revision", key, `${key}:schools`];
  }
  async read(
    id: string,
    option: DataScopeOption,
    revision: string,
  ): Promise<VisibleScope | undefined> {
    const result = await this.redis.eval(
      readScope,
      4,
      ...this.keys(id, option),
      revision,
    );
    const parsed = z.tuple([z.string(), z.array(z.string())]).safeParse(result);
    if (!parsed.success) return undefined;
    try {
      const entry = entrySchema.parse(JSON.parse(parsed.data[0]));
      if (entry.revision !== revision) return undefined;
      if (entry.storage === "set") {
        if (
          entry.scope.kind !== "schools" ||
          parsed.data[1].length !== entry.count
        )
          return undefined;
        return { kind: "schools", schoolIds: parsed.data[1].sort() };
      }
      return entry.scope;
    } catch {
      return undefined;
    }
  }
  async contains(
    id: string,
    option: DataScopeOption,
    revision: string,
    schoolId: string,
  ): Promise<SchoolMembership | undefined> {
    const result = await this.redis.eval(
      containsSchool,
      4,
      ...this.keys(id, option),
      revision,
      schoolId,
    );
    if (result === 2) return "all";
    if (result === 0 || result === 1) return result === 1;
    return undefined;
  }
  async write(
    id: string,
    option: DataScopeOption,
    revision: string,
    scope: VisibleScope,
  ) {
    const ids =
      scope.kind === "schools" && scope.schoolIds.length > 500
        ? scope.schoolIds
        : [];
    const entry = {
      revision,
      storage: ids.length ? "set" : "json",
      count: ids.length,
      scope: ids.length ? { kind: "schools", schoolIds: [] } : scope,
    };
    return (
      (await this.redis.eval(
        writeScope,
        4,
        ...this.keys(id, option),
        revision,
        JSON.stringify(entry),
        ...ids,
      )) === 1
    );
  }
  close() {
    this.redis.disconnect();
  }
}
