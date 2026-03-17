import { supabase } from './supabase'

export async function castVote(reportId, userId, voteType) {
  const { error } = await supabase.from('votes').insert({
    report_id: reportId,
    user_id: userId,
    vote_type: voteType
  })
  if (error) return { error }

  const { data: votes } = await supabase
    .from('votes')
    .select('vote_type')
    .eq('report_id', reportId)

  const confirms = votes.filter(v => v.vote_type === 'confirm').length
  const flags = votes.filter(v => v.vote_type === 'flag').length
  const score = Math.max(0, Math.min(100, 30 + (confirms * 15) - (flags * 20)))
  const status = confirms >= 3 ? 'verified' : flags >= 3 ? 'removed' : 'pending'

  await supabase.from('reports').update({
    credibility_score: score,
    status,
    upvotes: confirms,
    flags
  }).eq('id', reportId)

  return { score, status }
}