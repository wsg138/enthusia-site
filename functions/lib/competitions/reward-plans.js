import { participantRewardWeight } from "./participants.js";
import {
  rewardOperationKey,
  selectRewardRecipients,
  splitWeightedIntegerReward
} from "./rewards.js";

function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Competition database binding is unavailable");
  return db;
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function parseReward(row) {
  const config = JSON.parse(row.configJson);
  return {
    id: row.id,
    competitionId: row.competitionId,
    placement: Number(row.placement),
    rewardType: row.rewardType,
    distributionMode: row.distributionMode,
    config
  };
}

export async function listPublishedCompetitionRewardDefinitions(db, competitionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      id,
      competition_id AS competitionId,
      placement,
      reward_type AS rewardType,
      distribution_mode AS distributionMode,
      config_json AS configJson,
      created_at AS createdAt
    FROM reward_definitions
    WHERE competition_id = ?
    ORDER BY placement ASC, id ASC
  `).bind(competitionId).all();
  return rows(result).map(parseReward);
}

export async function listResultRecipientsContext(db, competitionId) {
  const database = requireDatabase(db);
  const [resultRows, participantRows, judgeRows] = await Promise.all([
    database.prepare(`
      SELECT
        r.submission_id AS submissionId,
        r.placement,
        s.entry_type AS entryType,
        s.owner_uuid AS ownerUuid,
        s.owner_name AS ownerName,
        s.guild_id AS guildId,
        s.guild_name_snapshot AS guildName
      FROM competition_results r
      JOIN submissions s ON s.id = r.submission_id
      WHERE r.competition_id = ?
      ORDER BY r.placement ASC, r.submission_id ASC
    `).bind(competitionId).all(),
    database.prepare(`
      SELECT
        p.submission_id AS submissionId,
        p.player_uuid AS playerUuid,
        p.player_name AS playerName,
        p.participant_role AS role,
        p.invite_status AS inviteStatus,
        p.responded_at AS respondedAt
      FROM submission_participants p
      JOIN submissions s ON s.id = p.submission_id
      WHERE s.competition_id = ?
        AND p.invite_status = 'ACCEPTED'
      ORDER BY p.submission_id ASC, p.player_uuid ASC
    `).bind(competitionId).all(),
    database.prepare(`
      SELECT DISTINCT COALESCE(linked.minecraft_uuid, j.judge_uuid) AS judgeUuid
      FROM competition_judges j
      LEFT JOIN competition_minecraft_links selected
        ON selected.minecraft_uuid = j.judge_uuid
      LEFT JOIN competition_minecraft_links linked
        ON linked.discord_user_id = selected.discord_user_id
      WHERE j.competition_id = ?
    `).bind(competitionId).all()
  ]);

  const participants = new Map();
  for (const participant of rows(participantRows)) {
    if (!participants.has(participant.submissionId)) participants.set(participant.submissionId, []);
    participants.get(participant.submissionId).push(participant);
  }
  const judgeUuids = new Set(rows(judgeRows).map((row) => row.judgeUuid).filter(Boolean));
  return rows(resultRows).map((result) => ({
    ...result,
    placement: Number(result.placement),
    participants: participants.get(result.submissionId) ?? [],
    judgeUuids
  }));
}

function eligibleParticipants(context, reward) {
  const includeHelpers = Boolean(reward.config.includeHelpers);
  const helperWeight = Number(reward.config.helperWeight ?? 0.5);
  const candidates = [];
  const seen = new Set();

  const add = (playerUuid, role, playerName = null) => {
    if (!playerUuid || seen.has(playerUuid)) return;
    const isAssignedJudge = context.judgeUuids.has(playerUuid);
    const weight = participantRewardWeight({
      entryType: context.entryType,
      role,
      isAssignedJudge,
      includeHelpers,
      helperWeight
    });
    if (weight <= 0) return;
    seen.add(playerUuid);
    candidates.push({ playerUuid, playerName, role, weight });
  };

  if (context.entryType !== "GUILD") add(context.ownerUuid, "OWNER", context.ownerName);
  for (const participant of context.participants) {
    add(participant.playerUuid, participant.role, participant.playerName);
  }
  return candidates.sort((left, right) => left.playerUuid.localeCompare(right.playerUuid));
}

function fullDetail(reward) {
  return {
    rewardType: reward.rewardType,
    publicLabel: reward.config.publicLabel,
    publicDescription: reward.config.publicDescription,
    payload: reward.config.payload,
    sourceDefinitionId: reward.config.sourceDefinitionId,
    configVersion: reward.config.configVersion
  };
}

function delivery(reward, context, recipientUuid, detail, state = "PENDING") {
  return {
    id: crypto.randomUUID(),
    rewardId: reward.id,
    submissionId: context.submissionId,
    recipientUuid,
    operationKey: rewardOperationKey(reward.id, context.submissionId, recipientUuid ?? "entry"),
    state,
    detail: { ...fullDetail(reward), ...detail }
  };
}

export function planRewardForResult(reward, context, { guildMemberUuids = null } = {}) {
  const candidates = eligibleParticipants(context, reward);
  const eligibleUuids = candidates.map((candidate) => candidate.playerUuid);
  const guildMembers = Array.isArray(guildMemberUuids)
    ? [...new Set(guildMemberUuids.map(String))]
        .filter((uuid) => !context.judgeUuids.has(uuid))
        .sort()
    : null;

  if (
    (reward.distributionMode === "ALL_GUILD_MEMBERS" || reward.distributionMode === "RANDOM_GUILD_MEMBERS")
    && context.entryType !== "GUILD"
  ) throw new TypeError("Guild-wide reward mode requires a guild entry");

  if (
    (reward.distributionMode === "ALL_GUILD_MEMBERS" || reward.distributionMode === "RANDOM_GUILD_MEMBERS")
    && !guildMembers
  ) {
    return {
      ready: false,
      dependency: "guild_members",
      guildId: context.guildId,
      rewardId: reward.id,
      submissionId: context.submissionId,
      deliveries: []
    };
  }

  if (reward.distributionMode === "MANUAL") {
    return {
      ready: true,
      deliveries: [delivery(reward, context, null, { manual: true }, "MANUAL")]
    };
  }

  const selected = selectRewardRecipients({
    distributionMode: reward.distributionMode,
    ownerUuid: context.ownerUuid,
    eligibleParticipantUuids: eligibleUuids,
    guildMemberUuids: guildMembers ?? [],
    randomCount: reward.config.randomCount ?? 1,
    selectionSeed: `${reward.id}:${context.submissionId}:${reward.config.configVersion}`
  });

  if (!selected.length) {
    return {
      ready: true,
      deliveries: [delivery(reward, context, null, { skippedReason: "no_eligible_recipients" }, "SKIPPED")]
    };
  }

  const payload = reward.config.payload ?? {};
  if (reward.distributionMode === "SPLIT_ELIGIBLE" && (reward.rewardType === "MONEY" || reward.rewardType === "ITEM")) {
    const total = Number(payload.amount);
    const weights = candidates
      .filter((candidate) => selected.includes(candidate.playerUuid))
      .map((candidate) => ({ recipientUuid: candidate.playerUuid, weight: candidate.weight }));
    const shares = splitWeightedIntegerReward(total, weights).filter((share) => share.amount > 0);
    return {
      ready: true,
      deliveries: shares.map((share) => delivery(reward, context, share.recipientUuid, {
        amount: share.amount,
        splitTotal: total
      }))
    };
  }

  return {
    ready: true,
    deliveries: selected.map((recipientUuid) => delivery(reward, context, recipientUuid, {
      amount: reward.rewardType === "ITEM" ? Number(payload.amount ?? 1) : undefined
    }))
  };
}

export async function buildCompetitionRewardPlan(db, competitionId, { guildMembersByGuildId = {} } = {}) {
  const [rewards, contexts] = await Promise.all([
    listPublishedCompetitionRewardDefinitions(db, competitionId),
    listResultRecipientsContext(db, competitionId)
  ]);
  const byPlacement = new Map();
  for (const reward of rewards) {
    if (!byPlacement.has(reward.placement)) byPlacement.set(reward.placement, []);
    byPlacement.get(reward.placement).push(reward);
  }

  const deliveries = [];
  const dependencies = [];
  for (const context of contexts) {
    for (const reward of byPlacement.get(context.placement) ?? []) {
      const planned = planRewardForResult(reward, context, {
        guildMemberUuids: context.guildId ? guildMembersByGuildId[context.guildId] : null
      });
      deliveries.push(...planned.deliveries);
      if (!planned.ready) dependencies.push({
        dependency: planned.dependency,
        guildId: planned.guildId,
        rewardId: planned.rewardId,
        submissionId: planned.submissionId
      });
    }
  }

  return { ready: dependencies.length === 0, deliveries, dependencies };
}
