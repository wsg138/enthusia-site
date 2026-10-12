PRAGMA foreign_keys = ON;

CREATE TABLE competition_result_drafts (
    competition_id TEXT NOT NULL,
    submission_id TEXT NOT NULL,
    placement INTEGER NOT NULL CHECK (placement >= 1),
    final_score REAL NOT NULL,
    community_component REAL,
    judge_component REAL,
    config_version INTEGER NOT NULL CHECK (config_version >= 1),
    snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
    computed_at TEXT NOT NULL,
    computed_by_uuid TEXT NOT NULL,
    PRIMARY KEY (competition_id, submission_id),
    UNIQUE (competition_id, placement),
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX idx_competition_result_drafts_placement
    ON competition_result_drafts(competition_id, placement);
