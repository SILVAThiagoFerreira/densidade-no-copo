# Densidade no copo

Ferramenta do hub OpenBlast (US Vale Verde) para consultar a densidade no copo da emulsão explosiva.
Informe o diâmetro do furo, a altura do tampão e a profundidade do furo. A altura da coluna de carga é calculada automaticamente (profundidade − tampão), e a linha do furo é marcada logo em seguida.
Depois, digite ou escolha a densidade desejada no fundo do furo: a coluna dessa densidade é marcada em todas as células possíveis, e a célula do furo recebe o contorno vermelho.
A célula correspondente da tabela é marcada automaticamente, e a lâmina pode ser exportada em PDF.

## Estrutura

| Arquivo | Função |
| --- | --- |
| `index.html`, `styles.css` | Página e estilo (padrão visual do hub OpenBlast / Enaex) |
| `js/app.js` | Interface: tabela, formulário, marcação e lâmina |
| `js/calc.js` | Cálculo puro (sem DOM), testável |
| `config.json` | Constantes do modelo, limites de entrada e textos da lâmina |
| `data/tabela_densidade_no_copo.json` | Tabela extraída de `tabela_densidade_no_copo.xlsx` |
| `tests/calc.test.js` | Testes do cálculo |

## Como o cálculo funciona

1. **Tampão equivalente (diâmetro e tampão).** A tabela original não considera a pressão do tampão. Ela é estimada pela equação de Janssen: o atrito na parede do furo limita a pressão, e o limite depende do diâmetro. A pressão é convertida em altura de emulsão equivalente usando uma densidade de referência fixa (1,00 g/cm³, em `config.json`). Assim a linha do furo não depende da densidade escolhida.
2. **Altura efetiva.** `coluna × cos(inclinação) + tampão equivalente`. A correção pelo cosseno segue a observação da própria tabela.
3. **Linha.** Usa a menor coluna da tabela que seja maior ou igual à altura efetiva (arredondamento para cima).
4. **Coluna.** A densidade desejada no fundo do furo (1,00 a 1,25 g/cm³, com duas casas decimais), digitada ou escolhida na lista. Sem ela, só a linha é marcada.
5. **Resultado.** A densidade no copo da célula marcada. Se a célula estiver vazia, a página informa "não tabelada" e não inventa valor. Valores iguais ou acima de `limiar_critico_g_cm3` são marcados como crítico.

Os parâmetros (gravidade, densidade do tampão, coeficiente de atrito, coeficiente de empuxo lateral K, limiar crítico) ficam em `config.json`.

## Lâmina em PDF

O botão **Exportar lâmina em PDF** abre a impressão do navegador com a lâmina A4 paisagem. Escolha "Salvar como PDF" como destino.

## Desenvolvimento

```powershell
npm test
```

Para ver a página localmente, sirva a pasta com um servidor estático (por exemplo `python -m http.server`). Abrir o `index.html` direto do disco não carrega a tabela, porque o navegador bloqueia `fetch` em `file://`.
