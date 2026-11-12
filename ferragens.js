// Aba Ferragens: controle de quais ferragens o Val já testou na Megadoor.
// Lê os PDFs "Ferragens do dia" do Plano Mestre, guarda o que vai ser usado em cada dia
// e o histórico de testes (quem, quando, resultado). Tabelas: ferragens, ferragens_dia, ferragens_eventos.
window.MGFerragens = (function () {
  const sb = MG.sb;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
  const pad = n => String(n).padStart(2, '0');
  const isoDe = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hoje = () => isoDe(new Date());
  const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDe(d); };
  const dBR = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
  const DSEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const dhBR = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  const diaSem = iso => DSEM[new Date(iso + 'T12:00:00').getDay()];
  let CTX = null;
  const F = { cad: [], dias: [], ev: [], dia: '', busca: '', status: '', tipo: '', sel: new Set(), hDe: '', hAte: '', carregado: false };

  // ---------- estado de cada ferragem a partir do histórico ----------
  const TESTE = ['Testada OK', 'Testada com problema', 'Programa alterado'];
  function estado(cod) {
    const evs = F.ev.filter(e => e.codigo === cod).sort((a, b) => (a.data + (a.criado_em || '')).localeCompare(b.data + (b.criado_em || '')));
    const ult = [...evs].reverse().find(e => TESTE.includes(e.tipo));
    const ok = [...evs].reverse().find(e => e.tipo === 'Testada OK');
    const enviada = [...evs].reverse().find(e => e.tipo === 'Enviada ao Val');
    const c = F.cad.find(x => x.codigo === cod) || {};
    let st = 'nunca', rot = 'Nunca testada';
    if (c.cadastrada === false) { st = 'naocad'; rot = 'Não cadastrada no Plano Mestre'; }
    else if (ult && ult.tipo === 'Testada OK') { st = 'ok'; rot = 'Testada'; }
    else if (ult && ult.tipo === 'Testada com problema') { st = 'problema'; rot = 'Testada com problema'; }
    else if (ult && ult.tipo === 'Programa alterado') { st = 'retestar'; rot = 'Testar de novo (programa alterado)'; }
    return { st, rot, ult, ok, enviada, evs };
  }
  const ST_ORD = { naocad: 0, problema: 1, retestar: 2, nunca: 3, ok: 4 };
  const ST_CLS = { ok: 'apontado', problema: 'pendente', retestar: 'turno_anterior', nunca: 'pendente', naocad: 'na' };
  const pill = e => `<span class="pill ${ST_CLS[e.st]}" title="${esc(e.ult ? e.ult.tipo + ' em ' + dBR(e.ult.data) + (e.ult.por ? ' por ' + e.ult.por : '') : '')}">${esc(e.rot)}</span>`;
  function usos(cod) { return F.dias.filter(d => d.codigo === cod).map(d => d.data).sort(); }
  // "rara": usada em até 2 dias diferentes nos últimos 90 dias (sem contar o dia analisado)
  function rara(cod, dia) { const lim = somaDias(dia || hoje(), -90); return usos(cod).filter(d => d >= lim && d !== dia).length <= 2; }

  // ---------- leitura do PDF "Ferragens do dia" ----------
  let pdfjsP = null;
  function pdfjs() {
    if (!pdfjsP) pdfjsP = new Promise((ok, falha) => {
      if (window.pdfjsLib) return ok(window.pdfjsLib);
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = () => falha(new Error('não consegui carregar o leitor de PDF'));
      document.head.appendChild(s);
    });
    return pdfjsP;
  }
  async function linhasPDF(buf) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: buf }).promise;
    const linhas = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p), tc = await pg.getTextContent();
      const its = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
      its.sort((a, b) => b.y - a.y || a.x - b.x);
      const ls = [];
      for (const it of its) {
        const l = ls.find(l => Math.abs(l.y - it.y) < 3);
        if (l) l.its.push(it); else ls.push({ y: it.y, its: [it] });
      }
      ls.sort((a, b) => b.y - a.y);
      for (const l of ls) {
        l.its.sort((a, b) => a.x - b.x);
        const cel = [];
        for (const it of l.its) {          // junta pedaços muito próximos numa célula só
          const u = cel[cel.length - 1];
          if (u && it.x - (u.x + u.w) < 4) { u.s += (it.x - (u.x + u.w) > 1 ? ' ' : '') + it.s; u.w = it.x + it.w - u.x; }
          else cel.push({ s: it.s, x: it.x, w: it.w });
        }
        cel.forEach(c => { c.s = c.s.replace(/\s+/g, ' ').trim(); });
        linhas.push({ p, cel: cel.filter(c => c.s), tx: cel.map(c => c.s).join(' ').replace(/\s+/g, ' ').trim() });
      }
    }
    return linhas;
  }
  function interpretar(linhas, nome) {
    let data = null;
    for (const l of linhas) { const m = /(\d{2})\/(\d{2})\/(\d{4})\s*•\s*Plano/.exec(l.tx) || null; if (m) { data = `${m[3]}-${m[2]}-${m[1]}`; break; } }
    if (!data) for (const l of linhas) { const m = /(Segunda|Terça|Quarta|Quinta|Sexta|Sábado|Domingo),?\s+(\d{2})\/(\d{2})\/(\d{4})/i.exec(l.tx); if (m) { data = `${m[4]}-${m[3]}-${m[2]}`; break; } }
    if (!data) throw new Error(`${nome}: não achei a data ("Ferragens do dia · Quarta, 11/11/2026"). Use o PDF "Ferragens do dia" do Plano Mestre.`);
    let gerado = null;
    for (const l of linhas) {
      const m = /Gerado em\s+(\d{2})\/(\d{2})\/(\d{4})\s+(?:às\s+)?(\d{2}):(\d{2})(?::(\d{2}))?/i.exec(l.tx) || /^(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2})/.exec(l.tx);
      if (m) { gerado = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] || '00'}-03:00`).toISOString(); if (/Gerado/i.test(l.tx)) break; }
    }
    const itens = []; let lote = '', cliente = '', tipo = '', col = null, resumo = false;
    for (const l of linhas) {
      const t = l.tx;
      if (/^Ferragens do dia|Gerado em|^https?:|Impress[aã]o$/i.test(t)) continue;
      if (/^RESUMO DO DIA/i.test(t)) { resumo = true; continue; }       // resumo repete os lotes: não soma de novo
      const mL = /^LT\s+([\d.]+)\s*•.*?Perfil:\s*([\d.,]+)/i.exec(t);
      if (mL) { lote = `LT ${mL[1]} (perfil ${mL[2]})${cliente ? ' · ' + cliente : ''}`; continue; }
      if (/^\d{2}\s*-\s*.+\(\d+\)$/.test(t)) { cliente = t.replace(/\s*\(\d+\)$/, ''); resumo = false; tipo = ''; continue; }
      if (resumo || /^Total$/i.test((l.cel[0] || {}).s || '')) continue;
      if (/^FECHADURAS$/i.test(t)) { tipo = 'Fechadura'; col = null; continue; }
      if (/^DOBRADI[ÇC]AS$/i.test(t)) { tipo = 'Dobradiça'; col = null; continue; }
      if (/^PUXADORES$|^ROLDANAS$|^OUTROS$/i.test(t)) { tipo = t.charAt(0) + t.slice(1).toLowerCase(); col = null; continue; }
      if (/^C[óo]digo\b/i.test(t) && /Qtd/i.test(t)) { col = {}; l.cel.forEach(c => { col[norm(c.s).replace(/\.$/, '')] = c.x; }); continue; }
      if (!tipo || !l.cel.length) continue;
      const ult = l.cel[l.cel.length - 1];
      if (!/^\d+$/.test(ult.s)) continue;
      const qtd = Number(ult.s);
      let codigo = l.cel[0].s, descricao = '', modelo = '', fabricante = '', cadastrada = true;
      const meio = l.cel.slice(1, -1);
      if (col) {
        const xs = [['descricao', col.DESCRICAO], ['modelo', col.MODELO], ['fabricante', col.FABRICANTE]].filter(c => c[1] != null);
        const r = { descricao: [], modelo: [], fabricante: [] };
        meio.forEach(c => { let k = 'descricao'; xs.forEach(([kk, x]) => { if (c.x >= x - 8) k = kk; }); r[k].push(c.s); });
        descricao = r.descricao.join(' '); modelo = r.modelo.join(' '); fabricante = r.fabricante.join(' ');
      } else { descricao = meio.map(c => c.s).join(' '); }
      const mBase = /^Lote:/i.test(codigo) ? /\(([^)]+)\)/.exec(l.tx) : null;
      if (mBase || /n[ãa]o cadastrada/i.test(l.tx)) {
        cadastrada = false;
        codigo = mBase ? mBase[1].trim() : codigo;
        descricao = 'Cód. da planilha base ' + codigo + ' (' + (/Lote:\s*([\d.]+)/i.exec(l.tx) || [, ''])[1] + ')';
        modelo = 'Ferragem não cadastrada'; fabricante = '';
      }
      if (!/^[A-Z0-9][A-Z0-9!.\-x/]*$/i.test(codigo)) continue;
      itens.push({ codigo, descricao, modelo, fabricante, tipo, qtd, lote, cadastrada });
    }
    if (!itens.length) throw new Error(`${nome}: não achei ferragens no arquivo.`);
    return { data, itens, gerado };
  }

  // lotes guardados como JSON [{lote, qtd}] (dias antigos: texto "LT … | LT …")
  function lotesDe(d) {
    if (!d || !d.lotes) return [];
    try { const v = JSON.parse(d.lotes); if (Array.isArray(v)) return v; } catch (e) { }
    const xs = String(d.lotes).split(' | ').filter(Boolean);
    return xs.map((l, i) => ({ lote: l, qtd: i === 0 ? d.qtd : null }));
  }
  // junta por código, com a quantidade de cada lote (dentro de um arquivo)
  function juntar(mapa, itens) {
    for (const it of itens) {
      if (!mapa.has(it.codigo)) mapa.set(it.codigo, { meta: it, lotes: new Map() });
      const m = mapa.get(it.codigo), k = it.lote || '(sem lote)';
      m.lotes.set(k, (m.lotes.get(k) || 0) + it.qtd);
    }
  }

  async function importar(arquivos) {
    const res = [];
    for (const f of arquivos) {
      try { const r = interpretar(await linhasPDF(await f.arrayBuffer()), f.name); r.nome = f.name; r.gerado = r.gerado || new Date(f.lastModified).toISOString(); res.push(r); }
      catch (e) { CTX.erro(e.message); return; }
    }
    if (!CTX.dona) { CTX.erro('Só a dona do sistema pode importar.'); return; }
    // o mesmo dia em mais de um arquivo: fica o gerado mais recentemente no Plano Mestre
    const porDia = new Map(), avisos = [];
    for (const r of res) {
      const u = porDia.get(r.data);
      if (!u) porDia.set(r.data, r);
      else { const novo = r.gerado > u.gerado ? r : u, velho = novo === r ? u : r; porDia.set(r.data, novo); avisos.push(`${dBR(r.data)}: usei ${novo.nome} (gerado ${dhBR(novo.gerado)}) e descartei ${velho.nome} (gerado ${dhBR(velho.gerado)})`); }
    }
    let nNovas = 0, nLin = 0; const feitos = [];
    for (const [data, r] of porDia) {
      const atual = F.dias.filter(d => d.data === data).map(d => d.gerado_em).filter(Boolean).sort().pop();
      if (atual && new Date(atual) > new Date(r.gerado)) { avisos.push(`${dBR(data)}: o sistema já tem uma versão mais recente (gerada ${dhBR(atual)}); o arquivo ${r.nome} (gerado ${dhBR(r.gerado)}) foi ignorado`); continue; }
      const mapa = new Map(); juntar(mapa, r.itens);
      const itens = [...mapa.entries()].map(([codigo, m]) => ({ ...m.meta, codigo, lotes: [...m.lotes.entries()].map(([lote, qtd]) => ({ lote, qtd })) }));
      // cadastro: novas ferragens entram; descrição atualiza se vier preenchida
      const cad = itens.map(it => {
        const ex = F.cad.find(c => c.codigo === it.codigo);
        if (!ex) nNovas++;
        return { codigo: it.codigo, descricao: it.descricao || (ex && ex.descricao) || null, modelo: it.modelo || (ex && ex.modelo) || null,
          fabricante: it.fabricante || (ex && ex.fabricante) || null, tipo: it.tipo || (ex && ex.tipo) || null, cadastrada: it.cadastrada };
      });
      let { error } = await sb.from('ferragens').upsert(cad, { onConflict: 'codigo' });
      if (error) { CTX.erro('Erro ao salvar as ferragens: ' + error.message); return; }
      // o dia é substituído inteiro pela versão mais recente do Plano Mestre
      ({ error } = await sb.from('ferragens_dia').delete().eq('data', data));
      if (error) { CTX.erro('Erro: ' + error.message); return; }
      ({ error } = await sb.from('ferragens_dia').insert(itens.map(it => ({ data, codigo: it.codigo, qtd: it.lotes.reduce((a, l) => a + (l.qtd || 0), 0),
        lotes: JSON.stringify(it.lotes), gerado_em: r.gerado }))));
      if (error) { CTX.erro('Erro ao salvar o dia ' + dBR(data) + ': ' + error.message); return; }
      nLin += itens.length; feitos.push(data);
    }
    const dias = feitos.sort();
    CTX.aviso(`${dias.length} dia(s) importado(s)${dias.length ? ': ' + dias.map(dBR).join(', ') : ''} · ${nLin} ferragens${nNovas ? ` · ${nNovas} novas no cadastro` : ''}`);
    if (avisos.length) alert('Arquivos do mesmo dia:\n\n' + avisos.join('\n'));
    if (!dias.length) return;
    F.dia = dias[dias.length - 1];
    await carregar();
  }

  // ---------- banco ----------
  async function carregar() {
    $('fgResumo').textContent = 'Carregando…';
    try {
      const [cad, dias, ev] = await Promise.all([
        MG.buscarTudo('ferragens', '*', null, 'codigo'),
        MG.buscarTudo('ferragens_dia', '*', null, ['data', 'codigo']),
        MG.buscarTudo('ferragens_eventos', '*', null, 'id')]);
      F.cad = cad; F.dias = dias; F.ev = ev; F.carregado = true;
    } catch (e) {
      $('fgResumo').textContent = '';
      CTX.erro(/does not exist|relation|schema cache/i.test(e.message) ? 'As tabelas de ferragens ainda não foram criadas no banco.' : 'Erro ao carregar as ferragens: ' + e.message);
      return;
    }
    if (!F.dia || !F.dias.some(d => d.data === F.dia)) F.dia = diaPadrao();
    render();
  }
  function diaPadrao() {
    const ds = [...new Set(F.dias.map(d => d.data))].sort();
    if (!ds.length) return '';
    const alvo = somaDias(hoje(), 2);            // ela manda ao Val as de 2 dias depois
    return ds.find(d => d >= alvo) || ds.filter(d => d >= hoje())[0] || ds[ds.length - 1];
  }
  async function registrar(codigos, tipo, data, por, obs, dia) {
    if (!CTX.dona) return false;
    const linhas = codigos.map(c => ({ codigo: c, tipo, data: data || hoje(), por: por || null, obs: obs || null, dia_producao: dia || null }));
    const { data: novos, error } = await sb.from('ferragens_eventos').insert(linhas).select();
    if (error) { CTX.erro('Erro ao salvar: ' + error.message); return false; }
    F.ev.push(...novos); return true;
  }

  // ---------- tela ----------
  function html() {
    return `
    <div class="card"><h2>Ferragens testadas</h2>
      <p class="muted" style="margin:6px 0 0;max-width:100ch">Importe os PDFs "Ferragens do dia" do Plano Mestre. Para cada dia, o site mostra quais ferragens já foram testadas na máquina e quais precisam ser conferidas com o Val (nunca testadas, testadas com problema, programa alterado depois do teste, ou não cadastradas no Plano Mestre). "Rara" = usada em até 2 dias nos últimos 90 dias. Uma ferragem testada continua valendo até alguém alterar o programa: nesse caso, marque "Programa alterado" e ela volta a pedir teste.</p>
    </div>
    <div class="barra">
      <button class="btn small primary" id="fgImportar" type="button">Importar PDFs "Ferragens do dia"</button>
      <input type="file" id="fgArq" accept=".pdf" multiple hidden>
      <span class="muted" id="fgResumo"></span>
    </div>
    <div id="fgKpis" class="kpis"></div>
    <div id="fgDia"></div>
    <details class="card" id="fgTodasBox"><summary style="cursor:pointer"><b>Todas as ferragens</b> <span class="muted" id="fgTodasN"></span></summary><div id="fgTodas"></div></details>
    <details class="card" id="fgHistBox"><summary style="cursor:pointer"><b>Histórico: quando e quais o Val testou</b> <span class="muted" id="fgHistN"></span></summary><div id="fgHist"></div></details>`;
  }

  function render() {
    const ds = [...new Set(F.dias.map(d => d.data))].sort();
    $('fgResumo').textContent = `${F.cad.length} ferragens no cadastro · ${ds.length} dias importados${ds.length ? ` (${dBR(ds[0])} a ${dBR(ds[ds.length - 1])})` : ''}`;
    const est = F.cad.map(c => estado(c.codigo));
    const n = st => est.filter(e => e.st === st).length;
    $('fgKpis').innerHTML = [['ok', 'Testadas'], ['nunca', 'Nunca testadas'], ['retestar', 'Testar de novo'], ['problema', 'Com problema'], ['naocad', 'Não cadastradas']]
      .map(([k, t]) => `<div class="kpi"><span>${t}</span><b>${n(k)}</b></div>`).join('');
    renderDia(ds); renderTodas(); renderHist();
  }

  function linhaAcoes(cod) {
    if (!CTX.dona) return '';
    return `<span class="fg-ac" data-cod="${esc(cod)}">
      <button class="btn small" type="button" data-fg="ok" title="O Val testou e funcionou">✓ Testou</button>
      <button class="btn small" type="button" data-fg="prob" title="O Val testou e deu problema">✕ Problema</button>
      <button class="btn small" type="button" data-fg="nao" title="Conferi com o Val e ele ainda não testou">Não testou</button>
      <button class="btn small" type="button" data-fg="alt" title="Alguém mexeu no programa: precisa testar de novo">Programa alterado</button></span>`;
  }

  function renderDia(ds) {
    const el = $('fgDia');
    if (!ds.length) { el.innerHTML = '<div class="card muted">Nenhum dia importado ainda. Clique em "Importar PDFs" e escolha os arquivos "Ferragens do dia".</div>'; return; }
    const itens = F.dias.filter(d => d.data === F.dia).map(d => {
      const c = F.cad.find(x => x.codigo === d.codigo) || { codigo: d.codigo };
      const e = estado(d.codigo);
      return { d, c, e, rara: rara(d.codigo, F.dia), primeira: usos(d.codigo)[0] === F.dia };
    }).sort((a, b) => ST_ORD[a.e.st] - ST_ORD[b.e.st] || (b.rara - a.rara) || String(a.c.tipo).localeCompare(String(b.c.tipo)) || a.d.codigo.localeCompare(b.d.codigo));
    const conferir = itens.filter(x => x.e.st !== 'ok');
    const enviadaEm = F.ev.filter(e => e.tipo === 'Enviada ao Val' && e.dia_producao === F.dia).map(e => e.data).sort().pop();
    el.innerHTML = `<div class="card">
      <div style="display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between">
        <h2 style="margin:0">Ferragens do dia</h2>
        <label class="muted">Dia de produção <select id="fgSelDia">${ds.map(d => `<option value="${d}" ${d === F.dia ? 'selected' : ''}>${diaSem(d)}, ${dBR(d)}${d === somaDias(hoje(), 2) ? ' (daqui a 2 dias)' : d === hoje() ? ' (hoje)' : ''}</option>`).join('')}</select></label>
      </div>
      <p class="muted" style="margin:6px 0 10px">${itens.length} ferragens · <b style="color:${conferir.length ? 'var(--bad)' : 'var(--good)'}">${conferir.length} para conferir com o Val</b> · ${itens.filter(x => x.rara).length} raras${enviadaEm ? ` · lista enviada ao Val em ${dBR(enviadaEm)}` : ''}${(() => { const g = F.dias.filter(d => d.data === F.dia).map(d => d.gerado_em).filter(Boolean).sort().pop(); return g ? ` · Plano Mestre gerado em ${dhBR(g)}` : ''; })()}</p>
      <div class="fg-lista">${itens.map(({ d, c, e, rara: r, primeira }) => `
        <div class="fg-l fg-${e.st}">
          <div class="fg-cod"><b>${esc(d.codigo)}</b><span class="muted">${esc(c.tipo || '')}</span></div>
          <div class="fg-desc">${esc(c.descricao || '')}${c.fabricante ? ` <span class="muted">· ${esc(c.fabricante)}</span>` : ''}
            <div class="muted fg-lote" title="${esc(lotesDe(d).map(l => l.lote + (l.qtd != null ? ' — ' + l.qtd + ' un.' : '')).join('\n'))}">${d.qtd} un.${lotesDe(d).length ? ' · ' + esc(lotesDe(d).map(l => l.lote.split(' · ')[0]).join(', ')) : ''}</div></div>
          <div class="fg-st">${pill(e)}${r ? ' <span class="pill feita" title="Usada em até 2 dias nos últimos 90 dias">rara</span>' : ''}${primeira ? ' <span class="pill feita">1ª vez</span>' : ''}
            ${e.ok ? `<div class="muted fg-lote">último OK: ${dBR(e.ok.data)}${e.ok.por ? ' · ' + esc(e.ok.por) : ''}</div>` : ''}</div>
          ${linhaAcoes(d.codigo)}
        </div>`).join('')}</div>
      ${CTX.dona ? `<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <textarea id="fgMsg" rows="${Math.min(14, conferir.length + 4)}" style="flex:1;min-width:280px;max-width:640px;font:13px var(--mono,monospace);border:1px solid var(--line);border-radius:6px;padding:8px">${esc(mensagem(itens))}</textarea>
        <div style="display:flex;flex-direction:column;gap:6px"><button class="btn small" id="fgCopiar" type="button">Copiar mensagem para o Val</button>
        <button class="btn small" id="fgEnviada" type="button" title="Guarda que você mandou a lista deste dia ao Val hoje">Marcar como enviada ao Val</button>
        <button class="btn small" id="fgTodasOk" type="button" ${conferir.filter(x => x.e.st !== 'naocad').length ? '' : 'disabled'}>Val testou todas as pendentes</button></div></div>` : ''}
    </div>`;
  }
  function mensagem(itens) {
    const conf = itens.filter(x => x.e.st !== 'ok');
    const d = F.dia;
    if (!conf.length) return `Val, as ferragens de ${diaSem(d)} ${dBR(d).slice(0, 5)} já foram todas testadas.`;
    return `Val, ferragens de ${diaSem(d)} ${dBR(d).slice(0, 5)} para testar:\n` + conf.map(({ d: x, c, e, rara: r }) =>
      `• ${x.codigo} – ${c.descricao || ''} (${e.st === 'nunca' ? 'nunca testada' : e.st === 'retestar' ? 'programa alterado' : e.st === 'problema' ? 'deu problema no último teste' : 'não cadastrada no Plano Mestre'}${r && e.st !== 'naocad' ? ', rara' : ''})`).join('\n')
      + `\nMe avisa quando testar, por favor.`;
  }

  function renderTodas() {
    const q = norm(F.busca);
    const dsF = new Set(F.dias.filter(d => d.data >= hoje()).map(d => d.codigo));
    const lin = F.cad.map(c => ({ c, e: estado(c.codigo), u: usos(c.codigo) }))
      .filter(x => (!F.status || x.e.st === F.status) && (!F.tipo || x.c.tipo === F.tipo) && (!q || norm([x.c.codigo, x.c.descricao, x.c.fabricante, x.c.modelo].join(' ')).includes(q)))
      .sort((a, b) => ST_ORD[a.e.st] - ST_ORD[b.e.st] || a.c.codigo.localeCompare(b.c.codigo));
    $('fgTodasN').textContent = `(${F.cad.length})`;
    const tipos = [...new Set(F.cad.map(c => c.tipo).filter(Boolean))].sort();
    $('fgTodas').innerHTML = `<div class="barra" style="margin:8px 0">
        <label>Buscar <input id="fgBusca" type="search" value="${esc(F.busca)}" placeholder="código, descrição, fabricante" style="width:200px"></label>
        <label>Situação <select id="fgStatus"><option value="">Todas</option>${[['ok', 'Testadas'], ['nunca', 'Nunca testadas'], ['retestar', 'Testar de novo'], ['problema', 'Com problema'], ['naocad', 'Não cadastradas']].map(([v, t]) => `<option value="${v}" ${F.status === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Tipo <select id="fgTipo"><option value="">Todos</option>${tipos.map(t => `<option ${F.tipo === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        ${CTX.dona ? `<span class="muted">${F.sel.size} selecionadas</span>
        <button class="btn small" id="fgSelOk" type="button" ${F.sel.size ? '' : 'disabled'} title="Para as ferragens que já eram testadas antes deste controle">Marcar selecionadas como testadas</button>` : ''}
      </div>
      <div class="scroll"><table class="fg-tab"><thead><tr>${CTX.dona ? `<th><input type="checkbox" id="fgSelTodas" ${lin.length && lin.every(x => F.sel.has(x.c.codigo)) ? 'checked' : ''} title="Selecionar todas as da lista"></th>` : ''}<th>Código</th><th>Descrição</th><th>Tipo</th><th>Situação</th><th>Último teste</th><th>Dias usada</th><th>Última vez</th><th>Próxima vez</th>${CTX.dona ? '<th></th>' : ''}</tr></thead><tbody>
      ${lin.map(({ c, e, u }) => { const prox = u.find(d => d >= hoje()), pass = u.filter(d => d < hoje()).pop();
        return `<tr data-cod="${esc(c.codigo)}" class="fg-row">${CTX.dona ? `<td><input type="checkbox" class="fg-sel" ${F.sel.has(c.codigo) ? 'checked' : ''}></td>` : ''}
        <td><b>${esc(c.codigo)}</b></td><td>${esc(c.descricao || '')}${c.fabricante ? ` <span class="muted">· ${esc(c.fabricante)}</span>` : ''}</td><td>${esc(c.tipo || '')}</td>
        <td>${pill(e)}</td><td>${e.ult ? `${dBR(e.ult.data)}${e.ult.por ? ' · ' + esc(e.ult.por) : ''}` : '<span class="muted">—</span>'}</td>
        <td class="num">${u.length}</td><td>${pass ? dBR(pass) : '—'}</td><td>${prox ? `<b>${dBR(prox)}</b>` : '—'}</td>
        ${CTX.dona ? `<td><button class="btn small" type="button" data-hist="${esc(c.codigo)}">Histórico</button></td>` : ''}</tr>`; }).join('')}
      </tbody></table></div>`;
  }

  function renderHist() {
    const ev = F.ev.filter(e => e.tipo !== 'Enviada ao Val' && (!F.hDe || e.data >= F.hDe) && (!F.hAte || e.data <= F.hAte))
      .sort((a, b) => (b.data + (b.criado_em || '')).localeCompare(a.data + (a.criado_em || '')));
    $('fgHistN').textContent = `(${F.ev.filter(e => e.tipo === 'Testada OK').length} testes OK registrados)`;
    const porDia = new Map(); ev.forEach(e => { if (!porDia.has(e.data)) porDia.set(e.data, []); porDia.get(e.data).push(e); });
    $('fgHist').innerHTML = `<div class="barra" style="margin:8px 0"><label>de <input type="date" id="fgHDe" value="${F.hDe}"></label><label>até <input type="date" id="fgHAte" value="${F.hAte}"></label>
      <span class="muted">${ev.filter(e => e.tipo === 'Testada OK').length} testadas OK · ${ev.filter(e => e.tipo === 'Testada com problema').length} com problema · ${ev.filter(e => e.tipo === 'Não testada').length} conferências "não testou" no período</span></div>
      ${porDia.size ? [...porDia.entries()].map(([d, es]) => `<div class="fg-hd"><b>${diaSem(d)}, ${dBR(d)}</b>
        <ul>${es.map(e => { const c = F.cad.find(x => x.codigo === e.codigo) || {};
          return `<li><span class="pill ${e.tipo === 'Testada OK' ? 'apontado' : e.tipo === 'Testada com problema' ? 'pendente' : e.tipo === 'Programa alterado' ? 'turno_anterior' : 'na'}">${esc(e.tipo)}</span> <b>${esc(e.codigo)}</b> ${esc(c.descricao || '')}${e.por ? ` <span class="muted">· ${esc(e.por)}</span>` : ''}${e.dia_producao ? ` <span class="muted">· para ${dBR(e.dia_producao)}</span>` : ''}${e.obs ? ` <span class="muted">· ${esc(e.obs)}</span>` : ''}
            ${CTX.dona ? `<button class="fg-x" type="button" data-apagar="${e.id}" title="Apagar este registro">✕</button>` : ''}</li>`; }).join('')}</ul></div>`).join('')
      : '<p class="muted">Nenhum registro no período.</p>'}`;
  }

  // pequena janela para confirmar data, quem testou e observação
  function perguntar(titulo, cods, comResultado) {
    return new Promise(ok => {
      const fundo = document.createElement('div'); fundo.className = 'dv-fundo';
      const jan = document.createElement('div'); jan.className = 'dv-jan'; jan.style.width = 'min(520px, calc(100vw - 24px))';
      jan.innerHTML = `<button class="dv-x" type="button">×</button><h3>${esc(titulo)}</h3>
        <p class="muted" style="margin:4px 0 10px">${cods.length > 6 ? cods.length + ' ferragens' : cods.map(esc).join(', ')}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <label class="muted">Data <input type="date" id="fgPData" value="${hoje()}"></label>
          <label class="muted">Quem <input id="fgPPor" value="${comResultado ? 'Val' : 'Beatriz'}" style="width:140px"></label></div>
        <label class="muted" style="display:block;margin-top:8px">Observação <input id="fgPObs" style="width:100%" placeholder="opcional"></label>
        <div style="margin-top:12px;text-align:right"><button class="btn small" type="button" id="fgPCanc">Cancelar</button> <button class="btn small primary" type="button" id="fgPOk">Salvar</button></div>`;
      document.body.append(fundo, jan);
      const fim = v => { fundo.remove(); jan.remove(); ok(v); };
      fundo.onclick = () => fim(null); jan.querySelector('.dv-x').onclick = () => fim(null); jan.querySelector('#fgPCanc').onclick = () => fim(null);
      jan.querySelector('#fgPOk').onclick = () => fim({ data: jan.querySelector('#fgPData').value || hoje(), por: jan.querySelector('#fgPPor').value.trim(), obs: jan.querySelector('#fgPObs').value.trim() });
      jan.addEventListener('keydown', e => { if (e.key === 'Escape') fim(null); if (e.key === 'Enter') jan.querySelector('#fgPOk').click(); });
      jan.querySelector('#fgPPor').focus();
    });
  }
  const ACAO = { ok: ['Testada OK', 'Val testou e funcionou'], prob: ['Testada com problema', 'Val testou e deu problema'], nao: ['Não testada', 'Val ainda não testou'], alt: ['Programa alterado', 'O programa foi alterado'] };

  function mostrarHistorico(cod) {
    const c = F.cad.find(x => x.codigo === cod) || { codigo: cod }, e = estado(cod), u = usos(cod);
    const fundo = document.createElement('div'); fundo.className = 'dv-fundo';
    const jan = document.createElement('div'); jan.className = 'dv-jan'; jan.style.width = 'min(640px, calc(100vw - 24px))';
    jan.innerHTML = `<button class="dv-x" type="button">×</button><h3>${esc(cod)} · ${esc(c.descricao || '')}</h3><div>${pill(e)}</div>
      <h4 style="margin:12px 0 4px">Testes e conferências</h4>${e.evs.length ? `<ul>${[...e.evs].reverse().map(x => `<li>${dBR(x.data)} · <b>${esc(x.tipo)}</b>${x.por ? ' · ' + esc(x.por) : ''}${x.dia_producao ? ' · para ' + dBR(x.dia_producao) : ''}${x.obs ? ' · ' + esc(x.obs) : ''}</li>`).join('')}</ul>` : '<p class="muted">Nenhum registro.</p>'}
      <h4 style="margin:12px 0 4px">Dias em que foi usada (${u.length})</h4><p>${u.map(d => `<span class="pill na" style="margin:2px">${dBR(d)}</span>`).join(' ') || '—'}</p>`;
    document.body.append(fundo, jan);
    const fim = () => { fundo.remove(); jan.remove(); };
    fundo.onclick = fim; jan.querySelector('.dv-x').onclick = fim;
  }

  function iniciar() {
    $('sec-ferragens').innerHTML = html();
    $('fgImportar').hidden = !CTX.dona;
    $('fgImportar').addEventListener('click', () => { $('fgArq').value = ''; $('fgArq').click(); });
    $('fgArq').addEventListener('change', e => { if (e.target.files.length) importar([...e.target.files]); });
    const sec = $('sec-ferragens');
    sec.addEventListener('change', async e => {
      const t = e.target;
      if (t.id === 'fgSelDia') { F.dia = t.value; render(); return; }
      if (t.id === 'fgStatus') { F.status = t.value; renderTodas(); return; }
      if (t.id === 'fgTipo') { F.tipo = t.value; renderTodas(); return; }
      if (t.id === 'fgHDe') { F.hDe = t.value; renderHist(); return; }
      if (t.id === 'fgHAte') { F.hAte = t.value; renderHist(); return; }
      if (t.classList.contains('fg-sel')) { const cod = t.closest('tr').dataset.cod; t.checked ? F.sel.add(cod) : F.sel.delete(cod); renderTodas(); return; }
      if (t.id === 'fgSelTodas') { sec.querySelectorAll('.fg-row').forEach(r => { t.checked ? F.sel.add(r.dataset.cod) : F.sel.delete(r.dataset.cod); }); renderTodas(); }
    });
    let tb = null;
    sec.addEventListener('input', e => { if (e.target.id === 'fgBusca') { clearTimeout(tb); tb = setTimeout(() => { F.busca = e.target.value; renderTodas(); const b = $('fgBusca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }, 250); } });
    sec.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      const y = window.scrollY;
      if (b.dataset.hist) { mostrarHistorico(b.dataset.hist); return; }
      if (!CTX.dona) return;
      if (b.dataset.fg) {
        const cod = b.closest('[data-cod]').dataset.cod, [tipo, tit] = ACAO[b.dataset.fg];
        const r = await perguntar(tit, [cod], b.dataset.fg !== 'alt'); if (!r) return;
        if (await registrar([cod], tipo, r.data, r.por, r.obs, F.dia)) { CTX.aviso('Salvo'); render(); window.scrollTo(0, y); }
        return;
      }
      if (b.dataset.apagar) {
        if (!confirm('Apagar este registro do histórico?')) return;
        const { error } = await sb.from('ferragens_eventos').delete().eq('id', b.dataset.apagar);
        if (error) { CTX.erro('Erro: ' + error.message); return; }
        F.ev = F.ev.filter(x => String(x.id) !== String(b.dataset.apagar)); render(); window.scrollTo(0, y); return;
      }
      if (b.id === 'fgCopiar') { const t = $('fgMsg'); t.select(); try { await navigator.clipboard.writeText(t.value); } catch (er) { document.execCommand('copy'); } CTX.aviso('Mensagem copiada'); return; }
      if (b.id === 'fgEnviada') {
        const cods = F.dias.filter(d => d.data === F.dia).map(d => d.codigo).filter(c => estado(c).st !== 'ok');
        if (await registrar(cods.length ? cods : ['—'], 'Enviada ao Val', hoje(), 'Beatriz', null, F.dia)) { CTX.aviso('Registrado: lista enviada ao Val'); render(); window.scrollTo(0, y); }
        return;
      }
      if (b.id === 'fgTodasOk') {
        const cods = F.dias.filter(d => d.data === F.dia).map(d => d.codigo).filter(c => !['ok', 'naocad'].includes(estado(c).st));
        const r = await perguntar('Val testou e funcionou', cods, true); if (!r) return;
        if (await registrar(cods, 'Testada OK', r.data, r.por, r.obs, F.dia)) { CTX.aviso(`${cods.length} ferragens marcadas como testadas`); render(); window.scrollTo(0, y); }
        return;
      }
      if (b.id === 'fgSelOk') {
        const cods = [...F.sel];
        const r = await perguntar('Já estavam testadas', cods, true); if (!r) return;
        if (await registrar(cods, 'Testada OK', r.data, r.por, r.obs || 'testada antes do controle', null)) { F.sel.clear(); CTX.aviso(`${cods.length} ferragens marcadas como testadas`); render(); window.scrollTo(0, y); }
      }
    });
    carregar();
  }

  let iniciada = false;
  function abrir(ctx) { CTX = ctx; if (!iniciada) { iniciada = true; iniciar(); } else carregar(); }
  return { abrir, _interpretar: interpretar, _linhasPDF: linhasPDF };
})();
