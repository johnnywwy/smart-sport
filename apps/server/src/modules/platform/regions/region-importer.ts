import { readFile } from "node:fs/promises";
import type pg from "pg";

type RegionSeed = {
  code: string;
  name: string;
  level: number;
  parentCode: string | null;
  path: string;
  status: number;
};

const header = "code,name,level,parent_code,path,status";

export async function readRegionSeeds(file: string) {
  const lines = (await readFile(file, "utf8")).trimEnd().split(/\r?\n/);
  if (lines.shift() !== header) throw new Error("区划 CSV 表头不正确");
  const seeds = lines.map((line, index) => parseLine(line, index + 2));
  validateTree(seeds);
  return seeds;
}

function parseLine(line: string, lineNumber: number): RegionSeed {
  const columns = line.split(",");
  if (columns.length !== 6)
    throw new Error(`区划 CSV 第 ${lineNumber} 行字段数错误`);
  const [
    code = "",
    name = "",
    levelText = "",
    parent = "",
    path = "",
    statusText = "",
  ] = columns;
  const level = Number(levelText);
  const status = Number(statusText);
  if (
    !/^\d{6}$/.test(code) ||
    !name ||
    ![1, 2, 3].includes(level) ||
    ![0, 1].includes(status)
  ) {
    throw new Error(`区划 CSV 第 ${lineNumber} 行内容错误`);
  }
  return { code, name, level, parentCode: parent || null, path, status };
}

function validateTree(seeds: RegionSeed[]) {
  const byCode = new Map(seeds.map((seed) => [seed.code, seed]));
  if (byCode.size !== seeds.length) throw new Error("区划 CSV 存在重复代码");
  for (const seed of seeds) {
    const parts = seed.path.split(".");
    if (parts.length !== seed.level || parts.at(-1) !== seed.code) {
      throw new Error(`区划 path 与层级不一致：${seed.code}`);
    }
    if (seed.level === 1 && seed.parentCode !== null) {
      throw new Error(`省级区划不能有父级：${seed.code}`);
    }
    if (seed.level > 1) {
      const parent = seed.parentCode && byCode.get(seed.parentCode);
      if (
        !parent ||
        parent.level !== seed.level - 1 ||
        !seed.path.startsWith(`${parent.path}.`)
      ) {
        throw new Error(`区划父级不完整：${seed.code}`);
      }
    }
  }
}

export async function importRegions(pool: pg.Pool, file: string) {
  const seeds = await readRegionSeeds(file);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1936749167, 30)");
    await client.query("UPDATE public.regions SET status = 0");
    for (const level of [1, 2, 3]) {
      for (const batch of chunks(
        seeds.filter((seed) => seed.level === level),
        300,
      )) {
        const values: unknown[] = [];
        const tuples = batch.map((seed, index) => {
          const offset = index * 6;
          values.push(
            seed.code,
            seed.name,
            seed.level,
            seed.parentCode,
            seed.path,
            seed.status,
          );
          return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6})`;
        });
        await client.query(
          `INSERT INTO public.regions (code,name,level,parent_code,path,status) VALUES ${tuples.join(",")} ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, level=EXCLUDED.level, parent_code=EXCLUDED.parent_code, path=EXCLUDED.path, status=EXCLUDED.status`,
          values,
        );
      }
    }
    await client.query("COMMIT");
    return seeds.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}
