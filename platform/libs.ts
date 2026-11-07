// Libraries every app can import by their npm names. The platform embeds them as text
// (see config.capnp) and hands them to each app's Worker Loader call, so apps need no
// node_modules and no bundler.
import hono from "lib/hono";
import honoBodyLimit from "lib/hono/body-limit";
import honoCookie from "lib/hono/cookie";
import honoCors from "lib/hono/cors";
import honoCsrf from "lib/hono/csrf";
import honoEtag from "lib/hono/etag";
import honoFactory from "lib/hono/factory";
import honoHtml from "lib/hono/html";
import honoHttpException from "lib/hono/http-exception";
import honoJsx from "lib/hono/jsx";
import honoJsxRuntime from "lib/hono/jsx/jsx-runtime";
import honoLogger from "lib/hono/logger";
import honoRequestId from "lib/hono/request-id";
import honoSecureHeaders from "lib/hono/secure-headers";
import honoStreaming from "lib/hono/streaming";
import honoTiming from "lib/hono/timing";
import honoValidator from "lib/hono/validator";

export const libs: Record<string, { js: string }> = Object.fromEntries(
  Object.entries({
    hono,
    "hono/body-limit": honoBodyLimit,
    "hono/cookie": honoCookie,
    "hono/cors": honoCors,
    "hono/csrf": honoCsrf,
    "hono/etag": honoEtag,
    "hono/factory": honoFactory,
    "hono/html": honoHtml,
    "hono/http-exception": honoHttpException,
    "hono/jsx": honoJsx,
    "hono/jsx/jsx-runtime": honoJsxRuntime,
    "hono/logger": honoLogger,
    "hono/request-id": honoRequestId,
    "hono/secure-headers": honoSecureHeaders,
    "hono/streaming": honoStreaming,
    "hono/timing": honoTiming,
    "hono/validator": honoValidator,
  }).map(([name, js]) => [name, { js }]),
);
