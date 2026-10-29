// Partes comuns a todas as páginas do sistema Megadoor.
// Conexão com o Supabase, sessão de login e leitura de tabelas grandes em partes.
window.MG = (function () {
  const URL = 'https://bdohqikuaoxlhjwexlqd.supabase.co';
  const CHAVE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkb2hxaWt1YW94bGhqd2V4bHFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxOTEzMzUsImV4cCI6MjEwODc2NzMzNX0.TNJ7zQwTDi1XddJ6MHQ7qA1WzTHfbR26RpIQqnAnbyM';
  const DONA = 'beatriz.almeida@adooren.com';
  const sb = supabase.createClient(URL, CHAVE);

  async function sessao() {
    const { data } = await sb.auth.getSession();
    return data.session || null;
  }

  function ehDona(sess) {
    return !!sess && (sess.user.email || '').toLowerCase() === DONA;
  }

  // Lê todas as linhas de uma tabela, de 1000 em 1000 (limite do Supabase), várias partes ao mesmo tempo.
  // filtro: função que recebe a consulta e devolve a consulta com os filtros aplicados.
  async function buscarTudo(tabela, colunas, filtro, ordem, aoProgresso) {
    const PASSO = 1000, JUNTOS = 6;
    filtro = filtro || (q => q);
    ordem = ordem || 'nreg';
    const cont = await filtro(sb.from(tabela).select(ordem, { count: 'exact', head: true }));
    if (cont.error) throw new Error(tabela + ': ' + cont.error.message);
    const total = cont.count || 0;
    const partes = [];
    for (let i = 0; i < total; i += PASSO) partes.push(i);
    const saida = new Array(partes.length);
    let feitas = 0;
    for (let k = 0; k < partes.length; k += JUNTOS) {
      await Promise.all(partes.slice(k, k + JUNTOS).map(async (ini, j) => {
        const r = await filtro(sb.from(tabela).select(colunas)).order(ordem, { ascending: true }).range(ini, ini + PASSO - 1);
        if (r.error) throw new Error(tabela + ': ' + r.error.message);
        saida[k + j] = r.data || [];
        feitas++;
        if (aoProgresso) aoProgresso(Math.min(total, feitas * PASSO), total);
      }));
    }
    return saida.flat();
  }

  return { sb, sessao, ehDona, buscarTudo, DONA };
})();
