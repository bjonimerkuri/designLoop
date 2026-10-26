# Contributing

## Setup

Follow the setup in the README, then run `npm test` and `npm run lint` before you push.

## Pull requests

- Keep a change focused. One idea per pull request.
- Add or update tests for behavior you change. The agent loop is tested with a fake model and a fake renderer, so most logic needs no browser or API key.
- If you change prompts, tools or the loop, run `npm run eval -- --limit 3` and put the numbers in the description. Quality changes need evidence.
- Write commits in the imperative: "Add budget check", not "Added".

## Layout rules

- `packages/agent-core` has no dependency on the API or the web app.
- `packages/shared` holds types only, so every app can depend on it.
- Code in this repository has no comments. Names and tests carry the explanation, and decisions go in `docs/decisions`.
