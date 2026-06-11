# Negative Scores Implementation Summary

## Changes Made

This document summarizes the changes made to enable negative scores in the Skorbord application while maintaining data integrity and proper game logic.

### 1. UI Changes (PlayerCard.jsx)

**File:** `app/src/components/modern/PlayerCard.jsx`

- **Removed score constraint**: Changed minus button from `disabled={safePlayer.score === 0 || disabled}` to `disabled={safePlayer.score <= -999 || disabled}` to allow scores to go negative down to -999
- **Added visual styling**: Negative scores now display in red (`text-error`) to distinguish them from positive scores
- **Added upper bound**: Plus button now disabled at score >= 999 to match database constraints

### 2. Game Logic Changes

**File:** `app/src/hooks/useGameManager.js`

- **Updated winner detection**: Modified win condition logic to require positive scores for winning
  - Win condition: Players must reach target score AND have positive score
  - Lose condition: Only positive scores are eligible to win when someone hits the lose condition

**File:** `api/utils/helpers.js`

- **Backend winner logic**: Updated `determineWinner()` function to filter out negative scores from potential winners
- Both win and lose conditions now require positive scores to be declared winner

### 3. Statistics Display Changes

**File:** `app/src/components/RivalryStats.jsx`

- **Removed artificial constraints**: Removed `Math.max(0, ...)` constraints that forced all displayed scores to be non-negative
- **Maintained margin logic**: Margins (win/loss) remain positive as they represent distances between scores
- **Updated recent games**: Recent game scores can now display negative values

### 4. API Validation

**File:** `api/routes/stats.js`

- **Added score bounds validation**: Both batch and individual score update endpoints now validate scores stay within -999 to 999 range
- **Environment variable support**: Uses `MIN_SCORE` and `MAX_SCORE` environment variables (defaults to -999/999)
- **Proper error messages**: Clear validation errors when scores would exceed bounds

### 5. Database Schema

**Already Supported:** The database schema already had the constraint `CHECK (score >= -999 AND score <= 999)` in the stats table, so no database changes were needed.

## Game Rules with Negative Scores

### Win Conditions
- **First to X points**: Players must reach the target score AND have a positive score to win
- **Negative scores cannot win**: Even if a player with -5 points reaches a target of 10 points (getting to 5), they cannot win until they have a positive score

### Lose Conditions  
- **Lose when hitting X**: When any player hits the lose condition, the winner is the player with the lowest positive score
- **Negative scores move away from lose condition**: Having negative points in a lose condition game is beneficial as it moves you further from the losing threshold

### Statistics
- **Margins**: Always calculated as absolute distance between scores (e.g., winning 100 to -10 = 110 point margin)
- **Display**: Negative scores are shown in red in the UI for easy identification
- **Bounds**: Scores are constrained between -999 and 999 to match database schema

## Testing Notes

The implementation maintains backward compatibility while adding the new negative score functionality. All existing games and statistics calculations continue to work as before, but now support the full -999 to 999 score range.
