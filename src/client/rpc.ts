import type { RpcTransport } from './transport'

// JSON-RPC 2.0 客户端：请求 id 自增、错误码映射、RpcError 归一。
export interface RpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

export interface RpcSuccess<T = unknown> {
  jsonrpc: '2.0'
  id: number
  result: T
}

export interface RpcErrorBody {
  code: number
  message: string
  data?: unknown
}

export interface RpcFailure {
  jsonrpc: '2.0'
  id: number
  error: RpcErrorBody
}

export const RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TASK_NOT_FOUND: -32001,
  UNAUTHORIZED: -32002,
  TASK_NOT_CANCELLABLE: -32003,
  RESYNC_REQUIRED: -32004,
} as const

export class RpcError extends Error {
  readonly code: number
  readonly data?: unknown

  constructor(body: RpcErrorBody | string | null | undefined) {
    // MSG-2581 修①b：invoke 拒错误形（tauri 层）code/message 可缺省——
    // 兜底可读文案（「RPC undefined」零现钉——2567 修前缺注册时现）。
    // MSG-2609 修面二：壳 Err(String) reject 实底为裸串（tauri 命令错误
    // 直传）——旧径按对象读则串体 message 落通用兜底——真因（中止/超时/
    // 拒连）恒不可见「未知错误」——串体直用原文（可辨——勿拼 RPC 前缀
    // 勿现 undefined 裸串——钉恒勿破）。
    const obj = typeof body === 'string' ? null : body
    let message: string
    if (typeof body === 'string') {
      message = body
    } else if (obj && typeof obj.code === 'number' && obj.message) {
      message = `RPC ${obj.code}: ${obj.message}`
    } else {
      message = obj?.message || 'RPC 调用失败（未知错误）'
    }
    super(message)
    this.name = 'RpcError'
    this.code = (obj?.code ?? undefined) as number
    this.data = obj?.data
  }
}

export function isRpcFailure(payload: unknown): payload is RpcFailure {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof (payload as RpcFailure).error?.code === 'number'
  )
}

export class RpcClient {
  private seq = 0

  constructor(private readonly transport: RpcTransport) {}

  async call<T>(method: string, params?: unknown): Promise<T> {
    const id = ++this.seq
    const request: RpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params === undefined ? {} : { params }),
    }
    return (await this.transport.request(request)) as T
  }
}
