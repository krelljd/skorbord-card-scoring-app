-- +migrate Up
-- Support for the round workflow.
-- abandoned_at: a new game no longer deletes the board's unfinished game; it marks it
--   abandoned, so its scores and rounds are kept and it is never offered as "active" again.
-- op_id: client-generated id for a score write, so a retried or replayed request
--   (double tap, offline queue) is applied once.

ALTER TABLE games ADD COLUMN abandoned_at TIMESTAMP;

ALTER TABLE score_audit ADD COLUMN op_id TEXT;
CREATE UNIQUE INDEX idx_score_audit_op ON score_audit (op_id) WHERE op_id IS NOT NULL;
