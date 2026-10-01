// W2（1.0.47）：模型服务探测结果四态分类（纯函数·不依赖后端 command；供 UI 显示用）。
// 口径（照令/补告·已定）：「✓ 已配置」＝GET {base}/models 返 200；错误四态＝
// 200+正文含「没有权限」（模型未加入允许列表）／403 额度不足／503 模型无通道／401 key 无效。

export type ModelServiceProbeState =
  | 'ok' // 200 正常（已配置）
  | 'no-permission' // 200 + 正文含「没有权限」（模型未加入允许列表）
  | 'quota' // 403 额度不足（insufficient_user_quota）
  | 'no-channel' // 503 模型无通道（model_not_found）
  | 'invalid-key' // 401 key 无效/缺失

/** 按 HTTP 状态码＋正文把探测结果分类成四态（+正常）；非明确态保守归「invalid-key」。 */
export function classifyModelServiceProbe(status: number, body = ''): ModelServiceProbeState {
  if (status === 200) {
    return body.includes('没有权限') ? 'no-permission' : 'ok'
  }
  if (status === 401) return 'invalid-key'
  if (status === 403) return 'quota'
  if (status === 503) return 'no-channel'
  // 兜底：非 200 且非 401/403/503（如 429 限流、网络不可达）——本阶段保守归 invalid-key，
  // 真实接线时按探测返回值细分（429 读 Retry-After、网络不可达另列）。
  return 'invalid-key'
}
