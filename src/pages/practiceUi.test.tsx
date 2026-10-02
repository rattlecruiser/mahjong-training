import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GamePage, PracticeReveal, VerdictBanner } from './GamePage';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { analyzeHand, countsFromIds, tileIndexOf } from '../engine';
import { resetBankForTests } from '../questionBank/storage';
import { ids } from '../testing/hands';

/**
 * Practice Mode（含 Correct/Wrong）UI 靜態渲染驗證。
 *
 * - 玩家介面【沒有】timer / score / game over / 正解備注。
 * - Correct/Wrong 視覺：原版 verdict panel（verdict--ok / verdict--err）、
 *   原版 candidate treatment（is-best 綠 / is-chosen-wrong 紅 / 其他 neutral）。
 * - 互動流程另以 headless Chromium smoke test 驗證。
 */

const HAND = ids('23m5578p11z'); // 引擎最佳：5p / 8p / 1z（3 個並列）
const analysis8 = analyzeHand(countsFromIds(HAND), 2);
const nonBest = tileIndexOf('2m');
const bestMid = tileIndexOf('8p'); // 並列答案之一（非 bestDiscards[0]）

const rowsOf = (markup: string) => markup.match(/analysis-row(?!__)/g) ?? [];

describe('GamePage（play 階段）— 無 timer / score', () => {
  beforeEach(() => resetBankForTests());

  const html = () => renderToStaticMarkup(<GamePage mode={8} debug={false} onExit={() => {}} />);

  it('不顯示 timer 與 score', () => {
    const markup = html();
    expect(markup).not.toContain('timer');
    expect(markup).not.toContain('累計');
    expect(markup).not.toContain('本題得分');
    expect(markup).not.toContain('分數');
    expect(markup).not.toContain('TOTAL SCORE');
  });

  it('作答前沒有 verdict / 正解字樣；無固定局長（無「第 x/N 題」）', () => {
    const markup = html();
    for (const banned of ['正解', '✓', '✕', 'verdict', '答對', '答錯', '選擇錯誤']) {
      expect(markup, `作答前不應包含「${banned}」`).not.toContain(banned);
    }
    expect(markup).toContain('請選擇最佳打牌');
    expect(markup).toContain('確認打出');
    expect(markup).toContain('牌效練習');
    expect(markup).not.toMatch(/第 <b>\d+<\/b>\/\d+/);
  });
});

describe('VerdictBanner — 原版綠/紅 verdict panel', () => {
  it('答對：verdict--ok + ✓ 正確（原 class 結構）', () => {
    const markup = renderToStaticMarkup(
      <VerdictBanner verdict="correct" chosen={bestMid} bestDiscards={analysis8.bestDiscards} />,
    );
    expect(markup).toContain('verdict verdict--ok');
    expect(markup).toContain('verdict__mark');
    expect(markup).toContain('✓ 正確');
    expect(markup).not.toContain('verdict--err');
    // 多個並列答案時列出全部
    expect(markup).toContain('並列正確答案');
    expect(markup).toContain('五筒');
    expect(markup).toContain('八筒');
    expect(markup).toContain('東風');
  });

  it('答錯：verdict--err + ✕ 選擇錯誤 + 全部正確答案（不是只有第一個）', () => {
    const markup = renderToStaticMarkup(
      <VerdictBanner verdict="wrong" chosen={nonBest} bestDiscards={analysis8.bestDiscards} />,
    );
    expect(markup).toContain('verdict verdict--err');
    expect(markup).toContain('✕ 選擇錯誤');
    expect(markup).toContain('你的選擇：');
    expect(markup).toContain('二萬');
    expect(markup).toContain('正確答案：');
    expect(markup).toContain('五筒');
    expect(markup).toContain('八筒');
    expect(markup).toContain('東風');
    expect(markup).not.toContain('verdict--ok');
    // 不使用「最佳答案」等措辭、無分數
    expect(markup).not.toContain('最佳');
    expect(markup).not.toContain('分');
  });
});

describe('AnalysisPanel（玩家 bestLabel=正確答案）— 三層視覺', () => {
  const playerMarkup = (chosen: number) =>
    renderToStaticMarkup(<AnalysisPanel analysis={analysis8} chosen={chosen} bestLabel="正確答案" />);

  it('全部 distinct candidates 都列出（不是只顯示正確答案）', () => {
    const markup = playerMarkup(nonBest);
    expect(rowsOf(markup).length).toBe(analysis8.options.length);
    expect(analysis8.options.length).toBeGreaterThan(analysis8.bestDiscards.length);
  });

  it('答錯：選錯列＝紅色 treatment＋你的選擇；accepted 列＝綠色＋正確答案；其他 neutral', () => {
    const markup = playerMarkup(nonBest);
    // 紅：玩家錯誤選擇（原版 is-chosen-wrong row + chip--you-wrong badge）
    expect((markup.match(/is-chosen-wrong/g) ?? []).length).toBe(1); // 只有玩家那一列
    expect(markup).toContain('chip--you-wrong');
    expect(markup).toContain('你的選擇');
    // 綠：全部 accepted bestDiscards（原版 is-best / chip--best）
    expect((markup.match(/class="analysis-row is-best"/g) ?? []).length).toBe(
      analysis8.bestDiscards.length,
    );
    expect((markup.match(/chip--best/g) ?? []).length).toBe(analysis8.bestDiscards.length);
    expect((markup.match(/正確答案/g) ?? []).length).toBe(analysis8.bestDiscards.length);
    // neutral：其餘列沒有任何紅綠 class
    const neutralRows =
      analysis8.options.length - analysis8.bestDiscards.length - 1;
    expect((markup.match(/class="analysis-row"/g) ?? []).length).toBe(neutralRows);
    // 玩家 UI 不使用「最佳」措辭
    expect(markup).not.toContain('最佳');
  });

  it('答對：同一列同時「正確答案」+「你的選擇」（中性 accent，非紅色）', () => {
    const markup = playerMarkup(bestMid);
    // 玩家選中的 accepted 列：is-best + is-chosen 同列
    expect(markup).toContain('class="analysis-row is-best is-chosen"');
    expect(markup).toContain('chip--you');
    expect(markup).not.toContain('chip--you-wrong');
    expect(markup).not.toContain('is-chosen-wrong');
    // 該列同時有兩個 badge
    const rowHtml = markup.split('class="analysis-row is-best is-chosen"')[1].split('</li>')[0];
    expect(rowHtml).toContain('正確答案');
    expect(rowHtml).toContain('你的選擇');
    // 其他並列答案仍然綠色＋正確答案
    expect((markup.match(/正確答案/g) ?? []).length).toBe(analysis8.bestDiscards.length);
  });

  it('每個 candidate 顯示 種類 / 總枚數 / 個別有效進張（引擎輸出）', () => {
    const markup = playerMarkup(nonBest);
    for (const option of analysis8.options) {
      expect(markup).toContain(`${option.kinds} 種`);
      expect(markup).toContain(`${option.totalRemaining} 張`);
    }
    const drawItems = markup.match(/ukeire-item__count/g) ?? [];
    expect(drawItems.length).toBe(analysis8.options.reduce((sum, o) => sum + o.ukeire.length, 0));
  });

  it('排序沿用引擎輸出（總枚數高→低）——正確答案不會被偷偷移到最上面', () => {
    for (let i = 1; i < analysis8.options.length; i++) {
      const prev = analysis8.options[i - 1];
      const cur = analysis8.options[i];
      expect(
        prev.totalRemaining > cur.totalRemaining ||
          (prev.totalRemaining === cur.totalRemaining && prev.discard < cur.discard),
      ).toBe(true);
    }
  });

  it('Admin / 新增題目預覽（預設 bestLabel）仍顯示「最佳」', () => {
    const markup = renderToStaticMarkup(<AnalysisPanel analysis={analysis8} />);
    expect(markup).toContain('最佳');
    expect(markup).not.toContain('正確答案');
  });
});

describe('PracticeReveal — navigation 與對錯無關', () => {
  const render = (chosen: number) =>
    renderToStaticMarkup(
      <PracticeReveal
        questionId="q-test"
        analysis={analysis8}
        chosen={chosen}
        onExit={() => {}}
        onNext={() => {}}
      />,
    );

  it('答對結果：存在「返回主畫面」與「下一題」', () => {
    const markup = render(bestMid);
    expect(markup).toContain('返回主畫面');
    expect(markup).toContain('下一題');
  });

  it('答錯結果：同樣存在「返回主畫面」與「下一題」（controls 一致）', () => {
    const markup = render(nonBest);
    expect(markup).toContain('返回主畫面');
    expect(markup).toContain('下一題');
    // 舊競賽 navigation 不存在
    for (const banned of ['查看本局成績', '再玩一次', '返回模式選擇', '重新挑戰']) {
      expect(markup).not.toContain(banned);
    }
  });

  it('Star/Trash 保留且為題目品質語意；無正解備注', () => {
    const markup = render(nonBest);
    expect(markup).toContain('這題如何？');
    expect(markup).toContain('好題');
    expect(markup).toContain('不佳題');
    expect(markup).not.toContain('正解');
  });
});
