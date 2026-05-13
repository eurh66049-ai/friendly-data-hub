import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SubscriptionInfo {
  isActive: boolean;
  plan: 'monthly' | 'yearly' | null;
  expiresAt: string | null;
  loading: boolean;
}

export function useSubscription(userId?: string | null): SubscriptionInfo {
  const [info, setInfo] = useState<SubscriptionInfo>({
    isActive: false, plan: null, expiresAt: null, loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setInfo({ isActive: false, plan: null, expiresAt: null, loading: false });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('plan, expires_at, status')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setInfo({
          isActive: true,
          plan: data.plan as 'monthly' | 'yearly',
          expiresAt: data.expires_at,
          loading: false,
        });
      } else {
        setInfo({ isActive: false, plan: null, expiresAt: null, loading: false });
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return info;
}

export function useIsVerified(userId?: string | null): boolean {
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!userId) { setVerified(false); return; }
    (async () => {
      const { data } = await supabase.rpc('is_user_verified', { _user_id: userId });
      if (!cancelled) setVerified(!!data);
    })();
    return () => { cancelled = true; };
  }, [userId]);
  return verified;
}