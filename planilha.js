// Monta, a partir dos dados do sistema, uma planilha igual à "Apontamentos (MEGADOOR)":
// abas Apontamentos, Limpeza (com as cores), OS, apontamentos_montagem e menus.
// É usada pelo Painel Montagem (que lê essas abas exatamente como lia o arquivo) e pelo backup.
// Precisa de: XLSX (SheetJS) e MG (comum.js).
window.MGPlanilha = (function () {
  const COR = { verde: 'FF00B050', azul: 'FF0070C0', vermelho: 'FFFF0000', laranja: 'FFFFC000', cinza: 'FFD9D9D9' };
  const pad = n => String(n).padStart(2, '0');

  // ---- conversões para o formato numérico do Excel (dias desde 30/12/1899) ----
  function serialDia(iso) {               // 'AAAA-MM-DD' -> número
    if (!iso) return null;
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  }
  function fracHora(hms) {                // 'HH:MM:SS' -> fração do dia
    if (!hms) return null;
    const p = String(hms).split(':').map(Number);
    return ((p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0)) / 86400;
  }
  function serialDataHora(txt) {          // 'AAAA-MM-DD HH:MM:SS' -> número
    if (!txt) return null;
    const s = String(txt).replace('T', ' ');
    return serialDia(s.slice(0, 10)) + (fracHora(s.slice(11, 19)) || 0);
  }
  function hojeISO() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // ---- regras ----
  // Itens da limpeza: V feita (verde), J justificada (V azul), P erro de planejamento (V vermelho),
  // F faltou (F vermelho), '' ainda não preenchido (F), '-' não se aplica (laranja, vazio).
  function totalLimpeza(itens) {
    const ap = (itens || []).filter(x => x !== '-');
    if (!ap.length) return 0;
    return ap.filter(x => x === 'V' || x === 'J' || x === 'P').length / ap.length;
  }
  function totalOS(o) {
    const ok = v => v != null && String(v).trim() !== '';
    return [o.conjunto, o.item, o.problema, o.solucao].filter(ok).length / 4;
  }
  const chaveNome = n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

  // ---- leitura do sistema ----
  async function lerTudo(aoProgresso) {
    const p = aoProgresso || (() => {});
    const [coletor, classif, montagem, limpeza, os, subgrupos, programadas, ajustes] = await Promise.all([
      MG.buscarTudo('coletor', 'nreg,data_hora,dia,hora,hora_anterior,t_ciclo_s,idturno,menuid,qnt,qntdefeito,anulado,oee_operador,conjunto,problema,solucao,observacao,item', null, 'nreg',
        (a, t) => p(`Lendo apontamentos da Megadoor: ${a.toLocaleString('pt-BR')} de ${t.toLocaleString('pt-BR')}`)),
      MG.buscarTudo('classificacao', '*'),
      MG.buscarTudo('montagem', '*'),
      MG.buscarTudo('limpeza', '*', null, ['data', 'turno']),
      MG.buscarTudo('os', '*', null, 'id'),
      MG.sb.from('subgrupos').select('*').then(r => { if (r.error) throw r.error; return r.data; }),
      MG.sb.from('programadas').select('*').then(r => { if (r.error) throw r.error; return r.data; }),
      MG.carregarTakt(),
      MG.buscarTudo('ajustes', '*').catch(() => [])
    ]).then(r => [...r.slice(0, 7), r[8]]);
    return { coletor, classif, montagem, limpeza, os, subgrupos, programadas, ajustes };
  }

  // ---- abas ----
  function abaApontamentos(d) {
    const cls = {}; d.classif.forEach(c => cls[c.nreg] = c);
    const aj = {}; (d.ajustes || []).forEach(a => aj[a.nreg] = a);
    const NOMES = { conjunto: 'CONJUNTO', item: 'ITEM', problema: 'PROBLEMA', solucao: 'SOLUÇÃO' };
    const cab = ['REGISTRO', 'DATA E HORA', 'DATA', 'DIA', 'MÊS', 'ANO', 'HORA', 'H ANTERIOR', 'T CICLO', 'TURNO', 'T CICLO NOMINAL',
      'T PERDIDO', 'TAKT TIME', 'FORA DO TAKT TIME', 'KITS PERDIDOS', 'PROGRAMADA', 'GRUPO DO EE', '6 GRANDES PERDAS', 'SUBGRUPO DO OEE',
      'OEE Operador', 'CONJUNTO', 'ITEM', 'PROBLEMA', 'SOLUÇÃO', 'OBSERVAÇÕES', 'qnt', 'qntdefeito', 'MINHAS OBSERVAÇÕES', 'PREENCHIDO POR MIM'];
    const linhas = [cab];
    for (const l of d.coletor) {
      const c = cls[l.nreg] || {};
      const a = aj[l.nreg] || {};
      const v = k => a[k] != null ? a[k] : l[k];
      const meus = Object.keys(NOMES).filter(k => a[k] != null).map(k => NOMES[k]).join(', ');
      const tc = l.t_ciclo_s;
      const tk = MG.taktDe(l.dia || l.data_hora);
      const dia = l.dia || (l.data_hora ? String(l.data_hora).slice(0, 10) : null);
      const [y, m, dd] = dia ? dia.split('-').map(Number) : [null, null, null];
      linhas.push([l.nreg, serialDataHora(l.data_hora), serialDia(dia), dd, m, y, fracHora(l.hora), fracHora(l.hora_anterior),
        tc, l.idturno, tk.nominal, tc == null ? null : tc - tk.nominal, tk.takt, tc == null ? null : tc - tk.takt,
        tc == null ? null : (tc - tk.takt) / tk.nominal, c.programada || null, c.grupo || null, c.seis_perdas || null, c.subgrupo || null,
        l.oee_operador, v('conjunto'), v('item'), v('problema'), v('solucao'), l.observacao,
        l.qnt, l.qntdefeito != null ? l.qntdefeito : (l.qnt == null ? null : 0), a.obs || null, meus || null]);
    }
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    marcarFormato(ws, linhas.length, [1], 'dd/mm/yyyy hh:mm:ss');
    marcarFormato(ws, linhas.length, [2], 'dd/mm/yyyy');
    marcarFormato(ws, linhas.length, [6, 7], 'hh:mm:ss');
    return ws;
  }

  function abaLimpeza(d, comCores) {
    const regs = d.limpeza.slice().sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 'CAB'.indexOf(a.turno) - 'CAB'.indexOf(b.turno));
    const nItens = Math.max(38, ...regs.map(r => (r.itens || []).length));
    const numeros = Array.from({ length: nItens - 1 }, (_, i) => i + 1);  // 1..37 + coluna C
    const hoje = hojeISO();
    const media = t => {
      const xs = regs.filter(r => r.turno === t && r.data < hoje).map(r => totalLimpeza(r.itens));
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    const aoa = [];
    aoa[0] = ['LIMPEZA'];
    aoa[1] = []; aoa[1][5] = 'TURNO A'; aoa[1][10] = 'TURNO B'; aoa[1][15] = 'TURNO C';
    aoa[1][21] = 'V - Justificada, mas por erros de planejamento'; aoa[1][31] = 'V - Justificada'; aoa[1][36] = 'F - Faltou'; aoa[1][41] = 'V - Foi feita';
    aoa[2] = []; aoa[2][1] = serialDia(hoje); aoa[2][5] = media('A'); aoa[2][10] = media('B'); aoa[2][15] = media('C');
    aoa[3] = ['N', 'DATA', 'T', 'HORÁRIO INÍCIO', 'HORÁRIO FIM', ...numeros, 'C', 'TOTAL', 'PENDÊNCIAS', 'OBSERVAÇÕES'];
    const iTotal = 5 + nItens;
    let n = 0, ultimaData = null;
    regs.forEach(r => {
      if (r.data !== ultimaData) { n++; ultimaData = r.data; }
      const linha = [n, serialDia(r.data), r.turno, fracHora(r.inicio), fracHora(r.fim)];
      for (let i = 0; i < nItens; i++) {
        const x = (r.itens || [])[i];
        linha.push(x === 'V' || x === 'J' || x === 'P' ? 'V' : x === '-' ? null : 'F');
      }
      linha.push(totalLimpeza(r.itens), r.pendencias || null, r.observacoes || null);
      aoa.push(linha);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (comCores) {
      regs.forEach((r, k) => {
        for (let i = 0; i < nItens; i++) {
          const x = (r.itens || [])[i];
          const rgb = x === 'V' ? COR.verde : x === 'J' ? COR.azul : (x === 'P' || x === 'F') ? COR.vermelho : x === '-' ? COR.laranja : null;
          if (!rgb) continue;
          const ref = XLSX.utils.encode_cell({ r: 4 + k, c: 5 + i });
          if (!ws[ref]) ws[ref] = { t: 's', v: '' };
          ws[ref].s = { patternType: 'solid', fgColor: { rgb } };
        }
      });
    }
    marcarFormato(ws, aoa.length, [1], 'dd/mm/yyyy', 4);
    marcarFormato(ws, aoa.length, [3, 4], 'hh:mm', 4);
    marcarFormato(ws, aoa.length, [iTotal], '0%', 4);
    return ws;
  }

  function abaOS(d) {
    const regs = d.os.slice().sort((a, b) => (a.posicao || 1e9) - (b.posicao || 1e9) || a.id - b.id);
    const aoa = [];
    // Topo: % do mantenedor DOUGLAS (mesmas fórmulas E2 e E3 da planilha)
    const doug = regs.filter(o => chaveNome(o.mantenedor) === 'DOUGLAS');
    const feitas = doug.filter(o => chaveNome(o.feitas) === 'SIM');
    const media = xs => xs.length ? xs.reduce((a, o) => a + totalOS(o), 0) / xs.length : null;
    aoa[0] = [null, 'Vanessa', null, null, 'DOUGLAS'];
    aoa[1] = [null, 'Ana Cláudia', null, null, media(feitas)];
    aoa[2] = [null, 'Gustavo', null, null, media(doug)];
    aoa[3] = ['ID', 'Aberta por', 'Data', 'ID', 'DESCRIÇÃO', null, 'MANTENEDOR', 'DATA', 'FEITAS', 'CONJUNTO', 'ITEM', 'PROBLEMA', 'SOLUÇÃO',
      'OBSERVAÇÕES', 'TOTAL', 'CONJUNTO', 'ITEM', 'PROBLEMA', 'SOLUÇÃO', 'OBSERVAÇÕES', 'ANÁLISE'];
    const ok = v => v != null && String(v).trim() !== '';
    regs.forEach(o => aoa.push([o.ordem_grupo, o.aberta_por, serialDia(o.data_abertura), o.numero, o.descricao, o.nota, o.mantenedor,
      serialDia(o.data), o.feitas, ok(o.conjunto), ok(o.item), ok(o.problema), ok(o.solucao), ok(o.observacoes), totalOS(o),
      o.conjunto, o.item, o.problema, o.solucao, o.observacoes, o.analise]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    marcarFormato(ws, aoa.length, [2, 7], 'dd/mm/yyyy', 4);
    return ws;
  }

  function abaMontagem(d) {
    const regs = d.montagem.slice().sort((a, b) => a.nreg - b.nreg);
    const aoa = [['.MÁQUINA', 'NReg', 'Setor', 'Turno', 'Data', 'Hora Ant', 'Hora', 'Tempo', 'ID', 'Descrição', 'Obs']];
    regs.forEach(m => aoa.push([m.maquina || null, m.nreg, m.setor, m.turno, m.data, m.hora_ant, m.hora,
      m.tempo_s == null ? null : m.tempo_s / 86400, m.cod_id, m.descricao, m.obs]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    marcarFormato(ws, aoa.length, [7], 'hh:mm:ss');
    return ws;
  }

  function abaMenus(d) {
    const aoa = [['PROGRAMADA', 'GRUPO DO OEE', '6 GRANDES PERDAS', 'SUBGRUPO DO OEE']];
    d.programadas.forEach(p => {
      if (p.exige_grupo) d.subgrupos.filter(s => s.grupo).forEach(s => aoa.push([p.programada, s.grupo, s.seis_perdas, s.subgrupo]));
      else { const s = d.subgrupos.find(x => x.subgrupo === p.programada); aoa.push([p.programada, '-', '-', s ? s.subgrupo : '-']); }
    });
    return XLSX.utils.aoa_to_sheet(aoa);
  }

  function marcarFormato(ws, nLinhas, colunas, fmt, primeira) {
    for (let r = primeira == null ? 1 : primeira; r < nLinhas; r++) {
      for (const c of colunas) {
        const cel = ws[XLSX.utils.encode_cell({ r, c })];
        if (cel && cel.t === 'n') cel.z = fmt;
      }
    }
  }

  // Planilha completa. opcoes.cores: guarda as cores da Limpeza (o Painel usa).
  // opcoes.extras: inclui as tabelas do sistema como estão (para o backup).
  function montar(d, opcoes) {
    opcoes = opcoes || {};
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, abaApontamentos(d), 'Apontamentos');
    XLSX.utils.book_append_sheet(wb, abaMenus(d), 'menus');
    XLSX.utils.book_append_sheet(wb, abaLimpeza(d, opcoes.cores), 'Limpeza');
    XLSX.utils.book_append_sheet(wb, abaOS(d), 'OS');
    XLSX.utils.book_append_sheet(wb, abaMontagem(d), 'apontamentos_montagem');
    if (opcoes.extras) {
      const add = (nome, linhas) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ vazio: '' }]), nome);
      add('banco_dados', d.coletor);
      add('sis_classificacao', d.classif);
      add('sis_ajustes', d.ajustes || []);
      add('sis_pendencias', d.pendencias || []);
      add('sis_limpeza', d.limpeza.map(r => ({ ...r, itens: (r.itens || []).map(x => x || '_').join(' ') })));
      add('sis_os', d.os);
      add('sis_montagem', d.montagem);
      if (d.montagem_pendente) add('sis_montagem_pendente', d.montagem_pendente.map(r => ({ ...r, dados: JSON.stringify(r.dados) })));
      if (d.montagem_historico) add('sis_montagem_historico', d.montagem_historico.map(r => ({ ...r, dados_antigos: JSON.stringify(r.dados_antigos), dados_novos: JSON.stringify(r.dados_novos) })));
      add('sis_subgrupos', d.subgrupos);
      add('sis_programadas', d.programadas);
      add('sis_takt_periodos', MG.listaTakt());
      add('LEIA-ME', [{ 'Sobre este arquivo': 'Backup do sistema Megadoor gerado em ' + new Date().toLocaleString('pt-BR') },
        { 'Sobre este arquivo': 'As abas Apontamentos, menus, Limpeza, OS e apontamentos_montagem seguem o formato da planilha original.' },
        { 'Sobre este arquivo': 'As abas sis_* guardam as tabelas do sistema como estão. Em sis_limpeza, cada item é: V feita, J justificada, P erro de planejamento, F faltou, _ não preenchido, - não se aplica.' }]);
    }
    return wb;
  }

  return { lerTudo, montar, totalLimpeza, totalOS, serialDia, COR };
})();
