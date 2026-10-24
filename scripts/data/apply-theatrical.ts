// 用法：npm run data:theatrical -- <研究產出.json>；轉成 public/data/theatrical.json（可重複套用）。
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { convertTheatrical } from "./theatrical-convert";

const input = process.argv[2];
if (!input) {
  console.error("usage: npm run data:theatrical -- <path-to-json>");
  process.exit(1);
}
const entries = convertTheatrical(JSON.parse(readFileSync(resolve(input), "utf-8")));
writeFileSync(resolve(process.cwd(), "public/data/theatrical.json"), JSON.stringify(entries, null, 2) + "\n", "utf-8");
const count: Record<string, number> = {};
for (const e of entries) count[e.status] = (count[e.status] ?? 0) + 1;
console.error(`wrote ${entries.length} entries`, count);
