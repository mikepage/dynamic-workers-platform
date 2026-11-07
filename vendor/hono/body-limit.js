/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/hono@5.0.0-rc.1/dist/middleware/body-limit/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var f=class extends Error{res;status;constructor(r=500,s){super(s?.message,{cause:s?.cause}),this.res=s?.res,this.status=r}getResponse(){return this.res?new Response(this.res.body,{status:this.status,headers:this.res.headers}):new Response(this.message,{status:this.status})}};const g="Payload Too Large",R=r=>{const s=r.onError||(()=>{const u=new Response(g,{status:413});throw new f(413,{res:u})}),o=r.maxSize;return async function(e,n){if(!e.req.raw.body)return n();const d=e.req.raw.headers.has("transfer-encoding");if(e.req.raw.headers.has("content-length")&&!d)return parseInt(e.req.raw.headers.get("content-length")||"0",10)>o?s(e):n();let h=0;const i=[],c=e.req.raw.body.getReader();for(;;){const{done:t,value:a}=await c.read();if(t)break;if(h+=a.length,h>o)return s(e);i.push(a)}const w={body:new ReadableStream({start(t){for(const a of i)t.enqueue(a);t.close()}}),duplex:"half"};return e.req.raw=new Request(e.req.raw,w),n()}};export{R as bodyLimit};
