// 消息流 store：SSE 事件组装（token/工具/审批/完成）、run 轨迹、本地持久化。
import { defineStore } from 'pinia'
import { db } from '../db'
import { getClient } from '../client/singleton'
import type { AttachmentItem } from './files'
import { mapRpcError } from '../utils/errors'
import { useUiStore } from './ui'
import { useSettingsStore } from './settings'
import { useWorkingTreeStore } from './workingTree'
import type {
  ChatMessage,
  MessageMeta,
  RunState,
  SubtitleItem,
  UsageCost,
} from '../models'
import type {
  ApprovalRequiredData,
  DaemonNotifyData,
  DoneData,
  ErrorData,
  ReasoningData,
  TokenData,
  ToolCallData,
  ToolResultData,
} from '../client/types'

// 流式节流：首个 token 即时生效，后续 token 累积到 100ms 窗口统一刷新 UI。
const tokenBuffers = new Map<string, string>()
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>()
// 持久化节流：流式期间消息文本 500ms 防抖写库，done 时一次性写最终稿。
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()
const RUNS_LIMIT = 50

let messageSeq = 0

// 批0 循环提示：按会话记录「同类错误」出现次数（错误码/首行摘要），第 3 次起给台阶
const errorCounters = new Map<string, Map<string, number>>()

// DeepSeek 现行价（美元/百万 token；只做展示口径，真实价由 daemon 归一后回填）
const USD_PER_MT: Record<string, number> = { input: 0.27, output: 1.1 }

/** 批0 成本小字：token 用量 → 人民币成本（按 7.1 汇率展示） */
export function estimateCostUsd(usage: {
  prompt_tokens: number
  completion_tokens: number
}): number {
  const input = (usage.prompt_tokens / 1_000_000) * USD_PER_MT.input
  const output = (usage.completion_tokens / 1_000_000) * USD_PER_MT.output
  return input + output
}

/** 工具名 → 中文俗称（字幕里不说英文，说人话） */
const TOOL_NAMES_ZH: Record<string, string> = {
  shell_exec: '命令',
  cargo_test: '测试',
  cargo_build: '编译',
  apply_patch: '改代码',
  grep_files: '搜代码',
  read_file: '读文件',
  list_dir: '看目录',
  web_fetch: '抓网页',
  web_search: '搜索',
  code_edit: '改代码',
  fs_write: '写文件',
  fs_read: '读文件',
  git_commit: '提交代码',
  git_diff: '看改动',
  wechat_read: '读微信',
  classify_customers: '客户分级',
  crm_push: '推给 CRM',
}

/** 批0 人话字幕：把一次工具调用翻译成小白能看懂的一句话（说人话，不说术语） */
export function subtitleForTool(toolName: string, success: boolean, preview: string): string {
  const zh = TOOL_NAMES_ZH[toolName] ?? toolName
  const brief = (preview || '').slice(0, 50)

  if (success) {
    switch (toolName) {
      case 'cargo_test':
      case 'cargo_build':
        return `测试跑通了，${brief || '一切正常'}——你放心，没弄坏任何东西。`
      case 'apply_patch':
      case 'code_edit':
        return `代码已经按你的意思改好了${brief ? `（${brief}）` : ''}，下一步我帮你验证一下。`
      case 'grep_files':
        return `帮你找到了${brief ? `：${brief}` : ''}，就是它。`
      case 'read_file':
      case 'fs_read':
        return `文件看完了${brief ? `（${brief}）` : ''}，内容我已经掌握了。`
      case 'list_dir':
        return `目录结构看清楚了${brief ? `（${brief}）` : ''}，我知道东西都在哪了。`
      case 'fs_write':
        return `文件写好了${brief ? `（${brief}）` : ''}。`
      case 'git_commit':
        return `这次改动已经存档了${brief ? `（${brief}）` : ''}，随时可以找回。`
      case 'git_diff':
        return `改动对比出来了${brief ? `（${brief}）` : ''}，就这些地方变了。`
      case 'wechat_read':
        return `微信消息读完了：${brief || '已整理好'}。`
      case 'crm_push':
        return `已经推给 CRM 了${brief ? `（${brief}）` : ''}，客户那边能看到。`
      case 'web_search':
        return `网上帮你查到了${brief ? `（${brief}）` : ''}。`
      case 'web_fetch':
        return `网页内容拿到了${brief ? `（${brief}）` : ''}。`
      case 'shell_exec':
        return `命令执行成功${brief ? `：${brief}` : ''}，这类安全操作不用打扰你。`
      case 'classify_customers':
        return `客户分好级了：${brief || '按意向排好了'}。`
      default:
        return brief
          ? `「${zh}」这一步做完了：${brief}。`
          : `「${zh}」这一步顺利完成了。`
    }
  }

  switch (toolName) {
    case 'cargo_test':
    case 'cargo_build':
      return `测试没通过：${brief || '有失败用例'}。别急，先看是哪条没过，我再对症修。`
    case 'grep_files':
      return `没搜到你要的内容${brief ? `（${brief}）` : ''}，换个说法或换个位置再试。`
    case 'web_search':
      return `这轮没查到有用结果${brief ? `（${brief}）` : ''}，我换个角度再搜。`
    case 'web_fetch':
      return `网页没抓下来（${brief || '可能被拦了'}），换个来源试试。`
    case 'shell_exec':
      return `命令没跑通：${brief || '看输出'}。没事，我根据报错继续调整。`
    case 'apply_patch':
    case 'code_edit':
      return `这次改动没应用上（${brief || '补丁有问题'}），我检查一下再试。`
    case 'fs_write':
      return `文件没写成（${brief || '权限或路径问题'}），我换个位置试试。`
    case 'git_commit':
      return `这次改动没存上（${brief || '可能有冲突'}），我处理一下再提交。`
    case 'crm_push':
      return `推 CRM 没成功（${brief || '接口报错'}），我先查一下原因。`
    default:
      return brief
        ? `「${zh}」这一步没做成：${brief}。我换个方式继续。`
        : `「${zh}」这一步卡住了，我换个思路继续。`
  }
}

/** 批0 循环提示：同一会话同类错误第 3 次出现时，给"别硬修"的台阶 */
export function loopHintForError(conversationId: string, message: string): string | null {
  const code = /E\d{4}/.exec(message)?.[0] ?? message.trim().slice(0, 24)
  if (!code) return null
  let perConv = errorCounters.get(conversationId)
  if (!perConv) {
    perConv = new Map<string, number>()
    errorCounters.set(conversationId, perConv)
  }
  const n = (perConv.get(code) ?? 0) + 1
  perConv.set(code, n)
  if (n < 3) return null
  return `这是第 ${n} 次尝试修复同类错误（${code}）了，建议别再硬修——先看证据（上次失败的位置/输出），或换一种实现思路。`
}

function cloneForDb<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function parsePathFromArgs(argsPreview?: string): string {
  if (!argsPreview) return ''
  try {
    const parsed = JSON.parse(argsPreview) as { path?: string }
    return typeof parsed.path === 'string' ? parsed.path : ''
  } catch {
    return ''
  }
}

function makeMessage(
  conversationId: string,
  kind: ChatMessage['kind'],
  text: string,
  meta?: MessageMeta,
): ChatMessage {
  messageSeq += 1
  return {
    id: `${kind}-${Date.now().toString(36)}-${messageSeq}`,
    conversationId,
    kind,
    text,
    createdAt: Date.now(),
    ...(meta ? { meta } : {}),
  }
}

export type MessageStore = ReturnType<typeof useMessageStore>

export const useMessageStore = defineStore('message', {
  state: () => ({
    byConversation: {} as Record<string, ChatMessage[]>,
    runs: {} as Record<string, RunState>,
    callToMessage: {} as Record<string, string>,
    requestToMessage: {} as Record<string, string>,
    requestToConversation: {} as Record<string, string>,
  }),
  actions: {
    list(conversationId: string): ChatMessage[] {
      return this.byConversation[conversationId] ?? []
    },
    async load(conversationId: string) {
      if (this.byConversation[conversationId]) return
      const rows = await db.messages.where('conversationId').equals(conversationId).sortBy('createdAt')
      this.byConversation[conversationId] = rows
    },
    async push(conversationId: string, message: ChatMessage) {
      if (!this.byConversation[conversationId]) this.byConversation[conversationId] = []
      this.byConversation[conversationId].push(message)
      await db.messages.add(cloneForDb(message))
    },
    activeRuns(conversationId: string): RunState[] {
      return Object.values(this.runs).filter(
        (run) => run.conversationId === conversationId && run.status === 'running',
      )
    },
    /** queued→running 翻转守卫：daemon 端 FIFO 启动时 task.updated 首帧可
     * 报 queued 状态（前端排队体验层已下架，但帧面守卫保留——勿误伤） */
    markRunActive(taskId: string) {
      const run = this.runs[taskId]
      if (!run || run.status !== 'queued') return
      run.status = 'running'
    },
    async sendUserMessage(
      conversationId: string,
      text: string,
      workspace?: string,
      attachments?: AttachmentItem[],
    ) {
      let effective = text
      if (attachments && attachments.length > 0) {
        const blocks = attachments.map((attachment) => {
          // content 为可选：图片 / 二进制文件本期不读内容（只有元信息），
          // 此时只带文件名；文本附件才拼接前 4000 字符
          const body = attachment.content?.slice(0, 4000)
          return `\n\n\`\`\`\n[附件：${attachment.name}]${body ? `\n${body}` : ''}\n\`\`\``
        })
        effective = `${text}${blocks.join('')}`
      }
      // 附件随消息 meta 一起入列：消息区渲染缩略图 / 文件概要；
      // 发送给后端的仍是 effective（拼接附件正文），两处各司其职。
      await this.push(
        conversationId,
        makeMessage(conversationId, 'user', text, {
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
        }),
      )
      const clientTaskId = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      this.ensureRun(clientTaskId, conversationId)
      try {
        // DEBT-284 口径B 预防性钉桩（裁1020）：发送路径禁 per-task
        // subscribe——main.ts 的 SseReconnect 已用 task_id='*'
        // （DEBT-87 通配）建立全局订阅；Rust 壳 proxy_subscribe 是单例
        // （新订阅会 abort 旧订阅），此处若再 subscribe 会把全局订阅
        // 顶掉，导致跨会话/多任务事件丢失。事件归属由 daemon gate.rs
        // 按帧 task_id 过滤后全量推送。
        // 注记（勘盘轻红修订）：e77fecd 基面无实删面——「每次发送都
        // subscribe」系预防性口径，非既存缺陷修复。
        const result = await getClient().chatSend({
          message: effective,
          conversation_id: conversationId,
          client_task_id: clientTaskId,
          ...(workspace ? { workspace } : {}),
          // MSG-2341（A-4 升格）：设置面所选模型透传 chat.send 载荷——
          // 状态栏（ChatHeader model-chip）同取 settings.model，显示与发送对卯
          model: useSettingsStore().model,
        })
        if (result.task_id && result.task_id !== clientTaskId) {
          const run = this.runs[clientTaskId]
          if (run) {
            delete this.runs[clientTaskId]
            run.taskId = result.task_id
            this.runs[result.task_id] = run
          }
        }
      } catch (error) {
        const run = this.runs[clientTaskId]
        const mapped = mapRpcError(error)
        if (run) {
          run.status = 'failed'
          run.finishedAt = Date.now()
          run.elapsedMs = run.finishedAt - run.startedAt
        }
        await this.push(
          conversationId,
          makeMessage(conversationId, 'status', mapped.detail, {
            status: 'error',
            statusKey: 'sendFailed',
            errorKey: mapped.key,
          }),
        )
      }
    },
    async removeMessage(conversationId: string, messageId: string) {
      const list = this.byConversation[conversationId]
      if (!list) return
      this.byConversation[conversationId] = list.filter((item) => item.id !== messageId)
      await db.messages.delete(messageId)
    },
    async regenerate(conversationId: string, beforeMessageId?: string) {
      const list = this.list(conversationId)
      const index = beforeMessageId
        ? list.findIndex((item) => item.id === beforeMessageId)
        : list.length
      for (let i = index - 1; i >= 0; i -= 1) {
        if (list[i].kind === 'user') {
          await this.sendUserMessage(conversationId, list[i].text)
          return
        }
      }
    },
    async retryFrom(conversationId: string, fromMessageId: string) {
      const list = this.list(conversationId)
      const index = list.findIndex((item) => item.id === fromMessageId)
      for (let i = index - 1; i >= 0; i -= 1) {
        if (list[i].kind === 'user') {
          await this.sendUserMessage(conversationId, list[i].text)
          return
        }
      }
    },
    stopRun(taskId: string) {
      this.flushRun(taskId)
      const run = this.runs[taskId]
      if (!run || run.status !== 'running') return
      // MSG-2318 A-2：停止键接 task.cancel——复用 chatQueueCancel
      // （index.ts 2311 已映射 task.cancel 真径）；本地清面照留；
      // 请求失败留痕不扰本地（cancelled 守卫已挡后续帧，daemon 侧自然收束）
      if (run.conversationId) {
        void getClient()
          .chatQueueCancel({ conversation_id: run.conversationId, task_id: taskId })
          .catch(() =>
            console.warn(
              '[baiz] stopRun 取消请求失败——本地已停止，daemon 侧若仍在跑将自然收束',
            ),
          )
      }
      run.status = 'cancelled'
      run.finishedAt = Date.now()
      run.elapsedMs = run.finishedAt - run.startedAt
      if (!run.conversationId) return
      const msg = this.byConversation[run.conversationId]?.find(
        (item) => item.meta?.taskId === taskId && item.kind === 'assistant',
      )
      if (msg) {
        msg.text = `${run.text}\n\n（已停止）`
        msg.meta = { ...msg.meta, elapsedMs: run.elapsedMs, streaming: false, status: 'cancelled' }
        const timer = persistTimers.get(msg.id)
        if (timer) clearTimeout(timer)
        persistTimers.delete(msg.id)
        void db.messages.put(cloneForDb(msg))
      } else {
        const stopped = makeMessage(run.conversationId, 'assistant', `${run.text}\n\n（已停止）`, {
          taskId,
          elapsedMs: run.elapsedMs,
          streaming: false,
          status: 'cancelled',
        })
        void this.push(run.conversationId, stopped)
      }
      this.trimRuns()
    },
    flushRun(taskId: string) {
      const timer = flushTimers.get(taskId)
      if (timer) {
        clearTimeout(timer)
        flushTimers.delete(taskId)
      }
      const delta = tokenBuffers.get(taskId)
      tokenBuffers.delete(taskId)
      const run = this.runs[taskId]
      if (!run) return
      if (delta) run.text += delta
      if (!run.conversationId) return
      // 流式期间不创建持久化消息（由 streaming-tail 独占渲染），done/stop 才落地
      const existing = this.byConversation[run.conversationId]?.find(
        (item) => item.meta?.taskId === taskId && item.kind === 'assistant',
      )
      if (existing) {
        existing.text = run.text
        this.persistSoon(existing)
      }
    },
    persistSoon(message: ChatMessage) {
      const existing = persistTimers.get(message.id)
      if (existing) clearTimeout(existing)
      persistTimers.set(
        message.id,
        setTimeout(() => {
          persistTimers.delete(message.id)
          void db.messages.put(cloneForDb(message))
        }, 500),
      )
    },
    trimRuns() {
      const entries = Object.values(this.runs).sort((a, b) => b.startedAt - a.startedAt)
      if (entries.length <= RUNS_LIMIT) return
      for (const run of entries.slice(RUNS_LIMIT)) {
        if (run.status !== 'running') delete this.runs[run.taskId]
      }
    },
    ensureRun(taskId: string, conversationId: string): RunState {
      let run = this.runs[taskId]
      if (!run) {
      run = {
        taskId,
        conversationId,
        status: 'running',
        startedAt: Date.now(),
        reasoning: '',
        text: '',
        trace: [],
        subtitles: [],
      }
        this.runs[taskId] = run
      }
      return run
    },
    conversationOf(taskId: string): string | null {
      return this.runs[taskId]?.conversationId ?? null
    },
    onTaskUpdated(data: { task_id: string; status: string; progress?: number }) {
      const run = this.ensureRun(data.task_id, this.conversationOf(data.task_id) ?? '')
      this.markRunActive(data.task_id)
      if (run.status === 'cancelled') return
      run.status = data.status
      if (['completed', 'failed', 'cancelled'].includes(data.status) && !run.finishedAt) {
        run.finishedAt = Date.now()
        run.elapsedMs = run.finishedAt - run.startedAt
      }
    },
    onToken(data: TokenData) {
      const run = this.ensureRun(data.task_id, this.conversationOf(data.task_id) ?? '')
      this.markRunActive(data.task_id)
      if (run.status === 'cancelled') return
      if (!run.conversationId) return
      const buffered = tokenBuffers.get(data.task_id)
      if (buffered === undefined) {
        // 首个 token 即时生效，保证首字立刻可见
        run.text += data.token
        tokenBuffers.set(data.task_id, '')
        flushTimers.set(
          data.task_id,
          setTimeout(() => this.flushRun(data.task_id), 100),
        )
      } else {
        tokenBuffers.set(data.task_id, buffered + data.token)
      }
    },
    onReasoning(data: ReasoningData) {
      const run = this.ensureRun(data.task_id, this.conversationOf(data.task_id) ?? '')
      this.markRunActive(data.task_id)
      if (run.status === 'cancelled') return
      run.reasoning += data.reasoning
      run.trace.push({ kind: 'reasoning', text: data.reasoning, at: Date.now() })
    },
    onToolCall(data: ToolCallData) {
      const run = this.ensureRun(data.task_id, this.conversationOf(data.task_id) ?? '')
      this.markRunActive(data.task_id)
      if (run.status === 'cancelled') return
      run.trace.push({
        kind: 'tool.call',
        callId: data.call_id,
        toolName: data.tool_name,
        argsPreview: data.args_preview,
        at: Date.now(),
      })
      if (!run.conversationId) return
      const msg = makeMessage(run.conversationId, 'tool_call', '', {
        taskId: data.task_id,
        callId: data.call_id,
        toolName: data.tool_name,
        argsPreview: data.args_preview,
      })
      this.callToMessage[`${data.task_id}:${data.call_id}`] = msg.id
      void this.push(run.conversationId, msg)
    },
    onToolResult(data: ToolResultData) {
      this.markRunActive(data.task_id)
      if (this.runs[data.task_id]?.status === 'cancelled') return
      const conversationId = this.conversationOf(data.task_id)
      const messageId = this.callToMessage[`${data.task_id}:${data.call_id}`]
      if (conversationId && messageId) {
        const msg = this.byConversation[conversationId]?.find((item) => item.id === messageId)
        if (msg) {
          msg.meta = { ...msg.meta, success: data.success, preview: data.preview }
          msg.text = data.preview
          void db.messages.put(cloneForDb(msg))
          const filePath = parsePathFromArgs(msg.meta?.argsPreview)
          if (filePath && /^(fs\.|code\.)/.test(msg.meta?.toolName ?? '')) {
            useWorkingTreeStore().noteChange(filePath)
          }
        }
        delete this.callToMessage[`${data.task_id}:${data.call_id}`]
      }
      const run = this.runs[data.task_id]
      if (run) {
        run.trace.push({
          kind: 'tool.result',
          callId: data.call_id,
          success: data.success,
          preview: data.preview,
          at: Date.now(),
        })
        // 批0 人话字幕：工具结果落定后翻译成一句话（失败也翻，方便小白看懂）
        if (run.subtitles) {
          const toolName = run.trace.find(
            (item) => item.kind === 'tool.call' && item.callId === data.call_id,
          )?.toolName ?? 'tool'
          run.subtitles.push({
            toolName,
            text: subtitleForTool(toolName, data.success, data.preview),
            at: Date.now(),
          })
        }
      }
    },
    onApprovalRequired(data: ApprovalRequiredData) {
      const run = this.ensureRun(data.task_id, this.conversationOf(data.task_id) ?? '')
      this.markRunActive(data.task_id)
      if (run.status === 'cancelled') return
      if (!run.conversationId) return
      const msg = makeMessage(run.conversationId, 'approval', '', {
        taskId: data.task_id,
        requestId: data.request_id,
        toolName: data.tool_name,
        argsPreview: data.args_preview,
        action: data.tool_name,
        // P2 修复（2026-08-22）：daemon 协议帧零扩（裁985②），approval.required
        // 不带 risk；此处默认 medium 占位，真实档位由 approval store 的
        // refreshRisk（permission.pending RPC）异步回填后覆盖。
        risk: 'medium',
        details: data.args_preview,
      })
      this.requestToMessage[data.request_id] = msg.id
      this.requestToConversation[data.request_id] = run.conversationId
      void this.push(run.conversationId, msg)
    },
    updateRisk(requestId: string, risk: string) {
      const messageId = this.requestToMessage[requestId]
      if (!messageId) return
      const conversationId = this.requestToConversation[requestId]
      const list = conversationId ? this.byConversation[conversationId] : undefined
      const msg = list?.find((item) => item.id === messageId)
      if (msg?.meta) {
        msg.meta = { ...msg.meta, risk }
        void db.messages.put(cloneForDb(msg))
      }
    },
    onApprovalResolved(data: { request_id: string; approved: boolean }) {
      const messageId = this.requestToMessage[data.request_id]
      if (messageId) {
        // P3 顺手修：按 requestToConversation 直接定位，避免线性扫描全部会话
        const conversationId = this.requestToConversation[data.request_id]
        const list = conversationId ? this.byConversation[conversationId] : undefined
        const msg = list?.find((item) => item.id === messageId)
        if (msg) {
          msg.meta = { ...msg.meta, approved: data.approved }
          msg.text = data.approved ? '已批准' : '已拒绝'
          void db.messages.put(cloneForDb(msg))
        }
        delete this.requestToMessage[data.request_id]
        delete this.requestToConversation[data.request_id]
      }
    },
    onDone(data: DoneData) {
      this.markRunActive(data.task_id)
      const run = this.runs[data.task_id]
      if (!run || run.status === 'cancelled') return
      this.flushRun(data.task_id)
      run.status = 'completed'
      run.finishedAt = Date.now()
      run.elapsedMs = run.finishedAt - run.startedAt
      // 批0 成本小字：done 帧的真实 usage → 记账
      if (data.usage) {
        run.usage = {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          costUsd: estimateCostUsd(data.usage),
        }
      }
      if (!run.conversationId) return
      const msg = this.byConversation[run.conversationId]?.find(
        (item) => item.meta?.taskId === data.task_id && item.kind === 'assistant',
      )
      if (msg) {
        msg.text = run.text
        msg.meta = {
          ...msg.meta,
          elapsedMs: run.elapsedMs,
          streaming: false,
          status: 'completed',
        }
        const timer = persistTimers.get(msg.id)
        if (timer) clearTimeout(timer)
        persistTimers.delete(msg.id)
        void db.messages.put(cloneForDb(msg))
      } else {
        void this.push(
          run.conversationId,
          makeMessage(run.conversationId, 'assistant', run.text, {
            taskId: data.task_id,
            elapsedMs: run.elapsedMs,
          }),
        )
      }
      this.trimRuns()
    },
    onError(data: ErrorData) {
      this.flushRun(data.task_id)
      this.markRunActive(data.task_id)
      const run = this.runs[data.task_id]
      if (run) {
        run.status = 'failed'
        run.finishedAt = Date.now()
        run.elapsedMs = run.finishedAt - run.startedAt
      }
      const conversationId = this.conversationOf(data.task_id)
      if (conversationId) {
        // 批0 循环提示：消息本身已带提示（如 demo/上游）则不重复追加
        const hint =
          data.message.includes('建议别再硬修')
            ? null
            : loopHintForError(conversationId, data.message)
        const text = hint ? `${data.message}\n\n💡 ${hint}` : data.message
        void this.push(
          conversationId,
          makeMessage(conversationId, 'status', text, {
            status: 'error',
            statusKey: 'taskError',
            errorKey: 'unknown',
            taskId: data.task_id,
          }),
        )
      }
      this.trimRuns()
    },
    onNotify(data: DaemonNotifyData) {
      console.info('[baiz] daemon.notify', data.level, data.message)
      useUiStore().toast(data.message, data.level === 'error' ? 'error' : 'info')
    },
    onRawMessage(data: { kind: string; payload: unknown; timestamp: string }) {
      console.debug('[baiz] message event', data.kind, data.timestamp)
    },
  },
})
