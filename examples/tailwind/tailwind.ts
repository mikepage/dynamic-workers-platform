import type { MiddlewareHandler } from "hono";
import { compile } from "tailwindcss";
import indexCss from "tailwindcss/index.css";
import preflightCss from "tailwindcss/preflight.css";
import themeCss from "tailwindcss/theme.css";
import utilitiesCss from "tailwindcss/utilities.css";

// Tailwind v4 the way @tailwindcss/postcss runs it, inside a Worker. The compiler is plain
// JavaScript. Two parts are not: the file scanner (Oxide, native) and the minifier
// (Lightning CSS, native). So class names come from the HTML the app renders, and the
// CSS is served unminified.

type Options = {
  // Your stylesheet: @import "tailwindcss", @theme, @utility, @custom-variant, @apply,
  // @source inline(...). Import it as a string: `import css from "./styles.css"`.
  css: string;
  // Other stylesheets your css @imports, by the name it uses.
  stylesheets?: Record<string, string>;
  // Plugins your css loads with @plugin, by name: { "@tailwindcss/typography": typography }.
  plugins?: Record<string, unknown>;
};

const BUILT_IN: Record<string, string> = {
  tailwindcss: indexCss,
  "tailwindcss/index.css": indexCss,
  "tailwindcss/theme": themeCss,
  "tailwindcss/theme.css": themeCss,
  "tailwindcss/preflight": preflightCss,
  "tailwindcss/preflight.css": preflightCss,
  "tailwindcss/utilities": utilitiesCss,
  "tailwindcss/utilities.css": utilitiesCss,
};

const CLASS = /\bclass="([^"]*)"/g;

export function tailwind(options: Options): MiddlewareHandler {
  const sheets = { ...BUILT_IN, ...options.stylesheets };
  let compiler: ReturnType<typeof compile> | undefined;
  const load = () =>
    (compiler ??= compile(options.css, {
      base: "/",
      loadStylesheet: async (id: string) => {
        const content = sheets[id] ?? sheets[id.replace(/^\.\//, "")];
        if (content === undefined) throw new Error(`@import "${id}": pass it in stylesheets`);
        return { path: id, base: "/", content };
      },
      loadModule: async (id: string) => {
        const module = options.plugins?.[id];
        if (module === undefined) throw new Error(`@plugin "${id}": pass it in plugins`);
        return { path: id, base: "/", module };
      },
    }));

  // Adds a <style> with the utilities the page uses. build() remembers every class it
  // has seen, so the CSS grows as pages use more.
  return async (c, next) => {
    await next();
    if (!c.res.headers.get("content-type")?.startsWith("text/html")) return;
    const html = await c.res.text();
    const start = performance.now();
    const candidates = new Set<string>();
    for (const [, list] of html.matchAll(CLASS)) for (const name of list.split(/\s+/)) if (name) candidates.add(name);
    const css = (await load()).build([...candidates]);
    const ms = (performance.now() - start).toFixed(1);
    c.res = new Response(html.replace("</head>", `<style>${css}</style></head>`), c.res);
    c.res.headers.set("x-tailwind", `${candidates.size} classes, ${css.length} bytes, ${ms} ms`);
  };
}
