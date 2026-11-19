/** "just now", "2 hours ago", "Yesterday", "3 days ago". Takes an ISO string or Date. */
export function timeAgo(when, now = new Date()) {
  const ms = now.getTime() - new Date(when).getTime()
  if (!Number.isFinite(ms)) return ''
  const minutes = Math.floor(ms / 60000)
  if (minutes < 2) return 'Just now'
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}
