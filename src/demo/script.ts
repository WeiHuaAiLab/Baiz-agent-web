// 演示链路：chat.send/permission.respond 的脚本化帧序列（mock 模式）。
import type { RpcRequest } from '../client/rpc'
import type { SseFrame } from '../client/sse'
import type { ChatSendParams, PermissionRespondParams } from '../client/types'

let seq = 0
let frameSeq = 0

const nextId = () => ++frameSeq

export function buildDemoFrames(taskId: string, message: string): SseFrame[] {
  return [
    { id: nextId(), event: 'task.updated', data: { task_id: taskId, status: 'running', progress: 0 } },
    {
      id: nextId(),
      event: 'reasoning',
      data: {
        task_id: taskId,
        reasoning: '拆解任务：先检索上下文，再执行客户分类（需审批），最后汇总为 Markdown 报告。',
      },
    },
    {
      id: nextId(),
      event: 'tool.call',
      data: {
        task_id: taskId,
        call_id: 'c1',
        tool_name: 'web.search',
        args_preview: '{"q":"客户行业背景"}',
      },
    },
    {
      id: nextId(),
      event: 'token',
      data: { task_id: taskId, token: `（M2 演示 · mock 链路）已收到：${message}\n\n` },
    },
    {
      id: nextId(),
      event: 'tool.result',
      data: { task_id: taskId, call_id: 'c1', success: true, preview: '检索到 3 条行业资料' },
    },
    {
      id: nextId(),
      event: 'tool.call',
      data: {
        task_id: taskId,
        call_id: 'c2',
        tool_name: 'classify_customers',
        args_preview: '{"range":"today"}',
      },
    },
    {
      id: nextId(),
      event: 'approval.required',
      data: {
        request_id: `req-${taskId}`,
        task_id: taskId,
        tool_name: 'classify_customers',
        args_preview: '{"range":"today"}',
      },
    },
    {
      id: nextId(),
      event: 'tool.result',
      data: {
        task_id: taskId,
        call_id: 'c2',
        success: true,
        preview: '意向分级：强 1 / 需跟进 1 / 一般 1',
      },
    },
    {
      id: nextId(),
      event: 'tool.call',
      data: {
        task_id: taskId,
        call_id: 'c3',
        tool_name: 'code.edit',
        args_preview: '{"path":"src/stores/message.ts"}',
      },
    },
    {
      id: nextId(),
      event: 'tool.result',
      data: {
        task_id: taskId,
        call_id: 'c3',
        success: true,
        preview: '已修改 2 处',
      },
    },
    {
      id: nextId(),
      event: 'token',
      data: {
        task_id: taskId,
        token:
          '完成客户总结：\n\n- **强意向**：1 家\n- **需跟进**：1 家\n\n| 客户 | 意向 | 动作 |\n|---|---|---|\n| A 公司 | 强 | 今日回访 |\n| B 公司 | 跟进 | 明日联系 |\n\nRust 示例：\n\n```rust\nfn main() {\n    let customers = vec!["A", "B"];\n    println!("客户数: {}", customers.len());\n}\n```\n',
      },
    },
    {
      id: nextId(),
      event: 'done',
      data: {
        task_id: taskId,
        usage: { prompt_tokens: 120, completion_tokens: 260, total_tokens: 380 },
      },
    },
  ]
}

export function demoHandle(req: RpcRequest): { result?: unknown; frames?: SseFrame[] } | null {
  if (req.method === 'chat.send') {
    const params = req.params as ChatSendParams | undefined
    const taskId = `demo-${Date.now().toString(36)}-${++seq}`
    return {
      result: { task_id: taskId, status: 'running', model: 'mock-demo' },
      frames: buildDemoFrames(taskId, params?.message ?? ''),
    }
  }
  if (req.method === 'permission.respond') {
    const params = req.params as PermissionRespondParams
    return {
      result: { resolved: true, status: params.approved ? 'approved' : 'denied' },
      frames: [
        {
          id: nextId(),
          event: 'approval.resolved',
          data: { request_id: params.request_id, approved: params.approved },
        },
      ],
    }
  }
  if (req.method === 'a2a.status') return { result: { enabled: false, tasks: 0 } }
  if (req.method === 'permission.pending') return { result: { pending: [] } }
  if (req.method === 'auth.provide_key') return { result: { stored: true } }
  if (req.method === 'event.subscribe') {
    return { result: { subscribed: true, latest_seq: 0, oldest_seq: 0 } }
  }
  return null
}
