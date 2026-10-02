# 聽牌訓練（TENPAI TRAINING）

台灣麻將「最佳打牌」訓練 Web App。看到一組手牌後，選出**下一巡一進聽有效進張總枚數最多**的打牌。答案永遠由內建麻將引擎即時計算，題庫只保存題目手牌，不保存人工答案。

- React + TypeScript + Vite，純前端本機單機執行，無後端
- 內建 **1500 題自動生成正式題庫**（8張200／11張300／14張400／17張600），第一次啟動匯入一次、永久保存，之後啟動直接讀取
- USER / ADMIN 角色：玩家可對題目標記 ★ 好題 / 🗑 不佳題；管理者可檢視回饋、手動新增（可含字牌）、停用/啟用、永久刪除、手動執行 Generator
- 題庫 / 回饋 / 角色 / 最佳紀錄存於 localStorage（schema 有 version 與 migration）
- 台灣麻將規則：只有一般形（N 面子 + 1 對將），無七對子 / 國士 / 花牌 / 赤五

---

## 安裝與啟動

需要 Node.js 18 以上。

```bash
npm install      # 安裝依賴
npm run dev      # 開發模式（瀏覽器開 http://localhost:5173）
npm run build    # 型別檢查 + 產生正式版（輸出到 dist/）
npm run preview  # 預覽正式版 build
npm test         # 執行全部 unit tests（vitest）
npm run seeds    # 開發工具：搜尋適合的 demo 題目
npm run generate # 重新執行 Generator，重建 generatedBank.v1.json（約 15 分鐘）
```

> 提示：專案若放在 OneDrive 資料夾內，`npm install` 產生的 node_modules
> 會有大量小檔案，建議在 OneDrive 設定中排除 node_modules 或暫停同步。

---

## 專案架構

```
src/
  engine/            麻將引擎【LOCKED：唯一答案權威，不可改變數學行為】
    tiles.ts           34 種牌的表示、排序、中文名稱
    hand.ts            frequency-array、canonical key、notation
    winning.ts         胡牌判定（N 面子 + 1 對將，遞迴拆解 + memoization）
    tenpai.ts          聽牌判定
    ukeire.ts          有效進張計算（核心規則）
    analyzeDiscard.ts  整手牌最佳打牌分析（含 cache）
    cache.ts           memoization caches
    regression.test.ts 引擎行為回歸鎖定（26 題快照，失敗＝答案被改變）
  generator/         自動題庫 Generator（只產生候選；答案由引擎決定）
    config.ts          GeneratorConfig：全部參數集中（無散落 magic numbers）
    seeds.ts           Reverse Construction：胡牌形 → Tenpai Seeds
    reverseSearch.ts   T→B→X→A→Q 搜尋（結構化 beam，非純 random）
    suitAnalysis.ts    花色結構分析（participation、連通、孤張…）
    quality.ts         Intrinsic Quality（C/D/S/X/U + penalties）
    difficulty.ts      Difficulty Raw（與 Quality 完全分離）
    tags.ts            structureTags / decisionTags
    fingerprint.ts     exact / suit-isomorphic / translation 指紋
    select.ts          去重 + Greedy Diversity Selection + 難度百分位
    generate.ts        pipeline 主流程與統計
  game/              遊戲邏輯（模式、計分、出題、本局紀錄型別）
  auth/              USER / ADMIN 角色與 localUserId（統一 requireAdmin 權限層）
  questionBank/      題庫層
    types.ts           schema v2（source/status/metadata，v1 自動 migration）
    storage.ts         localStorage 持久化與管理動作
    feedback.ts        ★/🗑 回饋（獨立資料、(userId,questionId) 唯一、互斥）
    initialization.ts  一次性初始化（匯入正式生成題庫，atomic）
    adminActions.ts    Admin 手動 Generator（append）與 REBUILD
    manualMeta.ts      手動題 metadata 計算
    generatedBank.v1.json  正式生成題庫（1500 題，npm run generate 產出）
  components/        UI 元件（MahjongTile、HandView、AnalysisPanel、RatingButtons…）
  pages/             首頁 / 遊戲 / 成績 / Admin 主控台 / 手動新增
  assets/
    tileAssets.ts      牌面素材對應層（Unicode ↔ 圖片切換點）
    tiles/             未來放 PNG/SVG 牌面素材的位置
scripts/
  generateBank.ts    正式題庫生成 script（含完整驗證與統計報告）
  findSeeds.ts       demo 題目搜尋工具
```

引擎、Generator、遊戲邏輯、題庫、牌面 rendering 彼此分離：引擎只認識 tile index / counts，Generator 只產生候選並呼叫引擎驗證，UI 只透過 `MahjongTile` 顯示牌，素材只在 `tileAssets.ts` 決定。

---

## 遊戲規則

- 四種模式（模式名稱＝題目顯示的手牌張數）：
  | 模式 | 完成形 |
  |------|--------|
  | 17 張 | 5 面子 + 1 對將 |
  | 14 張 | 4 面子 + 1 對將 |
  | 11 張 | 3 面子 + 1 對將 |
  | 8 張  | 2 面子 + 1 對將 |
- 每題 60 秒。先點牌（可改選）、再按「確認打出」才判定；確認瞬間停止計時，看分析期間不計時。
- 計分（訓練優先、速度為輔）：`round(1000 − 500 × (實際經過秒數 / 60)²)`，經過時間 clamp 0–60 秒（0 秒 ≈ 1000、30 秒 = 875、60 秒 = 500）。答錯 / 超時本題 0 分。沒有 combo、倍率、生命值。
- **答錯一次或超時，本局立即結束**（先看完整答案分析，再進成績頁）。
- 同一局不重複出題；該模式題目全部答完則以「完成所有題目」結束。
- 成績頁有本局回顧，每題可展開重看手牌與完整牌效分析。

## 「聽牌」定義

以 17 張模式為例：16 張牌時，若存在至少一種牌 X（手上未滿 4 張），摸入後 17 張可完整拆解為 5 面子 + 1 對將，即為聽牌。其他模式同理（13 張 / 10 張 / 7 張時判斷）。

## 「有效進張」定義（本遊戲核心）

**不是**「打一張後摸什麼直接聽牌」，而是完整的一巡：

```
第一次打牌 → 下一巡摸一張 X → 再打一張 → 進入聽牌
```

只要存在**至少一種**第二次打牌能使手牌聽牌，X 就是該打法的有效進張。

- 剩餘枚數 = `4 −（原始題目中該牌張數）`。原始題目所有牌都視為已知，已打出的牌不會加回未知牌；剩餘 0 枚的牌不列入。
- 同時顯示「種類數」與「總枚數」，**最佳打牌只比較總有效進張枚數**；並列最大者全部都是正確答案，不加任何 tie-breaker。

## 最佳打牌演算法

對手牌中每個**不同牌種**（相同牌只算一次）：

1. 模擬第一次打牌
2. 遍歷 34 種摸牌（剩餘 0 枚者跳過；若打完已聽牌，摸任何牌打回即回聽牌，直接全部有效）
3. 對每個摸牌遍歷所有第二次打牌，判斷是否進入聽牌
4. 統計有效進張種類、每種剩餘枚數、總枚數

所有 `總枚數 == max` 的打法皆為最佳。效能上使用 counts array（number[34]）、canonical key memoization（胡牌 / 聽牌 / 花色拆解 / 整手分析四層 cache），17 張題目冷分析約 100–300ms，之後皆為 cache 命中。

---

## 題庫

- 題庫依模式分開管理，只保存手牌；答案由引擎計算（新增時即完成分析並進 cache）。
- 新增方式：
  - **視覺選牌**：34 種牌的 picker，點選加入、自動排序，同牌滿 4 張自動 disable。
  - **文字輸入**：支援一次一題與批量（一行＝一題），解析後逐題預覽驗證，確認後批量加入。
- 新增前自動檢查：張數符合模式、每種牌 ≤ 4、無非法牌 / 赤五、notation 正確、與該模式既有題目不重複（忽略輸入順序），並跑完整牌效預檢（顯示最佳打牌與 n 種 / m 張，供加入前確認）。
- 儲存格式（localStorage key `tenpai-training:bank`）：

```json
{
  "version": 1,
  "questions": [
    { "id": "…", "mode": 8, "tiles": ["2m","3m","5p","5p","7p","8p","1z","1z"],
      "key": "0110000000000110110000000002000000", "createdAt": 1730000000000 }
  ]
}
```

## 文字輸入 notation

| 寫法 | 意義 | 範例 |
|------|------|------|
| 數字串 + `m` | 萬子 | `123m` = 一二三萬 |
| 數字串 + `p` | 筒子 | `55p` = 兩張五筒 |
| 數字串 + `s` | 索子 | `789s` |
| 數字串 + `z` | 字牌（1東 2南 3西 4北 5白 6發 7中） | `11z` = 兩張東 |
| 大寫字母 | `E`東 `S`南 `W`西 `N`北 `P`白 `F`發 `C`中 | `EE` = 兩張東 |

- **大小寫有意義**：小寫 `p`/`s` 是筒/索，大寫 `P`/`S` 是白板/南風，不會衝突。
- 空白可自由加入；批量輸入一行一題。
- 沒有赤五：`0m` / `0p` / `0s` 一律拒絕。

---

## 正式題庫與自動 Generator（第二階段）

### 一次性初始化

```
APP START → 檢查 meta.questionBankInitialized
  ├─ 尚未初始化：匯入 generatedBank.v1.json（1500 題，離線 Generator 產出、
  │   逐題經引擎驗證）→ 與既有題目做 exact-duplicate 檢查 → 單一 atomic
  │   寫入（題目 + initialized 旗標同一次 saveBank，不會半初始化）
  └─ 已初始化：直接讀現有 Persistent 題庫
```

Refresh / 關閉重開 / 重開機 / New Game / 換模式 / USER 或 ADMIN 啟動：
**永遠不會重新生成**。generatorVersion 改變也只是 metadata，不會自動重建；
重建必須由 ADMIN 在管理主控台明確執行 REBUILD（輸入 `REBUILD` 確認）。

### Generator 演算法（V1）

1. **Reverse Construction**：先生成合法完整胡牌形 W（k 面子＋1 對，叢聚偏好
   產生 overlapping / compound 結構），對 W 中所有 distinct Y 枚舉 T = W−Y，
   引擎驗證 isTenpai(T) 得到 Tenpai Seeds。
2. **T→B→X→A→Q**：加一張 B、移一張 X、補一張 A 得到候選題 Q。
   B/X/A 以結構關聯分數排序取 beam top-N（可 rank/prune，不能取代引擎）。
3. **Hard filters**：張數/≤4 張/0 字牌/花色數規則（8=1 色、11=1–2、14=2–3、
   17=2–3）/exact 去重/「任何第一打後不得已聽牌」/每個花色必須真正參與。
4. **引擎分析（唯一答案權威）** → Quality（C25/D20/S20/X15/U20 − penalties）、
   Difficulty（獨立計分）、structure/decision tags、三層指紋
   （exact / suit-isomorphic / rank-translation）。
5. **Diversity Selection**：quality ≥ 門檻的 pool 中 greedy 選題——
   iso 同構每組只留一題；translation 近親與高 Jaccard 相似題 downweight；
   archetype 佔比上限；花色數 quota；難度分佈平衡。選不滿時每次 −5 調低
   configurable 門檻（下限 55）再重選，絕不放入未通過驗證的題目。
6. 難度 Tier 以同模式入選題 percentile 指派：Easy 20% / Medium 40% /
   Hard 30% / Very Hard 10%。

全部參數集中在 `src/generator/config.ts`（RNG seed 固定，同 code/config/seed
重跑結果可重現）。`npm run generate` 會重新產出 JSON 並印出完整統計報告。

### USER / ADMIN

- 首頁最下方「管理者模式」→ 確認後切換為 ADMIN（本機單機 App 的 local role
  switch；權限統一走 `requireAdmin()`，未來可整組替換為真正的 authentication）。
- **USER**：正常遊玩、看解析、★ 好題 / 🗑 不佳題（可取消、互斥）。
  不能新增/停用/刪除題目、不能執行 Generator。
- **ADMIN**：題庫管理主控台——列表（篩選：模式/狀態/來源/難度/generator
  版本；排序：品質/難度/★/🗑/新舊；搜尋 ID 或牌）、題目詳情（引擎即時
  分析、品質細項、tags、指紋、回饋數）、手動新增（**允許字牌**）、停用/啟用、
  永久刪除（二次確認，連同回饋一併清理）、手動執行 Generator（append）、
  REBUILD（輸入 REBUILD 確認）。

### ★ / 🗑 回饋

- 獨立的 QuestionFeedback 資料：`(userId, questionId)` 唯一、STAR/TRASH 互斥；
  localUserId 第一次啟動產生 UUID 後永久沿用。
- 回饋**完全不影響** gameplay：對錯、分數、計時、出題、引擎答案都不變。
- 玩家 Trash ≠ 刪除 ≠ 停用——只是給 ADMIN 的參考，處置由 ADMIN 決定。

---

## 如何將 Unicode 麻將牌替換成 PNG/SVG 素材

把圖片放進 `src/assets/tiles/`，檔名如下（`.png` 或 `.svg` 皆可）：

```
1m.png … 9m.png        萬子
1p.png … 9p.png        筒子
1s.png … 9s.png        索子
east.png  south.png  west.png  north.png    東南西北
white.png green.png red.png                 白發中
```

**放進去即可，不需要修改任何程式碼**：`src/assets/tileAssets.ts` 以
`import.meta.glob` 在建置時自動偵測該資料夾，找到圖片的牌用圖片、
沒找到的牌自動 fallback 回 Unicode（可逐張漸進替換）。重新執行
`npm run dev` / `npm run build` 即生效。

若想改用其他檔名或格式，只需要編輯 `tileAssets.ts` 內的
`IMAGE_FILE_NAMES` 對應表——麻將引擎、遊戲邏輯、題庫、所有頁面
完全不用動（它們只透過 `MahjongTile` 元件顯示牌）。

牌身外觀（圓角、陰影、hover、selected）由 `MahjongTile` + CSS 提供，
與素材無關，換圖後依然適用。

---

## Debug mode

網址加上 `?debug=true`（例如 `http://localhost:5173/?debug=true`），遊戲頁最下方會出現引擎分析面板：原始牌 notation、每個第一次打牌的有效進張種類 / 每種剩餘枚數 / 總枚數、最佳打牌、計算耗時。正式 UI（不帶參數）不顯示任何 debug 資訊。

## 測試

```bash
npm test
```

Vitest（131 tests）涵蓋：

- **引擎**：牌 representation 與排序、notation parser、胡牌判定（含七對子必須不胡、字牌無順子、4 張同牌拆解）、聽牌判定（含第 5 張不存在）、有效進張與剩餘枚數（含手算驗證案例）、最佳打牌與並列最佳、四種模式參數化一致性，以及 **26 題行為回歸鎖定快照**（任何失敗代表答案被改變）。
- **Generator invariants**：縮小規模實跑 pipeline——0 字牌、≤4 張、花色數規則、引擎答案與 cached metadata 一致、剩餘枚數 1–4、exact/iso 去重、deterministic seed 重現。
- **正式題庫**：1500 題全數驗證（題數、字牌、花色、重複、難度分佈）＋引擎抽查。
- **權限 / 回饋**：USER 不能管理題庫、(userId,questionId) 唯一、STAR/TRASH 互斥、大量 Trash 也不會刪除或停用題目、永久刪除清理回饋。
- **Startup / Persistence**：第一次啟動匯入一次；重複啟動 / refresh / New Game / 模式切換 / generatorVersion 改變都不重新生成；MANUAL / DISABLED / 回饋在重啟後保留。

## 已知限制

- 分析在主執行緒同步計算：17 張題目第一次載入約 100–300ms（之後走 cache）。若未來題目更極端可再搬進 Web Worker。
- 題庫存於瀏覽器 localStorage：清除瀏覽資料會連同自訂題目一併清除（預設題目會自動重建）。可另行備份（複製 localStorage 內容）。
- Unicode 牌面依賴系統字型（Windows 的 Segoe UI Symbol 有完整支援）；若字型缺字會自動改用中文字 fallback 顯示。
