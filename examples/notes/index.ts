import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { NoteStore, Priority, type Note } from "./store.ts";

const store = new NoteStore();
const app = new Hono();

app.get("/", (c) => c.json(store.all()));

app.post(
  "/",
  validator("json", (value): Pick<Note, "text" | "priority"> => {
    const text = typeof value.text === "string" ? value.text.trim() : "";
    if (!text) throw new HTTPException(400, { message: "text is required" });
    const priority = Object.values(Priority).includes(value.priority) ? value.priority : Priority.Normal;
    return { text, priority };
  }),
  (c) => c.json(store.add(c.req.valid("json")), 201),
);

export default app;
