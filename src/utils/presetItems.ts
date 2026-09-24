// **MSG-3575 · 预设项 UI**：预置项**默认不出现**＋**清理入口**（照令 §一 预设项 UI）。
//
// 硬口径（红线）：**预置项只软隐藏**——本件只做"分拣/过滤"，**不删任何数据**；
// 真要删须**用户点**「清理预置项」并**二次确认**（由视图负责），删走的也是
// daemon **既有**方法（`schedule.delete`），不新增任何删除通道。

/** 预置项 id 前缀（daemon 侧 `scheduled.db` 首启播种项；与壳/daemon 口径一致） */
export const PRESET_ID_PREFIX = 'preset-'

/** 是否预置项（id 前缀判据；大小写与首尾空白归一） */
export function isPresetId(id: string | undefined | null): boolean {
  return String(id ?? '')
    .trim()
    .toLowerCase()
    .startsWith(PRESET_ID_PREFIX)
}

/** 分拣：`visible`＝默认上屏项；`presets`＝软隐藏的预置项（供"清理"入口使用） */
export function splitPresetItems<T extends { id: string }>(
  items: readonly T[],
): { visible: T[]; presets: T[] } {
  const visible: T[] = []
  const presets: T[] = []
  for (const item of items) {
    if (isPresetId(item?.id)) presets.push(item)
    else visible.push(item)
  }
  return { visible, presets }
}
