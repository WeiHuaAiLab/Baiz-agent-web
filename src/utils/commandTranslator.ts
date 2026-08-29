// 批0 命令翻译器：把小白看不懂的命令翻译成一句话人话。
// 覆盖面：常用 CLI 命令（git/cargo/npm/pnpm/rustc 等）+ Baiz 工具调用。

/** CLI 命令前缀 → 人话解释 */
const CLI_RULES: Array<{ pattern: RegExp; text: string }> = [
  { pattern: /^cargo\s+test/i, text: '跑一遍测试——看看你的改动有没有弄坏任何东西。' },
  { pattern: /^cargo\s+build/i, text: '编译项目——把代码变成能运行的程序。' },
  { pattern: /^cargo\s+check/i, text: '快速检查代码有没有写错，不生成程序文件。' },
  { pattern: /^cargo\s+run/i, text: '编译并运行这个程序，看看跑起来什么样。' },
  { pattern: /^cargo\s+add/i, text: '给项目安装一个新依赖包。' },
  { pattern: /^cargo\s+fmt/i, text: '自动整理代码格式——让代码排版整齐统一。' },
  { pattern: /^cargo\s+clippy/i, text: '代码体检——找出潜在问题和不良写法。' },
  { pattern: /^cargo\s+doc/i, text: '生成项目文档。' },
  { pattern: /^git\s+status/i, text: '看看当前改动了哪些文件。' },
  { pattern: /^git\s+add/i, text: '把改动放进待提交清单。' },
  { pattern: /^git\s+commit/i, text: '把改动保存成一个版本记录。' },
  { pattern: /^git\s+push/i, text: '把本地版本上传到远程仓库（如 GitHub）。' },
  { pattern: /^git\s+pull/i, text: '把远程仓库的最新版本拉到本地。' },
  { pattern: /^git\s+clone/i, text: '把远程仓库完整复制到本地。' },
  { pattern: /^git\s+log/i, text: '查看提交历史——谁在什么时候改了什么。' },
  { pattern: /^git\s+diff/i, text: '查看具体改动了哪些行。' },
  { pattern: /^git\s+checkout/i, text: '切换到另一个分支或恢复文件。' },
  { pattern: /^git\s+branch/i, text: '查看/创建/删除分支。' },
  { pattern: /^npm\s+install/i, text: '安装项目依赖的包。' },
  { pattern: /^npm\s+run\s+(dev|serve|start)/i, text: '启动开发服务器，实时预览效果。' },
  { pattern: /^npm\s+run\s+build/i, text: '构建生产版本，准备发布。' },
  { pattern: /^npm\s+test/i, text: '运行测试套件。' },
  { pattern: /^pnpm\s+install/i, text: '安装项目依赖的包（pnpm 版）。' },
  { pattern: /^pnpm\s+run/i, text: '运行项目脚本（pnpm 版）。' },
  { pattern: /^python\s+(-m\s+)?(pip|uv)\s+install/i, text: '安装 Python 依赖包。' },
  { pattern: /^python\s+(\S+\s+)*\S+\.py/i, text: '运行这个 Python 脚本。' },
  { pattern: /^rustc\s+/i, text: '编译单个 Rust 源文件。' },
  { pattern: /^rustup\s+update/i, text: '更新 Rust 工具链到最新版本。' },
  { pattern: /^ls(\s|$)/i, text: '列出当前目录下的文件和文件夹。' },
  { pattern: /^cd\s+/i, text: '进入某个目录。' },
  { pattern: /^pwd(\s|$)/i, text: '显示当前所在目录的完整路径。' },
  { pattern: /^mkdir\s+/i, text: '新建一个文件夹。' },
  { pattern: /^rm\s+/i, text: '删除文件或文件夹（⚠️ 不可恢复，谨慎）。' },
  { pattern: /^cp\s+/i, text: '复制文件或文件夹。' },
  { pattern: /^mv\s+/i, text: '移动或重命名文件。' },
  { pattern: /^curl\s+/i, text: '向某个网址发送请求——常用于下载或调用接口。' },
  { pattern: /^ping\s+/i, text: '测试网络通不通。' },
  { pattern: /^docker\s+compose\s+up/i, text: '启动一组容器服务（如数据库+后端）。' },
  { pattern: /^docker\s+ps/i, text: '查看正在运行的容器。' },
  { pattern: /^systemctl\s+status/i, text: '查看某个系统服务的运行状态。' },
]

/** 常见命令的"危险度"标记 */
export function commandRiskFlag(cmd: string): string | null {
  if (/^rm\s+-rf/i.test(cmd)) return '⚠️ 危险'
  if (/^git\s+push\s+.*--force/i.test(cmd)) return '⚠️ 危险'
  if (/^docker\s+rm\s+-f/i.test(cmd)) return '⚠️ 危险'
  if (/^rm\s+/i.test(cmd)) return '⚠️ 谨慎'
  return null
}

/** 翻译一条命令行文本；不认识则返回 null */
export function translateCommand(input: string): string | null {
  const cmd = input.trim()
  if (!cmd) return null
  const firstLine = cmd.split('\n')[0]
  for (const rule of CLI_RULES) {
    if (rule.pattern.test(firstLine)) return rule.text
  }
  return null
}

/** Baiz 工具调用 → 人话（与 message.ts 字幕同源风格，独立供工具行使用） */
export function translateTool(toolName: string, success?: boolean): string | null {
  const zh: Record<string, string> = {
    shell_exec: '执行命令',
    cargo_test: '跑测试',
    cargo_build: '编译',
    apply_patch: '改代码',
    grep_files: '搜代码',
    read_file: '读文件',
    list_dir: '看目录',
    web_fetch: '抓网页',
    web_search: '搜索',
    code_edit: '改代码',
    fs_write: '写文件',
    fs_read: '读文件',
    git_commit: '提交代码',
    git_diff: '看改动',
    wechat_read: '读微信',
    classify_customers: '客户分级',
    crm_push: '推给 CRM',
  }
  const name = zh[toolName] ?? toolName
  if (!zh[toolName]) return null
  if (success === false) return `${name}——这次没成，我换个方式继续`
  if (success === true) return `${name}——这步完成了`
  return `${name}——正在做`
}
