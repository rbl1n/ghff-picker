/** 金馬影展官方連結（網址皆取自官網場次頁／購票資訊頁並實際確認過） */
export const OFFICIAL_LINKS = [
  { key: "schedule", label: "金馬影展官網場次表", url: "https://www.goldenhorse.org.tw/film/programme/schedule/" },
  { key: "ticketing-info", label: "購票資訊（售票時程與購票須知）", url: "https://www.goldenhorse.org.tw/film/tickets_venues/ticketing/" },
  { key: "tixcraft", label: "購票（拓元）", url: "https://tghff.tixcraft.com/" },
  { key: "catalog-pdf", label: "電子專刊（PDF）", url: "https://drive.google.com/file/d/1ryD9J45_LRHcQ2NcY539o27JfnXhbMnX/view" },
] as const;

/** 影片官網介紹頁；只有官網影片編號（純數字）才有，非售票活動（e 開頭）沒有 */
export function filmDetailUrl(filmId: string): string | undefined {
  return /^\d+$/.test(filmId) ? `https://www.goldenhorse.org.tw/film/programme/films/detail/${filmId}` : undefined;
}
