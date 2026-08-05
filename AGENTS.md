# Defense2 双 AI 协作公约（Codex + Cursor）

本文件对 Codex 与 Cursor 同样生效。开工前必须通读；与具体玩法/数值冲突时，以 `assets/塔防AI工作流.md` 全文为准。

## 一、权威文档

1. `assets/塔防AI工作流.md` —— 玩法、系统、数值、UI、场景的唯一权威。
2. `.cursor/rules/tower-defense-workflow.mdc` —— 硬约束清单，同样适用于 Codex。
3. `.cursor/rules/prefer-scene-prefab-over-code.mdc` —— 场景/prefab 优先于改代码。
4. `docs/HANDOFF.md` —— 双 AI 交接日志，开工先读、收工必更新。

## 二、硬约束（双方必须遵守）

1. **禁止直接修改 `Main.scene`**（含 MCP 写场景、手改 `.scene` JSON）。场景编排由用户在编辑器完成。AI 只做 `assets/resources/prefabs/**` 与脚本；需要进场时只说明"拖哪个 prefab、绑哪些属性"，不代改 Main。
2. 玩家移动必须用 RigidBody2D（dynamic + `linearVelocity`），禁止 transform 当主移动。
3. 购买 UI 禁止运行时生成：场景预置 + `PurchaseTrigger.uiRoot` / `priceLabel` 绑定；靠近判定用 uiRoot 世界坐标。
4. 累进投币：有多少扣多少 → 飞币 → 价格递减 → 剩余 0 才 `finalizePurchase`。
5. 箭塔购买：付款 → `CMD_BUILD_TOWER`（可多 id）→ 已有 `ArrowTower` 显示 Visual，**不 new Tower**。
6. 解锁顺序（勿颠倒）：建塔 → 只解锁帮手 → 买帮手成功 → 才解锁英雄购买 UI。
7. 跨系统只用 EventBus；数值写 `GameConstants`；可配点统一 `@property` 场景绑定。
8. 命名：类大驼峰；私有成员 `_` 前缀；prefab `pref_` / 图集 `atlas_` / 音效 `snd_`。
9. 技术栈：Cocos Creator 3.8.8 + TypeScript；伪 3D 钩制 XY；`SortingOrder2D: z ≤ -worldY`。
10. **不手改 `.meta`**；Cocos 编辑器打开时不要提交/修改资产文件。

## 三、分工

| 侧 | 负责 |
| --- | --- |
| Cursor | prefab 新建/修改、场景节点、`@property` 暴露与绑定说明、动画/材质、编辑器内验证 |
| Codex | `assets/scripts` 下业务逻辑（combat / core / economy / npc / player / scene / shop / ui）、GameConstants、EventBus、git 提交、代码审查、冲突排查 |
| 用户 | 编辑器拖绑、实测运行、需求仲裁 |

## 四、交接协议（强制）

1. **开工前**：先读 `docs/HANDOFF.md` 与 `git log`，必要时 `git pull` 确认最新状态。
2. **收工前**：必须 commit（不留未提交改动给对方），并更新 `docs/HANDOFF.md`（已完成 / 下一步 / 需要用户绑定的属性 / 坑与注意）。
3. **文件域**：同一时间只允许一方改资产文件（scene / prefab / meta）；代码侧（`assets/scripts`）与资产侧可并行。
4. **不重复实现**：若 `docs/HANDOFF.md` 中已有"请 XX 做 X"，另一方不得抢先实现同一功能，除非用户明确改派。
5. 需要对方配合时，把需求写进 `docs/HANDOFF.md`，不要直接改对方负责的文件域。
