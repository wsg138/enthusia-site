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

function safePath(path: PropertyKey[]): string {
  let result = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      result += `[${Math.max(0, Math.min(segment, 9999))}]`;
    } else if (typeof segment === "string") {
      const field = SAFE_FIELDS.has(segment) ? segment : "field";
      result += result ? `.${field}` : field;
    } else {
      result += result ? ".field" : "field";
    }
    if (result.length >= MAX_PATH_LENGTH) return result.slice(0, MAX_PATH_LENGTH);
  }
  return result || "$";
}

function valueAtPath(data: unknown, path: PropertyKey[]): unknown {
  let current = data;
  for (const segment of path) {
    if (typeof segment === "string" && !SAFE_FIELDS.has(segment)) return undefined;
    if ((typeof segment !== "string" && typeof segment !== "number") || current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<PropertyKey, unknown>)[segment];
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

function expected(issue: ZodIssue): string {
  const details = issue as ZodIssue & {
    expected?: string;
    format?: string;
    origin?: string;
  };
  if (issue.code === "unrecognized_keys") return "strict_object";
  if (issue.code === "invalid_value") return "enum_or_literal";
  if (issue.code === "custom") return "constraint";
  return details.expected ?? details.format ?? details.origin ?? "constraint";
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
