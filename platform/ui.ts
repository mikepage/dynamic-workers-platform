import { html, raw } from "hono/html";
import type { AppSummary } from "./registry.ts";

const STARTER = `import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) =>
  c.html(
    <main style="font-family: system-ui; max-width: 40rem; margin: 3rem auto">
      <h1>Hello from TypeScript</h1>
      <p>Deployed as text. No build step.</p>
    </main>,
  ),
);

export default app;
`;

// The platform's one page: deployed apps and an editor that deploys index.tsx.
export const ui = (apps: AppSummary[]) => html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>vibe platform</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { max-width: 900px; margin: 0 auto; padding: 1rem; }
      textarea { width: 100%; height: 22rem; font: 13px/1.5 ui-monospace, monospace; }
      input, button { font: inherit; padding: 0.4rem 0.7rem; }
      a { color: #0066cc; }
      pre { white-space: pre-wrap; }
      li { padding: 0.2rem 0; }
    </style>
  </head>
  <body>
    <h1>vibe platform</h1>
    <p>Deploy TypeScript as text. workerd runs it in its own isolate at <code>&lt;name&gt;.localhost</code>.</p>

    <h2>Apps</h2>
    ${apps.length
      ? html`<ul>${apps.map(
          (a) => html`<li><a href="//${a.name}.localhost:8080/">${a.name}</a> v${a.version} · ${a.updated}
            · <a href="#" data-edit="${a.name}">edit</a></li>`,
        )}</ul>`
      : html`<p>None yet.</p>`}

    <h2>Deploy</h2>
    <p><input id="name" value="hello" aria-label="App name"> <button id="deploy">Deploy index.tsx</button></p>
    <textarea id="code" spellcheck="false" aria-label="index.tsx">${STARTER}</textarea>
    <pre id="out"></pre>

    <script type="module">${raw(`
      const $ = (id) => document.getElementById(id);
      $("deploy").onclick = async () => {
        $("out").textContent = "Deploying…";
        const res = await fetch("/api/apps/" + $("name").value, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ files: { "index.tsx": $("code").value } }),
        });
        const body = await res.json();
        $("out").innerHTML = res.ok
          ? "v" + body.version + " live in " + body.stripMs + " ms of stripping: <a href='" + body.url + "'>" + body.url + "</a>"
          : "";
        if (!res.ok) $("out").textContent = body.error;
      };
      document.querySelectorAll("[data-edit]").forEach((a) => a.onclick = async (e) => {
        e.preventDefault();
        const { files } = await (await fetch("/api/apps/" + a.dataset.edit)).json();
        $("name").value = a.dataset.edit;
        $("code").value = files["index.tsx"] ?? files["index.ts"] ?? Object.values(files)[0];
      });
    `)}</script>
  </body>
</html>`;
