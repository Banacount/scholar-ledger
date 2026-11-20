import { useCallback, useEffect, useState } from 'react';

export interface RouteLocation {
  pathname: string;
  search: string;
}

function getCurrentLocation(): RouteLocation {
  return {
    pathname: window.location.pathname || '/',
    search: window.location.search || '',
  };
}

export function useAppRouter() {
  const [location, setLocation] = useState<RouteLocation>(getCurrentLocation);

  useEffect(() => {
    const onPopState = () => {
      setLocation(getCurrentLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const targetUrl = new URL(to, window.location.origin);
    const nextPath = targetUrl.pathname;
    const nextSearch = targetUrl.search;

    if (
      nextPath === window.location.pathname &&
      nextSearch === window.location.search
    ) {
      return;
    }

    if (options?.replace) {
      window.history.replaceState({}, '', `${nextPath}${nextSearch}`);
    } else {
      window.history.pushState({}, '', `${nextPath}${nextSearch}`);
    }
    setLocation({ pathname: nextPath, search: nextSearch });
  }, []);

  return {
    pathname: location.pathname,
    search: location.search,
    searchParams: new URLSearchParams(location.search),
    navigate,
  };
}
