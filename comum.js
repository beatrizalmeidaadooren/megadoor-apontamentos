// Partes comuns a todas as páginas do sistema Megadoor.
// Conexão com o Supabase, sessão de login e leitura de tabelas grandes em partes.
window.MG = (function () {
  const URL = 'https://bdohqikuaoxlhjwexlqd.supabase.co';
  const CHAVE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkb2hxaWt1YW94bGhqd2V4bHFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxOTEzMzUsImV4cCI6MjEwODc2NzMzNX0.TNJ7zQwTDi1XddJ6MHQ7qA1WzTHfbR26RpIQqnAnbyM';
  const DONA = 'beatriz.almeida@adooren.com';
  // Lê o link do e-mail (criar/trocar senha) ANTES de o Supabase limpar o endereço.
  const HASH = new URLSearchParams(location.hash.slice(1));
  const QUERY = new URLSearchParams(location.search);
  const linkTipo = HASH.get('type') || QUERY.get('type');
  const linkErro = HASH.get('error_code') || HASH.get('error') || QUERY.get('error_code') || QUERY.get('error');
  const linkTokenHash = QUERY.get('token_hash');
  const VERSAO = '2026-10-30a';
  const sb = supabase.createClient(URL, CHAVE);

  // Link de e-mail no formato com token_hash (outros modelos de e-mail do Supabase): valida aqui.
  const pronto = (async () => {
    if (linkTokenHash && linkTipo) {
      const { error } = await sb.auth.verifyOtp({ token_hash: linkTokenHash, type: linkTipo });
      history.replaceState(null, '', location.pathname);
      return error ? error.message : null;
    }
    return null;
  })();

  async function sessao() {
    const { data } = await sb.auth.getSession();
    return data.session || null;
  }

  function ehDona(sess) {
    return !!sess && (sess.user.email || '').toLowerCase() === DONA;
  }

  // Lê todas as linhas de uma tabela, de 1000 em 1000 (limite do Supabase), várias partes ao mesmo tempo.
  // filtro: função que recebe a consulta e devolve a consulta com os filtros aplicados.
  // ordem: coluna ou lista de colunas; a última precisa identificar a linha (senão a paginação pode repetir/perder linhas).
  async function buscarTudo(tabela, colunas, filtro, ordem, aoProgresso) {
    const PASSO = 1000, JUNTOS = 6;
    filtro = filtro || (q => q);
    const ords = [].concat(ordem || 'nreg');
    const cont = await filtro(sb.from(tabela).select(ords[0], { count: 'exact', head: true }));
    if (cont.error) throw new Error(tabela + ': ' + cont.error.message);
    const total = cont.count || 0;
    const partes = [];
    for (let i = 0; i < total; i += PASSO) partes.push(i);
    const saida = new Array(partes.length);
    let feitas = 0;
    for (let k = 0; k < partes.length; k += JUNTOS) {
      await Promise.all(partes.slice(k, k + JUNTOS).map(async (ini, j) => {
        let q = filtro(sb.from(tabela).select(colunas));
        ords.forEach(c => { q = q.order(c, { ascending: true }); });
        const r = await q.range(ini, ini + PASSO - 1);
        if (r.error) throw new Error(tabela + ': ' + r.error.message);
        saida[k + j] = r.data || [];
        feitas++;
        if (aoProgresso) aoProgresso(Math.min(total, feitas * PASSO), total);
      }));
    }
    const tudo = saida.flat();
    if (tudo.length < total) throw new Error(tabela + `: leitura incompleta (${tudo.length} de ${total}). Clique em Atualizar.`);
    return tudo;
  }

  return { sb, sessao, ehDona, buscarTudo, DONA, linkTipo, linkErro, pronto, VERSAO };
})();
