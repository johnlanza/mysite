'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { withBasePath } from '@/lib/base-path';
import type { SessionMember } from '@/lib/types';

type SessionState = {
  loading: boolean;
  member: SessionMember | null;
};

export function useSession() {
  const pathname = usePathname();
  const [state, setState] = useState<SessionState>({ loading: true, member: null });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    const res = await fetch(withBasePath('/api/auth/me'), { cache: 'no-store' });

    if (!res.ok) {
      setState({ loading: false, member: null });
      return;
    }

    const payload = await res.json();
    setState({ loading: false, member: payload.member });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  return {
    loading: state.loading,
    member: state.member,
    refresh
  };
}
