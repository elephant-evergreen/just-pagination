import { directions, isRecord } from "./protocol.js";
import type { Classification, ConnectionResult, Decisions } from "./protocol.js";

const endpoint = "https://api.typesafe.ai/v1/";
const model = "jev-latest";
const maxCandidates = 8;

async function request(key: string, path: "models" | "systemone", body?: object) {
  return fetch(endpoint + path, {
    method: body ? "POST" : "GET",
    headers: body
      ? { Authorization: "Bearer " + key, "Content-Type": "application/json" }
      : { Authorization: "Bearer " + key },
    body: body && JSON.stringify(body),
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(8000),
  });
}

export async function verifyKey(key: string): Promise<ConnectionResult> {
  if (!/^[\x21-\x7e]{8,512}$/.test(key)) return "invalid";
  try {
    const response = await request(key, "models");
    if (response.status === 401 || response.status === 403) return "invalid";
    if (!response.ok) return "unavailable";
    const data: unknown = await response.json();
    if (!isRecord(data) || !Array.isArray(data.models)) return "unavailable";
    return data.models.some(entry => isRecord(entry) && entry.name === model) ? "connected" : "no-model";
  } catch {
    return "unavailable";
  }
}

export function parseClassification(value: unknown): Classification | undefined {
  if (!isRecord(value) || typeof value.hasCurrent !== "boolean") return;
  if (!Array.isArray(value.candidates) || value.candidates.length < 1 || value.candidates.length > maxCandidates) return;
  if (!Array.isArray(value.needed)) return;
  const needed = directions.filter(direction => value.needed instanceof Array && value.needed.includes(direction));
  if (!needed.length) return;
  const candidates: Classification["candidates"] = [];
  for (const candidate of value.candidates) {
    if (!isRecord(candidate)) return;
    const { id, position, relation, kind, cue } = candidate;
    if (id !== candidates.length + 1 || typeof position !== "number" || !Number.isInteger(position) || position < 0 || position >= 32) return;
    if ((relation !== -1 && relation !== 0 && relation !== 1) || (kind !== "link" && kind !== "button")) return;
    if (cue !== "previous" && cue !== "next" && cue !== "unknown") return;
    candidates.push({ id, position, relation, kind, cue });
  }
  return { hasCurrent: value.hasCurrent, candidates, needed };
}

export async function classify(key: string, input: Classification): Promise<Decisions> {
  const questions: Record<string, object> = {};
  for (const direction of input.needed) {
    const criteria: Record<string, string> = { none: "No reliably identifiable adjacent page in this direction" };
    for (const candidate of input.candidates) criteria["c" + candidate.id] = "Control " + candidate.id;
    questions[direction] = {
      type: "choice",
      instructions: "Which control moves one page " + (direction === "next" ? "forward" : "back") +
        " in the same list? A relation of -1 or 1 indicates the side of the current page. " +
        "Use none when there is no clear arrow or adjacent-page evidence. Never pick a jump to a distant page.",
      criteria,
    };
  }
  try {
    const response = await request(key, "systemone", {
      model, state: { has_current: input.hasCurrent, controls: input.candidates }, questions,
    });
    if (!response.ok) return {};
    const body: unknown = await response.json();
    if (!isRecord(body) || !isRecord(body.answers)) return {};
    const selected: Decisions = {};
    for (const direction of input.needed) {
      const answer = body.answers[direction];
      if (!isRecord(answer) || answer.type !== "choice" || typeof answer.choice !== "string") continue;
      if (!isRecord(answer.probabilities)) continue;
      const probability = answer.probabilities[answer.choice];
      if (typeof probability !== "number" || probability < .92 || probability > 1 ||
          typeof answer.confidence !== "number" || answer.confidence < .8 || answer.confidence > 1) continue;
      if (answer.choice === "none") {
        selected[direction] = null;
        continue;
      }
      const candidate = input.candidates.find(option => "c" + option.id === answer.choice);
      if (!candidate || (candidate.cue !== "unknown" && candidate.cue !== direction)) continue;
      if (candidate.relation === (direction === "next" ? -1 : 1)) continue;
      selected[direction] = candidate.id;
    }
    return typeof selected.previous === "number" && selected.previous === selected.next ? {} : selected;
  } catch {
    return {};
  }
}
