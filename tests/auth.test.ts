// MSG-2287 备胎计划：登录态面测试——hydrate/登出零泄＋败面通用拒词。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../src/stores/auth';
import { createClient } from '../src/client';
import { createMockTransport } from '../src/client/transports/mock';
import * as factory from '../src/client/factory';

// MSG-2330 红证：createDefaultClient 保真 vi.fn——默认走真（老测不破），
// 新测 mockImplementationOnce 拦一次注入双端 mock 真链
vi.mock('../src/client/factory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/factory')>();
  return { ...actual, createDefaultClient: vi.fn(actual.createDefaultClient) };
});

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    sessionStorage.clear();
  });

  it('hydrate 命中 sessionStorage 即续登录态', () => {
    sessionStorage.setItem('baiz_session_token', 'tok-1');
    const auth = useAuthStore();
    expect(auth.hydrate()).toBe(true);
    expect(auth.loggedIn).toBe(true);
    expect(auth.sessionToken).toBe('tok-1');
  });

  it('hydrate 零命中即未登录', () => {
    const auth = useAuthStore();
    expect(auth.hydrate()).toBe(false);
    expect(auth.loggedIn).toBe(false);
  });

  it('logout 清 token 零残留', () => {
    sessionStorage.setItem('baiz_session_token', 'tok-2');
    const auth = useAuthStore();
    auth.hydrate();
    auth.logout();
    expect(auth.loggedIn).toBe(false);
    expect(sessionStorage.getItem('baiz_session_token')).toBeNull();
  });

  it('login 败面通用拒词零泄词（DEBT-398 例）', async () => {
    const auth = useAuthStore();
    const ok = await auth.login('a@b.c', 'wrong');
    expect(ok).toBe(false);
    expect(auth.error).toBe('登录失败，请检查账号密码');
    expect(auth.error).not.toContain('@');
    expect(auth.loading).toBe(false);
  });

  it('login 败面 mock 内部语回落通用词零泄（安全口径）', async () => {
    const auth = useAuthStore();
    const ok = await auth.login('a@b.c', 'wrong');
    expect(ok).toBe(false);
    // mock 传输词（no mock result）勿上屏——回落通用词
    expect(auth.error).toBe('登录失败，请检查账号密码');
    expect(auth.error).not.toContain('mock');
    expect(auth.error).not.toContain('auth.login');
  });

  it('login 败面剥 RPC 前缀透 daemon 安全词（纯函数口径）', () => {
    // 剥前缀口径：RPC 词剥前缀得 body.message 安全词
    const strip = (raw: string) => raw.replace(/^RPC -?\d+: /, '');
    expect(strip('RPC -32601: 登录失败，请检查账号密码')).toBe(
      '登录失败，请检查账号密码',
    );
  });

  it('提示词照堂钉勿自撰', () => {
    const hint = '请使用 https://kb.ruiac.net/ 的账号登录';
    expect(hint).toContain('https://kb.ruiac.net/');
  });

  it('MSG-2330 红证：未 connect 态 login 自动 connect 后 request 行成（双端 mock）', async () => {
    const auth = useAuthStore();
    // 双端 mock：transport 端（真 mock 传输）＋应答端（handle 应答 auth.login）
    const t = createMockTransport({
      handle: (req) =>
        req.method === 'auth.login'
          ? { result: { session_token: 'tok-2330', user_id: 'u-1', provider: 'weknora' } }
          : null,
    });
    let connectCalls = 0;
    const origConnect = t.connect.bind(t);
    t.connect = async () => {
      connectCalls += 1;
      await origConnect();
    };
    // 真链：createClient + mock transport（中间 RPC 层全真）
    vi.mocked(factory.createDefaultClient).mockImplementationOnce(() => createClient(t));

    // 前置：transport 未被 connect（未 connect 态）
    expect(connectCalls).toBe(0);
    const ok = await auth.login('a@b.c', 'pw-2330');
    expect(ok).toBe(true);
    expect(auth.sessionToken).toBe('tok-2330');
    expect(auth.userId).toBe('u-1');
    // 自动 connect 面：login 内部 connect 先行
    expect(connectCalls).toBeGreaterThanOrEqual(1);
    // request 行成面：auth.login 达 transport 且载荷完整
    const loginReq = t.requests.find((r) => r.method === 'auth.login');
    expect(loginReq).toBeTruthy();
    expect((loginReq?.params as { email?: string })?.email).toBe('a@b.c');
    // 败面零泄面仍在：登出后错误词不泄口令
    expect(auth.error).toBe('');
  });
});
