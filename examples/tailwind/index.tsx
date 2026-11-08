import brand from "./brand.ts";
import { Hono } from "hono";
import styles from "./styles.css";
import { tailwind } from "./tailwind.ts";

const app = new Hono();

app.use(tailwind({ css: styles, plugins: { "./brand.ts": brand } }));

const features = [
  ["@theme", "bg-brand and font-display come from this app's own theme."],
  ["@apply", "The button below is .btn, built from utilities."],
  ["@plugin", "callout and text-shadow-lg come from a local plugin."],
];

app.get("/", (c) =>
  c.html(
    <html lang="en" class={c.req.query("dark") !== undefined ? "dark" : ""}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Tailwind in a Dynamic Worker</title>
      </head>
      <body class="min-h-screen bg-slate-50 font-display text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <main class="content-auto mx-auto max-w-3xl px-6 py-16">
          <p class="text-sm font-semibold tracking-wide text-brand uppercase">Hono + Tailwind v4</p>
          <h1 class="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Styled without a build step</h1>
          <ul class="mt-10 grid gap-4 sm:grid-cols-3">
            {features.map(([title, body]) => (
              <li class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                <h2 class="font-mono text-sm font-semibold text-brand">{title}</h2>
                <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">{body}</p>
              </li>
            ))}
          </ul>
          <section class="mt-12 space-y-4">
            <h2 class="text-2xl font-semibold text-shadow-lg">Rendered, then styled</h2>
            <p class="leading-7 text-slate-700 dark:text-slate-300">
              The middleware reads the class names from this HTML and asks Tailwind's compiler for exactly that CSS.{" "}
              <code class="font-mono text-sm">tailwindcss</code> is plain JavaScript, so it runs here.
            </p>
            <p class="callout">No Node, no PostCSS, no Oxide.</p>
          </section>
          <a href="?dark" class="btn mt-10">
            Dark mode
          </a>
        </main>
      </body>
    </html>,
  ),
);

export default app;
