/**
 * USER / ADMIN 角色（PART AJ / AK）。
 *
 * 本機單機 App：不建立過度複雜的 production authentication backend，
 * 但權限走統一的 Permission Layer——所有 privileged action 都經過
 * requireAdmin()，不散落 ?admin=true 之類的 hack。
 *
 * 未來若要接真正的 authentication，只需要替換此模組的
 * getRole / setRole 實作，其餘程式（requireAdmin 呼叫端）不用動。
 */

export type Role = 'USER' | 'ADMIN';

const ROLE_KEY = 'tenpai-training:role';
const USER_ID_KEY = 'tenpai-training:user-id';

function storageAvailable(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

let memoryRole: Role = 'USER';
let memoryUserId: string | null = null;

export function getRole(): Role {
  const storage = storageAvailable();
  if (!storage) return memoryRole;
  return storage.getItem(ROLE_KEY) === 'ADMIN' ? 'ADMIN' : 'USER';
}

/** Local role switch（管理者啟動 / 切回一般使用者）。 */
export function setRole(role: Role): void {
  const storage = storageAvailable();
  if (storage) storage.setItem(ROLE_KEY, role);
  else memoryRole = role;
}

export function isAdmin(): boolean {
  return getRole() === 'ADMIN';
}

/** 所有 privileged action 的統一檢查點。 */
export function requireAdmin(action: string): void {
  if (!isAdmin()) {
    throw new Error(`需要管理者權限：${action}`);
  }
}

/**
 * 穩定的 local user id（PART AO）：
 * 沒有真正帳號系統時，第一次產生 UUID 並持久保存，
 * 同一瀏覽器之後永遠使用同一個 id（refresh 不會換）。
 */
export function getLocalUserId(): string {
  const storage = storageAvailable();
  if (!storage) {
    if (!memoryUserId) memoryUserId = newUuid();
    return memoryUserId;
  }
  let id = storage.getItem(USER_ID_KEY);
  if (!id) {
    id = newUuid();
    storage.setItem(USER_ID_KEY, id);
  }
  return id;
}

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `u-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 測試用。 */
export function resetAuthForTests(): void {
  memoryRole = 'USER';
  memoryUserId = null;
  const storage = storageAvailable();
  storage?.removeItem(ROLE_KEY);
  storage?.removeItem(USER_ID_KEY);
}
