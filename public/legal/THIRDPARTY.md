# Third-Party Components

| Componente | Versão | Licença Original | Modificado? | Link de Origem |
|------------|--------|------------------|-------------|----------------|
| @biomejs/biome | ^2.5.14 | MIT OR Apache-2.0 | Não | https://registry.npmjs.org/@biomejs/biome |
| @eslint/js | ^10.0.1 | MIT | Não | https://registry.npmjs.org/@eslint/js |
| @types/node | ^26.6.3 | MIT | Não | https://registry.npmjs.org/@types/node |
| @types/react | ^19.3.0 | MIT | Não | https://registry.npmjs.org/@types/react |
| @types/react-dom | ^19.3.0 | MIT | Não | https://registry.npmjs.org/@types/react-dom |
| @types/sanitize-html | ^2.16.2 | MIT | Não | https://registry.npmjs.org/@types/sanitize-html |
| @vitejs/plugin-react | ^6.0.5 | MIT | Não | https://registry.npmjs.org/@vitejs/plugin-react |
| eslint | ^10.11.0 | MIT | Não | https://registry.npmjs.org/eslint |
| eslint-config-prettier | ^10.1.8 | MIT | Não | https://registry.npmjs.org/eslint-config-prettier |
| eslint-plugin-react-hooks | ^7.1.1 | MIT | Não | https://registry.npmjs.org/eslint-plugin-react-hooks |
| eslint-plugin-react-refresh | ^0.5.7 | MIT | Não | https://registry.npmjs.org/eslint-plugin-react-refresh |
| globals | ^17.12.0 | MIT | Não | https://registry.npmjs.org/globals |
| happy-dom | ^20.14.5 | MIT | Não | https://registry.npmjs.org/happy-dom |
| lucide-react | ^1.48.0 | ISC | Não | https://registry.npmjs.org/lucide-react |
| prettier | ^3.9.9 | MIT | Não | https://registry.npmjs.org/prettier |
| react | ^19.3.0 | MIT | Não | https://registry.npmjs.org/react |
| react-dom | ^19.3.0 | MIT | Não | https://registry.npmjs.org/react-dom |
| sanitize-html | ^2.17.6 | MIT | Não | https://registry.npmjs.org/sanitize-html |
| typescript | ~6.0.3 | Apache-2.0 | Não | https://registry.npmjs.org/typescript |
| typescript-eslint | ^8.71.0 | MIT | Não | https://registry.npmjs.org/typescript-eslint |
| vite | ^8.3.1 | MIT | Não | https://registry.npmjs.org/vite |
| vitest | ^5.0.3 | MIT | Não | https://registry.npmjs.org/vitest |
| wrangler | 4.149.0 | MIT OR Apache-2.0 | Não | https://registry.npmjs.org/wrangler |

## Exceção temporária de segurança (LCV-316)

O operador autorizou o override npm temporário `miniflare` → `sharp@0.35.5` para corrigir GHSA-wq5f-xc86-pv6w (LCV-316). O Wrangler oficial 4.149.0 agora seleciona Miniflare 5.20261006.1-alpha, que exige Sharp 0.35.5 diretamente. O override foi retirado, e o npm regenera o lockfile usando as faixas oficiais do upstream (LCV-341). Sharp e seus binários opcionais pertencem ao ferramental de desenvolvimento; os avisos das Pages Functions continuam cobrindo suas dependências distribuídas.

## Automação oficial de releases

Linear Release usa a Action oficial v0.18.1 (`30f9ae77461ec29f07fffe0c52edd1909bfbb6f5`) e a CLI oficial v0.18.0, ambas do titular Linear. A Action verifica o executável da CLI contra os checksums publicados pelo upstream; esse ferramental opera somente após o Deploy bem-sucedido e não compõe os artefatos distribuídos da aplicação.

## Eleição de licença em expressões OR

Duas linhas acima declaram expressão dupla: `@biomejs/biome` e `wrangler`, ambas
`MIT OR Apache-2.0`. São ferramentas de **desenvolvimento**, não componentes
incorporados ao navegador ou às Pages Functions neste retrato; não há eleição
adicional dessas ferramentas para a superfície distribuída.

Na revisão de 08/09/2026, os 22 componentes dos avisos integrais mantidos não
declaram expressão OR. Essa constatação pertence a esse retrato, não é uma
garantia sobre atualizações futuras. Uma mudança de dependência, licença ou
superfície distribuída exige nova revisão, incluindo eventual eleição de
licença e preservação dos textos e atribuições aplicáveis.

## Avisos de terceiros

O inventário acima registra as dependências diretas e seus intervalos declarados.
O **texto integral** dos componentes incorporados ao que o projeto publica está
em `THIRD-PARTY-NOTICES.txt`: o retrato preservado na reforma cobre 5 componentes
do navegador e 17 das Pages Functions, com versões exatas, escopo, textos e
atribuições. Vite consta porque injeta o runtime de module-preload no navegador;
a marcação `dev` do npm, isoladamente, não determina o que é distribuído.

Os avisos completos e os documentos legais têm cópias em `public/legal/`,
expostas pela aplicação. Sua manutenção é manual: quando dependências ou
artefatos publicados mudarem, revisar o alcance de navegador e servidor,
atualizar os textos aplicáveis e manter as cópias coerentes. A reforma preserva
os avisos integrais existentes; não acrescenta um segundo relatório de licenças
do Vite que cubra apenas o bundle do navegador.

A referência a `scripts/generate-notices.mjs` no cabeçalho dos avisos integrais
é a proveniência histórica de sua geração, não um comando disponível. O gerador,
os verificadores customizados e seu ferramental Ruby/Licensee foram aposentados:
não há geração a cada publicação nem verificação automática contínua de
inventário, texto ou artefato. O fragmento estático
`scripts/legal/launder-mit.txt` contém o texto integral verbatim do `LICENSE.md`
publicado pelo titular em `launder` 1.7.2, seguido de um bloco separado com
versão, escopo, tarball, SRI, commit declarado e SHA-256 do texto conferido.
Os avisos integrais e sua cópia pública foram atualizados para essa versão;
não se estende essa prova retrospectivamente a `launder` 1.7.1.

## Atualização documental — 02/10/2026 (LCV-183 / LCV-211)

O Vitest 5.0.3 seleciona `why-is-node-running` 3.2.1, cuja publicação oficial não depende de `stackback`. A árvore exata permanece nos lockfiles regenerados pelo npm. Fonte: https://github.com/vitest-dev/vitest/pull/11316 e https://github.com/vitest-dev/vitest/releases/tag/v5.0.3. Esta atualização de ferramenta de teste não afirma incorporação no produto distribuído.
