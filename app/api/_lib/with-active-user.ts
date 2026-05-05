import { requireAuth } from './require-auth';

type RouteHandler = (...args: any[]) => Response | Promise<Response>;

export function withActiveUser<T extends RouteHandler>(handler: T): T {
  return (async (...args: Parameters<T>) => {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    return handler(...args);
  }) as T;
}
