import type { UserState } from "../domain/types";

export function encodeShare(_state: UserState): string {
  throw new Error("not implemented");
}

export function decodeShare(_hash: string): UserState {
  throw new Error("not implemented");
}

export function buildShareUrl(_state: UserState, _baseUrl: string): string {
  throw new Error("not implemented");
}

export function qrDataUrl(_url: string): Promise<string> {
  throw new Error("not implemented");
}
