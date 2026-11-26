import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  validarEntradas,
  alturaTampaoEquivalente,
  alturaEfetiva,
  indiceLinha,
  consultar,
  colunaDeCargaBruta,
} from '../js/calc.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(raiz, 'config.json'), 'utf8'));
const tabela = JSON.parse(readFileSync(join(raiz, 'data', 'tabela_densidade_no_copo.json'), 'utf8'));

test('tabela tem 34 linhas e 26 densidades no fundo de 1,00 a 1,25', () => {
  assert.equal(tabela.linhas.length, 34);
  assert.equal(tabela.densidade_fundo.length, 26);
  assert.equal(tabela.densidade_fundo[0], 1.0);
  assert.equal(tabela.densidade_fundo[25], 1.25);
});

test('linha 0 com fundo 1,00 devolve 1,00 no copo (sem coluna, sem tampão)', () => {
  assert.equal(tabela.linhas[0].densidades_no_copo[0], 1.0);
});

test('validação rejeita diâmetro fora do limite e campo vazio', () => {
  const r = validarEntradas({ diametro_mm: '10', tampao_m: '3', profundidade_m: '', densidade_fundo: '1.10' }, cfg);
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.startsWith('Diâmetro')));
  assert.ok(r.erros.some((e) => e.startsWith('Profundidade')));
});

test('validação aceita vírgula decimal', () => {
  const r = validarEntradas({ diametro_mm: '165', tampao_m: '3,5', profundidade_m: '12,0', densidade_fundo: '1,15' }, cfg);
  assert.equal(r.ok, true);
  assert.equal(r.valores.tampao_m, 3.5);
  assert.equal(r.valores.densidade_fundo, 1.15);
});

test('tampão equivalente cresce com o diâmetro e satura (Janssen)', () => {
  const base = { tampao_m: 30, densidade_fundo: 1.1 };
  const h110 = alturaTampaoEquivalente({ ...base, diametro_mm: 110 }, cfg);
  const h165 = alturaTampaoEquivalente({ ...base, diametro_mm: 165 }, cfg);
  const h311 = alturaTampaoEquivalente({ ...base, diametro_mm: 311 }, cfg);
  assert.ok(h110 > 0 && h110 < h165 && h165 < h311, 'maior diâmetro, maior pressão de tampão');
  // Tampão longo satura em ρt·λ/ρe (limite de Janssen), não cresce sem limite
  const lambda = 0.165 / (4 * cfg.modelo.coeficiente_atrito_parede * cfg.modelo.coeficiente_empuxo_lateral_K);
  const saturacao = (cfg.modelo.densidade_tampao_kg_m3 * lambda) / (cfg.modelo.densidade_referencia_tampao_g_cm3 * 1000);
  const hLongo = alturaTampaoEquivalente({ ...base, diametro_mm: 165, tampao_m: 300 }, cfg);
  assert.ok(Math.abs(hLongo - saturacao) < 1e-6, `satura em ${saturacao.toFixed(4)} m`);
});

test('tampão zero não contribui', () => {
  assert.equal(alturaTampaoEquivalente({ diametro_mm: 165, tampao_m: 0, densidade_fundo: 1.1 }, cfg), 0);
});

test('inclinação reduz a coluna pelo cosseno, conforme observação da tabela', () => {
  const h = alturaEfetiva({ coluna_m: 10, inclinacao_graus: 60 }, 0);
  assert.ok(Math.abs(h - 5) < 1e-9);
});

test('indiceLinha arredonda para a linha imediatamente superior', () => {
  const linhas = [{ coluna_m: 0 }, { coluna_m: 1 }, { coluna_m: 2 }, { coluna_m: 35 }];
  assert.equal(indiceLinha(linhas, 0), 0);
  assert.equal(indiceLinha(linhas, 1.0000000001), 1);
  assert.equal(indiceLinha(linhas, 1.2), 2);
  assert.equal(indiceLinha(linhas, 30), 3);
  assert.equal(indiceLinha(linhas, 36), -1);
});

test('consulta marca a célula esperada sem tampão nem inclinação', () => {
  // Fundo 1,10 é a coluna índice 10; linha de coluna 10 m tem 1,21 nesse índice? Verifica pela própria tabela.
  const entradas = { diametro_mm: '165', tampao_m: '0', profundidade_m: '10', inclinacao_graus: '0', densidade_fundo: '1.10' };
  const r = consultar(entradas, tabela, cfg);
  assert.equal(r.ok, true);
  assert.equal(r.fora_tabela, false);
  assert.equal(r.coluna_tabela_m, 10);
  assert.equal(r.densidade_copo, tabela.linhas[tabela.linhas.findIndex((l) => l.coluna_m === 10)].densidades_no_copo[10]);
});

test('consulta reporta combinação fora da tabela em vez de inventar valor', () => {
  const entradas = { diametro_mm: '165', tampao_m: '0', profundidade_m: '50', inclinacao_graus: '0', densidade_fundo: '1.00' };
  const r = consultar(entradas, tabela, cfg);
  // Linha 50 m só tem 6 valores preenchidos (fundo 1,00 a 1,05); 1,00 existe
  assert.equal(r.fora_tabela, false);
  const r2 = consultar({ ...entradas, densidade_fundo: '1.25' }, tabela, cfg);
  assert.equal(r2.fora_tabela, true);
  assert.match(r2.motivo, /não tabelada/);
});

test('altura acima de 50 m é reportada como fora da tabela', () => {
  const r = consultar({ diametro_mm: '311', tampao_m: '50', profundidade_m: '100', inclinacao_graus: '0', densidade_fundo: '1.00' }, tabela, cfg);
  assert.equal(r.fora_tabela, true);
});

test('critico marca valores iguais ou acima do limiar da planilha (1,25)', () => {
  const r = consultar({ diametro_mm: '165', tampao_m: '0', profundidade_m: '0', inclinacao_graus: '0', densidade_fundo: '1.25' }, tabela, cfg);
  assert.equal(r.densidade_copo, 1.25);
  assert.equal(r.critico, true);
});

test('coluna de carga é profundidade menos tampão, calculada automaticamente', () => {
  const r = validarEntradas({ diametro_mm: '165', tampao_m: '3,5', profundidade_m: '15,5', densidade_fundo: '1,15' }, cfg);
  assert.equal(r.ok, true);
  assert.equal(r.valores.coluna_m, 12);
  assert.equal(colunaDeCargaBruta({ tampao_m: '3,5', profundidade_m: '15,5' }), 12);
});

test('tampão maior que a profundidade gera erro explícito', () => {
  const r = validarEntradas({ diametro_mm: '165', tampao_m: '20', profundidade_m: '15', densidade_fundo: '1.10' }, cfg);
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('não pode ser maior')));
  assert.equal(colunaDeCargaBruta({ tampao_m: '20', profundidade_m: '15' }), null);
});

test('linha do furo sai só dos dados do furo, sem densidade no fundo', () => {
  const base = { diametro_mm: '165', tampao_m: '3,5', profundidade_m: '15,5', inclinacao_graus: '0' };
  const sem = consultar({ ...base, densidade_fundo: '' }, tabela, cfg);
  const com = consultar({ ...base, densidade_fundo: '1.20' }, tabela, cfg);
  assert.equal(sem.ok, true);
  assert.equal(sem.sem_densidade, true);
  assert.equal(sem.densidade_copo, undefined);
  assert.equal(sem.linha_index, com.linha_index, 'mesma linha, com ou sem densidade');
  assert.equal(sem.coluna_tabela_m, 13);
});

test('densidade digitada precisa de duas casas decimais', () => {
  const r = validarEntradas({ diametro_mm: '165', tampao_m: '0', profundidade_m: '10', densidade_fundo: '1,123' }, cfg);
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('duas casas decimais')));
  const ok = validarEntradas({ diametro_mm: '165', tampao_m: '0', profundidade_m: '10', densidade_fundo: '1,15' }, cfg);
  assert.equal(ok.valores.densidade_fundo, 1.15);
});
