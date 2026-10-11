export const OWNER_SUBMISSION_EDIT_GUARD_SQL = `EXISTS (
  SELECT 1
  FROM competitions competition
  WHERE competition.id = submissions.competition_id
    AND competition.current_config_version = ?
    AND (
      (competition.lifecycle_state = 'SUBMISSIONS_OPEN' AND submissions.status = 'DRAFT')
      OR (
        competition.lifecycle_state = 'REVIEW'
        AND submissions.status = 'NEEDS_CHANGES'
        AND ? IS NOT NULL
        AND ? <= ?
      )
    )
)`;

export const STAFF_SUBMISSION_EDIT_GUARD_SQL = `EXISTS (
  SELECT 1
  FROM competitions competition
  WHERE competition.id = submissions.competition_id
    AND competition.current_config_version = ?
    AND competition.lifecycle_state IN ('SUBMISSIONS_OPEN','REVIEW')
)`;

export const OWNER_SUBMISSION_WITHDRAW_GUARD_SQL = `EXISTS (
  SELECT 1
  FROM competitions competition
  WHERE competition.id = submissions.competition_id
    AND competition.current_config_version = ?
    AND competition.lifecycle_state IN ('SUBMISSIONS_OPEN','REVIEW')
)`;

function configVersion(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError("Competition config version is invalid");
  }
  return value;
}

function timestamp(value, label) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} is invalid`);
  return new Date(parsed).toISOString();
}

export function ownerSubmissionEditPolicy({
  expectedConfigVersion,
  operationAt,
  reviewCloseAt = null
}) {
  return {
    configVersion: configVersion(expectedConfigVersion),
    operationAt: timestamp(operationAt, "Submission edit timestamp"),
    reviewCloseAt: reviewCloseAt === null
      ? null
      : timestamp(reviewCloseAt, "Submission review deadline")
  };
}

export function staffSubmissionEditPolicy(expectedConfigVersion) {
  return { configVersion: configVersion(expectedConfigVersion) };
}

export function ownerSubmissionWithdrawPolicy(expectedConfigVersion) {
  return { configVersion: configVersion(expectedConfigVersion) };
}
