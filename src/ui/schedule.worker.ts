/// <reference lib="webworker" />
import { computePlan } from "../domain/plan";
import type { Catalog, UserState } from "../domain/types";

// 排程在背景執行緒算，畫面維持可操作（排程中…）。與主執行緒共用 computePlan，結果相同。
self.onmessage = (e: MessageEvent<{ id: number; catalog: Catalog; input: UserState }>) => {
  const { id, catalog, input } = e.data;
  self.postMessage({ id, result: computePlan(catalog, input) });
};
