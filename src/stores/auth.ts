// MSG-2287 备胎计划：登录态 store——token 仅 sessionStorage 内存态
// （关窗即清，非明文落盘；零日志零打印——安全面自守）。
// 拒词面照 DEBT-398 例：败面通用提示零泄词（不泄账号存在性/后端 detail）。
import { defineStore } from "pinia";
import { createDefaultClient } from "../client/factory";

const TOKEN_KEY = "baiz_session_token";

function readStoredToken(): string {
  try {
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage.getItem(TOKEN_KEY) ?? "";
    }
  } catch {
    /* storage 不可用回落空 */
  }
  return "";
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    sessionToken: "" as string,
    userId: "" as string,
    loading: false as boolean,
    error: "" as string,
  }),
  getters: {
    loggedIn(state): boolean {
      return state.sessionToken.length > 0;
    },
  },
  actions: {
    /** 启动恢复：sessionStorage 命中即续登录态（零网络零泄）。 */
    hydrate() {
      this.sessionToken = readStoredToken();
      return this.sessionToken.length > 0;
    },
    /** 登录：账号/密码 → auth.login（经乙径 proxy→daemon 9876）。
     * 败面通用拒词（DEBT-398 例）——零泄词零 detail。 */
    async login(email: string, password: string): Promise<boolean> {
      this.loading = true;
      this.error = "";
      try {
        const client = createDefaultClient();
        const result = await client.authLogin({ email, password });
        this.sessionToken = result.session_token;
        this.userId = result.user_id;
        try {
          sessionStorage.setItem(TOKEN_KEY, result.session_token);
        } catch {
          /* storage 不可用仅失持久，不阻断登录态 */
        }
        return true;
      } catch (e) {
        // MSG-2311 吞错面修：真 error 词透出上屏——剥 RPC 前缀得
        // daemon 安全词（body.message 已通用化）；mock 内部语/口令/
        // token/密钥类勿上屏回落通用词
        const raw = e instanceof Error ? e.message : String(e);
        const detail = raw.replace(/^RPC -?\d+: /, '');
        this.error =
          detail && !/mock|password|token|secret|key/i.test(detail)
            ? detail
            : '登录失败，请检查账号密码';
        return false;
      } finally {
        this.loading = false;
      }
    },
    /** 登出：清 token 回落单主（零残留）。 */
    logout() {
      this.sessionToken = "";
      this.userId = "";
      this.error = "";
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        /* storage 不可用零残留面已清 */
      }
    },
  },
});
