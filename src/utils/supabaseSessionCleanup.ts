const SUPABASE_PROJECT_REF = 'kydmyxsgyxeubhmqzrgo';
const SUPABASE_AUTH_KEY_PREFIX = `sb-${SUPABASE_PROJECT_REF}`;

const getStorageKeys = (storage: Storage) => {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && (key.startsWith(SUPABASE_AUTH_KEY_PREFIX) || key.includes('supabase.auth.token'))) {
      keys.push(key);
    }
  }
  return keys;
};

export const clearSupabaseAuthStorage = () => {
  if (typeof window === 'undefined') return;

  [window.localStorage, window.sessionStorage].forEach((storage) => {
    getStorageKeys(storage).forEach((key) => storage.removeItem(key));
  });
};

export const removeCorruptSupabaseAuthStorage = () => {
  if (typeof window === 'undefined') return;

  [window.localStorage, window.sessionStorage].forEach((storage) => {
    getStorageKeys(storage).forEach((key) => {
      const value = storage.getItem(key);
      if (!value) return;

      try {
        const parsed = JSON.parse(value);
        const session = parsed?.currentSession || parsed?.session || parsed;
        const hasUsableShape = Boolean(session?.access_token || session?.refresh_token || parsed?.expires_at);

        if (!hasUsableShape) {
          storage.removeItem(key);
        }
      } catch {
        storage.removeItem(key);
      }
    });
  });
};

export const isSupabaseAuthStorageError = (error: unknown) => {
  const err = error as { message?: string; status?: number };
  const message = err?.message?.toLowerCase() || '';

  return (
    message.includes('refresh_token') ||
    message.includes('invalid refresh') ||
    message.includes('invalid claim') ||
    message.includes('jwt expired') ||
    message.includes('session_not_found') ||
    message.includes('session not found') ||
    message.includes('not found') ||
    err?.status === 401 ||
    err?.status === 403
  );
};