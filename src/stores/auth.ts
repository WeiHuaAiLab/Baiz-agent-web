// MSG-2287 备胎计划：登录态 store——token 仅 sessionStorage 内存态
// （关窗即清，非明文落盘；零日志零打印——安全面自守）。
// 拒词面照 DEBT-398 例：败面通用提示零泄词（不泄账号存在性/后端 detail）。
//
// MSG-3509 P1/P2：**持久登录 ＋ 显式退出**
//   · 持久化**在壳侧**：壳把"可撤销的登录令牌"存进**系统凭据库**
//     （`identity_store`／Windows 凭据管理器）——前端**零令牌**（拿不到也存不下）；
//   · 启动 `hydrateAsync()` 问壳一次 `identity_status`（只回 loggedIn/userId）
//     ⇒ 命中即直接进主界面（**自动更新/重启后仍登录**）；
//   · `logout()`：先清本地会话态，再让壳**清凭据库条目＋清壳内存**
//     （清后必须重登，**不得自动复登**）。
import { defineStore } from "pinia";
import { createDefaultClient } from "../client/factory";
import { getBridge } from "../bridge";
import { clearStoredAccount, readStoredAccount, setDbAccount, storeAccount } from "../db";

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
    /** MSG-3509 P1：壳侧**持久身份**命中（本会话无 token 亦视为已登录）。 */
    persisted: false as boolean,
  }),
  getters: {
    loggedIn(state): boolean {
      return state.sessionToken.length > 0 || state.persisted;
    },
  },
  actions: {
    /** 启动恢复：sessionStorage 命中即续登录态（零网络零泄）。
     * MSG-3485：同时把**账号键**（非凭据）恢复进库面——token 在而账号键缺（升级首启 /
     * storage 被清）⇒ 账号**未知**，落 `baiz-anon`（**不猜**：宁空勿串档）。 */
    hydrate() {
      this.sessionToken = readStoredToken();
      this.userId = this.sessionToken.length > 0 ? readStoredAccount() : "";
      setDbAccount(this.sessionToken.length > 0 ? this.userId : "");
      return this.sessionToken.length > 0;
    },
    /** **MSG-3509 P1③④**：启动恢复（持久面）——问壳"有没有持久身份"。
     *  壳侧令牌只进系统凭据库，**本函数拿不到令牌值**；桥未通/未命中 ⇒
     *  诚实未登录（壳侧 fail-closed，不造假）。 */
    async hydrateAsync(): Promise<boolean> {
      if (!this.sessionToken) this.hydrate();
      if (this.loggedIn) return true;
      try {
        const st = await getBridge().identity.status();
        if (st && st.loggedIn) {
          this.persisted = true;
          this.userId = st.userId ?? "";
          // MSG-3517③：持久径**亦须切库面**（T12 分段库）——否则自动更新/重启恢复
          // 后落 `baiz-anon`，该账号既有会话/消息读不到（＝"东西没了"同类）。
          setDbAccount(this.userId);
          storeAccount(this.userId);
          return true;
        }
      } catch {
        /* 桥未通（旧壳／纯 web）⇒ 未登录 */
      }
      return false;
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
        this.persisted = false;
        // MSG-3485：库面切到本账号（分段库）＋账号键落地（重载续用），
        // 并清掉上一账号的内存残留后按本账号重载列表。
        setDbAccount(this.userId);
        storeAccount(this.userId);
        await this.reloadAccountScoped(this.userId);
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
    /** 登出：清 token 回落单主（零残留）。
     *  **MSG-3509 P2**：并让壳**清系统凭据库条目＋清壳内存**（清后必须重登）。 */
    async logout() {
      this.sessionToken = "";
      this.userId = "";
      // MSG-3485：库面回落 anon ＋ 账号键清；内存面同步清（不留上一账号列表）
      setDbAccount("");
      clearStoredAccount();
      void this.reloadAccountScoped("");
      this.error = "";
      this.sessionExpired = false;
      this.kbNotConfigured = false;
      this.persisted = false;
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        /* storage 不可用零残留面已清 */
      }
      try {
        await getBridge().identity.logout();
      } catch {
        /* 桥未通：本地已清 ⇒ 等价"未登录"（无自动复登面） */
      }
    },
    /**
     * MSG-3485（T12）：账号切换后的**内存面归位**——库已按账号分段，此处只负责把
     * 上一账号留在内存里的会话列表/活动会话清掉；`account` 非空则按本账号重载
     * （空列表即建一条，与启动口径一致）。任何失败只记 warn——**不得**连带把登录判成败。
     */
    async reloadAccountScoped(account: string): Promise<void> {
      try {
        const { useSessionStore } = await import("./session");
        const session = useSessionStore();
        session.conversations = [];
        session.activeId = "";
        if (account.length === 0) return;
        await session.load();
        if (!session.activeId) await session.create();
      } catch (error) {
        console.warn("[baiz] 账号切换后重载会话列表失败（库面已按账号分段，未串档）：", error);
      }
    },
    /**
     * DEBT-742 自愈：daemon 判会话失效（-32002）⇒ **立即清失效 token**（含
     * sessionStorage）＋置 `sessionExpired`——断「失效 token 一直揣着、每次发消息
     * 都同样失败」的循环；由调用方引导重登（路由跳登录页）。
     */
    expireSession() {
      void this.logout();
      this.sessionExpired = true;
    },
  },
});
