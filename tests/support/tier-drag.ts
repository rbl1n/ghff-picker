// 選片頁層內順序的拖曳 helper：桌機用滑鼠，手機尺寸用 CDP 真觸控。
// 只負責「按住把手 → 移到目標 → 放開」；結果由 step 檢查。
import type { Locator, Page } from "@playwright/test";
import type { Tier } from "../../src/domain/types";
import { tierGroupOf, tierItemOf } from "./web-003-helpers";

interface Pointer {
  down(x: number, y: number): Promise<void>;
  move(x: number, y: number): Promise<void>;
  up(): Promise<void>;
}

async function pointerFor(page: Page): Promise<Pointer> {
  const touch = (page.viewportSize()?.width ?? 1280) < 600;
  if (!touch) {
    return {
      down: async (x, y) => {
        await page.mouse.move(x, y);
        await page.mouse.down();
      },
      move: async (x, y) => void (await page.mouse.move(x, y, { steps: 8 })),
      up: async () => void (await page.mouse.up()),
    };
  }
  const cdp = await page.context().newCDPSession(page);
  let cur = { x: 0, y: 0 };
  const send = (type: "touchStart" | "touchMove" | "touchEnd", pts: { x: number; y: number }[]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  return {
    down: async (x, y) => {
      cur = { x, y };
      await send("touchStart", [cur]);
    },
    move: async (x, y) => {
      const n = 8;
      const from = cur;
      for (let i = 1; i <= n; i++) {
        cur = { x: from.x + ((x - from.x) * i) / n, y: from.y + ((y - from.y) * i) / n };
        await send("touchMove", [cur]);
        await page.waitForTimeout(16);
      }
    },
    up: async () => void (await send("touchEnd", [])),
  };
}

const centerOf = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
};

/** 把 title 拖到 toTier 的第 index（從 0 起）位；跨層時依畫面現況逐步修正指標位置 */
export async function dragFilm(page: Page, title: string, fromTier: Tier, toTier: Tier, index: number): Promise<void> {
  const item = tierItemOf(page, title);
  // 把起點與終點的中間捲到畫面正中央，避免拖曳時碰到邊緣觸發自動捲動
  await page.evaluate(
    ([from, to]) => {
      const a = document.querySelector(`[data-tier="${from}"]`)!.getBoundingClientRect();
      const b = document.querySelector(`[data-tier="${to}"]`)!.getBoundingClientRect();
      const mid = (Math.min(a.top, b.top) + Math.max(a.bottom, b.bottom)) / 2 + window.scrollY;
      window.scrollTo(0, mid - window.innerHeight / 2);
    },
    [fromTier, toTier],
  );
  await item.scrollIntoViewIfNeeded();
  const handle = await centerOf(item.getByTestId("tier-drag-handle"));
  const ptr = await pointerFor(page);
  await ptr.down(handle.x, handle.y);
  await ptr.move(handle.x, handle.y + 6); // 越過啟動距離
  await page.waitForTimeout(80);
  const group = tierGroupOf(page, toTier);
  const rows = group.getByTestId("tier-order-item");
  if (fromTier === toTier) {
    // 同層：碰撞用拖曳開始時量到的位置，指到原本第 index 位的中心即可
    const target = await centerOf(rows.nth(index));
    await ptr.move(handle.x, target.y);
    await page.waitForTimeout(250);
    await ptr.move(handle.x, target.y + 1); // 再動一下，確保以最新版面重算碰撞
    await page.waitForTimeout(250);
  } else {
    for (let attempt = 0; attempt < 8; attempt++) {
      const others = group.locator('[data-testid="tier-order-item"]:not(.dragging)');
      const n = await others.count();
      let y: number;
      if (n === 0) {
        y = (await centerOf(group.locator(".dropzone"))).y;
      } else if (index < n) {
        const b = (await centerOf(others.nth(index))).b;
        y = b.y + b.height * 0.2;
      } else {
        const b = (await centerOf(others.nth(n - 1))).b;
        y = b.y + b.height * 0.85;
      }
      await ptr.move(handle.x, y);
      await page.waitForTimeout(200);
      const order = await rows.evaluateAll((els) => els.map((e) => ({ t: (e as HTMLElement).dataset.title, d: e.classList.contains("dragging") })));
      if (order.findIndex((o) => o.d) === index) break;
    }
  }
  await ptr.up();
  await page.waitForTimeout(150);
}
