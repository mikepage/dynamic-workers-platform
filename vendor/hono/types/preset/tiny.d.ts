import { BlankEnv, BlankSchema, Env, Schema } from "../types.js";
import { HonoBase as Hono$1, HonoOptions } from "../hono-base.js";
//#region src/preset/tiny.d.ts
export declare class Hono<E extends Env = BlankEnv, S extends Schema = BlankSchema, BasePath extends string = '/'> extends Hono$1<E, S, BasePath> {
  constructor(options?: HonoOptions<E>);
}
//#endregion