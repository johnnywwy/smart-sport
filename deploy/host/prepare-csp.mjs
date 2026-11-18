import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const web = resolve(process.argv[2] ?? "apps/web/dist/index.html");
const config = resolve(process.argv[3] ?? "deploy/host/nginx.conf");
const script = (await readFile(web, "utf8")).match(
  /<script data-browser-gate="">([\s\S]*?)<\/script>/,
)?.[1];
if (!script) throw new Error("没有找到发布包的浏览器兼容检测脚本");
const hash = createHash("sha256").update(script).digest("base64");
const previous = await readFile(config, "utf8");
const pattern = /script-src 'self'(?: 'sha256-[A-Za-z0-9+/=]+')?;/;
if (!pattern.test(previous)) throw new Error("没有找到可更新的CSP脚本配置");
await writeFile(
  config,
  previous.replace(pattern, `script-src 'self' 'sha256-${hash}';`),
);
console.log("已根据实际发布包更新浏览器检测脚本的CSP哈希。");
