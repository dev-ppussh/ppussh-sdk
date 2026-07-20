import React from 'react';

interface LoginButtonProps {
  backendUrl: string;
  clientId: string;
  redirectUri: string;
  children?: React.ReactNode;
  className?: string;
}

export function LoginButton({
  backendUrl,
  clientId,
  redirectUri,
  children = 'Login with PPUSSH',
  className = '',
}: LoginButtonProps) {
  const handleClick = () => {
    const state = Math.random().toString(36).substring(2);
    sessionStorage.setItem('oauth_state', state);
    const loginUrl = `${backendUrl}/login?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    window.location.href = loginUrl;
  };

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
