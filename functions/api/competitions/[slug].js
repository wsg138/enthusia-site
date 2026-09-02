import { hasCompetitionDatabase } from "../../lib/competitions/access.js";
import { authorizeCompetitionRead } from "../../lib/competitions/public-access.js";
import { listPublicSubmissionImages } from "../../lib/competitions/public-submission-media.js";
import {
  publicCompetitionDetail,
  publicEntriesVisibleInState,
  publicSubmissionDetail
} from "../../lib/competitions/public.js";
import {
  getPublicCompetitionBySlug,
  listAcceptedPublicParticipantsByCompetition,
  listApprovedPublicSubmissions
} from "../../lib/competitions/repository.js";
import { listPublicResults } from "../../lib/competitions/results.js";
import { listCompetitionJudges } from "../../lib/competitions/judges.js";
import { json, methodNotAllowed } from "../../lib/responses.js";

function competitionSlug(context) {
  const value = typeof context?.params?.slug === "string" ? context.params.slug.trim().toLowerCase() : "";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(value)) return null;
  return value;
}

function groupRows(rows, key = "submissionId") {
  const grouped = new Map();
  for (const row of rows) {
    const id = row[key];
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(row);
  }
  return grouped;
}

const groupParticipants = groupRows;

function publicJudges(judges) {
  return judges.map((judge) => ({
    playerUuid: judge.judgeUuid,
    playerName: judge.judgeName,
    assignedAt: judge.assignedAt
  }));
}

async function hiddenEntryPayload(db, competition) {
  const judges = competition.config?.judging?.enabled
    ? await listCompetitionJudges(db, competition.id)
    : [];
  return {
    competition: publicCompetitionDetail(competition),
    entriesVisible: false,
    submissions: [],
    results: [],
    judges: publicJudges(judges)
  };
}

async function visibleEntryPayload(db, competition) {
  const resultsVisible = ["COMPLETED", "ARCHIVED"].includes(competition.lifecycleState);
  const judgingEnabled = Boolean(competition.config?.judging?.enabled);
  const [submissions, participants, images, results, judges] = await Promise.all([
    listApprovedPublicSubmissions(db, competition.id),
    listAcceptedPublicParticipantsByCompetition(db, competition.id),
    listPublicSubmissionImages(db, competition.id),
    resultsVisible ? listPublicResults(db, competition.id) : Promise.resolve([]),
    judgingEnabled ? listCompetitionJudges(db, competition.id) : Promise.resolve([])
  ]);
  const participantsBySubmission = groupRows(participants);
  const imagesBySubmission = groupRows(images);

  return {
    competition: publicCompetitionDetail(competition),
    entriesVisible: true,
    submissions: submissions.map((submission) => publicSubmissionDetail(
      submission,
      participantsBySubmission.get(submission.id) ?? [],
      imagesBySubmission.get(submission.id) ?? []
    )),
    results,
    judges: publicJudges(judges)
  };
}

function competitionPayload(db, competition) {
  return publicEntriesVisibleInState(competition.lifecycleState)
    ? visibleEntryPayload(db, competition)
    : hiddenEntryPayload(db, competition);
}

export async function onRequestGet(context) {
  const authorized = await authorizeCompetitionRead(context);
  if (authorized.response) return authorized.response;

  if (!hasCompetitionDatabase(context.env)) {
    return json({ error: "competition_database_unavailable" }, 503);
  }

  const slug = competitionSlug(context);
  if (!slug || slug === "admin") return json({ error: "competition_not_found" }, 404);

  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, slug);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    return json(await competitionPayload(context.env.COMPETITIONS_DB, competition));
  } catch {
    return json({ error: "competition_detail_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}

export { competitionPayload, competitionSlug, groupParticipants, groupRows, publicJudges };
