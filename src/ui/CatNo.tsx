/** 手冊片號：灰色等寬小字；沒有片號時不顯示 */
export function CatNo({ no }: { no?: string }) {
  if (!no) return null;
  return (
    <span className="catno mono" data-testid="catalog-no">
      {no}
    </span>
  );
}

/** 純文字標籤（衝堂原因等）：「089 片名」 */
export function labelWithNo(title: string, no?: string): string {
  return no ? `${no} ${title}` : title;
}
