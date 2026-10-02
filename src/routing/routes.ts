export type RouteGuard = 'member' | 'admin' | 'owner';

export interface RouteMetadata {
  path: string;
  guard?: RouteGuard;
  description: string;
}

export const routes = [
  { path: '/', guard: 'member', description: 'Published presentation library' },
  { path: '/benim', guard: 'member', description: 'Member presentations' },
  { path: '/yeni', guard: 'member', description: 'New presentation flow' },
  { path: '/duzenle/:id', guard: 'owner', description: 'Owner presentation editor' },
  { path: '/admin', guard: 'admin', description: 'Admin review area' },
  { path: '/s/:id', guard: 'member', description: 'Presentation viewer' },
] as const satisfies readonly RouteMetadata[];
