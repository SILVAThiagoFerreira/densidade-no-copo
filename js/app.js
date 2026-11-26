import { consultar } from './calc.js';

const CAMPOS = ['diametro_mm', 'tampao_m', 'coluna_m', 'densidade_fundo', 'inclinacao_graus'];
const fmt = (n, casas = 2) => Number(n).toFixed(casas).replace('.', ',');

const els = {
  titulo: document.getElementById('titulo'),
  subtitulo: document.getElementById('subtitulo'),
  theadRow: document.getElementById('thead-row'),
  tbody: document.getElementById('tbody'),
  form: document.getElementById('form'),
  select: document.getElementById('densidade_fundo'),
  resultado: document.getElementById('resultado'),
  notas: document.getElementById('notas'),
  modeloNota: document.getElementById('modelo-nota'),
  lamina: document.getElementById('lamina'),
  btnPdf: document.getElementById('btn-pdf'),
  btnLimpar: document.getElementById('btn-limpar'),
};

let cfg = null;
let tabela = null;
let ultimo = null; // último resultado de consultar()

function lerEntradas() {
  const dados = {};
  for (const c of CAMPOS) dados[c] = els.form.elements[c].value.trim();
  return dados;
}

/* ---------- Tabela ---------- */

function montarCabecalho() {
  els.theadRow.innerHTML = '';
  const th0 = document.createElement('th');
  th0.className = 'th-linha';
  th0.scope = 'col';
  th0.textContent = 'Coluna (m)';
  els.theadRow.appendChild(th0);
  tabela.densidade_fundo.forEach((d, j) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.dataset.col = String(j);
    th.textContent = fmt(d);
    els.theadRow.appendChild(th);
  });
}

function montarCorpo() {
  els.tbody.innerHTML = '';
  const frag = document.createDocumentFragment();
  tabela.linhas.forEach((linha, i) => {
    const tr = document.createElement('tr');
    tr.dataset.row = String(i);
    const th = document.createElement('th');
    th.scope = 'row';
    th.className = 'td-linha';
    th.textContent = Number.isInteger(linha.coluna_m) ? String(linha.coluna_m) : fmt(linha.coluna_m, 1);
    tr.appendChild(th);
    linha.densidades_no_copo.forEach((v, j) => {
      const td = document.createElement('td');
      td.dataset.row = String(i);
      td.dataset.col = String(j);
      if (v === null) {
        td.className = 'is-vazio';
        td.setAttribute('aria-label', 'não tabelado');
      } else {
        td.textContent = fmt(v);
        if (v >= cfg.modelo.limiar_critico_g_cm3) td.classList.add('is-critico');
      }
      tr.appendChild(td);
    });
    frag.appendChild(tr);
  });
  els.tbody.appendChild(frag);
}

function preencherSeletor() {
  els.select.innerHTML = '';
  const vazio = document.createElement('option');
  vazio.value = '';
  vazio.textContent = 'Selecione';
  els.select.appendChild(vazio);
  tabela.densidade_fundo.forEach((d) => {
    const o = document.createElement('option');
    o.value = fmt(d).replace(',', '.');
    o.textContent = fmt(d);
    els.select.appendChild(o);
  });
}

function limparMarcacao() {
  els.tbody.querySelectorAll('.is-marcada').forEach((td) => td.classList.remove('is-marcada'));
  els.tbody.querySelectorAll('.is-linha-marcada').forEach((tr) => tr.classList.remove('is-linha-marcada'));
  els.theadRow.querySelectorAll('.is-coluna-marcada').forEach((th) => th.classList.remove('is-coluna-marcada'));
}

function marcar(resultado) {
  limparMarcacao();
  if (!resultado || !resultado.ok || resultado.linha_index === undefined) return;
  const tr = els.tbody.querySelector(`tr[data-row="${resultado.linha_index}"]`);
  const th = els.theadRow.querySelector(`th[data-col="${resultado.coluna_index}"]`);
  const td = tr?.querySelector(`td[data-col="${resultado.coluna_index}"]`);
  if (tr) tr.classList.add('is-linha-marcada');
  if (th) th.classList.add('is-coluna-marcada');
  if (td && !resultado.fora_tabela) {
    td.classList.add('is-marcada');
    td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

/* ---------- Resultado ---------- */

function renderResultado(resultado, entradasBrutas) {
  if (!resultado.ok) {
    if (!CAMPOS.slice(0, 4).some((c) => entradasBrutas[c])) {
      els.resultado.innerHTML = '<p class="result__empty">Informe diâmetro, tampão e coluna para indicar a célula na tabela.</p>';
      return;
    }
    els.resultado.className = 'result';
    els.resultado.innerHTML = '';
    resultado.erros.forEach((e) => {
      const p = document.createElement('p');
      p.className = 'result__erro';
      p.textContent = e;
      els.resultado.appendChild(p);
    });
    return;
  }

  const linhas = [
    `Diâmetro ${fmt(resultado.entrada.diametro_mm, 0)} mm`,
    `Tampão: +${fmt(resultado.altura_tampao_equivalente_m)} m de coluna equivalente`,
    `Altura efetiva: ${fmt(resultado.altura_efetiva_m)} m${resultado.coluna_tabela_m !== undefined ? ` (linha ${fmt(resultado.coluna_tabela_m, 0)} m da tabela)` : ' (acima da tabela)'}`,
  ];

  if (resultado.fora_tabela) {
    els.resultado.className = 'result result__ok';
    els.resultado.innerHTML = `
      <p class="result__rotulo">Densidade no copo</p>
      <p class="result__valor">—</p>
      <ul class="result__linhas">${linhas.map((l) => `<li>${l}</li>`).join('')}</ul>
      <p class="result__alerta">${resultado.motivo} Consulte o P&amp;D.</p>`;
    return;
  }

  els.resultado.className = 'result result__ok';
  els.resultado.innerHTML = `
    <p class="result__rotulo">Densidade no copo</p>
    <p class="result__valor">${fmt(resultado.densidade_copo)} <span class="result__unidade">g/cm³</span></p>
    <ul class="result__linhas">${linhas.map((l) => `<li>${l}</li>`).join('')}</ul>
    ${resultado.critico ? '<p class="result__alerta">Condição crítica: não recomendado aplicar nesta condição.</p>' : ''}`;
}

/* ---------- Atualização ---------- */

function atualizar() {
  const brutas = lerEntradas();
  const r = consultar(brutas, tabela, cfg);
  ultimo = r;
  renderResultado(r, brutas);
  marcar(r);
}

/* ---------- Notas e modelo ---------- */

function renderNotas() {
  els.notas.innerHTML = `
    <h3>Observações da tabela</h3>
    <ul>
      <li>Os valores de densidade não consideram a pressão exercida pelo tampão. Esta página acrescenta a pressão do tampão como altura de coluna equivalente.</li>
      <li>A coluna se refere à altura manométrica de emulsão explosiva. Com inclinação do furo, a altura é corrigida pelo cosseno da inclinação.</li>
      <li>Os valores nos campos coloridos estão em condição crítica. Não é recomendável aplicar o produto nestas condições, pela possibilidade de deflagração.</li>
      <li>O Densiex-G pode ser aplicado até 40 m sem atingir a densidade crítica. Para profundidades maiores, consulte o P&amp;D.</li>
    </ul>`;
  els.modeloNota.textContent =
    `Modelo de cálculo ${cfg.modelo.versao} (${cfg.modelo.status}). Pressão do tampão por Janssen: atrito na parede do furo, que depende do diâmetro. ` +
    `Altura efetiva = coluna × cos(inclinação) + tampão equivalente, arredondada para a linha da tabela imediatamente superior. ` +
    `Limiar crítico da planilha: ${fmt(cfg.modelo.limiar_critico_g_cm3)} g/cm³.`;
}

/* ---------- Lâmina (PDF) ---------- */

function htmlTabelaLamina() {
  const cab = tabela.densidade_fundo.map((d) => `<th>${fmt(d)}</th>`).join('');
  const corpo = tabela.linhas
    .map((linha, i) => {
      const marcada = ultimo && ultimo.ok && ultimo.linha_index === i ? ' class="is-linha-marcada"' : '';
      const cels = linha.densidades_no_copo
        .map((v, j) => {
          if (v === null) return '<td></td>';
          const marcadaCel = ultimo && ultimo.ok && !ultimo.fora_tabela && ultimo.linha_index === i && ultimo.coluna_index === j;
          const cls = marcadaCel ? 'is-marcada' : v >= cfg.modelo.limiar_critico_g_cm3 ? 'is-critico' : '';
          return `<td class="${cls}">${fmt(v)}</td>`;
        })
        .join('');
      const rotulo = Number.isInteger(linha.coluna_m) ? String(linha.coluna_m) : fmt(linha.coluna_m, 1);
      return `<tr${marcada}><td class="td-linha">${rotulo}</td>${cels}</tr>`;
    })
    .join('');
  return `<table><thead><tr><th class="th-linha">Coluna (m)</th>${cab}</tr></thead><tbody>${corpo}</tbody></table>`;
}

function htmlDadosLamina() {
  const b = lerEntradas();
  const v = (x, casas, un) => (x ? `${x}${un ? ' ' + un : ''}` : '—');
  const dl = `
    <dl class="lamina__dl">
      <dt>Diâmetro do furo</dt><dd>${v(b.diametro_mm, 0, 'mm')}</dd>
      <dt>Altura do tampão</dt><dd>${v(b.tampao_m, 2, 'm')}</dd>
      <dt>Altura da coluna de carga</dt><dd>${v(b.coluna_m, 2, 'm')}</dd>
      <dt>Inclinação do furo</dt><dd>${v(b.inclinacao_graus || '0', 0, '°')}</dd>
      <dt>Densidade no fundo</dt><dd>${v(b.densidade_fundo, 2, 'g/cm³')}</dd>
    </dl>`;
  let res = '<p class="lamina__txt">Preencha os dados do furo para indicar a célula.</p>';
  if (ultimo && ultimo.ok) {
    if (ultimo.fora_tabela) {
      res = `<div class="lamina__val">—</div><div class="lamina__txt">${ultimo.motivo} Consulte o P&amp;D.</div>`;
    } else {
      res = `<div class="lamina__val">${fmt(ultimo.densidade_copo)} g/cm³</div>
        <div class="lamina__txt">Altura efetiva ${fmt(ultimo.altura_efetiva_m)} m · linha ${fmt(ultimo.coluna_tabela_m, 0)} m · tampão +${fmt(ultimo.altura_tampao_equivalente_m)} m</div>
        ${ultimo.critico ? '<div class="lamina__alerta">Condição crítica: não recomendado aplicar.</div>' : ''}`;
    }
  } else if (ultimo && !ultimo.ok) {
    res = `<div class="lamina__txt">${ultimo.erros.join(' ')}</div>`;
  }
  return `${dl}<div class="lamina__resultado"><div class="lamina__rot">Densidade no copo indicada</div>${res}</div>`;
}

function montarLamina() {
  const data = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  els.lamina.innerHTML = `
    <div class="lamina__top">
      <img class="lamina__partner" src="assets/enaex-brasil.png" alt="Enaex Brasil" />
    </div>
    <h1 class="lamina__title">${cfg.titulo}</h1>
    <p class="lamina__sub">${cfg.subtitulo}</p>
    <div class="lamina__body">
      <div>
        <div class="lamina__dados"><h2>Dados do furo e resultado</h2>${htmlDadosLamina()}</div>
        <div class="lamina__obs">
          <p>• Pressão do tampão incluída por Janssen (depende do diâmetro). Modelo ${cfg.modelo.versao}, ${cfg.modelo.status}.</p>
          <p>• Coluna corrigida pelo cosseno da inclinação. Campos coloridos: condição crítica.</p>
          <p>• Não recomendado aplicar nos campos coloridos (risco de deflagração). Densiex-G até 40 m sem densidade crítica.</p>
        </div>
      </div>
      <div class="lamina__tabela"><h2>Tabela de densidade no copo (g/cm³)</h2>${htmlTabelaLamina()}</div>
    </div>
    <div class="lamina__rodape"><span>${cfg.lamina.rodape}</span><span>Emitido em ${data}</span></div>`;
}

function exportarPdf() {
  montarLamina();
  const tituloOriginal = document.title;
  document.title = cfg.lamina.nome_arquivo.replace(/\.pdf$/, '');
  const restaurar = () => {
    document.title = tituloOriginal;
    window.removeEventListener('afterprint', restaurar);
  };
  window.addEventListener('afterprint', restaurar);
  window.print();
}

/* ---------- Eventos ---------- */

function ligarEventos() {
  els.form.addEventListener('input', atualizar);
  els.form.addEventListener('change', atualizar);
  els.btnPdf.addEventListener('click', exportarPdf);
  els.btnLimpar.addEventListener('click', () => {
    els.form.reset();
    atualizar();
  });
}

/* ---------- Inicialização ---------- */

async function iniciar() {
  try {
    cfg = await fetch(new URL('../config.json', import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(`config.json: HTTP ${r.status}`);
      return r.json();
    });
    tabela = await fetch(new URL('../' + cfg.fonte_tabela, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(`tabela: HTTP ${r.status}`);
      return r.json();
    });
  } catch (erro) {
    els.resultado.innerHTML = `<p class="result__erro">Não foi possível carregar a tabela: ${erro.message}. Abra pelo endereço publicado (GitHub Pages) ou por um servidor local.</p>`;
    return;
  }

  els.titulo.textContent = cfg.titulo;
  els.subtitulo.textContent = cfg.subtitulo;
  document.title = `${cfg.titulo} | US Vale Verde | OpenBlast`;
  montarCabecalho();
  montarCorpo();
  preencherSeletor();
  renderNotas();
  ligarEventos();
  atualizar();
}

iniciar();
