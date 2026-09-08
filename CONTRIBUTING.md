# Contributing to oraculo-financeiro

Thanks for your interest. Quick guide for filing issues and opening pull requests.

---

## Before you start

1. **Read the [README](./README.md)** — it covers what the app does, the architecture, and how to deploy your own fork.
2. **Read [SECURITY.md](./SECURITY.md)** — for security reports, do NOT open a public issue.
3. **Check existing issues** before opening a new one.
4. **Read [INBOUND.md](./INBOUND.md)** before submitting copyrightable material.

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
npm run lint                 # ESLint
npm run biome                # Biome lint and format
npm test                     # Vitest
npm run build                # TypeScript and Vite
npm run format:public:check   # Prettier HTML check
```

All five checks must be GREEN. CI repeats them on pull requests to `main`;
Deploy repeats them before publishing a push to `main` or an authorized manual
run. The standalone Public Format workflow is retired, while its official
Prettier HTML check remains in normal CI. Custom legal-inventory and artifact
gates are retired. Review the complete static browser and Pages Functions
notices and their public copies when dependencies or distribution surfaces change;
they are not automatically regenerated or verified on every release.

### PR description

Include what changed, why, how you tested. Public surface changes (UI, API response shape, D1 schema) need careful review.

### Action pinning

This repo enforces SHA-pinned GitHub Actions. Don't downgrade pinned actions to floating tags. Dependabot opens version-bump PRs with new SHAs + tag comments.

---

## License

The project license remains [AGPL-3.0-or-later](./LICENSE). Read
[INBOUND.md](./INBOUND.md) for the ownership and written-rights verification
required before copyrightable contributions are admitted. Opening a PR does not
transfer copyright. AGPL §13 applies to network-service operators of modified
forks under its terms.

---

## Code of Conduct

By participating, you agree to follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) (Contributor Covenant 3.0). Report conduct violations to `conductcode@lcv.dev`. For general contribution support, contact `chamados@lcv.dev`.

---

## Maintainer

Single maintainer: [@example-beneficiary](https://github.com/example-beneficiary). Response time best-effort.
