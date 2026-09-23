function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("Competition database binding is unavailable");
  }
  return db;
}

function requireWritableDatabase(db) {
  const database = requireDatabase(db);
  if (typeof database.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return database;
}

function uniqueIds(values) {
  if (!Array.isArray(values)) throw new TypeError("Ballot selections must be an array");
  const normalized = values.map((value) => String(value ?? "").trim().toLowerCase());
  if (normalized.some((value) => !value)) throw new TypeError("Ballot selection is invalid");
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError("Ballot selections must be unique");
  }
  return normalized;
}

export async function getCompetitionBallot(db, competitionId, voterSubject) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT submission_id AS submissionId, voter_uuid AS voterUuid, created_at AS createdAt, updated_at AS updatedAt
    FROM votes
    WHERE competition_id = ?
      AND voter_subject = ?
    ORDER BY submission_id ASC
  `).bind(competitionId, voterSubject).all();
  return Array.isArray(result?.results) ? result.results : [];
}

export async function replaceCompetitionBallot(db, ballot) {
  const database = requireWritableDatabase(db);
  const submissionIds = uniqueIds(ballot.submissionIds);
  const statements = [
    database.prepare(`
      DELETE FROM votes
      WHERE competition_id = ?
        AND voter_subject = ?
    `).bind(ballot.competitionId, ballot.voterSubject)
  ];

  for (const submissionId of submissionIds) {
    statements.push(database.prepare(`
      INSERT INTO votes (
        competition_id, voter_subject, voter_uuid, submission_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      ballot.competitionId,
      ballot.voterSubject,
      ballot.voterUuid,
      submissionId,
      ballot.updatedAt,
      ballot.updatedAt
    ));
  }

  await database.batch(statements);
  return submissionIds;
}

export async function listCompetitionVoteTotals(db, competitionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      s.id AS submissionId,
      s.title,
      COUNT(v.submission_id) AS voteCount
    FROM submissions s
    LEFT JOIN votes v
      ON v.competition_id = s.competition_id
     AND v.submission_id = s.id
    WHERE s.competition_id = ?
      AND s.status = 'APPROVED'
      AND s.removed_at IS NULL
    GROUP BY s.id, s.title
    ORDER BY voteCount DESC, s.id ASC
  `).bind(competitionId).all();
  return (Array.isArray(result?.results) ? result.results : []).map((row) => ({
    submissionId: row.submissionId,
    title: row.title,
    voteCount: Number(row.voteCount)
  }));
}

export async function countCompetitionBallots(db, competitionId) {
  const database = requireDatabase(db);
  const row = await database.prepare(`
    SELECT COUNT(DISTINCT voter_subject) AS ballotCount
    FROM votes
    WHERE competition_id = ?
  `).bind(competitionId).first();
  return Number(row?.ballotCount ?? 0);
}
