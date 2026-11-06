/* MGExplica — todo indicador do site ganha um "ⓘ": ao clicar, abre uma caixa explicando
   o que é, como foi calculado, por que importa e o que o valor atual significa.
   Funciona sozinho: observa a página e encaixa o ⓘ em qualquer indicador cujo rótulo
   esteja no dicionário abaixo (.kpi, .stat-tile, .hl-card, títulos de gráfico).
   Números específicos (ex.: as parcelas do OEE) chegam por el._mgDados. */
(function () {
  if (window.MGExplica) return;
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); };
  var br = function (x, d) { return x == null || !isFinite(x) ? '—' : Number(x).toLocaleString('pt-BR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var pc = function (x, d) { return x == null || !isFinite(x) ? '—' : br(x * 100, d == null ? 1 : d) + '%'; };
  var hh = function (s) { return s == null || !isFinite(s) ? '—' : br(s / 3600, 1) + ' h'; };
  var H = { br: br, pc: pc, hh: hh };

  // ---------------------------------------------------------------- dicionário
  // re: casa com o rótulo (sem acento, minúsculo). Cada campo pode ser texto (HTML simples)
  // ou função (ctx) => texto, onde ctx = { rotulo, valor, d (dados do número), H (formatadores) }.
  var D = [
    // ===== Painel OEE da Megadoor =====
    { re: /^oee aproximado/, titulo: 'OEE (Eficiência Global do Equipamento)',
      oque: 'O principal indicador do TPM: quanto do tempo disponível virou peça boa no ritmo certo. Junta as três perdas da máquina num número só.',
      calculo: function (c) { var d = c.d || {}; return 'OEE = Disponibilidade × Performance × Qualidade' + (d.disp != null ? '<br>= ' + pc(d.disp) + ' × ' + pc(Math.min(d.perf, 2)) + ' × ' + pc(d.qual) + ' = <b>' + pc(d.oee) + '</b>' : '') + '<br>A Performance entra limitada a 200% para um erro de dado não inflar o OEE.'; },
      importa: 'Mostra numa leitura só se a Megadoor está perdendo por estar parada (Disponibilidade), lenta (Performance) ou fazendo refugo (Qualidade). Referências: 85% é classe mundial; 60% é comum na indústria.',
      significa: function (c) { var o = (c.d || {}).oee; if (o == null) return 'Sem dados suficientes no período.'; return o >= 0.85 ? 'Nível de classe mundial. O foco é manter e atacar as maiores perdas que restam.' : o >= 0.6 ? 'Dentro do comum. Veja qual dos três fatores está mais baixo, porque é ele que puxa o OEE para baixo.' : 'Abaixo do comum. Veja qual dos três fatores está mais baixo: é por ele que vale começar.'; } },
    { re: /^disponibilidade/,
      oque: 'Fração do tempo em que a Megadoor podia trabalhar e de fato estava trabalhando.',
      calculo: function (c) { var d = c.d || {}; return 'Tempo disponível = dias de operação × 21 h (segunda a sábado; domingo é folga) − paradas externas (que não são culpa da máquina: intervalo, demora na montagem, erro de leitura, sem classificação).<br>Tempo operando = tempo disponível − paradas internas ("Não programada").<br>Disponibilidade = tempo operando ÷ tempo disponível' + (d.base != null ? '<br><br>Neste período: ' + br(d.dias) + ' dia(s) × 21 h = ' + hh(d.base) + '; − ' + hh(d.externas) + ' externas = <b>' + hh(d.disponivel) + '</b> disponíveis; − ' + hh(d.internas) + ' de paradas internas = <b>' + hh(d.operando) + '</b> operando → ' + pc(d.disp) + '.' : ''); },
      importa: 'É a perda por máquina parada: quebra, setup, ajustes. No TPM é onde atuam a manutenção autônoma e a planejada.',
      significa: function (c) { var v = (c.d || {}).disp; return v == null ? '' : 'De cada 10 horas em que a máquina devia estar rodando, ficou parada por causa própria cerca de ' + br((1 - v) * 10, 1) + ' h.'; } },
    { re: /^performance/,
      oque: 'Velocidade: se a máquina, enquanto rodava, produziu no ritmo do ciclo nominal.',
      calculo: function (c) { var d = c.d || {}; return 'Performance = (nº de ciclos × ciclo nominal) ÷ tempo operando' + (d.ciclos != null ? '<br>= (' + br(d.ciclos) + ' × ' + br(d.nominal) + ' s) ÷ ' + hh(d.operando) + ' = <b>' + pc(d.perf) + '</b>' : '') + '<br>Leituras abaixo do mínimo válido (provável erro de leitura) não contam como ciclo.'; },
      importa: 'Pega as perdas que não aparecem como parada: pequenas paradas abaixo do limiar e ciclos mais lentos do que deviam.',
      significa: function (c) { var v = (c.d || {}).perf; if (v == null) return ''; return v > 1.05 ? 'Acima de 100%: a máquina rodou mais rápido do que o ciclo nominal cadastrado. Vale revisar o ciclo nominal, ou ainda existem leituras falsas sendo contadas como ciclo.' : v >= 0.95 ? 'Rodou praticamente no ritmo nominal.' : 'Enquanto rodava, produziu ' + pc(1 - v, 0) + ' a menos do que o ritmo nominal permitiria.'; } },
    { re: /^qualidade/,
      oque: 'Fração das peças produzidas que saiu boa, sem refugo nem retrabalho.',
      calculo: function (c) { var d = c.d || {}; return 'Qualidade = (peças − defeitos) ÷ peças' + (d.qnt ? '<br>= (' + br(d.qnt) + ' − ' + br(d.def) + ') ÷ ' + br(d.qnt) + ' = <b>' + pc(d.qual) + '</b>' : '<br>Sem quantidade registrada no período: fica assumida como 100%.'); },
      importa: 'Peça ruim gasta tempo de máquina, material e mão de obra e não vira produto. É o terceiro pilar do OEE.',
      significa: function (c) { var d = c.d || {}; return d.qnt ? (d.def ? br(d.def) + ' peça(s) com defeito anotadas.' : 'Nenhum defeito anotado no período.') : 'Sem dado de quantidade, este número não diz nada ainda.'; } },
    { re: /^ciclo medio bruto/,
      oque: 'Tempo médio entre uma usinagem e a seguinte, contando tudo, inclusive as paradas.',
      calculo: function (c) { var d = c.d || {}; return 'Média de todos os tempos de ciclo do período' + (d.n != null ? ' (' + br(d.n) + ' ciclos)' : '') + '. A mediana é o valor do meio, depois de ordenar todos os ciclos.' + (d.min ? '<br>Ciclos abaixo de ' + br(d.min) + ' s ficam de fora (provável erro de leitura).' : ''); },
      importa: 'Diz quanto tempo, em média, custa cada peça na prática. Uma parada longa puxa a média para cima e quase não mexe na mediana.',
      significa: 'Se a média está muito acima da mediana, existem poucas paradas muito longas pesando. Se as duas estão altas, a lentidão é geral.' },
    { re: /^ciclo medio liquido/,
      oque: 'Tempo médio de usinagem só dos ciclos normais, sem as paradas.',
      calculo: function (c) { var d = c.d || {}; return 'Média dos ciclos entre o mínimo válido' + (d.min ? ' (' + br(d.min) + ' s)' : '') + ' e o limiar de parada' + (d.lim ? ' (' + br(d.lim) + ' s)' : '') + '. Acima do limiar conta como parada; abaixo do mínimo, como erro de leitura.'; },
      importa: 'É o ritmo real da máquina quando está rodando. Comparado ao ciclo nominal, mostra se a usinagem está mais lenta do que deveria.',
      significa: function (c) { var d = c.d || {}; return d.nominal && d.v ? (d.v > d.nominal ? 'Está ' + br(d.v - d.nominal, 1) + ' s acima do ciclo nominal (' + br(d.nominal) + ' s): cada peça demora mais do que o previsto.' : 'Está no ciclo nominal (' + br(d.nominal) + ' s) ou abaixo dele.') : ''; } },
    { re: /^paradas com causa confirmada/,
      oque: 'Quantas paradas internas da Megadoor (marcadas "Não programada") aconteceram no período.',
      calculo: function (c) { var d = c.d || {}; return 'Conta os ciclos acima do limiar de parada' + (d.lim ? ' (' + br(d.lim) + ' s)' : '') + ' cuja Programada é "Não programada". As outras (intervalo, demora na montagem etc.) são externas e ficam fora.'; },
      importa: 'São as paradas que a equipe da Megadoor pode eliminar: quebra, setup, ajuste, broca.',
      significa: 'Clique no cartão para ver quais foram e o Pareto de causas.' },
    { re: /^duracao media da parada/,
      oque: 'Quanto tempo, em média, dura cada parada interna.',
      calculo: 'Tempo perdido somado das paradas internas ÷ número de paradas internas. Tempo perdido de uma parada = tempo de ciclo − ciclo nominal.',
      importa: 'Separa dois problemas diferentes: muitas paradas curtas (atacar a frequência) ou poucas paradas longas (atacar o tempo de reparo, ou seja, o MTTR).',
      significa: 'Média alta com poucas paradas: o problema é o tempo para voltar a rodar (peças, ferramenta, diagnóstico). Média baixa com muitas paradas: o problema é a repetição.' },
    { re: /^kits perdidos \(reais\)|^kits perdidos$/,
      oque: 'Quantos kits deixaram de ser feitos por causa dos ciclos que passaram do takt time.',
      calculo: 'Para cada ciclo: kits perdidos = (tempo de ciclo − takt time) ÷ ciclo nominal. Aqui somamos só os valores positivos, ou seja, os ciclos que atrasaram.',
      importa: 'Traduz o tempo perdido numa unidade que todo mundo entende: kits que o cliente esperava e não saíram.',
      significa: 'É a perda real de produção do período, sem descontar os momentos em que a máquina andou adiantada.' },
    { re: /^kits .{0,3}saldo liquido/, titulo: 'Kits — saldo líquido',
      oque: 'O resultado final de atrasos e adiantamentos: kits perdidos nos ciclos lentos menos kits "ganhos" nos ciclos mais rápidos que o takt.',
      calculo: function (c) { var d = c.d || {}; return 'Para cada ciclo: (tempo de ciclo − takt time) ÷ ciclo nominal. Ciclo mais lento que o takt dá número positivo (perdeu); mais rápido dá número negativo (adiantou). O saldo é a soma de tudo.' + (d.real != null ? '<br><br>' + br(d.real, 1) + ' perdidos + (' + br(d.ganhos, 1) + ') adiantados = <b>' + br(d.liq, 1) + '</b>' : ''); },
      importa: 'Mostra se o ritmo adiantado dos ciclos normais compensou o atraso das paradas, isto é, se a demanda (takt) foi atendida no balanço do período.',
      significa: function (c) { var d = c.d || {}; if (d.liq == null) return ''; return d.liq < 0 ? 'Negativo: no balanço, a máquina andou à frente da demanda. Isso NÃO quer dizer que não houve perda: os ' + br(d.real, 1) + ' kits perdidos nas paradas aconteceram, só foram compensados pelo ritmo nos outros ciclos. Para melhorar, olhe "Kits perdidos (reais)".' : 'Positivo: mesmo com o ritmo adiantado dos ciclos normais, as paradas fizeram faltar ' + br(d.liq, 1) + ' kits em relação à demanda.'; } },
    { re: /^leituras desconsideradas/,
      oque: 'Ciclos tão curtos que não podem ser uma usinagem de verdade. Quase sempre é leitura dupla do sensor ou erro do coletor.',
      calculo: function (c) { var d = c.d || {}; return 'Todo ciclo abaixo do mínimo válido (' + br(d.min) + ' s, ajustável no topo do painel) sai dos cálculos de ciclo médio e mediana, Performance, kits e gráficos.'; },
      importa: 'Um ciclo de 5 s puxa a média e a mediana para baixo, conta como peça a mais (inflando a Performance) e aparece como kit "adiantado".',
      significa: function (c) { var d = c.d || {}; return br(d.n) + ' leitura(s) ficaram de fora' + (d.total ? ' (' + pc(d.n / d.total) + ' dos ciclos)' : '') + '. Clique no cartão para vê-las.'; } },
    // ===== Central de Perdas (Megadoor) =====
    { re: /^paradas no periodo/, oque: 'Todas as paradas acima do limiar, internas e externas.', calculo: 'Conta os ciclos acima do limiar de parada. Tempo = soma do tempo perdido de cada uma.', importa: 'É o tamanho total do problema, antes de separar o que é culpa da máquina.', significa: 'Clique para ver as paradas separadas por tipo.' },
    { re: /^internas ao megadoor/, oque: 'Paradas causadas pela própria máquina, marcadas "Não programada".', calculo: 'Paradas acima do limiar com Programada = "Não programada".', importa: 'São as únicas que contam contra a Disponibilidade, e as que a equipe da Megadoor pode atacar diretamente.', significa: 'Clique para ver as causas.' },
    { re: /^externas|^paradas externas/, oque: 'Paradas que não dependem da máquina: intervalo, demora na montagem, erro de leitura ou sem classificação.', calculo: 'Paradas acima do limiar com Programada diferente de "Não programada".', importa: 'Saem da Disponibilidade, mas são tempo que a linha perdeu. Algumas (demora na montagem) são perda de outro setor.', significa: 'Se este número for alto e estiver "sem classificação", falta apontamento: a perda pode ser da máquina e estar escondida.' },
    { re: /^maior causa interna/, oque: 'A categoria das 6 Grandes Perdas que mais tirou tempo da Megadoor no período.', calculo: 'Soma o tempo perdido das paradas internas por categoria e escolhe a maior.', importa: 'Pelo princípio de Pareto, é por ela que uma ação dá mais retorno.', significa: 'Comece a análise de causa raiz (5 porquês) por aqui.' },
    { re: /^horas$/, oque: 'Tempo somado das paradas externas.', calculo: 'Soma do tempo perdido das paradas que não são "Não programada".', importa: 'Mostra quanto tempo a linha perdeu por motivos fora da máquina.', significa: '' },
    // ===== Painel Montagem =====
    { re: /^tempo total apontado/, oque: 'Soma da duração de todos os apontamentos da Montagem no período.', calculo: 'Soma da coluna de tempo de cada apontamento, inclusive "Ignora OEE" e "Folga Fisiológica".', importa: 'É a base: dela sai quanto é perda e quanto não tem impacto.', significa: 'Clique para ver todos os apontamentos.' },
    { re: /^tempo perdido \(paradas\)/, oque: 'Tempo em que a Montagem ficou parada ou perdeu ritmo.', calculo: 'Tempo total apontado − apontamentos "Ignora OEE" e "Folga Fisiológica".', importa: 'É a perda real da linha de montagem, que depois é dividida nas 6 Grandes Perdas.', significa: 'O % ao lado diz quanto do tempo apontado foi perda.' },
    { re: /^tempo sem impacto/, oque: 'Apontamentos que não representam perda.', calculo: 'Soma dos apontamentos "Ignora OEE" (apenas anota passagem de kit) e "Folga Fisiológica".', importa: 'Separar esses apontamentos evita culpar a linha por tempo que não é perda.', significa: '' },
    { re: /^impacto da megadoor/, oque: 'Quanto da perda da Montagem foi causada pela Megadoor.', calculo: 'Soma do tempo perdido dos apontamentos com .MÁQUINA = MEGADOOR; o % é sobre todo o tempo perdido da Montagem.', importa: 'Mostra o efeito da Megadoor na linha seguinte: cada minuto parada pode parar a Montagem também.', significa: 'Quanto maior o %, mais a melhoria na Megadoor se reflete na Montagem.' },
    { re: /^concordam$/, oque: 'Apontamentos em que a Montagem e a Megadoor deram a mesma causa.', calculo: 'Cruza, pelo horário, cada apontamento da Montagem marcado Megadoor com a parada da Megadoor no mesmo momento e compara as categorias pelo mapa de equivalência.', importa: 'Quanto mais concordância, mais confiáveis são os apontamentos dos dois lados.', significa: 'Clique para filtrar a lista abaixo.' },
    { re: /^classificacao diferente/, oque: 'Os dois lados apontaram a mesma parada com causas diferentes.', calculo: 'Cruzamento por horário; as categorias não batem no mapa de equivalência.', importa: 'Indica dúvida na classificação. Vale alinhar com os operadores.', significa: 'Clique para filtrar a lista abaixo.' },
    { re: /^megadoor: parada externa/, oque: 'A Montagem culpou a Megadoor, mas na Megadoor a parada estava como externa.', calculo: 'Cruzamento por horário; a parada da Megadoor não é "Não programada".', importa: 'Um dos dois lados está errado. Pode ser perda da Megadoor escondida.', significa: 'Clique para filtrar a lista abaixo.' },
    { re: /^sem parada na megadoor/, oque: 'A Montagem apontou Megadoor, mas a Megadoor não parou naquele horário.', calculo: 'Nenhum ciclo acima do limiar na janela de horário do apontamento.', importa: 'Pode ser horário apontado errado, ou falta de peça vinda de outro lugar.', significa: 'Clique para filtrar a lista abaixo.' },
    { re: /^megadoor nao classificou/, oque: 'Houve parada na Megadoor no horário, mas ninguém a classificou.', calculo: 'Cruzamento por horário; a parada da Megadoor está sem Programada.', importa: 'Falta de apontamento na Megadoor.', significa: 'Clique para filtrar a lista abaixo.' },
    { re: /^quebra$/, oque: 'Horas de parada por quebra de máquina no período, contra a meta do programa TPM.', calculo: 'Soma do tempo dos apontamentos de quebra. O "ritmo" é a meta total do programa dividida proporcionalmente aos dias do período.', importa: 'Quebra zero é o objetivo da manutenção autônoma e planejada.', significa: 'Verde: dentro do ritmo para cumprir a meta. Vermelho: acima.' },
    { re: /^setup$/, oque: 'Horas gastas em setup e ajuste no período, contra a meta do programa TPM.', calculo: 'Soma do tempo dos apontamentos de setup. O "ritmo" é a meta dividida proporcionalmente aos dias do período.', importa: 'Setup longo tira tempo produtivo. É atacado com SMED (troca rápida).', significa: 'Verde: dentro do ritmo. Vermelho: acima.' },
    { re: /^limpeza .{0,3}% feito por turno/, oque: 'Percentual da limpeza feita por turno no período, contra a meta.', calculo: 'Para cada limpeza já vencida: itens feitos (V) ÷ itens que se aplicam. A média das limpezas do turno no período dá o %.', importa: 'Limpeza é inspeção: é na limpeza que se acham as anomalias antes de virarem quebra (pilar de manutenção autônoma).', significa: 'Barra verde: atingiu a meta. Vermelha: abaixo.' },
    { re: /^mantenedor/, oque: 'Percentual das ordens de serviço (OS) do mantenedor que foram executadas.', calculo: '"Acumulado do programa" usa a célula da planilha de OS; "Só as OS deste período" considera as OS com data no período: feitas ÷ total.', importa: 'OS aberta e não fechada é anomalia que continua na máquina.', significa: '' },
    // ===== Sistema: Apontamentos / Radar =====
    { re: /^paradas acima do takt|^paradas acima/, oque: 'Quantas paradas no filtro passaram do takt time (o tempo máximo de um ciclo para atender a demanda).', calculo: 'Conta os registros do coletor com tempo de ciclo maior que o takt do dia.', importa: 'São as paradas que o operador precisa apontar.', significa: '' },
    { re: /^apontadas pelo operador|^apontadas pelo proprio turno/, oque: 'Paradas que o próprio turno apontou no coletor.', calculo: 'Paradas acima do takt com o campo do operador preenchido pelo turno em que aconteceram.', importa: 'Mostra a disciplina de apontamento. Sem apontamento não há como saber a causa.', significa: 'Quanto mais perto do total, melhor.' },
    { re: /^turno anterior nao preencheu|^deixadas para o turno seguinte/, oque: 'Paradas que ficaram sem apontamento e o turno seguinte marcou como "turno anterior não preencheu".', calculo: 'Paradas acima do takt com essa marcação.', importa: 'É apontamento perdido: quem pegou a máquina não sabe o que aconteceu.', significa: 'Quanto menor, melhor.' },
    { re: /^pendentes/, oque: 'Paradas acima do takt sem nenhum apontamento.', calculo: 'Paradas sem classificação do operador e sem a sua classificação.', importa: 'São perdas sem causa conhecida.', significa: 'O ideal é zero.' },
    { re: /^nao preenchidas/, oque: 'Paradas acima do limite sem apontamento de ninguém, ou marcadas por você como "não preenchido".', calculo: 'Total − apontadas pelo próprio turno − deixadas para o turno seguinte.', importa: 'São perdas sem causa conhecida.', significa: 'O ideal é zero.' },
    { re: /^preenchimento do proprio turno/, oque: 'Percentual das paradas que o próprio turno apontou.', calculo: 'Apontadas pelo próprio turno ÷ paradas acima do limite.', importa: 'É o indicador da disciplina de apontamento de cada turno.', significa: 'Verde ≥ 90%, amarelo ≥ 70%, vermelho abaixo disso.' },
    { re: /^classificadas por voce/, oque: 'Paradas acima do takt que você já classificou (Programada preenchida).', calculo: 'Conta as paradas no filtro com a sua classificação.', importa: 'Mostra quanto da análise já está feita.', significa: '' },
    { re: /^media do ciclo \(paradas\)/, oque: 'Duração média das paradas acima do takt no filtro.', calculo: 'Média do tempo de ciclo dessas paradas.', importa: 'Ajuda a ver se as paradas são longas ou curtas.', significa: '' },
    { re: /^tempo perdido acima do takt/, oque: 'Tempo que as paradas passaram do takt.', calculo: 'Soma de (tempo de ciclo − takt) de cada parada.', importa: 'É o tempo de produção que faltou para atender a demanda.', significa: '' },
    { re: /^tempo perdido por setup/, oque: 'Parte do tempo perdido que foi setup e ajuste.', calculo: 'Soma de (ciclo − takt) das paradas com 6 Grandes Perdas = "Setup e ajuste" (partes de apontamentos divididos entram proporcionalmente).', importa: 'Meta do programa TPM. É atacado com SMED.', significa: '' },
    { re: /^tempo perdido por quebra/, oque: 'Parte do tempo perdido que foi quebra de máquina.', calculo: 'Soma de (ciclo − takt) das paradas com subgrupo "Quebra de máquina" (partes de apontamentos divididos entram proporcionalmente).', importa: 'Meta do programa TPM. Quebra zero é o objetivo.', significa: '' },
    { re: /^turno [abc]$/, oque: 'Pendências desse turno.', calculo: 'Paradas acima do takt sem apontamento, do turno.', importa: 'Mostra qual turno mais deixa paradas sem apontar.', significa: '' },
    // ===== Divergências =====
    { re: /^comparadas/, oque: 'Paradas em que você e o operador classificaram.', calculo: 'Paradas acima do takt com a sua classificação e a do operador.', importa: 'É a base da comparação.', significa: '' },
    { re: /^coincidem/, oque: 'Paradas em que a sua classificação e a do operador batem (ou que você considerou convergentes).', calculo: 'Compara o seu subgrupo (ou Programada) com o do operador, depois de converter os nomes antigos.', importa: 'Mostra se os operadores entendem as categorias.', significa: '' },
    { re: /^divergem/, oque: 'Paradas em que você e o operador deram causas diferentes.', calculo: 'Comparadas − coincidem.', importa: 'As divergências mais frequentes mostram onde treinar os operadores ou ajustar os menus.', significa: 'Clique numa barra abaixo para ver as paradas.' },
    { re: /^so voce classificou/, oque: 'Paradas que só você classificou.', calculo: 'Sua classificação preenchida e operador vazio.', importa: 'São paradas em que o operador não apontou.', significa: '' },
    { re: /^so o operador apontou/, oque: 'Paradas que só o operador apontou.', calculo: 'Operador preenchido e sua classificação vazia.', importa: 'É o que ainda falta você revisar.', significa: '' },
    // ===== Montagem / Limpeza / OS / Takt =====
    { re: /^apontamentos no filtro/, oque: 'Quantos apontamentos da Montagem estão no filtro atual.', calculo: 'Contagem das linhas que passam nos filtros.', importa: '', significa: '' },
    { re: /^tempo perdido \(sem ignora/, oque: 'Tempo apontado na Montagem que é perda.', calculo: 'Soma do tempo, sem os apontamentos "Ignora OEE" e "Folga Fisiológica".', importa: 'É a perda real da Montagem no filtro.', significa: '' },
    { re: /^marcados megadoor/, oque: 'Apontamentos da Montagem causados pela Megadoor.', calculo: 'Conta e soma o tempo dos apontamentos com .MÁQUINA = MEGADOOR.', importa: 'É o impacto da Megadoor na linha.', significa: '' },
    { re: /^sem \.maquina/, oque: 'Perdas sem a máquina de origem preenchida.', calculo: 'Apontamentos de perda com .MÁQUINA vazia.', importa: 'Sem a máquina, não dá para saber quanto foi culpa da Megadoor.', significa: 'O ideal é zero.' },
    { re: /^turno [abc] .{0,3}media ate ontem/, oque: 'Percentual médio da limpeza do turno até ontem.', calculo: 'Para cada limpeza já preenchida: itens feitos (V) ÷ itens que se aplicam. Linhas ainda sem nada preenchido não contam. Depois, a média de todas.', importa: 'Meta do programa: 90% até o fim de fevereiro de 2027. Limpeza é inspeção, é nela que se acham as anomalias.', significa: 'Abaixo do número estão o máximo ainda alcançável e quantas limpezas o turno ainda pode faltar e bater a meta.' },
    { re: / os$/, oque: 'Percentual médio de execução das OS desse mantenedor.', calculo: 'Média do % de cada OS (itens feitos ÷ itens). "Das feitas" considera só as OS marcadas como feitas.', importa: 'OS aberta é anomalia que continua na máquina.', significa: '' },
    { re: /^takt em vigor/, oque: 'O tempo máximo de um ciclo para atender a demanda.', calculo: 'Tempo disponível ÷ demanda do cliente; definido por período nesta aba.', importa: 'Ciclo acima do takt é parada que precisa ser apontada, e é a base dos kits perdidos.', significa: '' },
    { re: /^ciclo nominal em vigor/, oque: 'O tempo ideal de um ciclo da máquina.', calculo: 'Definido por período nesta aba.', importa: 'É a referência da Performance e dos kits perdidos.', significa: '' },
    { re: /^proxima mudanca/, oque: 'O próximo takt já cadastrado e quando ele começa.', calculo: '', importa: '', significa: '' },
    // ===== Gráficos =====
    { re: /^tempo de ciclo por dia/, oque: 'A média diária do tempo de ciclo: bruto (com paradas) e líquido (só os ciclos normais).', calculo: 'Para cada dia, média dos ciclos válidos (sem as leituras abaixo do mínimo).', importa: 'Mostra se a máquina está ficando mais lenta com o tempo.', significa: 'Clique num ponto para ver os registros do dia.' },
    { re: /^paradas por dia/, oque: 'Quantas paradas internas houve em cada dia.', calculo: 'Conta, por dia, os ciclos acima do limiar marcados "Não programada".', importa: 'Mostra se as paradas estão diminuindo depois das ações.', significa: 'Clique numa barra para ver as paradas do dia.' },
    { re: /^kits perdidos por dia/, oque: 'Kits perdidos (vermelho, para cima) e adiantados (azul, para baixo) em cada dia.', calculo: 'Por ciclo: (tempo de ciclo − takt) ÷ ciclo nominal; somado por dia, separando positivos e negativos.', importa: 'Mostra em quais dias a demanda não foi atendida.', significa: 'Clique numa barra para ver os registros do dia.' },
    { re: /^comparacao por turno/, oque: 'Ciclo médio de cada turno.', calculo: 'Média dos ciclos válidos de cada turno.', importa: 'Diferenças grandes entre turnos indicam diferença de método ou de cuidado com a máquina.', significa: 'Clique numa barra para ver as paradas do turno.' },
    { re: /^tempo de ciclo real/, oque: 'Como se distribuem os tempos dos ciclos normais.', calculo: 'Histograma dos ciclos entre o mínimo válido e o limiar de parada, com a curva normal por cima.', importa: 'Uma distribuição estreita perto do nominal indica processo estável.', significa: 'Clique numa barra para ver os ciclos daquela faixa.' },
    { re: /^duracao das paradas/, oque: 'Como se distribuem as durações das paradas.', calculo: 'Histograma do tempo perdido das paradas acima do limiar.', importa: 'Separa pequenas paradas frequentes de paradas longas.', significa: 'Clique numa barra para ver as paradas.' },
    { re: /^perdas por causa/, oque: 'Ranking das causas (Grupo do OEE · 6 Grandes Perdas) pelo tempo perdido.', calculo: 'Soma o tempo perdido das paradas classificadas, por causa; mostra as 10 maiores.', importa: 'É o Pareto: poucas causas costumam responder pela maior parte da perda.', significa: 'Ataque primeiro as barras do topo. Clique numa barra para ver e editar os apontamentos dela. A linha cinza, "Sem Grupo do OEE / 6 Grandes Perdas", junta as paradas externas (Intervalo, Atraso na montagem etc., que ficam gravadas com "-") e as que ainda não foram classificadas.' },
    { re: /^qualidade do preenchimento/, oque: 'Quanto das paradas tem cada campo de classificação preenchido.', calculo: 'Paradas com o campo preenchido ÷ paradas que deveriam tê-lo. Grupo, 6 Grandes Perdas e Subgrupo só valem para as internas ("Não programada").', importa: 'Sem classificação, os rankings de causa ficam incompletos.', significa: 'Verde ≥ 50%, amarelo ≥ 10%, vermelho abaixo. Clique numa linha para ver os registros.' },
    { re: /^pareto em camadas|^maiores paradas/, titulo: 'Pareto em camadas', oque: 'Pareto dentro de Pareto: mostra qual subgrupo mais tira tempo; dentro dele, qual conjunto; dentro do conjunto, qual item; depois qual problema e qual solução, até não dar mais para agrupar.', calculo: 'Em cada nível, soma o tempo perdido (ciclo − ciclo nominal) das paradas de cada grupo e ordena do maior para o menor. "Acumulado" é a soma dos % até aquela linha. Os nomes escritos de jeitos diferentes contam juntos quando foram padronizados na aba Menus; maiúsculas, acentos e espaços já são ignorados.', importa: 'Pelo princípio de Pareto, poucas causas respondem pela maior parte da perda (regra 80/20). Descendo camada por camada, você chega no problema específico que, resolvido, devolve mais tempo de máquina.', significa: 'Os grupos em negrito e azul são os "poucos vitais", que somam 80% do tempo do recorte. Em vermelho: tempo sem descrição, que é falta de apontamento. Clique numa barra para descer; clique na trilha para voltar.' }
  ];

  // ---------------------------------------------------------------- caixa
  function css() {
    if (document.getElementById('mgx-css')) return;
    var s = document.createElement('style'); s.id = 'mgx-css';
    s.textContent =
      '.mgx-i{position:absolute;top:6px;right:6px;width:18px;height:18px;border-radius:50%;border:1px solid currentColor;background:transparent;color:inherit;opacity:.45;font:600 11px/16px Georgia,serif;font-style:italic;padding:0;cursor:pointer;z-index:2}' +
      '.mgx-i:hover,.mgx-i:focus-visible{opacity:1}' +
      '.mgx-i.inl{position:static;display:inline-block;vertical-align:middle;margin-left:6px}' +
      '.mgx-alvo{position:relative}.mgx-clic{cursor:help}.mgx-alvo>span:first-child,.mgx-alvo>.k,.mgx-alvo>.hl-label{padding-right:18px}' +
      '.mgx-fundo{position:fixed;inset:0;background:rgba(10,14,18,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.mgx-caixa{background:var(--surface,var(--card,#fff));color:var(--ink,var(--text,#10161a));border-radius:12px;max-width:560px;width:100%;max-height:85vh;overflow:auto;overscroll-behavior:contain;box-shadow:0 12px 40px rgba(0,0,0,.3);padding:18px 22px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}' +
      '.mgx-caixa h3{margin:0 28px 2px 0;font-size:17px}.mgx-val{font-size:26px;font-weight:700;margin:4px 0 6px}' +
      '.mgx-caixa h4{margin:12px 0 2px;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;opacity:.65}.mgx-caixa p{margin:0}' +
      '.mgx-x{position:sticky;float:right;top:0;border:0;background:transparent;font-size:18px;cursor:pointer;color:inherit;opacity:.6}' +
      '.mgx-acao{margin-top:14px;padding:7px 12px;border-radius:8px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;font:inherit}' +
      '@media (prefers-color-scheme: dark){.mgx-caixa{background:var(--surface,#1b2128);color:var(--ink,#eef2f6)}}';
    document.head.appendChild(s);
  }
  function fechar() { var f = document.getElementById('mgx-fundo'); if (f) f.remove(); }
  function val(x, ctx) { return typeof x === 'function' ? x(ctx) : x; }
  function abrir(def, ctx) {
    css(); fechar();
    ctx = ctx || {}; ctx.H = H;
    var f = document.createElement('div'); f.className = 'mgx-fundo'; f.id = 'mgx-fundo';
    var cx = document.createElement('div'); cx.className = 'mgx-caixa'; cx.setAttribute('role', 'dialog'); cx.setAttribute('aria-modal', 'true');
    var h = '<button class="mgx-x" type="button" aria-label="Fechar">✕</button><h3>' + (val(def.titulo, ctx) || ctx.rotulo || '') + '</h3>';
    if (ctx.valor) h += '<div class="mgx-val">' + ctx.valor + '</div>';
    [['O que é', def.oque], ['Como é calculado', def.calculo], ['Por que importa', def.importa], ['O que significa agora', def.significa]].forEach(function (p) {
      var t = val(p[1], ctx); if (t) h += '<h4>' + p[0] + '</h4><p>' + t + '</p>';
    });
    cx.innerHTML = h;
    if (ctx.acao) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mgx-acao'; b.textContent = ctx.acao.texto;
      b.onclick = function () { fechar(); ctx.acao.fn(); }; cx.appendChild(b);
    }
    f.appendChild(cx); document.body.appendChild(f);
    f.addEventListener('click', function (e) { if (e.target === f) fechar(); });
    cx.querySelector('.mgx-x').onclick = fechar;
    cx.querySelector('.mgx-x').focus();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('mgx-fundo')) { e.stopPropagation(); fechar(); } }, true);

  function achar(rotulo) { var n = norm(rotulo); for (var i = 0; i < D.length; i++) if (D[i].re.test(n)) return D[i]; return null; }

  // ---------------------------------------------------------------- encaixe automático
  // [seletor do cartão, seletor do rótulo dentro dele, seletor do valor, ⓘ em linha?]
  var ALVOS = [
    ['.kpi', ':scope > span:first-child', ':scope > b', false],
    ['.stat-tile', ':scope > .k', ':scope > .v', false],
    ['.hl-card', ':scope > .hl-label', ':scope > .hl-big', false],
    ['.chart-head', ':scope > h3', null, true],
    ['.mgx-sec', null, null, true]
  ];
  function encaixar(cartao, cfg) {
    if (cartao.dataset.mgx) return;
    var rotEl = cfg[1] ? cartao.querySelector(cfg[1]) : cartao;
    if (!rotEl) return;
    var rotulo = (cartao.dataset.mgxRotulo || rotEl.textContent || '').trim();
    var def = cartao._mgxDef || achar(rotulo);
    if (!def) return;
    cartao.dataset.mgx = '1';
    var abre = function (e) {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      var vEl = cfg[2] ? cartao.querySelector(cfg[2]) : null;
      abrir(def, { rotulo: rotulo, valor: vEl ? vEl.textContent.trim() : '', d: cartao._mgDados, acao: cartao._mgxAcao });
    };
    var b = document.createElement('button'); b.type = 'button'; b.className = 'mgx-i' + (cfg[3] ? ' inl' : ''); b.textContent = 'i';
    b.title = 'O que é este indicador?'; b.setAttribute('aria-label', 'Explicar: ' + rotulo);
    b.addEventListener('click', abre);
    if (cfg[3]) rotEl.appendChild(b);
    else {
      cartao.classList.add('mgx-alvo'); cartao.appendChild(b);
      // cartão sem ação própria: clicar em qualquer lugar dele também explica
      if (cartao.style.cursor !== 'pointer' && !cartao.onclick) { cartao.classList.add('mgx-clic'); cartao.addEventListener('click', function (e) { if (!e.target.closest('button,a,input,select,textarea')) abre(e); }); }
    }
  }
  function varrer(raiz) {
    raiz = raiz || document;
    ALVOS.forEach(function (cfg) {
      if (raiz.matches && raiz.matches(cfg[0])) encaixar(raiz, cfg);
      if (raiz.querySelectorAll) raiz.querySelectorAll(cfg[0]).forEach(function (c) { encaixar(c, cfg); });
    });
  }
  var pend = false;
  function agendar() { if (pend) return; pend = true; requestAnimationFrame(function () { pend = false; varrer(document); }); }
  function iniciar() {
    css(); varrer(document);
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar);

  window.MGExplica = { abrir: abrir, achar: achar, varrer: varrer, dicionario: D, H: H };

  /* ---------------------------------------------------------------- MGJanela
     Toda janela por cima da página (explicação ⓘ, registros de uma barra, gráfico
     ampliado, editor, divisão de apontamento) precisa: (1) caber na parte da tela que a
     pessoa está vendo — o Painel e a Análise Megadoor ficam dentro de iframes, às vezes do
     tamanho do conteúdo inteiro, então "centralizar" jogava a janela para longe e deixava
     maior que a tela; (2) rolar sozinha, sem levar a página de trás junto. */
  var FUNDOS = '.mgx-fundo, .drill-modal-backdrop.show, .dv-fundo:not([hidden])';
  var CAIXAS = '.mgx-caixa, .drill-modal, .dv-jan';
  // parte visível desta janela na tela de verdade (subindo por todos os iframes), em coordenadas desta janela
  function regiao() {
    var lo = 0, hi = window.innerHeight, acc = 0, w = window;
    try {
      while (w !== w.top && w.frameElement) {
        var fe = w.frameElement, r = fe.getBoundingClientRect();
        acc += r.top + (fe.clientTop || 0);
        w = w.parent;
        lo = Math.max(lo, -acc); hi = Math.min(hi, w.innerHeight - acc);
      }
    } catch (e) { /* outra origem: fica com a própria janela */ }
    if (hi - lo < 160) { lo = Math.max(0, lo); hi = lo + Math.max(160, Math.min(window.innerHeight, 600)); }
    return { top: lo, height: hi - lo };
  }
  function janelas() { var ws = [window], w = window; try { while (w !== w.top && w.frameElement) { w = w.parent; ws.push(w); } } catch (e) {} return ws; }
  var travado = false;
  function travar(sim) {
    if (sim === travado) return; travado = sim;
    janelas().forEach(function (w) {
      try {
        var de = w.document.documentElement, n = +(de.dataset.mgTrava || 0) + (sim ? 1 : -1);
        if (sim && n === 1) { de.dataset.mgOverflow = de.style.overflow || ''; de.style.overflow = 'hidden'; w.document.body.style.overscrollBehavior = 'none'; }
        if (!sim && n <= 0) { de.style.overflow = de.dataset.mgOverflow || ''; delete de.dataset.mgOverflow; w.document.body.style.overscrollBehavior = ''; n = 0; }
        de.dataset.mgTrava = String(n);
      } catch (e) {}
    });
  }
  function encaixarJanelas() {
    var fundos = Array.prototype.filter.call(document.querySelectorAll(FUNDOS), function (f) { return f.offsetParent !== null || getComputedStyle(f).display !== 'none'; });
    travar(fundos.length > 0);
    if (!fundos.length) return;
    var rg = regiao();
    fundos.forEach(function (f) {
      if (!f.classList.contains('dv-fundo')) { f.style.top = rg.top + 'px'; f.style.height = rg.height + 'px'; f.style.bottom = 'auto'; f.style.left = '0'; f.style.right = '0'; f.style.overscrollBehavior = 'contain'; }
      var cx = f.matches('.dv-fundo') ? document.querySelector('.dv-jan') : f.querySelector(CAIXAS);
      if (!cx) return;
      var folga = f.classList.contains('dv-fundo') ? 90 : 40;
      cx.style.maxHeight = Math.max(140, rg.height - folga) + 'px';
      if (f.classList.contains('dv-fundo')) cx.style.top = (rg.top + 50) + 'px';
    });
  }
  (function () {
    var st = document.createElement('style');
    st.textContent = '.mgx-caixa,.drill-modal-body,.dv-jan,.drill-modal>div{overscroll-behavior:contain}.mgx-caixa{max-height:none}';
    (document.head || document.documentElement).appendChild(st);
    var pend2 = false;
    var ag = function () { if (pend2) return; pend2 = true; requestAnimationFrame(function () { pend2 = false; encaixarJanelas(); }); };
    var ok = function () {
      new MutationObserver(ag).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
      janelas().forEach(function (w) { try { w.addEventListener('resize', ag); } catch (e) {} });
      // a janela de trás ainda pode rolar antes da trava (ex.: rolagem já em andamento): reencaixa
      janelas().slice(1).forEach(function (w) { try { w.addEventListener('scroll', ag, { passive: true }); } catch (e) {} });
    };
    if (document.body) ok(); else document.addEventListener('DOMContentLoaded', ok);
    // página (ou iframe) fechada/recarregada com a janela aberta: não deixa a de trás travada
    window.addEventListener('pagehide', function () { travar(false); });
  })();
  window.MGJanela = { encaixar: encaixarJanelas, regiao: regiao };
})();
