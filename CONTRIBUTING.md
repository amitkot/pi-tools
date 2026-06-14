# Contributing

Contributions are welcome, especially small, focused improvements to Pi extensions in this repository.

## Development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run check
npm test
```

## Repository layout

```text
packages/
  safe-github/
    src/index.ts
    README.md
    package.json
.pi/extensions/
  safe-github/
    index.ts   # local development shim
```

Add new Pi plugins under `packages/<plugin-name>/` with their own `package.json`, `README.md`, and `src/index.ts`.

## Pull requests

Keep pull requests narrow:

- one extension or concern per PR
- explain the problem being solved
- include verification steps
- avoid unrelated formatting changes

## Security-sensitive changes

Extensions run with host permissions. For changes that execute commands, access credentials, or call network APIs, document:

- the exact command/API surface exposed to the model
- why it is narrow enough
- mutation/approval behavior
- what is intentionally not exposed
