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
  // sem descrição também não conta (são os 'buracos' da noite, de 16–17 h; o Painel Montagem já fazia assim)
  const fora = d => !String(d == null ? '' : d).trim() || /^IGNORA OEE|^FOLGA FISIOLOGICA/.test(norm(d));

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
      <div class="kpi"><span>Tempo perdido (sem Ignora OEE, Folga e sem descrição)</span><b>${h(tempo(contam))}</b></div>
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
      hh += `<tr data-n="${l.nreg}"><td class="mine"><input class="maq" autocomplete="off" value="${esc(l.maquina || '')}" ${ed} style="width:120px"></td>
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
    // .MÁQUINA com a mesma lista dos apontamentos: digite "M" e Enter = MEGADOOR (e já desce para a linha de baixo)
    MGSugere.anexar($('mTabela'), 'input.maq', {
      fonte: () => {
        const vistos = new Set(MAQ_SUGESTOES.map(norm)), outras = [];
        M.linhas.forEach(l => { const v = txt(l.maquina); if (v && !vistos.has(norm(v))) { vistos.add(norm(v)); outras.push(v); } });
        return { itens: MAQ_SUGESTOES.concat(outras.sort((a, b) => a.localeCompare(b, 'pt'))), podeAdicionar: false };
      },
      titulo: () => '.MÁQUINA',
      depois: el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    });
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
    <p class="muted" style="margin:0 0 8px">Teclado: setas andam entre as células. Num item, digite <b>V</b> (feita), <b>J</b> (justificada), <b>P</b> (erro de planejamento), <b>F</b> (faltou), <b>-</b> (não se aplica) ou <b>Delete</b> (apagar): salva e já passa para o próximo item. Enter abre o menu do item.
      <b>Várias de uma vez:</b> Shift + clique (ou Shift + setas) seleciona um bloco; Ctrl + clique junta ou tira células da seleção. Depois digite a letra ou clique numa célula selecionada para escolher no menu. Esc limpa a seleção.</p>
    <div id="lSelInfo" class="muted" style="margin:0 0 6px;min-height:18px;font-weight:600;color:var(--accent)"></div>
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
  // ---- Quanto cada turno ainda pode faltar (meta do programa TPM: média de 90% de 01/09/2026 a 28/02/2027) ----
  const LZ_META = 0.9, LZ_INI = '2026-09-01', LZ_FIM = '2027-02-28';
  const pctBR = x => (x * 100).toFixed(1).replace('.', ',') + '%';
  function limpezaPrevisao(t, hoje) {
    const doTurno = L.linhas.filter(r => r.turno === t && r.data >= LZ_INI && r.data <= LZ_FIM);
    // limpezas que ainda vão existir: as linhas já criadas + seg a sáb até o fim do programa (meses ainda não criados)
    const ultima = doTurno.reduce((m, r) => r.data > m ? r.data : m, '');
    let futuras = 0;
    for (let d = new Date((ultima || LZ_INI) + 'T12:00:00'), fim = new Date(LZ_FIM + 'T12:00:00'); ; ) {
      if (ultima) d.setDate(d.getDate() + 1);
      if (d > fim) break;
      if (d.getDay() !== 0) futuras++;
      if (!ultima) d.setDate(d.getDate() + 1);
    }
    const contadas = doTurno.filter(r => r.data < hoje && MGPlanilha.totalLimpeza(r.itens) != null);
    const credito = contadas.reduce((a, r) => a + MGPlanilha.totalLimpeza(r.itens), 0);
    const N = doTurno.length + futuras, R = N - contadas.length;
    if (!N) return '';
    const folga = credito + R - LZ_META * N;          // em "limpezas inteiras" de sobra
    // peso do item C (fechar as OS) numa limpeza: 1 ÷ itens que se aplicam (pega a última linha preenchida)
    const ref = contadas.length ? contadas.reduce((m, r) => r.data > m.data ? r : m) : null;
    const nItens = ref ? (ref.itens || []).filter(x => x !== '-').length || 38 : 38;
    const pesoC = 1 / nItens;
    const linha = (ok, txt) => `<div style="font-size:12.5px;margin-top:4px;color:${ok ? 'var(--good)' : 'var(--bad)'}">${ok ? '✔' : '✘'} ${txt}</div>`;
    let h = `<div style="font-size:11.5px;color:var(--muted);margin-top:6px">Meta ${Math.round(LZ_META * 100)}% até ${dBR(LZ_FIM)} · faltam ${nf(R)} limpezas</div>`;
    h += `<div style="font-size:12.5px;margin-top:4px">Máximo que ainda pode alcançar (fazendo todas completas): <strong>${pctBR((credito + R) / N)}</strong></div>`;
    if (folga < 0) {
      h += linha(false, `Mesmo fazendo todas as próximas completas, já não dá para bater ${Math.round(LZ_META * 100)}%.`);
      return h;
    }
    const podeFaltar = Math.min(R, Math.floor(folga + 1e-9));
    h += linha(podeFaltar > 0, podeFaltar > 0 ? `Pode <strong>faltar mais ${nf(podeFaltar)}</strong> limpeza${podeFaltar > 1 ? 's' : ''} e ainda bate a meta.` : `Não pode faltar mais nenhuma limpeza.`);
    const fimSemC = (credito + R * (1 - pesoC)) / N;
    h += linha(fimSemC >= LZ_META - 1e-9, `Se não fechar as OS (item C) em nenhuma das próximas: termina em <strong>${pctBR(fimSemC)}</strong>${fimSemC >= LZ_META - 1e-9 ? ', ainda bate' : ', não bate'}.`);
    const semC = Math.min(R, Math.floor(folga / pesoC + 1e-9));
    if (fimSemC < LZ_META - 1e-9) h += linha(semC > 0, `Pode deixar de fechar as OS em até <strong>${nf(semC)}</strong> limpeza${semC === 1 ? '' : 's'}.`);
    return h;
  }

  function limpezaRender() {
    const foco = GL && GL.lembrar();
    const hoje = hojeISO();
    const kp = ['A', 'B', 'C'].map(t => {
      const xs = L.linhas.filter(r => r.turno === t && r.data < hoje).map(r => MGPlanilha.totalLimpeza(r.itens)).filter(x => x != null);   // linha sem nada preenchido ainda não conta
      const p = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      const pr = limpezaPrevisao(t, hoje);
      return `<div class="kpi" style="min-width:260px"><span>Turno ${t} · média até ontem</span><b>${p == null ? '—' : (p * 100).toFixed(1).replace('.', ',') + '%'}</b>${pr}</div>`;
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
        <td class="num">${tot == null ? '<span class="muted" title="Ainda não preenchida: não entra na média">—</span>' : `<b>${Math.round(tot * 100)}%</b>`}</td>
        <td><input class="li-pend" value="${esc(r.pendencias || '')}" ${ed ? '' : 'disabled'} style="width:160px"></td>
        <td><input class="li-obs" value="${esc(r.observacoes || '')}" ${ed ? '' : 'disabled'} style="width:220px"></td>
        ${ed ? '<td><button type="button" class="btn small li-tudo" title="Marca como feita (V verde) todos os itens que se aplicam a este turno">Tudo feito</button></td>' : ''}</tr>`;
    }
    h += '</tbody>';
    if (!regs.length) h = `<tbody><tr><td class="muted" style="padding:18px">Nenhuma linha neste mês${CTX.dona ? '. Use "Criar as linhas deste mês".' : '.'}</td></tr></tbody>`;
    $('lTabela').innerHTML = h;
    if (GL) GL.restaurar(foco);
    selPintar();
  }

  // ---- seleção de várias células de itens (Shift / Ctrl) ----
  const SEL = { set: new Set(), ancora: null };   // chaves 'data|turno|item'
  const chaveCel = b => { const tr = b.closest('tr'); return tr.dataset.d + '|' + tr.dataset.t + '|' + b.dataset.i; };
  const celDe = k => { const [d, t, i] = k.split('|'); return $('lTabela').querySelector(`tr[data-d="${d}"][data-t="${t}"] button.it[data-i="${i}"]`); };
  function selPintar() {
    const tab = $('lTabela'); if (!tab) return;
    tab.querySelectorAll('button.it').forEach(b => b.classList.toggle('sel', SEL.set.size > 1 && SEL.set.has(chaveCel(b))));
    const info = $('lSelInfo'); if (info) info.textContent = SEL.set.size > 1 ? `${SEL.set.size} células selecionadas · digite V, J, P, F, - ou Delete, ou clique numa delas para escolher` : '';
  }
  function selLimpar() { SEL.set.clear(); selPintar(); }
  function selBloco(a, b) {   // seleciona o retângulo entre as células a e b
    const linhas = [...$('lTabela').querySelectorAll('tbody tr[data-d]')];
    const ra = linhas.indexOf(a.closest('tr')), rb = linhas.indexOf(b.closest('tr')); if (ra < 0 || rb < 0) return;
    const ia = +a.dataset.i, ib = +b.dataset.i;
    SEL.set.clear();
    for (let r = Math.min(ra, rb); r <= Math.max(ra, rb); r++)
      for (let i = Math.min(ia, ib); i <= Math.max(ia, ib); i++) { const c = linhas[r].querySelector(`button.it[data-i="${i}"]`); if (c && !c.disabled) SEL.set.add(chaveCel(c)); }
    selPintar();
  }
  // grava o mesmo código em todas as células selecionadas (uma gravação por linha)
  async function selAplicar(k) {
    const porLinha = new Map();
    for (const ch of SEL.set) { const [d, t, i] = ch.split('|'); const kl = d + '|' + t; if (!porLinha.has(kl)) porLinha.set(kl, []); porLinha.get(kl).push(+i); }
    const o = ITEM[k];
    SEL.set.forEach(ch => { const c = celDe(ch); if (c) { c.className = 'it ' + o.cls + ' sel'; c.textContent = o.rot; } });
    const tarefas = [];
    for (const [kl, is] of porLinha) {
      const [d, t] = kl.split('|'); const r = L.linhas.find(x => x.data === d && x.turno === t); if (!r) continue;
      const n = Math.max(38, (r.itens || []).length, ...is.map(i => i + 1));
      const antes = r.itens;
      r.itens = Array.from({ length: n }, (_, j) => (r.itens || [])[j] || '');
      is.forEach(i => { r.itens[i] = k; });
      tarefas.push(limpezaSalvar(r, null).then(ok => { if (!ok) r.itens = antes; }));
    }
    await Promise.all(tarefas);
    CTX.aviso(`${SEL.set.size} células preenchidas`);
    limpezaRender();
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
    L.menuBtn = btn;
    const varias = SEL.set.size > 1 && SEL.set.has(chaveCel(btn));
    menu.innerHTML = `<div class="muted">${varias ? `As ${SEL.set.size} células selecionadas` : 'Só este item'}</div>` +
      Object.entries(ITEM).map(([k, o]) => `<button type="button" data-k="${k}"${varias ? ' data-sel="1"' : ''}><i class="it ${o.cls}">${o.rot}</i>${o.nome}</button>`).join('') +
      (varias ? '' : '<div class="muted" style="margin-top:6px">Todos os itens que se aplicam a este turno</div>' +
      ['V', 'J', 'P', 'F', ''].map(k => `<button type="button" data-k="${k}" data-linha="1"><i class="it ${ITEM[k].cls}">${ITEM[k].rot}</i>${ITEM[k].nome}</button>`).join(''));
    const rc = btn.getBoundingClientRect();
    menu.style.left = Math.min(window.innerWidth - 300, rc.left + window.scrollX) + 'px';
    menu.style.top = (rc.bottom + window.scrollY + 4) + 'px';
    menu.hidden = false;
    menu.onclick = async e => {
      const b = e.target.closest('button[data-k]'); if (!b) return;
      if (btn.isConnected) btn.focus({ preventScroll: true });   // a célula continua selecionada para seguir com as setas
      menu.hidden = true;
      if (b.dataset.sel) { await selAplicar(b.dataset.k); return; }
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
    document.addEventListener('keydown', e => {   // Esc fecha o menu do item e volta para a célula
      const m = $('lMenu'); if (!m || m.hidden || e.key !== 'Escape') return;
      m.hidden = true; if (L.menuBtn && L.menuBtn.isConnected) L.menuBtn.focus({ preventScroll: true });
    });
    document.addEventListener('click', e => { const m = $('lMenu'); if (m && !m.hidden && !e.target.closest('#lMenu') && !e.target.closest('.it')) m.hidden = true; });
    MGZoom.anexar('lTabela');
    GL = MGTeclado.grade($('lTabela'), { seletor: 'button.it, input.li-ini, input.li-fim, input.li-pend, input.li-obs', chaveLinha: tr => tr.dataset.d + '|' + tr.dataset.t });
    // Shift + setas aumentam a seleção; setas sozinhas voltam a uma célula só; Esc limpa
    $('lTabela').addEventListener('mousedown', e => { if (e.shiftKey && e.target.closest('button.it')) e.preventDefault(); });
    $('lTabela').addEventListener('keydown', e => {
      const it = e.target.closest && e.target.closest('button.it'); if (!it) return;
      if (e.key === 'Escape' && SEL.set.size > 1) { e.preventDefault(); SEL.set = new Set([chaveCel(it)]); SEL.ancora = chaveCel(it); selPintar(); return; }
      if (!/^Arrow/.test(e.key)) return;
      if (e.shiftKey && !SEL.ancora) SEL.ancora = chaveCel(it);
      if (e.shiftKey && !SEL.set.size) SEL.set.add(chaveCel(it));
      const shift = e.shiftKey;
      setTimeout(() => {
        const f = document.activeElement; if (!f || !f.matches || !f.matches('#lTabela button.it')) return;
        if (shift) { const a = celDe(SEL.ancora) || f; selBloco(a, f); }
        else { SEL.set = new Set([chaveCel(f)]); SEL.ancora = chaveCel(f); selPintar(); }
      }, 0);
    }, true);
    // Teclas no item: V feita · J justificada · P erro de planejamento · F faltou · - não se aplica · Delete apaga. Depois anda para a direita.
    $('lTabela').addEventListener('keydown', async e => {
      const it = e.target.closest && e.target.closest('button.it');
      if (!it || !CTX.dona || e.ctrlKey || e.altKey || e.metaKey) return;
      const k = TECLA_ITEM[e.key.toLowerCase()];
      if (k === undefined) return;
      e.preventDefault();
      if (SEL.set.size > 1 && SEL.set.has(chaveCel(it))) { await selAplicar(k); return; }
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
      if (it) {
        const ch = chaveCel(it);
        if (e.shiftKey) { const a = (SEL.ancora && celDe(SEL.ancora)) || it; if (!SEL.ancora) SEL.ancora = ch; selBloco(a, it); it.focus({ preventScroll: true }); $('lMenu').hidden = true; return; }
        if (e.ctrlKey || e.metaKey) {
          if (SEL.set.size <= 1 && SEL.ancora && SEL.ancora !== ch) SEL.set.add(SEL.ancora);
          SEL.set.has(ch) ? SEL.set.delete(ch) : SEL.set.add(ch); SEL.ancora = ch; selPintar(); it.focus({ preventScroll: true }); $('lMenu').hidden = true; return;
        }
        if (!(SEL.set.size > 1 && SEL.set.has(ch))) { SEL.set = new Set([ch]); SEL.ancora = ch; selPintar(); }
        limpezaMenu(it); return;
      }
      if (e.target.classList.contains('li-tudo')) {
        const tr = e.target.closest('tr'); const r = limpezaReg(tr); if (!r) return;
        const antes = r.itens;
        r.itens = Array.from({ length: Math.max(38, (r.itens || []).length) }, (_, k) => ((r.itens || [])[k] === '-' ? '-' : 'V'));
        const primeiro = tr.querySelector('button.it'); if (primeiro) primeiro.focus({ preventScroll: true });
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
    ['solucao', 'Solução', 'area', 200], ['observacoes', 'Observações', 'area', 160], ['_total', 'Total', 'calc'], ['_sgman', 'SGMAN', 'sg'], ['analise', 'Análise', 'area', 200]];
  const OS_ORDENS = [['posicao', 'Ordem da lista (manual)'], ['numero', 'Nº OS'], ['data', 'Data (programada)'], ['data_abertura', 'Data de abertura'],
    ['ordem_grupo', 'ID (pendência)'], ['mantenedor', 'Mantenedor'], ['feitas', 'Feitas'], ['_total', 'Total'], ['_sgman', 'Status no SGMAN'],
    ['descricao', 'Descrição'], ['conjunto', 'Conjunto'], ['atualizado_em', 'Última alteração']];
  const ORD = (() => { try { const o = JSON.parse(localStorage.getItem('mg-os-ordem') || 'null'); if (o && OS_ORDENS.some(x => x[0] === o.k)) return o; } catch (e) { } return { k: 'posicao', dir: 1 }; })();
  const guardarOrdem = () => { try { localStorage.setItem('mg-os-ordem', JSON.stringify(ORD)); } catch (e) { } };
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
      <label>Ordenar por <select id="oOrdem">${OS_ORDENS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
      <button class="btn small" id="oDir" type="button" title="Inverter a ordem">↑ Crescente</button>
      <span class="muted" id="oResumo"></span>
      <button class="btn small" id="oSgBtn" type="button">Conferir com o SGMAN</button>
      <input type="file" id="oSgArq" accept=".xlsx,.xls" hidden>
      <button class="btn small primary" id="oNova" type="button" hidden>Nova OS</button>
    </div>
    <div id="oSg"></div>
    <p class="muted" style="margin:0 0 8px">Teclado: setas andam entre as células (nos textos, ← → saem da célula no começo/fim do texto e ↑ ↓ na primeira/última linha). Tab também funciona.</p>
    <div class="scroll"><table id="oTabela"></table></div>`;
  }

  async function osCarregar() {
    $('oResumo').textContent = 'Carregando…';
    try { O.linhas = await MG.buscarTudo('os', '*', null, 'id'); await sgCarregarConfig(); osRender(); }
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
.sort(osComparar);
    $('oResumo').textContent = `${nf(regs.length)} OS`;
    $('oNova').hidden = !CTX.dona;
    const ed = CTX.dona ? '' : 'disabled';
    $('oOrdem').value = ORD.k; $('oDir').textContent = ORD.dir > 0 ? '↑ Crescente' : '↓ Decrescente';
    const seta = k => { const kk = k === 'data_abertura' ? 'data_abertura' : k; return ORD.k === kk ? (ORD.dir > 0 ? ' ▲' : ' ▼') : ''; };
    let h = `<thead><tr>${OS_COLS.map(c => OS_ORDENS.some(o => o[0] === c[0])
      ? `<th class="o-ord" data-ord="${c[0]}" style="cursor:pointer" title="Ordenar por esta coluna">${c[1]}${seta(c[0])}</th>` : `<th>${c[1]}</th>`).join('')}${CTX.dona ? '<th></th>' : ''}</tr></thead><tbody>`;
    for (const o of regs) {
      h += `<tr data-id="${o.id}">` + OS_COLS.map(([k, , tipo, w]) => {
        const v = o[k];
        if (tipo === 'calc') return `<td class="num"><b>${Math.round(MGPlanilha.totalOS(o) * 100)}%</b></td>`;
        if (tipo === 'sg') return `<td>${sgPill(o)}</td>`;
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

  /* =================== OS: ordenação e conferência com o SGMAN =================== */
  // SG.ultimo = último arquivo do SGMAN lido (status de cada OS, para a coluna SGMAN)
  // SG.dec = escolhas já feitas: { '<nº>': { campo: valor do SGMAN que você decidiu NÃO usar } , __ignoradas: [nº…] }
  const SG = { ultimo: null, dec: { __ignoradas: [] }, conf: null, abertos: {}, mant: 'DOUGLAS', linhas: null, arquivo: '' };
  const ST_ORDEM = { 'ATRASADA': 1, 'EM ANDAMENTO ATRASADA': 2, 'ABERTA': 3, 'EM ANDAMENTO': 4, 'CONCLUIDA': 5 };
  const SG_CAMPOS = [['descricao', 'Descrição'], ['mantenedor', 'Mantenedor'], ['data', 'Data (programada)'], ['feitas', 'Feitas'],
    ['ordem_grupo', 'ID (pendência)'], ['conjunto', 'Conjunto'], ['item', 'Item'], ['problema', 'Problema'], ['solucao', 'Solução']];
  const PARTES = ['conjunto', 'item', 'problema', 'solução'];
  const SG_PARADA = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'QUE', 'PARA', 'COM', 'NA', 'NO', 'EM', 'UM', 'UMA', 'ESTA', 'ESTAO', 'SEM', 'POR', 'NAO', 'MAIS', 'FOI']);
  const limpaTxt = v => v == null ? '' : String(v).replace(/_x000d_/gi, '').replace(/\r/g, '');
  const cmpTxt = v => norm(limpaTxt(v));

  async function sgCarregarConfig() {
    try {
      const { data } = await sb.from('configuracao').select('chave,valor').in('chave', ['sgman_ultimo', 'sgman_decisoes']);
      (data || []).forEach(r => { if (r.chave === 'sgman_ultimo') SG.ultimo = r.valor; else SG.dec = Object.assign({ __ignoradas: [] }, r.valor || {}); });
    } catch (e) { /* sem configuração: segue sem a coluna SGMAN */ }
  }
  async function sgSalvarConfig(chave, valor) {
    if (!CTX.dona) return;
    const { error } = await sb.from('configuracao').upsert({ chave, valor }, { onConflict: 'chave' });
    if (error) CTX.erro('Erro ao salvar no sistema: ' + error.message);
  }

  function sgStatus(o) {
    if (!o.numero || !SG.ultimo || !SG.ultimo.os) return null;
    return SG.ultimo.os[o.numero] || null;
  }
  function sgPill(o) {
    if (!o.numero) return '<span class="pill na" title="Ainda sem número de OS">sem nº</span>';
    const s = sgStatus(o);
    if (!s) {
      if (!SG.ultimo) return '';
      if (SG.ultimo.min && o.numero < SG.ultimo.min) return '<span class="pill na" title="O último arquivo do SGMAN não chega até essa OS">fora do arquivo</span>';
      return '<span class="pill pendente" title="Não estava no último arquivo do SGMAN">não está</span>';
    }
    const k = norm(s.st), cls = k === 'CONCLUIDA' ? 'apontado' : /ATRASADA/.test(k) ? 'pendente' : 'turno_anterior';
    return `<span class="pill ${cls}" title="${esc(s.ex || '')}${s.ter ? ' · terminou ' + dBR(s.ter) : ''}">${esc(s.st)}</span>`;
  }

  function osValor(o, k) {
    if (k === '_total') return MGPlanilha.totalOS(o);
    if (k === '_sgman') { const s = sgStatus(o); return s ? (ST_ORDEM[norm(s.st)] || 9) : null; }
    const v = o[k];
    if (v == null || v === '') return null;
    if (['numero', 'ordem_grupo', 'posicao'].includes(k)) return Number(v);
    if (['data', 'data_abertura', 'atualizado_em'].includes(k)) return String(v);
    return cmpTxt(v);
  }
  function osComparar(a, b) {
    const va = osValor(a, ORD.k), vb = osValor(b, ORD.k);
    if (va == null && vb != null) return 1;           // vazios sempre no fim
    if (vb == null && va != null) return -1;
    if (va != null && vb != null && va !== vb) return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt')) * ORD.dir;
    return (a.posicao || 1e9) - (b.posicao || 1e9) || a.id - b.id;
  }

  /* ---------- leitura do arquivo exportado do SGMAN ---------- */
  function sgCips(com) {
    const linhas = limpaTxt(com).split('\n').map(l => l.trim()).filter(Boolean);
    return { linhas, cips: linhas.length >= 4 ? { conjunto: linhas[0], item: linhas[1], problema: linhas[2], solucao: linhas.slice(3).join('\n') } : null };
  }
  async function sgLerArquivo(f) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
      const iCab = aoa.findIndex(r => r && r.some(c => norm(c) === 'ID') && r.some(c => norm(c) === 'DESCRICAO'));
      if (iCab < 0) { CTX.erro('Não achei as colunas ID e Descrição. Use a lista exportada do SGMAN (.xlsx).'); return; }
      const cab = aoa[iCab].map(norm), col = n => cab.indexOf(n);
      const c = { id: col('ID'), desc: col('DESCRICAO'), tipo: col('TIPO'), ex: col('EXECUTANTE'), prog: col('DATA PROGRAMADA'), st: col('STATUS'),
        ini: col('DATA INICIO'), ter: col('DATA TERMINO'), com: col('COMENTARIO'), pend: col('ID PENDENCIA'), local: col('LOCAL') };
      const g = (r, i) => i < 0 ? null : r[i];
      const linhas = [];
      for (const r of aoa.slice(iCab + 1)) {
        const num = Number(g(r, c.id)); if (!num) continue;
        const com = limpaTxt(g(r, c.com)).trim();
        const p = sgCips(com);
        linhas.push({ num, desc: txt(limpaTxt(g(r, c.desc))), tipo: txt(g(r, c.tipo)) || '', ex: txt(g(r, c.ex)) ? String(g(r, c.ex)).replace(/\s+/g, ' ').trim() : '',
          prog: paraISO(g(r, c.prog)), st: txt(g(r, c.st)) || '', ini: paraISO(g(r, c.ini)), ter: paraISO(g(r, c.ter)), com, linhasCom: p.linhas, cips: p.cips,
          pend: g(r, c.pend) == null || g(r, c.pend) === '' ? null : Number(g(r, c.pend)), cil: /\bCIL\b/i.test(String(g(r, c.tipo) || '')) });
      }
      if (!linhas.length) { CTX.erro('O arquivo não tem OS.'); return; }
      SG.linhas = linhas; SG.arquivo = f.name;
      const semCil = linhas.filter(l => !l.cil), nums = linhas.map(l => l.num);
      SG.ultimo = { em: new Date().toISOString(), arquivo: f.name, min: Math.min(...nums), max: Math.max(...nums), os: {} };
      semCil.forEach(l => { SG.ultimo.os[l.num] = { st: l.st, ex: l.ex, ter: l.ter }; });
      await sgSalvarConfig('sgman_ultimo', SG.ultimo);
      sgConferir(); osRender();
      $('oSg').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { CTX.erro('Não consegui ler o arquivo: ' + e.message); }
  }

  /* ---------- comparação ---------- */
  const tokensNome = n => norm(n).split(' ').filter(w => w.length > 1);
  function mesmoNome(a, b) {
    const ta = tokensNome(a), tb = tokensNome(b); if (!ta.length || !tb.length) return false;
    const [cur, lon] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    return cur.every(w => lon.includes(w));
  }
  function nomeNoSite(ex) {
    const achado = O.linhas.map(o => o.mantenedor).find(m => m && mesmoNome(m, ex));
    return achado ? String(achado).replace(/\s+/g, ' ').trim() : ex;
  }
  const palavras = s => new Set(norm(limpaTxt(s)).replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(w => w.length >= 3 && !SG_PARADA.has(w)));
  function sgParecido(a, b) {
    const A = palavras(a), B = palavras(b); if (!A.size || !B.size) return 0;
    let n = 0; A.forEach(w => { if (B.has(w)) n++; });
    return 2 * n / (A.size + B.size);
  }
  function valorSg(l, k) {
    if (k === 'descricao') return l.desc;
    if (k === 'mantenedor') return l.ex || null;
    if (k === 'data') return l.prog;
    if (k === 'feitas') return norm(l.st) === 'CONCLUIDA' ? 'SIM' : 'NÃO';
    if (k === 'ordem_grupo') return l.pend;
    return l.cips ? l.cips[k] : null;
  }
  function igual(k, site, sg) {
    if (k === 'mantenedor') return mesmoNome(site, sg);
    if (k === 'ordem_grupo') return Number(site) === Number(sg);
    return cmpTxt(site) === cmpTxt(sg);
  }

  function sgConferir() {
    const L = SG.linhas; if (!L) { SG.conf = null; return; }
    const porNum = new Map(L.map(l => [l.num, l]));
    const ign = new Set((SG.dec.__ignoradas || []).map(Number));
    const numsSite = new Set(O.linhas.filter(o => o.numero).map(o => Number(o.numero)));
    const conf = { mudancas: [], naoEncontradas: [], foraPeriodo: [], semNumero: [], soSgman: [], ignoradas: 0, conferidas: 0 };
    for (const o of O.linhas) {
      if (!o.numero) { if (txt(o.descricao)) conf.semNumero.push(o); continue; }
      const l = porNum.get(Number(o.numero));
      if (!l) { (o.numero < SG.ultimo.min ? conf.foraPeriodo : conf.naoEncontradas).push(o); continue; }
      conf.conferidas++;
      const dec = SG.dec[o.numero] || {}, campos = [];
      for (const [k, rot] of SG_CAMPOS) {
        const sv = valorSg(l, k); if (sv == null || sv === '') continue;
        if (igual(k, o[k], sv)) continue;
        if (k in dec && dec[k] === cmpTxt(sv)) continue;      // você já decidiu manter o do site
        campos.push({ k, rot, site: o[k], sg: k === 'mantenedor' ? nomeNoSite(sv) : sv, vazio: o[k] == null || String(o[k]).trim() === '' });
      }
      if (campos.length) conf.mudancas.push({ o, l, campos });
    }
    const livres = L.filter(l => !l.cil && !numsSite.has(l.num));
    for (const l of livres) { if (ign.has(l.num)) conf.ignoradas++; else conf.soSgman.push(l); }
    conf.semNumero = conf.semNumero.map(o => ({ o, cand: livres.map(l => ({ l, p: sgParecido(o.descricao, l.desc) + (o.mantenedor && l.ex && mesmoNome(o.mantenedor, l.ex) ? .1 : 0) }))
      .filter(x => x.p >= .25).sort((a, b) => b.p - a.p).slice(0, 3) }));
    SG.conf = conf;
    sgRender();
  }

  /* ---------- tela ---------- */
  const sgMostra = (k, v) => v == null || String(v).trim() === '' ? '<span class="muted">(vazio)</span>'
    : (k === 'data' ? dBR(String(v)) : esc(limpaTxt(v))).replace(/\n/g, '<br>');
  const linhaSg = l => `<b>OS ${l.num}</b> · ${esc(l.desc || '')} <span class="muted">· ${esc(l.ex || 'sem executante')} · ${esc(l.st)}${l.prog ? ' · prog. ' + dBR(l.prog) : ''}</span>`;

  function sgRender() {
    const el = $('oSg'), C = SG.conf;
    if (!C) { el.innerHTML = ''; return; }
    const dona = CTX.dona, L = SG.linhas;
    const nCil = L.filter(l => l.cil).length;
    const ab = (k, padrao) => (k in SG.abertos ? SG.abertos[k] : padrao) ? 'open' : '';
    let h = `<div class="card" style="border-left:4px solid var(--accent)">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">
        <h2 style="margin:0">Conferência com o SGMAN</h2>
        <span class="muted">${esc(SG.arquivo)} · ${nf(L.length)} OS no arquivo (OS ${nf(SG.ultimo.min)} a ${nf(SG.ultimo.max)}) · ${nf(nCil)} Atividades de CIL ignoradas
        <button class="btn small" data-act="fechar" type="button">Fechar</button></span>
      </div>
      <p class="muted" style="margin:6px 0 0">${nf(C.conferidas)} OS do site encontradas no SGMAN. ${dona ? '' : 'Só a dona do sistema pode aplicar mudanças.'}</p>`;

    // 1. Mudanças
    const nCampos = C.mudancas.reduce((a, m) => a + m.campos.length, 0);
    h += `<details data-sec="dif" ${ab("dif", true)} style="margin-top:12px"><summary><b>Diferenças entre o site e o SGMAN</b> — ${nf(C.mudancas.length)} OS, ${nf(nCampos)} campos</summary>`;
    if (!C.mudancas.length) h += '<p class="muted">Nenhuma diferença: tudo o que está no site bate com o SGMAN.</p>';
    else {
      h += `<p class="muted" style="margin:6px 0">Para cada campo, escolha qual valor manter. Quando o site está vazio, o SGMAN já vem marcado. Se escolher manter o do site, não pergunto de novo enquanto o SGMAN não mudar esse campo. Conjunto, Item, Problema e Solução vêm das 4 primeiras linhas do comentário.</p>`;
      for (const m of C.mudancas) {
        h += `<div class="sg-os" data-num="${m.o.numero}" style="border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:8px 0">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>${linhaSg(m.l)}</span>
          ${dona ? `<span><button class="btn small" data-act="tudo-sg" type="button">Tudo do SGMAN</button> <button class="btn small" data-act="tudo-site" type="button">Manter tudo do site</button></span>` : ''}</div>
          <div class="scroll"><table style="margin-top:6px"><thead><tr><th>Campo</th><th>Manter</th><th>No site</th><th>No SGMAN</th></tr></thead><tbody>`;
        for (const c of m.campos) {
          const nome = `sg-${m.o.numero}-${c.k}`;
          h += `<tr><td>${c.rot}</td><td style="white-space:nowrap">
            <label><input type="radio" name="${nome}" value="site" ${dona ? '' : 'disabled'}> site</label>
            <label style="margin-left:8px"><input type="radio" name="${nome}" value="sg" ${c.vazio ? 'checked' : ''} ${dona ? '' : 'disabled'}> SGMAN</label></td>
            <td style="max-width:320px">${sgMostra(c.k, c.site)}</td><td style="max-width:320px">${sgMostra(c.k, c.sg)}</td></tr>`;
        }
        h += '</tbody></table></div></div>';
      }
      if (dona) h += '<button class="btn small primary" data-act="aplicar" type="button">Aplicar as escolhas</button> <span class="muted">Campos sem escolha continuam pendentes.</span>';
    }
    h += '</details>';

    // 2. Conferência do mantenedor
    const exs = [...new Set(L.filter(l => !l.cil && l.ex).map(l => l.ex))].sort((a, b) => a.localeCompare(b, 'pt'));
    const doMant = L.filter(l => !l.cil && l.ex && mesmoNome(l.ex, SG.mant));
    const probs = doMant.map(l => {
      const p = [];
      if (norm(l.st) !== 'CONCLUIDA') p.push(`não concluída (${esc(l.st)})`);
      if (!l.com) p.push('sem comentário');
      else if (l.linhasCom.length < 4) p.push('comentário incompleto: falta ' + PARTES.slice(l.linhasCom.length).join(', '));
      return { l, p };
    }).filter(x => x.p.length).sort((a, b) => b.l.num - a.l.num);
    h += `<details data-sec="mant" ${ab("mant", true)} style="margin-top:12px"><summary><b>OS do mantenedor no SGMAN</b> — ${nf(doMant.length - probs.length)} de ${nf(doMant.length)} OK</summary>
      <div class="barra" style="margin:8px 0"><label>Mantenedor <select id="sgMant">${exs.map(e => `<option value="${esc(e)}" ${mesmoNome(e, SG.mant) ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></label>
      <span class="muted">OK = concluída e com comentário de 4 linhas (conjunto, item, problema e solução).</span></div>`;
    if (!probs.length) h += '<p class="muted">Todas as OS dele estão concluídas e com o comentário completo.</p>';
    else h += `<div class="scroll"><table><thead><tr><th>OS</th><th>Descrição</th><th>Status</th><th>Prog.</th><th>O que falta</th><th>No site?</th><th>Comentário</th></tr></thead><tbody>${probs.map(({ l, p }) =>
      `<tr><td class="num">${l.num}</td><td style="max-width:280px">${esc(l.desc || '')}</td><td>${esc(l.st)}</td><td>${dBR(l.prog)}</td>
       <td style="color:var(--bad)">${p.join('; ')}</td><td>${O.linhas.some(o => Number(o.numero) === l.num) ? 'sim' : '<span class="muted">não</span>'}</td>
       <td style="max-width:280px" class="muted">${l.linhasCom.map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`;
    h += '</details>';

    // 3. Site sem SGMAN
    h += `<details data-sec="site" ${ab('site', C.naoEncontradas.length > 0)} style="margin-top:12px"><summary><b>Estão no site e não no SGMAN</b> — ${nf(C.naoEncontradas.length)}</summary>`;
    h += C.naoEncontradas.length ? `<ul>${C.naoEncontradas.map(o => `<li><b>OS ${o.numero}</b> · ${esc(o.descricao || '')} <span class="muted">· ${esc(o.mantenedor || '')}</span> — confira o número ou se ela foi aberta no SGMAN.</li>`).join('')}</ul>`
      : '<p class="muted">Todas as OS numeradas do site estão no arquivo.</p>';
    if (C.foraPeriodo.length) h += `<p class="muted">${nf(C.foraPeriodo.length)} OS do site têm número menor que o primeiro do arquivo (${C.foraPeriodo.map(o => o.numero).join(', ')}); para conferir, exporte um período maior do SGMAN.</p>`;
    h += '</details>';

    // 4. Lembretes sem número
    h += `<details data-sec="semnum" ${ab('semnum', C.semNumero.length > 0)} style="margin-top:12px"><summary><b>No site ainda sem número (lembretes)</b> — ${nf(C.semNumero.length)}</summary>`;
    if (!C.semNumero.length) h += '<p class="muted">Nenhuma OS sem número.</p>';
    else h += `<p class="muted" style="margin:6px 0">Procurei no SGMAN OS parecidas que ainda não estão no site. Se uma delas for a mesma, vincule; o número é gravado e as diferenças aparecem acima.</p>` +
      C.semNumero.map(({ o, cand }) => `<div style="border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:8px 0" data-id="${o.id}">
        <div><b>${esc(o.descricao)}</b> <span class="muted">· ${esc(o.mantenedor || 'sem mantenedor')}${o.data_abertura ? ' · anotada em ' + dBR(o.data_abertura) : ''}</span></div>
        ${cand.length ? cand.map(x => `<div style="margin-top:6px">${dona ? `<button class="btn small" data-act="vincular" data-num="${x.l.num}" type="button">É esta</button> ` : ''}${linhaSg(x.l)}</div>`).join('')
          : '<div class="muted" style="margin-top:6px">Nada parecido no SGMAN: parece que ainda não foi criada.</div>'}
        ${dona ? `<div style="margin-top:6px"><input type="number" class="sg-num" placeholder="Nº da OS" style="width:110px"> <button class="btn small" data-act="vincular-manual" type="button">Vincular a este número</button></div>` : ''}
      </div>`).join('');
    h += '</details>';

    // 5. SGMAN sem site
    h += `<details data-sec="sosg" ${ab("sosg", false)} style="margin-top:12px"><summary><b>Estão no SGMAN e não no site</b> (sem CIL) — ${nf(C.soSgman.length)}</summary>`;
    if (C.soSgman.length) h += `${dona ? '<div style="margin:8px 0"><button class="btn small" data-act="adicionar-todas" type="button">Adicionar todas ao site</button></div>' : ''}
      <div class="scroll"><table><thead><tr><th>OS</th><th>Descrição</th><th>Tipo</th><th>Executante</th><th>Status</th><th>Prog.</th>${dona ? '<th></th>' : ''}</tr></thead><tbody>${C.soSgman.sort((a, b) => b.num - a.num).map(l =>
        `<tr><td class="num">${l.num}</td><td style="max-width:300px">${esc(l.desc || '')}</td><td>${esc(l.tipo)}</td><td>${esc(l.ex)}</td><td>${esc(l.st)}</td><td>${dBR(l.prog)}</td>
        ${dona ? `<td style="white-space:nowrap"><button class="btn small" data-act="adicionar" data-num="${l.num}" type="button">Adicionar ao site</button> <button class="btn small" data-act="ignorar" data-num="${l.num}" type="button">Ignorar</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
    else h += '<p class="muted">Nenhuma.</p>';
    if (C.ignoradas) h += `<p class="muted">${nf(C.ignoradas)} ignoradas por você. ${dona ? '<button class="btn small" data-act="designorar" type="button">Voltar a mostrar</button>' : ''}</p>`;
    h += '</details></div>';
    el.innerHTML = h;
    const sel = $('sgMant'); if (sel) sel.onchange = () => { SG.mant = sel.value; sgRender(); };
  }

  /* ---------- ações ---------- */
  function linhaNova(l, pos) {
    const r = { posicao: pos, numero: l.num, descricao: l.desc, mantenedor: l.ex ? nomeNoSite(l.ex) : null, data: l.prog,
      feitas: norm(l.st) === 'CONCLUIDA' ? 'SIM' : 'NÃO', ordem_grupo: l.pend };
    if (l.cips) Object.assign(r, l.cips);
    return r;
  }
  async function sgClique(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'fechar') { SG.conf = null; SG.linhas = null; sgRender(); return; }
    if (!CTX.dona) return;
    const caixa = b.closest('.sg-os');
    if (act === 'tudo-sg' || act === 'tudo-site') { caixa.querySelectorAll(`input[value="${act === 'tudo-sg' ? 'sg' : 'site'}"]`).forEach(r => { r.checked = true; }); return; }
    if (b.disabled) return; b.disabled = true;
    try {
      if (act === 'aplicar') {
        let nAtual = 0, nMant = 0;
        for (const m of SG.conf.mudancas) {
          const upd = {}, dec = SG.dec[m.o.numero] || {};
          for (const c of m.campos) {
            const r = document.querySelector(`input[name="sg-${m.o.numero}-${c.k}"]:checked`); if (!r) continue;
            if (r.value === 'sg') { upd[c.k] = c.sg; delete dec[c.k]; }
            else { dec[c.k] = cmpTxt(valorSg(m.l, c.k)); nMant++; }
          }
          SG.dec[m.o.numero] = dec;
          if (Object.keys(upd).length) {
            const { error } = await sb.from('os').update(Object.assign({}, upd, { atualizado_em: new Date().toISOString() })).eq('id', m.o.id);
            if (error) { CTX.erro('Erro ao salvar a OS ' + m.o.numero + ': ' + error.message); return; }
            Object.assign(m.o, upd); nAtual++;
          }
        }
        await sgSalvarConfig('sgman_decisoes', SG.dec);
        CTX.aviso(`${nAtual} OS atualizadas com o SGMAN${nMant ? `; ${nMant} campos mantidos do site` : ''}`);
      } else if (act === 'vincular' || act === 'vincular-manual') {
        const box = b.closest('[data-id]'), o = O.linhas.find(x => String(x.id) === box.dataset.id);
        const num = Number(act === 'vincular' ? b.dataset.num : box.querySelector('.sg-num').value);
        if (!o || !num) { CTX.erro('Informe o número da OS.'); return; }
        const outra = O.linhas.find(x => x !== o && Number(x.numero) === num);
        if (outra && !confirm(`A OS ${num} já está no site (${outra.descricao || 'sem descrição'}). Vincular mesmo assim? Ficarão duas linhas com o mesmo número.`)) return;
        const { error } = await sb.from('os').update({ numero: num, atualizado_em: new Date().toISOString() }).eq('id', o.id);
        if (error) { CTX.erro('Erro ao vincular: ' + error.message); return; }
        o.numero = num; CTX.aviso(`Vinculada à OS ${num}`);
      } else if (act === 'adicionar' || act === 'adicionar-todas') {
        const lista = act === 'adicionar' ? SG.conf.soSgman.filter(l => l.num === Number(b.dataset.num)) : SG.conf.soSgman.slice().sort((a, b2) => a.num - b2.num);
        if (act === 'adicionar-todas' && !confirm(`Adicionar ${lista.length} OS do SGMAN ao site?`)) return;
        let pos = O.linhas.reduce((a, o) => Math.max(a, o.posicao || 0), 0);
        const novas = lista.map(l => linhaNova(l, ++pos));
        const { data, error } = await sb.from('os').insert(novas).select();
        if (error) { CTX.erro('Erro ao adicionar: ' + error.message); return; }
        O.linhas.push(...data); CTX.aviso(`${data.length} OS adicionadas`);
      } else if (act === 'ignorar') {
        SG.dec.__ignoradas = [...new Set([...(SG.dec.__ignoradas || []), Number(b.dataset.num)])];
        await sgSalvarConfig('sgman_decisoes', SG.dec);
      } else if (act === 'designorar') {
        SG.dec.__ignoradas = [];
        await sgSalvarConfig('sgman_decisoes', SG.dec);
      }
      const y = window.scrollY;
      sgConferir(); osRender(); window.scrollTo(0, y);
    } finally { b.disabled = false; }
  }

  function osIniciar() {
    $('sec-os').innerHTML = osHTML();
    MGZoom.anexar('oTabela');
    GO = MGTeclado.grade($('oTabela'), { seletor: 'input[data-k], select[data-k], textarea[data-k]', chaveLinha: tr => tr.dataset.id });
    $('oMant').addEventListener('change', osRender);
    $('oFeitas').addEventListener('change', osRender);
    $('oOrdem').addEventListener('change', () => { ORD.k = $('oOrdem').value; ORD.dir = 1; guardarOrdem(); osRender(); });
    $('oDir').addEventListener('click', () => { ORD.dir = -ORD.dir; guardarOrdem(); osRender(); });
    $('oTabela').addEventListener('click', e => {
      const th = e.target.closest('th.o-ord'); if (!th) return;
      if (ORD.k === th.dataset.ord) ORD.dir = -ORD.dir; else { ORD.k = th.dataset.ord; ORD.dir = 1; }
      guardarOrdem(); osRender();
    });
    $('oSgBtn').addEventListener('click', () => { $('oSgArq').value = ''; $('oSgArq').click(); });
    $('oSgArq').addEventListener('change', e => { const f = e.target.files[0]; if (f) sgLerArquivo(f); });
    $('oSg').addEventListener('click', sgClique);
    $('oSg').addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.sec) SG.abertos[d.dataset.sec] = d.open; }, true);
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

  /* =================== MENUS (programadas e subgrupos) =================== */
  const GRUPOS = ['Disponibilidade', 'Performance', 'Qualidade'];
  const SEIS = ['Quebra ou Falha do Equipamento', 'Setup e Ajuste', 'Ociosidade e Pequenas Paradas', 'Velocidade Reduzida', 'Defeitos no processo', 'Defeitos de partida'];
  const CAMPOS = [['precisa_conjunto', 'Conjunto'], ['precisa_item', 'Item'], ['precisa_problema', 'Problema'], ['precisa_solucao', 'Solução']];
  const MN = { prog: [], sub: [] };
  const porOrdem = (a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9) || String(a.programada || a.subgrupo).localeCompare(String(b.programada || b.subgrupo), 'pt');
  function menusHTML() {
    return `
    <div class="card"><h2>Menus da classificação</h2>
      <p class="muted" style="margin:6px 0 0;max-width:100ch">Aqui você muda as opções das listas <b>Programada</b> e <b>Subgrupo do OEE</b> da aba Apontamentos. Cada mudança salva na hora.
      Desativar tira a opção das listas, mas as paradas já classificadas com ela continuam iguais. Renomear também renomeia nas paradas já classificadas.
      ↑ ↓ mudam a ordem em que as opções aparecem nas listas.</p>
    </div>
    <div class="card"><h2 style="font-size:16px">Programadas</h2>
      <p class="muted" style="margin:4px 0 8px">"Pede subgrupo" = ao escolher esta programada, você escolhe também um subgrupo do OEE (como na Não programada).</p>
      <div class="scroll"><table id="mnProg"></table></div>
      <div class="barra" style="margin:10px 0 0">
        <label>Nova programada <input id="mnProgNome" style="width:220px"></label>
        <label><input type="checkbox" id="mnProgExige"> pede subgrupo</label>
        <button class="btn primary small" type="button" id="mnProgAdd">Adicionar</button>
      </div>
    </div>
    <div class="card"><h2 style="font-size:16px">Subgrupos do OEE</h2>
      <p class="muted" style="margin:4px 0 8px">Só os subgrupos <b>com grupo do OEE</b> aparecem na lista da Não programada. Os sem grupo são os das outras programadas (têm o mesmo nome delas).
      As colunas Conjunto, Item, Problema e Solução dizem quais campos ficam marcados como "precisa preencher" nas paradas com este subgrupo.</p>
      <div class="scroll"><table id="mnSub"></table></div>
      <div class="barra" style="margin:10px 0 0">
        <label>Novo subgrupo <input id="mnSubNome" style="width:220px"></label>
        <label>Grupo <select id="mnSubGrupo"><option value="">— sem grupo</option>${GRUPOS.map(g => `<option>${g}</option>`).join('')}</select></label>
        <label>6 Grandes Perdas <select id="mnSubSeis"><option value=""></option>${SEIS.map(g => `<option>${g}</option>`).join('')}</select></label>
        <button class="btn primary small" type="button" id="mnSubAdd">Adicionar</button>
      </div>
    </div>`;
  }
  async function menusCarregar() {
    const [p, s] = await Promise.all([sb.from('programadas').select('*'), sb.from('subgrupos').select('*')]);
    if (p.error || s.error) { CTX.erro('Erro ao carregar os menus: ' + (p.error || s.error).message); return; }
    MN.prog = p.data.sort(porOrdem); MN.sub = s.data.sort(porOrdem);
    menusRender();
  }
  const ck = (cls, v, ed, extra) => `<input type="checkbox" class="${cls}" ${v ? 'checked' : ''} ${ed} ${extra || ''}>`;
  const setas = (i, n, ed) => `<button class="btn small mn-mov" data-m="-1" type="button" title="Subir" ${ed || !i ? 'disabled' : ''}>↑</button><button class="btn small mn-mov" data-m="1" type="button" title="Descer" ${ed || i === n - 1 ? 'disabled' : ''}>↓</button>`;
  function menusRender() {
    const ed = CTX.dona ? '' : 'disabled';
    let h = '<thead><tr><th>Ordem</th><th>Programada</th><th>Pede subgrupo</th><th>Ativa</th><th></th></tr></thead><tbody>';
    MN.prog.forEach((p, i) => {
      h += `<tr data-k="${esc(p.programada)}"${p.ativo === false ? ' style="opacity:.55"' : ''}><td>${setas(i, MN.prog.length, ed)}</td>
        <td><input class="mn-nome" value="${esc(p.programada)}" ${ed} style="width:240px"></td>
        <td style="text-align:center">${ck('mn-exige', p.exige_grupo, ed)}</td><td style="text-align:center">${ck('mn-ativo', p.ativo !== false, ed)}</td><td>${CTX.dona ? '<button class="btn small mn-del" type="button" title="Excluir do menu">Excluir</button>' : ''}</td></tr>`;
    });
    $('mnProg').innerHTML = h + '</tbody>';
    h = `<thead><tr><th>Ordem</th><th>Subgrupo do OEE</th><th>Grupo do OEE</th><th>6 Grandes Perdas</th>${CAMPOS.map(c => `<th>${c[1]}</th>`).join('')}<th>Ativo</th><th></th></tr></thead><tbody>`;
    MN.sub.forEach((s, i) => {
      const op = (lista, v) => `<option value=""></option>` + lista.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('') + (v && !lista.includes(v) ? `<option selected>${esc(v)}</option>` : '');
      h += `<tr data-k="${esc(s.subgrupo)}"${s.ativo === false ? ' style="opacity:.55"' : ''}><td>${setas(i, MN.sub.length, ed)}</td>
        <td><input class="mn-nome" value="${esc(s.subgrupo)}" ${ed} style="width:240px"></td>
        <td><select class="mn-grupo" ${ed}>${op(GRUPOS, s.grupo)}</select></td><td><select class="mn-seis" ${ed}>${op(SEIS, s.seis_perdas)}</select></td>
        ${CAMPOS.map(c => `<td style="text-align:center">${ck('mn-campo', s[c[0]], ed, `data-c="${c[0]}"`)}</td>`).join('')}
        <td style="text-align:center">${ck('mn-ativo', s.ativo !== false, ed)}</td><td>${CTX.dona ? '<button class="btn small mn-del" type="button" title="Excluir do menu">Excluir</button>' : ''}</td></tr>`;
    });
    $('mnSub').innerHTML = h + '</tbody>';
    $('mnProgAdd').disabled = $('mnSubAdd').disabled = !CTX.dona;
  }
  async function mnFeito(msg) { CTX.aviso(msg || 'Salvo'); await menusCarregar(); if (CTX.aposMenus) CTX.aposMenus(); }
  async function contarClassif(campo, valor) {
    const { count } = await sb.from('classificacao').select('nreg', { count: 'exact', head: true }).eq(campo, valor);
    return count || 0;
  }
  async function mnMover(lista, tabela, chave, k, d) {
    const ord = lista.slice(), i = ord.findIndex(x => x[chave] === k), j = i + d;
    if (i < 0 || j < 0 || j >= ord.length) return;
    [ord[i], ord[j]] = [ord[j], ord[i]];
    const mud = ord.map((x, n) => ({ x, n: n + 1 })).filter(o => o.x.ordem !== o.n);
    for (const o of mud) {
      const { error } = await sb.from(tabela).update({ ordem: o.n }).eq(chave, o.x[chave]);
      if (error) { CTX.erro('Erro ao mudar a ordem: ' + error.message); return; }
    }
    await mnFeito('Ordem salva');
  }
  async function mnRenomear(tabela, chave, velho, inp) {
    const novo = String(inp.value).replace(/\s+/g, ' ').trim();
    if (!novo || novo === velho) { inp.value = velho; return; }
    const lista = tabela === 'programadas' ? MN.prog : MN.sub;
    if (lista.some(x => x[chave] === novo)) { CTX.erro(`Já existe "${novo}".`); inp.value = velho; return; }
    const campo = tabela === 'programadas' ? 'programada' : 'subgrupo';
    const n = await contarClassif(campo, velho);
    if (!confirm(`Renomear "${velho}" para "${novo}"?` + (n ? ` As ${nf(n)} paradas já classificadas com ele também serão renomeadas.` : ''))) { inp.value = velho; return; }
    let r = await sb.from(tabela).update({ [chave]: novo }).eq(chave, velho);
    if (r.error) { CTX.erro('Erro ao renomear: ' + r.error.message); inp.value = velho; return; }
    if (n) { r = await sb.from('classificacao').update({ [campo]: novo }).eq(campo, velho); if (r.error) { CTX.erro('Renomeado, mas houve erro nas paradas: ' + r.error.message); } }
    // a programada sem subgrupo tem um subgrupo com o mesmo nome: renomeia junto
    if (tabela === 'programadas' && MN.sub.some(x => x.subgrupo === velho) && !MN.sub.some(x => x.subgrupo === novo)) {
      r = await sb.from('subgrupos').update({ subgrupo: novo }).eq('subgrupo', velho);
      if (!r.error) r = await sb.from('classificacao').update({ subgrupo: novo }).eq('subgrupo', velho);
      if (r.error) CTX.erro('Renomeado, mas houve erro no subgrupo de mesmo nome: ' + r.error.message);
    }
    await mnFeito('Renomeado');
  }
  function menusIniciar() {
    $('sec-menus').innerHTML = menusHTML();
    // excluir do menu: as paradas já classificadas continuam com o nome antigo (só some da lista)
    const mnExcluir = async (tabela, chave, k) => {
      const n = await contarClassif(chave, k);
      const aviso = n ? `\n\n${nf(n)} parada(s) já classificada(s) com "${k}" continuam com esse nome; ele só deixa de aparecer no menu.\nSe quiser só esconder, desmarque "Ativo" em vez de excluir.` : '';
      if (!confirm(`Excluir "${k}" do menu de ${tabela === 'programadas' ? 'Programadas' : 'Subgrupos'}?${aviso}`)) return;
      const { error } = await sb.from(tabela).delete().eq(chave, k);
      if (error) { CTX.erro('Erro ao excluir: ' + error.message); return; }
      await mnFeito('Excluído');
    };
    $('mnProg').addEventListener('click', e => { const d = e.target.closest('.mn-del'); if (d && CTX.dona) mnExcluir('programadas', 'programada', d.closest('tr').dataset.k); });
    $('mnSub').addEventListener('click', e => { const d = e.target.closest('.mn-del'); if (d && CTX.dona) mnExcluir('subgrupos', 'subgrupo', d.closest('tr').dataset.k); });
    $('mnProg').addEventListener('click', e => {
      const b = e.target.closest('.mn-mov'); if (!b || !CTX.dona) return;
      mnMover(MN.prog, 'programadas', 'programada', b.closest('tr').dataset.k, Number(b.dataset.m));
    });
    $('mnSub').addEventListener('click', e => {
      const b = e.target.closest('.mn-mov'); if (!b || !CTX.dona) return;
      mnMover(MN.sub, 'subgrupos', 'subgrupo', b.closest('tr').dataset.k, Number(b.dataset.m));
    });
    $('mnProg').addEventListener('change', async e => {
      if (!CTX.dona) return;
      const k = e.target.closest('tr').dataset.k, t = e.target;
      if (t.classList.contains('mn-nome')) return mnRenomear('programadas', 'programada', k, t);
      const campo = t.classList.contains('mn-exige') ? 'exige_grupo' : 'ativo';
      const { error } = await sb.from('programadas').update({ [campo]: t.checked }).eq('programada', k);
      if (error) { CTX.erro('Erro ao salvar: ' + error.message); t.checked = !t.checked; return; }
      await mnFeito();
    });
    $('mnSub').addEventListener('change', async e => {
      if (!CTX.dona) return;
      const k = e.target.closest('tr').dataset.k, t = e.target, s = MN.sub.find(x => x.subgrupo === k); if (!s) return;
      if (t.classList.contains('mn-nome')) return mnRenomear('subgrupos', 'subgrupo', k, t);
      if (t.classList.contains('mn-campo') || t.classList.contains('mn-ativo')) {
        const campo = t.dataset.c || 'ativo';
        const { error } = await sb.from('subgrupos').update({ [campo]: t.checked }).eq('subgrupo', k);
        if (error) { CTX.erro('Erro ao salvar: ' + error.message); t.checked = !t.checked; return; }
        return mnFeito();
      }
      const campo = t.classList.contains('mn-grupo') ? 'grupo' : 'seis_perdas', v = t.value || null;
      const { error } = await sb.from('subgrupos').update({ [campo]: v }).eq('subgrupo', k);
      if (error) { CTX.erro('Erro ao salvar: ' + error.message); return; }
      const n = await contarClassif('subgrupo', k);
      if (n && confirm(`Atualizar também o ${campo === 'grupo' ? 'grupo do OEE' : '6 Grandes Perdas'} das ${nf(n)} paradas já classificadas com "${k}"?\n\nOK = atualizar as antigas também · Cancelar = só as próximas`)) {
        const r = await sb.from('classificacao').update({ [campo]: v || '-' }).eq('subgrupo', k);
        if (r.error) CTX.erro('Erro ao atualizar as paradas: ' + r.error.message);
      }
      await mnFeito();
    });
    $('mnProgAdd').addEventListener('click', async () => {
      const nome = $('mnProgNome').value.replace(/\s+/g, ' ').trim(), exige = $('mnProgExige').checked;
      if (!nome) { CTX.erro('Digite o nome da programada.'); return; }
      if (MN.prog.some(p => norm(p.programada) === norm(nome))) { CTX.erro(`Já existe a programada "${nome}".`); return; }
      const ordem = MN.prog.reduce((a, p) => Math.max(a, p.ordem || 0), 0) + 1;
      let r = await sb.from('programadas').insert({ programada: nome, exige_grupo: exige, ativo: true, ordem });
      if (r.error) { CTX.erro('Erro ao adicionar: ' + r.error.message); return; }
      // programada sem subgrupo usa um subgrupo com o mesmo nome (sem grupo do OEE), como as outras
      if (!exige && !MN.sub.some(s => s.subgrupo === nome)) {
        const os = MN.sub.reduce((a, s) => Math.max(a, s.ordem || 0), 0) + 1;
        r = await sb.from('subgrupos').insert({ subgrupo: nome, grupo: null, seis_perdas: null, ativo: true, ordem: os });
        if (r.error) CTX.erro('Programada criada, mas houve erro ao criar o subgrupo: ' + r.error.message);
      }
      $('mnProgNome').value = ''; $('mnProgExige').checked = false;
      await mnFeito('Programada adicionada');
    });
    $('mnSubAdd').addEventListener('click', async () => {
      const nome = $('mnSubNome').value.replace(/\s+/g, ' ').trim();
      if (!nome) { CTX.erro('Digite o nome do subgrupo.'); return; }
      if (MN.sub.some(s => norm(s.subgrupo) === norm(nome))) { CTX.erro(`Já existe o subgrupo "${nome}".`); return; }
      const ordem = MN.sub.reduce((a, s) => Math.max(a, s.ordem || 0), 0) + 1;
      const r = await sb.from('subgrupos').insert({ subgrupo: nome, grupo: $('mnSubGrupo').value || null, seis_perdas: $('mnSubSeis').value || null, ativo: true, ordem });
      if (r.error) { CTX.erro('Erro ao adicionar: ' + r.error.message); return; }
      $('mnSubNome').value = ''; $('mnSubGrupo').value = ''; $('mnSubSeis').value = '';
      await mnFeito('Subgrupo adicionado');
    });
    menusCarregar();
    catIniciar();
  }

  /* ---- Menus de Conjunto › Item › Problema › Solução ---- */
  const NIV = [['conjunto', 'Conjunto'], ['item', 'Item'], ['problema', 'Problema'], ['solucao', 'Solução']];
  const CT = { linhas: [], sel: ['', '', ''] };   // sel = conjunto, item e problema escolhidos nas colunas
  function catHTML() {
    return `<div class="card"><h2 style="font-size:16px">Conjunto › Item › Problema › Solução</h2>
      <p class="muted" style="margin:4px 0 8px;max-width:100ch">Monte os menus dependentes: escolha um conjunto para ver e cadastrar os itens dele; escolha um item para os problemas, e um problema para as soluções.
      Na aba Apontamentos, esses campos sugerem as opções do menu, mas continuam aceitando qualquer texto. Ali também dá para adicionar ao menu o que você digitou.</p>
      <div class="barra" style="margin:0 0 8px"><button class="btn small" type="button" id="ctImportar" title="Cadastra no menu as combinações que já aparecem nas OS e nos apontamentos (só as que ainda não existem)">Importar das OS e dos apontamentos</button><span class="muted" id="ctMsg"></span></div>
      <div id="ctCols" style="display:grid;grid-template-columns:repeat(4,minmax(200px,1fr));gap:10px;overflow:auto"></div></div>`;
  }
  const paiDe = n => CT.sel.slice(0, n).join('\t');
  function catRender() {
    const ed = CTX.dona ? '' : 'disabled';
    $('ctCols').innerHTML = NIV.map(([k, rot], n) => {
      const pronto = CT.sel.slice(0, n).every(Boolean);
      const xs = pronto ? CT.linhas.filter(c => c.nivel === k && c.pai === paiDe(n)).sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9) || a.nome.localeCompare(b.nome, 'pt')) : [];
      const corpo = !pronto ? `<p class="muted" style="font-size:12px">Escolha ${n === 1 ? 'um conjunto' : n === 2 ? 'um item' : 'um problema'} na coluna ao lado.</p>`
        : (xs.length ? xs.map((c, i) => `<div class="ct-l${n < 3 && CT.sel[n] === c.nome ? ' on' : ''}" data-id="${c.id}" style="display:flex;gap:3px;align-items:center;padding:2px;border-radius:4px;${n < 3 && CT.sel[n] === c.nome ? 'background:var(--info-bg)' : ''}${c.ativo === false ? ';opacity:.5' : ''}">
            <b class="muted" style="font:600 11px var(--mono);min-width:18px;text-align:right">${i + 1}</b>
            <input class="ct-nome" value="${esc(c.nome)}" ${ed} style="flex:1;min-width:0">
            ${n < 3 ? `<button class="btn small ct-abrir" type="button" title="Ver os de baixo">›</button>` : ''}
            <button class="btn small ct-mov" data-m="-1" type="button" ${ed || !i ? 'disabled' : ''}>↑</button><button class="btn small ct-mov" data-m="1" type="button" ${ed || i === xs.length - 1 ? 'disabled' : ''}>↓</button>
            <input type="checkbox" class="ct-ativo" title="Ativo" ${c.ativo !== false ? 'checked' : ''} ${ed}>
            ${CTX.dona ? '<button class="btn small ct-del" type="button" title="Excluir do menu (e o que estiver abaixo dele)">✕</button>' : ''}</div>`).join('') : '<p class="muted" style="font-size:12px">Nada cadastrado ainda.</p>')
          + (CTX.dona ? `<div style="display:flex;gap:4px;margin-top:6px"><input class="ct-novo" data-n="${n}" placeholder="novo ${rot.toLowerCase()}" style="flex:1;min-width:0"><button class="btn small primary ct-add" data-n="${n}" type="button">+</button></div>` : '');
      return `<div><div style="font-weight:700;margin-bottom:4px">${rot}${n ? ` <span class="muted" style="font-weight:400;font-size:12px">${pronto ? 'de ' + esc(CT.sel[n - 1]) : ''}</span>` : ''}</div>${corpo}</div>`;
    }).join('');
  }
  async function catCarregar() {
    const { data, error } = await sb.from('catalogo').select('*').limit(5000);
    if (error) { CTX.erro('Erro ao carregar os menus de conjunto/item: ' + error.message); return; }
    CT.linhas = data; catRender();
  }
  async function catFeito(msg) { CTX.aviso(msg || 'Salvo'); await catCarregar(); if (CTX.aposMenus) CTX.aposMenus(); }
  async function catAdicionar(n, nome) {
    nome = String(nome || '').replace(/\s+/g, ' ').trim(); if (!nome) return;
    const k = NIV[n][0], pai = paiDe(n);
    if (CT.linhas.some(c => c.nivel === k && c.pai === pai && norm(c.nome) === norm(nome))) { CTX.erro(`“${nome}” já está neste menu.`); return; }
    const ordem = CT.linhas.filter(c => c.nivel === k && c.pai === pai).reduce((a, c) => Math.max(a, c.ordem || 0), 0) + 1;
    const { error } = await sb.from('catalogo').insert({ nivel: k, pai, nome, ordem });
    if (error) { CTX.erro('Erro ao adicionar: ' + error.message); return; }
    await catFeito('Adicionado');
  }
  function catIniciar() {
    const caixa = document.createElement('div'); caixa.innerHTML = catHTML();
    $('sec-menus').appendChild(caixa);
    const linha = el => { const d = el.closest('.ct-l'); return d ? CT.linhas.find(c => String(c.id) === d.dataset.id) : null; };
    const nivelN = c => NIV.findIndex(x => x[0] === c.nivel);
    $('ctCols').addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('ct-add')) { const n = +b.dataset.n; const inp = $('ctCols').querySelector(`.ct-novo[data-n="${n}"]`); return catAdicionar(n, inp.value); }
      const c = linha(b); if (!c) return;
      const n = nivelN(c);
      if (b.classList.contains('ct-abrir')) { CT.sel[n] = c.nome; for (let j = n + 1; j < 3; j++) CT.sel[j] = ''; catRender(); return; }
      if (b.classList.contains('ct-del') && CTX.dona) {
        const caminho = (c.pai ? c.pai + '\t' : '') + c.nome;
        const abaixo = CT.linhas.filter(x => x.pai === caminho || x.pai.startsWith(caminho + '\t'));
        if (!confirm(`Excluir "${c.nome}" do menu${abaixo.length ? ` e os ${nf(abaixo.length)} itens abaixo dele (${NIV.slice(n + 1).map(x => x[1].toLowerCase()).join(', ')})` : ''}?\n\nO que já foi escrito nos apontamentos continua como está; só deixa de aparecer como opção. Se quiser só esconder, desmarque a caixinha "Ativo".`)) return;
        const ids = [c.id, ...abaixo.map(x => x.id)];
        for (let i = 0; i < ids.length; i += 200) { const r = await sb.from('catalogo').delete().in('id', ids.slice(i, i + 200)); if (r.error) { CTX.erro('Erro ao excluir: ' + r.error.message); return; } }
        if (CT.sel[n] === c.nome) for (let j = n; j < 3; j++) CT.sel[j] = '';
        return catFeito('Excluído');
      }
      if (b.classList.contains('ct-mov') && CTX.dona) {
        const xs = CT.linhas.filter(x => x.nivel === c.nivel && x.pai === c.pai).sort((a, b2) => (a.ordem ?? 1e9) - (b2.ordem ?? 1e9) || a.nome.localeCompare(b2.nome, 'pt'));
        const i = xs.indexOf(c), j = i + Number(b.dataset.m); if (j < 0 || j >= xs.length) return;
        [xs[i], xs[j]] = [xs[j], xs[i]];
        for (const [p, x] of xs.entries()) if (x.ordem !== p + 1) { const r = await sb.from('catalogo').update({ ordem: p + 1 }).eq('id', x.id); if (r.error) { CTX.erro('Erro: ' + r.error.message); return; } }
        return catFeito('Ordem salva');
      }
    });
    $('ctCols').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('ct-novo')) { e.preventDefault(); catAdicionar(+e.target.dataset.n, e.target.value); } });
    $('ctCols').addEventListener('change', async e => {
      if (!CTX.dona) return;
      const t = e.target, c = linha(t); if (!c) return;
      if (t.classList.contains('ct-ativo')) { const r = await sb.from('catalogo').update({ ativo: t.checked }).eq('id', c.id); if (r.error) { CTX.erro('Erro: ' + r.error.message); return; } return catFeito(); }
      if (t.classList.contains('ct-nome')) {
        const novo = t.value.replace(/\s+/g, ' ').trim(), n = nivelN(c);
        if (!novo || novo === c.nome) { t.value = c.nome; return; }
        if (CT.linhas.some(x => x !== c && x.nivel === c.nivel && x.pai === c.pai && norm(x.nome) === norm(novo))) { CTX.erro(`“${novo}” já está neste menu.`); t.value = c.nome; return; }
        let r = await sb.from('catalogo').update({ nome: novo }).eq('id', c.id);
        if (r.error) { CTX.erro('Erro ao renomear: ' + r.error.message); t.value = c.nome; return; }
        // os itens abaixo guardam o caminho (conjunto › item › problema): acompanha o novo nome
        const velho = (c.pai ? c.pai + '\t' : '') + c.nome, nov = (c.pai ? c.pai + '\t' : '') + novo;
        for (const x of CT.linhas.filter(x => x.pai === velho || x.pai.startsWith(velho + '\t'))) {
          r = await sb.from('catalogo').update({ pai: nov + x.pai.slice(velho.length) }).eq('id', x.id);
          if (r.error) { CTX.erro('Erro ao atualizar os de baixo: ' + r.error.message); break; }
        }
        if (CT.sel[n] === c.nome) CT.sel[n] = novo;
        // o que já foi apontado com o nome antigo passa a contar como o novo nas análises
        try { await padDefinir(c.nivel, [c.nome], novo, true); } catch (e2) { CTX.erro('Renomeado no menu, mas não consegui padronizar os apontamentos antigos: ' + e2.message); }
        return catFeito('Renomeado');
      }
    });
    $('ctImportar').addEventListener('click', async () => {
      if (!CTX.dona) return;
      const b = $('ctImportar'); b.disabled = true; $('ctMsg').textContent = 'Lendo…';
      try {
        const [os, col, aj] = await Promise.all([
          MG.buscarTudo('os', 'id,conjunto,item,problema,solucao', null, 'id'),
          MG.buscarTudo('coletor', 'nreg,conjunto,item,problema,solucao', q => q.not('conjunto', 'is', null)),
          MG.buscarTudo('ajustes', '*')]);
        const ajN = {}; aj.forEach(a => ajN[a.nreg] = a);
        const caminhos = os.concat(col.map(l => { const a = ajN[l.nreg] || {}; const o = {}; ['conjunto', 'item', 'problema', 'solucao'].forEach(k => o[k] = a[k] != null ? a[k] : l[k]); return o; }))
          .concat(aj.filter(a => a.conjunto && !col.some(l => l.nreg === a.nreg)));
        const limpa = v => { const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return /^[-.?\s]*$/.test(t) ? '' : t; };
        const novos = new Map();
        const tem = (k, pai, nome) => CT.linhas.some(c => c.nivel === k && c.pai === pai && norm(c.nome) === norm(nome));
        for (const o of caminhos) {
          const v = NIV.map(([k]) => limpa(o[k]));
          for (let n = 0; n < 4 && v[n]; n++) {
            const pai = v.slice(0, n).join('\t'), chave = n + '|' + pai + '|' + norm(v[n]);
            if (!tem(NIV[n][0], pai, v[n]) && !novos.has(chave)) novos.set(chave, { nivel: NIV[n][0], pai, nome: v[n] });
          }
        }
        if (!novos.size) { $('ctMsg').textContent = 'Nada novo para importar.'; return; }
        if (!confirm(`Cadastrar ${novos.size} opções novas nos menus (a partir das OS e dos apontamentos)? Depois você pode renomear ou desativar o que não quiser.`)) { $('ctMsg').textContent = ''; return; }
        const { error } = await sb.from('catalogo').upsert([...novos.values()], { onConflict: 'nivel,pai,nome', ignoreDuplicates: true });
        if (error) { CTX.erro('Erro ao importar: ' + error.message); $('ctMsg').textContent = ''; return; }
        $('ctMsg').textContent = `${novos.size} opções importadas.`;
        await catFeito('Importado');
      } catch (e) { CTX.erro('Erro ao importar: ' + e.message); $('ctMsg').textContent = ''; }
      finally { b.disabled = false; }
    });
    catCarregar();
    padIniciar();
  }

  /* ---- Padronizar os nomes já escritos nos apontamentos ("motor caixa" = "motor da caixa") ---- */
  const PD = { nivel: 'conjunto', mapa: {}, usados: null, sel: new Set(), busca: '' };
  const PARADA = new Set(['de', 'da', 'do', 'das', 'dos', 'que', 'faz', 'a', 'o', 'e', 'as', 'os', 'para', 'com', 'na', 'no', 'em', 'um', 'uma']);
  const parecido = v => MGPlanilha.chavePadrao(v).split(' ').filter(w => w && !PARADA.has(w)).map(w => w.length > 5 && /es$/.test(w) ? w.slice(0, -2) : w.length > 3 ? w.replace(/s$/, '') : w).sort().join(' ');
  function padHTML() {
    return `<div class="card" id="pdCard"><h2 style="font-size:16px">Padronizar nomes escritos nos apontamentos</h2>
      <p class="muted" style="margin:4px 0 8px;max-width:100ch">Cada um escreve de um jeito (“motor caixa”, “motor da caixa”, “motor que faz a caixa”). Marque as variações e diga como devem ficar:
      nas análises (Painel e Pareto de paradas), todas passam a contar como o mesmo nome. O que o operador escreveu continua guardado como estava. Nomes parecidos aparecem juntos, marcados com uma barra azul.</p>
      <div class="barra" style="margin:0 0 8px;gap:6px;flex-wrap:wrap">
        ${NIV.map(([k, r]) => `<button class="btn small${k === PD.nivel ? ' primary' : ''}" type="button" data-pdn="${k}">${r}</button>`).join('')}
        <input id="pdBusca" placeholder="buscar…" style="min-width:160px">
        <label class="muted" style="font-size:12.5px"><input type="checkbox" id="pdSoParecidos"> só os que têm parecidos</label>
        <span class="muted" id="pdMsg"></span></div>
      <div class="scroll" style="max-height:420px"><table id="pdTabela"></table></div>
      ${CTX.dona ? `<div class="barra" style="margin-top:8px;gap:6px;flex-wrap:wrap;align-items:center"><b id="pdQtd">0 marcados</b>
        <span>→ padronizar como</span><input id="pdPara" placeholder="nome padrão (escolha ou digite)" style="min-width:260px">
        <button class="btn small primary" type="button" id="pdAplicar">Padronizar</button>
        <button class="btn small" type="button" id="pdLimparSel">Desmarcar</button></div>` : ''}</div>`;
  }
  async function padCarregarUsados() {
    $('pdMsg').textContent = 'Lendo os apontamentos…';
    const [col, aj, dv, os] = await Promise.all([
      MG.buscarTudo('coletor', 'nreg,conjunto,item,problema,solucao', q => q.or('conjunto.not.is.null,item.not.is.null,problema.not.is.null,solucao.not.is.null')),
      MG.buscarTudo('ajustes', '*').catch(() => []),
      MG.buscarTudo('divisoes', '*', null, ['nreg', 'parte']).catch(() => []),
      MG.buscarTudo('os', 'id,conjunto,item,problema,solucao', null, 'id').catch(() => [])]);
    const ajN = {}; aj.forEach(a => ajN[a.nreg] = a);
    const limpa = v => { const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return /^[-.?\s]*$/.test(t) ? '' : t; };
    const U = {}; NIV.forEach(([k]) => U[k] = new Map());
    const conta = (k, v) => { v = limpa(v); if (!v) return; const m = U[k], c = m.get(v); m.set(v, (c || 0) + 1); };
    col.forEach(l => { const a = ajN[l.nreg] || {}; NIV.forEach(([k]) => conta(k, a[k] != null ? a[k] : l[k])); });
    aj.forEach(a => { if (!col.some(l => l.nreg === a.nreg)) NIV.forEach(([k]) => conta(k, a[k])); });
    dv.concat(os).forEach(x => NIV.forEach(([k]) => conta(k, x[k])));
    CT.linhas.forEach(c => { if (!U[c.nivel].has(c.nome)) U[c.nivel].set(c.nome, 0); });
    PD.usados = U; $('pdMsg').textContent = '';
  }
  function padRender() {
    if (!PD.usados) return;
    const m = PD.mapa[PD.nivel] || {};
    const q = MGPlanilha.chavePadrao(PD.busca);
    let xs = [...PD.usados[PD.nivel].entries()].map(([v, n]) => ({ v, n, par: parecido(v), para: m[MGPlanilha.chavePadrao(v)] || null }));
    // grupos de parecidos: mesma chave "sem preposições", ou já padronizados para o mesmo nome
    const grupo = x => x.para ? 'P:' + MGPlanilha.chavePadrao(x.para) : 'S:' + x.par;
    const tam = {}; xs.forEach(x => { tam[grupo(x)] = (tam[grupo(x)] || 0) + 1; tam['S:' + x.par] = (tam['S:' + x.par] || 0) + (x.para ? 1 : 0); });
    if (q) xs = xs.filter(x => MGPlanilha.chavePadrao(x.v).includes(q) || (x.para && MGPlanilha.chavePadrao(x.para).includes(q)));
    if ($('pdSoParecidos') && $('pdSoParecidos').checked) xs = xs.filter(x => tam[grupo(x)] > 1);
    xs.sort((a, b) => grupo(a).localeCompare(grupo(b), 'pt') || b.n - a.n);
    const ed = CTX.dona ? '' : 'disabled';
    $('pdTabela').innerHTML = `<thead><tr><th></th><th>Escrito como</th><th>Vezes</th><th>Conta nas análises como</th><th></th></tr></thead><tbody>` +
      (xs.length ? xs.map(x => `<tr data-v="${esc(x.v)}" style="${tam[grupo(x)] > 1 ? 'box-shadow:inset 3px 0 var(--info)' : ''}">
        <td><input type="checkbox" class="pd-sel" ${PD.sel.has(x.v) ? 'checked' : ''} ${ed}></td><td>${esc(x.v)}</td><td class="num">${nf(x.n)}</td>
        <td>${x.para ? `<b style="color:var(--info)">${esc(x.para)}</b>` : '<span class="muted">(fica como está)</span>'}</td>
        <td>${x.para && CTX.dona ? '<button class="btn small pd-desf" type="button" title="Voltar a contar como está escrito">desfazer</button>' : ''}</td></tr>`).join('')
        : '<tr><td colspan="5" class="muted" style="padding:12px">Nada aqui.</td></tr>') + '</tbody>';
    if ($('pdQtd')) $('pdQtd').textContent = nf(PD.sel.size) + ' marcado' + (PD.sel.size === 1 ? '' : 's');
  }
  // mapa[nivel][chave(variação)] = padrão. Inclui o próprio padrão, para ele não ser trocado por outro depois.
  async function padDefinir(nivel, variacoes, para, silencioso) {
    para = String(para || '').replace(/\s+/g, ' ').trim(); if (!para) throw new Error('Escreva o nome padrão.');
    const mapa = await MGPlanilha.lerPadronizacao();
    const m = mapa[nivel] = mapa[nivel] || {};
    const kp = MGPlanilha.chavePadrao(para);
    // quem já apontava para alguma das variações passa a apontar para o novo padrão
    const ks = new Set(variacoes.map(MGPlanilha.chavePadrao));
    Object.keys(m).forEach(k => { if (ks.has(MGPlanilha.chavePadrao(m[k]))) m[k] = para; });
    ks.forEach(k => { m[k] = para; });
    if (m[kp] === para || !m[kp]) delete m[kp];
    await MGPlanilha.salvarPadronizacao(mapa);
    PD.mapa = mapa;
    if (!silencioso) CTX.aviso('Padronizado');
  }
  async function padIniciar() {
    const caixa = document.createElement('div'); caixa.innerHTML = padHTML();
    $('sec-menus').appendChild(caixa);
    const card = $('pdCard');
    card.addEventListener('click', async e => {
      const b = e.target.closest('button');
      if (b && b.dataset.pdn) { PD.nivel = b.dataset.pdn; PD.sel.clear(); card.querySelectorAll('[data-pdn]').forEach(x => x.classList.toggle('primary', x === b)); padRender(); return; }
      if (b && b.id === 'pdLimparSel') { PD.sel.clear(); padRender(); return; }
      if (b && b.id === 'pdAplicar') {
        if (!PD.sel.size) { CTX.erro('Marque pelo menos um nome.'); return; }
        try { await padDefinir(PD.nivel, [...PD.sel], $('pdPara').value); PD.sel.clear(); $('pdPara').value = ''; padRender(); } catch (er) { CTX.erro('Erro ao padronizar: ' + er.message); }
        return;
      }
      if (b && b.classList.contains('pd-desf')) {
        const v = b.closest('tr').dataset.v;
        try {
          const mapa = await MGPlanilha.lerPadronizacao(); const m = mapa[PD.nivel] || {};
          delete m[MGPlanilha.chavePadrao(v)];
          await MGPlanilha.salvarPadronizacao(mapa); PD.mapa = mapa; padRender(); CTX.aviso('Desfeito');
        } catch (er) { CTX.erro('Erro: ' + er.message); }
      }
    });
    card.addEventListener('change', e => {
      const t = e.target;
      if (t.classList.contains('pd-sel')) {
        const v = t.closest('tr').dataset.v; if (t.checked) PD.sel.add(v); else PD.sel.delete(v);
        // sugere como padrão o nome mais usado entre os marcados
        if (t.checked && $('pdPara') && !$('pdPara').value) {
          const melhor = [...PD.sel].sort((a, b2) => (PD.usados[PD.nivel].get(b2) || 0) - (PD.usados[PD.nivel].get(a) || 0))[0];
          // se já existe um nome parecido no menu, sugere o do menu
          const doMenu = CT.linhas.find(c => c.nivel === PD.nivel && c.ativo !== false && [...PD.sel].some(v => parecido(v) === parecido(c.nome)));
          $('pdPara').value = (PD.mapa[PD.nivel] || {})[MGPlanilha.chavePadrao(melhor)] || (doMenu && doMenu.nome) || melhor;
        }
        if ($('pdQtd')) $('pdQtd').textContent = nf(PD.sel.size) + ' marcado' + (PD.sel.size === 1 ? '' : 's');
      }
      if (t.id === 'pdSoParecidos') padRender();
    });
    $('pdBusca').addEventListener('input', () => { PD.busca = $('pdBusca').value; padRender(); });
    if ($('pdPara')) MGSugere.anexar(card, '#pdPara', {
      fonte: () => {
        const nomes = new Set(CT.linhas.filter(c => c.nivel === PD.nivel && c.ativo !== false).map(c => c.nome));
        Object.values(PD.mapa[PD.nivel] || {}).forEach(v => nomes.add(v));
        return { itens: [...nomes].sort((a, b) => a.localeCompare(b, 'pt')), podeAdicionar: false };
      },
      titulo: () => 'Nome padrão (do menu ou já usado como padrão)'
    });
    try { PD.mapa = await MGPlanilha.lerPadronizacao(); await padCarregarUsados(); padRender(); }
    catch (e) { $('pdMsg').textContent = 'Erro ao carregar: ' + e.message; }
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
      if (qual === 'montagem') montagemCarregar(); else if (qual === 'limpeza') limpezaCarregar(); else if (qual === 'os') osCarregar(); else if (qual === 'takt') taktCarregar(); else if (qual === 'menus') { menusCarregar(); catCarregar(); }
      return;
    }
    iniciadas[qual] = true;
    if (qual === 'montagem') montagemIniciar();
    if (qual === 'limpeza') limpezaIniciar();
    if (qual === 'os') osIniciar();
    if (qual === 'takt') taktIniciar();
    if (qual === 'menus') menusIniciar();
  }
  return { abrir, lerArquivoMontagem };
})();
