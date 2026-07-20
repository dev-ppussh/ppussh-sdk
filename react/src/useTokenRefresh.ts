import { useEffect, useRef } from 'react';
import { getAccessToken, getRefreshToken, clearTokens, getJwtExpiry } from './utils';

interface UseTokenRefreshOptions {
  backendUrl: string;
  onRefreshed?: () => void;
  onError?: (error: Error) => void;
  refreshBeforeSeconds?: number;
}

export function useTokenRefresh({
  backendUrl,
  onRefreshed,
  onError,
  refreshBeforeSeconds = 60,
}: UseTokenRefreshOptions): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      window.location.href = '/login';
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `refresh_token=${refreshToken}`,
      });

      if (response.ok) {
        onRefreshed?.();
        scheduleRefresh();
      } else {
        clearTokens();
        window.location.href = '/login';
      }
    } catch (error) {
      clearTokens();
      if (onError && error instanceof Error) {
        onError(error);
      } else {
        window.location.href = '/login';
      }
    }
  };

  const scheduleRefresh = () => {
    const token = getAccessToken();
    if (!token) return;

    const exp = getJwtExpiry(token);
    if (exp === null) return;

    const nowSec = Date.now() / 1000;
    const msUntilRefresh = Math.max((exp - nowSec - refreshBeforeSeconds) * 1000, 0);

    timerRef.current = setTimeout(refresh, msUntilRefresh);
  };

  useEffect(() => {
    scheduleRefresh();

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [backendUrl]);
}
