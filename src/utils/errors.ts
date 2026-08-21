// RPC 错误 → 友好错误键：UI 据此渲染本地化文案，原始信息作详情展示。
export type FriendlyErrorKey =
  | 'network'
  | 'unauthorized'
  | 'invalidParams'
  | 'methodNotFound'
  | 'taskNotFound'
  | 'internal'
  | 'unknown'

export function mapRpcError(error: unknown): { key: FriendlyErrorKey; detail: string } {
  const raw = error instanceof Error ? error.message : String(error)
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: number }).code
    if (code === -32002) return { key: 'unauthorized', detail: raw }
    if (code === -32602) return { key: 'invalidParams', detail: raw }
    if (code === -32601) return { key: 'methodNotFound', detail: raw }
    if (code === -32001) return { key: 'taskNotFound', detail: raw }
    if (code === -32700 || code === -32600 || code === -32603) return { key: 'internal', detail: raw }
  }
  if (/failed to fetch|network|load failed|connect|denied/i.test(raw)) {
    return { key: 'network', detail: raw }
  }
  return { key: 'unknown', detail: raw }
}
