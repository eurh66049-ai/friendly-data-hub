import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BadgeCheck, Lock, Save } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import {
  useProfileCustomization,
  saveProfileCustomization,
} from '@/hooks/useProfileCustomization';
import {
  FRAME_OPTIONS,
  PROFILE_THEMES,
  SEASONAL_BADGES,
  getFrameClass,
  getThemeGradient,
} from '@/components/premium/AvatarFrame';
import { SEOHead } from '@/components/seo/SEOHead';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function ProfileCustomization() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const sub = useSubscription(user?.id);
  const current = useProfileCustomization(user?.id);

  const [frame, setFrame] = useState('none');
  const [theme, setTheme] = useState('default');
  const [seasonal, setSeasonal] = useState('none');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!current.loading) {
      setFrame(current.avatar_frame);
      setTheme(current.profile_theme);
      setSeasonal(current.seasonal_badge);
    }
  }, [current.loading]);

  const avatarUrl = (user?.user_metadata as any)?.avatar_url as string | undefined;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-10 space-y-4">
            <p>يجب تسجيل الدخول لتخصيص ملفك الشخصي.</p>
            <Button onClick={() => navigate('/auth')}>تسجيل الدخول</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sub.loading && !sub.isActive) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-background to-primary/5 p-4 py-16">
        <div className="max-w-lg mx-auto text-center">
          <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">ميزة حصرية للقارئ الموثّق</h1>
          <p className="text-muted-foreground mb-6">
            تخصيص الإطارات والثيمات والشارات الموسمية متاح للمشتركين فقط.
          </p>
          <Button asChild size="lg">
            <Link to="/subscription">
              <BadgeCheck className="w-5 h-5 me-2" /> اشترك الآن
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveProfileCustomization(user.id, {
        avatar_frame: frame,
        profile_theme: theme,
        seasonal_badge: seasonal,
      });
      toast.success('تم حفظ التخصيص ✨');
    } catch (e: any) {
      toast.error('فشل الحفظ: ' + (e?.message ?? ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn('min-h-screen p-4 py-10 bg-gradient-to-br', getThemeGradient(theme))}>
      <SEOHead title="تخصيص الملف الشخصي | كتبي" description="اختر إطار صورتك الرمزية وثيم ملفك" canonical="/profile-customization" />
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Live preview */}
        <Card>
          <CardHeader><CardTitle>المعاينة المباشرة</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-3 py-6">
            <span className={cn('relative inline-block rounded-full', getFrameClass(frame))}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar" className="w-24 h-24 rounded-full object-cover block" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center text-3xl">
                  {(user.email?.[0] ?? '?').toUpperCase()}
                </div>
              )}
              {seasonal !== 'none' && (
                <span className="absolute -bottom-1 -right-1 text-xl bg-background rounded-full px-1 shadow border border-border">
                  {SEASONAL_BADGES.find(b => b.id === seasonal)?.emoji}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1 text-lg font-semibold">
              {(user.user_metadata as any)?.username ?? user.email}
              <BadgeCheck className="w-5 h-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        {/* Frames */}
        <Card>
          <CardHeader>
            <CardTitle>إطار الصورة الرمزية</CardTitle>
            <CardDescription>اختر إطارًا مميزًا يحيط بصورتك</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {FRAME_OPTIONS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFrame(f.id)}
                  className={cn(
                    'p-3 rounded-lg border text-center transition',
                    frame === f.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                  )}
                >
                  <div className={cn('w-12 h-12 rounded-full bg-muted mx-auto mb-2', f.className)} />
                  <span className="text-xs">{f.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Themes */}
        <Card>
          <CardHeader>
            <CardTitle>ثيم الملف الشخصي</CardTitle>
            <CardDescription>غيّر خلفية ملفك الشخصي</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PROFILE_THEMES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    'p-4 rounded-lg border text-center transition bg-gradient-to-br',
                    t.gradient,
                    theme === t.id ? 'border-primary ring-2 ring-primary' : 'border-border'
                  )}
                >
                  <span className="text-sm font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Seasonal */}
        <Card>
          <CardHeader>
            <CardTitle>الشارة الموسمية</CardTitle>
            <CardDescription>اعرض شارتك المفضّلة على صورتك</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {SEASONAL_BADGES.map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSeasonal(b.id)}
                  className={cn(
                    'p-3 rounded-lg border text-center transition',
                    seasonal === b.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                  )}
                >
                  <div className="text-2xl mb-1">{b.emoji || '—'}</div>
                  <span className="text-xs">{b.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 sticky bottom-4">
          <Button onClick={handleSave} disabled={saving} size="lg" className="shadow-lg">
            <Save className="w-4 h-4 me-2" />
            {saving ? 'جاري الحفظ...' : 'حفظ التخصيص'}
          </Button>
        </div>
      </div>
    </div>
  );
}