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

    const entriesVisible = publicEntriesVisibleInState(competition.lifecycleState);
    if (!entriesVisible) {
      return json({
        competition: publicCompetitionDetail(competition),
        entriesVisible: false,
        submissions: [],
        results: []
      });
    }

    const resultsVisible = ["COMPLETED", "ARCHIVED"].includes(competition.lifecycleState);
    const [submissions, participants, images, results] = await Promise.all([
      listApprovedPublicSubmissions(context.env.COMPETITIONS_DB, competition.id),
      listAcceptedPublicParticipantsByCompetition(context.env.COMPETITIONS_DB, competition.id),
      listPublicSubmissionImages(context.env.COMPETITIONS_DB, competition.id),
      resultsVisible ? listPublicResults(context.env.COMPETITIONS_DB, competition.id) : Promise.resolve([])
    ]);
    const participantsBySubmission = groupRows(participants);
    const imagesBySubmission = groupRows(images);

    return json({
      competition: publicCompetitionDetail(competition),
      entriesVisible: true,
      submissions: submissions.map((submission) => publicSubmissionDetail(
        submission,
        participantsBySubmission.get(submission.id) ?? [],
        imagesBySubmission.get(submission.id) ?? []
      )),
      results
    });
  } catch {
    return json({ error: "competition_detail_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}

export { competitionSlug, groupRows };
