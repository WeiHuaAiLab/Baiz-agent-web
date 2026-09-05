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

  constructor(body: RpcErrorBody) {
    // MSG-2581 修①b：invoke 拒错误形（tauri 层）code/message 可缺省——
    // 兜底可读文案（「RPC undefined」零现钉——2567 修前缺注册时现）
    super(
      typeof body.code === 'number' && body.message
        ? `RPC ${body.code}: ${body.message}`
        : body.message || 'RPC 调用失败（未知错误）',
    )
    this.name = 'RpcError'
    this.code = body.code
    this.data = body.data
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
