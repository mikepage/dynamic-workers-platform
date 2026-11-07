/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/hono@5.0.0-rc.1/dist/middleware/logger/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
function i(e){if(e&&"NO_COLOR"in e)return!1;const{process:o,Deno:n}=globalThis;return!(typeof n?.noColor=="boolean"?n.noColor:"NO_COLOR"in(o?.env??{}))}const m=e=>{const[o,n]=[",","."];return e.map(r=>r.replace(/(\d)(?=(\d\d\d)+(?!\d))/g,"$1"+o)).join(n)},d=e=>{const o=Date.now()-e;return m([o<1e3?o+"ms":Math.round(o/1e3)+"s"])},u=(e,o)=>{if(o)switch(e/100|0){case 5:return`\x1B[31m${e}\x1B[0m`;case 4:return`\x1B[33m${e}\x1B[0m`;case 3:return`\x1B[36m${e}\x1B[0m`;case 2:return`\x1B[32m${e}\x1B[0m`}return`${e}`},$=(e=console.log)=>async function(n,r){const{method:t,url:c}=n.req,s=c.slice(c.indexOf("/",8));e(`<-- ${t} ${s}`);const a=Date.now();await r();const l=d(a);e(`--> ${t} ${s} ${u(n.res.status,i(n.env))} ${l}`)};export{$ as logger};
