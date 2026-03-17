import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { castVote } from '../lib/credibility'

const CATEGORY_COLORS = {
  poor_lighting: 'bg-yellow-500',
  harassment: 'bg-orange-500',
  catcalling: 'bg-orange-400',
  assault: 'bg-red-500',
  theft: 'bg-purple-500',
  unsafe_path: 'bg-amber-500',
  feels_unsafe: 'bg-pink-500',
  other: 'bg-gray-500'
}

const CATEGORY_LABELS = {
  poor_lighting: 'Poor Lighting',
  harassment: 'Harassment',
  catcalling: 'Catcalling',
  assault: 'Assault',
  theft: 'Theft',
  unsafe_path: 'Unsafe Path',
  feels_unsafe: 'Feels Unsafe',
  other: 'Other'
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default function Feed() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [voting, setVoting] = useState(null)

  useEffect(() => {
    fetchReports()
  }, [filter])

  const fetchReports = async () => {
    setLoading(true)
    let query = supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })

    if (filter !== 'all') query = query.eq('category', filter)

    const { data } = await query
    setReports(data || [])
    setLoading(false)
  }

  const handleVote = async (reportId, voteType) => {
    setVoting(reportId)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert('You must be logged in to vote.'); setVoting(null); return }
    await castVote(reportId, user.id, voteType)
    await fetchReports()
    setVoting(null)
  }

  return (
    <div className="pt-20 pb-10 px-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Incident Feed</h1>

      <div className="flex gap-2 flex-wrap mb-6">
        <button onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filter === 'all' ? 'bg-pink-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}>
          All
        </button>
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === value ? 'bg-pink-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading reports...</p>
      ) : reports.length === 0 ? (
        <p className="text-gray-400 text-sm">No reports yet.</p>
      ) : (
        <div className="space-y-4">
          {reports.map(r => (
            <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`${CATEGORY_COLORS[r.category]} text-white text-xs font-medium px-2 py-0.5 rounded-full`}>
                    {CATEGORY_LABELS[r.category]}
                  </span>
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
                <span className="text-gray-500 text-xs">{timeAgo(r.created_at)}</span>
              </div>

              {r.description && (
                <p className="text-gray-300 text-sm mb-3">{r.description}</p>
              )}

              <div className="flex items-center justify-between">
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

                <div className="flex gap-2">
                  <button
                    onClick={() => handleVote(r.id, 'confirm')}
                    disabled={voting === r.id}
                    className="flex items-center gap-1 bg-green-900/40 hover:bg-green-900/70 text-green-400 text-xs px-3 py-1 rounded-lg transition-colors disabled:opacity-50">
                    ✓ Confirm {r.upvotes > 0 && `(${r.upvotes})`}
                  </button>
                  <button
                    onClick={() => handleVote(r.id, 'flag')}
                    disabled={voting === r.id}
                    className="flex items-center gap-1 bg-red-900/40 hover:bg-red-900/70 text-red-400 text-xs px-3 py-1 rounded-lg transition-colors disabled:opacity-50">
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