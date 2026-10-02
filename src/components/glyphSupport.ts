/**
 * 偵測系統字型是否能顯示 Unicode 麻將牌。
 *
 * 方法：在 canvas 上分別畫「一萬 U+1F007」與一個私有區字元
 * （幾乎必定缺字、顯示為豆腐框），比較點陣是否相同。
 * 相同代表麻將牌也是豆腐框 → MahjongTile 會改用中文字 fallback。
 */
let cached: boolean | null = null;

export function mahjongGlyphsSupported(): boolean {
  if (cached !== null) return cached;
  if (typeof document === 'undefined') {
    cached = true;
    return cached;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      cached = true;
      return cached;
    }
    const draw = (text: string): string => {
      ctx.clearRect(0, 0, 40, 40);
      ctx.font = '32px "Segoe UI Symbol", "Noto Sans Symbols 2", "Apple Symbols", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(text, 2, 2);
      return canvas.toDataURL();
    };
    const mahjong = draw('\u{1F007}'); // 🀇 一萬
    const tofu = draw('\u{E01F}'); // 私有使用區：預期缺字
    cached = mahjong !== tofu;
  } catch {
    cached = true;
  }
  return cached;
}
