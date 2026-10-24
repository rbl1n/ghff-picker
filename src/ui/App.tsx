import { useEffect, useState } from "react";
import { PickPage } from "./PickPage";
import { SlotsPage } from "./SlotsPage";
import { ItineraryPage } from "./ItineraryPage";
import { TicketsPage } from "./TicketsPage";
import { SharePage } from "./SharePage";
import { ImportPage } from "./ImportPage";

export const ROUTES = [
  { path: "pick", label: "選片", Page: PickPage, icon: "M3 4h18v16H3zM3 9h18M8 4v5M16 4v5" },
  { path: "slots", label: "時段", Page: SlotsPage, icon: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4" },
  { path: "itinerary", label: "行程", Page: ItineraryPage, icon: "M6 4v16M6 6h10l-2 3 2 3H6" },
  { path: "tickets", label: "搶票", Page: TicketsPage, icon: "M3 9a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V5H3zM14 6v12" },
  { path: "share", label: "分享", Page: SharePage, icon: "M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" },
] as const;

function currentPath(): string {
  const p = window.location.hash.replace(/^#\/?/, "").split(/[?&]/)[0];
  if (p === "import") return p;
  return ROUTES.some((r) => r.path === p) ? p : "pick";
}

export function App() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onHash = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const route = ROUTES.find((r) => r.path === path);
  const Page = route?.Page ?? ImportPage;
  return (
    <>
      <div className={`app app-${path}`}>
        <header className="topbar">
          <h1>{route?.label ?? "匯入設定"}</h1>
          {path !== "share" && (
            <a className="share-link" href="#/share">
              分享
            </a>
          )}
        </header>
        <main>
          <Page />
        </main>
      </div>
      <nav className="tabs" aria-label="主要分頁">
        <ul>
          {ROUTES.map((r) => (
            <li key={r.path}>
              <a href={`#/${r.path}`} aria-current={r.path === path ? "page" : undefined}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={r.icon} />
                </svg>
                {r.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
