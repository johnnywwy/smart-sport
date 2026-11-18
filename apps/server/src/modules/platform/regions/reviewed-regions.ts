import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { regionSyncPreviewSchema } from "@smart-sport/contracts";
import { parseRegionSeeds } from "./region-importer.js";
/** 只加载发布包中的审核文件，客户端不能选择路径或提交脚本。 */
export async function reviewedRegions() {
  const file = new URL(
    "../../../../../../deploy/seed/regions.csv",
    import.meta.url,
  );
  const source = regionSyncPreviewSchema.shape.source.parse(
    JSON.parse(
      await readFile(
        new URL(
          "../../../../../../deploy/seed/regions.review.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const bytes = await readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== source.checksum)
    throw new Error("区划审核文件校验失败");
  const seeds = parseRegionSeeds(bytes.toString("utf8"));
  return { source, seeds };
}
