// Cálculo puro da densidade no copo. Sem DOM, testável em Node.
// Premissas do modelo ficam em config.json (bloco "modelo").

const ARREDONDAMENTO_EPS = 1e-9;

/**
 * Valida entradas brutas (strings ou números vindos do formulário).
 * Retorna { ok, erros, valores } sem fallback silencioso.
 */
export function validarEntradas(entradas, cfg) {
  const erros = [];
  const lim = cfg.limites_entrada;
  const num = (chave, rotulo, limite, obrigatorio = true) => {
    const bruto = entradas[chave];
    if (bruto === '' || bruto === null || bruto === undefined) {
      if (obrigatorio) erros.push(`${rotulo}: informe um valor.`);
      return null;
    }
    const v = Number(String(bruto).replace(',', '.'));
    if (!Number.isFinite(v)) {
      erros.push(`${rotulo}: valor inválido.`);
      return null;
    }
    if (v < limite.min || v > limite.max) {
      erros.push(`${rotulo}: deve estar entre ${limite.min} e ${limite.max}.`);
      return null;
    }
    return v;
  };

  const diametro_mm = num('diametro_mm', 'Diâmetro do furo (mm)', lim.diametro_mm);
  const tampao_m = num('tampao_m', 'Altura do tampão (m)', lim.tampao_m);
  const profundidade_m = num('profundidade_m', 'Profundidade do furo (m)', lim.profundidade_m);
  // Coluna de carga = profundidade do furo − altura do tampão (calculada, não digitada)
  let coluna_m = null;
  if (profundidade_m !== null && tampao_m !== null) {
    if (tampao_m > profundidade_m) {
      erros.push('Altura do tampão não pode ser maior que a profundidade do furo.');
    } else {
      coluna_m = profundidade_m - tampao_m;
    }
  }
  const inclinacao_graus = num('inclinacao_graus', 'Inclinação do furo (°)', lim.inclinacao_graus, false) ?? 0;
  const densidade_fundo = num(
    'densidade_fundo',
    'Densidade no fundo do furo (g/cm³)',
    { min: cfg.modelo.densidade_fundo_min_g_cm3, max: cfg.modelo.densidade_fundo_max_g_cm3 }
  );

  return {
    ok: erros.length === 0,
    erros,
    valores: { diametro_mm, tampao_m, profundidade_m, coluna_m, inclinacao_graus, densidade_fundo },
  };
}

/**
 * Coluna de carga a partir dos campos brutos, para exibição automática na tela.
 * Retorna null enquanto a profundidade ou o tampão não forem números válidos.
 */
export function colunaDeCargaBruta(entradas) {
  const ler = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const prof = ler(entradas.profundidade_m);
  const tamp = ler(entradas.tampao_m);
  if (prof === null || tamp === null || tamp > prof) return null;
  return prof - tamp;
}

/**
 * Altura de coluna equivalente da pressão do tampão (m de emulsão).
 * Janssen: a pressão do tampão é limitada pelo atrito na parede do furo,
 * e depende do diâmetro. σ = ρt·g·λ·(1 − e^(−T/λ)), λ = D / (4·μ·K).
 * A pressão é convertida em altura de emulsão de densidade = densidade no fundo.
 */
export function alturaTampaoEquivalente({ diametro_mm, tampao_m, densidade_fundo }, cfg) {
  const m = cfg.modelo;
  const D = diametro_mm / 1000;
  const lambda = D / (4 * m.coeficiente_atrito_parede * m.coeficiente_empuxo_lateral_K);
  const sigma = m.densidade_tampao_kg_m3 * m.gravidade_m_s2 * lambda * (1 - Math.exp(-tampao_m / lambda));
  const rhoEmulsao = densidade_fundo * 1000;
  return sigma / (rhoEmulsao * m.gravidade_m_s2);
}

/** Altura efetiva = coluna corrigida pelo cosseno da inclinação + tampão equivalente. */
export function alturaEfetiva({ coluna_m, inclinacao_graus }, hTampaoEq) {
  const cos = Math.cos((inclinacao_graus * Math.PI) / 180);
  return coluna_m * cos + hTampaoEq;
}

/** Índice da primeira linha da tabela com coluna >= altura efetiva (arredondamento conservador). */
export function indiceLinha(linhas, altura) {
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].coluna_m + ARREDONDAMENTO_EPS >= altura) return i;
  }
  return -1;
}

/**
 * Consulta completa. Retorna sempre um objeto explícito; nunca assume valor.
 */
export function consultar(entradas, tabela, cfg) {
  const v = validarEntradas(entradas, cfg);
  if (!v.ok) return { ok: false, erros: v.erros };

  const { diametro_mm, tampao_m, coluna_m, inclinacao_graus, densidade_fundo } = v.valores;
  const hTampao = alturaTampaoEquivalente({ diametro_mm, tampao_m, densidade_fundo }, cfg);
  const altura = alturaEfetiva({ coluna_m, inclinacao_graus }, hTampao);
  const iLinha = indiceLinha(tabela.linhas, altura);

  const base = {
    ok: true,
    erros: [],
    entrada: v.valores,
    altura_tampao_equivalente_m: hTampao,
    altura_efetiva_m: altura,
  };

  if (iLinha < 0) {
    return {
      ...base,
      fora_tabela: true,
      motivo: `Altura efetiva de ${altura.toFixed(2).replace('.', ',')} m acima da maior coluna da tabela.`,
    };
  }

  const linha = tabela.linhas[iLinha];
  const iFundo = Math.round((densidade_fundo - tabela.densidade_fundo[0]) * 100);
  const densidade_copo = linha.densidades_no_copo[iFundo];

  if (densidade_copo === null || densidade_copo === undefined) {
    return {
      ...base,
      fora_tabela: true,
      linha_index: iLinha,
      coluna_index: iFundo,
      coluna_tabela_m: linha.coluna_m,
      motivo: `Combinação não tabelada: coluna ${linha.coluna_m} m com densidade no fundo ${densidade_fundo.toFixed(2).replace('.', ',')} g/cm³.`,
    };
  }

  return {
    ...base,
    fora_tabela: false,
    linha_index: iLinha,
    coluna_index: iFundo,
    coluna_tabela_m: linha.coluna_m,
    densidade_copo,
    critico: densidade_copo >= cfg.modelo.limiar_critico_g_cm3,
  };
}
