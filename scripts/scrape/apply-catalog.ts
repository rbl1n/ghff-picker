// 離線把 catalog-numbers.json 套到既有 public/data/sessions.json（不連網、不動場次）。
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Catalog } from "../../src/domain/types";
import { applyCatalogNumbers, loadCatalogNumbers } from "./catalog";

const file = resolve(process.cwd(), "public/data/sessions.json");
const catalog = JSON.parse(readFileSync(file, "utf-8")) as Catalog;
catalog.films = applyCatalogNumbers(catalog.films, loadCatalogNumbers());
writeFileSync(file, JSON.stringify(catalog, null, 2) + "\n", "utf-8");
console.error(`applied catalog numbers: ${catalog.films.filter((f) => f.catalog_no).length}/${catalog.films.length} films`);
