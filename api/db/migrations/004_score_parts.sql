-- +migrate Up
-- Score parts: a game type can split a round's points into named parts.
-- Cribbage tracks play (pegging), hand and crib. round_scores.points stays the
-- total of the parts, so totals, history and the winner rule are unchanged.
-- The part columns are NULL for games and rounds that do not track parts.

ALTER TABLE game_types ADD COLUMN score_parts TEXT;
UPDATE game_types SET score_parts = '["play","hand","crib"]' WHERE id = 'cribbage';

ALTER TABLE round_scores ADD COLUMN play_points INTEGER;
ALTER TABLE round_scores ADD COLUMN hand_points INTEGER;
ALTER TABLE round_scores ADD COLUMN crib_points INTEGER;

-- which part a change touched (NULL for a plain total change)
ALTER TABLE score_audit ADD COLUMN part TEXT;
