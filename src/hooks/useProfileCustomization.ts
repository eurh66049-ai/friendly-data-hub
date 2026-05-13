import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProfileCustomization {
  avatar_frame: string;
  profile_theme: string;
  seasonal_badge: string;
}

const DEFAULT: ProfileCustomization = {
  avatar_frame: 'none',
  profile_theme: 'default',
  seasonal_badge: 'none',
};

export function useProfileCustomization(userId?: string | null) {
  const [data, setData] = useState<ProfileCustomization>(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!userId) { setData(DEFAULT); setLoading(false); return; }
    (async () => {
      const { data: row } = await supabase
        .from('profile_customizations')
        .select('avatar_frame, profile_theme, seasonal_badge')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      setData(row ? { ...DEFAULT, ...row } : DEFAULT);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return { ...data, loading };
}

export async function saveProfileCustomization(
  userId: string,
  patch: Partial<ProfileCustomization>
) {
  const { error } = await supabase
    .from('profile_customizations')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
  if (error) throw error;
}