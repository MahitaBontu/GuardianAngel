/**
 * @file Navbar.jsx
 * @description Persistent top navigation bar for Guardian Angel.
 *
 * Rendered on every authenticated page via App.jsx. Fixed to the top
 * of the viewport so it remains visible while scrolling the map,
 * feed, or analytics dashboard below it.
 *
 * Displays:
 *   - Brand link back to the map (home page)
 *   - Navigation links to all main sections
 *   - AI Assistant link highlighted in pink to draw attention
 *     to the most technically advanced feature
 *   - Logout button that calls Supabase Auth signOut, which triggers
 *     the onAuthStateChange listener in App.jsx and returns the user
 *     to the Auth page automatically
 *
 * @param {Object} props
 * @param {Object} props.user - The authenticated Supabase user object.
 *                              Currently reserved for future use (e.g.
 *                              displaying trust score in the nav).
 */

import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * Navbar component.
 *
 * Fixed to the top of the viewport with z-index 50 so it renders
 * above the Leaflet map canvas and all page content.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.user - Authenticated Supabase user object
 * @returns {JSX.Element}
 */
export default function Navbar({ user }) {

  /**
   * Signs the current user out via Supabase Auth.
   *
   * Supabase clears the session token and fires the onAuthStateChange
   * event in App.jsx, which sets user to null and renders the Auth
   * page without requiring a manual redirect.
   */
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">

      {/* Brand — links back to the map (home page) */}
      <Link to="/" className="text-pink-400 font-bold text-lg tracking-tight">
        Guardian Angel
      </Link>

      <div className="flex items-center gap-3 text-sm">

        {/* Primary navigation links */}
        <Link to="/"          className="text-gray-300 hover:text-white">Map</Link>
        <Link to="/feed"      className="text-gray-300 hover:text-white">Feed</Link>
        <Link to="/submit"    className="text-gray-300 hover:text-white">Report</Link>
        <Link to="/analytics" className="text-gray-300 hover:text-white">Analytics</Link>

        {/* AI Assistant — highlighted separately to signal it as a
            featured capability, distinct from standard navigation */}
        <Link to="/assistant" className="text-pink-400 hover:text-pink-300 font-medium">
          AI Assistant
        </Link>

        {/* Logout — triggers Supabase signOut and returns user to Auth page */}
        <button
          onClick={handleLogout}
          className="text-gray-400 hover:text-red-400 text-xs transition-colors ml-1"
        >
          Logout
        </button>

      </div>
    </nav>
  )
}