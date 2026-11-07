//#region src/utils/buffer.d.ts
/**
 * @module
 * Buffer utility.
 */
export declare const equal: (a: ArrayBuffer, b: ArrayBuffer) => boolean;
export type StringHashFunction = (input: string) => string | null | Promise<string | null>;
export declare const timingSafeEqual: (a: string, b: string, hashFunction?: StringHashFunction) => Promise<boolean>;
export declare const bufferToString: (buffer: ArrayBuffer) => string;
export declare const bufferToFormData: (arrayBuffer: ArrayBuffer, contentType: string) => Promise<FormData>;
//#endregion