import { defaultRewardDistribution, validateRewardDefinition } from "./rewards.js";

const MAX_REWARDS = 60;
const MAX_PLACEMENT = 100;
const MAX_RANDOM_RECIPIENTS = 100;
const MAX_PUBLIC_LABEL = 100;
const MAX_PUBLIC_DESCRIPTION = 500;
const MAX_PAYLOAD_TEXT = 1000;
const MAX_SAFE_REWARD_AMOUNT = 9_000_000_000_000_000;

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

function text(value, max, { required = false, multiline = false } = {}) {
  if (value === null || value === undefined || value === "") return required ? null : "";
  if (typeof value !== "string") return null;
  const normalized = multiline
    ? value.replace(/\r\n?/g, "\n").trim()
    : value.trim().replace(/\s+/g, " ");
  if ((required && !normalized) || normalized.length > max) return null;
  return normalized;
}

function identifier(value, max = 128) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max && /^[A-Za-z0-9._:-]+$/.test(normalized)
    ? normalized
    : null;
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

function sanitizePayload(rewardType, payload) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};

  if (rewardType === "MONEY") {
    const amount = nonNegativeSafeInteger(source.amount);
    const currency = identifier(source.currency ?? "balance", 48);
    if (amount === null || !currency) return null;
    return { amount, currency };
  }

  if (rewardType === "ITEM" || rewardType === "LORE_ITEM") {
    const itemKey = identifier(source.itemKey, 160);
    const amount = positiveInteger(source.amount ?? 1, 2304);
    if (!itemKey || amount === null) return null;
    return { itemKey, amount };
  }

  if (rewardType === "PERMISSION") {
    const permission = identifier(source.permission, 160);
    const durationMinutes = optionalDurationMinutes(source.durationMinutes);
    if (!permission || durationMinutes === undefined) return null;
    return { permission, durationMinutes };
  }

  if (rewardType === "RANK") {
    const rank = identifier(source.rank, 96);
    const durationMinutes = optionalDurationMinutes(source.durationMinutes);
    if (!rank || durationMinutes === undefined) return null;
    return { rank, durationMinutes };
  }

  if (rewardType === "COMMAND") {
    if (typeof source.command !== "string" || /[\r\n]/.test(source.command)) return null;
    const command = text(source.command, 500, { required: true });
    if (!command) return null;
    return { command };
  }

  if (rewardType === "MANUAL") {
    const instructions = text(source.instructions, MAX_PAYLOAD_TEXT, { required: true, multiline: true });
    return instructions ? { instructions } : null;
  }

  return null;
}

export function initialRewardConfig() {
  return { definitions: [] };
}

export function sanitizeCompetitionRewards(input) {
  const source = input === null || input === undefined ? {} : input;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;

  const rawDefinitions = source.definitions ?? [];
  if (!Array.isArray(rawDefinitions) || rawDefinitions.length > MAX_REWARDS) return null;

  const definitions = [];
  const ids = new Set();
  for (const raw of rawDefinitions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    const id = identifier(raw.id, 48);
    const placement = positiveInteger(raw.placement, MAX_PLACEMENT);
    const rewardType = raw.rewardType;
    if (!id || ids.has(id) || placement === null || !REWARD_TYPES.has(rewardType)) return null;

    const distributionMode = raw.distributionMode ?? defaultRewardDistribution(rewardType);
    if (!DISTRIBUTION_MODES.has(distributionMode)) return null;

    const randomCount = distributionMode === "RANDOM_ELIGIBLE" || distributionMode === "RANDOM_GUILD_MEMBERS"
      ? positiveInteger(raw.randomCount, MAX_RANDOM_RECIPIENTS)
      : null;

    const includeHelpers = raw.includeHelpers === undefined ? false : raw.includeHelpers;
    if (typeof includeHelpers !== "boolean") return null;
    const helperWeight = includeHelpers
      ? (raw.helperWeight === undefined ? 0.5 : raw.helperWeight)
      : 0;
    if (
      typeof helperWeight !== "number"
      || !Number.isFinite(helperWeight)
      || helperWeight < 0
      || helperWeight > 1
      || (includeHelpers && helperWeight === 0)
    ) return null;

    const publicLabel = text(raw.publicLabel, MAX_PUBLIC_LABEL, { required: true });
    const publicDescription = text(raw.publicDescription, MAX_PUBLIC_DESCRIPTION, { required: true, multiline: true });
    const payload = sanitizePayload(rewardType, raw.payload);
    if (!publicLabel || !publicDescription || !payload) return null;

    const definition = {
      id,
      placement,
      rewardType,
      distributionMode,
      randomCount,
      includeHelpers,
      helperWeight,
      publicLabel,
      publicDescription,
      payload
    };
    if (validateRewardDefinition(definition).length) return null;

    ids.add(id);
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
