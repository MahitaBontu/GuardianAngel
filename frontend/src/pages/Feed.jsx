/**
 * @file Feed.jsx
 * @description Real-time incident feed with community voting for Guardian Angel.
 *
 * Displays all safety reports submitted by verified students, ordered by most
 * recent first. Each report card shows the incident category, verification
 * status, description, credibility score, and voting controls.
 *
 * COMMUNITY VERIFICATION
 * ──────────────────────
 * The feed is where the peer review pipeline is visible to users. Every
 * report starts as 'pending' and moves to 'verified' or 'removed' based
 * on community votes cast through the confirm and flag buttons on each card.
 *
 * Voting is handled by castVote() in credibility.js, which:
 *   - Inserts the vote (rejected by DB if duplicate)
 *   - Recalculates the credibility score from all votes
 *   - Updates the report status based on vote thresholds
 *   - Adjusts the reporter's trust score
 *
 * After a vote is cast, fetchReports() is called to refresh the feed so
 * the updated credibility score and status are immediately visible.
 *
 * FILTERING
 * ─────────
 * A pill bar at the top allows filtering by incident category. The filter
 * is applied server-side via a Supabase .eq() query, refetching on every
 * filter change via the useEffect dependency on [filter].
 *
 * CREDIBILITY BAR
 * ───────────────
 * Each card shows a pink progress bar representing the report's credibility
 * score (0–100). This gives users a quick visual signal of how much the
 * community trusts a report before reading its description.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { castVote } from '../lib/credibility'

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

/**
 * Tailwind background color classes for each incident category.
 * Applied to the category badge pill on each report card.
 * @constant {Object.<string, string>}
 */
const CATEGORY_COLORS = {
  poor_lighting: 'bg-yellow-500',
  harassment:    'bg-orange-500',
  catcalling:    'bg-orange-400',
  assault:       'bg-red-500',
  theft:         'bg-purple-500',
  unsafe_path:   'bg-amber-500',
  feels_unsafe:  'bg-pink-500',
  other:         'bg-gray-500',
}

/**
 * Human-readable labels for each incident category.
 * Used in the filter pill bar and on each report card badge.
 * @constant {Object.<string, string>}
 */
const CATEGORY_LABELS = {
  poor_lighting: 'Poor Lighting',
  harassment:    'Harassment',
  catcalling:    'Catcalling',
  assault:       'Assault',
  theft:         'Theft',
  unsafe_path:   'Unsafe Path',
  feels_unsafe:  'Feels Unsafe',
  other:         'Other',
}

// ---------------------------------------------------------------------------
// UTILITY FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Converts an ISO timestamp into a human-readable relative time string.
 *
 * Examples:
 *   45 seconds ago  → 'just now'
 *   5 minutes ago   → '5m ago'
 *   3 hours ago     → '3h ago'
 *   2 days ago      → '2d ago'
 *
 * @param {string} date - ISO 8601 timestamp string from Supabase
 * @returns {string} Relative time string
 */
function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  if (seconds < 60)    return 'just now'
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

// ---------------------------------------------------------------------------
// FEED COMPONENT
// ---------------------------------------------------------------------------

/**
 * Feed — real-time incident feed with category filtering and peer voting.
 *
 * Fetches reports from Supabase on mount and re-fetches whenever the active
 * category filter changes. Voting triggers a re-fetch after completion so
 * the updated credibility score and status are immediately reflected.
 *
 * @component
 * @returns {JSX.Element}
 */
export default function Feed() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  // Active category filter — 'all' shows every category
  const [filter,  setFilter]  = useState('all')

  // Tracks which report is currently being voted on to disable both
  // vote buttons on that card and prevent duplicate vote attempts
  const [voting,  setVoting]  = useState(null)

  // Re-fetch reports whenever the category filter changes
  useEffect(() => {
    fetchReports()
  }, [filter])

  // ---------------------------------------------------------------------------
  // DATA FETCHING
  // ---------------------------------------------------------------------------

  /**
   * Fetches reports from Supabase, ordered by most recent first.
   * Applies a category filter server-side when filter !== 'all'.
   *
   * @async
   * @returns {Promise<void>}
   */
  const fetchReports = async () => {
    setLoading(true)

    let query = supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })

    // Apply category filter server-side for efficiency
    if (filter !== 'all') query = query.eq('category', filter)

    const { data } = await query
    setReports(data || [])
    setLoading(false)
  }

  // ---------------------------------------------------------------------------
  // VOTING
  // ---------------------------------------------------------------------------

  /**
   * Casts a community vote on a report and refreshes the feed.
   *
   * Disables both vote buttons on the target card while the vote is
   * being processed to prevent accidental duplicate submissions.
   * The database UNIQUE constraint on (report_id, user_id) provides
   * a second layer of protection against duplicates.
   *
   * @async
   * @param {string} reportId - UUID of the report being voted on
   * @param {'confirm'|'flag'} voteType - Type of vote to cast
   * @returns {Promise<void>}
   */
  const handleVote = async (reportId, voteType) => {
    setVoting(reportId)

    // Verify the user is authenticated before attempting to vote
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert('You must be logged in to vote.')
      setVoting(null)
      return
    }

    // Delegate to credibility engine — handles score recalculation and DB update
    await castVote(reportId, user.id, voteType)

    // Refresh the feed so updated credibility score and status are visible
    await fetchReports()
    setVoting(null)
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="pt-20 pb-10 px-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Incident Feed</h1>

      {/* ── Category filter pills ─────────────────────────────────────── */}
      {/* Server-side filtered via Supabase .eq() on filter change         */}
      <div className="flex gap-2 flex-wrap mb-6">

        {/* 'All' pill — clears the category filter */}
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filter === 'all'
              ? 'bg-pink-500 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          All
        </button>

        {/* One pill per category */}
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === value
                ? 'bg-pink-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Feed content ──────────────────────────────────────────────── */}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading reports...</p>
      ) : reports.length === 0 ? (
        <p className="text-gray-400 text-sm">No reports yet.</p>
      ) : (
        <div className="space-y-4">
          {reports.map(r => (
            <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">

              {/* ── Card header: category badge, status badge, timestamp ── */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">

                  {/* Category badge — color-coded by incident type */}
                  <span className={`${CATEGORY_COLORS[r.category]} text-white text-xs font-medium px-2 py-0.5 rounded-full`}>
                    {CATEGORY_LABELS[r.category]}
                  </span>

                  {/* Verification status badge */}
                  {r.status === 'verified' && (
                    <span className="bg-green-900 text-green-400 text-xs px-2 py-0.5 rounded-full">
                      ✓ Verified
                    </span>
                  )}
                  {r.status === 'pending' && (
                    <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">
                      Pending
                    </span>
                  )}
                </div>

                {/* Relative timestamp */}
                <span className="text-gray-500 text-xs">{timeAgo(r.created_at)}</span>
              </div>

              {/* ── Incident description (anonymous — no identity shown) ── */}
              {r.description && (
                <p className="text-gray-300 text-sm mb-3">{r.description}</p>
              )}

              {/* ── Card footer: credibility bar and vote buttons ───────── */}
              <div className="flex items-center justify-between">

                {/* Credibility score bar — visual trust indicator (0–100) */}
                <div className="flex items-center gap-1">
                  <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-pink-500 rounded-full"
                      style={{ width: `${r.credibility_score}%` }}
                    />
                  </div>
                  <span className="text-gray-500 text-xs ml-1">
                    {r.credibility_score}/100
                  </span>
                </div>

                {/* Vote buttons — disabled while a vote is in progress */}
                <div className="flex gap-2">

                  {/* Confirm vote — supports the report, raises credibility */}
                  <button
                    onClick={() => handleVote(r.id, 'confirm')}
                    disabled={voting === r.id}
                    className="flex items-center gap-1 bg-green-900/40 hover:bg-green-900/70 text-green-400 text-xs px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                  >
                    ✓ Confirm {r.upvotes > 0 && `(${r.upvotes})`}
                  </button>

                  {/* Flag vote — challenges accuracy, lowers credibility */}
                  <button
                    onClick={() => handleVote(r.id, 'flag')}
                    disabled={voting === r.id}
                    className="flex items-center gap-1 bg-red-900/40 hover:bg-red-900/70 text-red-400 text-xs px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                  >
                    ✗ Flag {r.flags > 0 && `(${r.flags})`}
                  </button>

                </div>
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  )
}