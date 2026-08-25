# Contributing to oraculo-financeiro

Thanks for your interest. Quick guide for filing issues and opening pull requests.

---

## Before you start

1. **Read the [README](./README.md)** — it covers what the app does, the architecture, and how to deploy your own fork.
2. **Read [SECURITY.md](./SECURITY.md)** — for security reports, do NOT open a public issue.
3. **Check existing issues** before opening a new one.

---

## Filing issues

- **Bug reports**: include steps to reproduce, the URL/route hit, the expected vs actual behavior, and (if applicable) browser console / network errors.
- **Feature requests**: explain the use case and why it doesn't fit a downstream fork.
- **Documentation gaps**: open an issue or a PR directly.

---

## Opening a pull request

### Local gates

```bash
npm ci
npm run lint    # biome check
npm run build   # tsc + vite build
npm test        # vitest
```

All gates must be GREEN. CI will re-run these on push.

### PR description

Include what changed, why, how you tested. Public surface changes (UI, API response shape, D1 schema) need careful review.

### Action pinning

This repo enforces SHA-pinned GitHub Actions. Don't downgrade pinned actions to floating tags. Dependabot opens version-bump PRs with new SHAs + tag comments.

---

## License

By contributing, you agree your contribution is licensed under [AGPL-3.0-or-later](./LICENSE). AGPL §13 applies to network-service operators of forks.

---

## Code of Conduct

By participating, you agree to follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) (Contributor Covenant 3.0). Report conduct violations to `conductcode@lcv.dev`. For general contribution support, contact `chamados@lcv.dev`.

---

## Maintainer

Single maintainer: [@example-beneficiary](https://github.com/example-beneficiary). Response time best-effort.
