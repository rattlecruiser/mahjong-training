import { describe, expect, it } from 'vitest';
import { exactFingerprint, handJaccard, isoFingerprint, translationFingerprint } from './fingerprint';
import { counts } from '../testing/hands';

describe('Structural Fingerprint', () => {
  it('exact key 與順序無關', () => {
    expect(exactFingerprint(counts('23m5578p11z'))).toBe(
      exactFingerprint(counts('11z78p55p23m')),
    );
  });

  it('suit permutation = 強同構：22345678m 與 22345678p / 22345678s 同指紋', () => {
    const m = isoFingerprint(counts('22345678m'));
    expect(isoFingerprint(counts('22345678p'))).toBe(m);
    expect(isoFingerprint(counts('22345678s'))).toBe(m);
  });

  it('多花色互換也可辨識（萬↔筒整組交換）', () => {
    const a = isoFingerprint(counts('123m55p678p'));
    const b = isoFingerprint(counts('123p55m678m'));
    expect(b).toBe(a);
  });

  it('不同結構的 iso 指紋不同', () => {
    expect(isoFingerprint(counts('22345678m'))).not.toBe(
      isoFingerprint(counts('22345679m')),
    );
  });

  it('rank translation = near-duplicate：234456 與 345567 同 translation 指紋', () => {
    expect(translationFingerprint(counts('234456m'))).toBe(
      translationFingerprint(counts('345567m')),
    );
    // 但 exact / iso 不同（1/9 邊界會改變牌效，不能視為完全相同）
    expect(isoFingerprint(counts('234456m'))).not.toBe(isoFingerprint(counts('345567m')));
  });

  it('translation 指紋涵蓋 suit permutation', () => {
    expect(translationFingerprint(counts('234456m11z'))).toBe(
      translationFingerprint(counts('345567s11z')),
    );
  });

  it('handJaccard 相似度', () => {
    expect(handJaccard(counts('123m'), counts('123m'))).toBe(1);
    expect(handJaccard(counts('123m'), counts('456p'))).toBe(0);
  });
});
