import { Router } from "./router.js";
import { Env, FallbackHandlerInterface, H, HandlerInterface, MergePath, MergeSchemaPath, MiddlewareHandlerInterface, OnHandlerInterface, RouterRoute, Schema } from "./types.js";
import { ExecutionContext } from "./context.js";
//#region src/hono-base.d.ts
type GetPath<E extends Env> = (request: Request, options?: {
  env?: E['Bindings'];
}) => string;
export type HonoOptions<E extends Env> = {
  /**
   * `strict` option specifies whether to distinguish whether the last path is a directory or not.
   *
   * @see {@link https://hono.dev/docs/api/hono#strict-mode}
   *
   * @default true
   */
  strict?: boolean;
  /**
   * `router` option specifies which router to use.
   *
   * @see {@link https://hono.dev/docs/api/hono#router-option}
   *
   * @example
   * ```ts
   * const app = new Hono({ router: new RegExpRouter() })
   * ```
   */
  router?: Router<[H, RouterRoute]>;
  /**
   * `getPath` can handle the host header value.
   *
   * @see {@link https://hono.dev/docs/api/routing#routing-with-host-header-value}
   *
   * @example
   * ```ts
   * const app = new Hono({
   *  getPath: (req) =>
   *   '/' + req.headers.get('host') + req.url.replace(/^https?:\/\/[^/]+(\/[^?]*)/, '$1'),
   * })
   *
   * app.get('/www1.example.com/hello', () => c.text('hello www1'))
   *
   * // A following request will match the route:
   * // new Request('http://www1.example.com/hello', {
   * //  headers: { host: 'www1.example.com' },
   * // })
   * ```
   */
  getPath?: GetPath<E>;
};
declare class Hono<E extends Env = Env, S extends Schema = {}, BasePath extends string = '/', CurrentPath extends string = BasePath> {
  
  get: HandlerInterface<E, 'get', S, BasePath, CurrentPath>;
  post: HandlerInterface<E, 'post', S, BasePath, CurrentPath>;
  put: HandlerInterface<E, 'put', S, BasePath, CurrentPath>;
  delete: HandlerInterface<E, 'delete', S, BasePath, CurrentPath>;
  options: HandlerInterface<E, 'options', S, BasePath, CurrentPath>;
  patch: HandlerInterface<E, 'patch', S, BasePath, CurrentPath>;
  query: HandlerInterface<E, 'query', S, BasePath, CurrentPath>;
  all: HandlerInterface<E, 'all', S, BasePath, CurrentPath>;
  on: OnHandlerInterface<E, S, BasePath>;
  use: MiddlewareHandlerInterface<E, S, BasePath>;
  /**
   * `.onError()` adds middleware that runs when an error is caught.
   * Paths are relative to the current base path and default to `*`, for any HTTP method.
   * The error is available as `c.error`. Matching middleware runs in registration order,
   * with nested applications taking priority. If every middleware calls `next()`,
   * the built-in error handler returns the response.
   * Errors thrown by this middleware are handled by the built-in error handler.
   * Non-Error values thrown by handlers are wrapped in an Error with the original value as its cause.
   * If the thrown value is a string, it is also used as the error message.
   * Request parameters come from the original route, not this scope, and may be absent.
   *
   * @param {string} [path] - path to scope the error middleware
   * @param {...MiddlewareHandler[]} handlers - middleware to run when handling an error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError('/api/*', async (c, next) => {
   *   console.error(c.error)
   *   await next()
   * })
   * ```
   */
  onError: FallbackHandlerInterface<E, S, BasePath, CurrentPath>;
  /**
   * `.notFound()` adds middleware that runs when a not-found response is requested.
   * It uses the same path scoping and ordering as `.onError()`, including for `c.notFound()`.
   * If every matching middleware calls `next()`, the built-in not-found handler returns the response.
   * Request parameters come from the original route, not this scope, and may be absent.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {string} [path] - path to scope the not-found middleware
   * @param {...MiddlewareHandler[]} handlers - middleware to run when handling not found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound('/api/*', async (c, next) => {
   *   c.header('x-not-found', 'true')
   *   await next()
   * })
   * ```
   */
  notFound: FallbackHandlerInterface<E, S, BasePath, CurrentPath>;
  router: Router<[H, RouterRoute]>;
  readonly getPath: GetPath<E>;
  private _basePath;
  routes: RouterRoute[];
  constructor(options?: HonoOptions<E>);
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route<SubPath extends string, SubEnv extends Env, SubSchema extends Schema, SubBasePath extends string, SubCurrentPath extends string>(path: SubPath, app: Hono<SubEnv, SubSchema, SubBasePath, SubCurrentPath>): Hono<E, MergeSchemaPath<SubSchema, MergePath<BasePath, SubPath>> | S, BasePath, CurrentPath>;
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath<SubPath extends string>(path: SubPath): Hono<E, S, MergePath<BasePath, SubPath>, MergePath<BasePath, SubPath>>;
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} env - env Object
   * @param {ExecutionContext} executionCtx - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch: (request: Request, env?: E['Bindings'] | {}, executionCtx?: ExecutionContext) => Response | Promise<Response>;
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request: (input: Request | string | URL, requestInit?: RequestInit, Env?: E["Bindings"] | {}, executionCtx?: ExecutionContext) => Response | Promise<Response>;
}
//#endregion
export { Hono as HonoBase };
export {};
