import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { SEOHead } from '@/components/seo/SEOHead';

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending');

  useEffect(() => {
    const initiated = sessionStorage.getItem('subscription_initiated');
    const planRaw = sessionStorage.getItem('subscription_plan') as 'monthly' | 'yearly' | null;

    if (!initiated) {
      navigate('/', { replace: true });
      return;
    }
    if (!user) return; // wait for auth to hydrate

    const plan = planRaw === 'monthly' ? 'monthly' : 'yearly';
    const amount = plan === 'monthly' ? 3 : 25;
    const days = plan === 'monthly' ? 30 : 365;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    (async () => {
      const { error } = await supabase.from('subscriptions').insert({
        user_id: user.id,
        plan,
        status: 'active',
        amount_usd: amount,
        expires_at: expiresAt,
      });
      if (error) {
        console.error(error);
        setStatus('error');
      } else {
        setStatus('ok');
        sessionStorage.removeItem('subscription_initiated');
        sessionStorage.removeItem('subscription_plan');
      }
    })();
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-background to-primary/5 py-16 px-4">
      <SEOHead title="تم تفعيل اشتراكك | كتبي" description="مرحبًا بك في عضوية القارئ الموثّق" canonical="/subscription-success" />
      <div className="max-w-xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            {status === 'pending' && <Loader2 className="w-16 h-16 animate-spin text-blue-500 mx-auto mb-2" />}
            {status === 'ok' && <BadgeCheck className="w-20 h-20 text-blue-500 mx-auto mb-2" />}
            <CardTitle className="text-2xl">
              {status === 'pending' && 'جاري تفعيل اشتراكك...'}
              {status === 'ok' && '🎉 تم تفعيل اشتراكك!'}
              {status === 'error' && 'حدث خطأ'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            {status === 'ok' && (
              <>
                <p className="text-muted-foreground">
                  مرحبًا بك في عضوية <strong>القارئ الموثّق</strong>. ستظهر شارة التوثيق بجانب اسمك في كل مكان على الموقع.
                </p>
                <div className="flex gap-2 justify-center flex-wrap pt-2">
                  <Button asChild><Link to="/profile-customization">خصّص ملفك الشخصي</Link></Button>
                  <Button variant="outline" asChild><Link to="/profile">ملفي</Link></Button>
                </div>
              </>
            )}
            {status === 'error' && (
              <>
                <p className="text-muted-foreground">حدث خطأ أثناء تفعيل اشتراكك. تواصل معنا وأرسل رقم معاملة PayPal.</p>
                <Button asChild><Link to="/contact">تواصل معنا</Link></Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}