//#region src/utils/color.d.ts
/**
 * @module
 * Color utility.
 */
/**
 * Get whether color change on terminal is enabled or disabled.
 * If `NO_COLOR` is set in the provided bindings or runtime environment, this function returns `false`.
 * Pass Cloudflare Workers bindings explicitly, for example `getColorEnabled(c.env)`.
 * @see {@link https://no-color.org/}
 *
 * @param {object} [env] - Optional environment bindings to check in addition to the runtime environment.
 * @returns {boolean}
 */
export declare function getColorEnabled(env?: object): boolean;
//#endregion