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
    const command = text(source.command, 500, { required: true });
    if (!command || /[\r\n]/.test(command)) return null;
    return { command };
  }

  if (rewardType === "MANUAL") {
    const instructions = text(source.instructions, MAX_PAYLOAD_TEXT, { required: true, multiline: true });
    return instructions ? { instructions } : null;
  }

  return null;
}

export function initialRewardConfig() {
  return {
    helperRewardMultiplier: 0.5,
    definitions: []
  };
}

export function sanitizeCompetitionRewards(input) {
  const source = input === null || input === undefined ? {} : input;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;

  const helperRewardMultiplier = source.helperRewardMultiplier === null || source.helperRewardMultiplier === undefined
    ? 0.5
    : source.helperRewardMultiplier;
  if (
    typeof helperRewardMultiplier !== "number"
    || !Number.isFinite(helperRewardMultiplier)
    || helperRewardMultiplier < 0
    || helperRewardMultiplier > 1
  ) return null;

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
      publicLabel,
      publicDescription,
      payload
    };
    if (validateRewardDefinition(definition).length) return null;

    ids.add(id);
    definitions.push(definition);
  }

  definitions.sort((left, right) => left.placement - right.placement || left.id.localeCompare(right.id));
  return { helperRewardMultiplier, definitions };
}

export function publicCompetitionRewards(rewards) {
  const sanitized = sanitizeCompetitionRewards(rewards);
  if (!sanitized) return initialRewardConfig();
  return {
    helperRewardMultiplier: sanitized.helperRewardMultiplier,
    definitions: sanitized.definitions.map((definition) => ({
      id: definition.id,
      placement: definition.placement,
      rewardType: definition.rewardType,
      distributionMode: definition.distributionMode,
      randomCount: definition.randomCount,
      publicLabel: definition.publicLabel,
      publicDescription: definition.publicDescription
    }))
  };
}
