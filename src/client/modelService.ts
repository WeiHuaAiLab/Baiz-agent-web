// W2（1.0.48）：模型服务配置面四 command 客户端封装（壳侧 tauri command）。
// 契约（1048-刀-W2后端command-回执）：key 零回显（只尾 4 位掩码）、probe 八态闭集、
// 401 等业务态＝成功回执（据 state 判文案·非异常）、usage 逐字「暂不支持」。

/** get/set 面：{base, model, keySet, keyMasked}（keyMasked＝"****"+尾4，零明文） */
export interface ModelServiceFace {
  base: string
  model: string
  keySet: boolean
  keyMasked: string
}

/** probe 八态闭集（daemon 单源 ModelServiceProbe） */
export type ModelServiceProbeState =
  | 'ready'
  | 'unauthorized'
  | 'insufficientQuota'
  | 'modelNotFound'
  | 'modelNotAllowed'
  | 'rateLimited'
  | 'httpError'
  | 'unreachable'

export interface ModelServiceProbe {
  state: ModelServiceProbeState
  httpStatus?: number
  /** ready 态附服务端模型清单（勿写死） */
  models?: string[]
  model?: string
  retryAfterSecs?: number
  detail?: string
}

export interface ModelServiceUsage {
  supported: boolean
  message: string
}

async function inv<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export const modelService = {
  get: () => inv<ModelServiceFace>('model_service_get'),
  set: (args: { base?: string; model?: string; key?: string }) =>
    inv<ModelServiceFace>('model_service_set', args),
  probe: () => inv<ModelServiceProbe>('model_service_probe'),
  usage: () => inv<ModelServiceUsage>('model_service_usage'),
}
