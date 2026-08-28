// 通用格式化工具

/** 字节数 → 人类可读文件大小（B / KB / MB / GB），保留两位小数 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 2 : 1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

/** 把 MIME 字符串（如 'image/png' / 'model/gltf-binary' / ''）压缩成 chip 上展示的简短类型标签 */
export function shortMime(mime: string): string {
  if (!mime) return 'FILE'
  const slash = mime.indexOf('/')
  const tail = slash >= 0 ? mime.slice(slash + 1) : mime
  // 常见类型规整：vnd.* / x-* / '-binary' 等太长，只取 '-' / '+' / '.' 之前的主干
  // 例如 'gltf-binary' → 'GLTF'，'plain' → 'PLAIN'，'png' → 'PNG'
  const seg = (tail.split(/[-+. ]/)[0] ?? '').toUpperCase()
  return seg || tail.toUpperCase() || 'FILE'
}
