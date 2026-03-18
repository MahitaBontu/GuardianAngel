/**
 * @file credibility.js
 * @description Community verification engine for Guardian Angel.
 *
 * Manages the peer review pipeline that moves reports through three states:
 *
 *   pending  → The default state. Report is visible on the map but dimmed.
 *   verified → 3 or more confirm votes received. Report is fully visible.
 *   removed  → 3 or more flag votes received. Report is hidden from the map.
 *
 * CREDIBILITY SCORE FORMULA
 * ─────────────────────────
 *   score = clamp(30 + (confirms × 15) - (flags × 20), 0, 100)
 *
 *   - All reports start at a base score of 30 (pending, low trust)
 *   - Each confirm vote adds 15 points
 *   - Each flag vote subtracts 20 points
 *   - Score is clamped to the range 0–100
 *
 * ANTI-GAMING PROTECTION
 * ──────────────────────
 * The votes table enforces a UNIQUE constraint on (report_id, user_id)
 * at the database level. This makes double voting impossible regardless
 * of what the frontend does — the insert will be rejected by Postgres
 * before this function can process it.
 *
 * @module credibility
 */

import { supabase } from './supabase'

/**
 * Casts a community vote on a report and recalculates its credibility score.
 *
 * Execution steps:
 *   1. Insert the vote into the votes table.
 *      The UNIQUE(report_id, user_id) constraint rejects duplicates at DB level.
 *   2. Fetch all existing votes for this report to recalculate totals.
 *   3. Apply the credibility formula to compute the new score and status.
 *   4. Update the report row with the new score, status, and vote counts.
 *
 * @async
 * @param {string} reportId - UUID of the report being voted on
 * @param {string} userId   - UUID of the user casting the vote
 * @param {string} voteType - 'confirm' (supports the report) or
 *                            'flag' (challenges the report's accuracy)
 * @returns {Promise<{ score: number, status: string } | { error: Object }>}
 *   Returns the updated score and status on success, or an error object
 *   if the insert fails (e.g. duplicate vote rejected by the DB constraint).
 */
export async function castVote(reportId, userId, voteType) {

  // Step 1: Insert the vote.
  // The database UNIQUE constraint on (report_id, user_id) ensures
  // each user can only vote once per report. If a duplicate is attempted,
  // Supabase returns an error here and the function exits early.
  const { error } = await supabase.from('votes').insert({
    report_id: reportId,
    user_id:   userId,
    vote_type: voteType,
  })

  // Return the error immediately — do not update the report score
  if (error) return { error }

  // Step 2: Fetch all votes for this report to get accurate totals.
  // We re-query rather than incrementing locally to ensure consistency
  // in case multiple users are voting concurrently.
  const { data: votes } = await supabase
    .from('votes')
    .select('vote_type')
    .eq('report_id', reportId)

  const confirms = votes.filter(v => v.vote_type === 'confirm').length
  const flags    = votes.filter(v => v.vote_type === 'flag').length

  // Step 3: Apply the credibility formula.
  //   Base score of 30 + confirm bonus - flag penalty, clamped to 0–100.
  //   Flags carry a higher weight (-20) than confirms (+15) to penalize
  //   reports that the community identifies as inaccurate or misleading.
  const score = Math.max(0, Math.min(100, 30 + (confirms * 15) - (flags * 20)))

  // Step 4: Determine report status based on vote thresholds.
  //   verified → community has validated the report (3+ confirms)
  //   removed  → community has rejected the report (3+ flags)
  //   pending  → not enough votes either way to make a determination
  const status = confirms >= 3 ? 'verified'
               : flags >= 3    ? 'removed'
               : 'pending'

  // Step 5: Persist the updated score, status, and vote counts to the report.
  // upvotes and flags are stored as denormalized counts for fast read access
  // without requiring a COUNT query on the votes table each time.
  await supabase
    .from('reports')
    .update({
      credibility_score: score,
      status,
      upvotes: confirms,
      flags,
    })
    .eq('id', reportId)

  return { score, status }
}