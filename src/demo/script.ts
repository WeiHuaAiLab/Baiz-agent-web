// 演示链路：chat.send/permission.respond 的脚本化帧序列（mock 模式）。
//
// 契约基线：《前端协作标准 v1.0》——mock 侧同供新字段（`conversation_id`／
// `pending_total`／`reason`／`risk`）与 §B 新 RPC，使 §E 判据可在 mock 上自测：
// - 每张卡进台账（`permission.pending` 真源，重连补拉即补到真卡）；
// - `scope` ≠ once 落规则 ⇒ 同类第二次**不再弹**；`approval.revoke` 撤销 ⇒ 再弹；
// - 含「定时／收件箱／后台」的消息另出一张 `__inbox__` 卡（无会话来源）。
import { RpcError } from '../client/rpc'
import type { RpcRequest } from '../client/rpc'
import type { SseFrame } from '../client/sse'
import type {
  ApprovalRule,
  ApprovalScope,
  ChatSendParams,
  PermissionRespondParams,
} from '../client/types'
import { INBOX_CONVERSATION_ID } from '../client/types'

let seq = 0
let frameSeq = 0
let ruleSeq = 0

const nextId = () => ++frameSeq

interface DemoCard {
  request_id: string
  task_id: string
  tool_name: string
  args_preview: string
  conversation_id: string
  reason: string
  risk: string
}

/** 挂起卡台账：mock 版 `permission.pending` 的唯一真源 */
const pendingCards: DemoCard[] = []
/** 已记住的规则：mock 版 `approval.rules` 真源 */
const rules: ApprovalRule[] = []

/** 同类操作已有规则 ⇒ 不再弹卡（§C B3：选「本会话」后第二次不弹） */
function hasRule(toolName: string): boolean {
  return rules.some((rule) => rule.rule_content === toolName)
}

/** 落台账 ＋ 出帧（`pending_total` 取台账实数——不虚报积压） */
function pushCard(card: DemoCard): SseFrame[] {
  pendingCards.push(card)
  return [
    {
      id: nextId(),
      event: 'approval.required',
      data: { ...card, pending_total: pendingCards.length },
    },
  ]
}

export function buildDemoFrames(
  taskId: string,
  message: string,
  conversationId?: string,
): SseFrame[] {
  const conv = conversationId || INBOX_CONVERSATION_ID
  // 批0 演示：消息带 官网/网站/页面 关键词 → 播放「企业官网开发」场景
  // （失败字幕 + 循环提示 + 成本小字一次全出，专为体验展示）
  if (/官网|网站|页面|网页|公司|企业/i.test(message)) {
    return [
      { id: nextId(), event: 'task.updated', data: { task_id: taskId, status: 'running', progress: 0 } },
      {
        id: nextId(),
        event: 'reasoning',
        data: {
          task_id: taskId,
          reasoning: '建企业官网：先看现有页面结构，再生成官网首页骨架（导航/轮播/产品/联系），最后补样式和文案。',
        },
      },
      {
        id: nextId(),
        event: 'tool.call',
        data: {
          task_id: taskId,
          call_id: 'w1',
          tool_name: 'list_dir',
          args_preview: '{"path":"site/src"}',
        },
      },
      {
        id: nextId(),
        event: 'tool.result',
        data: { task_id: taskId, call_id: 'w1', success: true, preview: 'components / pages / assets' },
      },
      {
        id: nextId(),
        event: 'token',
        data: { task_id: taskId, token: '（批0 演示）我先看一下项目结构，然后给你搭官网首页。\n\n' },
      },
      {
        id: nextId(),
        event: 'tool.call',
        data: {
          task_id: taskId,
          call_id: 'w2',
          tool_name: 'read_file',
          args_preview: '{"path":"site/src/pages/index.html"}',
        },
      },
      {
        id: nextId(),
        event: 'tool.result',
        data: {
          task_id: taskId,
          call_id: 'w2',
          success: true,
          preview: '现有首页是空壳，只有 <main></main>',
        },
      },
      {
        id: nextId(),
        event: 'tool.call',
        data: {
          task_id: taskId,
          call_id: 'w3',
          tool_name: 'apply_patch',
          args_preview: '{"path":"site/src/pages/index.html","op":"add homepage"}',
        },
      },
      {
        id: nextId(),
        event: 'token',
        data: {
          task_id: taskId,
          token:
            '首页已经搭好了，包含导航、轮播、产品与服务、关于我们、联系方式五块，响应式布局。\n\n```html\n<header class="nav">企业官网</header>\n<section class="hero">\n  <h1>让技术为业务护航</h1>\n  <p>专注企业数字化，10 年行业经验</p>\n</section>\n<section class="products">产品与服务</section>\n<section class="about">关于我们</section>\n<footer>联系我们 · 400-xxx-xxxx</footer>\n```\n',
        },
      },
      {
        id: nextId(),
        event: 'tool.result',
        data: {
          task_id: taskId,
          call_id: 'w3',
          success: true,
          preview: '已新增首页骨架，导航 + 5 个区块',
        },
      },
      {
        id: nextId(),
        event: 'done',
        data: {
          task_id: taskId,
          usage: {
            prompt_tokens: 180,
            completion_tokens: 320,
            total_tokens: 500,
            cost_usd: 0.000412,
            cost_per_mtok: 0.82,
          },
        },
      },
    ]
  }

  const frames: SseFrame[] = [
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
        tool_name: 'web_search',
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
  ]

  // 会话内的审批卡：同类操作已有规则（选了「本会话／本项目／永久」）即不再弹
  if (!hasRule('classify_customers')) {
    frames.push(
      ...pushCard({
        request_id: `req-${taskId}`,
        task_id: taskId,
        tool_name: 'classify_customers',
        args_preview: '{"range":"today"}',
        conversation_id: conv,
        reason: '要给今天的客户打意向标签，先看一遍客户名单再动手',
        risk: 'medium',
      }),
    )
  }

  frames.push(
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
        tool_name: 'code_edit',
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
  )

  // 无会话来源的卡（定时／探针／RPC 触发）：conversation_id = __inbox__
  // ⇒ 前端必须落到「全局收件箱」可见可点（§C B5 判据②）
  if (/定时|收件箱|后台|探针|inbox/i.test(message) && !hasRule('shell_exec')) {
    frames.push(
      ...pushCard({
        request_id: `req-inbox-${taskId}`,
        task_id: `sched-${taskId}`,
        tool_name: 'shell_exec',
        args_preview: '{"command":"cargo test --workspace","cwd":"F:/Projects/BaizAgent"}',
        conversation_id: INBOX_CONVERSATION_ID,
        reason: '定时任务到点要跑一遍全量测试，动到你的项目前先问一声',
        risk: 'high',
      }),
    )
  }

  frames.push({
    id: nextId(),
    event: 'token',
    data: {
      task_id: taskId,
      token:
        '完成客户总结：\n\n- **强意向**：1 家\n- **需跟进**：1 家\n\n| 客户 | 意向 | 动作 |\n|---|---|---|\n| A 公司 | 强 | 今日回访 |\n| B 公司 | 跟进 | 明日联系 |\n\nRust 示例：\n\n```rust\nfn main() {\n    let customers = vec!["A", "B"];\n    println!("客户数: {}", customers.len());\n}\n```\n',
    },
  })
  frames.push({
    id: nextId(),
    event: 'done',
    data: {
      task_id: taskId,
      usage: {
        prompt_tokens: 120,
        completion_tokens: 260,
        total_tokens: 380,
        cost_usd: 0.000318,
        cost_per_mtok: 0.84,
      },
    },
  })
  return frames
}

/** MSG-3511：演示态 `schedule.*` 台账（mock 真源·内存·不落盘）。
 * 字段名与语义对卯 daemon `scheduled_store::TaskSpec`／`RunRecord`：`schedule.list`
 * 与 `schedule.list_runs` 回**裸数组**（handler.rs:1237／1303）。种子与工作区演示
 * 数据同名同义，免得侧栏与子页两处打架。 */
interface DemoSchedTask {
  id: string
  title: string
  instruction: string
  mode: string
  cycle: string
  day: number
  weekday: number
  time_secs: number
  every_secs: number
  run_at_secs: number
  enabled: boolean
  created_at: number
  updated_at: number
  user_id: string
}
interface DemoRun {
  id: number
  task_id: string
  triggered_at: number
  status: string
  summary: string
  error: string
}

const DEMO_SCHED_USER = 'demo@demo.local'
const nowSecs = () => Math.floor(Date.now() / 1000)
/** cycle 白名单六档（对卯 daemon handler.rs:1217-1222） */
const DEMO_CYCLES = ['monthly', 'weekly', 'daily', 'hourly', 'interval', 'once']

let schedSeq = 0

function demoSchedTask(
  index: string,
  title: string,
  instruction: string,
  mode: string,
  cycle: string,
  timeSecs: number,
  ageSecs: number,
): DemoSchedTask {
  return {
    id: `sched-demo-${index}`,
    title,
    instruction,
    mode,
    cycle,
    day: 1,
    weekday: 1,
    time_secs: timeSecs,
    every_secs: 0,
    run_at_secs: 0,
    enabled: true,
    created_at: nowSecs() - ageSecs,
    updated_at: nowSecs() - ageSecs,
    user_id: DEMO_SCHED_USER,
  }
}

function demoRun(
  id: number,
  taskId: string,
  agoSecs: number,
  status: string,
  summary = '',
  error = '',
): DemoRun {
  return { id, task_id: taskId, triggered_at: nowSecs() - agoSecs, status, summary, error }
}

const demoTasks: DemoSchedTask[] = [
  demoSchedTask(
    '1',
    '每日客户日报',
    '每天早晨汇总前一天微信客户沟通记录，生成日报发送到「客户管理」项目',
    'cloud',
    'daily',
    9 * 3600,
    4 * 24 * 3600,
  ),
  demoSchedTask(
    '2',
    'Rust 工具箱每周备份',
    '每周一晚上把 Rust 工具箱项目变更提交归档，生成 changelog',
    'local',
    'weekly',
    20 * 3600,
    2 * 24 * 3600,
  ),
  demoSchedTask(
    '3',
    '服务健康巡检',
    '每小时检查一次本地服务进程状态，异常时输出告警',
    'cloud',
    'hourly',
    0,
    6 * 24 * 3600,
  ),
]

/** 执行记录台账（runs——「真在跑与产出」的可视样本） */
const demoRuns: Record<string, DemoRun[]> = {
  'sched-demo-1': [
    demoRun(1, 'sched-demo-1', 3 * 3600, 'success', '已生成日报并发送到「客户管理」项目'),
    demoRun(2, 'sched-demo-1', 27 * 3600, 'success', '已生成日报（28 条客户沟通记录）'),
  ],
  'sched-demo-3': [
    demoRun(3, 'sched-demo-3', 600, 'success', '本地服务进程正常（3/3）'),
    demoRun(4, 'sched-demo-3', 3600, 'skipped', '上一轮仍在执行，本轮跳过'),
  ],
}

export function demoHandle(req: RpcRequest): { result?: unknown; frames?: SseFrame[] } | null {
  if (req.method === 'chat.send') {
    const params = req.params as ChatSendParams | undefined
    const taskId = `demo-${Date.now().toString(36)}-${++seq}`
    const message = params?.message ?? ''
    // 队列演示：消息含「排队」⇒ 回执带 queued／position（§A3）
    if (/排队|queue/i.test(message)) {
      return {
        result: {
          task_id: taskId,
          status: 'queued',
          model: 'mock-demo',
          queued: true,
          position: 2,
        },
        frames: [
          { id: nextId(), event: 'task.updated', data: { task_id: taskId, status: 'queued' } },
        ],
      }
    }
    return {
      result: { task_id: taskId, status: 'running', model: 'mock-demo', queued: false },
      frames: buildDemoFrames(taskId, message, params?.conversation_id),
    }
  }
  if (req.method === 'permission.respond') {
    const params = req.params as PermissionRespondParams
    const index = pendingCards.findIndex((card) => card.request_id === params.request_id)
    const card = index >= 0 ? pendingCards.splice(index, 1)[0] : undefined
    // 档位 ≠ once ⇒ 落规则：同类第二次不再弹（§C B3 判据④）
    const scope = params.scope as ApprovalScope | undefined
    if (card && scope && scope !== 'once') {
      ruleSeq += 1
      rules.push({
        rule_id: `rule-${ruleSeq}`,
        rule_content: card.tool_name,
        authorized_root: card.conversation_id,
        scope,
        revision: 1,
        created: new Date().toISOString(),
      })
    }
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
  if (req.method === 'permission.pending') {
    return {
      result: {
        pending: pendingCards.map((card) => ({
          request_id: card.request_id,
          action: card.tool_name,
          risk: card.risk,
          details: card.args_preview,
          reason: card.reason,
          conversation_id: card.conversation_id,
          status: 'pending',
          created_at: new Date().toISOString(),
        })),
      },
    }
  }
  if (req.method === 'approval.rules') return { result: rules }
  if (req.method === 'approval.revoke') {
    const params = req.params as { rule_id?: string } | undefined
    const index = rules.findIndex((rule) => rule.rule_id === params?.rule_id)
    if (index >= 0) rules.splice(index, 1)
    return { result: { revoked: index >= 0 } }
  }
  if (req.method === 'approval.policy') {
    return {
      result: {
        levels: [
          { name: 'deny', priority: 1 },
          { name: 'mode_baseline', priority: 2 },
          { name: 'auto', priority: 3 },
          { name: 'ask', priority: 4 },
        ],
      },
    }
  }
  if (req.method === 'approval.escalate') return { result: { escalated: true } }
  if (req.method === 'chat.queue_cancel') return { result: { cancelled: true } }
  if (req.method === 'a2a.status') return { result: { enabled: false, tasks: 0 } }
  if (req.method === 'auth.provide_key') return { result: { stored: true } }
  if (req.method === 'auth.login') {
    // mock 登录：演示模式正常账号密码放行；遇密码 'wrong' 模拟登录失败，
    // 供测试验证败面通用拒词零泄词（DEBT-398 例）。
    const params = req.params as { email?: string; password?: string } | undefined
    if (params?.password === 'wrong') return null
    return {
      result: {
        session_token: `mock-${Date.now().toString(36)}`,
        user_id: params?.email ?? 'demo@demo.local',
        provider: 'mock',
      },
    }
  }
  // MSG-3511：演示态 schedule.* 五方法（返回形对卯 daemon handler.rs:1203-1306）
  if (req.method === 'schedule.create') {
    const spec = req.params as Partial<DemoSchedTask> | undefined
    const cycle = String(spec?.cycle ?? '')
    if (!DEMO_CYCLES.includes(cycle)) {
      throw new RpcError({ code: -32602, message: 'invalid cycle——白名单六档' })
    }
    if (!String(spec?.title ?? '').trim()) {
      throw new RpcError({ code: -32602, message: 'title 不能为空' })
    }
    schedSeq += 1
    const id = String(spec?.id ?? '') || `sched-demo-${schedSeq}-${Date.now().toString(36)}`
    const now = nowSecs()
    demoTasks.push({
      id,
      title: String(spec?.title ?? '').trim(),
      instruction: String(spec?.instruction ?? ''),
      mode: String(spec?.mode ?? 'cloud'),
      cycle,
      day: Number(spec?.day ?? 0),
      weekday: Number(spec?.weekday ?? 0),
      time_secs: Number(spec?.time_secs ?? 0),
      every_secs: Number(spec?.every_secs ?? 0),
      run_at_secs: Number(spec?.run_at_secs ?? 0),
      enabled: spec?.enabled !== false,
      created_at: now,
      updated_at: now,
      // 服务端覆写归属（勿信客户端自报）——演示态同口径
      user_id: DEMO_SCHED_USER,
    })
    return { result: { id } }
  }
  if (req.method === 'schedule.list') return { result: demoTasks }
  if (req.method === 'schedule.toggle') {
    const params = req.params as { task_id?: string; enabled?: boolean } | undefined
    const task = demoTasks.find((item) => item.id === params?.task_id)
    if (!task) return null
    task.enabled = Boolean(params?.enabled)
    task.updated_at = nowSecs()
    return { result: { ok: true } }
  }
  if (req.method === 'schedule.delete') {
    const params = req.params as { task_id?: string } | undefined
    const index = demoTasks.findIndex((item) => item.id === params?.task_id)
    if (index < 0) return null
    demoTasks.splice(index, 1)
    delete demoRuns[String(params?.task_id)]
    return { result: { ok: true } }
  }
  if (req.method === 'schedule.list_runs') {
    const params = req.params as { task_id?: string; limit?: number } | undefined
    const taskId = String(params?.task_id ?? '')
    if (!taskId) {
      throw new RpcError({ code: -32602, message: 'invalid schedule.list_runs params' })
    }
    const limit = Math.min(200, Math.max(1, Number(params?.limit ?? 20) || 20))
    return { result: (demoRuns[taskId] ?? []).slice(0, limit) }
  }
  if (req.method === 'event.subscribe') {
    return { result: { subscribed: true, latest_seq: 0, oldest_seq: 0 } }
  }
  return null
}
