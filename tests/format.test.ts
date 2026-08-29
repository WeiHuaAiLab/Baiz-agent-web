// 格式化工具：文件大小 / MIME 短标签（utils/format.ts）、耗时 / 时间显示（utils/time.ts）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatFileSize, shortMime } from '../src/utils/format'
import { formatDuration, formatRelativeTime, formatTime } from '../src/utils/time'

describe('formatFileSize：字节数 → 人类可读大小', () => {
  it('非法或负值归零', () => {
    expect(formatFileSize(Number.NaN)).toBe('0 B')
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe('0 B')
    expect(formatFileSize(-1)).toBe('0 B')
  })

  it('小于 1024 字节直接输出 B', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
  })

  it('KB / MB / GB 分级并保留小数', () => {
    expect(formatFileSize(1024)).toBe('1.00 KB')
    expect(formatFileSize(2048)).toBe('2.00 KB')
    // 小于 10 保留两位，否则一位
    expect(formatFileSize(5 * 1024)).toBe('5.00 KB')
    expect(formatFileSize(50 * 1024)).toBe('50.0 KB')
    expect(formatFileSize(1024 * 1024)).toBe('1.00 MB')
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10.0 MB')
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB')
    expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe('1.50 GB')
  })
})

describe('shortMime：MIME → 附件 chip 短标签', () => {
  it('常规类型取斜杠后主干', () => {
    expect(shortMime('image/png')).toBe('PNG')
    expect(shortMime('text/plain')).toBe('PLAIN')
    expect(shortMime('application/pdf')).toBe('PDF')
  })

  it('带 - / + / . 的复合类型只取主干', () => {
    expect(shortMime('model/gltf-binary')).toBe('GLTF')
    expect(shortMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('VND')
    expect(shortMime('image/svg+xml')).toBe('SVG')
  })

  it('空串与无斜杠回退', () => {
    expect(shortMime('')).toBe('FILE')
    expect(shortMime('txt')).toBe('TXT')
  })
})

describe('formatDuration：毫秒 → 中文耗时', () => {
  it('不足 1 秒显示毫秒', () => {
    expect(formatDuration(0)).toBe('0 毫秒')
    expect(formatDuration(999)).toBe('999 毫秒')
  })

  it('不足 60 秒显示秒', () => {
    expect(formatDuration(1000)).toBe('1 秒')
    expect(formatDuration(59_500)).toBe('59 秒')
  })

  it('超过 60 秒显示分钟（带零头秒 / 整分钟）', () => {
    expect(formatDuration(60_000)).toBe('1 分钟')
    expect(formatDuration(90_000)).toBe('1 分钟 30 秒')
    expect(formatDuration(120_000)).toBe('2 分钟')
  })
})

describe('formatTime / formatRelativeTime：时间显示', () => {
  beforeEach(() => {
    // 固定「现在」= 2026-08-29 12:00（本地时区）
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formatTime 补零输出 HH:mm', () => {
    expect(formatTime(new Date(2026, 7, 29, 9, 5).getTime())).toBe('09:05')
    expect(formatTime(new Date(2026, 7, 29, 23, 59).getTime())).toBe('23:59')
  })

  it('formatRelativeTime 分级：刚刚 / 分钟 / 小时 / 昨天 / 日期', () => {
    const now = Date.now()
    expect(formatRelativeTime(now)).toBe('刚刚')
    expect(formatRelativeTime(now - 30 * 60_000)).toBe('30 分钟前')
    expect(formatRelativeTime(now - 5 * 3_600_000)).toBe('5 小时前')
    expect(formatRelativeTime(now - 86_400_000)).toBe('昨天')
    expect(formatRelativeTime(new Date(2026, 7, 10).getTime())).toBe('8月10日')
  })
})
