-- +migrate Up
-- 004 switched on score parts only for the game type whose id is 'cribbage'. A database
-- whose Cribbage type has another id (created by hand, or renamed) got no parts.
-- Match by name as well. Safe to run twice: it only fills a column that is still empty.

UPDATE game_types
SET score_parts = '["play","hand","crib"]'
WHERE score_parts IS NULL AND lower(trim(name)) = 'cribbage';
