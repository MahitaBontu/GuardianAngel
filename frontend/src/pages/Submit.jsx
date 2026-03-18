/**
 * @file Submit.jsx
 * @description Incident report submission page for Guardian Angel.
 *
 * Allows authenticated students to submit a new safety report by:
 *   1. Clicking a location on an interactive map to drop a pin
 *   2. Selecting the time of day the incident occurred
 *   3. Choosing an incident category from eight options
 *   4. Optionally describing what happened in their own words
 *
 * ANONYMITY
 * ─────────
 * The report stores only the user's UUID (user_id) for trust score
 * calculations — never their name, email, or any identifying information.
 * The user_id is never displayed publicly. Report cards on the feed and
 * map show only the category, description, and credibility score.
 *
 * TIME OF DAY TAGGING
 * ───────────────────
 * Every report is tagged with the time window in which the incident
 * occurred (morning / afternoon / evening / night). This data feeds
 * directly into the temporal relevance matrix in riskScore.js, which
 * re-weights reports on the heat map based on the current time of day.
 * Tagging time is what makes Guardian Angel's heat map time-aware.
 *
 * The time selector defaults to the current real-world time window
 * so most users can submit without changing this field.
 *
 * LOCATION SELECTION
 * ──────────────────
 * Location is captured by the LocationPicker sub-component, which
 * listens for click events on the Leaflet map and returns the clicked
 * LatLng to the parent form state. A Marker is rendered at the selected
 * position so the user can confirm their pin placement visually.
 *
 * SUBMISSION FLOW
 * ───────────────
 * On submit, the report is inserted into the Supabase reports table
 * with status 'pending' and credibility_score 30 (the base score).
 * The report immediately appears as a dim pin on the map and in the feed,
 * awaiting community verification through the voting system.
 */

import { useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import { supabase } from '../lib/supabase'
import 'leaflet/dist/leaflet.css'

/** Geographic center of the UT Austin campus (lat, lng) */
const UT_CENTER = [30.2849, -97.7404]

/**
 * The eight incident categories users can report.
 * Covers the full spectrum of safety concerns women face on campus —
 * not just crimes, but everyday experiences that affect route decisions.
 * @constant {Array.<{value: string, label: string}>}
 */
const CATEGORIES = [
  { value: 'poor_lighting', label: 'Poor Lighting' },
  { value: 'harassment',    label: 'Harassment'    },
  { value: 'catcalling',    label: 'Catcalling'    },
  { value: 'assault',       label: 'Assault'       },
  { value: 'theft',         label: 'Theft'         },
  { value: 'unsafe_path',   label: 'Unsafe Path'   },
  { value: 'feels_unsafe',  label: 'Feels Unsafe'  },
  { value: 'other',         label: 'Other'         },
]

/**
 * The four time-of-day windows used throughout Guardian Angel.
 * Matches the keys in the TIME_RELEVANCE matrix in riskScore.js.
 * Each slot includes a subtitle showing the exact hours it covers.
 * @constant {Array.<{value: string, label: string, sub: string}>}
 */
const TIME_SLOTS = [
  { value: 'morning',   label: '🌅 Morning',   sub: '6am – 12pm'  },
  { value: 'afternoon', label: '☀️ Afternoon', sub: '12pm – 6pm'  },
  { value: 'evening',   label: '🌆 Evening',   sub: '6pm – 10pm'  },
  { value: 'night',     label: '🌙 Night',     sub: '10pm – 6am'  },
]

// ---------------------------------------------------------------------------
// SUB-COMPONENTS
// ---------------------------------------------------------------------------

/**
 * LocationPicker — invisible Leaflet component that captures map click events.
 *
 * Must be rendered inside a <MapContainer> to access the Leaflet map context
 * via useMapEvents(). Returns null — has no visual output of its own.
 * Calls onSelect with the Leaflet LatLng object on every map click.
 *
 * @param {Object}   props
 * @param {Function} props.onSelect - Callback receiving the clicked LatLng object
 * @returns {null}
 */
function LocationPicker({ onSelect }) {
  useMapEvents({
    click(e) { onSelect(e.latlng) }
  })
  return null
}

// ---------------------------------------------------------------------------
// UTILITY FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Returns the current time-of-day bucket based on the system clock.
 * Used to pre-select the time slot that matches when the user is submitting,
 * since most reports are filed shortly after the incident occurs.
 *
 * @returns {'morning' | 'afternoon' | 'evening' | 'night'}
 */
function getCurrentTimeSlot() {
  const hour = new Date().getHours()
  if (hour >= 6  && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 22) return 'evening'
  return 'night'
}

// ---------------------------------------------------------------------------
// SUBMIT COMPONENT
// ---------------------------------------------------------------------------

/**
 * Submit — incident report submission form.
 *
 * Manages the full state of the submission form including map position,
 * category, description, time of day, and submission lifecycle (loading,
 * error, success). On successful submission renders a success screen with
 * an option to submit another report.
 *
 * @component
 * @returns {JSX.Element}
 */
export default function Submit() {
  // Selected map position — null until the user clicks the map
  const [position,    setPosition]    = useState(null)

  // Incident category value from the dropdown
  const [category,    setCategory]    = useState('')

  // Optional free-text description of what happened
  const [description, setDescription] = useState('')

  // Selected time of day — defaults to current time window
  const [timeOfDay,   setTimeOfDay]   = useState(getCurrentTimeSlot())

  // True while the Supabase insert is in progress
  const [submitting,  setSubmitting]  = useState(false)

  // True after a successful submission — triggers the success screen
  const [success,     setSuccess]     = useState(false)

  // Validation or Supabase error message — empty string = no error shown
  const [error,       setError]       = useState('')

  // ---------------------------------------------------------------------------
  // SUBMISSION HANDLER
  // ---------------------------------------------------------------------------

  /**
   * Validates the form and inserts a new report into Supabase.
   *
   * Validation order:
   *   1. Position must be selected (map click required)
   *   2. Category must be chosen from the dropdown
   *   3. User must be authenticated (verified via Supabase getUser)
   *
   * On success: sets success=true to render the confirmation screen.
   * On failure: sets error with the Supabase error message.
   *
   * The report is inserted with status='pending' and credibility_score=30.
   * It enters the community verification pipeline immediately after insert.
   *
   * @async
   * @param {React.FormEvent} e - Form submit event
   * @returns {Promise<void>}
   */
  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validate required fields before making any async calls
    if (!position) { setError('Please click on the map to select a location.'); return }
    if (!category) { setError('Please select a category.'); return }

    setSubmitting(true)
    setError('')

    // Verify the user is still authenticated before inserting
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be logged in to submit a report.')
      setSubmitting(false)
      return
    }

    // Insert the report — RLS policy enforces user_id === auth.uid()
    const { error: insertError } = await supabase.from('reports').insert({
      user_id:     user.id,
      category,
      description,
      lat:         position.lat,
      lng:         position.lng,
      time_of_day: timeOfDay,
      // status defaults to 'pending' and credibility_score to 30 via DB defaults
    })

    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    // Show success screen on successful insert
    setSuccess(true)
  }

  // ---------------------------------------------------------------------------
  // SUCCESS SCREEN
  // ---------------------------------------------------------------------------

  /**
   * Rendered after a successful report submission.
   * Confirms the report entered the verification pipeline and offers
   * the option to submit another report by resetting the success state.
   */
  if (success) return (
    <div className="pt-20 px-4 max-w-md mx-auto text-center">
      <div className="text-4xl mb-4">✓</div>
      <h2 className="text-xl font-semibold text-pink-400 mb-2">Report Submitted</h2>
      <p className="text-gray-400 mb-2">Your report is pending community verification.</p>
      <p className="text-gray-500 text-sm mb-6">Thank you for making campus safer for everyone.</p>
      <button
        onClick={() => setSuccess(false)}
        className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2 rounded-lg"
      >
        Submit Another
      </button>
    </div>
  )

  // ---------------------------------------------------------------------------
  // MAIN FORM
  // ---------------------------------------------------------------------------

  return (
    <div className="pt-16 min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold mb-1">Submit a Report</h1>
        <p className="text-gray-400 text-sm mb-4">
          Your experience matters. Click the map to pin the exact location.
        </p>

        {/* ── Location picker map ───────────────────────────────────────── */}
        {/* Clicking anywhere on the map calls setPosition with the LatLng  */}
        <div className="rounded-xl overflow-hidden mb-6" style={{ height: 300 }}>
          <MapContainer center={UT_CENTER} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {/* Invisible click listener — passes LatLng up to form state */}
            <LocationPicker onSelect={setPosition} />

            {/* Marker rendered at selected position for visual confirmation */}
            {position && <Marker position={position} />}
          </MapContainer>
        </div>

        {/* Coordinate confirmation shown after the user drops a pin */}
        {position && (
          <p className="text-xs text-green-400 mb-4">
            Location selected: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Time of day selector ─────────────────────────────────────── */}
          {/* Four card buttons — one per time window. Defaults to current   */}
          {/* time so most users can submit without changing this field.      */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              When did this happen?
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIME_SLOTS.map(t => (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => setTimeOfDay(t.value)}
                  className={`flex flex-col items-center py-3 px-2 rounded-xl border transition-all ${
                    timeOfDay === t.value
                      ? 'border-pink-500 bg-pink-500/10 text-white'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {/* Emoji icon and time window name */}
                  <span className="text-xl mb-1">{t.label.split(' ')[0]}</span>
                  <span className="text-xs font-medium">{t.label.split(' ')[1]}</span>
                  {/* Hour range subtitle */}
                  <span className="text-xs text-gray-500 mt-0.5">{t.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Category dropdown ─────────────────────────────────────────── */}
          {/* Required — form will not submit without a selection             */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
            >
              <option value="">Select a category...</option>
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* ── Description textarea ─────────────────────────────────────── */}
          {/* Optional — reporter's words, stored anonymously in the DB      */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">What happened?</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe what happened. You stay anonymous."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-pink-500"
            />
            {/* Reinforce anonymity promise below the description field */}
            <p className="text-gray-600 text-xs mt-1">Your identity is never shown on reports.</p>
          </div>

          {/* Validation / Supabase error message */}
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* Submit button — disabled while insert is in progress */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>

        </form>
      </div>
    </div>
  )
}