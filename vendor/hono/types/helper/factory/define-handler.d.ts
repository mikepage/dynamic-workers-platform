import { ContentfulStatusCode } from "../../utils/http-status.js";
import { JSONParsed } from "../../utils/types.js";
import { Env, FormValue, Handler, IntersectNonAnyTypes, MiddlewareHandler, TypedResponse, ValidationTargets } from "../../types.js";
import { Context } from "../../context.js";
import { HtmlEscaped } from "../../utils/html.js";
import { InferInput } from "../../validator/utils.js";
//#region src/helper/factory/define-handler.d.ts
type StandardSchemaIssue = {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | {
    readonly key: PropertyKey;
  }> | undefined;
};
type StandardSchemaResult<Output> = {
  readonly value: Output;
  readonly issues?: undefined;
} | {
  readonly issues: ReadonlyArray<StandardSchemaIssue>;
};
/**
 * The part of the Standard Schema interface used by `defineHandler()`.
 * @see {@link https://standardschema.dev/}
 */
export type StandardSchema<Input = unknown, Output = Input> = {
  readonly '~standard': {
    readonly validate: (value: unknown) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    readonly types?: {
      readonly input: Input;
      readonly output: Output;
    } | undefined;
  };
};
type AnyStandardSchema = StandardSchema<any, any>;
type AnyResponse = Response | TypedResponse<any, any, any>;
/**
 * A Standard Schema or a validation function for `Value`.
 * `T` is the schema itself, or the output of the function. It is `never` when not specified.
 */
type Validation<Value, T> = (T & AnyStandardSchema) | ((value: Value, c: Context<any, any, any>) => T | Promise<T>);
type ResponseValidation<In, Out> = (Out & StandardSchema<In, any>) | ((value: In, c: Context<any, any, any>) => Out | Promise<Out>);
/**
 * A Response the handler can return. A JSON Response by `c.json()` is not accepted,
 * because it bypasses the response validation. Return the value instead.
 */
type NonJSONResponse = Response & {
  readonly _format?: 'text' | 'redirect' | 'body';
};
type InputOf<T> = T extends StandardSchema<infer I, any> ? I : Exclude<T, AnyResponse>;
type OutputOf<T> = T extends StandardSchema<any, infer O> ? O : Exclude<T, AnyResponse>;
type RequestTarget = keyof ValidationTargets;
type Targets = { [K in RequestTarget]: unknown; };
type ValidatedTarget<T extends Targets> = { [K in RequestTarget]: [T[K]] extends [never] ? never : K; }[RequestTarget];
type ValidatedInput<T extends Targets> = {
  in: { [K in ValidatedTarget<T>]: K extends 'json' ? InputOf<T[K]> : InferInput<InputOf<T[K]>, K, FormValue>; };
  out: { [K in ValidatedTarget<T>]: OutputOf<T[K]>; };
};
/** The validated values, passed to the handler as the second argument */
type HandlerInput<T extends Targets> = { [K in ValidatedTarget<T>]: OutputOf<T[K]>; };
type JSONResponseOf<T> = Response & TypedResponse<JSONParsed<T>, ContentfulStatusCode, 'json'>;
/** The Response that `toResponse()` converts a returned value to */
type ConvertedResponse<R> = [unknown] extends [R] ? Response : R extends AnyResponse ? R : R extends null | undefined | void ? Response & TypedResponse<null, 204, 'body'> : R extends string | HtmlEscaped ? Response : JSONResponseOf<R>;
type AnyMiddleware = MiddlewareHandler<any, any, any>;
type MiddlewareEnvs<M extends AnyMiddleware[]> = { [K in keyof M]: M[K] extends MiddlewareHandler<infer ME, any, any> ? ME : never; };
/**
 * An issue in the failure response. `path` is dot-joined, e.g. `user.email`.
 * The input value is not included.
 */
export type ValidationIssue = {
  message: string;
  path?: string;
};
/** The issues of one validation target in the failure response */
export type ValidationFailure = {
  slot: RequestTarget | 'response';
  issues: ValidationIssue[];
};
type ValidatedHandlerOptions<Param, Query, Header, Cookie, Form, Json, ResponseIn, ResponseOut> = {
  param?: Validation<ValidationTargets['param'], Param>;
  query?: Validation<ValidationTargets['query'], Query>;
  header?: Validation<ValidationTargets['header'], Header>;
  cookie?: Validation<ValidationTargets['cookie'], Cookie>;
  form?: Validation<ValidationTargets['form'], Form>;
  json?: Validation<ValidationTargets['json'], Json>;
  response?: ResponseValidation<ResponseIn, ResponseOut>;
};
type ValidatedHandler<E extends Env, P extends string, T extends Targets, ResponseOut, R> = Handler<E, P, ValidatedInput<T>, Promise<[ResponseOut] extends [never] ? ConvertedResponse<Awaited<R>> : JSONResponseOf<OutputOf<ResponseOut>>>>;
export interface DefineHandler<E extends Env, P extends string> {
  /**
   * Defines a handler, with middleware before it. The returned value is converted to a Response.
   */
  <E2 extends Env = E, P2 extends string = P, M extends AnyMiddleware[] = [], R = unknown>(...args: [...middleware: M, handler: (c: Context<IntersectNonAnyTypes<[E2, ...MiddlewareEnvs<M>]>, P2>) => R]): Handler<E2, P2, {}, Promise<ConvertedResponse<Awaited<R>>>>;
  /**
   * Defines a handler with request and response validation, with middleware before it.
   */
  <Param = never, Query = never, Header = never, Cookie = never, Form = never, Json = never, ResponseIn = unknown, ResponseOut = never, T extends Targets = {
    param: Param;
    query: Query;
    header: Header;
    cookie: Cookie;
    form: Form;
    json: Json;
  }>(options: ValidatedHandlerOptions<Param, Query, Header, Cookie, Form, Json, ResponseIn, ResponseOut>): <E2 extends Env = E, P2 extends string = P, M extends AnyMiddleware[] = [], R extends ResponseIn | NonJSONResponse | Promise<ResponseIn | NonJSONResponse> = ResponseIn>(...args: [...middleware: M, handler: (c: Context<IntersectNonAnyTypes<[E2, ...MiddlewareEnvs<M>]>, P2, ValidatedInput<T>>, input: HandlerInput<T>) => R]) => ValidatedHandler<E2, P2, T, ResponseOut, R>;
}
/**
 * `defineHandler()` defines a handler. A value returned from the handler is converted to a
 * Response: an object is returned as JSON, a string or JSX as HTML, and `null` or `undefined`
 * as `204 No Content`. A `Response` is returned as is. The status is set with `c.status()`, and
 * it is not in the types. Return `c.json()` to have the status in the types.
 *
 * With options, each request target (`param`, `query`, `json`, `form`, `header`, `cookie`)
 * is validated before the handler runs. The validated values are passed to the handler as
 * the second argument, and are also available through `c.req.valid()`.
 * A value returned from the handler is validated with `response` and returned as JSON.
 *
 * Each validation accepts a Standard Schema or a validation function.
 * When a Standard Schema fails, an `HTTPException` is thrown with status 400 for the request
 * and 500 for the response, so `onError` can handle it. Its `res` is a JSON response of
 * `{ error, issues }`, and its `cause` is `{ issues }` with the raw Standard Schema issues.
 *
 * Middleware passed before the handler runs first, around the validation. Its Env flows into
 * the handler, so `c.get()` is typed. Otherwise, use `createFactory<Env>().defineHandler`, or
 * pass the Env and the path as type arguments.
 *
 * @see {@link https://hono.dev/docs/helpers/factory#definehandler}
 *
 * @experimental
 * `defineHandler()` is an experimental feature.
 * The API might be changed.
 *
 * @example
 * ```ts
 * app.get('/ping', defineHandler(() => ({ pong: true })))
 * app.get('/me', defineHandler(auth, (c) => c.get('user')))
 *
 * app.post(
 *   '/users/:id',
 *   defineHandler({
 *     param: ParamSchema,
 *     json: BodySchema,
 *     response: UserSchema,
 *   })(async (c, { param, json }) => {
 *     c.status(201)
 *     return { id: param.id, ...json }
 *   })
 * )
 * ```
 */
export declare const defineHandler: DefineHandler<any, any>;
//#endregion
export {};
