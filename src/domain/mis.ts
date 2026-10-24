/**
 * 加權最大獨立集（分支定界）：排程的兩個子問題（個人影片集合、兩人場次指派）共用的求解器。
 *
 * 頂點 = 一個「選擇」（某場次，或兩人一起看的某場次）；邊 = 兩個選擇不能同時成立（衝堂、同一部片只能選一場）；
 * 權重把字典序目標編成一個整數（高位數字 = 優先的目標）。上界用貪婪團覆蓋（每個團最多選一個頂點，取團內最大權重），
 * 這對「同時段互相衝堂」的場次表非常緊，遠勝逐片計數。
 *
 * 決定性：頂點依 (權重大到小, 索引) 排序、分支順序固定，同分時先找到者勝；節點預算用次數計，不看時間。
 * 預算用完時不證明最佳，回傳目前最佳解（起點為貪婪解與呼叫端給的種子解，所以結果仍然合理）。
 */

export interface MisGraph {
  n: number;
  words: number;
  /** 鄰接位元列（不含自己） */
  adj: Uint32Array[];
  /** 每個頂點占用的資源（每日場次上限）：頂點被選時該資源計數 +1 */
  res: number[][];
  resLimit: number[];
  resInit: number[];
  resMembers: Uint32Array[];
}

export function createGraph(n: number): MisGraph {
  const words = Math.max(1, (n + 31) >>> 5);
  return {
    n,
    words,
    adj: Array.from({ length: n }, () => new Uint32Array(words)),
    res: Array.from({ length: n }, () => [] as number[]),
    resLimit: [],
    resInit: [],
    resMembers: [],
  };
}

export function addEdge(g: MisGraph, u: number, v: number): void {
  if (u === v) return;
  g.adj[u][v >>> 5] |= 1 << (v & 31);
  g.adj[v][u >>> 5] |= 1 << (u & 31);
}

/** 新增一個資源（容量 limit、已用 init），回傳資源編號；之後用 useResource 把頂點掛上去 */
export function addResource(g: MisGraph, limit: number, init: number): number {
  g.resLimit.push(limit);
  g.resInit.push(init);
  g.resMembers.push(new Uint32Array(g.words));
  return g.resLimit.length - 1;
}

export function useResource(g: MisGraph, v: number, r: number): void {
  g.res[v].push(r);
  g.resMembers[r][v >>> 5] |= 1 << (v & 31);
}

export function fullMask(g: MisGraph): Uint32Array {
  const m = new Uint32Array(g.words);
  for (let v = 0; v < g.n; v++) m[v >>> 5] |= 1 << (v & 31);
  return m;
}

const has = (m: Uint32Array, v: number): boolean => (m[v >>> 5] & (1 << (v & 31))) !== 0;

function bitsOf(m: Uint32Array): number[] {
  const out: number[] = [];
  for (let w = 0; w < m.length; w++) {
    let x = m[w];
    while (x !== 0) {
      const low = x & -x;
      out.push((w << 5) + (31 - Math.clz32(low)));
      x ^= low;
    }
  }
  return out;
}

/** 連通分量（邊，加上會真的被限制到的資源）；各分量互相獨立，可分開求解 */
export function components(g: MisGraph, mask: Uint32Array): Uint32Array[] {
  const remaining = new Uint32Array(mask);
  const out: Uint32Array[] = [];
  const binding = g.resLimit.map((limit, r) => bitsOf(g.resMembers[r]).filter((v) => has(mask, v)).length + g.resInit[r] > limit);
  for (let s = 0; s < g.n; s++) {
    if (!has(remaining, s)) continue;
    const comp = new Uint32Array(g.words);
    const stack = [s];
    remaining[s >>> 5] &= ~(1 << (s & 31));
    while (stack.length > 0) {
      const v = stack.pop()!;
      comp[v >>> 5] |= 1 << (v & 31);
      const next = new Uint32Array(g.words);
      for (let w = 0; w < g.words; w++) next[w] = g.adj[v][w];
      for (const r of g.res[v]) if (binding[r]) for (let w = 0; w < g.words; w++) next[w] |= g.resMembers[r][w];
      for (let w = 0; w < g.words; w++) {
        let x = next[w] & remaining[w];
        while (x !== 0) {
          const low = x & -x;
          const u = (w << 5) + (31 - Math.clz32(low));
          remaining[w] &= ~low;
          stack.push(u);
          x ^= low;
        }
      }
    }
    out.push(comp);
  }
  return out;
}

export interface MisResult {
  weight: number;
  set: number[];
  /** 節點預算用完（結果不保證最佳） */
  exhausted: boolean;
}

/** 搜尋預算（決定性，與時間無關）：每個節點依子問題大小扣 1 + 頂點數 × 上界個數 / 16 點，約略對應 1 微秒；總量與單次呼叫上限 */
export class Budget {
  constructor(
    public total: number,
    readonly perCall: number,
  ) {}
}

function weightOf(w: ArrayLike<number>, set: number[]): number {
  let s = 0;
  for (const v of set) s += w[v];
  return s;
}

function independent(g: MisGraph, set: number[], mask: Uint32Array): boolean {
  const cnt = g.resInit.slice();
  const taken = new Uint32Array(g.words);
  for (const v of set) {
    if (!has(mask, v) || has(taken, v)) return false;
    for (let x = 0; x < g.words; x++) if (g.adj[v][x] & taken[x]) return false;
    taken[v >>> 5] |= 1 << (v & 31);
    for (const r of g.res[v]) if (++cnt[r] > g.resLimit[r]) return false;
  }
  return true;
}

interface Res {
  v: number;
  set: number[];
}

/**
 * 在 mask 範圍內求權重最大的獨立集。weights 必為正整數（和需在 2^53 以內）。
 * target：只需要找到權重 >= target 的解（決定問題）；沒找到時回傳目前最佳（權重 < target）。
 * seeds：候選起點解（無效者忽略），與貪婪解一起取最佳作為初始下界。
 *
 * 搜尋：遞迴 solve(P, lb) = P 範圍內「權重 > lb 的最佳解」，沒有則 null。每個節點先把 P 拆成互相獨立的連通分量
 * 分別求解（分量之間的組合不必窮舉），單一分量用團覆蓋上界分支；P 的子問題（無每日上限時）以位元列為鍵做記憶化。
 */
export function solveMis(
  g: MisGraph,
  weights: ArrayLike<number>,
  mask: Uint32Array,
  budget: Budget,
  target?: number,
  seeds: number[][] = [],
  groups: number[][] = [],
  digits: { w: ArrayLike<number>; mult: number }[] = [],
): MisResult {
  const W = g.words;
  // 分組上界：groups 的每一組必須是團（組內頂點兩兩互斥）；一個頂點可屬於多組，權重平分給各組。
  // 每組最多選一個頂點，所以「各組內最大分得權重」的總和是上界。
  const groupsOf: number[] = new Array(g.n).fill(0);
  for (const grp of groups) for (const v of grp) groupsOf[v]++;
  const weightsMain = weights;
  const shareOf = (v: number, weights: ArrayLike<number>): number => weights[v] / Math.max(1, groupsOf[v]);
  const groupMasks = groups.map((grp) => {
    const m = new Uint32Array(W);
    for (const v of grp) m[v >>> 5] |= 1 << (v & 31);
    return { verts: grp, mask: m };
  });
  const grouped = groups.length > 0 && bitsOf(mask).every((v) => groupsOf[v] > 0);
  const groupBound = (P: Uint32Array, weights: ArrayLike<number> = weightsMain): number => {
    let total = 0;
    for (const gm of groupMasks) {
      let m = 0;
      for (const v of gm.verts) if (has(P, v)) {
        const sh = shareOf(v, weights);
        if (sh > m) m = sh;
      }
      total += m;
    }
    return total;
  };
  const cnt = Int32Array.from(g.resInit);
  const P0 = new Uint32Array(mask);
  for (let r = 0; r < g.resLimit.length; r++) if (cnt[r] >= g.resLimit[r]) for (let x = 0; x < W; x++) P0[x] &= ~g.resMembers[r][x];
  const verts = bitsOf(P0).sort((a, b) => weights[b] - weights[a] || a - b);
  const hasRes = g.resLimit.length > 0;

  /**
   * 局部改善（決定性）：把一個不在解內的頂點硬塞進來、移走與它衝突的頂點、再貪婪補滿；變好就接受，直到沒有改善。
   * 給預算用完時的結果一個好的底線（例如把某部片換個場次好讓兩人一起看）。
   */
  const improve = (start: number[]): number[] => {
    let S = start.slice();
    let curW = weightOf(weights, S);
    for (let pass = 0; pass < 30; pass++) {
      let improved = false;
      const inS = new Uint32Array(W);
      for (const v of S) inS[v >>> 5] |= 1 << (v & 31);
      for (const v of verts) {
        if (has(inS, v)) continue;
        const keep = S.filter((u) => !(g.adj[v][u >>> 5] & (1 << (u & 31))));
        const next = [v, ...keep];
        const blocked = new Uint32Array(W);
        const used = Int32Array.from(g.resInit);
        let ok = true;
        for (const u of next) {
          for (let x = 0; x < W; x++) blocked[x] |= g.adj[u][x];
          for (const r of g.res[u]) if (++used[r] > g.resLimit[r]) ok = false;
        }
        if (!ok) continue;
        for (const u of verts) {
          if (has(blocked, u)) continue;
          if (next.includes(u)) continue;
          let fits = true;
          for (const r of g.res[u]) if (used[r] + 1 > g.resLimit[r]) { fits = false; break; }
          if (!fits) continue;
          for (let x = 0; x < W; x++) blocked[x] |= g.adj[u][x];
          for (const r of g.res[u]) used[r]++;
          next.push(u);
        }
        const nw = weightOf(weights, next);
        if (nw > curW) {
          S = next;
          curW = nw;
          improved = true;
          inS.fill(0);
          for (const u of S) inS[u >>> 5] |= 1 << (u & 31);
        }
      }
      if (!improved) break;
    }
    return S;
  };

  // 初始解：貪婪（權重大者先）＋種子
  let best = 0;
  let bestSet: number[] = [];
  {
    const taken = new Uint32Array(W);
    const used = Int32Array.from(g.resInit);
    const picked: number[] = [];
    for (const v of verts) {
      let ok = true;
      for (let x = 0; x < W; x++) if (g.adj[v][x] & taken[x]) { ok = false; break; }
      if (!ok) continue;
      for (const r of g.res[v]) if (used[r] + 1 > g.resLimit[r]) { ok = false; break; }
      if (!ok) continue;
      taken[v >>> 5] |= 1 << (v & 31);
      for (const r of g.res[v]) used[r]++;
      picked.push(v);
    }
    best = weightOf(weights, picked);
    bestSet = picked;
  }
  for (const s of seeds) {
    if (!independent(g, s, P0)) continue;
    const ws = weightOf(weights, s);
    if (ws > best) {
      best = ws;
      bestSet = s.slice();
    }
  }
  {
    const better = improve(bestSet);
    const wb = weightOf(weights, better);
    if (wb > best) {
      best = wb;
      bestSet = better;
    }
  }
  if (target !== undefined && best >= target) return { weight: best, set: bestSet, exhausted: false };

  let nodes = Math.min(budget.perCall, Math.max(0, budget.total));
  const allowed = nodes;
  let exhausted = false;
  const memo = new Map<string, { exact?: Res; upTo?: number }>();

  const coverOf = (P: Uint32Array, weights: ArrayLike<number> = weightsMain, order: number[] = verts): { members: number[][]; prefix: number[] } => {
    const common: Uint32Array[] = [];
    const members: number[][] = [];
    for (const v of order) {
      if (!has(P, v)) continue;
      let placed = false;
      for (let c = 0; c < common.length; c++) {
        if (has(common[c], v)) {
          const com = common[c];
          const a = g.adj[v];
          for (let x = 0; x < W; x++) com[x] &= a[x];
          members[c].push(v);
          placed = true;
          break;
        }
      }
      if (!placed) {
        common.push(Uint32Array.from(g.adj[v]));
        members.push([v]);
      }
    }
    const prefix: number[] = [];
    let acc = 0;
    for (const mem of members) {
      acc += weights[mem[0]];
      prefix.push(acc);
    }
    return { members, prefix };
  };

  const digitOrders = digits.map((d) => verts.filter((v) => d.w[v] > 0).sort((a, b) => d.w[b] - d.w[a] || a - b));
  const digitBound = (P: Uint32Array): number => {
    let total = 0;
    for (let k = 0; k < digits.length; k++) {
      const d = digits[k];
      const cv = coverOf(P, d.w, digitOrders[k]);
      let u = cv.prefix.length > 0 ? cv.prefix[cv.prefix.length - 1] : 0;
      if (grouped) u = Math.min(u, groupBound(P, d.w));
      total += u * d.mult;
    }
    return total;
  };

  const split = (P: Uint32Array): Uint32Array[] => {
    const remaining = new Uint32Array(P);
    const out: Uint32Array[] = [];
    const binding: boolean[] = [];
    if (hasRes) {
      for (let r = 0; r < g.resLimit.length; r++) {
        let k = 0;
        for (let x = 0; x < W; x++) k += popcount(g.resMembers[r][x] & P[x]);
        binding.push(cnt[r] + k > g.resLimit[r]);
      }
    }
    for (let wi = 0; wi < W; wi++) {
      while (remaining[wi] !== 0) {
        const low = remaining[wi] & -remaining[wi];
        const s = (wi << 5) + (31 - Math.clz32(low));
        remaining[wi] &= ~low;
        const comp = new Uint32Array(W);
        const stack = [s];
        while (stack.length > 0) {
          const v = stack.pop()!;
          comp[v >>> 5] |= 1 << (v & 31);
          for (let x = 0; x < W; x++) {
            let nx = g.adj[v][x];
            if (hasRes) for (const r of g.res[v]) if (binding[r]) nx |= g.resMembers[r][x];
            nx &= remaining[x];
            while (nx !== 0) {
              const lo = nx & -nx;
              remaining[x] &= ~lo;
              stack.push((x << 5) + (31 - Math.clz32(lo)));
              nx ^= lo;
            }
          }
        }
        out.push(comp);
      }
    }
    return out;
  };

  const keyOf = (P: Uint32Array): string => {
    let k = "";
    for (let x = 0; x < W; x++) k += String.fromCharCode(P[x] & 0xffff, P[x] >>> 16);
    return k;
  };

  const solve = (P: Uint32Array, lb: number): Res | null => {
    let size = 0;
    for (let x = 0; x < W; x++) size += popcount(P[x]);
    if (size === 0) return lb < 0 ? { v: 0, set: [] } : null;
    if (exhausted) return null;
    const key = !hasRes && size > 3 ? keyOf(P) : null;
    if (key !== null) {
      const hit = memo.get(key);
      if (hit) {
        if (hit.exact) return hit.exact.v > lb ? hit.exact : null;
        if (hit.upTo !== undefined && hit.upTo <= lb) return null;
      }
    }
    nodes -= 1 + ((size * (1 + digits.length)) >> 4);
    if (nodes < 0) {
      exhausted = true;
      return null;
    }
    let result: Res | null = null;
    const comps = size > 1 ? split(P) : [P];
    if (comps.length > 1) {
      const covs = comps.map((c) => coverOf(c));
      const ubs = covs.map((c) => c.prefix[c.prefix.length - 1]);
      const order = comps.map((_, i) => i).sort((a, b) => ubs[a] - ubs[b] || a - b); // 小的先解
      let later = ubs.reduce((a, b) => a + b, 0);
      let done = 0;
      const sets: number[][] = [];
      let ok = later > lb;
      for (const i of order) {
        if (!ok) break;
        later -= ubs[i];
        const sub = solve(comps[i], Math.max(-1, lb - done - later));
        if (!sub) {
          ok = false;
          break;
        }
        done += sub.v;
        sets.push(sub.set);
      }
      if (ok && done > lb) result = { v: done, set: sets.flat() };
    } else {
      const cov = coverOf(P);
      let ub = cov.prefix[cov.prefix.length - 1];
      if (grouped) ub = Math.min(ub, groupBound(P));
      if (digits.length > 0 && ub > lb) ub = Math.min(ub, digitBound(P));
      if (ub > lb) {
        let bestV = lb;
        let bestS: number[] | null = null;
        const Pm = new Uint32Array(P);
        outer: for (let c = cov.members.length - 1; c >= 0; c--) {
          const mem = cov.members[c];
          for (let i = mem.length - 1; i >= 0; i--) {
            if (cov.prefix[c] <= bestV) break outer;
            const v = mem[i];
            const a = g.adj[v];
            const nextP = new Uint32Array(W);
            for (let x = 0; x < W; x++) nextP[x] = Pm[x] & ~a[x];
            nextP[v >>> 5] &= ~(1 << (v & 31));
            for (const r of g.res[v]) {
              if (++cnt[r] >= g.resLimit[r]) for (let x = 0; x < W; x++) nextP[x] &= ~g.resMembers[r][x];
            }
            const child = solve(nextP, bestV - weights[v]);
            for (const r of g.res[v]) cnt[r]--;
            if (child && child.v + weights[v] > bestV) {
              bestV = child.v + weights[v];
              bestS = [v, ...child.set];
              if (bestV >= ub) break outer;
            }
            if (exhausted) break outer;
            Pm[v >>> 5] &= ~(1 << (v & 31));
          }
        }
        if (bestS) result = { v: bestV, set: bestS };
      }
    }
    if (key !== null && !exhausted) {
      if (memo.size > 200_000) memo.clear();
      if (result) memo.set(key, { exact: result });
      else {
        const prev = memo.get(key);
        memo.set(key, { upTo: Math.min(lb, prev?.upTo ?? lb) });
      }
    }
    return result;
  };

  const lb0 = target !== undefined ? Math.max(best, target - 1) : best;
  const res = solve(P0, lb0);
  if (res && res.v > best) {
    best = res.v;
    bestSet = res.set;
  }
  budget.total -= allowed - Math.max(0, nodes);
  return { weight: best, set: bestSet, exhausted };
}

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
