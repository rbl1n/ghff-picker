import type { UserState } from "../domain/types";

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = "ghff-picker:user-state";

export function loadState(): UserState | null {
  throw new Error("not implemented");
}

export function saveState(_state: UserState): void {
  throw new Error("not implemented");
}

export function clearState(): void {
  throw new Error("not implemented");
}
