# Security

## Reporting a vulnerability

Please do not open a public issue. Email bjonimerkuri1@gmail.com with a description, steps to reproduce and the impact. You will get a reply within a few days.

## Threat model

DesignLoop sends images you upload to a model provider and runs code that the model writes. The risks and the controls are:

| Risk | Control |
|---|---|
| Text inside a design tries to steer the model (prompt injection) | Prompts state that image text is content, never instructions. An eval fixture contains such text and the suite reports the result. |
| Generated code uses dangerous APIs | A static check rejects `eval`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, `fetch`, `XMLHttpRequest`, `WebSocket`, browser storage, `window.open`, location changes and Angular security bypasses before anything is built. |
| Generated code imports packages or reads files | Imports are limited to an allow list per framework and checked before bundling. CSS cannot use `@import` or non-data `url()`. |
| Generated code calls the network | The render browser aborts every http and https request. |
| Generated code attacks the host | Optional per-render Docker sandbox: no network, read-only filesystem, resource limits, no capabilities (`SANDBOX=docker`). |
| Malformed or oversized uploads | PNG or JPEG only, header check, size limits, full decode and re-encode to PNG (drops metadata), and a check that the header matches the content. |
| A visitor spends the owner's key | The server key can be turned off (`ALLOW_SERVER_KEY=false`, and off by default in demo mode). Visitors then bring their own key. |
| A user's own key leaks through the server | The key is sent in headers, held in memory for one run, never stored, logged or sent to error reporting. Errors are redacted of key-like strings. The vault cannot be printed or serialized. |
| The key field is used to reach internal addresses (SSRF) | Only three fixed provider endpoints are used. The client cannot supply a URL, and the model name is checked against a strict pattern. |
| The key check is used as a proxy | It reaches only the fixed provider endpoints, sends a fixed prompt, and is limited to 10 checks per hour per IP. |
| Secrets committed to git | `npm run check:secrets` scans tracked files for key formats and tracked `.env` files, in CI and as an optional pre-commit hook. |
| Cost abuse on a public instance | Per-IP hourly limit, daily cost cap, per-run cost, time and iteration budgets. |
| Path traversal in file endpoints | Run ids and file names are matched against strict patterns before any file access. |

## Static demo

The static build contains no server, key or database. `apps/web/public/_headers` adds a Content-Security-Policy that allows only same-origin resources and no outgoing connections, plus the usual headers. Saved runs and eval reports are public files, so export only designs and results you are happy to publish.

## Not covered

- Without `SANDBOX=docker`, the renderer runs in the same process tree as the API. For a public instance, enable the sandbox and restrict the API host's outbound network to the model provider.
- A personal key in browser storage can be read by a script running on the page or by a browser extension. There are no inline user-content features, but there is no Content-Security-Policy yet, and the key is only as safe as the device and the connection. Use https and do not remember the key on a shared computer.
- There is no user authentication. `/metrics` can be protected with `ADMIN_TOKEN`, and public runs are limited with `DEMO_MODE`. Put a gateway in front for anything stricter.
