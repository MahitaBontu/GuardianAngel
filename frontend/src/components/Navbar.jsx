import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Navbar({ user }) {
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
      <Link to="/" className="text-pink-400 font-bold text-lg tracking-tight">
        Guardian Angel
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link to="/" className="text-gray-300 hover:text-white">Map</Link>
        <Link to="/feed" className="text-gray-300 hover:text-white">Feed</Link>
        <Link to="/submit" className="text-gray-300 hover:text-white">Report</Link>
        <span className="text-gray-500 text-xs hidden md:block">{user?.email}</span>
        <button onClick={handleLogout}
          className="text-gray-400 hover:text-red-400 text-xs transition-colors">
          Logout
        </button>
      </div>
    </nav>
  )
}