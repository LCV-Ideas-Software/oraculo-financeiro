import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const paraLfSemBordas = (texto) => texto.replaceAll("\r\n", "\n").trim();

export const sha256DosBytes = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export function executarLicensee({ caminho, licenca }) {
  const resultado = spawnSync(
    "ruby",
    [
      "-S",
      "bundle",
      "exec",
      "licensee",
      "detect",
      caminho,
      "--json",
      "--no-packages",
      "--no-readme",
      "--filesystem",
      `--license=${licenca}`,
      "--confidence=100",
    ],
    {
      cwd: RAIZ,
      encoding: "utf8",
      env: { ...process.env, BUNDLE_FROZEN: "true" },
      windowsHide: true,
    },
  );
  return {
    status: resultado.status,
    stdout: resultado.stdout || "",
    stderr: resultado.stderr || "",
    erro: resultado.error?.message || null,
  };
}

export function validarCorrespondenciaExataDoLicensee({
  licenca,
  texto,
  resultado,
}) {
  if (resultado.erro) {
    return { ok: false, motivo: `Licensee nao iniciou: ${resultado.erro}` };
  }
  if (resultado.status !== 0) {
    const detalhe = resultado.stderr.trim() || `status ${resultado.status}`;
    return { ok: false, motivo: `Licensee falhou: ${detalhe}` };
  }

  let relatorio;
  try {
    relatorio = JSON.parse(resultado.stdout);
  } catch {
    return { ok: false, motivo: "Licensee nao devolveu JSON valido" };
  }

  const reconheceu = (relatorio.licenses || []).some(
    (item) => item.spdx_id === licenca,
  );
  const correspondencia = (relatorio.matched_files || []).find(
    (arquivo) =>
      arquivo.matched_license === licenca &&
      arquivo.matcher?.name === "exact" &&
      arquivo.matcher?.confidence === 100 &&
      paraLfSemBordas(arquivo.content || "") === paraLfSemBordas(texto),
  );
  if (!reconheceu || !correspondencia) {
    return {
      ok: false,
      motivo: `Licensee nao confirmou ${licenca} com matcher Exact e confianca 100`,
    };
  }
  return { ok: true, metodo: "Licensee Exact 100" };
}

function validarRevisaoImutavel({ licencas, textos, revisao }) {
  if (!revisao || typeof revisao !== "object") {
    return { ok: false, motivo: "revisao imutavel ausente" };
  }
  if (!Array.isArray(revisao.licenses) || !revisao.licenses.length) {
    return { ok: false, motivo: "revisao imutavel sem licenses" };
  }
  for (const licenca of licencas) {
    if (!revisao.licenses.includes(licenca)) {
      return {
        ok: false,
        motivo: `revisao imutavel nao cobre ${licenca}`,
      };
    }
  }
  if (typeof revisao.rationale !== "string" || !revisao.rationale.trim()) {
    return { ok: false, motivo: "revisao imutavel sem rationale" };
  }
  if (!revisao.files || typeof revisao.files !== "object") {
    return { ok: false, motivo: "revisao imutavel sem files" };
  }

  const portadores = textos.filter((texto) => texto.portador !== false);
  const nomesAtuais = portadores.map((texto) => texto.arquivo).sort();
  const nomesRevistos = Object.keys(revisao.files).sort();
  if (JSON.stringify(nomesAtuais) !== JSON.stringify(nomesRevistos)) {
    return {
      ok: false,
      motivo: `conjunto de arquivos mudou (atual: ${nomesAtuais.join(", ")}; revisado: ${nomesRevistos.join(", ")})`,
    };
  }
  for (const texto of portadores) {
    const esperado = revisao.files[texto.arquivo];
    if (!/^[a-f0-9]{64}$/u.test(esperado || "")) {
      return {
        ok: false,
        motivo: `sha256 revisado invalido para ${texto.arquivo}`,
      };
    }
    if (texto.sha256 !== esperado) {
      return {
        ok: false,
        motivo: `${texto.arquivo} mudou (sha256 ${texto.sha256}; revisado ${esperado})`,
      };
    }
  }
  return { ok: true, metodo: "revisao imutavel por sha256" };
}

export function corroborarTextosDeLicenca({
  licencas,
  textos,
  revisao,
  executar = executarLicensee,
}) {
  if (revisao) return validarRevisaoImutavel({ licencas, textos, revisao });

  const portadores = textos.filter((texto) => texto.portador !== false);
  for (const licenca of licencas) {
    let ultimoMotivo = "nenhum arquivo portador foi reproduzido";
    let confirmada = false;
    for (const texto of portadores) {
      if (!texto.caminho) {
        ultimoMotivo = `${texto.arquivo}: caminho ausente para o Licensee`;
        continue;
      }
      const validacao = validarCorrespondenciaExataDoLicensee({
        licenca,
        texto: texto.texto,
        resultado: executar({ caminho: texto.caminho, licenca }),
      });
      if (validacao.ok) {
        confirmada = true;
        break;
      }
      ultimoMotivo = `${texto.arquivo}: ${validacao.motivo}`;
    }
    if (!confirmada) {
      return {
        ok: false,
        motivo:
          `${ultimoMotivo}; se o upstream usa uma variante legitima que o ` +
          "Licensee oficial nao reconhece exatamente, registre uma revisao " +
          "por artefato e sha256 em licenseTextReviewOverrides",
      };
    }
  }
  return { ok: true, metodo: "Licensee Exact 100" };
}
