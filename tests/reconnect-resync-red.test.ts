// MSG-2604 红证：resync 自窗头续订（修面二）——consumeBase 旧基线保留、
// 窗头尾帧回放达路由（在飞任务续跑）、stale 帧照弃——卡态循环根治码面证。
import { describe, expect, it } from 'vitest';
import { SseReconnect } from '../src/client/reconnect';
import type { ResyncInfo, RpcTransport } from '../src/client/transport';
import type { SseFrame } from '../src/client/sse';
import type { RpcRequest } from '../src/client/rpc';
import type { EventSubscribeParams } from '../src/client/types';

class FakeTransport implements RpcTransport {
  kind = 'tauri' as const;
  frameHandler: ((f: SseFrame) => void) | null = null;
  disconnectHandler: (() => void) | null = null;
  resyncHandler: ((info: ResyncInfo) => void) | null = null;
  subscribeCalls: EventSubscribeParams[] = [];

  async connect() {}
  async request(_req: RpcRequest) {
    return {};
  }
  abort() {}
  close() {}
  onEvent(h: (f: SseFrame) => void) {
    this.frameHandler = h;
    return () => {};
  }
  onDisconnect(h: () => void) {
    this.disconnectHandler = h;
    return () => {};
  }
  onResync(h: (info: ResyncInfo) => void) {
    this.resyncHandler = h;
    return () => {};
  }
  async subscribe(_taskId: string, _lastEventId?: number) {}
  feed(f: SseFrame) {
    this.frameHandler?.(f);
  }
  fireResync(info: ResyncInfo) {
    this.resyncHandler?.(info);
  }
}

const sleep0 = () => new Promise((r) => setTimeout(r, 0));

describe('MSG-2604 resync 自窗头续订', () => {
  it('resync 后自窗头续订——尾帧达路由续跑、stale 照弃、基准确保', async () => {
    const t = new FakeTransport();
    const dispatched: string[] = [];
    let reconnect: SseReconnect | null = null;
    const options = {
      transport: t,
      taskId: '*',
      subscribe: async (params: EventSubscribeParams) => {
        t.subscribeCalls.push(params);
        return { subscribed: true, latest_seq: 0, oldest_seq: 0 };
      },
      probeLatestSeq: async () => 500,
    };
    reconnect = new SseReconnect(options);
    reconnect.onDispatch((f) => dispatched.push(`${f.event}:${f.id ?? '?'}`));
    await reconnect.start();

    // 首连：probe 500 → 订阅基线 500
    expect(t.subscribeCalls[0].last_event_id).toBe(500);
    const rc = reconnect as unknown as { consumeBase: number };
    expect(rc.consumeBase).toBe(500);

    // 收到 501/502 帧后连接断——期间 daemon 长生成滑窗（ring 出基）
    t.feed({ id: 501, event: 'token', data: { task_id: 't1', token: '前' }, raw: '' });
    t.feed({ id: 502, event: 'token', data: { task_id: 't1', token: '段' }, raw: '' });
    expect(dispatched).toEqual(['token:501', 'token:502']);

    // resync 上达（oldest=1200 已滑过基线 500）
    t.fireResync({ oldest_seq: 1200, latest_seq: 2000 });
    await sleep0();

    // 续订自窗头：last_event_id=oldest-1=1199——勿 jump latest
    const last = t.subscribeCalls[t.subscribeCalls.length - 1];
    expect(last.task_id).toBe('*');
    expect(last.last_event_id).toBe(1199);
    // consumeBase 保留旧基线 500（勿覆写——stale 判定不破）
    expect(rc.consumeBase).toBe(500);

    // 窗头回放：1200..2000（含 done）——id>旧基线 500 → 全达路由
    t.feed({ id: 1190, event: 'token', data: { task_id: 't1', token: '旧' }, raw: '' });
    t.feed({ id: 1200, event: 'token', data: { task_id: 't1', token: '尾' }, raw: '' });
    t.feed({ id: 2000, event: 'done', data: { task_id: 't1', usage: {} }, raw: '' });
    expect(dispatched).toContain('token:1200');
    expect(dispatched).toContain('done:2000');
    // stale（≤旧基线 500）照弃
    t.feed({ id: 400, event: 'token', data: { task_id: 't1', token: '旧帧' }, raw: '' });
    expect(dispatched.some((d) => d === 'token:400')).toBe(false);
    // 未达 1190 也非 stale 属窗头前已出环不可追——此处 1190>500 达路由
    // （实际 daemon 窗头 1200——1190 不会真达；断言仅证弃帧判据=consumeBase）
    expect(dispatched).toContain('token:1190');
  });
});
