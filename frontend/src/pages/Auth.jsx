/**
 * @file Auth.jsx
 * @description Authentication page for Guardian Angel.
 *
 * Serves as the entry gate for the entire application. Unauthenticated
 * users are redirected here automatically by App.jsx when no active
 * Supabase session is detected.
 *
 * This page handles three authentication flows:
 *
 *   1. Demo login    — One-click access using a shared demo account.
 *                      Bypasses the .edu requirement so scholarship judges
 *                      and evaluators can access the full app instantly.
 *
 *   2. Email login   — Signs in an existing user with email and password
 *                      via Supabase Auth signInWithPassword.
 *
 *   3. Email signup  — Creates a new account. Enforces the .edu email
 *                      requirement to ensure only verified university
 *                      students can submit reports or cast votes.
 *                      Sends a confirmation link to the provided address.
 *
 * .EDU GATE
 * ─────────
 * The .edu check is enforced in handleSubmit before any Supabase call
 * is made. The demo account (demo@guardianangel.app) is explicitly
 * whitelisted to bypass this check so evaluators are not blocked.
 *
 * AUTH STATE
 * ──────────
 * On successful login or signup, Supabase fires the onAuthStateChange
 * event subscribed in App.jsx, which sets the user state and renders
 * the main application without requiring a manual redirect.
 */

import { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Auth component — login, signup, and demo access page.
 *
 * @component
 * @returns {JSX.Element}
 */
export default function Auth() {
  // Controls whether the form is in login or signup mode
  const [isLogin,  setIsLogin]  = useState(true)

  // Controlled form field values
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')

  // Error message displayed in the red alert box (empty = no error shown)
  const [error,    setError]    = useState('')

  // Success message displayed in the green alert box after signup
  const [message,  setMessage]  = useState('')

  // Disables buttons and shows loading text during async operations
  const [loading,  setLoading]  = useState(false)

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  /**
   * Handles the demo login button click.
   *
   * Attempts to sign in with the shared demo credentials. If the demo
   * account does not yet exist in this Supabase project (e.g. fresh deploy),
   * it falls back to creating the account first, then the user can retry.
   *
   * The demo account must be pre-created in Supabase Dashboard →
   * Authentication → Users with email: demo@guardianangel.app
   * and password: demo123456.
   *
   * @async
   * @returns {Promise<void>}
   */
  const handleDemoLogin = async () => {
    setLoading(true)
    setError('')

    // Attempt sign in with pre-created demo credentials
    const { error } = await supabase.auth.signInWithPassword({
      email:    'demo@guardianangel.app',
      password: 'demo123456',
    })

    if (error) {
      // Fallback: attempt to create the demo account if it does not exist
      const { error: signUpError } = await supabase.auth.signUp({
        email:    'demo@guardianangel.app',
        password: 'demo123456',
      })
      if (signUpError) setError('Demo login failed. Please try again.')
    }

    setLoading(false)
  }

  /**
   * Handles login and signup form submission.
   *
   * Validates the .edu requirement before making any Supabase call.
   * The demo account email is explicitly whitelisted to bypass this check.
   *
   * On successful login:  Supabase fires onAuthStateChange → App.jsx renders main app.
   * On successful signup: A confirmation email is sent; user sees success message.
   * On error:             The Supabase error message is displayed in the form.
   *
   * @async
   * @param {React.FormEvent} e - Form submit event
   * @returns {Promise<void>}
   */
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    // Whitelist the demo account so evaluators bypass the .edu requirement
    const isDemo = email === 'demo@guardianangel.app'

    // Enforce .edu gate — only university email addresses are accepted
    if (!isDemo && !email.endsWith('.edu')) {
      setError('You must use a .edu email address to register.')
      return
    }

    setLoading(true)

    if (isLogin) {
      // Existing user — sign in with email and password
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      // New user — create account and send confirmation email
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Redirect user back to the app after clicking the confirmation link
          emailRedirectTo: window.location.origin,
        },
      })
      if (error) setError(error.message)
      else setMessage('Check your .edu email for a confirmation link!')
    }

    setLoading(false)
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* ── Brand header ────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-pink-400 mb-2">Guardian Angel</h1>
          <p className="text-gray-400 text-sm">For Women, By Women.</p>
        </div>

        {/* ── Demo access box ─────────────────────────────────────────── */}
        {/* Allows scholarship judges and evaluators to access the full    */}
        {/* app without a .edu email address using shared demo credentials */}
        <div style={{
          background: 'rgba(236,72,153,0.08)',
          border: '1.5px solid rgba(236,72,153,0.3)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 20,
        }}>
          <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 12 }}>
            Access the full app instantly — no .edu email required.
          </p>
          <button
            onClick={handleDemoLogin}
            disabled={loading}
            style={{
              width: '100%', padding: '10px', borderRadius: 8,
              background: '#ec4899', color: '#fff', fontWeight: 600,
              fontSize: 14, border: 'none', cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Logging in...' : 'Enter Demo Mode →'}
          </button>
        </div>

        {/* ── Login / signup card ─────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">

          {/* Mode toggle — switches between Login and Sign Up */}
          <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                isLogin ? 'bg-pink-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                !isLogin ? 'bg-pink-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* University email field */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">University Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@utexas.edu"
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* Password field */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* Error alert — shown when login/signup fails or .edu gate triggers */}
            {error && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Success alert — shown after successful signup email is sent */}
            {message && (
              <div className="bg-green-900/30 border border-green-800 rounded-lg px-3 py-2">
                <p className="text-green-400 text-sm">{message}</p>
              </div>
            )}

            {/* Submit button — label changes based on login/signup mode */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors"
            >
              {loading ? 'Please wait...' : isLogin ? 'Log In' : 'Create Account'}
            </button>

          </form>

          {/* Privacy note shown only during signup — reinforces anonymity promise */}
          {!isLogin && (
            <p className="text-gray-500 text-xs text-center mt-4">
              Only .edu email addresses are accepted. Your identity is kept anonymous in reports.
            </p>
          )}

        </div>
      </div>
    </div>
  )
}