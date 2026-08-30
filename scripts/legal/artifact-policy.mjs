const registrosDaEntrada = (entrada) =>
  Array.isArray(entrada)
    ? entrada
    : entrada && typeof entrada === "object"
      ? [entrada]
      : [];

const textoUtil = (valor) =>
  typeof valor === "string" && valor.trim().length > 0;

const registroIncompleto = (registro) =>
  !textoUtil(registro?.ecosystem) ||
  !textoUtil(registro?.source) ||
  !Object.hasOwn(registro, "integrity") ||
  (registro.integrity !== null && !textoUtil(registro.integrity));

const componenteIncompleto = (componente) =>
  !textoUtil(componente?.ecossistema) ||
  !textoUtil(componente?.origemPacote) ||
  !Object.hasOwn(componente, "integridadePacote") ||
  (componente.integridadePacote !== null &&
    !textoUtil(componente.integridadePacote));

const corresponde = (registro, componente) =>
  registro.ecosystem === componente?.ecossistema &&
  registro.source === componente?.origemPacote &&
  registro.integrity === componente?.integridadePacote;

// Politicas por nome/versao podem precisar representar mais de um artefato
// homonimo. A selecao nunca usa first-wins: exige ecossistema, origem e, quando
// o lockfile a fornece, integridade exatos, e rejeita registros duplicados.
export function selecionarRegistroDoArtefato(entrada, componente) {
  const registros = registrosDaEntrada(entrada);
  if (
    !registros.length ||
    componenteIncompleto(componente) ||
    registros.some(registroIncompleto)
  ) {
    return { ok: false, tipo: "politica-incompleta" };
  }

  const correspondentes = registros.filter((r) => corresponde(r, componente));
  if (correspondentes.length > 1) {
    return {
      ok: false,
      tipo: "politica-duplicada",
      quantidade: correspondentes.length,
    };
  }
  if (correspondentes.length === 1) {
    return { ok: true, registro: correspondentes[0] };
  }

  const mesmoEcossistema = registros.filter(
    (r) => r.ecosystem === componente?.ecossistema,
  );
  if (!mesmoEcossistema.length) {
    return {
      ok: false,
      tipo: "ecossistema-divergente",
      esperados: [...new Set(registros.map((r) => r.ecosystem))],
      encontrado: componente?.ecossistema ?? null,
    };
  }

  const mesmaOrigem = mesmoEcossistema.filter(
    (r) => r.source === componente?.origemPacote,
  );
  if (mesmaOrigem.length) {
    return {
      ok: false,
      tipo: "integridade-divergente",
      esperadas: [...new Set(mesmaOrigem.map((r) => r.integrity))],
      encontrada: componente?.integridadePacote ?? null,
    };
  }
  return {
    ok: false,
    tipo: "origem-divergente",
    esperadas: [...new Set(mesmoEcossistema.map((r) => r.source))],
    encontrada: componente?.origemPacote ?? null,
  };
}

export function descreverFalhaDeSelecao(selecao, componente) {
  const prefixo = `${componente.id} (${componente.ecossistema})`;
  switch (selecao.tipo) {
    case "politica-incompleta":
      return `${prefixo}: a politica precisa registrar ecosystem, source e a integridade exata quando presente no lockfile`;
    case "politica-duplicada":
      return `${prefixo}: ${selecao.quantidade} registros da politica correspondem ao mesmo artefato exato`;
    case "ecossistema-divergente":
      return `${prefixo}: nenhum registro pertence a este ecossistema; registrados: ${selecao.esperados.join(", ")}`;
    case "integridade-divergente":
      return `${prefixo}: a origem coincide, mas a integridade "${selecao.encontrada}" difere das registradas: ${selecao.esperadas.join(", ")}`;
    default:
      return `${prefixo}: nenhuma politica pertence a origem exata "${selecao.encontrada ?? "ausente"}"; registradas: ${selecao.esperadas.join(", ")}`;
  }
}
