/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/hono@5.0.0-rc.1/dist/middleware/csrf/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var f=class extends Error{res;status;constructor(t=500,r){super(r?.message,{cause:r?.cause}),this.res=r?.res,this.status=t}getResponse(){return this.res?new Response(this.res.body,{status:this.status,headers:this.res.headers}):new Response(this.message,{status:this.status})}};const l=["same-origin","same-site","none","cross-site"],c=t=>l.includes(t),d=/^(GET|HEAD|OPTIONS)$/,w=/^\b(application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)\b/i,h=t=>{const r=(s=>s?typeof s=="string"?e=>e===s:typeof s=="function"?s:e=>s.includes(e):(e,n)=>e===new URL(n.req.url).origin)(t?.origin),a=async(s,e)=>s===void 0?!1:await r(s,e),i=(s=>s?typeof s=="string"?e=>e===s:typeof s=="function"?s:e=>s.includes(e):e=>e==="same-origin")(t?.secFetchSite),u=async(s,e)=>s===void 0||!c(s)?!1:await i(s,e);return async function(e,n){if(!d.test(e.req.method)&&w.test(e.req.header("content-type")||"text/plain")&&!await u(e.req.header("sec-fetch-site"),e)&&!await a(e.req.header("origin"),e)){const o=new Response("Forbidden",{status:403});throw new f(403,{res:o})}await n()}};export{h as csrf};
