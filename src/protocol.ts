export type Direction = "previous" | "next";

export const directions = ["previous", "next"] as const;
export type CandidateShape = {
  id: number;
  position: number;
  relation: -1 | 0 | 1;
  kind: "link" | "button";
  cue: Direction | "unknown";
};

export type Classification = {
  hasCurrent: boolean;
  candidates: CandidateShape[];
  needed: Direction[];
};

export type Decisions = Partial<Record<Direction, number | null>>;

export type ConnectionResult = "connected" | "invalid" | "unavailable" | "no-model";
export type SiteStatus = "ready" | "disabled" | "no-access" | "unsupported";
export type SiteInfo = { status: SiteStatus; host?: string };
export const arrowKeys = ["ArrowLeft", "ArrowRight"] as const;
export type ArrowKey = (typeof arrowKeys)[number];
export type SetupStatus = { connected: boolean; tried: ArrowKey[] };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function siteHost(address?: string): string | undefined {
  if (!address) return;
  try {
    const url = new URL(address);
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (host !== "api.typesafe.ai") return host;
  } catch {
    return;
  }
}

export function enteredHost(value: string): string | undefined {
  const input = value.trim();
  if (!input) return;
  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    if (url.username || url.password) return;
    const host = siteHost(url.href);
    if (host && (host.includes(".") || host === "localhost" || host.startsWith("["))) return host;
  } catch {
    return;
  }
}
