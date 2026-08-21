// 种子数据：首次启动生成 3 个演示会话（客户总结/Rust 重构/周报起草）。
import { db } from '../db'
import type { ChatMessage } from '../models'

let seedSeq = 0

function msg(
  conversationId: string,
  kind: ChatMessage['kind'],
  text: string,
  createdAt: number,
  meta?: ChatMessage['meta'],
): ChatMessage {
  seedSeq += 1
  return { id: `seed-${kind}-${seedSeq}`, conversationId, kind, text, createdAt, ...(meta ? { meta } : {}) }
}

export async function seedDemoIfNeeded(): Promise<void> {
  if (localStorage.getItem('baiz.seeded') === '1') return
  const count = await db.conversations.count()
  if (count > 0) {
    localStorage.setItem('baiz.seeded', '1')
    return
  }

  const now = Date.now()
  const conv = [
    { id: 'seed-conv-customers', title: '今日客户总结', createdAt: now - 3_600_000 },
    { id: 'seed-conv-rust', title: 'Rust 项目重构', createdAt: now - 7_200_000 },
    { id: 'seed-conv-report', title: '周报起草', createdAt: now - 10_800_000 },
  ]
  await db.conversations.bulkAdd(
    conv.map((item) => ({ id: item.id, title: item.title, createdAt: item.createdAt, updatedAt: item.createdAt })),
  )

  const messages: ChatMessage[] = []
  const t1 = conv[0].createdAt + 60_000
  messages.push(
    msg('seed-conv-customers', 'user', '帮我总结今天的客户情况', t1),
    msg(
      'seed-conv-customers',
      'tool_call',
      '检索到 3 条行业资料',
      t1 + 1_000,
      { taskId: 'seed-task-1', callId: 's1', toolName: 'web.search', argsPreview: '{"q":"客户行业背景"}', success: true },
    ),
    msg(
      'seed-conv-customers',
      'tool_call',
      '意向分级：强 1 / 需跟进 1 / 一般 1',
      t1 + 2_000,
      { taskId: 'seed-task-1', callId: 's2', toolName: 'classify_customers', argsPreview: '{"range":"today"}', success: true },
    ),
    msg(
      'seed-conv-customers',
      'approval',
      '已批准',
      t1 + 2_500,
      { taskId: 'seed-task-1', requestId: 'seed-req-1', toolName: 'classify_customers', argsPreview: '{"range":"today"}', action: 'classify_customers', risk: 'high', approved: true },
    ),
    msg(
      'seed-conv-customers',
      'assistant',
      `完成客户总结：\n\n- **强意向**：1 家\n- **需跟进**：1 家\n\n| 客户 | 意向 | 动作 |\n|---|---|---|\n| A 公司 | 强 | 今日回访 |\n| B 公司 | 跟进 | 明日联系 |\n\n\`\`\`rust\nfn summary(customers: &[String]) -> usize {\n    customers.len()\n}\n\`\`\`\n`,
      t1 + 3_000,
      { taskId: 'seed-task-1', elapsedMs: 4_800, streaming: false, status: 'completed' },
    ),
  )

  const t2 = conv[1].createdAt + 60_000
  messages.push(
    msg('seed-conv-rust', 'user', '帮我重构这个 Rust 模块，超过 600 行的文件要拆开', t2),
    msg(
      'seed-conv-rust',
      'assistant',
      `按"一文件一事"原则拆分：\n\n1. 把 779 行的主函数改为状态机枚举控制流\n2. 17 项参数打包为上下文结构体\n\n\`\`\`rust\nstruct SseLoopCtx {\n    task_id: String,\n    last_seq: u64,\n}\n\nenum SseLoopEnd {\n    Reconnect,\n    Done,\n}\n\nfn run_loop(ctx: SseLoopCtx) -> SseLoopEnd {\n    // ...\n    SseLoopEnd::Done\n}\n\`\`\`\n\n拆完每个文件均低于 600 行，行为等价。`,
      t2 + 2_000,
      { taskId: 'seed-task-2', elapsedMs: 23_000, streaming: false, status: 'completed' },
    ),
  )

  const t3 = conv[2].createdAt + 60_000
  messages.push(
    msg('seed-conv-report', 'user', '起草本周工作周报', t3),
    msg(
      'seed-conv-report',
      'assistant',
      `# 本周工作周报\n\n| 项目 | 进展 | 风险 |\n|---|---|---|\n| 前端重构 | 消息流/审批卡完成 | 低 |\n| 记忆引擎 | 蒸馏管线设计中 | 中 |\n\n**下周计划**\n\n- 接通 daemon 网关\n- 完成 M5 打包验证\n`,
      t3 + 3_000,
      { taskId: 'seed-task-3', elapsedMs: 61_000, streaming: false, status: 'completed' },
    ),
  )

  await db.messages.bulkAdd(messages)
  localStorage.setItem('baiz.seeded', '1')
}
