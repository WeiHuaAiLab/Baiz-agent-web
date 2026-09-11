// MSG-3006 web 面 R3 红证：原型链崩——languageForPath('notes.constructor')
// → EXT_LANGUAGE 裸查表命中 Object.prototype.constructor（原生函数）
// → 下游 hljs.getLanguage(函数) 在 try 外 THROW——扩展名与原型键同名即触发。
// 探针组：'notes.constructor'（修前必 THROW）＋ 'x.toString'/'x.hasOwnProperty'
// （toLowerCase 后不命中原型·对照钉——修前修后俱不 THROW）。
import { describe, expect, it } from 'vitest'
import { highlightPreview, languageForPath } from '../src/utils/filePreview'

describe('MSG-3006 R3 原型链守卫', () => {
  it("探针 'notes.constructor'：修前 THROW → 修后诚实降级（纯转义·零抛）", () => {
    // 修前：EXT_LANGUAGE['constructor'] === Object.prototype.constructor（函数）
    //      → hljs.getLanguage(fn) TypeError（try 外）→ THROW
    expect(() => highlightPreview('fn main() {}', 'notes.constructor', 12)).not.toThrow()
    const html = highlightPreview('fn main() {}', 'notes.constructor', 12)
    // 诚实降级：纯转义输出（不含高亮 span）
    expect(html).toContain('fn main() {}')
    expect(html).not.toContain('<span class="hljs')
  })

  it('languageForPath 守卫：原型键同名族俱判 null（勿取原型值）', () => {
    expect(languageForPath('notes.constructor')).toBe(null)
    expect(languageForPath('x.toString')).toBe(null)
    expect(languageForPath('x.hasOwnProperty')).toBe(null)
    expect(languageForPath('x.valueOf')).toBe(null)
    expect(languageForPath('x.__proto__')).toBe(null)
  })

  it('对照钉：toString/hasOwnProperty 探针组修前修后俱不 THROW（正渲或降级）', () => {
    expect(() => highlightPreview('a=1', 'x.toString', 3)).not.toThrow()
    expect(() => highlightPreview('a=1', 'x.hasOwnProperty', 3)).not.toThrow()
    expect(() => highlightPreview('a=1', 'pkg.valueOf', 3)).not.toThrow()
  })

  it('回归钉：正常扩展名仍高亮（rs→rust）', () => {
    const html = highlightPreview('fn main() {}', 'src/main.rs', 12)
    expect(html).toContain('hljs') // rust 语言已注册 → 高亮 span 现形
    expect(languageForPath('src/main.rs')).toBe('rust')
  })
})
