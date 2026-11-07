import { BuildError, type Files } from "./bundle.ts";

// Workers AI models offered in the builder. All take chat messages.
// Kimi K2.7 Code is code-tuned; Qwen2.5 Coder is smaller and faster.
export const MODELS = [
  "@cf/moonshotai/kimi-k2.7-code",
  "@cf/qwen/qwen2.5-coder-32b-instruct",
];

const MAX_ATTEMPTS = 3;

const SYSTEM = `You write small web apps that run as Cloudflare Workers.

Rules:
- TypeScript. The entry file is index.tsx (or index.ts) and ends with \`export default app\`, where app is a Hono app: import { Hono } from "hono".
- Render HTML with Hono JSX in .tsx files. JSX is already set up for hono/jsx; don't import React.
- Add app.onError((err, c) => c.text(String(err.stack ?? err), 500)).
- The app has no network access, no bindings and no database. Keep state in memory.
- The app is served under a path prefix, so use relative URLs (no leading slash) in links, forms and fetch calls.
- Import only "hono", "hono/...", relative files, and packages listed in package.json. Add a package.json only when you need more than hono, and keep "hono": "5.0.0-rc.1" in it.
- Put inline <style> in the page. No external CSS or scripts.

Reply with each file you add or change, in full, in its own fenced block whose info string is the file name:

\`\`\`index.tsx
...
\`\`\`

No other text.`;

type Message = { role: "system" | "user" | "assistant"; content: string };
export type Step = { step: "generate" | "deploy" | "error"; attempt: number; ms?: number; files?: string[]; message?: string };

const FENCE = /```[^\n`]*?([\w./-]+\.(?:tsx|ts|jsx|js|json))[^\n]*\n([\s\S]*?)\n```/g;

export function parseFiles(text: string): Files {
  const files: Files = {};
  for (const [, name, body] of text.matchAll(FENCE)) files[name.replace(/^\.?\//, "")] = body;
  return files;
}

const render = (files: Files) =>
  Object.entries(files).map(([name, body]) => `\`\`\`${name}\n${body}\n\`\`\``).join("\n\n");

function replyText(out: unknown): string {
  const o = out as { response?: unknown; choices?: { message?: { content?: string } }[] };
  if (typeof o.response === "string") return o.response;
  if (o.choices?.[0]?.message?.content) return o.choices[0].message.content;
  return JSON.stringify(out);
}

// Prompt in, deployed app out. Every failure (no files, build error, missing package,
// a crash on the first request) goes back to the model as the next message.
export async function generate<T>(
  ai: Ai,
  opts: { prompt: string; model: string; current: Files | null },
  deploy: (files: Files) => Promise<T>,
): Promise<{ files: Files; result: T; steps: Step[] }> {
  const messages: Message[] = [{ role: "system", content: SYSTEM }];
  if (opts.current) messages.push({ role: "user", content: `The app's current files:\n\n${render(opts.current)}` });
  messages.push({ role: "user", content: opts.prompt });

  let files: Files = { ...(opts.current ?? {}) };
  const steps: Step[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const start = performance.now();
    const text = replyText(await ai.run(opts.model as keyof AiModels, { messages, max_tokens: 8192 } as never));
    const changed = parseFiles(text);
    steps.push({ step: "generate", attempt, ms: Math.round(performance.now() - start), files: Object.keys(changed) });
    messages.push({ role: "assistant", content: text });

    if (Object.keys(changed).length === 0) {
      steps.push({ step: "error", attempt, message: "no files in the reply" });
      messages.push({ role: "user", content: "Your reply had no files. Reply with each file in its own fenced block whose info string is the file name." });
      continue;
    }
    files = { ...files, ...changed };
    try {
      const deployStart = performance.now();
      const result = await deploy(files);
      steps.push({ step: "deploy", attempt, ms: Math.round(performance.now() - deployStart) });
      return { files, result, steps };
    } catch (e) {
      if (!(e instanceof BuildError)) throw e;
      steps.push({ step: "error", attempt, message: e.message });
      messages.push({ role: "user", content: `That failed:\n\n${e.message}\n\nFix it. Reply with each file you change, in full.` });
    }
  }
  throw Object.assign(new BuildError(`no working app after ${MAX_ATTEMPTS} attempts`), { steps, files });
}
