import { Hono } from "hono";
import { Layout } from "./components/Layout.tsx";
import { Counter } from "./components/Counter.tsx";

const app = new Hono();

app.get("/", (c) =>
  c.html(
    <Layout title="JSX, no build">
      <h1>Server-rendered JSX</h1>
      <p>Three .tsx files, stripped and compiled one by one when deployed.</p>
      <Counter start={3} />
    </Layout>,
  ),
);

export default app;
