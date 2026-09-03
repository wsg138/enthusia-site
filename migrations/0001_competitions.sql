PRAGMA foreign_keys = ON;

CREATE TABLE competitions (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN (
        'DRAFT','UPCOMING','SUBMISSIONS_OPEN','REVIEW','VOTING','JUDGING',
        'RESULTS_READY','COMPLETED','ARCHIVED','CANCELLED'
    )),
    current_config_version INTEGER NOT NULL DEFAULT 1 CHECK (current_config_version >= 1),
    created_by_subject TEXT NOT NULL,
    created_by_uuid TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT,
    archived_at TEXT,
    cancelled_at TEXT
);

CREATE INDEX idx_competitions_lifecycle ON competitions(lifecycle_state);
CREATE INDEX idx_competitions_published ON competitions(published_at);

CREATE TABLE competition_config_versions (
    competition_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version >= 1),
    config_json TEXT NOT NULL,
    created_by_subject TEXT NOT NULL,
    created_by_uuid TEXT NOT NULL,
    created_at TEXT NOT NULL,
    change_note TEXT,
    PRIMARY KEY (competition_id, version),
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE TABLE competition_judges (
    competition_id TEXT NOT NULL,
    judge_uuid TEXT NOT NULL,
    judge_name TEXT NOT NULL,
    assigned_by_uuid TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    removed_at TEXT,
    can_view_coordinates INTEGER NOT NULL DEFAULT 0 CHECK (can_view_coordinates IN (0,1)),
    PRIMARY KEY (competition_id, judge_uuid),
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE INDEX idx_competition_judges_active
    ON competition_judges(competition_id, removed_at);

CREATE TABLE submissions (
    id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('SOLO','GROUP','GUILD')),
    status TEXT NOT NULL CHECK (status IN (
        'DRAFT','PENDING_REVIEW','NEEDS_CHANGES','APPROVED','REJECTED',
        'DISQUALIFIED','WITHDRAWN','REMOVED'
    )),
    owner_subject TEXT NOT NULL,
    owner_uuid TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    guild_id TEXT,
    guild_name_snapshot TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    cover_image_id TEXT,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    staff_edited INTEGER NOT NULL DEFAULT 0 CHECK (staff_edited IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    submitted_at TEXT,
    approved_at TEXT,
    withdrawn_at TEXT,
    removed_at TEXT,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    CHECK (
        (entry_type = 'GUILD' AND guild_id IS NOT NULL AND guild_name_snapshot IS NOT NULL)
        OR
        (entry_type <> 'GUILD' AND guild_id IS NULL)
    )
);

CREATE INDEX idx_submissions_competition_status
    ON submissions(competition_id, status);
CREATE INDEX idx_submissions_owner
    ON submissions(competition_id, owner_uuid);
CREATE INDEX idx_submissions_guild
    ON submissions(competition_id, guild_id);

-- Coordinates are intentionally kept out of the public submission row so a
-- public projection cannot leak them by accidentally serializing submissions.*.
CREATE TABLE submission_private_locations (
    submission_id TEXT PRIMARY KEY,
    world_name TEXT NOT NULL,
    block_x INTEGER NOT NULL,
    block_y INTEGER NOT NULL,
    block_z INTEGER NOT NULL,
    exact_coordinates_confirmed INTEGER NOT NULL DEFAULT 0
        CHECK (exact_coordinates_confirmed IN (0,1)),
    updated_at TEXT NOT NULL,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE TABLE submission_participants (
    submission_id TEXT NOT NULL,
    player_uuid TEXT NOT NULL,
    player_name TEXT NOT NULL,
    participant_role TEXT NOT NULL CHECK (participant_role IN (
        'OWNER','MAIN','HELPER','GUILD_WORKER'
    )),
    invite_status TEXT NOT NULL CHECK (invite_status IN (
        'PENDING','ACCEPTED','DECLINED'
    )),
    invited_by_uuid TEXT,
    invited_at TEXT NOT NULL,
    responded_at TEXT,
    PRIMARY KEY (submission_id, player_uuid),
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX idx_submission_participants_player
    ON submission_participants(player_uuid, invite_status);
CREATE INDEX idx_submission_participants_submission
    ON submission_participants(submission_id, participant_role, invite_status);

CREATE TABLE submission_images (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
    storage_key TEXT NOT NULL UNIQUE,
    sha256 TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    moderation_state TEXT NOT NULL DEFAULT 'PENDING' CHECK (moderation_state IN (
        'PENDING','PASSED','REVIEW','BLOCKED','ERROR'
    )),
    created_at TEXT NOT NULL,
    removed_at TEXT,
    removed_by_uuid TEXT,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    UNIQUE (submission_id, sort_order)
);

CREATE INDEX idx_submission_images_submission
    ON submission_images(submission_id, removed_at, sort_order);

CREATE TABLE moderation_checks (
    id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL,
    submission_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN (
        'TITLE','DESCRIPTION','IMAGE'
    )),
    target_id TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN (
        'PASSED','REVIEW','BLOCKED','ERROR'
    )),
    categories_json TEXT NOT NULL,
    scores_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX idx_moderation_submission
    ON moderation_checks(submission_id, target_type, checked_at);

CREATE TABLE submission_moderation (
    submission_id TEXT PRIMARY KEY,
    public_reason TEXT,
    private_note TEXT,
    reviewed_by_uuid TEXT,
    reviewed_at TEXT,
    disqualified_at TEXT,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE TABLE votes (
    competition_id TEXT NOT NULL,
    voter_subject TEXT NOT NULL,
    voter_uuid TEXT NOT NULL,
    submission_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (competition_id, voter_subject, submission_id),
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX idx_votes_submission ON votes(competition_id, submission_id);
CREATE INDEX idx_votes_voter ON votes(competition_id, voter_subject);

CREATE TABLE judge_scores (
    competition_id TEXT NOT NULL,
    submission_id TEXT NOT NULL,
    judge_uuid TEXT NOT NULL,
    config_version INTEGER NOT NULL,
    criteria_json TEXT NOT NULL,
    bonus_points REAL NOT NULL DEFAULT 0,
    computed_score REAL NOT NULL,
    public_feedback TEXT,
    private_note TEXT,
    submitted_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (competition_id, submission_id, judge_uuid),
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX idx_judge_scores_competition
    ON judge_scores(competition_id, judge_uuid);

CREATE TABLE competition_results (
    competition_id TEXT NOT NULL,
    submission_id TEXT NOT NULL,
    placement INTEGER NOT NULL CHECK (placement >= 1),
    final_score REAL NOT NULL,
    community_component REAL,
    judge_component REAL,
    config_version INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    published_at TEXT NOT NULL,
    PRIMARY KEY (competition_id, submission_id),
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    UNIQUE (competition_id, placement)
);

CREATE TABLE reward_definitions (
    id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL,
    placement INTEGER NOT NULL CHECK (placement >= 1),
    reward_type TEXT NOT NULL CHECK (reward_type IN (
        'MONEY','ITEM','PERMISSION','RANK','LORE_ITEM','COMMAND','MANUAL'
    )),
    distribution_mode TEXT NOT NULL,
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE INDEX idx_reward_definitions_competition
    ON reward_definitions(competition_id, placement);

CREATE TABLE reward_deliveries (
    id TEXT PRIMARY KEY,
    reward_id TEXT NOT NULL,
    submission_id TEXT NOT NULL,
    recipient_uuid TEXT,
    operation_key TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL CHECK (state IN (
        'PENDING','DELIVERING','DELIVERED','FAILED','SKIPPED','MANUAL'
    )),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    detail_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    delivered_at TEXT,
    FOREIGN KEY (reward_id) REFERENCES reward_definitions(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX idx_reward_deliveries_pending
    ON reward_deliveries(state, updated_at);

CREATE TABLE competition_audit_events (
    id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL,
    submission_id TEXT,
    actor_subject TEXT NOT NULL,
    actor_uuid TEXT NOT NULL,
    action TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL
);

CREATE INDEX idx_competition_audit
    ON competition_audit_events(competition_id, created_at);
CREATE INDEX idx_submission_audit
    ON competition_audit_events(submission_id, created_at);
