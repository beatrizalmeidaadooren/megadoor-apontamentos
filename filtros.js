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
      <button class="btn" type="button" data-z="col" title="Escolher quais colunas aparecem">Colunas</button>`;
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
    const nomeTh = th => th.childNodes[0] ? String(th.childNodes[0].textContent).trim() : th.textContent.trim();
    function aplicarColunas() {
      const ths = [...tab.querySelectorAll('thead th')];
      estilo.textContent = ths.map((th, i) => ocultas.has(nomeTh(th)) ? `#${tabelaId} tr > :nth-child(${i + 1}){display:none}` : '').join('\n');
      if (ajusteAuto[tabelaId]) requestAnimationFrame(caber);
    }
    function colunas(btn) {
      const velho = document.querySelector('.fpop'); if (velho) velho.remove();
      const ths = [...tab.querySelectorAll('thead th')].map(nomeTh).filter(Boolean);
      const pop = document.createElement('div');
      pop.className = 'fpop';
      pop.innerHTML = '<b>Colunas visíveis</b><div class="flista" style="margin-top:6px">' +
        ths.map(n => `<label><input type="checkbox" data-c="${n.replace(/"/g, '&quot;')}" ${ocultas.has(n) ? '' : 'checked'}> <span>${n}</span></label>`).join('') +
        '</div><div class="facoes"><button class="btn small" type="button" data-a="todas">Mostrar todas</button><button class="btn small primary" type="button" data-a="ok">Fechar</button></div>';
      pop.addEventListener('change', e => { const n = e.target.dataset.c; if (n == null) return; e.target.checked ? ocultas.delete(n) : ocultas.add(n); salvarCol(); aplicarColunas(); });
      pop.addEventListener('click', e => {
        const a = e.target.dataset.a; if (!a) return;
        if (a === 'todas') { ocultas.clear(); salvarCol(); aplicarColunas(); pop.querySelectorAll('input').forEach(i => i.checked = true); }
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
    new MutationObserver(() => { aplicarColunas(); }).observe(tab, { childList: true });
    aplicarColunas();
    window.addEventListener('resize', () => { if (ajusteAuto[tabelaId]) caber(); });
  }
  return { anexar };
})();
