import { generateTextAvatar } from '../utils';

interface AvatarProps {
  name?: string | null;
  pictureUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-lg',
};

export function Avatar({ name, pictureUrl, size = 'md' }: AvatarProps) {
  const textAvatar = generateTextAvatar(name ?? '');
  const hasAvatar = !!pictureUrl;
  const sizeClass = sizeClasses[size];

  if (hasAvatar) {
    return (
      <img
        src={pictureUrl!}
        alt={name ?? 'Avatar'}
        className={`${sizeClass} rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-slate-500 flex items-center justify-center text-white font-medium`}
    >
      {textAvatar}
    </div>
  );
}
