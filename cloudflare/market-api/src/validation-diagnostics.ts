import type { ZodIssue } from "zod";

const MAX_ISSUES = 20;
const MAX_PATH_LENGTH = 160;
const LOG_INTERVAL_MS = 30_000;

const SAFE_FIELDS = new Set([
  "schemaVersion", "serverId", "serverEpoch", "eventId", "sentAt", "snapshotRevision", "generatedAt",
  "stalls", "revision", "stall", "id", "buildingId", "floor", "location", "world", "x", "y", "z",
  "owner", "type", "uuid", "name", "avatarUrl", "avatar", "kind", "source", "includesOuterLayer", "url",
  "ownerSince", "nextRentAt", "stallState", "graceEndsAt", "rentTimingStatus", "members", "shops", "direction", "sellItem", "sellAmount", "costItem",
  "costAmount", "interaction", "stockCount", "availableTrades", "searchable", "material", "displayName",
  "amount", "icon", "metadata", "customName", "enchantments", "storedEnchantments", "potion", "armorTrim",
  "smithingTemplate", "writtenBook", "shulkerColor", "container", "level", "basePotion", "form", "color",
  "effects", "amplifier", "durationSeconds", "pattern", "title", "author", "generation", "pageCount", "slots",
  "capacityUsed", "capacityMax", "contents", "slot", "item", "probe",
]);

const SPECIAL_EXPECTATIONS = new Map<string, string>([
  ["unrecognized_keys", "strict_object"],
  ["invalid_value", "enum_or_literal"],
  ["custom", "constraint"],
]);

export interface SafeValidationIssue {
  code: string;
  path: string;
  expected: string;
  received: string;
  length?: number;
  count?: number;
  minimum?: number;
  maximum?: number;
}

export interface SafeValidationSummary {
  category: "invalid_field";
  issues: SafeValidationIssue[];
  omitted: number;
}

let lastLogAt = 0;

function renderedPathSegment(segment: PropertyKey, nested: boolean): string {
  if (typeof segment === "number") return `[${Math.max(0, Math.min(segment, 9999))}]`;
  const field = typeof segment === "string" && SAFE_FIELDS.has(segment) ? segment : "field";
  return nested ? `.${field}` : field;
}

function safePath(path: PropertyKey[]): string {
  let result = "";
  for (const segment of path) {
    result += renderedPathSegment(segment, result.length > 0);
    if (result.length >= MAX_PATH_LENGTH) return result.slice(0, MAX_PATH_LENGTH);
  }
  return result || "$";
}

function indexedPathValue(current: object, index: number): unknown {
  if (!Array.isArray(current)) return undefined;
  if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
  return current.at(index);
}

function fieldPathValue(current: object, segment: PropertyKey): unknown {
  if (typeof segment !== "string") return undefined;
  if (!SAFE_FIELDS.has(segment) || !Object.hasOwn(current, segment)) return undefined;
  return Reflect.get(current, segment);
}

function nextPathValue(current: object, segment: PropertyKey): unknown {
  return typeof segment === "number" ? indexedPathValue(current, segment) : fieldPathValue(current, segment);
}

function valueAtPath(data: unknown, path: PropertyKey[]): unknown {
  let current = data;
  for (const segment of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = nextPathValue(current, segment);
  }
  return current;
}

function received(value: unknown): Pick<SafeValidationIssue, "received" | "length" | "count"> {
  if (value === null) return { received: "null" };
  if (Array.isArray(value)) return { received: "array", count: value.length };
  if (typeof value === "string") return { received: "string", length: value.length };
  if (typeof value === "object") return { received: "object", count: Object.keys(value).length };
  return { received: typeof value };
}

function firstExpectedValue(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (candidate !== undefined) return candidate;
  }
  return "constraint";
}

function expected(issue: ZodIssue): string {
  const details = issue as ZodIssue & {
    expected?: string;
    format?: string;
    origin?: string;
  };
  const special = SPECIAL_EXPECTATIONS.get(issue.code);
  return special ?? firstExpectedValue(details.expected, details.format, details.origin);
}

export function summarizeValidationIssues(issues: ZodIssue[], data: unknown): SafeValidationSummary {
  const summaries = issues.slice(0, MAX_ISSUES).map((issue) => {
    const details = issue as ZodIssue & { minimum?: number; maximum?: number };
    const summary: SafeValidationIssue = {
      code: issue.code,
      path: safePath(issue.path),
      expected: expected(issue),
      ...received(valueAtPath(data, issue.path)),
    };
    if (typeof details.minimum === "number") summary.minimum = details.minimum;
    if (typeof details.maximum === "number") summary.maximum = details.maximum;
    return summary;
  });
  return { category: "invalid_field", issues: summaries, omitted: Math.max(0, issues.length - summaries.length) };
}

export function eventRelationshipIssue(path: string): SafeValidationSummary {
  return {
    category: "invalid_field",
    issues: [{ code: "custom", path, expected: "authenticated_header_match", received: "string" }],
    omitted: 0,
  };
}

export function logValidationSummary(pathname: string, summary: SafeValidationSummary, now = Date.now()): void {
  if (now - lastLogAt < LOG_INTERVAL_MS) return;
  lastLogAt = now;
  console.warn(JSON.stringify({ event: "authenticated_market_validation_rejected", route: pathname, ...summary }));
}
