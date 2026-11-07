import { Env } from "../../types.js";
import { Hono } from "../../hono.js";
//#region src/helper/dev/index.d.ts
interface InspectRoutesOptions {
  includeInternal?: boolean;
}
interface ShowRoutesOptions extends InspectRoutesOptions {
  verbose?: boolean;
  colorize?: boolean;
}
interface RouteData {
  path: string;
  method: string;
  name: string;
  isMiddleware: boolean;
}
export declare const inspectRoutes: <E extends Env>(hono: Hono<E>, opts?: InspectRoutesOptions) => RouteData[];
export declare const showRoutes: <E extends Env>(hono: Hono<E>, opts?: ShowRoutesOptions) => void;
export declare const getRouterName: <E extends Env>(app: Hono<E>) => string;
//#endregion
export {};
