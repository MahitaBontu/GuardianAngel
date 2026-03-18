//WIP - This component is still being developed and may not be fully functional. Please check back later for updates.

import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SYSTEM_PROMPT = `You are Guardian Angel, an AI safety assistant for women on the UT Austin campus. You have access to real community-reported safety data from students.

Your job is to:
- Answer questions about campus safety honestly and helpfully
- Reference the report data provided to give specific, accurate advice
- Suggest safer routes, times, or alternatives when needed
- Be warm, direct, and empowering — never alarmist or dismissive
- Always remind users that in an emergency they should call 911 or UTPD at (512) 471-4441
- Focus on practical advice women can actually use

You are not a replacement for emergency services. You are a knowledgeable friend who knows this campus well.

Tone: Warm, direct, empowering. Never condescending. Never dismissive of safety concerns.`

function formatReportsForAI(reports) {
  if (!reports || reports.length === 0) return 'No recent reports in the database.'
  return reports.slice(0, 20).map(r =>
    `- ${r.category.replace('_', ' ')} reported at coordinates (${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}) during ${r.time_of_day || 'unknown time'}. Status: ${r.status}. Credibility: ${r.credibility_score}/100. ${r.description ? `Details: ${r.description}` : ''}`
  ).join('\n')
}

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi, I'm Guardian Angel 👋 I'm here to help you navigate campus safely. Ask me anything — safe routes, what areas to avoid at night, or what to do if you feel unsafe."
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [reports, setReports] = useState([])
  const bottomRef = useRef(null)

  useEffect(() => {
    supabase.from('reports').select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setReports(data || []))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage = { role: 'user', content: input }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    const currentInput = input
    setInput('')
    setLoading(true)

    try {
      const reportContext = formatReportsForAI(reports)

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Current safety report data from Guardian Angel community:\n\n${reportContext}\n\nStudent question: ${currentInput}`
            }
          ]
        })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData?.error?.message || `API error ${response.status}`)
      }

      const data = await response.json()
      const reply = data.content?.[0]?.text || 'Sorry, I could not get a response. Please try again.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])

    } catch (err) {
      console.error('AI Assistant error:', err)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message}. Please check your API key is set correctly.`
      }])
    }

    setLoading(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const QUICK_PROMPTS = [
    "Is it safe to walk alone at night?",
    "What areas should I avoid?",
    "What do I do if I'm being followed?",
    "Safest route from PCL to Jester?"
  ]

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto px-4">
      <div className="py-4 border-b border-gray-800">
        <h1 className="text-lg font-semibold text-white">AI Safety Assistant</h1>
        <p className="text-gray-400 text-xs mt-0.5">
          Powered by live community reports · {reports.length} reports loaded
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-pink-500 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-1">
                GA
              </div>
            )}
            <div className={`max-w-xs sm:max-w-md rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-pink-500 text-white rounded-tr-sm'
                : 'bg-gray-800 text-gray-100 rounded-tl-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-pink-500 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0">
              GA
            </div>
            <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {QUICK_PROMPTS.map(prompt => (
            <button
              key={prompt}
              onClick={() => { setInput(prompt); }}
              className="text-left bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-300 transition-colors">
              {prompt}
            </button>
          ))}
        </div>
      )}

      <div className="py-4 border-t border-gray-800">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about campus safety..."
            rows={1}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm resize-none focus:outline-none focus:border-pink-500"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="bg-pink-500 hover:bg-pink-600 disabled:opacity-40 text-white px-4 rounded-xl transition-colors text-sm font-medium">
            Send
          </button>
        </div>
        <p className="text-gray-600 text-xs mt-2 text-center">
          In an emergency call 911 · UTPD (512) 471-4441
        </p>
      </div>
    </div>
  )
}
