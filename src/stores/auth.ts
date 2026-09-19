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
    /** DEBT-742：会话被 daemon 判失效（-32002）后置真——UI 据此提示"请重新登录" */
    sessionExpired: false as boolean,
    /** DEBT-743：daemon 判"知识库未配置"（-32010）——UI 据此引导去设置页填域名＋Key */
    kbNotConfigured: false as boolean,
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
      this.kbNotConfigured = false;
      try {
        const client = createDefaultClient();
        // MSG-2330 丙面根因修（试刀 2327 钉死）：独立 client 未 connect 即
        // request——tauri transport !real 即抛「transport not connected」，
        // invoke 前即败（零 daemon 触达）；login 前先 connect 建 real＋
        // listen（mock/http 径幂等；RPC 九点既通面零触）
        await client.connect();
        const result = await client.authLogin({ email, password });
        this.sessionToken = result.session_token;
        this.userId = result.user_id;
        try {
          sessionStorage.setItem(TOKEN_KEY, result.session_token);
        } catch {
          /* storage 不可用仅失持久，不阻断登录态 */
        }
        this.sessionExpired = false;
        this.kbNotConfigured = false;
        return true;
      } catch (e) {
        // DEBT-743：知识库未配置（-32010）⇒ 引导去「设置 → 连接知识库」，
        // **不得**误报"账号密码错"（干净机器首登正是这一型）
        if ((e as { code?: number } | undefined)?.code === -32010) {
          this.kbNotConfigured = true;
          return false;
        }
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
      this.sessionExpired = false;
      this.kbNotConfigured = false;
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        /* storage 不可用零残留面已清 */
      }
    },
    /**
     * DEBT-742 自愈：daemon 判会话失效（-32002）⇒ **立即清失效 token**（含
     * sessionStorage）＋置 `sessionExpired`——断「失效 token 一直揣着、每次发消息
     * 都同样失败」的循环；由调用方引导重登（路由跳登录页）。
     */
    expireSession() {
      this.logout();
      this.sessionExpired = true;
    },
  },
});
