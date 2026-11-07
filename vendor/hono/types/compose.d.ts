import { Env, Next, NotFoundHandler } from "./types.js";
import { Context } from "./context.js";
//#region src/compose.d.ts
export declare const toError: (err: unknown) => Error;
/**
 * Compose middleware functions into a single function based on `koa-compose` package.
 *
 * @template E - The environment type.
 *
 * @param {[[Function, unknown], unknown][] | [[Function]][]} middleware - An array of middleware functions and their corresponding parameters.
 * @param {Function} [onError] - An optional callback receiving the error and context.
 * @param {NotFoundHandler<E>} [onNotFound] - An optional not-found handler function.
 * @param {boolean} [updateRouteIndex] - Whether to update the matched route index.
 *
 * @returns {(context: Context, next?: Next) => Promise<Context>} - A composed middleware function.
 */
export declare const compose: <E extends Env = Env>(middleware: [[Function, unknown], unknown][] | [[Function]][], onError?: (err: Error, context: Context<E>) => Response | Promise<Response>, onNotFound?: NotFoundHandler<E>, updateRouteIndex?: boolean) => ((context: Context, next?: Next) => Promise<Context>);
//#endregion