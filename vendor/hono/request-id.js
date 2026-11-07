/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/hono@5.0.0-rc.1/dist/middleware/request-id/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
const o=({limitLength:s=255,headerName:e="X-Request-Id",generator:n=()=>crypto.randomUUID()}={})=>async function(r,d){let t=e?r.req.header(e):void 0;(!t||t.length>s||/[^\w\-=]/.test(t))&&(t=n(r)),r.set("requestId",t),e&&r.header(e,t),await d()};export{o as requestId};
