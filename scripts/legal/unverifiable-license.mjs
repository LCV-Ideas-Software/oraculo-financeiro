import spdxParse from "spdx-expression-parse";

import {
  integridadeSriEstrita,
  origemGitImutavel,
} from "./artifact-policy.mjs";

const textoUtil = (valor) =>
  typeof valor === "string" && valor.trim().length > 0;

// A inspecao manual e uma excecao ao reconhecimento automatico, nao a
// identidade do artefato. Ela precisa declarar o que foi identificado e ficar
// presa aos mesmos bytes/origem que foram inspecionados.
export function validarInspecaoManual(componente, inspecionada) {
  const problemas = [];
  const declarada = (componente.licencaDeclarada || "").trim();
  if (!inspecionada) {
    problemas.push(
      declarada
        ? `${componente.id}: declaracao "${declarada}" sem inspecao manual registrada`
        : `${componente.id}: o pacote nao declara license; registre a inspecao manual em unverifiableLicenseDeclarations`,
    );
    return problemas;
  }

  if (declarada) {
    try {
      spdxParse(declarada);
      problemas.push(
        `${componente.id}: inspecao manual so e permitida para metadado license ausente ou nao-SPDX; a declaracao "${declarada}" e SPDX valida`,
      );
    } catch {
      // Este e o caso que a excecao existe para cobrir.
    }
  }
  if (!declarada && inspecionada.declared !== null) {
    problemas.push(
      `${componente.id}: a politica deve registrar declared: null para um pacote sem metadado license`,
    );
  } else if (declarada && inspecionada.declared !== declarada) {
    problemas.push(
      `${componente.id}: a politica registra a declaracao "${inspecionada.declared}" mas o pacote declara "${declarada}"`,
    );
  }

  if (!textoUtil(inspecionada.identifiedLicense)) {
    problemas.push(
      `${componente.id}: inspecao manual sem licenca identificada utilizavel`,
    );
  } else {
    try {
      const ast = spdxParse(inspecionada.identifiedLicense.trim());
      if (!ast.license) {
        problemas.push(
          `${componente.id}: a licenca identificada deve ser um termo SPDX concreto, sem AND/OR`,
        );
      }
    } catch (erro) {
      problemas.push(
        `${componente.id}: a licenca identificada nao e SPDX valida (${erro.message})`,
      );
    }
  }

  if (!textoUtil(inspecionada.rationale)) {
    problemas.push(`${componente.id}: inspecao manual sem justificativa`);
  }

  if (inspecionada.ecosystem !== componente.ecossistema) {
    problemas.push(
      `${componente.id}: o ecossistema inspecionado "${inspecionada.ecosystem ?? "ausente"}" nao corresponde a "${componente.ecossistema}"`,
    );
  }
  if (!textoUtil(inspecionada.source)) {
    problemas.push(`${componente.id}: inspecao manual sem origem do pacote`);
  } else if (inspecionada.source !== componente.origemPacote) {
    problemas.push(
      `${componente.id}: a origem inspecionada "${inspecionada.source}" nao corresponde a "${componente.origemPacote ?? "origem ausente"}" do lockfile`,
    );
  }

  const integridade = componente.integridadePacote;
  if (integridade) {
    if (!integridadeSriEstrita(integridade)) {
      problemas.push(
        `${componente.id}: integridade "${integridade}" do lockfile nao e SRI estrita e completa`,
      );
    } else if (inspecionada.integrity !== integridade) {
      problemas.push(
        `${componente.id}: a integridade inspecionada "${inspecionada.integrity ?? "ausente"}" nao corresponde ao lockfile`,
      );
    }
  } else if (
    textoUtil(componente.origemPacote) &&
    !origemGitImutavel(componente.origemPacote)
  ) {
    problemas.push(
      `${componente.id}: a origem "${componente.origemPacote}" nao e uma revisao Git imutavel e o lockfile nao traz integridade`,
    );
  }
  return problemas;
}
