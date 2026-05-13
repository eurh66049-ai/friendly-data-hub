import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BadgeCheck, Sparkles, Crown, Palette, Download, Star, Calendar } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { SEOHead } from '@/components/seo/SEOHead';
import { toast } from 'sonner';

// Same PayPal account as the donation page (hosted button)
const PAYPAL_CLIENT_ID = 'BAApZa13UAQjwvN30iIJdTy78256Dr3lT4ZuFsoCg8JnK7JUmENbhID3F-2QxBzNux6rePh0t2_6O_pqe4';
const PAYPAL_BUTTON_ID = 'J5YMWJAG3T8RS';
const PAYPAL_SRC = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&components=hosted-buttons&disable-funding=venmo&currency=USD`;

declare global {
  interface Window {
    paypal?: any;
  }
}

const PLANS = [
  {
    id: 'monthly' as const,
    title: 'شهري',
    price: 3,
    duration: '/شهر',
    badge: 'الأكثر مرونة',
    icon: Calendar,
  },
  {
    id: 'yearly' as const,
    title: 'سنوي',
    price: 25,
    duration: '/سنة',
    badge: 'وفّر 30%',
    highlighted: true,
    icon: Crown,
  },
];

const FEATURES = [
  { icon: BadgeCheck, label: 'شارة التوثيق الزرقاء بجانب اسمك في كل مكان' },
  { icon: Palette, label: 'إطارات صور رمزية متحركة وحصرية' },
  { icon: Sparkles, label: 'ثيمات ألوان حصرية للملف الشخصي' },
  { icon: Star, label: 'شارات موسمية (رمضان، يوم الكتاب، العيد...)' },
  { icon: Download, label: 'تحميل غير محدود للكتب' },
  { icon: Crown, label: 'أولوية في الظهور والاقتراحات' },
];

export default function Subscription() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const sub = useSubscription(user?.id);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');

  // Load PayPal SDK + render hosted button
  useEffect(() => {
    if (!user) return;
    if (sub.isActive) return;

    if (!document.querySelector(`script[src="${PAYPAL_SRC}"]`)) {
      const s = document.createElement('script');
      s.src = PAYPAL_SRC;
      s.async = true;
      document.head.appendChild(s);
    }

    const render = () => {
      const container = document.getElementById('paypal-sub-container');
      if (!container) return;
      container.innerHTML = '';
      try {
        window.paypal.HostedButtons({ hostedButtonId: PAYPAL_BUTTON_ID })
          .render('#paypal-sub-container');
      } catch (e) { console.error(e); }

      // Mark intent: which plan + that we initiated subscription
      container.addEventListener('click', () => {
        sessionStorage.setItem('subscription_initiated', '1');
        sessionStorage.setItem('subscription_plan', selectedPlan);
      });
    };

    if (window.paypal) render();
    else {
      const t = setInterval(() => { if (window.paypal) { clearInterval(t); render(); } }, 200);
      setTimeout(() => clearInterval(t), 10000);
    }
  }, [user, sub.isActive, selectedPlan]);

  if (sub.isActive) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-background to-primary/5 py-16 px-4">
        <SEOHead title="اشتراكك مفعّل | كتبي" description="اشتراك القارئ الموثّق" canonical="/subscription" />
        <div className="max-w-2xl mx-auto text-center">
          <BadgeCheck className="w-20 h-20 text-blue-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-3">أنت قارئ موثّق! 🎉</h1>
          <p className="text-muted-foreground mb-2">خطتك: <strong>{sub.plan === 'yearly' ? 'سنوي' : 'شهري'}</strong></p>
          <p className="text-muted-foreground mb-8">تنتهي في {sub.expiresAt && new Date(sub.expiresAt).toLocaleDateString('ar')}</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button asChild><Link to="/profile-customization">خصّص ملفك الشخصي</Link></Button>
            <Button variant="outline" asChild><Link to="/profile">ملفي</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-background to-primary/5 py-12 px-4">
      <SEOHead
        title="اشتراك القارئ الموثّق | كتبي"
        description="احصل على شارة التوثيق، إطارات حصرية، وثيمات مميزة لملفك الشخصي"
        canonical="/subscription"
      />
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <Badge className="mb-3 bg-blue-500">جديد</Badge>
          <h1 className="text-4xl font-bold mb-3 flex items-center justify-center gap-2">
            <BadgeCheck className="w-9 h-9 text-blue-500" /> القارئ الموثّق
          </h1>
          <p className="text-lg text-muted-foreground">ميّز نفسك في مجتمع القراء واحصل على ميزات حصرية</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {PLANS.map(plan => {
            const Icon = plan.icon;
            const isSelected = selectedPlan === plan.id;
            return (
              <Card
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`cursor-pointer transition-all ${isSelected ? 'ring-2 ring-blue-500 shadow-xl scale-[1.02]' : 'hover:shadow-md'} ${plan.highlighted ? 'border-blue-500' : ''}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <Icon className="w-8 h-8 text-blue-500" />
                    <Badge variant={plan.highlighted ? 'default' : 'secondary'}>{plan.badge}</Badge>
                  </div>
                  <CardTitle className="text-2xl mt-2">{plan.title}</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-muted-foreground">{plan.duration}</span>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>ما الذي تحصل عليه؟</CardTitle>
            <CardDescription>كل المزايا متاحة فور تفعيل الاشتراك</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid sm:grid-cols-2 gap-3">
              {FEATURES.map((f, i) => {
                const I = f.icon;
                return (
                  <li key={i} className="flex items-start gap-3">
                    <I className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <span className="text-sm">{f.label}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-blue-500/30">
          <CardHeader>
            <CardTitle className="text-center">ادفع عبر PayPal</CardTitle>
            <CardDescription className="text-center">
              {selectedPlan === 'yearly' ? 'الخطة السنوية — $25/سنة' : 'الخطة الشهرية — $3/شهر'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!user ? (
              <div className="text-center py-6">
                <p className="mb-4 text-muted-foreground">يجب تسجيل الدخول للاشتراك</p>
                <Button onClick={() => navigate('/auth')}>تسجيل الدخول</Button>
              </div>
            ) : (
              <>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm text-amber-900 dark:text-amber-100">
                  <strong>مهم:</strong> أكمل الدفع في PayPal بالمبلغ الصحيح (${PLANS.find(p=>p.id===selectedPlan)?.price})، ثم سيتم تفعيل اشتراكك تلقائياً عند العودة.
                </div>
                <div id="paypal-sub-container" className="min-h-[60px]"></div>
                <p className="text-xs text-center text-muted-foreground">
                  بالاشتراك أنت توافق على شروط الاستخدام وسياسة الخصوصية
                </p>
              </>
            )}
          </CardContent>
          <CardFooter className="justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast.info('للاستفسار، تواصل معنا عبر صفحة الاتصال')}
            >
              لديك مشكلة في الدفع؟
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}