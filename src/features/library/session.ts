import { useCallback, useLayoutEffect, useRef } from 'react';
import type { AuthState } from '../../contracts/auth';
const identities = new WeakMap<object, number>();
let nextIdentity = 0;
export function dependencyKey(value: object): number {
  let id = identities.get(value);
  if (id === undefined) { id = ++nextIdentity; identities.set(value, id); }
  return id;
}
export function memberKey(auth: AuthState): string | null {
  return auth.status === 'authenticated' && auth.isMember && auth.user.isMember
    ? `${auth.user.uid}:${auth.isAdmin}` : null;
}
/** Layout cleanup invalidates asynchronous work during the auth/role commit. */
export function useSessionLifetime() {
  const alive = useRef(false);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return useCallback(() => alive.current, []);
}
