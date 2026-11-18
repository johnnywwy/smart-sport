import { loadProvisionCommandConfig } from "@smart-sport/config/env";
import {
  DataSourceRegistry,
  ProvisionRepository,
  provisionJobSchema,
  provisionQueue,
} from "@smart-sport/server";
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";

async function main() {
  const config = loadProvisionCommandConfig();
  const [schoolId, ...rest] = process.argv.slice(2);
  const all = schoolId === "--all";
  let datasource: string | undefined;
  if (rest.length) {
    if (all || rest.length !== 2 || rest[0] !== "--datasource") {
      throw new Error(
        "用法：tenant:provision <学校UUID> [--datasource 数据源] 或 tenant:backfill",
      );
    }
    datasource = rest[1];
  }
  if (!all) provisionJobSchema.parse({ schoolId, datasource });
  const sources = new DataSourceRegistry(config);
  const connection = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
  });
  connection.on("error", () => {});
  let queue: Queue | undefined;
  let events: QueueEvents | undefined;
  try {
    if (datasource) sources.get(datasource);
    const ids = all
      ? await new ProvisionRepository(sources.get().db).candidates()
      : [schoolId as string];
    if (!ids.length) {
      console.log("无需补开通的学校");
      return;
    }
    await connection.connect();
    queue = new Queue(provisionQueue, {
      connection,
      prefix: config.WORKER_QUEUE_PREFIX,
    });
    events = new QueueEvents(provisionQueue, {
      connection: {
        url: config.REDIS_URL,
        maxRetriesPerRequest: null,
        connectTimeout: 3000,
      },
      prefix: config.WORKER_QUEUE_PREFIX,
    });
    events.on("error", () => {});
    await events.waitUntilReady();
    let failed = 0;
    // 逐校投递并等待实际完成；每次调用生成新任务，学校锁及迁移历史实现幂等。
    for (const id of ids) {
      try {
        const job = await queue.add(
          "provision",
          provisionJobSchema.parse({ schoolId: id, datasource }),
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 1000 },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 100 },
          },
        );
        await job.waitUntilFinished(events, 120000);
        console.log(`学校 ${id}：开通完成`);
      } catch {
        failed++;
        console.error(
          `学校 ${id}：未能确认开通成功，请检查worker及失败记录后重试`,
        );
      }
    }
    console.log(`学校开通：共${ids.length}所，未确认成功${failed}所`);
    if (failed) process.exitCode = 1;
  } finally {
    await events?.close();
    await queue?.close();
    connection.disconnect();
    await sources.onApplicationShutdown();
  }
}

try {
  await main();
} catch {
  console.error("学校开通命令失败：仅限开发/测试，请检查参数、配置及队列连接");
  process.exitCode = 1;
}
