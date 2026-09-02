// MSG-2358 红证②：localStorage 旧值迁移闸——枚举外值回落默认 v4-pro
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '../src/stores/settings';

describe('settings model 枚举换正与旧值迁移', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('预置旧值 qwen → 读得默认 deepseek-v4-pro（回落）', () => {
    localStorage.setItem('baiz.model', 'qwen');
    const settings = useSettingsStore();
    expect(settings.model).toBe('deepseek-v4-pro');
  });

  it('预置旧值 deepseek → 读得默认 deepseek-v4-pro（回落）', () => {
    localStorage.setItem('baiz.model', 'deepseek');
    const settings = useSettingsStore();
    expect(settings.model).toBe('deepseek-v4-pro');
  });

  it('预置任意串（枚举外）→ 回落默认 v4-pro', () => {
    localStorage.setItem('baiz.model', 'vision-exp');
    const settings = useSettingsStore();
    expect(settings.model).toBe('deepseek-v4-pro');
  });

  it('预置新值 deepseek-v4-flash → 保留不误伤', () => {
    localStorage.setItem('baiz.model', 'deepseek-v4-flash');
    const settings = useSettingsStore();
    expect(settings.model).toBe('deepseek-v4-flash');
  });

  it('无存量 → 默认 deepseek-v4-pro（缺省态）', () => {
    const settings = useSettingsStore();
    expect(settings.model).toBe('deepseek-v4-pro');
  });

  it('setModel 收窄枚举：设 flash 落 localStorage 可复读', () => {
    const settings = useSettingsStore();
    settings.setModel('deepseek-v4-flash');
    expect(localStorage.getItem('baiz.model')).toBe('deepseek-v4-flash');
    setActivePinia(createPinia());
    expect(useSettingsStore().model).toBe('deepseek-v4-flash');
  });
});
