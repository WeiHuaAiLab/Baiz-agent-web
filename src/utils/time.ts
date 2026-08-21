// 耗时格式化：毫秒 → "X 分钟 Y 秒"。
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} 毫秒`
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds} 秒`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes} 分钟 ${seconds} 秒` : `${minutes} 分钟`
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function formatRelativeTime(timestamp: number): string {
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60_000)
  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const hours = Math.floor(diffMinutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const date = new Date(timestamp)
  const yesterday = new Date(Date.now() - 86_400_000)
  if (date.toDateString() === yesterday.toDateString()) return '昨天'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
