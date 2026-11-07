import { WorkerEntrypoint } from "cloudflare:workers";

type Env = { CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_API_TOKEN?: string };

// The AI binding for self-hosted workerd. On Cloudflare, env.AI is the real Workers AI
// binding. workerd has no such binding, so config.capnp points AI at this entrypoint,
// which has the same run() and calls the Workers AI REST API instead.
export class WorkersAI extends WorkerEntrypoint<Env> {
  async run(model: string, input: unknown): Promise<unknown> {
    const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = this.env;
    if (!account || !token) {
      throw new Error("Workers AI needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env");
    }
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await res.json<{ success: boolean; result: unknown; errors?: { message: string }[] }>();
    if (!res.ok || !body.success) {
      throw new Error(`Workers AI ${res.status}: ${body.errors?.map((e) => e.message).join("; ") ?? "request failed"}`);
    }
    return body.result;
  }
}
