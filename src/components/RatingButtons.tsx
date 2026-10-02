import { useEffect, useMemo, useState } from 'react';
import { getLocalUserId } from '../auth/roles';
import { getRating, setRating, type Rating } from '../questionBank/feedback';

export interface RatingButtonsProps {
  questionId: string;
  compact?: boolean;
}

/**
 * ★ 好題 / 🗑 不佳題（PART AL–AP）。
 *
 * - 低干擾 UI，不影響主要解析。
 * - NONE ↔ STAR、NONE ↔ TRASH、STAR ↔ TRASH 互斥切換。
 * - 只是 Question Quality Feedback：完全不影響對錯、分數、計時、
 *   出題與題庫內容；Trash 絕對不是刪除，是否停用由 ADMIN 決定。
 */
export function RatingButtons({ questionId, compact = false }: RatingButtonsProps) {
  const userId = useMemo(() => getLocalUserId(), []);
  const [rating, setLocal] = useState<Rating | null>(() => getRating(userId, questionId));

  useEffect(() => {
    setLocal(getRating(userId, questionId));
  }, [userId, questionId]);

  const toggle = (target: Rating) => {
    const next: Rating | null = rating === target ? null : target;
    setRating(userId, questionId, next);
    setLocal(next);
  };

  return (
    <div className={`rating${compact ? ' rating--compact' : ''}`} role="group" aria-label="題目評價">
      <span className="rating__label">這題如何？</span>
      <button
        type="button"
        className={`rating__btn${rating === 'STAR' ? ' is-active-star' : ''}`}
        aria-pressed={rating === 'STAR'}
        onClick={() => toggle('STAR')}
        title="標記為好題"
      >
        {rating === 'STAR' ? '★' : '☆'} 好題
      </button>
      <button
        type="button"
        className={`rating__btn${rating === 'TRASH' ? ' is-active-trash' : ''}`}
        aria-pressed={rating === 'TRASH'}
        onClick={() => toggle('TRASH')}
        title="標記為不佳題（僅供管理者參考，不會刪除題目）"
      >
        🗑 不佳題
      </button>
    </div>
  );
}
