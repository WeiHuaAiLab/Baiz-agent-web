// W2（1.0.48）：模型服务探测结果展示态（纯函数·不依赖后端 command）。
// 口径：probe 八态闭集由 daemon 单源返回——前端按 state 分支，勿再按 HTTP 自行分类
//（1.0.47 的「四态分类」已由壳/daemon 收编为八态闭集）。
import type { ModelServiceProbe } from '../client/modelService'

export type { ModelServiceProbeState } from '../client/modelService'

export interface ProbeOutcome {
  /** 仅 ready（真实探活 200）为「已配置」——非本地标记 */
  ready: boolean
  kind: ModelServiceProbe['state']
  models: string[]
  httpStatus?: number
  retryAfterSecs?: number
  detail?: string
}

/** probe 八态 → 展示态：ready 判定＋models 实拉透传＋限流/HTTP 细节照录。 */
export function probeOutcome(probe: ModelServiceProbe | null | undefined): ProbeOutcome {
  const state: ModelServiceProbe['state'] = probe?.state ?? 'unreachable'
  const rawModels = probe?.models
  const models = Array.isArray(rawModels) ? rawModels.filter((m) => !!m) : []
  return {
    ready: state === 'ready',
    kind: state,
    models,
    httpStatus: probe?.httpStatus,
    retryAfterSecs: probe?.retryAfterSecs,
    detail: probe?.detail,
  }
}
