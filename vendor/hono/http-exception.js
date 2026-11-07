/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/hono@5.0.0-rc.1/dist/http-exception.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var t=class extends Error{res;status;constructor(e=500,s){super(s?.message,{cause:s?.cause}),this.res=s?.res,this.status=e}getResponse(){return this.res?new Response(this.res.body,{status:this.status,headers:this.res.headers}):new Response(this.message,{status:this.status})}};export{t as HTTPException};
