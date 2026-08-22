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

const NON_DIVISIBLE_TYPES = new Set([
  "PERMISSION",
  "RANK",
  "LORE_ITEM",
  "COMMAND",
  "MANUAL"
]);

function uniqueSorted(values) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort();
}

export function defaultRewardDistribution(rewardType) {
  if (rewardType === "MONEY" || rewardType === "ITEM") return "SPLIT_ELIGIBLE";
  if (rewardType === "MANUAL") return "MANUAL";
  if (REWARD_TYPES.has(rewardType)) return "OWNER_ONLY";
  return null;
}

export function validateRewardDefinition(definition) {
  const errors = [];
  if (!REWARD_TYPES.has(definition?.rewardType)) errors.push("reward_type_invalid");
  if (!Number.isInteger(definition?.placement) || definition.placement < 1) errors.push("placement_invalid");
  if (!DISTRIBUTION_MODES.has(definition?.distributionMode)) errors.push("distribution_mode_invalid");

  if (
    NON_DIVISIBLE_TYPES.has(definition?.rewardType)
    && definition?.distributionMode === "SPLIT_ELIGIBLE"
  ) {
    errors.push("non_divisible_reward_cannot_split");
  }

  if (
    (definition?.distributionMode === "RANDOM_ELIGIBLE"
      || definition?.distributionMode === "RANDOM_GUILD_MEMBERS")
    && (!Number.isInteger(definition?.randomCount) || definition.randomCount < 1)
  ) {
    errors.push("random_recipient_count_invalid");
  }

  if (definition?.rewardType === "MANUAL" && definition?.distributionMode !== "MANUAL") {
    errors.push("manual_reward_requires_manual_distribution");
  }

  return errors;
}

function takeRandom(values, count, random) {
  const pool = [...values];
  const selected = [];
  while (pool.length && selected.length < count) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    selected.push(pool.splice(index, 1)[0]);
  }
  return selected.sort();
}

export function selectRewardRecipients({
  distributionMode,
  ownerUuid,
  eligibleParticipantUuids = [],
  guildMemberUuids = [],
  randomCount = 1,
  random = Math.random
}) {
  const eligible = uniqueSorted(eligibleParticipantUuids);
  const guildMembers = uniqueSorted(guildMemberUuids);

  switch (distributionMode) {
    case "OWNER_ONLY":
      return ownerUuid ? [String(ownerUuid)] : [];
    case "SPLIT_ELIGIBLE":
    case "EACH_ELIGIBLE":
      return eligible;
    case "RANDOM_ELIGIBLE":
      return takeRandom(eligible, randomCount, random);
    case "ALL_GUILD_MEMBERS":
      return guildMembers;
    case "RANDOM_GUILD_MEMBERS":
      return takeRandom(guildMembers, randomCount, random);
    case "MANUAL":
      return [];
    default:
      return [];
  }
}

export function splitIntegerReward(totalAmount, recipientUuids) {
  if (!Number.isSafeInteger(totalAmount) || totalAmount < 0) {
    throw new TypeError("Reward amount must be a non-negative safe integer");
  }

  const recipients = uniqueSorted(recipientUuids);
  if (!recipients.length) return [];

  const base = Math.floor(totalAmount / recipients.length);
  let remainder = totalAmount % recipients.length;

  return recipients.map((recipientUuid) => {
    const amount = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return { recipientUuid, amount };
  });
}

export function rewardOperationKey(rewardId, submissionId, recipientUuid = "entry") {
  const safe = [rewardId, submissionId, recipientUuid].map((value) => String(value ?? "").trim());
  if (safe.some((value) => !value || !/^[A-Za-z0-9._:-]+$/.test(value))) {
    throw new TypeError("Reward operation key components are invalid");
  }
  return `competition-reward:${safe.join(":")}`;
}
