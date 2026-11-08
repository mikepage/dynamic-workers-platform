import { html, raw } from "hono/html";
export type AppSummary = { name: string; version: number; updated: string };

// Start on a new app; existing ones are in the name field's list.
const freshName = (apps: AppSummary[]) => {
  const taken = new Set(apps.map((a) => a.name));
  let n = 1;
  while (taken.has(n === 1 ? "hello" : `hello-${n}`)) n++;
  return n === 1 ? "hello" : `hello-${n}`;
};

// The builder: prompt on the left, the running app on the right.
export const ui = (apps: AppSummary[], models: string[]) => html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dynamic Workers builder</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: light-dark(#fff, #111);
        --subtle: light-dark(#f5f5f5, #1b1b1b);
        --border: light-dark(#ddd, #333);
        --muted: light-dark(#666, #999);
        --brand: light-dark(#0066cc, #4d9fff);
        --bad: light-dark(#b00020, #ff6b81);
        font: 14px/1.5 system-ui, sans-serif;
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); height: 100vh; display: grid; grid-template-columns: minmax(340px, 30rem) 1fr; }
      aside { border-right: 1px solid var(--border); padding: 1rem; overflow: auto; display: flex; flex-direction: column; gap: 0.75rem; }
      main { display: grid; grid-template-rows: auto 1fr; min-width: 0; }
      h1 { font-size: 1rem; margin: 0; }
      label { display: grid; gap: 0.25rem; color: var(--muted); font-size: 12px; }
      input, select, textarea, button { font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.45rem 0.6rem; }
      textarea { resize: vertical; }
      #prompt { min-height: 7rem; }
      button { cursor: pointer; }
      button.primary { background: var(--brand); border-color: var(--brand); color: #fff; font-weight: 600; }
      button:disabled { opacity: 0.6; cursor: wait; }
      .row { display: flex; gap: 0.5rem; align-items: end; }
      .row > :first-child { flex: 1; }
      ol { margin: 0; padding-left: 1.2rem; font-size: 13px; }
      ol li.error { color: var(--bad); white-space: pre-wrap; }
      #status { font-size: 13px; color: var(--muted); min-height: 1.2em; }
      #status.bad { color: var(--bad); }
      .tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; }
      .tabs button { padding: 0.2rem 0.5rem; font: 12px ui-monospace, monospace; }
      .tabs button.on { border-color: var(--brand); color: var(--brand); }
      #code { font: 12px/1.5 ui-monospace, monospace; min-height: 16rem; background: var(--subtle); white-space: pre; }
      .bar { display: flex; gap: 0.75rem; align-items: center; padding: 0.5rem 1rem; border-bottom: 1px solid var(--border); font-size: 13px; }
      .bar a { color: var(--brand); }
      iframe { border: 0; width: 100%; height: 100%; background: #fff; }
      .empty { display: grid; place-items: center; color: var(--muted); }
      @media (max-width: 800px) {
        body { grid-template-columns: 1fr; height: auto; }
        aside { border-right: 0; border-bottom: 1px solid var(--border); }
        iframe, .empty { min-height: 70vh; }
      }
    </style>
  </head>
  <body>
    <aside>
      <h1>Dynamic Workers builder</h1>
      <div class="row">
        <label>App
          <input id="name" list="apps" value="${freshName(apps)}" pattern="[a-z0-9-]{1,32}" autocomplete="off">
          <datalist id="apps">${apps.map((a) => html`<option value="${a.name}">v${a.version}</option>`)}</datalist>
        </label>
        <button id="delete" title="Delete this app">Delete</button>
      </div>
      <label>Model
        <select id="model">${models.map((m) => html`<option>${m}</option>`)}</select>
      </label>
      <label>Prompt
        <textarea id="prompt" placeholder="A todo list with priorities and a filter"></textarea>
      </label>
      <button id="build" class="primary">Build</button>
      <div id="status"></div>
      <ol id="steps"></ol>
      <div class="tabs" id="tabs"></div>
      <textarea id="code" spellcheck="false" aria-label="File contents" hidden></textarea>
      <button id="deploy" hidden>Deploy edits</button>
    </aside>
    <main>
      <div class="bar"><span id="where">No app yet</span> <a id="open" target="_blank" hidden>Open ↗</a></div>
      <iframe id="preview" title="App preview" hidden></iframe>
      <div class="empty" id="empty">Describe an app and press Build.</div>
    </main>

    <script type="module">${raw(`
      const $ = (id) => document.getElementById(id);
      let files = {};
      let current = null;

      const status = (text, bad = false) => { $("status").textContent = text; $("status").className = bad ? "bad" : ""; };

      function showSteps(steps = []) {
        $("steps").innerHTML = "";
        for (const s of steps) {
          const li = document.createElement("li");
          if (s.step === "generate") li.textContent = "Attempt " + s.attempt + ": model wrote " + (s.files.join(", ") || "no files") + " in " + (s.ms / 1000).toFixed(1) + " s";
          if (s.step === "deploy") li.textContent = "Built, started and answered GET / in " + s.ms + " ms";
          if (s.step === "error") { li.className = "error"; li.textContent = s.message; }
          $("steps").append(li);
        }
      }

      function showFiles(next) {
        files = next || {};
        const names = Object.keys(files).sort();
        if (!names.includes(current)) current = names.find((n) => n.startsWith("index.")) || names[0] || null;
        $("tabs").innerHTML = "";
        for (const n of names) {
          const b = document.createElement("button");
          b.textContent = n;
          b.className = n === current ? "on" : "";
          b.onclick = () => { current = n; showFiles(files); };
          $("tabs").append(b);
        }
        $("code").hidden = $("deploy").hidden = !current;
        if (current) $("code").value = files[current];
      }

      function showApp(name, live) {
        const url = "/apps/" + name + "/";
        $("where").textContent = live ? url : "No app yet";
        $("open").hidden = !live;
        $("open").href = url;
        $("preview").hidden = !live;
        $("empty").hidden = live;
        if (live) $("preview").src = url + "?t=" + Date.now();
      }

      async function loadApp() {
        const name = $("name").value;
        const res = await fetch("/api/apps/" + name);
        const body = res.ok ? await res.json() : { files: {} };
        showFiles(body.files);
        showSteps();
        status("");
        showApp(name, res.ok);
      }

      async function run(button, request, label) {
        button.disabled = true;
        const start = Date.now();
        const tick = setInterval(() => status(label + " " + Math.round((Date.now() - start) / 1000) + " s"), 500);
        try {
          const res = await request();
          const body = await res.json();
          showSteps(body.steps);
          if (body.files) showFiles(body.files);
          if (res.ok) { status("v" + body.version + " live, " + ((Date.now() - start) / 1000).toFixed(1) + " s in total"); showApp(body.name, true); }
          else status(body.error, true);
        } catch (e) {
          status(String(e), true);
        } finally {
          clearInterval(tick);
          button.disabled = false;
        }
      }

      $("build").onclick = () => run($("build"), () => fetch("/api/apps/" + $("name").value + "/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: $("prompt").value, model: $("model").value }),
      }), "Building…");

      $("code").oninput = () => { if (current) files[current] = $("code").value; };

      $("deploy").onclick = () => run($("deploy"), () => fetch("/api/apps/" + $("name").value, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files }),
      }), "Deploying…");

      $("delete").onclick = async () => {
        if (!confirm("Delete " + $("name").value + "?")) return;
        await fetch("/api/apps/" + $("name").value, { method: "DELETE" });
        location.reload();
      };

      $("name").onchange = loadApp;
      $("prompt").onkeydown = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("build").click(); };
      loadApp();
    `)}</script>
  </body>
</html>`;
