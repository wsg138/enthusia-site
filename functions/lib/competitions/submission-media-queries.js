
const removeOwnedImageTemplate1Sql = `
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, submissions.competition_id, submissions.id, ?, ?,
             'SUBMISSION_IMAGE_REMOVED', ?, ?, ?
      FROM submissions
      WHERE id = ?
        AND competition_id = ?
        AND owner_subject = ?
        AND revision = ?
        AND status IN ('DRAFT','NEEDS_CHANGES')
        AND removed_at IS NULL
        AND __ENTHUSIA_SQL_PART_0__
        AND EXISTS (
          SELECT 1 FROM submission_images image
          WHERE image.submission_id = submissions.id
            AND image.id = ?
            AND image.removed_at IS NULL
        )
    `;
export function removeOwnedImageTemplate1(part0){return removeOwnedImageTemplate1Sql.replace("__ENTHUSIA_SQL_PART_0__",()=>part0);}

const removeOwnedImageTemplate2Sql = `
      UPDATE submissions
      SET revision = ?, updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND owner_subject = ?
        AND revision = ?
        AND status IN ('DRAFT','NEEDS_CHANGES')
        AND removed_at IS NULL
        AND __ENTHUSIA_SQL_PART_0__
    `;
export function removeOwnedImageTemplate2(part0){return removeOwnedImageTemplate2Sql.replace("__ENTHUSIA_SQL_PART_0__",()=>part0);}

const removeOwnedImageTemplate3Sql = `
      UPDATE submission_images
      SET removed_at = ?, removed_by_uuid = ?
      WHERE submission_id = ?
        AND id = ?
        AND removed_at IS NULL
        AND __ENTHUSIA_SQL_PART_0__
    `;
export function removeOwnedImageTemplate3(part0){return removeOwnedImageTemplate3Sql.replace("__ENTHUSIA_SQL_PART_0__",()=>part0);}

const removeOwnedImageTemplate4Sql = `
      UPDATE submissions
      SET cover_image_id = CASE
        WHEN cover_image_id = ? THEN (
          SELECT id
          FROM submission_images
          WHERE submission_id = ?
            AND removed_at IS NULL
          ORDER BY sort_order ASC, id ASC
          LIMIT 1
        )
        ELSE cover_image_id
      END
      WHERE id = ?
        AND competition_id = ?
        AND owner_subject = ?
        AND revision = ?
        AND __ENTHUSIA_SQL_PART_0__
    `;
export function removeOwnedImageTemplate4(part0){return removeOwnedImageTemplate4Sql.replace("__ENTHUSIA_SQL_PART_0__",()=>part0);}
