import { defaultRewardDistribution, validateRewardDefinition } from "./rewards.js";
import { isSafeIdentifier } from "../validation.js";

const MAX_REWARDS = 60;
const MAX_PLACEMENT = 100;
const MAX_RANDOM_RECIPIENTS = 100;
const MAX_PUBLIC_LABEL = 100;
const MAX_PUBLIC_DESCRIPTION = 500;
const MAX_PAYLOAD_TEXT = 1000;
const MAX_SAFE_REWARD_AMOUNT = 9 * 10 ** 15;

const REWARD_TYPES = new Set([
  "MONEY",
  "ITEM",
  "PERMISSION",
  "RANK",
  "LORE_ITEM",
  "COMMAND",
  "MANUAL"
]);

const DISTRIBUTION_MODES = new Set([
  "SPLIT_ELIGIBLE",
  "EACH_ELIGIBLE",
  "OWNER_ONLY",
  "RANDOM_ELIGIBLE",
  "ALL_GUILD_MEMBERS",
  "RANDOM_GUILD_MEMBERS",
  "MANUAL"
]);

function normalizedText(value, multiline) {
  return multiline
    ? value.replace(/\r\n?/g, "\n").trim()
    : value.trim().replace(/\s+/g, " ");
}

function text(value, max, { required = false, multiline = false } = {}) {
  if ([null, undefined, ""].includes(value)) {
    if (required) return null;
    return "";
  }
  if (typeof value !== "string") return null;
  const normalized = normalizedText(value, multiline);
  if (required && !normalized) return null;
  if (normalized.length > max) return null;
  return normalized;
}

function identifier(value, max = 128) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return isSafeIdentifier(normalized, { maxLength: max }) ? normalized : null;
}

function positiveInteger(value, max) {
  return Number.isInteger(value) && value >= 1 && value <= max ? value : null;
}

function nonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_SAFE_REWARD_AMOUNT ? value : null;
}

function optionalDurationMinutes(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isInteger(value) && value >= 1 && value <= 5_256_000 ? value : undefined;
}

function recordOrEmpty(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function sanitizeMoneyPayload(source) {
  const amount = nonNegativeSafeInteger(source.amount);
  const currency = identifier(source.currency ?? "balance", 48);
  if (amount === null || !currency) return null;
  return { amount, currency };
}

function sanitizeItemPayload(source) {
  const itemKey = identifier(source.itemKey, 160);
  const amount = positiveInteger(source.amount ?? 1, 2304);
  if (!itemKey || amount === null) return null;
  return { itemKey, amount };
}

function sanitizeTimedIdentifierPayload(source, field, max) {
  const value = identifier(source[field], max);
  const durationMinutes = optionalDurationMinutes(source.durationMinutes);
  if (!value || durationMinutes === undefined) return null;
  return { [field]: value, durationMinutes };
}

function sanitizeCommandPayload(source) {
  if (typeof source.command !== "string") return null;
  if (/[\r\n]/.test(source.command)) return null;
  const command = text(source.command, 500, { required: true });
  return command ? { command } : null;
}

function sanitizeManualPayload(source) {
  const instructions = text(source.instructions, MAX_PAYLOAD_TEXT, { required: true, multiline: true });
  return instructions ? { instructions } : null;
}

const PAYLOAD_SANITIZERS = new Map([
  ["MONEY", sanitizeMoneyPayload],
  ["ITEM", sanitizeItemPayload],
  ["LORE_ITEM", sanitizeItemPayload],
  ["PERMISSION", (source) => sanitizeTimedIdentifierPayload(source, "permission", 160)],
  ["RANK", (source) => sanitizeTimedIdentifierPayload(source, "rank", 96)],
  ["COMMAND", sanitizeCommandPayload],
  ["MANUAL", sanitizeManualPayload]
]);

function sanitizePayload(rewardType, payload) {
  const sanitizer = PAYLOAD_SANITIZERS.get(rewardType);
  return sanitizer ? sanitizer(recordOrEmpty(payload)) : null;
}

function valueOrDefault(value, fallback) {
  return value === undefined ? fallback : value;
}

function sanitizeDistribution(raw, rewardType) {
  const mode = raw.distributionMode ?? defaultRewardDistribution(rewardType);
  if (!DISTRIBUTION_MODES.has(mode)) return null;
  const random = mode === "RANDOM_ELIGIBLE" || mode === "RANDOM_GUILD_MEMBERS";
  const randomCount = random
    ? positiveInteger(raw.randomCount, MAX_RANDOM_RECIPIENTS)
    : null;
  return { distributionMode: mode, randomCount };
}

function sanitizeHelperWeight(value, includeHelpers) {
  if (!includeHelpers) return 0;
  const weight = valueOrDefault(value, 0.5);
  if (typeof weight !== "number") return null;
  if (!Number.isFinite(weight)) return null;
  if (weight <= 0 || weight > 1) return null;
  return weight;
}

function sanitizeHelperPolicy(raw) {
  const includeHelpers = valueOrDefault(raw.includeHelpers, false);
  if (typeof includeHelpers !== "boolean") return null;
  const helperWeight = sanitizeHelperWeight(raw.helperWeight, includeHelpers);
  return helperWeight === null ? null : { includeHelpers, helperWeight };
}

function sanitizePublicDetails(raw) {
  const publicLabel = text(raw.publicLabel, MAX_PUBLIC_LABEL, { required: true });
  const publicDescription = text(raw.publicDescription, MAX_PUBLIC_DESCRIPTION, { required: true, multiline: true });
  return publicLabel && publicDescription ? { publicLabel, publicDescription } : null;
}

function missing(...values) {
  return values.some((value) => value === null);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeRewardIdentity(raw, ids) {
  const id = identifier(raw.id, 48);
  if (!id || ids.has(id)) return null;
  const placement = positiveInteger(raw.placement, MAX_PLACEMENT);
  if (placement === null) return null;
  const rewardType = raw.rewardType;
  if (!REWARD_TYPES.has(rewardType)) return null;
  return { id, placement, rewardType };
}

function sanitizeRewardDefinition(raw, ids) {
  if (!isRecord(raw)) return null;
  const identity = sanitizeRewardIdentity(raw, ids);
  if (!identity) return null;

  const distribution = sanitizeDistribution(raw, identity.rewardType);
  const helperPolicy = sanitizeHelperPolicy(raw);
  const publicDetails = sanitizePublicDetails(raw);
  const payload = sanitizePayload(identity.rewardType, raw.payload);
  if (missing(distribution, helperPolicy, publicDetails, payload)) return null;

  const definition = {
    ...identity,
    ...distribution,
    ...helperPolicy,
    ...publicDetails,
    payload
  };
  if (validateRewardDefinition(definition).length) return null;
  ids.add(identity.id);
  return definition;
}

export function initialRewardConfig() {
  return { definitions: [] };
}

export function sanitizeCompetitionRewards(input) {
  const source = input ?? {};
  if (!isRecord(source)) return null;

  const rawDefinitions = source.definitions ?? [];
  if (!Array.isArray(rawDefinitions) || rawDefinitions.length > MAX_REWARDS) return null;

  const definitions = [];
  const ids = new Set();
  for (const raw of rawDefinitions) {
    const definition = sanitizeRewardDefinition(raw, ids);
    if (!definition) return null;
    definitions.push(definition);
  }

  definitions.sort((left, right) => left.placement - right.placement || left.id.localeCompare(right.id));
  return { definitions };
}

export function materializeCompetitionRewards({ competitionId, configVersion, rewards, createdAt }) {
  const safeCompetitionId = identifier(competitionId, 80);
  if (!safeCompetitionId || !Number.isInteger(configVersion) || configVersion < 1 || typeof createdAt !== "string") {
    throw new TypeError("Reward publication identity is invalid");
  }
  const sanitized = sanitizeCompetitionRewards(rewards);
  if (!sanitized) throw new TypeError("Reward configuration is invalid");

  return sanitized.definitions.map((definition) => ({
    id: `${safeCompetitionId}:${definition.id}`,
    competitionId: safeCompetitionId,
    placement: definition.placement,
    rewardType: definition.rewardType,
    distributionMode: definition.distributionMode,
    configJson: JSON.stringify({
      schemaVersion: 1,
      sourceDefinitionId: definition.id,
      configVersion,
      randomCount: definition.randomCount,
      includeHelpers: definition.includeHelpers,
      helperWeight: definition.helperWeight,
      publicLabel: definition.publicLabel,
      publicDescription: definition.publicDescription,
      payload: definition.payload
    }),
    createdAt
  }));
}

export function publicCompetitionRewards(rewards) {
  const sanitized = sanitizeCompetitionRewards(rewards);
  if (!sanitized) return initialRewardConfig();
  return {
    definitions: sanitized.definitions.map((definition) => ({
      id: definition.id,
      placement: definition.placement,
      rewardType: definition.rewardType,
      distributionMode: definition.distributionMode,
      randomCount: definition.randomCount,
      includeHelpers: definition.includeHelpers,
      helperWeight: definition.includeHelpers ? definition.helperWeight : null,
      publicLabel: definition.publicLabel,
      publicDescription: definition.publicDescription,
      visual: definition.rewardType === "MONEY"
        ? { amount: definition.payload.amount, currency: definition.payload.currency }
        : definition.rewardType === "ITEM" || definition.rewardType === "LORE_ITEM"
          ? { itemKey: definition.payload.itemKey, amount: definition.payload.amount }
          : definition.rewardType === "RANK"
            ? { rank: definition.payload.rank }
            : null
    }))
  };
}
