/**
 * @file riskScore.js
 * @description Multi-variable spatial risk scoring algorithm for Guardian Angel.
 *
 * PURPOSE
 * ───────
 * Calculates a danger score (0–1) for any geographic coordinate on campus
 * by aggregating nearby incident reports, each weighted across five variables.
 * The output powers the live heat map overlay on the campus map.
 *
 * THE FIVE VARIABLES
 * ──────────────────
 * 1. Category weight   — severity of the incident type (assault = 1.0, poor lighting = 0.4)
 * 2. Recency weight    — decay function based on days since the incident was reported
 * 3. Credibility weight — community verification score normalized to 0–1
 * 4. Temporal relevance — 4×4 matrix matching report time of day to current time of day
 * 5. Proximity          — Haversine distance gate; only reports within 150m contribute
 *
 * SCORE FORMULA (per report)
 * ──────────────────────────
 *   report_score = categoryWeight × recencyWeight × credibilityWeight × timeRelevance
 *
 * LOCATION SCORE
 * ──────────────
 *   location_score = clamp( Σ(report_scores within 150m) / 2.0, 0.0, 1.0 )
 *
 * The division by 2.0 is a normalization factor calibrated so a cluster of
 * 3–4 serious verified incidents produces a near-maximum score without any
 * single report being able to max out the score on its own.
 *
 * THE CORE INNOVATION — TEMPORAL RELEVANCE
 * ─────────────────────────────────────────
 * Every report is tagged with the time of day it occurred. The TIME_RELEVANCE
 * matrix re-weights every report based on how well its time matches the time
 * the user is currently viewing the map. A night assault report contributes
 * 100% of its weight at midnight and only 20% at noon. This means the heat
 * map is not a static snapshot — it is a live, time-aware picture of campus
 * danger that shifts with the clock.
 *
 * @module riskScore
 */

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

/**
 * Severity weights for each incident category.
 *
 * Scale: 0.0 (minimal) → 1.0 (maximum severity).
 * Values reflect the relative impact each incident type has on a woman's
 * decision to use a route or location at any given time.
 *
 * @constant {Object.<string, number>}
 */
const CATEGORY_WEIGHTS = {
  assault:       1.0,  // Direct physical threat — maximum weight
  harassment:    0.8,  // Targeted unwanted behavior
  theft:         0.7,  // Property crime with personal safety implications
  catcalling:    0.6,  // Verbal harassment — significantly affects route choices
  unsafe_path:   0.5,  // Environmental hazard
  feels_unsafe:  0.45, // Subjective but statistically valid safety signal
  poor_lighting: 0.4,  // Infrastructure issue — indirect but consistent risk factor
  other:         0.3,  // Baseline weight for uncategorized reports
}

/**
 * Temporal relevance matrix (4 × 4).
 *
 * Outer key = current time of day the user is viewing the map.
 * Inner key = time of day the incident was originally reported.
 *
 * Each value (0.2–1.0) represents how relevant an incident from the
 * inner time window is when viewed during the outer time window.
 *
 * A report is maximally relevant (1.0) when the viewing time matches
 * the incident time. Relevance decays as the time windows diverge.
 *
 * This matrix is the core technical innovation of Guardian Angel —
 * it makes the entire heat map time-aware and dynamic.
 *
 * @constant {Object.<string, Object.<string, number>>}
 */
const TIME_RELEVANCE = {
  morning:   { morning: 1.0, afternoon: 0.6, evening: 0.3, night: 0.2 },
  afternoon: { morning: 0.6, afternoon: 1.0, evening: 0.5, night: 0.2 },
  evening:   { morning: 0.3, afternoon: 0.5, evening: 1.0, night: 0.7 },
  night:     { morning: 0.2, afternoon: 0.2, evening: 0.7, night: 1.0 },
}

// ---------------------------------------------------------------------------
// PRIVATE UTILITY FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Calculates the great-circle distance between two geographic coordinates
 * using the Haversine formula.
 *
 * The Haversine formula accounts for the spherical curvature of the Earth
 * and is accurate for the short distances (< 1km) involved in campus use.
 * Used to determine which reports fall within the 150m influence radius
 * of a given grid point before scoring.
 *
 * @param {number} lat1 - Latitude of point A in decimal degrees
 * @param {number} lng1 - Longitude of point A in decimal degrees
 * @param {number} lat2 - Latitude of point B in decimal degrees
 * @param {number} lng2 - Longitude of point B in decimal degrees
 * @returns {number} Distance between the two points in meters
 */
function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000 // Earth's mean radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Returns a recency weight based on how many days ago an incident occurred.
 *
 * Recent incidents are weighted more heavily than older ones. This prevents
 * old reports from permanently stigmatizing areas that may have improved
 * (e.g. a lighting issue that was repaired, or a hotspot that was patrolled).
 *
 * Decay schedule:
 *   < 7 days   → 1.0  (full weight — very recent)
 *   7–30 days  → 0.7  (high weight — recent month)
 *   30–90 days → 0.4  (moderate weight — this semester)
 *   > 90 days  → 0.2  (low but non-zero — persistent patterns still matter)
 *
 * @param {string} createdAt - ISO 8601 timestamp string from the database
 * @returns {number} Recency weight between 0.2 and 1.0
 */
function getRecencyWeight(createdAt) {
  const ageInDays = (Date.now() - new Date(createdAt)) / (1000 * 60 * 60 * 24)
  if (ageInDays < 7)  return 1.0
  if (ageInDays < 30) return 0.7
  if (ageInDays < 90) return 0.4
  return 0.2
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Calculates the risk score for a single geographic point on campus.
 *
 * Finds all non-removed reports within 150m of the target coordinates,
 * computes a weighted score for each using the five-variable formula,
 * sums them, and normalizes the result to a 0–1 range.
 *
 * Reports with status 'removed' are excluded entirely — they were flagged
 * by the community as inaccurate and should not influence the risk map.
 *
 * @param {number} targetLat        - Latitude of the point to score
 * @param {number} targetLng        - Longitude of the point to score
 * @param {Array}  reports          - All reports fetched from Supabase
 * @param {string} currentTimeOfDay - Active time filter: 'morning' | 'afternoon' | 'evening' | 'night'
 * @returns {number} Risk score between 0.0 (no risk) and 1.0 (maximum risk)
 */
export function calculateRiskScore(targetLat, targetLng, reports, currentTimeOfDay) {
  const RADIUS_METERS = 150 // Influence radius — hyperlocal precision
  let totalScore = 0
  let reportCount = 0

  // Filter to reports within radius, excluding community-removed reports
  const nearbyReports = reports.filter(r => {
    const dist = getDistanceMeters(targetLat, targetLng, r.lat, r.lng)
    return dist <= RADIUS_METERS && r.status !== 'removed'
  })

  for (const report of nearbyReports) {
    // Variable 1: How severe is this type of incident?
    const categoryWeight = CATEGORY_WEIGHTS[report.category] || 0.3

    // Variable 2: How recently did this happen?
    const recencyWeight = getRecencyWeight(report.created_at)

    // Variable 3: How much does the community trust this report?
    // credibility_score is 0–100 from the votes table; normalize to 0–1
    const credibilityWeight = (report.credibility_score || 30) / 100

    // Variable 4: How relevant is this report's time to the current time?
    // Falls back to 0.5 (neutral) if the report has no time_of_day tag
    const timeRelevance = report.time_of_day
      ? (TIME_RELEVANCE[currentTimeOfDay]?.[report.time_of_day] || 0.5)
      : 0.5

    // Multiply all four variables together for this report's contribution
    const reportScore = categoryWeight * recencyWeight * credibilityWeight * timeRelevance
    totalScore += reportScore
    reportCount++
  }

  // Return 0 if no nearby reports exist — no data means no risk signal
  if (reportCount === 0) return 0

  // Normalize: divide by 2.0 so a realistic cluster of incidents
  // approaches 1.0 without a single report being able to max the score
  return Math.min(1.0, totalScore / 2.0)
}

/**
 * Generates an array of heat map data points covering the UT Austin campus.
 *
 * Iterates over a uniform grid within the campus bounding box, calculates
 * the risk score at each grid point, and returns only points above the
 * noise threshold (0.05) to avoid rendering color over safe areas.
 *
 * Grid resolution: 0.0008 degrees ≈ 89 meters per step.
 * Campus bounds cover UT Austin, West Campus, and surrounding areas.
 *
 * @param {Array}  reports          - All reports from Supabase
 * @param {string} currentTimeOfDay - Active time filter for the algorithm
 * @returns {Array.<[number, number, number]>} Array of [lat, lng, intensity] tuples
 *   formatted for leaflet.heat. Intensity values range from 0.05 to 1.0.
 */
export function generateHeatmapPoints(reports, currentTimeOfDay) {
  const GRID_SIZE = 0.0008 // ~89m resolution across campus
  const UT_BOUNDS = {
    minLat: 30.277, maxLat: 30.294,
    minLng: -97.748, maxLng: -97.730,
  }

  const points = []

  for (let lat = UT_BOUNDS.minLat; lat <= UT_BOUNDS.maxLat; lat += GRID_SIZE) {
    for (let lng = UT_BOUNDS.minLng; lng <= UT_BOUNDS.maxLng; lng += GRID_SIZE) {
      const score = calculateRiskScore(lat, lng, reports, currentTimeOfDay)
      // Only include points with meaningful risk — suppresses visual noise
      if (score > 0.05) points.push([lat, lng, score])
    }
  }

  return points
}

/**
 * Returns the risk score for a single location.
 *
 * Convenience wrapper around calculateRiskScore used by MapView to
 * annotate individual report pins with their area risk score.
 *
 * @param {number} lat              - Latitude
 * @param {number} lng              - Longitude
 * @param {Array}  reports          - All reports from Supabase
 * @param {string} currentTimeOfDay - Active time filter
 * @returns {number} Risk score between 0.0 and 1.0
 */
export function getLocationRiskScore(lat, lng, reports, currentTimeOfDay) {
  return calculateRiskScore(lat, lng, reports, currentTimeOfDay)
}

/**
 * Returns a human-readable risk label and associated hex color for a score.
 *
 * Used in map pin popups and UI badges to communicate risk level clearly.
 * Thresholds are calibrated to the normalized 0–1 score range.
 *
 * @param {number} score - Risk score between 0.0 and 1.0
 * @returns {{ label: string, color: string }} Display label and hex color
 */
export function getRiskLabel(score) {
  if (score < 0.15) return { label: 'Low Risk',       color: '#22c55e' }
  if (score < 0.35) return { label: 'Moderate Risk',  color: '#f59e0b' }
  if (score < 0.60) return { label: 'High Risk',      color: '#f97316' }
  return               { label: 'Very High Risk',  color: '#ef4444' }
}