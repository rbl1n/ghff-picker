import { useEffect, useState } from "react";
import { PickPage } from "./PickPage";
import { SlotsPage } from "./SlotsPage";
import { ItineraryPage } from "./ItineraryPage";
import { TicketsPage } from "./TicketsPage";
import { SharePage } from "./SharePage";

export const ROUTES = [
  { path: "pick", label: "選片", Page: PickPage },
  { path: "slots", label: "時段", Page: SlotsPage },
  { path: "itinerary", label: "行程", Page: ItineraryPage },
  { path: "tickets", label: "搶票", Page: TicketsPage },
  { path: "share", label: "分享", Page: SharePage },
] as const;

function currentPath(): string {
  const p = window.location.hash.replace(/^#\/?/, "").split(/[?&]/)[0];
  return ROUTES.some((r) => r.path === p) ? p : "pick";
}

export function App() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onHash = () => setPath(currentPath());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const route = ROUTES.find((r) => r.path === path)!;
  const Page = route.Page;
  return (
    <div>
      <main>
        <Page />
      </main>
      <nav aria-label="主要分頁">
        {ROUTES.map((r) => (
          <a key={r.path} href={`#/${r.path}`} aria-current={r.path === path ? "page" : undefined}>
            {r.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
