import { useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import { supabase } from '../lib/supabase'
import 'leaflet/dist/leaflet.css'

const UT_CENTER = [30.2849, -97.7404]

const CATEGORIES = [
  { value: 'poor_lighting', label: 'Poor Lighting' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'catcalling', label: 'Catcalling' },
  { value: 'assault', label: 'Assault' },
  { value: 'theft', label: 'Theft' },
  { value: 'unsafe_path', label: 'Unsafe Path' },
  { value: 'feels_unsafe', label: 'Feels Unsafe' },
  { value: 'other', label: 'Other' },
]

function LocationPicker({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng)
    }
  })
  return null
}

export default function Submit() {
  const [position, setPosition] = useState(null)
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!position) { setError('Please click on the map to select a location.'); return }
    if (!category) { setError('Please select a category.'); return }
    setSubmitting(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('You must be logged in to submit a report.'); setSubmitting(false); return }

    const { error: insertError } = await supabase.from('reports').insert({
      user_id: user.id,
      category,
      description,
      lat: position.lat,
      lng: position.lng,
    })

    setSubmitting(false)
    if (insertError) { setError(insertError.message); return }
    setSuccess(true)
  }

  if (success) return (
    <div className="pt-20 px-4 max-w-md mx-auto text-center">
      <div className="text-4xl mb-4">✓</div>
      <h2 className="text-xl font-semibold text-pink-400 mb-2">Report Submitted</h2>
      <p className="text-gray-400 mb-6">Your report is pending community verification.</p>
      <button onClick={() => setSuccess(false)}
        className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2 rounded-lg">
        Submit Another
      </button>
    </div>
  )

  return (
    <div className="pt-16 min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold mb-1">Submit a Report</h1>
        <p className="text-gray-400 text-sm mb-4">Click the map to pin the exact location.</p>

        <div className="rounded-xl overflow-hidden mb-6" style={{ height: 300 }}>
          <MapContainer center={UT_CENTER} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <LocationPicker onSelect={setPosition} />
            {position && <Marker position={position} />}
          </MapContainer>
        </div>

        {position && (
          <p className="text-xs text-green-400 mb-4">
            Location selected: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
              <option value="">Select a category...</option>
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={3} placeholder="Describe what happened..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-none" />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" disabled={submitting}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors">
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </form>
      </div>
    </div>
  )
}