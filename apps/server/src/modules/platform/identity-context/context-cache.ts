import { Redis } from "ioredis";

const revisionKey = "ctx:revision";
const channel = "ctx:invalidate";
const writeCurrent = `
  local current = (redis.call('GET', KEYS[1]) or '0') .. ':' .. (redis.call('GET', KEYS[2]) or '0')
  if current ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[3], ARGV[2], 'EX', 600)
  return 1
`;

/** 不保留进程内权限副本；所有实例通过同一版本屏障拒绝失效后的回填。 */
export class ContextCache {
  private readonly redis: Redis;
  private readonly subscriber: Redis;

  constructor(url: string) {
    this.redis = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 0,
    });
    this.subscriber = this.redis.duplicate();
    this.redis.on("error", () => {});
    this.subscriber.on("error", () => {});
    this.subscriber.on("message", () => {
      // 清理失败不影响版本屏障；剩余旧值也会在 TTL 到期后删除。
      void this.prune().catch(() => {});
    });
  }

  async subscribe() {
    await this.subscriber.subscribe(channel);
  }

  async observeDatabaseRevision(version: string) {
    await this.redis.eval(
      `
      local old = redis.call('GET', KEYS[1])
      if not old or tonumber(old) < tonumber(ARGV[1]) then
        redis.call('SET', KEYS[1], ARGV[1])
        redis.call('PUBLISH', ARGV[2], ARGV[1])
      end
      return 1
    `,
      1,
      "ctx:database-revision",
      version,
      channel,
    );
  }

  private async prune() {
    let cursor = "0";
    do {
      const page = await this.redis.scan(
        cursor,
        "MATCH",
        "ctx:*",
        "COUNT",
        100,
      );
      cursor = page[0];
      for (const key of page[1]) {
        if (!/^ctx:[0-9a-f-]{36}$/.test(key)) continue;
        // 与新缓存写入原子互斥，迟到的广播不能删除新版本。
        await this.redis.eval(
          `
          local raw = redis.call('GET', KEYS[1])
          if not raw then return 0 end
          local ok, value = pcall(cjson.decode, raw)
          local current = (redis.call('GET', KEYS[2]) or '0') .. ':' .. (redis.call('GET', KEYS[3]) or '0')
          if not ok or value.revision ~= current then return redis.call('UNLINK', KEYS[1]) end
          return 0
        `,
          3,
          key,
          "ctx:database-revision",
          revisionKey,
        );
      }
    } while (cursor !== "0");
  }

  async revision() {
    return (await this.redis.get(revisionKey)) ?? "0";
  }

  async read(identityId: string, revision: string): Promise<unknown> {
    const raw = await this.redis.get(`ctx:${identityId}`);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      return value.revision === revision ? value.context : null;
    } catch {
      return null;
    }
  }

  async write(identityId: string, revision: string, context: unknown) {
    return (
      (await this.redis.eval(
        writeCurrent,
        3,
        "ctx:database-revision",
        revisionKey,
        `ctx:${identityId}`,
        revision,
        JSON.stringify({ revision, context }),
      )) === 1
    );
  }

  async invalidate(identityIds: string[] = []) {
    // 先推进屏障，加载中的旧结果就无法重新写回。全局失效不使用 KEYS 阻塞 Redis。
    await this.redis.incr(revisionKey);
    if (identityIds.length)
      await this.redis.del(...identityIds.map((id) => `ctx:${id}`));
    await this.redis.publish(channel, JSON.stringify({ identityIds }));
  }

  async close() {
    this.subscriber.disconnect();
    this.redis.disconnect();
  }
}
