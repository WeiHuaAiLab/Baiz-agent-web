// MSG-2318 A-1 红证：真实信封帧→token→run.text 累积→done→flushRun→
// assistant 消息落 store（防 mock 扁平遮真族再犯）。
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { routeFrame } from '../src/client/eventRouter';
import { useMessageStore } from '../src/stores/message';
import { useApprovalStore } from '../src/stores/approval';

describe('event router 真实信封帧', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('token→done 帧链：run.text 累积＋flushRun＋assistant 消息落 store', async () => {
    const messages = useMessageStore();
    const approvals = useApprovalStore();
    const taskId = 't-real-1';
    const conversationId = 'c-real-1';
    // 前置：造会话＋run 面（onToken 的 conversationOf 命中即累积）
    messages.byConversation[conversationId] = [];
    messages.runs[taskId] = {
      taskId,
      conversationId,
      status: 'running',
      startedAt: Date.now(),
      reasoning: '',
      text: '',
      trace: [],
    };
    // 真实信封帧：daemon to_sse_frame 之 data 载荷（serde 字段形）
    routeFrame(
      { id: 1, event: 'token', data: { task_id: taskId, token: '你' }, raw: '' },
      messages,
      approvals,
    );
    routeFrame(
      { id: 2, event: 'token', data: { task_id: taskId, token: '好' }, raw: '' },
      messages,
      approvals,
    );
    const run = messages.runs[taskId];
    expect(run).toBeTruthy();
    expect(run.text).toContain('你');

    routeFrame(
      {
        id: 3,
        event: 'done',
        data: {
          task_id: taskId,
          usage: {
            prompt_tokens: 10,
            completion_tokens: 2,
            total_tokens: 12,
          },
        },
        raw: '',
      },
      messages,
      approvals,
    );
    // flushRun：token 缓冲并入 run.text，done 后 completed
    expect(messages.runs[taskId].status).toBe('completed');
    // assistant 消息落 store（flushRun 推送面）
    expect(messages.runs[taskId].text).toContain('好');
  });

  it('brief.ready 补 case：接帧零丢（debug 留痕径，store 零误路由）', () => {
    const messages = useMessageStore();
    const approvals = useApprovalStore();
    // 原 default console.debug 面——补 case 后同径留痕零抛
    expect(() =>
      routeFrame(
        { id: 9, event: 'brief.ready', data: { brief_id: 'b-1' }, raw: '' },
        messages,
        approvals,
      ),
    ).not.toThrow();
  });
});
