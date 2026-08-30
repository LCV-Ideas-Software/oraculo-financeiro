# Third-Party Components

| Componente | Versão | Licença Original | Modificado? | Link de Origem |
|------------|--------|------------------|-------------|----------------|
| @biomejs/biome | ^2.5.8 | MIT OR Apache-2.0 | Não | https://registry.npmjs.org/@biomejs/biome |
| @eslint/js | ^10.0.1 | MIT | Não | https://registry.npmjs.org/@eslint/js |
| @types/node | ^26.2.0 | MIT | Não | https://registry.npmjs.org/@types/node |
| @types/react | ^19.2.18 | MIT | Não | https://registry.npmjs.org/@types/react |
| @types/react-dom | ^19.2.4 | MIT | Não | https://registry.npmjs.org/@types/react-dom |
| @types/sanitize-html | ^2.16.1 | MIT | Não | https://registry.npmjs.org/@types/sanitize-html |
| @vitejs/plugin-react | ^6.0.5 | MIT | Não | https://registry.npmjs.org/@vitejs/plugin-react |
| eslint | ^10.8.1 | MIT | Não | https://registry.npmjs.org/eslint |
| eslint-config-prettier | ^10.1.8 | MIT | Não | https://registry.npmjs.org/eslint-config-prettier |
| eslint-plugin-react-hooks | ^7.1.1 | MIT | Não | https://registry.npmjs.org/eslint-plugin-react-hooks |
| eslint-plugin-react-refresh | ^0.5.4 | MIT | Não | https://registry.npmjs.org/eslint-plugin-react-refresh |
| globals | ^17.11.0 | MIT | Não | https://registry.npmjs.org/globals |
| happy-dom | ^20.11.6 | MIT | Não | https://registry.npmjs.org/happy-dom |
| lucide-react | ^1.31.0 | ISC | Não | https://registry.npmjs.org/lucide-react |
| prettier | ^3.9.6 | MIT | Não | https://registry.npmjs.org/prettier |
| react | ^19.2.8 | MIT | Não | https://registry.npmjs.org/react |
| react-dom | ^19.2.8 | MIT | Não | https://registry.npmjs.org/react-dom |
| sanitize-html | ^2.17.6 | MIT | Não | https://registry.npmjs.org/sanitize-html |
| spdx-expression-parse | ^5.0.0 | MIT | Não | https://registry.npmjs.org/spdx-expression-parse |
| typescript | ~6.0.3 | Apache-2.0 | Não | https://registry.npmjs.org/typescript |
| typescript-eslint | ^8.67.0 | MIT | Não | https://registry.npmjs.org/typescript-eslint |
| vite | ^8.2.1 | MIT | Não | https://registry.npmjs.org/vite |
| vitest | ^4.1.10 | MIT | Não | https://registry.npmjs.org/vitest |
| wrangler | 4.125.0 | MIT OR Apache-2.0 | Não | https://registry.npmjs.org/wrangler |

## Eleição de licença em expressões OR

Duas linhas acima declaram expressão dupla: `@biomejs/biome` e `wrangler`, ambas
`MIT OR Apache-2.0`. As duas são dependências de **desenvolvimento** e não são
servidas ao navegador, portanto não há eleição a fazer na superfície
distribuída.

Varredura do `package-lock.json` em 30/08/2026, excluindo as entradas que o npm
marca como `dev`: **nenhuma** dependência distribuída declara expressão OR.

Essa afirmação não depende da data: o gate `npm run notices:check` reprova
quando qualquer componente distribuído passa a oferecer escolha de licença sem
eleição registrada. A política declara uma ordem de preferência aplicada às
formas inequívocas — uma disjunção plana e a forma legada do Cargo — e recusa
qualquer outra expressão, exigindo entrada explícita. A licença eleita aparece
ao lado do componente em `THIRD-PARTY-NOTICES.txt`.

## Avisos de terceiros

O inventário acima nomeia as licenças. O **texto integral** de cada componente
incorporado ao que o projeto publica — no bundle do navegador ou nas Pages
Functions do servidor, com o escopo de cada um — está em `THIRD-PARTY-NOTICES.txt`, gerado por
`npm run notices` e conferido por `npm run notices:check` nos workflows de
`pull_request` e de deploy.
