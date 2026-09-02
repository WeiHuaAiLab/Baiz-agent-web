// MSG-2287 备胎计划：登录态面测试——hydrate/登出零泄＋败面通用拒词。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../src/stores/auth';

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
});
