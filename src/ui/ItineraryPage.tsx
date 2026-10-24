import { useEffect, useMemo } from "react";
import type { Catalog, DuoItineraryEntry, ItineraryParticipant, Session, Tier, UnscheduledMustFilm } from "../domain/types";
import { CatalogGate } from "./CatalogGate";
import { CatNo, labelWithNo } from "./CatNo";
import { TIERS, TIER_LABEL, TIER_TAG_CLASS, dateLabel, formatTime, isGuest } from "./format";
import { diffLines, giveUpText, optionAText, optionBText, type TextContext, type Tradeoff } from "../domain/tradeoff";
import { ensureSchedule, runSchedule, scheduleSignature, setPinnedChoice, useItineraryFilter, useStore, type ItineraryFilter } from "./store";

const REASON_TEXT = {
  no_available_session: () => "沒有可看場次",
  daily_limit: () => "受每日上限限制",
  only_session_unfit: () => "指定場次都排不進去",
  conflicts_with_must: (titles: string[]) => `與${titles.map((t) => `「${t}」`).join("、")}衝堂`,
} as const;

export function ItineraryPage() {
  return <CatalogGate>{(catalog) => <ItineraryContent catalog={catalog} />}</CatalogGate>;
}

function reasonOf(u: UnscheduledMustFilm, titleOf: (id: string) => string): string {
  if (u.reason === "conflicts_with_must") return REASON_TEXT.conflicts_with_must((u.conflict_film_ids ?? []).map(titleOf));
  return REASON_TEXT[u.reason]();
}

const FILTERS: { key: ItineraryFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "self", label: "只看自己" },
  { key: "partner", label: "只看同伴" },
];

/** 顯示用的一列：兩人模式帶參與者與「視角」層級，個人模式 participant = undefined */
interface Row {
  session: Session;
  tier: Tier;
  isNonTicketed: boolean;
  participant?: ItineraryParticipant;
  /** 排在優先場（005）：自己看的看自己的標記、同伴自己看的看同伴的標記、一起看任一人標優先即是 */
  preferred: boolean;
}

function ItineraryContent({ catalog }: { catalog: Catalog }) {
  const { user, schedule, scheduling } = useStore();
  const [filter, setFilter] = useItineraryFilter();
  useEffect(ensureSchedule, [schedule, scheduling]);

  const sessionById = useMemo(() => new Map(catalog.sessions.map((s) => [s.session_id, s])), [catalog]);
  const filmById = useMemo(() => new Map(catalog.films.map((f) => [f.film_id, f])), [catalog]);
  const partner = user.partner;
  const selfName = user.self_name || "我";

  if (user.film_preferences.length === 0 && (partner?.film_preferences.length ?? 0) === 0 && !scheduling) {
    return (
      <>
        <p className="empty" data-testid="itinerary-empty">
          先到選片頁標記想看的片
        </p>
        <a className="btn btn-primary btn-block" href="#/pick">
          去選片
        </a>
      </>
    );
  }
  if (scheduling || !schedule) {
    return (
      <div className="banner" role="status">
        排程中…
        <div className="prog">
          <i />
        </div>
      </div>
    );
  }

  const stale = schedule.sig !== scheduleSignature(user);
  const titleOf = (id: string) => filmById.get(id)?.title ?? "";
  const noOf = (id: string) => filmById.get(id)?.catalog_no;
  const labelOf = (id: string) => labelWithNo(titleOf(id), noOf(id));
  const nameOf = (owner: "self" | "partner" | undefined) => (owner === "partner" ? partner?.display_name ?? "" : selfName);

  // 兩人模式依篩選取列，層級色塊顯示「視角」那個人的層級（預設自己；只看同伴為同伴；全部中同伴自己看的列為同伴）
  const rows: Row[] = [];
  if (schedule.duo) {
    for (const e of schedule.duo as DuoItineraryEntry[]) {
      if (filter === "self" && e.participant === "partner") continue;
      if (filter === "partner" && e.participant === "self") continue;
      const session = sessionById.get(e.session_id);
      if (!session) continue;
      const asPartner = filter === "partner" || (filter === "all" && e.participant === "partner");
      const tier = (asPartner ? e.partner_tier ?? e.tier : e.tier) as Tier;
      const mine = user.session_marks?.[session.session_id] === "prefer";
      const theirs = partner?.session_marks?.[session.session_id] === "prefer";
      const preferred = e.participant === "self" ? mine : e.participant === "partner" ? theirs : mine || theirs;
      rows.push({ session, tier, isNonTicketed: e.is_non_ticketed, participant: e.participant, preferred });
    }
  } else {
    for (const e of schedule.itinerary) {
      const session = sessionById.get(e.session_id);
      if (session) rows.push({ session, tier: e.tier, isNonTicketed: e.is_non_ticketed, preferred: user.session_marks?.[session.session_id] === "prefer" });
    }
  }
  const days = new Map<string, Row[]>();
  for (const r of rows) days.set(r.session.date, [...(days.get(r.session.date) ?? []), r]);

  return (
    <>
      {stale && (
        <div className="banner">
          <div className="row">
            <span className="sp">條件已變更，重新排程</span>
            <button className="btn btn-primary" onClick={() => runSchedule(true)}>
              重新排程
            </button>
          </div>
        </div>
      )}
      {partner && (
        <div className="seg" role="radiogroup" aria-label="行程篩選" data-testid="itinerary-filter">
          {FILTERS.map((f) => (
            <button key={f.key} role="radio" aria-checked={filter === f.key} className="segbtn" onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      )}
      <div className="sum">
        {TIERS.map((t) => {
          const total = user.film_preferences.filter((p) => p.tier === t).length;
          const done = schedule.itinerary.filter((e) => e.tier === t).length;
          return (
            <div key={t} data-testid={`itinerary-summary-${t}`}>
              <b className="mono">
                {done}/{total}
              </b>
              排入{TIER_LABEL[t]}
            </div>
          );
        })}
      </div>
      {schedule.unscheduled.length > 0 && (
        <section className="banner banner-error" data-testid="unscheduled-box" aria-label="未排入的必看片">
          <h2>有 {schedule.unscheduled.length} 部必看排不進去</h2>
          <ul>
            {schedule.unscheduled.map((u) => (
              <li key={`${u.owner ?? "self"}-${u.film_id}`}>
                <CatNo no={noOf(u.film_id)} /> <b>{titleOf(u.film_id)}</b>：{reasonOf(u, labelOf)}
                {partner && (
                  <>
                    {" "}
                    <span className="tag tag-want" data-testid="unscheduled-owner">
                      {nameOf(u.owner)}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {schedule.tradeoffs.length > 0 && partner && (
        <section className="tradeoffs" aria-label="取捨" data-testid="tradeoffs">
          {schedule.tradeoffs.map((t) => (
            <TradeoffCard
              key={`${t.owner}-${t.film_id}`}
              t={t}
              title={labelOf(t.film_id)}
              ctx={{ titleOf, sessionOf: (id) => sessionById.get(id)!, nameOf }}
              ownerLabel={t.owner === "self" ? "你" : partner.display_name}
            />
          ))}
        </section>
      )}
      {[...days.entries()].map(([date, items]) => (
        <section className="daygroup" key={date}>
          <h2>{dateLabel(date)}</h2>
          <ol className="tl">
            {items.map(({ session, tier, isNonTicketed, participant, preferred }) => (
              <li
                key={session.session_id}
                className={isNonTicketed ? "it nosale" : "it"}
                data-testid="itinerary-entry"
                data-date={date}
                data-tier={tier}
              >
                <div className="tm mono">
                  <b>{formatTime(session.start_min)}</b>
                  <span>{formatTime(session.end_min)}</span>
                </div>
                <div className="info">
                  <div className="row">
                    <CatNo no={noOf(session.film_id)} />
                    <b className="nm">{titleOf(session.film_id)}</b>
                    <span className={`tag ${TIER_TAG_CLASS[tier]}`}>{TIER_LABEL[tier]}</span>
                    {participant && (
                      <span className={participant === "together" ? "tag tag-together" : "tag"} data-testid="participant-tag">
                        {participant === "together" ? "一起" : `${participant === "self" ? selfName : partner?.display_name ?? ""} 自己`}
                      </span>
                    )}
                    {isGuest(session) && <span className="tag tag-star">★</span>}
                    {preferred && (
                      <span className="tag tag-pref" data-testid="preferred-tag">
                        優先場
                      </span>
                    )}
                    {isNonTicketed && <span className="tag tag-nosale">非售票</span>}
                  </div>
                  <div className="hint">{session.venue_name}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {rows.length === 0 && <p className="empty">目前沒有可排入的場次</p>}
      <a className="btn btn-primary btn-block" href="#/tickets" style={{ marginTop: 16 }}>
        看搶票清單
      </a>
    </>
  );
}

/** 取捨卡片（005，CL-504）：兩個選項各自的代價；按鈕在「看優先場」與「改回一起看」之間切換並立即重新排程 */
function TradeoffCard({ t, title, ctx, ownerLabel }: { t: Tradeoff; title: string; ctx: TextContext; ownerLabel: string }) {
  const lines = diffLines(t, ctx);
  const filmTitle = ctx.titleOf(t.film_id);
  const act = () => {
    setPinnedChoice(t.owner, t.film_id, t.chosen === "a");
    runSchedule();
  };
  return (
    <article className="tradeoff" data-testid="tradeoff-card" data-film={filmTitle} data-owner={t.owner} data-choice={t.chosen}>
      <h3>取捨：{title}</h3>
      <div className="opt" data-testid="tradeoff-option-a" data-selected={t.chosen === "a"}>
        <span className="tag">A</span> <b data-testid="tradeoff-head">{optionAText(t, ctx)}</b>
        <span className="giveup" data-testid="tradeoff-giveup">
          {giveUpText(t, ctx)}
        </span>
      </div>
      <div className="opt" data-testid="tradeoff-option-b" data-selected={t.chosen === "b"}>
        <span className="tag">B</span> <b data-testid="tradeoff-head">{optionBText(t, ctx, ownerLabel)}</b>
        <ul>
          {lines.map((line, i) => (
            <li key={i} data-testid="tradeoff-diff-line">
              {line}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className={t.chosen === "a" ? "btn btn-primary" : "btn"} data-testid="tradeoff-action" onClick={act}>
        {t.chosen === "a" ? "看優先場" : "改回一起看"}
      </button>
    </article>
  );
}

