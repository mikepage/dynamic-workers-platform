import { Hono } from "hono";
import { marked } from "marked";
import { z } from "zod";

// Two npm packages the platform doesn't provide. Only the bundle path can resolve them.
const Post = z.object({ title: z.string().min(1), body: z.string() });

const app = new Hono();

app.post("/", async (c) => {
  const post = Post.safeParse(await c.req.json());
  if (!post.success) return c.json({ error: post.error.issues[0]?.message }, 400);
  return c.html(`<h1>${post.data.title}</h1>${await marked.parse(post.data.body)}`);
});

export default app;
