// MSG-2604 红证包：流接收径状态机穷举（(a) ①a 取消互斥族／(b) ②a 空
// reasoning 心跳帧互斥／flush 缓冲/弃帧基线面）——帧注入直打 routeFrame，
// 断言接收径零吞帧零滞留（UI 卡态铁之码面侧证——丢帧若在逻辑层应红于此）。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { routeFrame } from '../src/client/eventRouter';
import { useMessageStore } from '../src/stores/message';
import { useApprovalStore } from '../src/stores/approval';

function seedRun(messages: ReturnType<typeof useMessageStore>, taskId: string, cid: string) {
  messages.byConversation[cid] = [];
  messages.runs[taskId] = {
    taskId,
    conversationId: cid,
    status: 'running',
    startedAt: Date.now(),
    reasoning: '',
    text: '',
    trace: [],
  };
}

const tok = (id: number, taskId: string, token: string) => ({
  id,
  event: 'token',
  data: { task_id: taskId, token },
  raw: '',
});
const rsn = (id: number, taskId: string, reasoning: string) => ({
  id,
  event: 'reasoning',
  data: { task_id: taskId, reasoning },
  raw: '',
});
const done = (id: number, taskId: string) => ({
  id,
  event: 'done',
  data: { task_id: taskId, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
  raw: '',
});
const errF = (id: number, taskId: string, message: string) => ({
  id,
  event: 'error',
  data: { task_id: taskId, message },
  raw: '',
});

describe('MSG-2604 面(a) ①a 取消互斥族', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('①a cancelled 早返勿吞他帧型：取消后 token/done 帧不覆态不崩，文本零误增', () => {
    const messages = useMessageStore();
    const approvals = useApprovalStore();
    const taskId = 't-c1';
    const cid = 'c-c1';
    seedRun(messages, taskId, cid);
    messages.runs[taskId].status = 'cancelled'; // 模拟 stopRun 后态
    // 取消后 daemon 自然收束 error 帧（request cancelled）→ ①a 早返零覆写
    routeFrame(errF(2, taskId, 'request cancelled by user'), messages, approvals);
    expect(messages.runs[taskId].status).toBe('cancelled');
    expect(
      messages.byConversation[cid].some((m) => m.kind === 'status' && m.meta?.status === 'error'),
    ).toBe(false);
    // 迟到 token 帧 → cancelled 守卫吞（勿误增）
    const before = messages.runs[taskId].text.length;
    routeFrame(tok(3, taskId, '迟到'), messages, approvals);
    expect(messages.runs[taskId].text.length).toBe(before);
    // 迟到 done → cancelled 守卫不覆 completed
    routeFrame(done(4, taskId), messages, approvals);
    expect(messages.runs[taskId].status).toBe('cancelled');
  });

  it('取消互斥跨任务隔离：A 取消中 B 帧流零波及（cancelled 守卫按 run 键）', () => {
    const messages = useMessageStore();
    const approvals = useApprovalStore();
    const a = 't-a';
    const b = 't-b';
    seedRun(messages, a, 'c-a');
    seedRun(messages, b, 'c-b');
    messages.runs[a].status = 'cancelled';
    routeFrame(tok(1, b, 'B1'), messages, approvals);
    routeFrame(tok(2, b, 'B2'), messages, approvals);
    routeFrame(rsn(3, b, '想'), messages, approvals);
    routeFrame(done(4, b), messages, approvals);
    expect(messages.runs[b].status).toBe('completed');
    expect(messages.runs[b].text).toContain('B1');
    expect(messages.runs[b].text).toContain('B2');
    expect(messages.runs[b].reasoning).toContain('想');
    expect(messages.runs[a].status).toBe('cancelled');
  });

  it('帧面 cancelled 兜底（run 未置）：中性（已停止）落 assistant 尾——勿红条', () => {
    const messages = useMessageStore();
    const approvals = useApprovalStore();
    const taskId = 't-c3';
    const cid = 'c-c3';
    seedRun(messages, taskId, cid);
    routeFrame(tok(1, taskId, '正文'), messages, approvals);
    messages.flushRun(taskId);
    routeFrame(errF(2, taskId, 'Request cancelled'), messages, approvals);
    const assistant = messages.byConversation[cid].find((m) => m.kind === 'assistant');
    expect(messages.runs[taskId].status).toBe('cancelled');
    expect(assistant?.text).toContain('（已停止）');
    expect(
      messages.byConversation[cid].some((m) => m.kind === 'status' && m.meta?.status === 'error'),
    ).toBe(false);
  });
});

describe('MSG-2604 面(b) ②a 空 reasoning 心跳帧互斥', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('空 reasoning 保活帧交错：文本累积/思考累积/done 落定零吞零滞留', () => {
    const messages = useMessageStore();
    const approvals = useApprovalStore();
    const taskId = 't-hb';
    const cid = 'c-hb';
    seedRun(messages, taskId, cid);
    routeFrame(rsn(1, taskId, '真实思考片段'), messages, approvals);
    routeFrame(tok(2, taskId, '首'), messages, approvals);
    routeFrame(tok(3, taskId, '段'), messages, approvals);
    // ②a 空 reasoning 心跳帧 ×3（idle 空窗填充——60s 档 3 跳）
    routeFrame(rsn(4, taskId, ''), messages, approvals);
    routeFrame(rsn(5, taskId, ''), messages, approvals);
    routeFrame(rsn(6, taskId, ''), messages, approvals);
    routeFrame(tok(7, taskId, '续'), messages, approvals);
    routeFrame(tok(8, taskId, '出'), messages, approvals);
    const run = messages.runs[taskId];
    // 首 token 即时显（首字立刻可见语义），余帧入 100ms 缓冲——done flush 前
    expect(run.text).toContain('首');
    expect(run.reasoning).toBe('真实思考片段'); // 空帧零污染（+= '' 无害）
    routeFrame(done(9, taskId), messages, approvals);
    expect(run.status).toBe('completed');
    // done 时 flushRun：缓冲（段/续出）并入 run.text 与 assistant 落定
    expect(run.text).toContain('段');
    expect(run.text).toContain('续出');
    const assistant = messages.byConversation[cid].find((m) => m.kind === 'assistant');
    expect(assistant?.text).toContain('段');
    expect(assistant?.text).toContain('续出');
  });

  it('心跳帧无 id（SSE ping 透传形）不触发弃帧基线误判：id 缺省帧直达路由', () => {
    const messages = useMessageStore();
    const approvals = useApprovalStore();
    const taskId = 't-ping';
    seedRun(messages, taskId, 'c-ping');
    // 壳透传心跳形：{id: undefined, event: 'heartbeat'}——onFrame 层经
    // armWatchdog 复位后路由：heartbeat 无 case → debug 留痕零抛零吞
    expect(() =>
      routeFrame({ id: undefined, event: 'heartbeat', data: {}, raw: '' }, messages, approvals),
    ).not.toThrow();
    // 其后真实 token 帧不受影响
    routeFrame(tok(10, taskId, '活'), messages, approvals);
    expect(messages.runs[taskId].text).toContain('活');
  });
});

describe('MSG-2604 flush 缓冲面', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('token 洪峰 flush 竞态：done 前缓冲帧随 flushRun 全入文本零丢', () => {
    const messages = useMessageStore();
    const approvals = useApprovalStore();
    const taskId = 't-flush';
    seedRun(messages, taskId, 'c-flush');
    // 洪峰：首 token 即时入 text，余帧入 100ms 缓冲（同步流——定时器未触发）
    routeFrame(tok(11, taskId, '一'), messages, approvals);
    routeFrame(tok(12, taskId, '二'), messages, approvals);
    routeFrame(tok(13, taskId, '三'), messages, approvals);
    // done 即时 flushRun：缓冲并入 run.text（勿等 100ms 定时器）
    routeFrame(done(14, taskId), messages, approvals);
    expect(messages.runs[taskId].status).toBe('completed');
    expect(messages.runs[taskId].text).toContain('一');
    expect(messages.runs[taskId].text).toContain('二三');
    const assistant = messages.byConversation['c-flush'].find((m) => m.kind === 'assistant');
    expect(assistant?.text).toContain('二三');
  });
});
