import { ReactNode } from 'react';
import { useProfileCustomization } from '@/hooks/useProfileCustomization';
import { cn } from '@/lib/utils';

export const FRAME_OPTIONS: { id: string; label: string; className: string }[] = [
  { id: 'none', label: 'بدون', className: '' },
  { id: 'gold', label: 'ذهبي', className: 'ring-4 ring-yellow-400 shadow-[0_0_18px_rgba(250,204,21,0.7)]' },
  { id: 'silver', label: 'فضي', className: 'ring-4 ring-slate-300 shadow-[0_0_14px_rgba(203,213,225,0.7)]' },
  { id: 'rainbow', label: 'قوس قزح', className: 'p-[3px] bg-gradient-to-tr from-pink-500 via-yellow-400 to-blue-500 rounded-full' },
  { id: 'neon-blue', label: 'نيون أزرق', className: 'ring-4 ring-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.9)] animate-pulse' },
  { id: 'emerald', label: 'زمرّد', className: 'ring-4 ring-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.7)]' },
  { id: 'fire', label: 'ناري', className: 'p-[3px] bg-gradient-to-tr from-red-500 via-orange-400 to-yellow-400 rounded-full animate-pulse' },
];

export const SEASONAL_BADGES: { id: string; label: string; emoji: string }[] = [
  { id: 'none', label: 'بدون', emoji: '' },
  { id: 'ramadan', label: 'رمضان', emoji: '🌙' },
  { id: 'world-book-day', label: 'يوم الكتاب', emoji: '📚' },
  { id: 'new-year', label: 'سنة جديدة', emoji: '🎉' },
  { id: 'eid', label: 'العيد', emoji: '🕌' },
  { id: 'reader-of-month', label: 'قارئ الشهر', emoji: '🏆' },
];

export const PROFILE_THEMES: { id: string; label: string; gradient: string }[] = [
  { id: 'default', label: 'افتراضي', gradient: 'from-background to-background' },
  { id: 'royal', label: 'ملكي', gradient: 'from-indigo-500/20 via-purple-500/20 to-pink-500/20' },
  { id: 'ocean', label: 'محيط', gradient: 'from-cyan-500/20 via-blue-500/20 to-indigo-500/20' },
  { id: 'sunset', label: 'غروب', gradient: 'from-orange-500/20 via-pink-500/20 to-red-500/20' },
  { id: 'forest', label: 'غابة', gradient: 'from-emerald-500/20 via-green-500/20 to-teal-500/20' },
  { id: 'gold', label: 'ذهبي', gradient: 'from-yellow-500/20 via-amber-500/20 to-orange-500/20' },
];

export function getFrameClass(frameId: string) {
  return FRAME_OPTIONS.find(f => f.id === frameId)?.className ?? '';
}

export function getThemeGradient(themeId: string) {
  return PROFILE_THEMES.find(t => t.id === themeId)?.gradient ?? PROFILE_THEMES[0].gradient;
}

export function getSeasonalEmoji(badgeId: string) {
  return SEASONAL_BADGES.find(b => b.id === badgeId)?.emoji ?? '';
}

interface AvatarFrameProps {
  userId?: string | null;
  children: ReactNode;
  className?: string;
  showSeasonal?: boolean;
}

/**
 * Wraps an avatar with the user's chosen frame + optional seasonal badge.
 */
export function AvatarFrame({ userId, children, className, showSeasonal = true }: AvatarFrameProps) {
  const { avatar_frame, seasonal_badge } = useProfileCustomization(userId);
  const frameClass = getFrameClass(avatar_frame);
  const emoji = getSeasonalEmoji(seasonal_badge);

  return (
    <span className={cn('relative inline-block rounded-full', frameClass, className)}>
      {children}
      {showSeasonal && emoji && (
        <span
          className="absolute -bottom-1 -right-1 text-base bg-background rounded-full px-1 shadow-md border border-border"
          aria-label="شارة موسمية"
        >
          {emoji}
        </span>
      )}
    </span>
  );
}

export default AvatarFrame;