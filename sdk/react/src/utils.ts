import Cookies from 'js-cookie';

export const getAccessToken = (): string | undefined => {
  return Cookies.get('access_token') ?? Cookies.get('admin_access_token');
};

export const getRefreshToken = (): string | undefined => {
  return Cookies.get('refresh_token');
};

export const clearTokens = (): void => {
  Cookies.remove('access_token', { path: '/' });
  Cookies.remove('admin_access_token', { path: '/' });
  Cookies.remove('refresh_token', { path: '/' });
};

export const generateTextAvatar = (name: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export function getJwtExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}
