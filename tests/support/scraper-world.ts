import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ParsedSchedule } from "../../scripts/scrape/parse";

const FIXTURE_DIR = resolve(process.cwd(), "scripts/scrape/fixtures");

/** 載入 scripts/scrape/fixtures/<date>.html */
export function loadFixtureHtml(date: string): string {
  return readFileSync(resolve(FIXTURE_DIR, `${date}.html`), "utf-8");
}

export interface ScraperWorld {
  date: string | null;
  html: string | null;
  parsed: ParsedSchedule | null;
}

export function createScraperWorld(): ScraperWorld {
  return { date: null, html: null, parsed: null };
}
