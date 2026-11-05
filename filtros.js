// Filtros nas colunas, no estilo do Excel: botão ▾ no cabeçalho abre uma lista de valores com caixas
// de marcar, busca, ordenação e (para números) faixa "de / até".
// Uso: const f = MGFiltros.criar({ colunas: [{ chave, valor: linha => ..., tipo: 'num'|'txt', mostrar?: v => texto }], aoMudar });
//      f.cabecalho(chave, rotulo) -> HTML do <th> com o botão; f.aplicar(linhas) -> linhas filtradas e ordenadas;
//      f.ligar(tabela, () => linhasBase) liga os botões; f.limpar(); f.ativos()
window.MGFiltros = (function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const VAZIO = '(vazio)';
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let popAberto = null;

  function fecharPop() { if (popAberto) { popAberto.remove(); popAberto = null; } }
  document.addEventListener('mousedown', e => { if (popAberto && !popAberto.contains(e.target) && !e.target.closest('.fbtn')) fecharPop(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharPop(); });

  // estilos (uma vez)
  const css = document.createElement('style');
  css.textContent = `
    th .fbtn{appearance:none;border:1px solid transparent;background:none;color:var(--muted);font:600 11px var(--sans);padding:0 4px;margin-left:4px;border-radius:4px;cursor:pointer;line-height:16px;vertical-align:middle}
    th .fbtn:hover{border-color:var(--line);color:var(--ink)}
    th .fbtn.on{background:var(--accent);color:var(--accent-ink)}
    .fpop{position:absolute;z-index:60;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.22);padding:10px;width:290px;font:13px var(--sans);text-transform:none;letter-spacing:0}
    .fpop .ford{display:flex;gap:6px;margin-bottom:8px}
    .fpop .ford button,.fpop .facoes button{flex:1}
    .fpop .ffaixa{display:flex;gap:6px;align-items:center;margin-bottom:8px;font-size:12px;color:var(--muted)}
    .fpop .ffaixa input{width:80px}
    .fpop input[type=search]{width:100%;margin-bottom:6px}
    .fpop .flista{max-height:240px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:4px 6px;margin-bottom:8px}
    .fpop .flista label{display:flex;gap:6px;align-items:flex-start;padding:2px 0;font-size:12.5px;cursor:pointer;color:var(--ink)}
    .fpop .flista label span.n{margin-left:auto;color:var(--muted);font:11px var(--mono)}
    .fpop .facoes{display:flex;gap:6px}
    .fpop .faviso{font-size:11.5px;color:var(--muted);margin:-4px 0 6px}`;
  document.head.appendChild(css);

  function criar(opts) {
    const cols = new Map(opts.colunas.map(c => [c.chave, c]));
    const sel = new Map();          // chave -> Set de valores permitidos
    const faixa = new Map();        // chave -> {de, ate}
    let ordem = null;               // {chave, dir: 1|-1}

    const valorDe = (c, l) => { const v = c.valor(l); return v == null || v === '' ? VAZIO : v; };
    const passa = (l, exceto) => {
      for (const [k, set] of sel) { if (k === exceto) continue; if (!set.has(String(valorDe(cols.get(k), l)))) return false; }
      for (const [k, f] of faixa) {
        if (k === exceto) continue;
        const v = cols.get(k).valor(l);
        if (v == null || v === '' || isNaN(v)) return false;
        if (f.de != null && +v < f.de) return false;
        if (f.ate != null && +v > f.ate) return false;
      }
      return true;
    };
    function aplicar(linhas) {
      let L = (sel.size || faixa.size) ? linhas.filter(l => passa(l, null)) : linhas;
      if (ordem) {
        const c = cols.get(ordem.chave);
        L = L.slice().sort((a, b) => {
          const x = c.valor(a), y = c.valor(b);
          const vx = x == null || x === '', vy = y == null || y === '';
          if (vx || vy) return vx - vy;
          return (c.tipo === 'num' ? (x - y) : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * ordem.dir;
        });
      }
      return L;
    }
    const ativo = k => sel.has(k) || faixa.has(k) || (ordem && ordem.chave === k);
    function cabecalho(chave, rotulo, cls) {
      const c = cols.get(chave);
      const marca = ordem && ordem.chave === chave ? (ordem.dir === 1 ? ' ↑' : ' ↓') : '';
      return `<th${cls ? ` class="${cls}"` : ''}>${esc(rotulo)}${c ? `<button type="button" class="fbtn${ativo(chave) ? ' on' : ''}" data-fcol="${esc(chave)}" title="Filtrar ou ordenar esta coluna">▾${marca}</button>` : ''}</th>`;
    }
    function ativos() { return new Set([...sel.keys(), ...faixa.keys()]).size + (ordem ? 1 : 0); }
    function limpar() { sel.clear(); faixa.clear(); ordem = null; fecharPop(); opts.aoMudar(); }

    function abrir(btn, base) {
      fecharPop();
      const chave = btn.dataset.fcol, c = cols.get(chave);
      // valores possíveis = linhas que passam pelos OUTROS filtros (como no Excel)
      const cont = new Map();
      for (const l of base) { if (!passa(l, chave)) continue; const v = String(valorDe(c, l)); cont.set(v, (cont.get(v) || 0) + 1); }
      const vals = [...cont.keys()].sort((a, b) => {
        if (a === VAZIO) return 1; if (b === VAZIO) return -1;
        return c.tipo === 'num' ? (+a - +b) : a.localeCompare(b, 'pt-BR', { numeric: true });
      });
      const marcados = sel.has(chave) ? new Set(sel.get(chave)) : new Set(vals);
      const f = faixa.get(chave) || {};
      const pop = document.createElement('div');
      pop.className = 'fpop';
      pop.innerHTML = `
        <div class="ford"><button class="btn small" data-o="1" type="button">${c.tipo === 'num' ? 'Menor → maior' : 'A → Z'}</button>
          <button class="btn small" data-o="-1" type="button">${c.tipo === 'num' ? 'Maior → menor' : 'Z → A'}</button></div>
        ${c.tipo === 'num' ? `<div class="ffaixa">De <input type="number" class="fde" value="${f.de ?? ''}"> até <input type="number" class="fate" value="${f.ate ?? ''}"></div>` : ''}
        <input type="search" class="fbusca" placeholder="Buscar valor">
        <div class="flista"></div>
        <div class="facoes"><button class="btn small primary fok" type="button">Aplicar</button>
          <button class="btn small flimpa" type="button">Limpar</button></div>`;
      const lista = pop.querySelector('.flista');
      const MAX = 1000;
      function desenhar() {
        const b = norm(pop.querySelector('.fbusca').value.trim());
        const vis = b ? vals.filter(v => norm(v).includes(b) || (c.mostrar && v !== VAZIO && norm(c.mostrar(v)).includes(b))) : vals;
        const todos = vis.length && vis.every(v => marcados.has(v));
        lista.innerHTML = `<label><input type="checkbox" class="ftodos" ${todos ? 'checked' : ''}> <b>(Selecionar ${b ? 'os encontrados' : 'tudo'})</b></label>` +
          vis.slice(0, MAX).map(v => `<label><input type="checkbox" data-v="${esc(v)}" ${marcados.has(v) ? 'checked' : ''}> <span>${esc(v === VAZIO || !c.mostrar ? v : c.mostrar(v))}</span><span class="n">${cont.get(v)}</span></label>`).join('') +
          (vis.length > MAX ? `<div class="faviso">Mostrando ${MAX} de ${vis.length}. Use a busca para achar os outros.</div>` : '');
        lista.querySelector('.ftodos').onchange = e => { vis.forEach(v => e.target.checked ? marcados.add(v) : marcados.delete(v)); desenhar(); };
      }
      lista.addEventListener('change', e => { const v = e.target.dataset.v; if (v == null) return; e.target.checked ? marcados.add(v) : marcados.delete(v); });
      pop.querySelector('.fbusca').addEventListener('input', desenhar);
      pop.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { ordem = { chave, dir: +b.dataset.o }; fecharPop(); opts.aoMudar(); });
      pop.querySelector('.flimpa').onclick = () => { sel.delete(chave); faixa.delete(chave); if (ordem && ordem.chave === chave) ordem = null; fecharPop(); opts.aoMudar(); };
      pop.querySelector('.fok').onclick = () => {
        if (vals.every(v => marcados.has(v))) sel.delete(chave); else sel.set(chave, new Set(marcados));
        if (c.tipo === 'num') {
          const de = pop.querySelector('.fde').value, ate = pop.querySelector('.fate').value;
          if (de === '' && ate === '') faixa.delete(chave); else faixa.set(chave, { de: de === '' ? null : +de, ate: ate === '' ? null : +ate });
        }
        fecharPop(); opts.aoMudar();
      };
      pop.querySelector('.fbusca').addEventListener('keydown', e => { if (e.key === 'Enter') pop.querySelector('.fok').click(); });
      desenhar();
      document.body.appendChild(pop);
      const r = btn.getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(window.innerWidth - 300, r.left + window.scrollX - 120)) + 'px';
      pop.style.top = (r.bottom + window.scrollY + 4) + 'px';
      popAberto = pop;
      pop.querySelector('.fbusca').focus();
    }
    function ligar(tabela, base) {
      tabela.addEventListener('click', e => { const b = e.target.closest('.fbtn'); if (b) { e.preventDefault(); e.stopPropagation(); abrir(b, base()); } });
    }
    return { cabecalho, aplicar, ligar, limpar, ativos };
  }
  return { criar };
})();

// Navegação pelo teclado nas tabelas, como numa planilha: setas andam entre as células editáveis.
// MGTeclado.grade(tabela, { seletor, chaveLinha: tr => 'id', aoBorda: (direcao) => bool })
//  - ↑/↓ vão para a mesma coluna na linha de cima/baixo; ←/→ para a célula editável anterior/seguinte.
//  - Em campos de texto, ←/→ só mudam de célula quando o cursor está no começo/fim do texto.
//  - Enter num campo de texto desce para a linha de baixo (como no Excel).
//  - lembrar()/restaurar() recolocam o foco na mesma célula depois que a tabela é redesenhada.
window.MGTeclado = (function () {
  const cssG = document.createElement('style');   // célula selecionada bem visível, também quando escolhida com o mouse
  cssG.textContent = `.mg-grade td:focus-within{box-shadow:inset 0 0 0 2px var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent)}
    .mg-grade select:focus,.mg-grade input:focus,.mg-grade textarea:focus,.mg-grade button.it:focus{outline:2px solid var(--accent);outline-offset:1px}`;
  document.head.appendChild(cssG);
  function grade(tabela, o) {
    const sel = o.seletor;
    const celulas = () => [...tabela.querySelectorAll(sel)].filter(e => !e.disabled && e.offsetParent !== null);
    const pos = el => { const td = el.closest('td'), tr = el.closest('tr'); return { tr, col: td ? td.cellIndex : 0 }; };
    function mover(el, dir) {
      const todas = celulas(); if (!todas.length) return false;
      const { tr, col } = pos(el);
      const linhas = [...new Set(todas.map(e => e.closest('tr')))];
      const li = linhas.indexOf(tr);
      let alvo = null;
      if (dir === 'esq' || dir === 'dir') {
        const daLinha = todas.filter(e => e.closest('tr') === tr);
        const i = daLinha.indexOf(el);
        alvo = daLinha[dir === 'esq' ? i - 1 : i + 1] || null;
      } else {
        const passo = dir === 'cima' ? -1 : 1;
        for (let k = li + passo; k >= 0 && k < linhas.length && !alvo; k += passo) {
          const cand = todas.filter(e => e.closest('tr') === linhas[k]);
          alvo = cand.find(e => pos(e).col === col) || null;
        }
        if (!alvo && o.aoBorda) return o.aoBorda(dir, col);
      }
      if (alvo) { alvo.focus(); if (alvo.select && alvo.type !== 'select-one' && alvo.tagName !== 'BUTTON') alvo.select(); return true; }
      return false;
    }
    // Guarda a última célula usada: se o foco "cair" (menu que fecha, linha redesenhada), a célula volta a ficar selecionada.
    let ultimo = null;
    const memo = el => {
      const { tr, col } = pos(el);
      const iguais = [...tr.querySelectorAll(sel)].filter(e => pos(e).col === col);
      const linhas = [...new Set(celulas().map(e => e.closest('tr')))];
      return { linha: o.chaveLinha(tr), col, i: iguais.indexOf(el), idx: linhas.indexOf(tr) };
    };
    tabela.classList.add('mg-grade');
    tabela.addEventListener('focusin', e => { if (e.target.matches && e.target.matches(sel)) ultimo = memo(e.target); });
    document.addEventListener('focusin', e => {   // foi para outro campo fora da tabela (filtro, busca...): esquece
      const t = e.target;
      if (t && t !== document.body && !tabela.contains(t) && !(t.closest && t.closest('.menu-item'))) ultimo = null;
    });
    tabela.addEventListener('keydown', e => {
      const el = e.target;
      if (!el.matches || !el.matches(sel) || e.altKey || e.ctrlKey || e.metaKey) return;
      const texto = el.tagName === 'INPUT' && /^(text|search|number|)$/.test(el.type) || el.tagName === 'TEXTAREA';
      const k = e.key;
      let dir = null;
      if (k === 'ArrowUp') dir = 'cima';
      else if (k === 'ArrowDown') dir = 'baixo';
      else if (k === 'ArrowLeft' && (!texto || (el.selectionStart === 0 && el.selectionEnd === 0))) dir = 'esq';
      else if (k === 'ArrowRight' && (!texto || (el.selectionStart === el.value.length && el.selectionEnd === el.value.length))) dir = 'dir';
      else if (k === 'Enter' && texto && el.tagName !== 'TEXTAREA') dir = 'baixo';
      else if (k === 'Enter' && el.tagName === 'SELECT' && window.MGEscolha && MGEscolha.usa(el)) return;   // a busca por texto/número cuida
      else if (k === 'Enter' && el.tagName === 'SELECT' && el.showPicker) { e.preventDefault(); try { el.showPicker(); } catch (_) {} return; }
      if (!dir) return;
      if (el.tagName === 'TEXTAREA' && (dir === 'cima' || dir === 'baixo')) {   // em texto de várias linhas, só sai da célula na primeira/última linha
        const antes = el.value.slice(0, el.selectionStart), depois = el.value.slice(el.selectionEnd);
        if (dir === 'cima' && antes.includes('\n')) return;
        if (dir === 'baixo' && depois.includes('\n')) return;
      }
      e.preventDefault();
      mover(el, dir);   // ao sair do campo, o próprio navegador dispara a gravação (evento "change")
    });
    return {
      lembrar() {
        const el = document.activeElement;
        if (el && tabela.contains(el) && el.matches(sel)) return memo(el);
        const solto = !el || el === document.body || !document.contains(el) || (el.closest && el.closest('.menu-item'));
        return solto ? ultimo : null;
      },
      restaurar(m) {
        if (!m) return;
        let tr = [...tabela.querySelectorAll('tr')].find(t => o.chaveLinha(t) === m.linha);
        if (!tr) {   // a linha saiu da lista (por causa de um filtro): fica na mesma posição
          const linhas = [...new Set(celulas().map(e => e.closest('tr')))];
          tr = linhas[Math.min(m.idx, linhas.length - 1)];
          if (!tr) return;
        }
        const daCol = [...tr.querySelectorAll(sel)].filter(e => pos(e).col === m.col);
        const el = daCol[Math.max(0, Math.min(m.i, daCol.length - 1))] || tr.querySelector(sel);
        if (el && !el.disabled) el.focus({ preventScroll: true });
      },
      focarPrimeira(col, ultima) {
        const todas = celulas().filter(e => col == null || pos(e).col === col);
        const el = ultima ? todas[todas.length - 1] : todas[0];
        if (el) el.focus();
      }
    };
  }
  return { grade };
})();

// Ordem das colunas de TODAS as tabelas: arraste o título de uma coluna para outro lugar (com o mouse).
// A ordem fica guardada neste navegador, por tabela, e volta a valer quando a tabela é redesenhada.
window.MGColunas = (function () {
  const css = document.createElement('style');
  css.textContent = `table thead th.mg-arrastavel{cursor:grab}
    table thead th.arr-origem{opacity:.4}
    table thead th.arr-antes{box-shadow:inset 3px 0 0 var(--accent,#1D5E8A)}table thead th.arr-depois{box-shadow:inset -3px 0 0 var(--accent,#1D5E8A)}
    .mg-fantasma{position:fixed;z-index:200;pointer-events:none;background:var(--accent,#1D5E8A);color:#fff;font:600 12px/1.2 system-ui,sans-serif;padding:5px 9px;border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.25);white-space:nowrap}
    body.mg-arrastando, body.mg-arrastando *{cursor:grabbing!important;user-select:none!important}`;
  document.head.appendChild(css);
  const nomeTh0 = th => th.childNodes[0] ? String(th.childNodes[0].textContent).trim() : th.textContent.trim();
  const nomeTh = th => nomeTh0(th) || ('(coluna ' + (th.dataset.pos || '') + ')');
  const ths = t => t.tHead ? [...t.tHead.rows[t.tHead.rows.length - 1].cells] : [];
  // identidade de cada coluna: o nome do título (com número quando dois títulos são iguais), guardado no próprio th
  const idTh = th => th.dataset.mgId || nomeTh(th);
  const nomes = t => ths(t).map(idTh);
  function chave(t) {
    if (t.dataset.mgChave) return t.dataset.mgChave;
    if (t.id) return t.id;
    const dono = t.parentElement && t.parentElement.closest('[id]');
    const irmas = dono ? [...dono.querySelectorAll('table')] : [];
    return (dono ? dono.id : 'pagina') + ':' + (t.className || 'tabela') + ':' + Math.max(0, irmas.filter(x => x.className === t.className).indexOf(t));
  }
  const ler = k => { try { return JSON.parse(localStorage.getItem('mg-ordem-' + k) || 'null'); } catch (e) { return null; } };
  const gravar = (k, v) => { try { v ? localStorage.setItem('mg-ordem-' + k, JSON.stringify(v)) : localStorage.removeItem('mg-ordem-' + k); } catch (e) {} };
  function juntar(salva, base) {          // a ordem salva + colunas novas no lugar de origem
    const r = salva.filter(n => base.includes(n));
    base.forEach((n, i) => { if (r.includes(n)) return; const ant = base.slice(0, i).reverse().find(x => r.includes(x)); r.splice(ant ? r.indexOf(ant) + 1 : 0, 0, n); });
    return r;
  }
  function reordenar(t, alvo) {
    const atual = nomes(t), n = atual.length;
    const perm = alvo.map(x => atual.indexOf(x));
    if (perm.length !== n || perm.some(i => i < 0) || new Set(perm).size !== n || perm.every((p, i) => p === i)) return false;
    const foco = document.activeElement, tinha = t.contains(foco);
    t.querySelectorAll('tr').forEach(tr => {
      const cel = [...tr.children]; if (cel.length !== n) return;   // linhas com colspan (avisos) ficam como estão
      perm.forEach(i => tr.appendChild(cel[i]));
    });
    if (tinha && foco.isConnected && document.activeElement !== foco) try { foco.focus({ preventScroll: true }); } catch (e) {}
    return true;
  }
  function depois(t) { if (typeof t._mgAposOrdem === 'function') try { t._mgAposOrdem(); } catch (e) {} }
  // tabela nova ou redesenhada: guarda a ordem original e aplica a ordem salva
  function preparar(t) {
    const th = t.tHead; if (!th || th.dataset.mgOrd || t.closest('.fpop, .mg-esc, .dv-jan, #lMenu')) return;
    const cs = ths(t); if (cs.length < 2) return;
    th.dataset.mgOrd = '1';
    const vistos = {};
    cs.forEach((c, i) => { c.dataset.pos = i + 1; const n = nomeTh(c); vistos[n] = (vistos[n] || 0) + 1; c.dataset.mgId = vistos[n] > 1 ? n + ' (' + vistos[n] + ')' : n; c.classList.add('mg-arrastavel'); if (!c.title) c.title = 'Arraste para mudar a coluna de lugar'; });
    t._mgPadrao = nomes(t);
    const s = ler(chave(t));
    if (s && reordenar(t, juntar(s, t._mgPadrao))) depois(t);
  }
  let agendado = false;
  function varrer() { agendado = false; document.querySelectorAll('table').forEach(preparar); }
  function agendar() { if (!agendado) { agendado = true; Promise.resolve().then(varrer); } }
  new MutationObserver(agendar).observe(document.documentElement, { childList: true, subtree: true });
  agendar();
  // ---- arrastar com o mouse (não usa o "arrastar e soltar" do navegador, que falha em tabelas) ----
  let A = null;
  const limparMarca = () => document.querySelectorAll('th.arr-antes, th.arr-depois').forEach(x => x.classList.remove('arr-antes', 'arr-depois'));
  document.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const th = e.target.closest && e.target.closest('thead th.mg-arrastavel'); if (!th) return;
    if (e.target.closest('input, select, a, textarea, label')) return;   // o botão ▾ do filtro também serve para arrastar (clique simples continua abrindo o filtro)
    const t = th.closest('table'); if (!t) return;
    A = { t, th, x: e.clientX, y: e.clientY, ativo: false, alvo: null, lado: null };
  });
  document.addEventListener('mousemove', e => {
    if (!A) return;
    if (!A.ativo) {
      if (Math.abs(e.clientX - A.x) + Math.abs(e.clientY - A.y) < 6) return;
      A.ativo = true; A.th.classList.add('arr-origem'); document.body.classList.add('mg-arrastando');
      A.g = document.createElement('div'); A.g.className = 'mg-fantasma'; A.g.textContent = '⇄ ' + nomeTh(A.th); document.body.appendChild(A.g);
      const sel = window.getSelection && window.getSelection(); if (sel) sel.removeAllRanges();
    }
    e.preventDefault();
    A.g.style.left = (e.clientX + 12) + 'px'; A.g.style.top = (e.clientY + 10) + 'px';
    limparMarca(); A.alvo = null;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const th = el && el.closest && el.closest('thead th');
    if (th && th.closest('table') === A.t && th !== A.th) {
      const r = th.getBoundingClientRect();
      A.lado = e.clientX < r.left + r.width / 2 ? 'antes' : 'depois';
      A.alvo = th; th.classList.add('arr-' + A.lado);
    }
    // perto das bordas da caixa com rolagem lateral: rola junto
    const caixa = A.t.closest('.scroll'); if (caixa) { const r = caixa.getBoundingClientRect(); if (e.clientX > r.right - 40) caixa.scrollLeft += 18; else if (e.clientX < r.left + 40) caixa.scrollLeft -= 18; }
  });
  document.addEventListener('mouseup', () => {
    if (!A) return;
    const a = A; A = null;
    if (!a.ativo) return;
    a.th.classList.remove('arr-origem'); document.body.classList.remove('mg-arrastando'); if (a.g) a.g.remove(); limparMarca();
    // o clique que vem logo depois de soltar não deve abrir filtro/ordenar
    const engole = ev => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', engole, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', engole, true), 50);
    if (!a.alvo) return;
    const ord = nomes(a.t), de = idTh(a.th), para = idTh(a.alvo);
    ord.splice(ord.indexOf(de), 1);
    ord.splice(ord.indexOf(para) + (a.lado === 'depois' ? 1 : 0), 0, de);
    definir(a.t, ord);
  });
  function definir(t, ord) { gravar(chave(t), ord); reordenar(t, ord); depois(t); }
  function padrao(t) { gravar(chave(t), null); if (t._mgPadrao) reordenar(t, t._mgPadrao); depois(t); }
  return { nomes, nomeTh: idTh, definir, padrao, chave, varrer };
})();

// Tamanho da tabela: diminuir/aumentar (zoom) e "Caber na largura", para ver todas as colunas sem arrastar para o lado.
// O tamanho escolhido fica guardado neste navegador para cada tabela.
window.MGZoom = (function () {
  const css = document.createElement('style');
  css.textContent = `.zoombar{display:flex;gap:6px;align-items:center;justify-content:flex-end;margin:0 0 6px;font-size:12.5px;color:var(--muted)}
    .zoombar .btn{padding:3px 9px;font-size:12.5px}.zoombar b{min-width:44px;text-align:center;font:600 12px var(--mono);color:var(--ink)}`;
  document.head.appendChild(css);
  const ler = k => { try { const v = parseFloat(localStorage.getItem('mg-zoom-' + k)); return v > 0 ? v : null; } catch (e) { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem('mg-zoom-' + k, String(v)); } catch (e) {} };
  const ajusteAuto = {};
  function anexar(tabelaId) {
    const tab = document.getElementById(tabelaId);
    if (!tab || tab.dataset.zoom) return;
    tab.dataset.zoom = '1';
    const caixa = tab.closest('.scroll') || tab.parentElement;
    const barra = document.createElement('div');
    barra.className = 'zoombar';
    barra.innerHTML = `<span>Tamanho da tabela</span><button class="btn" type="button" data-z="-" title="Diminuir">A−</button><b></b>
      <button class="btn" type="button" data-z="+" title="Aumentar">A+</button>
      <button class="btn" type="button" data-z="fit" title="Diminui até todas as colunas caberem na largura da tela">Caber na largura</button>
      <button class="btn" type="button" data-z="1" title="Voltar ao tamanho normal">100%</button>
      <button class="btn" type="button" data-z="col" title="Escolher quais colunas aparecem e a ordem delas">Colunas</button>`;
    caixa.parentElement.insertBefore(barra, caixa);
    let z = ler(tabelaId) || 1;
    const aplicar = v => {
      z = Math.max(0.4, Math.min(1.6, Math.round(v * 100) / 100));
      tab.style.zoom = z;
      barra.querySelector('b').textContent = Math.round(z * 100) + '%';
      gravar(tabelaId, z);
    };
    const caber = () => {
      for (let k = 0; k < 3; k++) {                    // os campos não encolhem em proporção exata: ajusta em 3 passos
        const larguraReal = tab.getBoundingClientRect().width;
        if (!larguraReal || !caixa.clientWidth) return;
        aplicar(Math.floor(z * (caixa.clientWidth - 4) / larguraReal * 100) / 100);
        if (tab.getBoundingClientRect().width <= caixa.clientWidth) break;
      }
    };
    barra.addEventListener('click', e => {
      const b = e.target.closest('[data-z]'); if (!b) return;
      const op = b.dataset.z;
      if (op === 'col') { colunas(b); return; }
      ajusteAuto[tabelaId] = op === 'fit';
      if (op === '+') aplicar(z + 0.1); else if (op === '-') aplicar(z - 0.1); else if (op === '1') aplicar(1); else caber();
    });
    // ---- esconder/mostrar colunas (lembrado por nome da coluna) ----
    const estilo = document.createElement('style'); document.head.appendChild(estilo);
    let ocultas;
    try { ocultas = new Set(JSON.parse(localStorage.getItem('mg-colunas-' + tabelaId) || '[]')); } catch (e) { ocultas = new Set(); }
    const nomeTh = th => MGColunas.nomeTh(th);
    const nomesAtuais = () => MGColunas.nomes(tab);
    function aplicarColunas() {
      const ths = [...tab.querySelectorAll('thead th')];
      estilo.textContent = ths.map((th, i) => ocultas.has(nomeTh(th)) ? `#${tabelaId} tr > :nth-child(${i + 1}){display:none}` : '').join('\n');
      if (ajusteAuto[tabelaId]) requestAnimationFrame(caber);
    }
    function colunas(btn) {
      const velho = document.querySelector('.fpop'); if (velho) velho.remove();
      const pop = document.createElement('div');
      pop.className = 'fpop';
      const q = n => n.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const lista = () => nomesAtuais().map((n, i, a) => `<div class="fordem" style="display:flex;align-items:center;gap:4px">
          <label style="flex:1"><input type="checkbox" data-c="${q(n)}" ${ocultas.has(n) ? '' : 'checked'}> <span>${q(n)}</span></label>
          <button class="btn small" type="button" data-m="-1" data-c="${q(n)}" title="Mover para a esquerda" ${i ? '' : 'disabled'}>↑</button>
          <button class="btn small" type="button" data-m="1" data-c="${q(n)}" title="Mover para a direita" ${i < a.length - 1 ? '' : 'disabled'}>↓</button></div>`).join('');
      const desenhar = () => { pop.querySelector('.flista').innerHTML = lista(); };
      pop.innerHTML = '<b>Colunas</b><div class="muted" style="font-size:12px;margin:2px 0 4px">Marque as que aparecem. ↑ ↓ mudam a ordem (↑ = mais para a esquerda). Também dá para arrastar o título da coluna na tabela.</div><div class="flista" style="margin-top:6px;max-height:360px;overflow:auto"></div>' +
        '<div class="facoes"><button class="btn small" type="button" data-a="todas">Mostrar todas</button><button class="btn small" type="button" data-a="padrao">Ordem padrão</button><button class="btn small primary" type="button" data-a="ok">Fechar</button></div>';
      desenhar();
      pop.addEventListener('change', e => { const n = e.target.dataset.c; if (n == null) return; e.target.checked ? ocultas.delete(n) : ocultas.add(n); salvarCol(); aplicarColunas(); });
      pop.addEventListener('click', e => {
        const m = e.target.closest('[data-m]');
        if (m) {
          const ord = nomesAtuais(), i = ord.indexOf(m.dataset.c), j = i + Number(m.dataset.m);
          if (i < 0 || j < 0 || j >= ord.length) return;
          [ord[i], ord[j]] = [ord[j], ord[i]];
          MGColunas.definir(tab, ord); desenhar();
          const b = pop.querySelector(`[data-m="${m.dataset.m}"][data-c="${CSS.escape(m.dataset.c)}"]`); if (b && !b.disabled) b.focus();
          return;
        }
        const a = e.target.dataset.a; if (!a) return;
        if (a === 'todas') { ocultas.clear(); salvarCol(); aplicarColunas(); pop.querySelectorAll('input').forEach(i => i.checked = true); }
        if (a === 'padrao') { MGColunas.padrao(tab); desenhar(); }
        if (a === 'ok') pop.remove();
      });
      document.body.appendChild(pop);
      const r = btn.getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(window.innerWidth - 300, r.left + window.scrollX - 200)) + 'px';
      pop.style.top = (r.bottom + window.scrollY + 4) + 'px';
      const fora = ev => { if (!pop.contains(ev.target) && ev.target !== btn) { pop.remove(); document.removeEventListener('mousedown', fora); } };
      setTimeout(() => document.addEventListener('mousedown', fora), 0);
    }
    function salvarCol() { try { localStorage.setItem('mg-colunas-' + tabelaId, JSON.stringify([...ocultas])); } catch (e) {} }
    aplicar(z);
    // "Caber na largura" continua valendo quando a tabela é redesenhada ou a janela muda de tamanho
    tab._mgAposOrdem = aplicarColunas;   // depois que a ordem muda, as colunas escondidas são recalculadas
    new MutationObserver(() => { MGColunas.varrer(); aplicarColunas(); }).observe(tab, { childList: true });
    MGColunas.varrer(); aplicarColunas();
    window.addEventListener('resize', () => { if (ajusteAuto[tabelaId]) caber(); });
  }
  return { anexar };
})();

// Escolher numa lista digitando: ao digitar numa célula de lista (select), abre uma caixa de busca que filtra as opções
// por qualquer parte do texto (sem ligar para acentos/maiúsculas) ou pelo número da opção (1 = primeira da lista).
// Destaca (sublinhado) as partes do nome que batem com o que foi digitado, sem ligar para acentos/maiúsculas.
function realce(nome, q, esc) {
  nome = String(nome); if (!q) return esc(nome);
  const chars = [...nome].map(c => c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  if (chars.some(c => c.length !== 1)) return esc(nome);
  nome = [...nome]; const base = chars.join('');
  const marcas = new Array(nome.length).fill(false);
  q.split(/\s+/).filter(Boolean).forEach(p => { let i = base.indexOf(p); while (i >= 0) { for (let k = i; k < i + p.length; k++) marcas[k] = true; i = base.indexOf(p, i + 1); } });
  let h = '', dentro = false;
  for (let k = 0; k < nome.length; k++) { if (marcas[k] !== dentro) { h += marcas[k] ? '<u>' : '</u>'; dentro = marcas[k]; } h += esc(nome[k]); }
  return h + (dentro ? '</u>' : '');
}
window.MGEscolha = (function () {
  const css = document.createElement('style');
  css.textContent = `.mg-esc{position:absolute;z-index:95;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.22);padding:6px;width:300px;font:13px var(--sans)}
    .mg-esc input{width:100%;box-sizing:border-box;padding:5px 7px;border:1.5px solid var(--accent);border-radius:5px;font:inherit;background:var(--surface);color:var(--ink)}
    .mg-esc ul{list-style:none;margin:6px 0 0;padding:0;max-height:300px;overflow:auto}
    .mg-esc li{padding:4px 7px;border-radius:4px;cursor:pointer;display:flex;gap:8px}
    .mg-esc li b{min-width:22px;text-align:right;font:600 12px var(--mono);color:var(--muted)}
    .mg-esc li.on{background:var(--accent);color:var(--accent-ink)}.mg-esc li.on b{color:var(--accent-ink)}
    .mg-esc .vazio{padding:6px;color:var(--muted)}
    .mg-esc li u{text-decoration:none;background:color-mix(in srgb,var(--warn-bg) 85%,transparent);color:inherit;font-weight:700;border-radius:2px}.mg-esc li.on u{background:rgba(255,255,255,.25)}`;
  document.head.appendChild(css);
  const tira = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const marcados = [];   // [{tabela, seletor}]
  let pop = null;
  function usa(el) { return marcados.some(m => m.tabela.contains(el) && el.matches(m.seletor)); }
  function fechar(sel, voltar) { if (pop) { pop.remove(); pop = null; } if (voltar && sel && sel.isConnected) sel.focus({ preventScroll: true }); }
  function abrir(sel, inicial) {
    fechar();
    // opções com número: o número é a posição na lista (sem contar a opção vazia)
    const ops = [...sel.options].filter(o => o.value !== '').map((o, i) => {
      const m = o.text.match(/^(\d+)\s*·\s*(.*)$/);
      return { valor: o.value, num: m ? m[1] : String(i + 1), nome: m ? m[2] : o.text };
    });
    pop = document.createElement('div');
    pop.className = 'mg-esc';
    pop.innerHTML = '<input type="text" placeholder="Digite parte do nome ou o número" aria-label="Buscar opção"><ul></ul>';
    document.body.appendChild(pop);
    const r = sel.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 310, r.left + window.scrollX)) + 'px';
    pop.style.top = (r.bottom + window.scrollY + 2) + 'px';
    const inp = pop.querySelector('input'), ul = pop.querySelector('ul');
    let lista = [], ativo = 0;
    function filtrar() {
      const q = tira(inp.value);
      if (!q) lista = ops.slice();
      else if (/^\d+$/.test(q)) lista = ops.filter(o => o.num === q).concat(ops.filter(o => o.num !== q && o.num.startsWith(q)));
      else {
        const palavras = q.split(/\s+/);
        const peso = o => { const t = tira(o.nome); return t.startsWith(q) ? 0 : t.split(/[\s(\-/]+/).some(w => w.startsWith(palavras[0])) ? 1 : 2; };
        lista = ops.filter(o => { const t = tira(o.nome); return palavras.every(p => t.includes(p)); })
          .sort((a, b) => peso(a) - peso(b) || Number(a.num) - Number(b.num));
      }
      ativo = Math.max(0, lista.findIndex(o => o.valor === sel.value && !q));
      desenhar();
    }
    function desenhar() {
      const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const q = tira(inp.value), marca = nome => realce(nome, /^\d+$/.test(q) ? '' : q, esc);
      ul.innerHTML = lista.length ? lista.map((o, i) => `<li data-i="${i}" class="${i === ativo ? 'on' : ''}"><b>${o.num}</b><span>${marca(o.nome)}</span></li>`).join('')
        : '<li class="vazio">Nenhuma opção com esse texto</li>';
      const on = ul.querySelector('li.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function escolher(o) {
      fechar(sel, true);
      if (!o || sel.value === o.valor) return;
      sel.value = o.valor;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    inp.addEventListener('input', filtrar);
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.length) { ativo = (ativo + 1) % lista.length; desenhar(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (lista.length) { ativo = (ativo - 1 + lista.length) % lista.length; desenhar(); } }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (lista[ativo]) escolher(lista[ativo]); else fechar(sel, true); }
      else if (e.key === 'Escape') { e.preventDefault(); fechar(sel, true); }
    });
    ul.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); escolher(lista[+li.dataset.i]); } });
    inp.addEventListener('blur', () => setTimeout(() => { if (pop && !pop.contains(document.activeElement)) fechar(); }, 0));
    inp.value = inicial || '';
    filtrar();
    inp.focus();
  }
  function anexar(tabela, seletor) {
    if (!tabela) return;
    marcados.push({ tabela, seletor });
    tabela.addEventListener('keydown', e => {
      const el = e.target;
      if (!el.matches || !el.matches(seletor) || el.disabled || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Enter') { e.preventDefault(); abrir(el, ''); return; }
      if (e.key.length === 1 && e.key !== ' ') { e.preventDefault(); abrir(el, e.key); }
    }, true);
    // clique com o mouse também abre a lista com busca (a lista nativa do navegador pula para o 10 ao digitar 1)
    tabela.addEventListener('mousedown', e => {
      const el = e.target.closest && e.target.closest('select');
      if (!el || !el.matches(seletor) || el.disabled || e.button !== 0) return;
      e.preventDefault();
      el.focus({ preventScroll: true });
      abrir(el, '');
    }, true);
  }
  return { anexar, usa, abrir };
})();

// Sugestões num campo de texto (sem impedir que se digite outra coisa): ao digitar, ou ao clicar, aparece uma lista
// filtrada por qualquer parte do texto ou pelo número. ↑ ↓ escolhem, Enter usa a sugestão marcada, Esc fecha a lista
// (aí Enter/Tab ficam com o que foi digitado). A última linha permite adicionar o texto digitado ao menu.
window.MGSugere = (function () {
  const tira = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const escH = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let pop = null, alvo = null, lista = [], ativo = -1, cfg = null, extra = null;
  function aberto(el) { return !!pop && (!el || el === alvo); }
  function fechar() { if (pop) pop.remove(); pop = null; alvo = null; lista = []; ativo = -1; extra = null; }
  function desenhar() {
    const q = alvo ? tira(alvo.value) : '';
    const linhas = lista.map((o, i) => `<li data-i="${i}" class="${i === ativo ? 'on' : ''}"><b>${o.num}</b><span>${realce(o.nome, /^\d+$/.test(q) ? '' : q, escH)}</span></li>`);
    if (extra) linhas.push(`<li data-i="add" class="${ativo === lista.length ? 'on' : ''}"><b>＋</b><span>Adicionar “${escH(extra)}” ao menu</span></li>`);
    pop.querySelector('ul').innerHTML = linhas.join('') || '<li class="vazio">Sem opções no menu: digite livremente</li>';
    if (pop.querySelector('.dica')) pop.querySelector('.dica').textContent = cfg.titulo ? cfg.titulo(alvo) : '';
    const on = pop.querySelector('li.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function filtrar(todos) {
    const f = cfg.fonte(alvo) || { itens: [] };
    const ops = (f.itens || []).map((nome, i) => ({ nome, num: String(i + 1) }));
    const q = todos ? '' : tira(alvo.value);
    if (!q) lista = ops;
    else if (/^\d+$/.test(q)) lista = ops.filter(o => o.num === q).concat(ops.filter(o => o.num !== q && (o.num.startsWith(q) || tira(o.nome).includes(q))));
    else { const ps = q.split(' '); const peso = o => { const t = tira(o.nome); return t.startsWith(q) ? 0 : t.split(/[\s(\-/]+/).some(w => w.startsWith(ps[0])) ? 1 : 2; };
      lista = ops.filter(o => ps.every(p => tira(o.nome).includes(p))).sort((a, b) => peso(a) - peso(b) || Number(a.num) - Number(b.num)); }
    const exato = q && ops.some(o => tira(o.nome) === q);
    extra = (f.podeAdicionar && q && !exato && !/^\d+$/.test(q)) ? alvo.value.replace(/\s+/g, ' ').trim() : null;
    ativo = q ? (lista.length ? 0 : -1) : Math.max(-1, lista.findIndex(o => tira(o.nome) === tira(alvo.value)));
    if (!lista.length && !extra) { if (pop) { pop.remove(); pop = null; } return; }
    if (!pop) {
      pop = document.createElement('div'); pop.className = 'mg-esc mg-sug';
      pop.innerHTML = '<div class="dica muted" style="font-size:11.5px;padding:0 4px 4px"></div><ul style="margin:0"></ul><div class="muted" style="font-size:11px;padding:4px 4px 0">Enter usa a marcada · Esc fecha e mantém o que você digitou</div>';
      document.body.appendChild(pop);
      pop.addEventListener('mousedown', e => { e.preventDefault(); const li = e.target.closest('li[data-i]'); if (li) usar(li.dataset.i === 'add' ? 'add' : +li.dataset.i); });
    }
    const r = alvo.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 310, r.left + window.scrollX)) + 'px';
    pop.style.top = (r.bottom + window.scrollY + 2) + 'px';
    desenhar();
  }
  async function usar(i) {
    const el = alvo, c = cfg;
    if (i === 'add') {
      const nome = extra; fechar();
      if (c.adicionar) { try { await c.adicionar(el, nome); } catch (e) { console.warn(e); } }
      el.value = nome;
    } else { const o = lista[i]; fechar(); if (!o) return; el.value = o.nome; }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.focus({ preventScroll: true });
  }
  function anexar(container, seletor, opcoes) {
    if (!container) return;
    const abrir = (el, todos) => { alvo = el; cfg = opcoes; filtrar(todos); };
    container.addEventListener('input', e => { const el = e.target; if (el.matches && el.matches(seletor)) abrir(el, false); });
    container.addEventListener('mousedown', e => { const el = e.target; if (el.matches && el.matches(seletor) && !el.disabled) setTimeout(() => abrir(el, true), 0); });
    container.addEventListener('keydown', e => {
      const el = e.target; if (!el.matches || !el.matches(seletor)) return;
      if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); e.stopPropagation(); abrir(el, true); return; }
      if (!aberto(el)) return;
      const n = lista.length + (extra ? 1 : 0);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); if (n) { ativo = e.key === 'ArrowDown' ? (ativo + 1) % n : (ativo - 1 + n) % n; desenhar(); } }
      else if (e.key === 'Enter' && ativo >= 0) { e.preventDefault(); e.stopPropagation(); usar(ativo === lista.length ? 'add' : ativo); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
      else if (e.key === 'Tab' || e.key === 'Enter') fechar();
    }, true);
    container.addEventListener('focusout', e => { if (e.target === alvo) setTimeout(() => { if (alvo === e.target && document.activeElement !== e.target) fechar(); }, 0); });
  }
  window.addEventListener('resize', fechar);
  return { anexar, aberto, fechar };
})();

// Texto maior que a célula: ao CLICAR, abre uma caixa junto da célula com todo o conteúdo (editável se o campo for editável).
// Ao sair da caixa (clicar fora, Tab, Enter ou Esc), ela fecha e a célula volta ao tamanho normal.
// Pelo teclado (setas) nada abre, para não atrapalhar a navegação entre as células.
window.MGExpande = (function () {
  const css = document.createElement('style');
  css.textContent = `.mg-exp{position:absolute;z-index:96;box-sizing:border-box;background:var(--surface,#fff);color:var(--ink,#111);border:2px solid var(--accent,#1D5E8A);border-radius:6px;box-shadow:0 10px 28px rgba(0,0,0,.25);font:inherit;font-size:13px;line-height:1.4;padding:6px 8px;white-space:pre-wrap;overflow:auto}
    textarea.mg-exp{resize:vertical;outline:none}
    .mg-exp-dica{position:absolute;z-index:97;font:11px system-ui,sans-serif;color:var(--muted,#666);background:var(--surface,#fff);padding:1px 6px;border-radius:4px}`;
  document.head.appendChild(css);
  let aberto = null;
  const transborda = el => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2;
  function posicionar(caixa, ref) {
    const r = ref.getBoundingClientRect();
    const larg = Math.min(Math.max(r.width, 360), 560, window.innerWidth - 16);
    caixa.style.width = larg + 'px';
    caixa.style.left = Math.max(8, Math.min(window.innerWidth - larg - 8, r.left)) + window.scrollX + 'px';
    caixa.style.top = (r.top + window.scrollY - 2) + 'px';
  }
  function fechar(confirmar) {
    if (!aberto) return;
    const { caixa, dica, el, original } = aberto; aberto = null;
    caixa.remove(); if (dica) dica.remove();
    if (el && caixa.tagName === 'TEXTAREA') {
      if (!confirmar) el.value = original;
      else if (el.value !== original) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }
  function abrirEditor(el) {
    const ta = document.createElement('textarea');
    ta.className = 'mg-exp'; ta.value = el.value; ta.spellcheck = false;
    document.body.appendChild(ta); posicionar(ta, el);
    const ajustar = () => { ta.style.height = 'auto'; ta.style.height = Math.min(320, Math.max(el.getBoundingClientRect().height + 4, ta.scrollHeight + 4)) + 'px'; };
    ajustar();
    const dica = document.createElement('div'); dica.className = 'mg-exp-dica';
    dica.textContent = el.tagName === 'TEXTAREA' ? 'Esc cancela · clique fora para salvar' : 'Enter salva · Shift+Enter quebra linha · Esc cancela';
    document.body.appendChild(dica);
    const rr = ta.getBoundingClientRect(); dica.style.left = (rr.left + window.scrollX + 6) + 'px'; dica.style.top = (rr.bottom + window.scrollY + 2) + 'px';
    aberto = { caixa: ta, dica, el, original: el.value };
    ta.addEventListener('input', () => { el.value = el.tagName === 'TEXTAREA' ? ta.value : ta.value.replace(/\s*\n\s*/g, ' '); ajustar(); const r2 = ta.getBoundingClientRect(); dica.style.top = (r2.bottom + window.scrollY + 2) + 'px'; });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); fechar(false); el.focus({ preventScroll: true }); }
      else if ((e.key === 'Enter' && !e.shiftKey && el.tagName !== 'TEXTAREA') || e.key === 'Tab') { e.preventDefault(); fechar(true); el.focus({ preventScroll: true }); }
      e.stopPropagation();
    });
    ta.addEventListener('blur', () => setTimeout(() => { if (aberto && aberto.caixa === ta) fechar(true); }, 0));
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  }
  function abrirLeitura(ref, texto) {
    const d = document.createElement('div'); d.className = 'mg-exp'; d.tabIndex = -1; d.textContent = texto;
    d.style.maxHeight = '320px';
    document.body.appendChild(d); posicionar(d, ref);
    aberto = { caixa: d };
    d.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(false); });
    d.focus({ preventScroll: true });
    d.addEventListener('blur', () => setTimeout(() => { if (aberto && aberto.caixa === d) fechar(false); }, 0));
  }
  document.addEventListener('mousedown', e => { if (aberto && !aberto.caixa.contains(e.target)) fechar(true); }, true);
  window.addEventListener('resize', () => fechar(true));
  document.addEventListener('click', e => {
    if (aberto || e.button !== 0) return;
    const t = e.target; if (!t.closest || !t.closest('td') || t.closest('.mg-exp')) return;
    const campo = t.closest('input, textarea');
    if (campo) {
      if (campo.tagName === 'INPUT' && !/^(text|search|)$/.test(campo.type)) return;
      if (!transborda(campo)) return;
      if (campo.disabled || campo.readOnly) { abrirLeitura(campo, campo.value); return; }
      if (window.MGSugere) MGSugere.fechar();
      abrirEditor(campo); return;
    }
    if (t.closest('button, select, a, label')) return;
    const td = t.closest('td');
    if (td.querySelector('input, select, textarea, button')) return;
    if (transborda(td) && td.textContent.trim()) abrirLeitura(td, td.innerText.trim());
  });
  return { fechar };
})();
