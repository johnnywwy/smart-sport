import { readFile } from "node:fs/promises";
import type { Region } from "@smart-sport/contracts";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { RegionManagementRepository } from "./region-management.repository.js";
import { regionSyncPlan } from "./region-sync-plan.js";

type RegionSeed = {
  code: string;
  name: string;
  level: Region["level"];
  parentCode: string | null;
  path: string;
  status: number;
};

const header = "code,name,level,parent_code,path,status";

export async function readRegionSeeds(file: string | URL) {
  return parseRegionSeeds(await readFile(file, "utf8"));
}
export function parseRegionSeeds(text: string) {
  const lines = text.trimEnd().split(/\r?\n/);
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
  return {
    code,
    name,
    level: level as Region["level"],
    parentCode: parent || null,
    path,
    status,
  };
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
        (seed.status === 1 && parent.status !== 1) ||
        parent.level !== seed.level - 1 ||
        !seed.path.startsWith(`${parent.path}.`)
      ) {
        throw new Error(`区划父级不完整：${seed.code}`);
      }
    }
  }
}

export async function importRegions(pool: pg.Pool, file: string | URL) {
  const seeds = await readRegionSeeds(file);
  const repository = new RegionManagementRepository(drizzle(pool));
  return repository.transaction(async (tx) => {
    await repository.lock(tx);
    const snapshot = await repository.snapshot(tx);
    if (regionSyncPlan(snapshot.rows, seeds, snapshot.references).blocked)
      throw new Error("区划变更影响现有组织或负责范围，请先处理关联");
    await repository.apply(tx, seeds);
    return seeds.length;
  });
}
