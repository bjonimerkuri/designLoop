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
| Cost abuse on a public instance | Per-IP hourly limit, daily cost cap, per-run cost, time and iteration budgets. |
| Path traversal in file endpoints | Run ids and file names are matched against strict patterns before any file access. |

## Not covered

- Without `SANDBOX=docker`, the renderer runs in the same process tree as the API. For a public instance, enable the sandbox and restrict the API host's outbound network to the model provider.
- There is no user authentication. `/metrics` can be protected with `ADMIN_TOKEN`, and public runs are limited with `DEMO_MODE`. Put a gateway in front for anything stricter.
