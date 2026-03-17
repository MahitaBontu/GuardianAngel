import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import 'leaflet/dist/leaflet.css'

const UT_CENTER = [30.2849, -97.7404]

const CATEGORY_COLORS = {
  poor_lighting: '#FACC15',
  harassment: '#F97316',
  catcalling: '#FB923C',
  assault: '#EF4444',
  theft: '#8B5CF6',
  unsafe_path: '#F59E0B',
  feels_unsafe: '#EC4899',
  other: '#6B7280'
}

export default function MapView() {
  const [reports, setReports] = useState([])

  useEffect(() => {
    supabase.from('reports').select('*').then(({ data }) => {
      setReports(data || [])
    })
  }, [])

  return (
    <MapContainer
      center={UT_CENTER}
      zoom={15}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      {reports.map(r => (
        <CircleMarker
          key={r.id}
          center={[r.lat, r.lng]}
          radius={8}
          pathOptions={{
            color: CATEGORY_COLORS[r.category] || '#6B7280',
            fillColor: CATEGORY_COLORS[r.category] || '#6B7280',
            fillOpacity: r.status === 'verified' ? 0.9 : 0.4,
            weight: 2
          }}
        >
          <Popup>
            <div style={{ minWidth: 160 }}>
              <strong>{r.category?.replace('_', ' ')}</strong>
              <p style={{ fontSize: 12, margin: '4px 0' }}>{r.description}</p>
              <span style={{ fontSize: 11, color: '#888' }}>
                Credibility: {r.credibility_score}/100
                {r.status === 'verified' ? ' ✓ Verified' : ' (pending)'}
              </span>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}