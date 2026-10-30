// Abas Montagem, Limpeza e OS do sistema Megadoor.
// Cada aba desenha a própria tela dentro da seção indicada e salva direto no Supabase.
window.MGAbas = (function () {
  const sb = MG.sb;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/^\.+/, '').replace(/\s+/g, ' ');
  const pad = n => String(n).padStart(2, '0');
  const nf = n => Number(n).toLocaleString('pt-BR');
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dBR = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
  const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const diaSemana = iso => WD[new Date(iso + 'T12:00:00').getDay()];
  function dur(s) { if (s == null) return ''; return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60); }
  let CTX = null;   // { dona, aviso(txt), erro(txt) }

  /* =================== conversões usadas na importação =================== */
  function paraISO(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') { const p = XLSX.SSF.parse_date_code(v); return p ? p.y + '-' + pad(p.m) + '-' + pad(p.d) : null; }
    const s = String(v).trim(); let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
    return null;
  }
  function paraSeg(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') { const f = v % 1; return Math.round(f * 86400) % 86400; }
    const m = /(\d{1,3}):(\d{2})(?::(\d{2}))?/.exec(String(v));
    return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0)) : null;
  }
  const paraHora = v => { const s = paraSeg(v); return s == null ? null : dur(s); };
  const txt = v => { if (v == null) return null; const s = String(v).trim(); return s || null; };

  /* =================== MONTAGEM =================== */
  const M = { linhas: [], pagina: 0, carregado: false, pendentes: [] };
  // Campos que vêm do arquivo da Montagem (a .MÁQUINA é sua e nunca é trocada pelo arquivo)
  const CAMPOS_M = [['data', 'Data'], ['turno', 'Turno'], ['hora_ant', 'Hora ant'], ['hora', 'Hora'], ['tempo_s', 'Tempo'],
    ['cod_id', 'ID'], ['descricao', 'Descrição'], ['obs', 'Obs'], ['setor', 'Setor']];
  const valCmp = v => v == null ? '' : String(v).replace(/_x000d_/gi, '').replace(/\s+/g, ' ').trim();
  const mostraCampo = (k, v) => v == null || v === '' ? '(vazio)' : k === 'tempo_s' ? dur(v) : k === 'data' ? dBR(v) : String(v);
  function diferencas(sistema, arquivo) {
    return CAMPOS_M.filter(([k]) => valCmp(sistema[k]) !== valCmp(arquivo[k]));
  }
  const MAQ_SUGESTOES = ['MEGADOOR', 'CERCOMAK', '-', '?'];
  const fora = d => /^IGNORA OEE|^FOLGA FISIOLOGICA/.test(norm(d));

  function montagemHTML() {
    return `
    <div class="card"><h2>Apontamentos da Montagem</h2>
      <p class="muted" style="margin:6px 0 0;max-width:90ch">Importe aqui o arquivo que você baixa do sistema da Montagem (.xlsx ou .csv). Apontamentos novos entram direto. Se um apontamento que já está no sistema vier diferente no arquivo, ele não é trocado sozinho: aparece em "Diferenças para revisar" para você decidir. A .MÁQUINA que você preencheu nunca é apagada. A .MÁQUINA você preenche direto na tabela: MEGADOOR, CERCOMAK, "-" (nenhuma máquina) ou "?" (a revisar).</p>
      <div class="barra" style="margin:12px 0 0;border-left-color:var(--good)">
        <label class="btn primary" for="mImport" id="mImportBtn">Importar arquivo da Montagem</label>
        <input type="file" id="mImport" accept=".xlsx,.xls,.csv" hidden>
        <span class="muted" id="mImportMsg"></span>
      </div>
    </div>
    <div class="card" id="mConf" hidden></div>
    <div class="barra">
      <label>De <input type="date" id="mIni"></label><label>até <input type="date" id="mFim"></label>
      <label>Turno <select id="mTurno"><option value="">Todos</option><option>Turno A</option><option>Turno B</option><option>Turno C</option></select></label>
      <label>.MÁQUINA <select id="mMaq"><option value="">Todas</option><option value="_vazia">Sem marcação</option><option>MEGADOOR</option><option>CERCOMAK</option><option value="-">- (nenhuma)</option><option value="?">? (a revisar)</option><option value="_outra">Outras</option></select></label>
      <label><input type="checkbox" id="mFora" checked> Esconder "Ignora OEE" e "Folga Fisiológica"</label>
      <label>Buscar <input type="search" id="mBusca" style="width:150px" placeholder="descrição, obs, NReg"></label>
      <span class="muted" id="mResumo"></span>
    </div>
    <div class="kpis" id="mKpis"></div>
    <p class="muted" style="margin:0 0 8px">Teclado: ↑ ↓ ou Enter andam entre as células de .MÁQUINA; ao sair da célula, salva.</p>
    <div class="scroll"><table id="mTabela"></table></div>
    <div class="pag" id="mPag"></div>
    <datalist id="mMaqLista">${MAQ_SUGESTOES.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
  }

  async function montagemCarregar() {
    $('mResumo').textContent = 'Carregando…';
    try {
      const [linhas, pend, hist] = await Promise.all([MG.buscarTudo('montagem', '*'), MG.buscarTudo('montagem_pendente', '*'),
        MG.buscarTudo('montagem_historico', 'id,nreg,decisao,dados_novos', null, 'id')]);
      // versões do arquivo que você já recusou ("manter o do sistema"): não são perguntadas de novo
      M.recusadas = new Map();
      hist.forEach(h => { if (h.decisao === 'sistema') M.recusadas.set(h.nreg, h.dados_novos || {}); else M.recusadas.delete(h.nreg); });
      M.linhas = linhas.sort((a, b) => b.nreg - a.nreg);
      M.pendentes = pend.sort((a, b) => a.nreg - b.nreg);
      M.carregado = true;
      conflitosRender();
      if (!$('mIni').value && M.linhas.length) {
        const ult = M.linhas.reduce((a, l) => l.data > a ? l.data : a, '');
        const d = new Date(ult + 'T12:00:00'); d.setDate(d.getDate() - 30);
        $('mIni').value = d.toISOString().slice(0, 10);
      }
      montagemRender();
    } catch (e) { CTX.erro('Erro ao carregar a Montagem: ' + e.message); $('mResumo').textContent = ''; }
  }

  function montagemFiltradas() {
    const ini = $('mIni').value, fim = $('mFim').value, t = $('mTurno').value, mq = $('mMaq').value, esc_ = $('mFora').checked, b = norm($('mBusca').value);
    return M.linhas.filter(l => {
      if (ini && l.data < ini) return false;
      if (fim && l.data > fim) return false;
      if (t && l.turno !== t) return false;
      if (esc_ && fora(l.descricao)) return false;
      const q = norm(l.maquina);
      if (mq === '_vazia' && q) return false;
      if (mq === '_outra' && (!q || ['MEGADOOR', 'CERCOMAK', '-', '?'].includes(q))) return false;
      if (mq && mq[0] !== '_' && q !== norm(mq)) return false;
      if (b && !norm([l.nreg, l.descricao, l.obs, l.maquina].join(' ')).includes(b)) return false;
      return true;
    });
  }

  let FM = null, GM = null;   // filtros das colunas e teclado (criados em montagemIniciar)
  function montagemRender() {
    const foco = GM && GM.lembrar();
    const L = FM ? FM.aplicar(montagemFiltradas()) : montagemFiltradas();
    const contam = L.filter(l => !fora(l.descricao));
    const mega = contam.filter(l => norm(l.maquina) === 'MEGADOOR');
    const semMarca = contam.filter(l => !txt(l.maquina));
    const tempo = xs => xs.reduce((a, l) => a + (l.tempo_s || 0), 0);
    const h = s => (s / 3600).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
    $('mKpis').innerHTML = `
      <div class="kpi"><span>Apontamentos no filtro</span><b>${nf(L.length)}</b></div>
      <div class="kpi"><span>Tempo perdido (sem Ignora OEE/Folga)</span><b>${h(tempo(contam))}</b></div>
      <div class="kpi"><span>Marcados MEGADOOR</span><b style="color:var(--info)">${nf(mega.length)} · ${h(tempo(mega))}</b></div>
      <div class="kpi"><span>Sem .MÁQUINA (perdas)</span><b style="color:var(--bad)">${nf(semMarca.length)}</b></div>`;
    $('mResumo').innerHTML = `${nf(M.linhas.length)} apontamentos no sistema` + (FM && FM.ativos() ? ` · ${FM.ativos()} filtro(s) de coluna <button class="btn small" type="button" id="mLimparF">Limpar filtros das colunas</button>` : '');
    if ($('mLimparF')) $('mLimparF').onclick = () => FM.limpar();
    const POR = 100, tot = Math.max(1, Math.ceil(L.length / POR));
    if (M.pagina >= tot) M.pagina = tot - 1;
    const pag = L.slice(M.pagina * POR, M.pagina * POR + POR);
    const ed = CTX.dona ? '' : 'disabled';
    const th = (k, r, c) => FM.cabecalho(k, r, c);
    const cab = `<thead><tr>${th('maq', '.MÁQUINA', 'mine')}${th('nreg', 'NReg')}${th('data', 'Data')}${th('turno', 'Turno')}${th('hant', 'Hora ant')}${th('hora', 'Hora')}${th('tempo', 'Tempo')}${th('id', 'ID')}${th('desc', 'Descrição')}${th('obs', 'Obs')}</tr></thead>`;
    let hh = cab + '<tbody>';
    for (const l of pag) {
      hh += `<tr data-n="${l.nreg}"><td class="mine"><input class="maq" list="mMaqLista" value="${esc(l.maquina || '')}" ${ed} style="width:120px"></td>
        <td class="num">${l.nreg}</td><td class="num">${dBR(l.data)}</td><td>${esc(l.turno || '')}</td><td class="num">${esc(l.hora_ant || '')}</td><td class="num">${esc(l.hora || '')}</td>
        <td class="num">${dur(l.tempo_s)}</td><td class="num">${l.cod_id == null ? '' : l.cod_id}</td><td class="txt">${esc(l.descricao || '')}</td><td class="txt">${esc(l.obs || '')}</td></tr>`;
    }
    hh += '</tbody>';
    if (!pag.length) hh = cab + `<tbody><tr><td class="muted" colspan="10" style="padding:18px">${M.linhas.length ? 'Nenhum apontamento com esses filtros.' : 'Ainda não há apontamentos da Montagem no sistema. Use o botão "Importar arquivo da Montagem".'}</td></tr></tbody>`;
    $('mTabela').innerHTML = hh;
    $('mPag').innerHTML = `Página ${M.pagina + 1} de ${tot} <button class="btn small" id="mAnt" ${M.pagina === 0 ? 'disabled' : ''}>Anterior</button> <button class="btn small" id="mProx" ${M.pagina >= tot - 1 ? 'disabled' : ''}>Próxima</button>`;
    $('mAnt').onclick = () => { M.pagina--; montagemRender(); };
    $('mProx').onclick = () => { M.pagina++; montagemRender(); };
    if (GM) GM.restaurar(foco);
  }

  async function montagemSalvarMaquina(inp) {
    const nreg = Number(inp.closest('tr').dataset.n);
    const v = txt(inp.value);
    const valor = v ? (['MEGADOOR', 'CERCOMAK'].includes(norm(v)) ? norm(v) : v) : null;
    const { error } = await sb.from('montagem').update({ maquina: valor, maquina_em: new Date().toISOString() }).eq('nreg', nreg);
    if (error) { CTX.erro('Erro ao salvar a .MÁQUINA: ' + error.message); return; }
    const l = M.linhas.find(x => x.nreg === nreg); if (l) l.maquina = valor;
    inp.value = valor || '';
    CTX.aviso('Salvo');
  }

  // Lê o arquivo baixado da Montagem (mesmos nomes de coluna que o Painel aceita).
  const COLS = { nreg: ['NREG'], setor: ['SETOR'], data: ['DATA'], turno: ['TURNO'], hora_ant: ['HORAANTERIOR', 'HORA ANT', 'HORA ANTERIOR'],
    hora: ['HORA'], tempo: ['TEMPO'], id: ['OEETPSID', 'ID'], descricao: ['DESCRICAO'], obs: ['OEEOBS', 'OBS', 'OBSERVACAO', 'OBSERVACOES'], maquina: ['MAQUINA'] };
  function lerArquivoMontagem(wb) {
    for (const nome of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: false });
      for (let h = 0; h < Math.min(rows.length, 10); h++) {
        const cab = (rows[h] || []).map(norm);
        const ix = {};
        for (const k in COLS) { ix[k] = -1; for (const a of COLS[k]) { const i = cab.indexOf(a); if (i !== -1) { ix[k] = i; break; } } }
        if (ix.nreg === -1 || ix.data === -1 || ix.tempo === -1 || ix.descricao === -1) continue;
        const saida = new Map();
        for (const r of rows.slice(h + 1)) {
          if (!r) continue;
          let n = r[ix.nreg]; if (typeof n === 'string' && /^\s*\d+\s*$/.test(n)) n = Number(n);
          if (typeof n !== 'number' || !isFinite(n) || !n) continue;
          const g = k => ix[k] === -1 ? null : r[ix[k]];
          const id = g('id');
          saida.set(n, { nreg: n, setor: txt(g('setor')), turno: txt(g('turno')), data: paraISO(g('data')), hora_ant: paraHora(g('hora_ant')),
            hora: paraHora(g('hora')), tempo_s: paraSeg(g('tempo')), cod_id: id == null || id === '' || isNaN(Number(id)) ? null : Number(id),
            descricao: txt(g('descricao')), obs: txt(g('obs')), _maquina: txt(g('maquina')) });
        }
        return { aba: nome, linhas: [...saida.values()].filter(l => l.data) };
      }
    }
    throw new Error('Não encontrei as colunas NReg, Data, Tempo e Descrição em nenhuma aba do arquivo.');
  }

  let importando = false;
  async function montagemImportar(file) {
    if (importando) return;
    importando = true;
    const msg = $('mImportMsg');
    msg.textContent = 'Lendo ' + file.name + '…';
    try {
      const buf = await file.arrayBuffer();
      let wb;
      if (/\.csv$/i.test(file.name)) {
        let t = new TextDecoder('utf-8').decode(buf);
        if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
        wb = XLSX.read(t, { type: 'string', raw: true });
      } else wb = XLSX.read(new Uint8Array(buf), { type: 'array', sheetRows: 200000 });
      const { aba, linhas } = lerArquivoMontagem(wb);
      if (!linhas.length) throw new Error('O arquivo não tem apontamentos válidos.');
      if (!M.carregado) await montagemCarregar();
      const existe = new Map(M.linhas.map(l => [l.nreg, l]));
      const agora = new Date().toISOString();
      // Novos: entram direto (com a .MÁQUINA do arquivo, se houver).
      // Já existentes e iguais: nada a fazer. Já existentes e DIFERENTES: ficam esperando a sua decisão.
      const novas = [], diferentes = [], iguais = [], recusadas = [];
      for (const l of linhas) {
        const atual = existe.get(l.nreg);
        if (!atual) novas.push(l);
        else if (!diferencas(atual, l).length) iguais.push(l);
        else if (M.recusadas && M.recusadas.has(l.nreg) && !diferencas(M.recusadas.get(l.nreg), l).length) recusadas.push(l);
        else diferentes.push(l);
      }
      const envioNovas = novas.map(({ _maquina, ...r }) => ({ ...r, ...(_maquina ? { maquina: _maquina } : {}), importado_em: agora }));
      // os lotes precisam ter as mesmas colunas: separa os que trazem .MÁQUINA dos que não trazem
      const lotes = [envioNovas.filter(r => !('maquina' in r)), envioNovas.filter(r => 'maquina' in r)];
      let feitos = 0;
      for (const lote of lotes) for (let i = 0; i < lote.length; i += 500) {
        const { error } = await sb.from('montagem').upsert(lote.slice(i, i + 500), { onConflict: 'nreg', ignoreDuplicates: true });
        if (error) throw new Error(error.message);
        feitos += Math.min(500, lote.length - i);
        msg.textContent = `Enviando novos: ${nf(feitos)} de ${nf(novas.length)}…`;
      }
      const pend = diferentes.map(({ _maquina, ...r }) => ({ nreg: r.nreg, dados: r, arquivo: file.name, importado_em: agora }));
      for (let i = 0; i < pend.length; i += 500) {
        const { error } = await sb.from('montagem_pendente').upsert(pend.slice(i, i + 500), { onConflict: 'nreg' });
        if (error) throw new Error(error.message);
      }
      // se o arquivo novo voltou a bater com o sistema, a diferença antiga deixa de valer
      const resolvidas = iguais.map(l => l.nreg).filter(n => M.pendentes.some(p => p.nreg === n));
      for (let i = 0; i < resolvidas.length; i += 200) {
        const { error } = await sb.from('montagem_pendente').delete().in('nreg', resolvidas.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }
      const datas = linhas.map(l => l.data).sort();
      msg.textContent = `Arquivo "${file.name}" (aba ${aba}, ${dBR(datas[0])} a ${dBR(datas[datas.length - 1])}): ${nf(novas.length)} novos, ` +
        `${nf(iguais.length)} sem mudança` + (recusadas.length ? `, ${nf(recusadas.length)} diferenças que você já tinha recusado` : '') + (diferentes.length ? `, ${nf(diferentes.length)} diferentes do sistema — revise acima.` : '.');
      await montagemCarregar();
    } catch (e) { msg.textContent = ''; CTX.erro('Erro ao importar: ' + e.message); }
    finally { importando = false; }
  }

  /* ---- Diferenças entre o sistema e o arquivo importado: você decide, linha por linha ---- */
  function conflitosRender() {
    const box = $('mConf');
    if (!CTX.dona || !M.pendentes.length) { box.hidden = true; box.innerHTML = ''; return; }
    const porNreg = new Map(M.linhas.map(l => [l.nreg, l]));
    let h = `<h2>Diferenças para revisar (${nf(M.pendentes.length)})</h2>
      <p class="muted" style="margin:6px 0 10px;max-width:95ch">Estes apontamentos já estavam no sistema, mas o arquivo importado traz algo diferente (alguém mudou no sistema da Montagem depois). Escolha, para cada um, se fica o que está no sistema ou se passa a valer o do arquivo. A sua .MÁQUINA é mantida nos dois casos. Toda decisão fica guardada no histórico.</p>
      <div class="barra" style="margin:0 0 10px">
        <button class="btn small" type="button" data-todos="sistema">Manter o do sistema em todos</button>
        <button class="btn small" type="button" data-todos="arquivo">Usar o do arquivo em todos</button>
        <span class="muted" id="mConfMsg"></span>
      </div>
      <div class="scroll" style="max-height:50vh"><table><thead><tr><th>NReg</th><th>Data · turno</th><th>.MÁQUINA</th><th>O que mudou (sistema → arquivo)</th><th></th></tr></thead><tbody>`;
    for (const p of M.pendentes) {
      const atual = porNreg.get(p.nreg) || {}, novo = p.dados || {};
      const difs = diferencas(atual, novo);
      h += `<tr data-n="${p.nreg}"><td class="num">${p.nreg}</td><td class="num">${dBR(atual.data || novo.data)} · ${esc(atual.turno || novo.turno || '')}</td>
        <td>${esc(atual.maquina || '')}</td>
        <td class="txt" style="max-width:520px">${difs.length ? difs.map(([k, rot]) => `<div><b>${rot}:</b> <span style="color:var(--bad);text-decoration:line-through">${esc(mostraCampo(k, atual[k]))}</span> → <span style="color:var(--good)">${esc(mostraCampo(k, novo[k]))}</span></div>`).join('') : '<span class="muted">sem diferença</span>'}
          <div class="muted">arquivo: ${esc(p.arquivo || '')}</div></td>
        <td style="white-space:nowrap"><button class="btn small" type="button" data-dec="sistema">Manter o do sistema</button>
          <button class="btn small primary" type="button" data-dec="arquivo">Usar o do arquivo</button></td></tr>`;
    }
    box.innerHTML = h + '</tbody></table></div>';
    box.hidden = false;
  }

  // Aplica a decisão a vários apontamentos de uma vez (em lotes de 500)
  async function decidir(nregs, decisao, aoProgresso) {
    const porNreg = new Map(M.linhas.map(l => [l.nreg, l]));
    const escolhidos = M.pendentes.filter(p => nregs.includes(p.nreg));
    for (let i = 0; i < escolhidos.length; i += 500) {
      const lote = escolhidos.slice(i, i + 500);
      const pega = (o, k) => (o[k] == null ? null : o[k]);
      const hist = lote.map(p => {
        const atual = porNreg.get(p.nreg) || {};
        return { nreg: p.nreg, decisao,
          dados_antigos: Object.fromEntries(CAMPOS_M.map(([k]) => [k, pega(atual, k)])),
          dados_novos: Object.fromEntries(CAMPOS_M.map(([k]) => [k, pega(p.dados, k)])) };
      });
      let r = await sb.from('montagem_historico').insert(hist);
      if (r.error) throw new Error(r.error.message);
      hist.forEach(h => { if (decisao === 'sistema') M.recusadas.set(h.nreg, h.dados_novos); else M.recusadas.delete(h.nreg); });
      if (decisao === 'arquivo') {
        const agora = new Date().toISOString();
        // upsert só com os campos do arquivo: a .MÁQUINA não vai junto, então fica como está
        const linhas = hist.map(h => ({ nreg: h.nreg, ...h.dados_novos, importado_em: agora }));
        r = await sb.from('montagem').upsert(linhas, { onConflict: 'nreg' });
        if (r.error) throw new Error(r.error.message);
        hist.forEach(h => Object.assign(porNreg.get(h.nreg) || {}, h.dados_novos));
      }
      r = await sb.from('montagem_pendente').delete().in('nreg', lote.map(p => p.nreg));
      if (r.error) throw new Error(r.error.message);
      const feitos = new Set(lote.map(p => p.nreg));
      M.pendentes = M.pendentes.filter(x => !feitos.has(x.nreg));
      if (aoProgresso) aoProgresso(Math.min(i + 500, escolhidos.length), escolhidos.length);
    }
  }

  let decidindo = false;
  async function conflitosClique(e) {
    const b = e.target.closest('button'); if (!b || !CTX.dona || decidindo) return;
    const dec = b.dataset.dec || b.dataset.todos; if (!dec) return;
    const alvo = b.dataset.todos ? M.pendentes.map(p => p.nreg) : [Number(b.closest('tr').dataset.n)];
    if (b.dataset.todos && !confirm(`${dec === 'arquivo' ? 'Usar o do arquivo' : 'Manter o do sistema'} em ${alvo.length} apontamento(s)?`)) return;
    decidindo = true;
    try {
      await decidir(alvo, dec, (k, n) => { if ($('mConfMsg')) $('mConfMsg').textContent = `${k} de ${n}…`; });
      CTX.aviso(alvo.length > 1 ? `${alvo.length} decisões salvas` : 'Decisão salva');
    } catch (err) { CTX.erro('Erro ao salvar a decisão: ' + err.message); }
    finally { decidindo = false; conflitosRender(); montagemRender(); }
  }

  function montagemIniciar() {
    $('sec-montagem').innerHTML = montagemHTML();
    FM = MGFiltros.criar({ aoMudar: () => { M.pagina = 0; montagemRender(); }, colunas: [
      { chave: 'maq', valor: l => l.maquina }, { chave: 'nreg', tipo: 'num', valor: l => l.nreg },
      { chave: 'data', valor: l => l.data, mostrar: v => dBR(v) }, { chave: 'turno', valor: l => l.turno },
      { chave: 'hant', valor: l => l.hora_ant }, { chave: 'hora', valor: l => l.hora },
      { chave: 'tempo', tipo: 'num', valor: l => l.tempo_s, mostrar: v => dur(+v) }, { chave: 'id', tipo: 'num', valor: l => l.cod_id },
      { chave: 'desc', valor: l => l.descricao }, { chave: 'obs', valor: l => l.obs }] });
    FM.ligar($('mTabela'), () => montagemFiltradas());
    MGZoom.anexar('mTabela');
    const POR = 100;
    GM = MGTeclado.grade($('mTabela'), { seletor: 'input.maq', chaveLinha: tr => tr.dataset.n,
      aoBorda: (dir, col) => {
        const tot = Math.ceil(FM.aplicar(montagemFiltradas()).length / POR);
        if (dir === 'baixo' && M.pagina < tot - 1) { M.pagina++; montagemRender(); GM.focarPrimeira(col); return true; }
        if (dir === 'cima' && M.pagina > 0) { M.pagina--; montagemRender(); GM.focarPrimeira(col, true); return true; }
        return false;
      } });
    if (!CTX.dona) $('mImportBtn').style.display = 'none';
    $('mImport').addEventListener('change', e => { const f = e.target.files[0]; if (f) montagemImportar(f); e.target.value = ''; });
    ['mIni', 'mFim', 'mTurno', 'mMaq', 'mFora'].forEach(id => $(id).addEventListener('change', () => { M.pagina = 0; montagemRender(); }));
    let t; $('mBusca').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { M.pagina = 0; montagemRender(); }, 250); });
    $('mTabela').addEventListener('change', e => { if (CTX.dona && e.target.classList.contains('maq')) montagemSalvarMaquina(e.target); });
    $('mConf').addEventListener('click', conflitosClique);
    montagemCarregar();
  }

  /* =================== LIMPEZA =================== */
  const L = { linhas: [], carregado: false };
  const ITEM = {
    V: { rot: 'V', nome: 'Feita', cls: 'iv' }, J: { rot: 'V', nome: 'Justificada', cls: 'ij' }, P: { rot: 'V', nome: 'Justificada por erro de planejamento', cls: 'ip' },
    F: { rot: 'F', nome: 'Faltou', cls: 'if' }, '': { rot: 'F', nome: 'Ainda não preenchida', cls: 'ie' }, '-': { rot: '', nome: 'Não se aplica neste turno', cls: 'in' }
  };
  const ORDEM_T = { C: 0, A: 1, B: 2 };

  function limpezaHTML() {
    return `
    <div class="card"><h2>Limpeza</h2>
      <p class="muted" style="margin:6px 0 0;max-width:90ch">Uma linha por turno por dia, como na planilha. Clique num item para mudar. O TOTAL é a parte dos itens que se aplicam ao turno marcada como V (feita, justificada ou justificada por erro de planejamento). O % de cada turno é a média do TOTAL dos dias anteriores a hoje, igual ao topo da aba Limpeza.</p>
      <div class="legenda" style="margin-top:10px">${Object.entries(ITEM).map(([k, o]) => `<span><i class="it ${o.cls}">${o.rot}</i>${o.nome}</span>`).join('')}</div>
    </div>
    <div class="kpis" id="lKpis"></div>
    <div class="barra">
      <label>Mês <input type="month" id="lMes"></label>
      <label>Turno <select id="lTurno"><option value="">Todos</option><option>A</option><option>B</option><option>C</option></select></label>
      <span class="muted" id="lResumo"></span>
      <button class="btn small" id="lCriar" type="button" hidden>Criar as linhas deste mês</button>
    </div>
    <p class="muted" style="margin:0 0 8px">Teclado: setas andam entre as células. Num item, digite <b>V</b> (feita), <b>J</b> (justificada), <b>P</b> (erro de planejamento), <b>F</b> (faltou), <b>-</b> (não se aplica) ou <b>Delete</b> (apagar): salva e já passa para o próximo item. Enter abre o menu do item.</p>
    <div class="scroll"><table id="lTabela" class="limpeza"></table></div>
    <div id="lMenu" class="menu-item" hidden></div>`;
  }

  async function limpezaCarregar() {
    $('lResumo').textContent = 'Carregando…';
    try {
      L.linhas = await MG.buscarTudo('limpeza', '*', null, ['data', 'turno']);
      L.carregado = true;
      limpezaRender();
    } catch (e) { CTX.erro('Erro ao carregar a Limpeza: ' + e.message); $('lResumo').textContent = ''; }
  }

  let GL = null;
  const TECLA_ITEM = { v: 'V', j: 'J', p: 'P', f: 'F', '-': '-', delete: '', backspace: '' };
  function limpezaRender() {
    const foco = GL && GL.lembrar();
    const hoje = hojeISO();
    const kp = ['A', 'B', 'C'].map(t => {
      const xs = L.linhas.filter(r => r.turno === t && r.data < hoje).map(r => MGPlanilha.totalLimpeza(r.itens));
      const p = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      return `<div class="kpi"><span>Turno ${t} · média até ontem</span><b>${p == null ? '—' : (p * 100).toFixed(1).replace('.', ',') + '%'}</b></div>`;
    });
    $('lKpis').innerHTML = kp.join('');
    const mes = $('lMes').value, t = $('lTurno').value;
    const regs = L.linhas.filter(r => (!mes || r.data.slice(0, 7) === mes) && (!t || r.turno === t))
      .sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : ORDEM_T[a.turno] - ORDEM_T[b.turno]);
    $('lCriar').hidden = !CTX.dona || !mes || L.linhas.some(r => r.data.slice(0, 7) === mes);
    $('lResumo').textContent = `${nf(regs.length)} linhas`;
    const n = Math.max(38, ...regs.map(r => (r.itens || []).length));
    const ed = CTX.dona;
    let h = `<thead><tr><th>Data</th><th>T</th><th>Início</th><th>Fim</th>${Array.from({ length: n }, (_, i) => `<th class="ci">${i === n - 1 ? 'C' : i + 1}</th>`).join('')}<th>Total</th><th>Pendências</th><th>Observações</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>`;
    for (const r of regs) {
      const its = r.itens || [];
      const tot = MGPlanilha.totalLimpeza(its);
      const hojeCls = r.data === hoje ? ' class="hoje"' : '';
      h += `<tr data-d="${r.data}" data-t="${esc(r.turno)}"${hojeCls}><td class="num">${dBR(r.data).slice(0, 5)} <span class="muted">${diaSemana(r.data)}</span></td><td>${esc(r.turno)}</td>
        <td><input type="time" class="li-ini" value="${esc((r.inicio || '').slice(0, 5))}" ${ed ? '' : 'disabled'}></td>
        <td><input type="time" class="li-fim" value="${esc((r.fim || '').slice(0, 5))}" ${ed ? '' : 'disabled'}></td>
        ${Array.from({ length: n }, (_, i) => { const o = ITEM[its[i] || ''] || ITEM['']; return `<td class="ci"><button type="button" class="it ${o.cls}" data-i="${i}" title="${n - 1 === i ? 'Item C' : 'Item ' + (i + 1)}: ${o.nome}" ${ed ? '' : 'disabled'}>${o.rot}</button></td>`; }).join('')}
        <td class="num"><b>${Math.round(tot * 100)}%</b></td>
        <td><input class="li-pend" value="${esc(r.pendencias || '')}" ${ed ? '' : 'disabled'} style="width:160px"></td>
        <td><input class="li-obs" value="${esc(r.observacoes || '')}" ${ed ? '' : 'disabled'} style="width:220px"></td>
        ${ed ? '<td><button type="button" class="btn small li-tudo" title="Marca como feita (V verde) todos os itens que se aplicam a este turno">Tudo feito</button></td>' : ''}</tr>`;
    }
    h += '</tbody>';
    if (!regs.length) h = `<tbody><tr><td class="muted" style="padding:18px">Nenhuma linha neste mês${CTX.dona ? '. Use "Criar as linhas deste mês".' : '.'}</td></tr></tbody>`;
    $('lTabela').innerHTML = h;
    if (GL) GL.restaurar(foco);
  }

  function limpezaReg(tr) { return L.linhas.find(r => r.data === tr.dataset.d && r.turno === tr.dataset.t); }
  // As gravações de uma mesma linha vão em fila (uma depois da outra), sempre com o estado mais recente:
  // assim, digitando rápido vários itens, a última gravação é sempre a mais completa.
  const filaLimpeza = new Map();
  function limpezaSalvar(r, tr) {
    const chave = r.data + '|' + r.turno;
    const antes = filaLimpeza.get(chave) || Promise.resolve(true);
    const agora = antes.then(async () => {
      r.atualizado_em = new Date().toISOString();
      if (tr) tr.classList.add('salvando');
      const { error } = await sb.from('limpeza').upsert({ ...r, itens: (r.itens || []).slice() }, { onConflict: 'data,turno' });
      if (tr) tr.classList.remove('salvando');
      if (error) { CTX.erro('Erro ao salvar a limpeza: ' + error.message); return false; }
      CTX.aviso('Salvo');
      return true;
    });
    filaLimpeza.set(chave, agora.catch(() => false));
    return agora;
  }

  function limpezaMenu(btn) {
    const menu = $('lMenu');
    const tr = btn.closest('tr'), i = Number(btn.dataset.i);
    menu.innerHTML = '<div class="muted">Só este item</div>' +
      Object.entries(ITEM).map(([k, o]) => `<button type="button" data-k="${k}"><i class="it ${o.cls}">${o.rot}</i>${o.nome}</button>`).join('') +
      '<div class="muted" style="margin-top:6px">Todos os itens que se aplicam a este turno</div>' +
      ['V', 'J', 'P', 'F', ''].map(k => `<button type="button" data-k="${k}" data-linha="1"><i class="it ${ITEM[k].cls}">${ITEM[k].rot}</i>${ITEM[k].nome}</button>`).join('');
    const rc = btn.getBoundingClientRect();
    menu.style.left = Math.min(window.innerWidth - 300, rc.left + window.scrollX) + 'px';
    menu.style.top = (rc.bottom + window.scrollY + 4) + 'px';
    menu.hidden = false;
    menu.onclick = async e => {
      const b = e.target.closest('button[data-k]'); if (!b) return;
      menu.hidden = true;
      const r = limpezaReg(tr); if (!r) return;
      const n = Math.max(38, (r.itens || []).length);
      const itens = Array.from({ length: n }, (_, k) => (r.itens || [])[k] || '');
      if (b.dataset.linha) { for (let k = 0; k < n; k++) if (itens[k] !== '-') itens[k] = b.dataset.k; }
      else itens[i] = b.dataset.k;
      const antes = r.itens; r.itens = itens;
      if (!(await limpezaSalvar(r, tr))) r.itens = antes;
      limpezaRender();
    };
  }

  async function limpezaCriarMes() {
    const mes = $('lMes').value; if (!mes) return;
    const [y, m] = mes.split('-').map(Number);
    const ultimoDia = new Date(y, m, 0).getDate();
    const modelo = t => { const xs = L.linhas.filter(r => r.turno === t).sort((a, b) => a.data < b.data ? 1 : -1); return (xs.length && Array.isArray(xs[0].itens) && xs[0].itens.length) ? xs[0].itens : Array(38).fill(''); };
    const novas = [];
    for (let d = 1; d <= ultimoDia; d++) {
      const iso = `${y}-${pad(m)}-${pad(d)}`;
      if (new Date(iso + 'T12:00:00').getDay() === 0) continue;   // domingo sem produção
      for (const t of ['C', 'A', 'B']) novas.push({ data: iso, turno: t, itens: modelo(t).map(x => x === '-' ? '-' : ''), inicio: null, fim: null, pendencias: null, observacoes: null });
    }
    if (!confirm(`Criar ${novas.length} linhas (segunda a sábado, turnos C, A e B) para ${mes.slice(5)}/${mes.slice(0, 4)}? Os itens que não se aplicam a cada turno seguem o último dia registrado.`)) return;
    const { error } = await sb.from('limpeza').upsert(novas, { onConflict: 'data,turno', ignoreDuplicates: true });
    if (error) { CTX.erro('Erro ao criar as linhas: ' + error.message); return; }
    await limpezaCarregar();
  }

  function limpezaIniciar() {
    $('sec-limpeza').innerHTML = limpezaHTML();
    $('lMes').value = hojeISO().slice(0, 7);
    $('lMes').addEventListener('change', limpezaRender);
    $('lTurno').addEventListener('change', limpezaRender);
    $('lCriar').addEventListener('click', limpezaCriarMes);
    document.addEventListener('click', e => { const m = $('lMenu'); if (m && !m.hidden && !e.target.closest('#lMenu') && !e.target.closest('.it')) m.hidden = true; });
    MGZoom.anexar('lTabela');
    GL = MGTeclado.grade($('lTabela'), { seletor: 'button.it, input.li-ini, input.li-fim, input.li-pend, input.li-obs', chaveLinha: tr => tr.dataset.d + '|' + tr.dataset.t });
    // Teclas no item: V feita · J justificada · P erro de planejamento · F faltou · - não se aplica · Delete apaga. Depois anda para a direita.
    $('lTabela').addEventListener('keydown', async e => {
      const it = e.target.closest && e.target.closest('button.it');
      if (!it || !CTX.dona || e.ctrlKey || e.altKey || e.metaKey) return;
      const k = TECLA_ITEM[e.key.toLowerCase()];
      if (k === undefined) return;
      e.preventDefault();
      const tr = it.closest('tr'), i = Number(it.dataset.i), r = limpezaReg(tr); if (!r) return;
      const n = Math.max(38, (r.itens || []).length);
      const antes = r.itens;
      r.itens = Array.from({ length: n }, (_, j) => (r.itens || [])[j] || '');
      r.itens[i] = k;
      const prox = Math.min(i + 1, n - 1);
      // já mostra a mudança e passa para o próximo item; a gravação acontece em seguida
      const o = ITEM[k]; it.className = 'it ' + o.cls; it.textContent = o.rot;
      const seguinte = tr.querySelector(`button.it[data-i="${prox}"]`); if (seguinte) seguinte.focus();
      if (!(await limpezaSalvar(r, null))) { r.itens = antes; }
      limpezaRender();
    });
    $('lTabela').addEventListener('click', async e => {
      if (!CTX.dona) return;
      const it = e.target.closest('button.it');
      if (it) { limpezaMenu(it); return; }
      if (e.target.classList.contains('li-tudo')) {
        const tr = e.target.closest('tr'); const r = limpezaReg(tr); if (!r) return;
        const antes = r.itens;
        r.itens = Array.from({ length: Math.max(38, (r.itens || []).length) }, (_, k) => ((r.itens || [])[k] === '-' ? '-' : 'V'));
        if (!(await limpezaSalvar(r, tr))) r.itens = antes;
        limpezaRender();
      }
    });
    $('lTabela').addEventListener('change', async e => {
      if (!CTX.dona) return;
      const tr = e.target.closest('tr'); const r = tr && limpezaReg(tr); if (!r) return;
      const campo = e.target.classList.contains('li-ini') ? 'inicio' : e.target.classList.contains('li-fim') ? 'fim' :
        e.target.classList.contains('li-pend') ? 'pendencias' : e.target.classList.contains('li-obs') ? 'observacoes' : null;
      if (!campo) return;
      const v = txt(e.target.value);
      r[campo] = v && (campo === 'inicio' || campo === 'fim') ? v + ':00' : v;
      await limpezaSalvar(r, tr);
    });
    limpezaCarregar();
  }

  /* =================== OS =================== */
  const O = { linhas: [] };
  const OS_COLS = [
    ['ordem_grupo', 'ID', 'num', 70], ['aberta_por', 'Aberta por', 'txt', 110], ['data_abertura', 'Data', 'date'], ['numero', 'Nº OS', 'num', 80],
    ['descricao', 'Descrição', 'area', 220], ['nota', 'Nota', 'txt', 140], ['mantenedor', 'Mantenedor', 'txt', 130], ['data', 'Data', 'date'],
    ['feitas', 'Feitas', 'sel'], ['conjunto', 'Conjunto', 'area', 140], ['item', 'Item', 'area', 120], ['problema', 'Problema', 'area', 180],
    ['solucao', 'Solução', 'area', 200], ['observacoes', 'Observações', 'area', 160], ['_total', 'Total', 'calc'], ['analise', 'Análise', 'area', 200]];
  const chave = n => norm(n).replace(/\s+/g, ' ');

  function osHTML() {
    return `
    <div class="card"><h2>Ordens de serviço</h2>
      <p class="muted" style="margin:6px 0 0;max-width:90ch">O TOTAL de cada OS é a parte preenchida de Conjunto, Item, Problema e Solução (como na planilha). Para cada mantenedor: "das feitas" é a média do TOTAL das OS marcadas SIM; "todas" é a média de todas as OS dele (é o % usado nas Metas TPM).</p>
    </div>
    <div class="kpis" id="oKpis"></div>
    <div class="barra">
      <label>Mantenedor <select id="oMant"><option value="">Todos</option></select></label>
      <label>Feitas <select id="oFeitas"><option value="">Todas</option><option>SIM</option><option>NÃO</option><option value="_vazio">Sem resposta</option></select></label>
      <span class="muted" id="oResumo"></span>
      <button class="btn small primary" id="oNova" type="button" hidden>Nova OS</button>
    </div>
    <p class="muted" style="margin:0 0 8px">Teclado: setas andam entre as células (nos textos, ← → saem da célula no começo/fim do texto e ↑ ↓ na primeira/última linha). Tab também funciona.</p>
    <div class="scroll"><table id="oTabela"></table></div>`;
  }

  async function osCarregar() {
    $('oResumo').textContent = 'Carregando…';
    try { O.linhas = await MG.buscarTudo('os', '*', null, 'id'); osRender(); }
    catch (e) { CTX.erro('Erro ao carregar as OS: ' + e.message); $('oResumo').textContent = ''; }
  }

  function osKpis() {
    const nomes = new Map();
    O.linhas.forEach(o => { const k = chave(o.mantenedor); if (k && !nomes.has(k)) nomes.set(k, String(o.mantenedor).replace(/\s+/g, ' ').trim()); });
    const selM = $('oMant'), atual = selM.value;
    selM.innerHTML = '<option value="">Todos</option>' + [...nomes.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('');
    selM.value = atual;
    $('oKpis').innerHTML = [...nomes.entries()].map(([k, n]) => {
      const dele = O.linhas.filter(o => chave(o.mantenedor) === k), feitas = dele.filter(o => norm(o.feitas) === 'SIM');
      const med = xs => xs.length ? Math.round(xs.reduce((a, o) => a + MGPlanilha.totalOS(o), 0) / xs.length * 100) + '%' : '—';
      return `<div class="kpi"><span>${esc(n)} · ${dele.length} OS</span><b>${med(dele)}</b><span>das feitas: ${med(feitas)} (${feitas.length})</span></div>`;
    }).join('');
  }

  let GO = null;
  function osRender() {
    const foco = GO && GO.lembrar();
    osKpis();
    const fM = $('oMant').value, fF = $('oFeitas').value;
    const regs = O.linhas.filter(o => (!fM || chave(o.mantenedor) === fM) && (!fF || (fF === '_vazio' ? !txt(o.feitas) : norm(o.feitas) === norm(fF))))
      .sort((a, b) => (a.posicao || 1e9) - (b.posicao || 1e9) || a.id - b.id);
    $('oResumo').textContent = `${nf(regs.length)} OS`;
    $('oNova').hidden = !CTX.dona;
    const ed = CTX.dona ? '' : 'disabled';
    let h = `<thead><tr>${OS_COLS.map(c => `<th>${c[1]}</th>`).join('')}${CTX.dona ? '<th></th>' : ''}</tr></thead><tbody>`;
    for (const o of regs) {
      h += `<tr data-id="${o.id}">` + OS_COLS.map(([k, , tipo, w]) => {
        const v = o[k];
        if (tipo === 'calc') return `<td class="num"><b>${Math.round(MGPlanilha.totalOS(o) * 100)}%</b></td>`;
        if (tipo === 'sel') return `<td><select data-k="${k}" ${ed}>${['', 'SIM', 'NÃO'].map(x => `<option ${norm(v) === norm(x) ? 'selected' : ''}>${x}</option>`).join('')}</select></td>`;
        if (tipo === 'date') return `<td><input type="date" data-k="${k}" value="${esc(v || '')}" ${ed}></td>`;
        if (tipo === 'num') return `<td><input type="number" data-k="${k}" value="${v == null ? '' : v}" ${ed} style="width:${w}px"></td>`;
        if (tipo === 'area') return `<td><textarea data-k="${k}" rows="2" ${ed} style="width:${w}px">${esc(v || '')}</textarea></td>`;
        return `<td><input data-k="${k}" value="${esc(v || '')}" ${ed} style="width:${w}px"></td>`;
      }).join('') + (CTX.dona ? '<td><button class="btn small o-del" type="button">Excluir</button></td>' : '') + '</tr>';
    }
    h += '</tbody>';
    if (!regs.length) h = '<tbody><tr><td class="muted" style="padding:18px">Nenhuma OS.</td></tr></tbody>';
    $('oTabela').innerHTML = h;
    if (GO) GO.restaurar(foco);
  }

  function osIniciar() {
    $('sec-os').innerHTML = osHTML();
    MGZoom.anexar('oTabela');
    GO = MGTeclado.grade($('oTabela'), { seletor: 'input[data-k], select[data-k], textarea[data-k]', chaveLinha: tr => tr.dataset.id });
    $('oMant').addEventListener('change', osRender);
    $('oFeitas').addEventListener('change', osRender);
    $('oNova').addEventListener('click', async () => {
      const btn = $('oNova'); if (btn.disabled) return; btn.disabled = true;
      const pos = O.linhas.reduce((a, o) => Math.max(a, o.posicao || 0), 0) + 1;
      const { data, error } = await sb.from('os').insert({ posicao: pos, data_abertura: hojeISO() }).select();
      btn.disabled = false;
      if (error) { CTX.erro('Erro ao criar a OS: ' + error.message); return; }
      O.linhas.push(data[0]); $('oMant').value = ''; $('oFeitas').value = ''; osRender();
      const sc = $('oTabela').closest('.scroll'); sc.scrollTop = sc.scrollHeight;
    });
    $('oTabela').addEventListener('change', async e => {
      if (!CTX.dona) return;
      const k = e.target.dataset.k; if (!k) return;
      const tr = e.target.closest('tr'); const o = O.linhas.find(x => String(x.id) === tr.dataset.id); if (!o) return;
      let v = e.target.value;
      v = e.target.type === 'number' ? (v === '' ? null : Number(v)) : txt(v);
      const { error } = await sb.from('os').update({ [k]: v, atualizado_em: new Date().toISOString() }).eq('id', o.id);
      if (error) { CTX.erro('Erro ao salvar a OS: ' + error.message); return; }
      o[k] = v; CTX.aviso('Salvo');
      if (['conjunto', 'item', 'problema', 'solucao'].includes(k)) { const b = tr.querySelector('td.num b'); if (b) b.textContent = Math.round(MGPlanilha.totalOS(o) * 100) + '%'; }
      if (['conjunto', 'item', 'problema', 'solucao', 'feitas', 'mantenedor'].includes(k)) osKpis();
    });
    $('oTabela').addEventListener('click', async e => {
      if (!CTX.dona || !e.target.classList.contains('o-del')) return;
      const tr = e.target.closest('tr'); const o = O.linhas.find(x => String(x.id) === tr.dataset.id);
      if (!o || !confirm(`Excluir a OS ${o.numero || ''} ${o.descricao ? '(' + o.descricao.slice(0, 40) + ')' : ''}? Ela continua no último backup.`)) return;
      const { error } = await sb.from('os').delete().eq('id', o.id);
      if (error) { CTX.erro('Erro ao excluir: ' + error.message); return; }
      O.linhas = O.linhas.filter(x => x !== o); CTX.aviso('OS excluída'); osRender();
    });
    osCarregar();
  }

  /* =================== TAKT TIME POR PERÍODO =================== */
  function taktHTML() {
    return `
    <div class="card"><h2>Takt time por período</h2>
      <p class="muted" style="margin:6px 0 0;max-width:95ch">Cada registro do coletor usa o takt e o ciclo nominal do período da sua data: vale a linha com o início mais recente que não passa daquela data. Uma parada é um ciclo acima do takt. O takt define as paradas, as pendências, o "fora do takt", os kits perdidos, o Radar e a Análise Megadoor. Para reduzir o takt aos poucos, acrescente um período novo com a data em que o valor novo começa a valer. Os períodos anteriores continuam com o valor antigo.</p>
    </div>
    <div class="kpis" id="tAtual"></div>
    <div class="card" id="tForm" hidden>
      <h2 style="font-size:16px">Novo período (ou alterar um existente com a mesma data de início)</h2>
      <div class="barra" style="margin:10px 0 0">
        <label>A partir de <input type="date" id="tInicio"></label>
        <label>Takt (s) <input type="number" id="tTakt" min="1" step="1" style="width:90px"></label>
        <label>Ciclo nominal (s) <input type="number" id="tNominal" min="1" step="1" style="width:90px"></label>
        <label>Nota <input id="tNota" style="width:220px" placeholder="ex.: meta de dezembro"></label>
        <button class="btn primary small" id="tSalvar" type="button">Salvar período</button>
        <span class="muted" id="tMsg"></span>
      </div>
    </div>
    <div class="scroll"><table id="tTabela"></table></div>`;
  }
  function taktRender() {
    const lista = MG.listaTakt();
    const hoje = hojeISO(), atual = MG.taktDe(hoje);
    const vigente = lista.filter(t => t.inicio <= hoje).pop() || lista[0];
    const prox = lista.find(t => t.inicio > hoje);
    $('tAtual').innerHTML = `<div class="kpi"><span>Takt em vigor hoje</span><b>${atual.takt} s</b><span>desde ${dBR(vigente.inicio)}</span></div>
      <div class="kpi"><span>Ciclo nominal em vigor</span><b>${atual.nominal} s</b></div>` +
      (prox ? `<div class="kpi"><span>Próxima mudança</span><b>${prox.takt_s} s</b><span>a partir de ${dBR(prox.inicio)}</span></div>` : '');
    let h = `<thead><tr><th>A partir de</th><th>Até</th><th>Takt (s)</th><th>Ciclo nominal (s)</th><th>Nota</th>${CTX.dona ? '<th></th>' : ''}</tr></thead><tbody>`;
    lista.forEach((t, i) => {
      const ate = lista[i + 1] ? (() => { const d = new Date(lista[i + 1].inicio + 'T12:00:00'); d.setDate(d.getDate() - 1); return dBR(d.toISOString().slice(0, 10)); })() : 'em diante';
      h += `<tr data-i="${esc(t.inicio)}"${t === vigente ? ' class="hoje"' : ''}><td class="num">${dBR(t.inicio)}</td><td class="num">${ate}</td><td class="num"><b>${t.takt_s}</b></td><td class="num">${t.nominal_s}</td><td class="txt">${esc(t.nota || '')}</td>` +
        (CTX.dona ? `<td>${lista.length > 1 ? '<button class="btn small t-del" type="button">Excluir</button>' : ''} <button class="btn small t-edit" type="button">Editar</button></td>` : '') + '</tr>';
    });
    $('tTabela').innerHTML = h + '</tbody>';
    $('tForm').hidden = !CTX.dona;
    if (!$('tTakt').value) { $('tTakt').value = atual.takt; $('tNominal').value = atual.nominal; }
  }
  async function taktCarregar() { await MG.carregarTakt(); taktRender(); }
  function taktIniciar() {
    $('sec-takt').innerHTML = taktHTML();
    $('tSalvar').addEventListener('click', async () => {
      const inicio = $('tInicio').value, takt = Number($('tTakt').value), nominal = Number($('tNominal').value);
      if (!inicio) { $('tMsg').textContent = 'Escolha a data de início.'; return; }
      if (!(takt > 0) || !(nominal > 0)) { $('tMsg').textContent = 'Takt e ciclo nominal precisam ser maiores que zero.'; return; }
      if (inicio <= hojeISO() && !confirm(`O período começa em ${dBR(inicio)}, que já passou: as paradas, pendências e kits perdidos desde essa data serão recalculados com takt ${takt} s. Continuar?`)) return;
      $('tSalvar').disabled = true;
      const { error } = await sb.from('takt_periodos').upsert({ inicio, takt_s: takt, nominal_s: nominal, nota: txt($('tNota').value), atualizado_em: new Date().toISOString() }, { onConflict: 'inicio' });
      $('tSalvar').disabled = false;
      if (error) { CTX.erro('Erro ao salvar o período: ' + error.message); return; }
      $('tMsg').textContent = ''; $('tNota').value = ''; CTX.aviso('Período salvo');
      await taktCarregar(); if (CTX.aposTakt) CTX.aposTakt();
    });
    $('tTabela').addEventListener('click', async e => {
      if (!CTX.dona) return;
      const tr = e.target.closest('tr[data-i]'); if (!tr) return;
      const t = MG.listaTakt().find(x => x.inicio === tr.dataset.i); if (!t) return;
      if (e.target.classList.contains('t-edit')) {
        $('tInicio').value = t.inicio; $('tTakt').value = t.takt_s; $('tNominal').value = t.nominal_s; $('tNota').value = t.nota || '';
        $('tForm').scrollIntoView({ behavior: 'smooth' }); return;
      }
      if (e.target.classList.contains('t-del')) {
        if (!confirm(`Excluir o período que começa em ${dBR(t.inicio)} (takt ${t.takt_s} s)? Essas datas passam a usar o período anterior.`)) return;
        const { error } = await sb.from('takt_periodos').delete().eq('inicio', t.inicio);
        if (error) { CTX.erro('Erro ao excluir: ' + error.message); return; }
        CTX.aviso('Período excluído'); await taktCarregar(); if (CTX.aposTakt) CTX.aposTakt();
      }
    });
    taktCarregar();
  }

  const $ = id => document.getElementById(id);
  const iniciadas = {};
  function abrir(qual, ctx) {
    CTX = ctx;
    if (iniciadas[qual]) {
      if (qual === 'montagem') montagemCarregar(); else if (qual === 'limpeza') limpezaCarregar(); else if (qual === 'os') osCarregar(); else if (qual === 'takt') taktCarregar();
      return;
    }
    iniciadas[qual] = true;
    if (qual === 'montagem') montagemIniciar();
    if (qual === 'limpeza') limpezaIniciar();
    if (qual === 'os') osIniciar();
    if (qual === 'takt') taktIniciar();
  }
  return { abrir, lerArquivoMontagem };
})();
