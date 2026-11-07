import type { Child } from "hono/jsx";

type Props = { title: string; children?: Child };

export const Layout = ({ title, children }: Props) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>{title}</title>
    </head>
    <body style="font-family: system-ui; max-width: 40rem; margin: 3rem auto">{children}</body>
  </html>
);
