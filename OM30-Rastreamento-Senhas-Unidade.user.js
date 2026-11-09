// ==UserScript==
// @name         OM30 - Rastreamento de Senhas | Minha Unidade
// @namespace    https://om30.com.br/
// @version      1.3.1
// @description  Rastreamento de senhas só da unidade logada, nas últimas 24 horas, com a situação de cada atendimento (aguardando com quantos na frente, chamado, em atendimento, finalizado, ausente) na fila médica e nas salas. A unidade é confirmada pelo número do atendimento no histórico do munícipe, com a ficha PDF como reserva.
// @author       Pedro Sampaio - Samp
// @updateURL    https://raw.githubusercontent.com/pdrjsampaio/om30-userscripts/main/OM30-Rastreamento-Senhas-Unidade.user.js
// @downloadURL  https://raw.githubusercontent.com/pdrjsampaio/om30-userscripts/main/OM30-Rastreamento-Senhas-Unidade.user.js
// @match        https://guaruja.saudesimples.net/filas/rastreamento_senhas*
// @match        https://guarujahomolog.saudesimples.net/filas/rastreamento_senhas*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  // v1.3.1:
  // - Histórico de chamadas por senha (Worker om30-senhas): embaixo da senha, "Chamada 3× · Fulano · 10:42"
  //   (laranja quando 2× ou mais); passando o mouse, todas as chamadas (horário · setor · quem · guichê).
  //   Leitura incremental (só o que entrou desde a última vez), guardada no navegador; não busca com a aba escondida.
  //   Desligado enquanto SENHAS_API/SENHAS_KEY estiverem vazios.
  //
  // v1.2.7 (candidata, não publicada):
  // - No F5, o último status conhecido de cada senha reaparece na hora (acolhimento, salas,
  //   fila e ausentes ficam guardados por até 20 min). O script atualiza por trás, sem encher
  //   a tela de "Verificando" a cada recarga.
  //
  // v1.2.6 (candidata, não publicada):
  // - Status "Enfermeiro" = triagem. Quem já foi chamado pela enfermeira sai da lista de espera
  //   do acolhimento; agora entra como Acolhimento · Em atendimento, não mais "Atendido".
  //   O enfermeiro não faz atendimento médico, então nunca é tratado como fila médica.
  //
  // v1.2.5 (candidata, não publicada):
  // - A coluna Setor mostra "Acolhimento" para quem está na triagem, em vez do texto cru do
  //   sistema ("Enfermeiro" / "Médico clínico" da fila pré-enfileirada).
  //
  // v1.2.4 (candidata, não publicada):
  // - Quem está na triagem aparece pré-enfileirado na fila médica ao mesmo tempo. O acolhimento
  //   agora tem prioridade: enquanto está na triagem, mostra Acolhimento e a posição do acolhimento,
  //   não "Médico clínico". Só vira fila médica depois que sai do acolhimento.
  //
  // v1.2.3 (candidata, não publicada):
  // - Setor da triagem aparece como "Acolhimento" (o sistema chama de "Enfermeiro").
  //   Quem está na fila do acolhimento também é rotulado Acolhimento, qualquer que seja o texto.
  // - "Controle de Salas - Procedimentos de Enfermagem" agora conta como Salas, não Enfermagem.
  //
  // v1.2.2 (candidata, não publicada):
  // - Fila do acolhimento: o backend devolve no máximo 10 por página e ignora per_page.
  //   Agora pagina até acabar (antes lia só os 10 primeiros; da 11ª posição em diante
  //   a triagem caía em "Atendido" por engano).
  //
  // v1.2.1 (candidata, não publicada):
  // - Acolhimento/triagem: lê a fila do acolhimento (/acolhimentos.json), igual à fila médica.
  //   Antes, quem estava na triagem (status "Enfermeiro") caía no "Atendido" por engano, porque
  //   o script não conhecia essa fila. Agora mostra Aguardando/Chamado e "N na frente".
  // - "Atendido" só é afirmado quando fila médica, acolhimento e ausentes foram lidos.
  //
  // v1.2.0 (candidata, não publicada):
  // - Salas (Medicação, Exames, Raio-X, Procedimentos de Enfermagem, Gesso): lê a fila da sala
  //   (Em Espera / Em Andamento) e o histórico (Finalizado / Cancelado) pelo número do atendimento.
  //   Quem está numa sala deixa de aparecer só como "Sala · Raio-x": mostra se espera, está sendo
  //   atendido ou já foi finalizado.
  // - "N na frente": quem aguarda na fila médica (pela especialidade) ou numa sala.
  // - Horário de saída: quando a tela vê a pessoa sair da fila/sala, guarda "saiu ~HH:MM".
  //   Se o histórico da sala trouxer o horário de finalização, usa esse.
  // - OM30Rastreamento.diagnostico() mostra o estado de cada sala e os nomes dos campos do histórico.
  //
  // v1.1.0:
  // - Só a unidade logada: sem opção de ver outras unidades. Os filtros nativos (que mudam a
  //   lista no servidor) ficam ocultos; a busca da barra substitui.
  // - Memória: a lista das últimas 24h fica salva no navegador. Ao voltar para a tela ela
  //   aparece na hora e só é atualizada por trás (nada é "recontado" na frente do usuário).
  // - Situação de cada atendimento, pelas filas da própria unidade:
  //     Aguardando / Chamado = ainda está na fila (/prontuarios.json, todas as ocupações);
  //     Ausente              = está na lista de ausentes da fila (/prontuarios?ausentes=true);
  //     Atendido             = saiu da fila sem ser ausente, ou já está em sala/farmácia.
  //   Não abre prontuário nem imprime nada: só lê as listas.
  // - Visual novo: cards de situação (filtram), setores, espera de quem aguarda.
  //
  // v1.0.0:
  // - Rastreamento só da unidade logada, 24h. Unidade confirmada pelo número do atendimento no
  //   histórico do munícipe (nome + nascimento só geram candidatos), ficha PDF como reserva.

  if (window.__OM30_RASTREAMENTO_UNIDADE__) return;
  window.__OM30_RASTREAMENTO_UNIDADE__ = true;

  const VERSAO = (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.3.1';
  const PREFIX = 'om30-rastreamento-unidade';
  const JANELA_MS = 24 * 60 * 60 * 1000;
  const POR_PAGINA = 100;
  const PAGINAS_PARALELAS = 3;
  const MAX_PAGINAS = 45;
  const CONSULTAS_PARALELAS = 6;
  const ATUALIZAR_MS = 60 * 1000;
  const RECARREGAR_TUDO_MS = 15 * 60 * 1000;
  const AUSENTES_MS = 5 * 60 * 1000;
  const FILAS_MS = 2 * 60 * 1000;
  const ACOLH_MS = 90 * 1000;
  const SALAS_MS = 2 * 60 * 1000;
  const RESTAURA_MS = 20 * 60 * 1000;   // F5: reaproveita o último status por até 20 min
  const STORAGE_SAIDAS = `${PREFIX}:saidas-v1`;
  // Filas do Controle de Salas: cada item traz atendimento_str "AtendimentoPa#ID".
  const SALAS_LISTA = [
    { key: 'medicacao',   nome: 'Medicação',   url: '/aplicacoes_medicamentos?format=json',                rx: /MEDICAC/ },
    { key: 'exames',      nome: 'Exames',      url: '/encaminhamentos_exames?format=json',                 rx: /EXAME/ },
    { key: 'radiografia', nome: 'Raio-X',      url: '/encaminhamentos_radiografias?format=json',           rx: /RAIO|RADIOGRAF/ },
    { key: 'enfermagem',  nome: 'Procedimentos de Enfermagem', url: '/encaminhamentos_procedimentos_enfermagem?format=json', rx: /PROCEDIMENTO|ENFERMAGEM/ },
    { key: 'gesso',       nome: 'Gesso',       url: '/encaminhamentos_gessos_imobilizacoes?format=json',   rx: /GESSO|IMOBILIZ/ }
  ];
  // Mesmos valores do filtro de status do Controle de Salas (histórico).
  const STATUS_HISTORICO_SALA = { 3: 'Cancelado', 4: 'Finalizado' };
  const RISCO_ORDEM = { VERMELHO: 0, LARANJA: 1, AMARELO: 2, VERDE: 3, AZUL: 4 };
  const MAX_PAGINAS_AUSENTES = 15;
  const REPETIR_FALHA_MS = 10 * 60 * 1000;
  const CACHE_UNIDADE_MS = 3 * 24 * 60 * 60 * 1000;
  const STORAGE_CACHE = `${PREFIX}:unidades-v1`;
  const STORAGE_LINHAS = `${PREFIX}:linhas-v1`;
  const TABELA_NATIVA = '#rastreamento-senhas-datatable';
  const BARRA_ID = `${PREFIX}-barra`;
  const CAIXA_ID = `${PREFIX}-caixa`;
  const STYLE_ID = `${PREFIX}-css`;

  // Ocupações das filas de atendimento do PA (select "Especialidade" da fila nativa, Guarujá).
  const OCUPACOES_FILA = [433, 432, 436, 352, 384, 923, 928, 931, 357, 377, 364, 399, 409, 652, 662];

  // Setor atual pelo texto do status nativo. A primeira regra que casar vale.
  const SETORES = [
    // Ordem importa (primeira regra que casar vale). SALAS antes de ACOLHIMENTO para que
    // "Controle de Salas - Procedimentos de Enfermagem" não caia em Acolhimento.
    { key: 'MEDICO',      label: 'Médico',      cor: '#1f6fb2', rx: /FILA DE ATENDIMENTO - MEDIC/ },
    { key: 'SALAS',       label: 'Salas',       cor: '#e67700', rx: /CONTROLE DE SALAS/ },
    { key: 'ACOLHIMENTO', label: 'Acolhimento', cor: '#2b8a3e', rx: /ENFERM|ACOLHIM|TRIAGEM/ },
    { key: 'DENTISTA',    label: 'Dentista',    cor: '#0c8599', rx: /DENTIST|ODONTO/ },
    { key: 'FARMACIA',    label: 'Farmácia',    cor: '#7048e8', rx: /FARMACIA/ },
    { key: 'OUTROS',      label: 'Outros',      cor: '#868e96', rx: /./ }
  ];
  const SITUACOES = [
    { key: 'AGUARDANDO', label: 'Aguardando', cor: '#e67700' },
    { key: 'CHAMADO',    label: 'Chamado',    cor: '#1f6fb2' },
    { key: 'ANDAMENTO',  label: 'Em atendimento', cor: '#1971c2' },
    { key: 'ATENDIDO',   label: 'Atendido',   cor: '#2b8a3e' },
    { key: 'FINALIZADO', label: 'Finalizado', cor: '#2b8a3e' },
    { key: 'CANCELADO',  label: 'Cancelado',  cor: '#868e96' },
    { key: 'AUSENTE',    label: 'Ausente',    cor: '#c92a2a' },
    { key: 'VERIFICANDO', label: 'Verificando', cor: '#adb5bd' }
  ];
  const SITUACAO = Object.fromEntries(SITUACOES.map(s => [s.key, s]));
  // Cor da etiqueta da senha pelo prefixo (PF preferencial, RT retorno, DT dentista, EM emergência).
  const COR_SENHA = { PF: '#e8590c', RT: '#7048e8', DT: '#0c8599', EM: '#c92a2a' };

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const norm = v => clean(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const horarioCurto = (ms = Date.now()) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dataBr = ms => new Date(ms).toLocaleDateString('pt-BR');
  const tituloCaso = v => clean(v).toLowerCase()
    .replace(/(^|\s)(\S)/g, (m, e, c) => e + c.toUpperCase())
    .replace(/\s(De|Da|Do|Das|Dos|E)(?=\s)/g, m => m.toLowerCase());

  function duracao(ms) {
    const min = Math.max(0, Math.floor(ms / 60000));
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h}h ${m}min` : `${h}h`;
  }

  // Células do DataTables vêm como HTML; DOMParser não executa nada.
  const parser = new DOMParser();
  function textoHtml(v) {
    const s = String(v ?? '');
    if (!/[<&]/.test(s)) return clean(s);
    return clean(parser.parseFromString(s, 'text/html').body.textContent);
  }

  function instanteLinha(data, hora) {
    const d = clean(data).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!d) return 0;
    const h = clean(hora).match(/^(\d{1,2}):(\d{2})/);
    return new Date(+d[3], +d[2] - 1, +d[1], h ? +h[1] : 0, h ? +h[2] : 0).getTime();
  }

  // Unidade logada: o link "trocar unidade" do topo mostra o nome completo.
  function unidadeLogada() {
    return clean(document.querySelector('a[href*="trocar_unidade_saude"]')?.textContent);
  }

  // O histórico traz o nome completo ("... GUARUJA"); a ficha PDF pode cortar o fim.
  function mesmaUnidade(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    return Math.min(x.length, y.length) >= 15 && (x.startsWith(y) || y.startsWith(x));
  }

  const setorDe = status => SETORES.find(s => s.rx.test(norm(status)));
  const SETOR_ACOLH = SETORES.find(s => s.key === 'ACOLHIMENTO');
  // Quem está na fila do acolhimento é Acolhimento, qualquer que seja o texto do status nativo.
  const setorLinha = l => (acolh.ok && acolh.porId.has(l.id)) ? SETOR_ACOLH : setorDe(l.status);

  async function lerJson(url) {
    const r = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
    const txt = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    try { return JSON.parse(txt); } catch {
      throw new Error(/type=["']?password|usuarios\/login/i.test(txt) ? 'sessao' : 'resposta inválida');
    }
  }

  const lerLocal = (chave, padrao) => { try { return JSON.parse(localStorage.getItem(chave) || 'null') ?? padrao; } catch { return padrao; } };
  const gravarLocal = (chave, valor) => { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {} };

  // ---------------------------------------------------------------------------
  // Memória: unidade por atendimento (3 dias) e a lista das últimas 24h
  // ---------------------------------------------------------------------------

  function lerCache() {
    const bruto = lerLocal(STORAGE_CACHE, {});
    const limite = Date.now() - CACHE_UNIDADE_MS;
    for (const [id, v] of Object.entries(bruto)) if (!v?.u || !(v.t > limite)) delete bruto[id];
    return bruto;
  }
  let cache = lerCache();
  let timerCache = null;
  function gravarCacheDepois() {
    clearTimeout(timerCache);
    timerCache = setTimeout(() => gravarLocal(STORAGE_CACHE, cache), 1500);
  }

  const CAMPOS_LINHA = ['id', 'data', 'hora', 'nascimento', 'nome', 'ficha', 'senha', 'status'];
  function salvarLinhas() {
    gravarLocal(STORAGE_LINHAS, {
      completa: ultimaCompleta, atualizada: ultimaAtualizacao,
      linhas: [...linhas.values()].map(l => CAMPOS_LINHA.map(c => l[c])),
      filas: filas.ok ? { at: filas.at, itens: [...filas.porId].map(([id, v]) => [id, v.chamado ? 1 : 0, v.frente, v.fila]) } : null,
      acolh: acolh.ok ? { at: acolh.at, itens: [...acolh.porId].map(([id, v]) => [id, v.chamado ? 1 : 0, v.frente]) } : null,
      salas: salas.ok ? { at: salas.at, estado: salas.estado, campos: salas.camposHistorico, itens: [...salas.porId] } : null,
      ausentes: ausentes.ok ? { at: ausentes.at, ids: [...ausentes.ids] } : null
    });
  }
  // Filas e ausentes salvos só valem se recentes: senão a situação espera a próxima leitura.
  function lerLinhasSalvas() {
    const s = lerLocal(STORAGE_LINHAS, null);
    const corte = Date.now() - JANELA_MS;
    const mapa = new Map();
    for (const arr of Array.isArray(s?.linhas) ? s.linhas : []) {
      const l = Object.fromEntries(CAMPOS_LINHA.map((c, i) => [c, arr[i]]));
      l.instante = instanteLinha(l.data, l.hora);
      if (l.id && l.instante >= corte) mapa.set(String(l.id), l);
    }
    // Mantém o último status por até 20 min, pra o F5 não zerar tudo em "Verificando".
    const vivo = at => Number(at) > 0 && Date.now() - Number(at) < RESTAURA_MS;
    if (vivo(s?.filas?.at)) {
      const porId = new Map();
      for (const [id, chamado, frente, fila] of Array.isArray(s.filas.itens) ? s.filas.itens : [])
        porId.set(String(id), { chamado: !!chamado, frente: Number.isFinite(frente) ? frente : null, fila: fila || '' });
      filas = { ok: true, at: Number(s.filas.at), porId };
    }
    if (vivo(s?.acolh?.at)) {
      const porId = new Map();
      for (const [id, chamado, frente] of Array.isArray(s.acolh.itens) ? s.acolh.itens : [])
        porId.set(String(id), { chamado: !!chamado, frente: Number.isFinite(frente) ? frente : null });
      acolh = { ok: true, at: Number(s.acolh.at), porId };
    }
    if (vivo(s?.salas?.at)) {
      const porId = new Map();
      for (const [id, regs] of Array.isArray(s.salas.itens) ? s.salas.itens : []) porId.set(String(id), regs || []);
      salas = { ok: true, at: Number(s.salas.at), porId, estado: s.salas.estado || {}, camposHistorico: s.salas.campos || [] };
    }
    if (vivo(s?.ausentes?.at)) ausentes = { ok: true, at: Number(s.ausentes.at), ids: new Set((s.ausentes.ids || []).map(String)) };
    return { linhas: mapa, completa: Number(s?.completa) || 0, atualizada: Number(s?.atualizada) || 0 };
  }

  // ---------------------------------------------------------------------------
  // Rastreamento (todas as unidades, mais recentes primeiro)
  // ---------------------------------------------------------------------------

  let eco = 0;
  function urlRastreamento(inicio, quantidade = POR_PAGINA) {
    const q = new URLSearchParams({
      sEcho: String(++eco), iColumns: '8', sColumns: '', iDisplayStart: String(inicio), iDisplayLength: String(quantidade),
      sSearch: '', bRegex: 'false', iSortCol_0: '0', sSortDir_0: 'asc', iSortingCols: '1'
    });
    for (let i = 0; i < 8; i++) {
      q.set(`mDataProp_${i}`, String(i)); q.set(`sSearch_${i}`, ''); q.set(`bRegex_${i}`, 'false');
      q.set(`bSearchable_${i}`, 'true'); q.set(`bSortable_${i}`, 'false');
    }
    return `/filas/rastreamento_senhas.json?${q}`;
  }

  // Colunas: Data | Hora | Nascimento | Munícipe | Ficha | Senha | Status | Ação (link do atendimento)
  function linhaDoRastreamento(raw) {
    if (!Array.isArray(raw)) return null;
    const id = (String(raw[7] ?? '').match(/atendimentos_pas\/(\d+)/) || [])[1];
    if (!id) return null;
    const data = textoHtml(raw[0]), hora = textoHtml(raw[1]);
    return {
      id, data, hora,
      nascimento: textoHtml(raw[2]), nome: textoHtml(raw[3]), ficha: textoHtml(raw[4]),
      senha: textoHtml(raw[5]), status: textoHtml(raw[6]), instante: instanteLinha(data, hora)
    };
  }

  async function lerPaginaRastreamento(inicio) {
    const j = await lerJson(urlRastreamento(inicio));
    return (Array.isArray(j?.aaData) ? j.aaData : []).map(linhaDoRastreamento).filter(Boolean);
  }

  async function carregarJanela(aoAvancar) {
    const corte = Date.now() - JANELA_MS;
    const achadas = new Map();
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina += PAGINAS_PARALELAS) {
      const lote = await Promise.all(Array.from({ length: PAGINAS_PARALELAS },
        (_, k) => lerPaginaRastreamento((pagina + k) * POR_PAGINA)));
      let fim = false;
      for (const rows of lote) {
        for (const l of rows) if (l.instante >= corte) achadas.set(l.id, l);
        if (rows.length < POR_PAGINA || rows.some(l => l.instante && l.instante < corte)) fim = true;
      }
      aoAvancar?.(achadas.size);
      if (fim) break;
    }
    return achadas;
  }

  // ---------------------------------------------------------------------------
  // Situação: filas e ausentes da unidade logada
  // ---------------------------------------------------------------------------

  let filas = { ok: false, at: 0, porId: new Map() };
  let ausentes = { ok: false, at: 0, ids: new Set() };

  // Uma consulta por especialidade: a ordem que o sistema devolve é a ordem da fila daquela
  // especialidade, e dá para contar quantos aguardam na frente de cada um.
  async function lerFilaOcupacao(ocupacao) {
    const itens = [];
    for (let pagina = 1; pagina <= 5; pagina++) {
      const d = await lerJson(`/prontuarios.json?sortable=%7B%7D&page=${pagina}&per_page=300&especialidade=%7B%7D&status=&ocupacoes_ids[]=${ocupacao}`);
      if (!Array.isArray(d)) throw new Error('fila inválida');
      itens.push(...d);
      if (d.length < 300) break;
    }
    return itens;
  }

  async function atualizarFilas() {
    const porId = new Map();
    const fila = [...OCUPACOES_FILA];
    let erro = null;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (fila.length && !erro) {
        const ocupacao = fila.shift();
        try {
          let frente = 0;
          for (const it of await lerFilaOcupacao(ocupacao)) {
            const id = (String(it?.atendimento_str || '').match(/AtendimentoPa#(\d+)$/) || [])[1];
            if (!id || porId.has(id)) continue;
            const chamado = !!it.chamada_em;
            porId.set(id, { chamado, frente: chamado ? null : frente, fila: String(ocupacao) });
            if (!chamado) frente++;
          }
        } catch (e) { erro = e; }
      }
    }));
    if (erro) throw erro;
    filas = { ok: true, at: Date.now(), porId };
  }

  // Fila do acolhimento/triagem (/acolhimentos.json). Mesma sessão, mesma unidade.
  let acolh = { ok: false, at: 0, porId: new Map() };
  async function atualizarAcolhimento() {
    const porId = new Map();
    let frente = 0, tamPagina = 0;
    const corte = Date.now() - JANELA_MS;
    // O backend limita a ~10 por página e ignora per_page: pagina até vir página curta/vazia.
    for (let pagina = 1; pagina <= 60; pagina++) {
      const d = await lerJson(`/acolhimentos.json?page=${pagina}&per_page=100`);
      if (!Array.isArray(d)) throw new Error('acolhimento inválido');
      if (!d.length) break;
      if (pagina === 1) tamPagina = d.length;
      let anteriorAoCorte = false;
      for (const it of d) {
        const id = (String(it?.atendimento_str || '').match(/AtendimentoPa#(\d+)$/) || [])[1];
        const t = instanteLinha(it?.data_senha_formatada || it?.data || '', it?.hora || '') ||
          (Number(it?.data_senha_timestamp) ? Number(it.data_senha_timestamp) : 0);
        if (t && t < corte) { anteriorAoCorte = true; continue; }
        if (!id || porId.has(id)) continue;
        const chamado = !!(it.chamado_em || it.chamada_em);
        porId.set(id, { chamado, frente: chamado ? null : frente });
        if (!chamado) frente++;
      }
      // Página incompleta = última. Datas mais antigas que 24h também encerram a varredura.
      if (d.length < tamPagina || anteriorAoCorte) break;
    }
    acolh = { ok: true, at: Date.now(), porId };
  }

  // ---------------------------------------------------------------------------
  // Salas do Controle de Salas: fila (Em Espera / Em Andamento) e histórico (Finalizado / Cancelado)
  // ---------------------------------------------------------------------------

  let salas = { ok: false, at: 0, porId: new Map(), estado: {}, camposHistorico: [] };

  const isoDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Mesmo formato do axios usado pelo Controle de Salas (objetos vão como JSON).
  function querySala(params) {
    const enc = v => encodeURIComponent(v).replace(/%3A/gi, ':').replace(/%24/g, '$').replace(/%2C/gi, ',').replace(/%20/g, '+').replace(/%5B/gi, '[').replace(/%5D/gi, ']');
    return Object.entries(params).filter(([, v]) => v != null)
      .map(([k, v]) => `${enc(k)}=${enc(v !== null && typeof v === 'object' ? JSON.stringify(v) : v)}`).join('&');
  }

  async function lerSala(sala, status) {
    const agora = new Date();
    const base = { sortable: {}, per_page: 100, profissional: {}, status, grau_risco: '',
      dataInicial: isoDia(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1)), dataFinal: isoDia(agora) };
    const itens = [];
    let tamPagina = 0;
    // O backend pode limitar a quantidade por página e ignorar per_page: pagina até vir página curta.
    for (let page = 1; page <= 40; page++) {
      const r = await fetch(`${sala.url}&${querySala({ ...base, page })}`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json, text/plain, */*' } });
      const txt = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      let d;
      try { d = JSON.parse(txt); } catch { throw new Error(/type=["']?password|usuarios\/login/i.test(txt) ? 'sessao' : 'resposta inválida'); }
      const lista = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.items) ? d.items : [];
      if (status && STATUS_HISTORICO_SALA[status]) for (const it of lista) if (!it.status) it.status = STATUS_HISTORICO_SALA[status];
      itens.push(...lista);
      if (!lista.length) break;
      if (page === 1) tamPagina = lista.length;
      const total = parseInt(r.headers.get('total'), 10);
      if (lista.length < tamPagina || (Number.isFinite(total) && itens.length >= total)) break;
    }
    return itens;
  }

  const instanteSala = it => instanteLinha(clean(it?.data_encaminhamento), clean(it?.hora_encaminhamento));
  // Algum campo do histórico com data/hora de fim (o nome exato varia; só usa se existir).
  function horaFimSala(it) {
    for (const [k, v] of Object.entries(it || {})) {
      if (!/finaliz|conclu|realizad|termin|encerr/i.test(k) || v == null || typeof v === 'object') continue;
      const t = clean(v);
      let m = t.match(/(\d{2}\/\d{2}\/\d{4})\D+(\d{1,2}:\d{2})/);
      if (m) return instanteLinha(m[1], m[2]);
      m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
      if (m) { const ms = Date.parse(t); if (Number.isFinite(ms)) return ms; }
    }
    return 0;
  }

  async function atualizarSalas() {
    const porId = new Map(), estado = {};
    let campos = salas.camposHistorico;
    const add = (id, reg) => { const l = porId.get(id) || []; l.push(reg); porId.set(id, l); };
    await Promise.all(SALAS_LISTA.map(async sala => {
      try {
        const [ativos, finalizados, cancelados] = await Promise.all([lerSala(sala, ''), lerSala(sala, '4'), lerSala(sala, '3')]);
        // Ordem da sala: risco -> chegada (mais antigo primeiro), como o Controle de Salas.
        const ordem = it => [RISCO_ORDEM[clean(it.grau_risco).toUpperCase()] ?? 5, instanteSala(it) || Infinity, clean(it.senha)];
        const espera = ativos.filter(it => it.status === 'Em Espera')
          .sort((a, b) => { const x = ordem(a), y = ordem(b); return (x[0] - y[0]) || (x[1] - y[1]) || x[2].localeCompare(y[2]); });
        const frente = new Map(espera.map((it, i) => [it, i]));
        for (const it of [...ativos, ...finalizados, ...cancelados]) {
          const id = (String(it?.atendimento_str || '').match(/AtendimentoPa#(\d+)$/i) || [])[1];
          if (!id) continue;
          add(id, { sala: sala.key, salaNome: sala.nome, status: clean(it.status), em: instanteSala(it),
            frente: frente.has(it) ? frente.get(it) : null, fim: it.status === 'Finalizado' ? horaFimSala(it) : 0 });
        }
        if (!campos.length && finalizados[0]) campos = Object.keys(finalizados[0]);
        estado[sala.key] = { ok: true, ativos: ativos.length, finalizados: finalizados.length, cancelados: cancelados.length };
      } catch (e) {
        if (e.message === 'sessao') throw e;
        estado[sala.key] = { ok: false, erro: String(e.message || e) };
      }
    }));
    salas = { ok: true, at: Date.now(), porId, estado, camposHistorico: campos };
  }

  // Registro da sala que o rastreamento aponta (o mais recente daquela sala).
  function registroSala(l) {
    const s = norm(l.status);
    if (!/CONTROLE DE SALAS/.test(s)) return null;
    const sala = SALAS_LISTA.find(x => x.rx.test(s.replace(/^CONTROLE DE SALAS\s*-\s*/, '')));
    if (!sala || !salas.ok || !salas.estado[sala.key]?.ok) return undefined;   // sala sem leitura
    const regs = (salas.porId.get(l.id) || []).filter(r => r.sala === sala.key);
    if (!regs.length) return undefined;
    const peso = r => (r.status === 'Em Andamento' ? 3 : r.status === 'Em Espera' ? 2 : 1);
    return regs.sort((a, b) => (peso(b) - peso(a)) || (b.em - a.em))[0];
  }

  // Quando a tela viu a pessoa sair da fila/sala (aproximado; só enquanto alguma tela estava aberta).
  const saidas = (() => {
    const s = lerLocal(STORAGE_SAIDAS, {}) || {};
    const corte = Date.now() - JANELA_MS;
    for (const [id, v] of Object.entries(s)) if (!(v?.t > corte)) delete s[id];
    return s;
  })();
  const ultimaVista = new Map();   // id -> situação na leitura anterior
  function anotarSaida(id, sit) {
    const antes = ultimaVista.get(id);
    ultimaVista.set(id, sit);
    if (/AGUARDANDO|CHAMADO|ANDAMENTO/.test(antes || '') && /ATENDIDO|FINALIZADO/.test(sit) && !saidas[id]) {
      saidas[id] = { t: Date.now() };
      gravarLocal(STORAGE_SAIDAS, saidas);
    }
  }

  // Lista de ausentes da fila (10 por página, mais recentes primeiro). Para nas 24h.
  async function atualizarAusentes() {
    const corte = Date.now() - JANELA_MS;
    const ids = new Set();
    for (let p = 1; p <= MAX_PAGINAS_AUSENTES; p++) {
      const r = await fetch(`/prontuarios?ausentes=true&page_ausentes=${p}`, { credentials: 'same-origin' });
      if (/usuarios\/login/.test(r.url)) throw new Error('sessao');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const doc = parser.parseFromString(await r.text(), 'text/html');
      const links = [...doc.querySelectorAll('a[href*="atendimento_ausentes/"][data-method="delete"]')];
      let passouDoCorte = false;
      for (const a of links) {
        const href = a.getAttribute('href') || '';
        const id = (href.match(/atendimento_ausentes\/(\d+)/) || [])[1];
        const tipo = (href.match(/[?&]type=(\w+)/) || [])[1] || 'AtendimentoPa';
        if (!id || tipo !== 'AtendimentoPa') continue;
        const quando = clean(a.closest('tr')?.cells?.[0]?.textContent).match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})/);
        const t = quando ? instanteLinha(quando[1], quando[2]) : 0;
        if (t && t < corte) { passouDoCorte = true; continue; }
        ids.add(id);
      }
      if (!links.length || passouDoCorte || !doc.querySelector(`a[href*="page_ausentes=${p + 1}"]`)) break;
    }
    ausentes = { ok: true, at: Date.now(), ids };
  }

  function situacaoDe(l) {
    // Acolhimento tem prioridade: na triagem a pessoa já aparece pré-enfileirada no médico,
    // mas ainda não foi atendida por ele.
    const noAcolh = acolh.ok ? acolh.porId.get(l.id) : null;
    if (noAcolh) return noAcolh.chamado ? 'CHAMADO' : 'AGUARDANDO';
    if (ausentes.ok && ausentes.ids.has(l.id)) return 'AUSENTE';
    const s = norm(l.status);
    // "Enfermeiro"/triagem fora da lista de espera = chamado e em atendimento no acolhimento.
    // Tem prioridade sobre a fila médica, onde o paciente já aparece pré-enfileirado.
    if (/ENFERM|ACOLHIM|TRIAGEM/.test(s) && !/CONTROLE DE SALAS/.test(s)) return 'ANDAMENTO';
    const fila = filas.ok ? filas.porId.get(l.id) : null;
    if (fila) return fila.chamado ? 'CHAMADO' : 'AGUARDANDO';
    const sala = registroSala(l);
    if (sala) return sala.status === 'Em Espera' ? 'AGUARDANDO' : sala.status === 'Em Andamento' ? 'ANDAMENTO'
      : sala.status === 'Cancelado' ? 'CANCELADO' : 'FINALIZADO';
    // Sala sem registro (Repouso, sala sem leitura): não dá para afirmar nada.
    if (/CONTROLE DE SALAS/.test(s)) return 'VERIFICANDO';
    // Farmácia: o médico já passou por ele.
    if (/FARMACIA/.test(s)) return 'ATENDIDO';
    // Saiu de todas as filas sem estar ausente: foi atendido. Só afirma com fila médica,
    // acolhimento e ausentes lidos; senão espera a próxima leitura.
    if (filas.ok && acolh.ok && ausentes.ok) return 'ATENDIDO';
    return 'VERIFICANDO';
  }

  // ---------------------------------------------------------------------------
  // Unidade do atendimento: histórico do munícipe (leve) e ficha PDF (reserva)
  // ---------------------------------------------------------------------------

  async function buscarMunicipes(nome) {
    const j = await lerJson(`/municipes/search_padronizado_com_mudanca.json?q=${encodeURIComponent(nome)}`);
    return Array.isArray(j) ? j : (Object.values(j || {}).find(Array.isArray) || []);
  }

  const ERROS_FILTRO = { municipe_id: [], unidade_saude_id: [], profissional_id: [], data_inicio: [], data_fim: [], data_padronizada: [], tipo: [] };

  // Mesmo JSON da Consulta de Prontuários; o filtro vai na própria URL.
  async function historicoDoMunicipe(municipeId, inicio, fim) {
    const filtro = {
      municipe_id: String(municipeId), unidade_saude_id: '', profissional_id: '',
      data_inicio: inicio, data_fim: fim, data_padronizada: '', tipo: ['', 'atendimento_pa'],
      validation_context: null, errors: ERROS_FILTRO
    };
    const q = new URLSearchParams({
      filtro: JSON.stringify(filtro), sEcho: '1', iColumns: '9', sColumns: '', iDisplayStart: '0', iDisplayLength: '50',
      sSearch: '', bRegex: 'false', iSortingCols: '1', iSortCol_0: '1', sSortDir_0: 'desc'
    });
    for (let i = 0; i < 9; i++) {
      q.set(`mDataProp_${i}`, String(i)); q.set(`sSearch_${i}`, ''); q.set(`bRegex_${i}`, 'false');
      q.set(`bSearchable_${i}`, 'true'); q.set(`bSortable_${i}`, 'true');
    }
    const j = await lerJson(`/prontuarios/historicos_atendimentos.json?${q}`);
    return Array.isArray(j?.aaData) ? j.aaData : [];
  }

  // Colunas do histórico: Seleção | Data | Hora | Munícipe | Tipo | Profissional | Especialidade | Unidade | Ação
  async function unidadePeloHistorico(linha) {
    if (!linha.nome) return null;
    const candidatos = (await buscarMunicipes(linha.nome))
      .filter(m => m?.id != null && (!linha.nascimento || clean(m.data_nascimento_formatada) === linha.nascimento))
      .slice(0, 4);
    if (!candidatos.length) return null;

    const inicio = dataBr((linha.instante || Date.now()) - 24 * 60 * 60 * 1000);
    const fim = linha.data || dataBr(Date.now());
    const doAtendimento = new RegExp(`atendimentos_pas/${linha.id}(?!\\d)|value=["']?${linha.id};`);
    for (const m of candidatos) {
      for (const row of await historicoDoMunicipe(m.id, inicio, fim)) {
        if (!Array.isArray(row)) continue;
        if (!doAtendimento.test(String(row[8] ?? '') + ' ' + String(row[0] ?? ''))) continue;
        const unidade = textoHtml(row[7]);
        if (unidade) return unidade;
      }
    }
    return null;
  }

  // Leitor de texto de PDF (o mesmo do Ausentes Acolhimento): (texto) Tj, [(te)(xto)] TJ.
  function textoDoConteudoPdf(c) {
    const partes = [];
    const re = /\((?:[^()\\]|\\[\s\S])*\)|(?<!<)<[0-9A-Fa-f\s]+>(?!>)|\]\s*TJ|Tj|T\*|'|"|Td|TD|Tm|ET/g;
    let m, linha = '';
    while ((m = re.exec(c))) {
      const t = m[0];
      if (t[0] === '<') {
        const hex = t.slice(1, -1).replace(/\s/g, '');
        for (let k = 0; k + 1 < hex.length; k += 2) linha += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
      } else if (t[0] === '(') {
        linha += t.slice(1, -1)
          .replace(/\\([0-7]{1,3})/g, (x, o) => String.fromCharCode(parseInt(o, 8)))
          .replace(/\\([nrtbf])/g, ' ')
          .replace(/\\([\s\S])/g, '$1');
      } else if (t === 'Td' || t === 'TD' || t === 'T*' || t === 'Tm' || t === 'ET') {
        if (linha) { partes.push(linha); linha = ''; }
      }
    }
    if (linha) partes.push(linha);
    return partes.join('\n');
  }

  async function inflar(bytes) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const dec = new TextDecoder('latin1');
    let out = '';
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; out += dec.decode(value, { stream: true }); }
    } catch {}
    return out;
  }

  async function lerTextoPdf(url) {
    const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = new Uint8Array(await r.arrayBuffer());
    const bin = new TextDecoder('latin1').decode(buf);
    const textos = [];
    let i = 0, n = 0;
    while ((i = bin.indexOf('stream', i)) >= 0 && n < 400) {
      let ini = i + 6;
      if (bin[ini] === '\r') ini++;
      if (bin[ini] === '\n') ini++;
      const fim = bin.indexOf('endstream', ini);
      if (fim < 0) break;
      const objIni = bin.lastIndexOf('obj', i);
      const dic = bin.slice(objIni >= 0 && i - objIni < 4000 ? objIni : Math.max(0, i - 300), i);
      if (!/\/Subtype\s*\/Image|\/FontFile/.test(dic)) {
        let c = '';
        try {
          const bytes = buf.slice(ini, fim);
          c = /FlateDecode/.test(dic) ? await inflar(bytes) : new TextDecoder('latin1').decode(bytes);
        } catch {}
        if (c) textos.push(textoDoConteudoPdf(c));
      }
      i = fim + 9; n++;
    }
    return textos.join('\n');
  }

  // Cabeçalho da ficha: "PRONTO SOCORRO ...", "UPA ...". Ignora "PA (MMHG)" dos sinais vitais.
  async function unidadePelaFicha(id) {
    const texto = await lerTextoPdf(`/atendimentos_pas/${id}.pdf`);
    return texto.split('\n').map(clean)
      .find(l => /^(PRONTO SOCORRO|PRONTO ATENDIMENTO|UPA\b|UNIDADE|HOSPITAL|POLICL|USF\b|UBS\b|AMBULAT)/i.test(l) && !/MMHG/i.test(l)) || null;
  }

  async function resolverUnidade(linha) {
    try {
      const u = await unidadePeloHistorico(linha);
      if (u) return { u, f: 'H' };
    } catch (e) { if (e.message === 'sessao') throw e; }
    const u = await unidadePelaFicha(linha.id);
    return u ? { u, f: 'P' } : null;
  }

  // Fila com limite de consultas simultâneas, na ordem pedida (mais recentes primeiro).
  let emVoo = 0;
  const aguardando = [];
  async function comLimite(fn) {
    if (emVoo >= CONSULTAS_PARALELAS) await new Promise(ok => aguardando.push(ok));
    emVoo++;
    try { return await fn(); } finally { emVoo--; aguardando.shift()?.(); }
  }

  const resolvendo = new Set();
  const falhas = new Map();
  let sessaoExpirada = false;

  function garantirUnidade(linha) {
    const id = linha.id;
    if (sessaoExpirada || cache[id] || resolvendo.has(id)) return;
    const falhou = falhas.get(id);
    if (falhou && Date.now() - falhou < REPETIR_FALHA_MS) return;
    resolvendo.add(id);
    comLimite(() => sessaoExpirada ? null : resolverUnidade(linha))
      .then(r => {
        if (r) { cache[id] = { u: r.u, f: r.f, t: Date.now() }; falhas.delete(id); gravarCacheDepois(); }
        else falhas.set(id, Date.now());
      })
      .catch(e => {
        if (e.message === 'sessao') marcarSessaoExpirada();
        falhas.set(id, Date.now());
      })
      .finally(() => { resolvendo.delete(id); agendarRender(); });
  }

  // ---------------------------------------------------------------------------
  // Tela
  // ---------------------------------------------------------------------------

  let linhas = new Map();
  let busca = '';
  let setorSel = 'TODOS';
  let situacaoSel = 'TODAS';
  let carregando = false;
  let ultimaCompleta = 0;
  let ultimaAtualizacao = 0;
  let progressoCarga = '';
  let aviso = '';

  function marcarSessaoExpirada() {
    sessaoExpirada = true;
    definirAviso('Sessão expirada. Recarregue a página e entre de novo.');
  }

  const LUPA = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238a949c' stroke-width='2.4' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E";
  const ICONE_UNIDADE = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M12 9v6M9 12h6"/></svg>';

  function garantirCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const B = `#${BARRA_ID}`, C = `#${CAIXA_ID}`;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ${B},${C}{--om30-borda:#e3e8ee;--om30-texto:#25313c;--om30-suave:#7b8794;--om30-fundo:#f5f7fa;font-family:Roboto,"Segoe UI",Arial,sans-serif;}
      ${B}{margin:10px 0 14px;background:#fff;border:1px solid var(--om30-borda);border-radius:14px;box-shadow:0 2px 8px rgba(15,23,42,.05);overflow:hidden;}
      ${B} .om30r-topo{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;padding:16px 18px 14px;}
      ${B} .om30r-unidade{display:flex;align-items:center;gap:14px;min-width:0;flex:1 1 300px;}
      ${B} .om30r-icone{flex:none;width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#2b7bc4,#1c5f9c);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(31,111,178,.25);}
      ${B} .om30r-icone svg{width:22px;height:22px;}
      ${B} .om30r-rotulo{display:block;font-size:10.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--om30-suave);}
      ${B} .om30r-nome{display:block;margin-top:3px;font-size:17px;font-weight:700;color:var(--om30-texto);line-height:1.2;}
      ${B} .om30r-busca{width:260px;height:38px;padding:0 12px 0 34px;border:1px solid #d6dde4;border-radius:10px;font-size:13px;color:var(--om30-texto);background:var(--om30-fundo) url("${LUPA}") no-repeat 12px center;transition:border-color .15s,box-shadow .15s,background-color .15s;}
      ${B} .om30r-busca:focus{outline:none;border-color:#1f6fb2;background-color:#fff;box-shadow:0 0 0 3px rgba(31,111,178,.14);}
      ${B} .om30r-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;padding:0 18px 14px;}
      ${B} .om30r-card{--c:#1f6fb2;position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:11px 14px 10px;border:1px solid var(--om30-borda);border-radius:12px;background:#fff;text-align:left;cursor:pointer;overflow:hidden;transition:border-color .15s,box-shadow .15s,transform .15s;}
      ${B} .om30r-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c);}
      ${B} .om30r-card:hover{box-shadow:0 3px 10px rgba(15,23,42,.08);transform:translateY(-1px);}
      ${B} .om30r-card.ativo{border-color:var(--c);background:color-mix(in srgb,var(--c) 7%,#fff);box-shadow:0 0 0 2px color-mix(in srgb,var(--c) 20%,transparent);}
      ${B} .om30r-card-rotulo{font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--om30-suave);}
      ${B} .om30r-card-num{font-size:26px;font-weight:800;line-height:1.1;color:var(--om30-texto);font-variant-numeric:tabular-nums;}
      ${B} .om30r-card-sub{font-size:11px;color:var(--om30-suave);white-space:nowrap;}
      ${B} .om30r-card-sub b{color:var(--om30-texto);}
      ${B} .om30r-setores{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:0 18px 14px;}
      ${B} .om30r-setores-rotulo{margin-right:2px;font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--om30-suave);}
      ${B} .om30r-chip{--c:#868e96;display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 12px;border:1px solid var(--om30-borda);border-radius:999px;background:#fff;font-size:12px;font-weight:600;color:#46515a;cursor:pointer;}
      ${B} .om30r-chip:hover{background:var(--om30-fundo);}
      ${B} .om30r-chip i{width:8px;height:8px;border-radius:50%;background:var(--c);}
      ${B} .om30r-chip b{font-weight:800;color:var(--om30-texto);font-variant-numeric:tabular-nums;}
      ${B} .om30r-chip.ativo{border-color:var(--c);background:color-mix(in srgb,var(--c) 10%,#fff);color:var(--om30-texto);}
      ${B} .om30r-progresso{height:3px;background:#eef1f4;}
      ${B} .om30r-progresso span{display:block;height:100%;width:0;background:linear-gradient(90deg,#2b7bc4,#4dabf7);transition:width .4s ease;}
      ${B} .om30r-progresso.cheio span{width:0!important;}
      ${B} .om30r-rodape{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 12px;padding:8px 18px;background:var(--om30-fundo);border-top:1px solid #edf0f3;font-size:11.5px;color:var(--om30-suave);}
      ${B} .om30r-status{display:inline-flex;align-items:center;gap:7px;}
      ${B} .om30r-status::before{content:"";width:7px;height:7px;border-radius:50%;background:#40c057;box-shadow:0 0 0 3px rgba(64,192,87,.18);}
      ${B}.om30r-ocupado .om30r-status::before{background:#4dabf7;box-shadow:0 0 0 3px rgba(77,171,247,.2);animation:om30r-pulso 1.2s ease-in-out infinite;}
      ${B} .om30r-aviso{font-weight:700;color:#c92a2a;}
      @keyframes om30r-pulso{50%{opacity:.35;}}
      ${C}{background:#fff;border:1px solid var(--om30-borda);border-radius:14px;box-shadow:0 2px 8px rgba(15,23,42,.05);overflow:auto;max-height:calc(100vh - 150px);}
      ${C} table{width:100%;margin:0;border-collapse:separate;border-spacing:0;font-size:12.5px;}
      ${C} thead th{position:sticky;top:0;z-index:1;padding:11px 14px;background:#f7f9fb;border-bottom:1px solid var(--om30-borda);text-align:left;white-space:nowrap;font-size:10.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#6b7680;}
      ${C} tbody td{padding:10px 14px;border-bottom:1px solid #f0f2f5;vertical-align:middle;color:#3a454f;}
      ${C} tbody tr td:first-child{box-shadow:inset 3px 0 0 var(--s,#adb5bd);}
      ${C} tbody tr:last-child td{border-bottom:0;}
      ${C} tbody tr:hover td{background:#f8fafc;}
      ${C} .om30r-hora{display:block;font-size:15px;font-weight:800;color:var(--om30-texto);font-variant-numeric:tabular-nums;}
      ${C} .om30r-sub{display:block;margin-top:2px;font-size:10.5px;color:#8a949c;}
      ${C} .om30r-pac{display:block;font-weight:700;color:var(--om30-texto);}
      ${C} .om30r-senha{--c:#495057;display:inline-block;min-width:64px;padding:4px 9px;border:1px solid color-mix(in srgb,var(--c) 28%,#fff);border-radius:8px;background:color-mix(in srgb,var(--c) 9%,#fff);color:var(--c);text-align:center;font-size:12.5px;font-weight:800;letter-spacing:.3px;font-variant-numeric:tabular-nums;}
      ${C} .om30r-setor{--c:#868e96;display:inline-flex;align-items:center;gap:7px;font-weight:600;color:#3a454f;}
      ${C} .om30r-setor i{flex:none;width:8px;height:8px;border-radius:50%;background:var(--c);}
      ${C} .om30r-sit{--c:#adb5bd;display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:color-mix(in srgb,var(--c) 12%,#fff);color:color-mix(in srgb,var(--c) 85%,#000);font-size:11.5px;font-weight:700;white-space:nowrap;}
      ${C} .om30r-sit i{width:7px;height:7px;border-radius:50%;background:var(--c);}
      ${C} .om30r-espera{display:block;margin-top:3px;font-size:10.5px;color:#8a949c;}
      ${C} .om30r-espera b{color:var(--om30-texto);}
      ${C} .om30r-nc{display:inline-block;margin-top:3px;padding:1px 7px;border-radius:9px;background:#fff3cd;color:#7a5a00;font-size:9.5px;font-weight:800;white-space:nowrap;}
      ${C} td.om30r-vazio{padding:34px 14px;text-align:center;color:#8a949c;font-size:13px;}
      ${C} td.om30r-acao{width:1%;text-align:right;}
      ${C} .om30r-cham{display:block;margin-top:4px;font-size:10.5px;color:#8a949c;white-space:nowrap;cursor:help;}
      ${C} .om30r-cham.varias{color:#c75b00;font-weight:700;}
      #rastreamento-senhas-datatable_wrapper,#filtro_rastreamento_senhas,.om30r-filtro-nativo{display:none!important;}
      @media(max-width:1100px){${B} .om30r-cards{grid-template-columns:repeat(3,minmax(0,1fr));}}
      @media(max-width:700px){${B} .om30r-cards{grid-template-columns:repeat(2,minmax(0,1fr));} ${B} .om30r-busca{flex:1 1 100%;width:auto;}}
    `;
    document.head.appendChild(style);
  }

  // Os filtros nativos mudam a lista no servidor (e a nossa junto): ficam ocultos.
  function esconderFiltrosNativos() {
    for (const el of document.querySelectorAll('a, button')) {
      if (/adicionar filtros/i.test(el.textContent || '')) el.classList.add('om30r-filtro-nativo');
    }
    // A caixa da busca nativa ("Informe o nome do munícipe" + Limpar), se não for a da tabela.
    const caixa = document.querySelector('#filtro_rastreamento_senhas')?.closest('.content-box');
    if (caixa && !caixa.querySelector(TABELA_NATIVA)) caixa.classList.add('om30r-filtro-nativo');
  }

  function montarTela() {
    const nativa = document.querySelector(TABELA_NATIVA);
    const ref = document.querySelector(`${TABELA_NATIVA}_wrapper`) || nativa;
    if (!nativa || !ref?.parentNode) return false;
    if (document.getElementById(BARRA_ID)) return true;

    garantirCSS();
    esconderFiltrosNativos();

    const barra = document.createElement('div');
    barra.id = BARRA_ID;
    barra.innerHTML = `
      <div class="om30r-topo">
        <div class="om30r-unidade">
          <span class="om30r-icone">${ICONE_UNIDADE}</span>
          <span><span class="om30r-rotulo">Rastreamento · últimas 24 horas</span><span class="om30r-nome"></span></span>
        </div>
        <input type="search" class="om30r-busca" placeholder="Buscar nome, senha ou ficha">
      </div>
      <div class="om30r-cards"></div>
      <div class="om30r-setores"></div>
      <div class="om30r-progresso"><span></span></div>
      <div class="om30r-rodape"><span class="om30r-status"></span><span class="om30r-aviso"></span></div>`;
    barra.querySelector('.om30r-busca').addEventListener('input', ev => { busca = ev.target.value; render(); });
    barra.querySelector('.om30r-cards').addEventListener('click', ev => {
      const card = ev.target.closest('.om30r-card');
      if (!card) return;
      situacaoSel = card.dataset.situacao === situacaoSel ? 'TODAS' : card.dataset.situacao;
      render();
    });
    barra.querySelector('.om30r-setores').addEventListener('click', ev => {
      const chip = ev.target.closest('.om30r-chip');
      if (!chip) return;
      setorSel = chip.dataset.setor === setorSel ? 'TODOS' : chip.dataset.setor;
      render();
    });

    const caixa = document.createElement('div');
    caixa.id = CAIXA_ID;
    caixa.innerHTML = '<table><thead><tr><th>Chegada</th><th>Munícipe</th><th>Senha</th><th>Setor</th><th>Situação</th><th></th></tr></thead><tbody></tbody></table>';

    ref.parentNode.insertBefore(barra, ref);
    ref.parentNode.insertBefore(caixa, ref);
    return true;
  }

  function definirAviso(texto) {
    aviso = texto || '';
    const el = document.querySelector(`#${BARRA_ID} .om30r-aviso`);
    if (el) el.textContent = aviso;
  }

  // ---------------------------------------------------------------------------
  // Histórico de chamadas (Worker om30-senhas). Desligado enquanto vazio.
  // 1ª vez: ontem + hoje da unidade; depois só o que entrou desde o cursor (barato no plano grátis).
  // ---------------------------------------------------------------------------
  const SENHAS_API = 'https://ps.worker-senhas.workers.dev';   // ex.: https://om30-senhas.<conta>.workers.dev
  const SENHAS_KEY = String.fromCharCode(83,52,86,67,112,89,48,67,119,115,103,119,109,45,89,82,110,65,102,105,67,53,97,55,65,104,51,120,82,54,80,118,89,84,69,116,102,76,106,104,69,100,66,109,116,104,104,108);   // chave do cliente (secret CLIENT_KEY do Worker)
  const SETOR_CHAMADA = { RECEPCAO: 'Recepção', ACOLHIMENTO: 'Acolhimento', MEDICO: 'Médico' };
  const CACHE_HIST = `${PREFIX}:historico-chamadas-v1`;
  let hist = (() => { try { const o = JSON.parse(localStorage.getItem(CACHE_HIST) || 'null'); return o && o.porSenha ? o : null; } catch { return null; } })();
  let historicoVersao = 0, historicoEm = 0, historicoBuscando = false;
  const gravarHist = () => { try { localStorage.setItem(CACHE_HIST, JSON.stringify(hist)); } catch {} };
  function diasJanela() {
    const hoje = new Date(Date.now() - 3 * 3600000);
    return [new Date(hoje.getTime() - 86400000).toISOString().slice(0, 10), hoje.toISOString().slice(0, 10)];
  }
  const diaIso = data => { const m = String(data || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
  function nomeCurto(n) {
    const p = tituloCaso(n).split(' ').filter(Boolean);
    return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : (p[0] || '—');
  }
  async function atualizarHistorico() {
    if (!SENHAS_API || !SENHAS_KEY || historicoBuscando || document.hidden || Date.now() - historicoEm < 60000) return;
    const unidade = norm(unidadeLogada());
    if (!unidade) return;
    const dias = diasJanela();
    const valido = !!hist && hist.unidade === unidade && hist.dias?.join() === dias.join();
    historicoBuscando = true; historicoEm = Date.now();
    try {
      const r = await fetch(SENHAS_API.replace(/\/$/, '') + '/v1/chamadas/unidade', { method: 'POST', mode: 'cors', credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'X-OM30-Key': SENHAS_KEY },
        body: JSON.stringify({ unidade, dias, ...(valido ? { desde: hist.cursor } : {}) }) });
      const j = r.ok ? await r.json() : null;
      if (!j?.ok) return;
      if (j.completo || !valido) hist = { unidade, dias, cursor: 0, porSenha: {} };
      for (const [, dia, senha, setor, em, por, local, rech] of j.chamadas || []) (hist.porSenha[`${dia}|${senha}`] ||= []).push([setor, em, por, local, rech]);
      hist.cursor = j.cursor;
      gravarHist();
      if (j.completo || (j.chamadas || []).length) { historicoVersao++; agendarRender(); }
    } catch { /* sem rede: tenta no próximo minuto */ } finally { historicoBuscando = false; }
  }
  function chamadasHtml(l) {
    const cs = hist?.porSenha?.[`${diaIso(l.data)}|${norm(l.senha)}`] || [];
    if (!cs.length) return '';
    const [, uEm, uPor] = cs[cs.length - 1];
    const titulo = cs.map(([setor, em, por, local, rech]) => `${horarioCurto(Date.parse(em))} · ${SETOR_CHAMADA[setor] || setor} · ${por || '—'}${local ? ' · ' + local : ''}${rech ? ' (rechamada)' : ''}`).join('\n');
    return `<span class="om30r-cham${cs.length > 1 ? ' varias' : ''}" title="${esc(titulo)}">Chamada ${cs.length}× · ${esc(nomeCurto(uPor || ''))} · ${horarioCurto(Date.parse(uEm))}</span>`;
  }

  let timerRender = null;
  function agendarRender() {
    if (timerRender) return;
    timerRender = setTimeout(() => { timerRender = null; render(); }, 400);
  }

  // "Fila de Atendimento - Médico clínico" -> "Médico clínico"; "Controle de Salas - Raio-x" -> "Sala · Raio-x"
  const statusCurto = s => clean(s).replace(/^Fila de Atendimento\s*-\s*/i, '').replace(/^Controle de Salas\s*-\s*/i, 'Sala · ') || '—';

  function linhaHtml(l, sit, agora, naoConfirmada) {
    const setor = setorLinha(l);
    const s = SITUACAO[sit];
    const cor = COR_SENHA[norm(l.senha).slice(0, 2)] || '#495057';
    const link = `<a href="/atendimentos_pas/${esc(l.id)}?rastreamento_senha=1" class="btn tooltip-link btn-primary btn-sm" title="Visualizar Atendimento"><i class="fa fa-search"></i></a>`;
    const marca = naoConfirmada ? '<span class="om30r-nc" title="Não foi possível confirmar a unidade deste atendimento">unidade não confirmada</span>' : '';
    const fila = filas.ok ? filas.porId.get(l.id) : null, sala = registroSala(l);
    const noAcolh = acolh.ok ? acolh.porId.get(l.id) : null;
    const frente = sit === 'AGUARDANDO' ? (noAcolh ? noAcolh.frente : fila ? fila.frente : sala?.frente) : null;
    const detalhes = [];
    if (Number.isFinite(frente)) detalhes.push(frente ? `<b>${frente}</b> na frente` : '<b>é o próximo</b>');
    if ((sit === 'AGUARDANDO' || sit === 'CHAMADO' || sit === 'ANDAMENTO') && l.instante) detalhes.push(`esperando há <b>${duracao(agora - l.instante)}</b>`);
    const fim = sit === 'FINALIZADO' && sala?.fim ? sala.fim : 0;
    if (fim) detalhes.push(`finalizado às <b>${horarioCurto(fim)}</b>`);
    else if ((sit === 'ATENDIDO' || sit === 'FINALIZADO') && saidas[l.id]) detalhes.push(`saiu ~<b>${horarioCurto(saidas[l.id].t)}</b>`);
    // Na triagem, a coluna mostra "Acolhimento" (não o texto cru "Enfermeiro"/"Médico clínico").
    const textoSetor = setor.key === 'ACOLHIMENTO' ? 'Acolhimento' : statusCurto(l.status);
    const espera = detalhes.length ? `<span class="om30r-espera">${detalhes.join(' · ')}</span>` : '';
    return `<tr data-atendimento="${esc(l.id)}" data-situacao="${sit}" style="--s:${s.cor}">` +
      `<td><span class="om30r-hora">${esc(l.hora)}</span><span class="om30r-sub">${esc(l.data)}</span></td>` +
      `<td><span class="om30r-pac">${esc(l.nome)}</span><span class="om30r-sub">Nasc. ${esc(l.nascimento || '—')} · Ficha ${esc(l.ficha || '—')}</span>${marca}</td>` +
      `<td><span class="om30r-senha" style="--c:${cor}">${esc(l.senha || '—')}</span>${chamadasHtml(l)}</td>` +
      `<td><span class="om30r-setor" style="--c:${setor.cor}" title="${esc(l.status)}"><i></i>${esc(textoSetor)}</span></td>` +
      `<td><span class="om30r-sit" style="--c:${s.cor}"><i></i>${s.label}</span>${espera}</td>` +
      `<td class="om30r-acao">${link}</td></tr>`;
  }

  let assinaturaTabela = '';
  function render() {
    const barra = document.getElementById(BARRA_ID);
    if (!barra) return;
    const minha = unidadeLogada();
    const agora = Date.now();
    barra.querySelector('.om30r-nome').textContent = minha ? tituloCaso(minha.replace(/\s+GUARUJA$/i, '')) : 'Unidade não identificada no topo da tela';
    barra.querySelector('.om30r-aviso').textContent = aviso;

    const corte = agora - JANELA_MS;
    const lista = [...linhas.values()].filter(l => l.instante >= corte)
      .sort((a, b) => (b.instante - a.instante) || (Number(b.id) - Number(a.id)));
    const daUnidade = [], naoConfirmadas = [];
    let conferidas = 0;
    for (const l of lista) {
      const c = cache[l.id];
      if (c) { conferidas++; if (mesmaUnidade(c.u, minha)) daUnidade.push(l); }
      else if (!resolvendo.has(l.id) && falhas.has(l.id)) naoConfirmadas.push(l);
    }
    const sit = new Map([...daUnidade, ...naoConfirmadas].map(l => [l.id, situacaoDe(l)]));
    atualizarHistorico();
    for (const [id, s] of sit) anotarSaida(id, s);
    // Cards agrupam: Chamado + Em atendimento; Atendido + Finalizado.
    const grupo = s => s === 'ANDAMENTO' ? 'CHAMADO' : s === 'FINALIZADO' ? 'ATENDIDO' : s;

    // Cards de situação (contagem da unidade) e espera média de quem aguarda.
    const porSit = {};
    for (const l of daUnidade) porSit[grupo(sit.get(l.id))] = (porSit[grupo(sit.get(l.id))] || 0) + 1;
    const esperando = daUnidade.filter(l => sit.get(l.id) === 'AGUARDANDO' && l.instante);
    const mediaEspera = esperando.length ? esperando.reduce((a, l) => a + (agora - l.instante), 0) / esperando.length : 0;
    const cards = [
      { key: 'TODAS', label: 'Senhas 24h', cor: '#1f6fb2', num: daUnidade.length, sub: 'da unidade' },
      { ...SITUACAO.AGUARDANDO, num: porSit.AGUARDANDO || 0, sub: esperando.length ? `espera média <b>${duracao(mediaEspera)}</b>` : 'ninguém esperando' },
      { ...SITUACAO.CHAMADO, label: 'Chamado / em atend.', num: porSit.CHAMADO || 0, sub: 'chamados ou em atendimento' },
      { ...SITUACAO.ATENDIDO, label: 'Atendido / finalizado', num: porSit.ATENDIDO || 0, sub: 'saíram da fila ou da sala' },
      { ...SITUACAO.AUSENTE, num: porSit.AUSENTE || 0, sub: 'marcados ausentes' }
    ];
    if (situacaoSel !== 'TODAS' && !porSit[situacaoSel]) situacaoSel = 'TODAS';
    barra.querySelector('.om30r-cards').innerHTML = cards.map(c =>
      `<button type="button" class="om30r-card${c.key === situacaoSel ? ' ativo' : ''}" data-situacao="${c.key}" style="--c:${c.cor}">` +
      `<span class="om30r-card-rotulo">${esc(c.label)}</span><span class="om30r-card-num">${c.num}</span><span class="om30r-card-sub">${c.sub}</span></button>`).join('');

    // Setores (filtram junto com a situação).
    const porSetor = {};
    for (const l of daUnidade) { const k = setorLinha(l).key; porSetor[k] = (porSetor[k] || 0) + 1; }
    if (setorSel !== 'TODOS' && !porSetor[setorSel]) setorSel = 'TODOS';
    const chips = SETORES.filter(s => porSetor[s.key]);
    barra.querySelector('.om30r-setores').innerHTML = chips.length ? '<span class="om30r-setores-rotulo">Setor</span>' + chips.map(s =>
      `<button type="button" class="om30r-chip${s.key === setorSel ? ' ativo' : ''}" data-setor="${s.key}" style="--c:${s.cor}">` +
      `<i></i>${esc(s.label)} <b>${porSetor[s.key]}</b></button>`).join('') : '';

    const termo = norm(busca);
    const passa = l => (setorSel === 'TODOS' || setorLinha(l).key === setorSel) &&
      (situacaoSel === 'TODAS' || grupo(sit.get(l.id)) === situacaoSel) &&
      (!termo || norm(`${l.nome} ${l.senha} ${l.ficha}`).includes(termo));
    const exibidas = daUnidade.filter(passa);
    const exibidasNc = naoConfirmadas.filter(passa);

    // Progresso e rodapé.
    const pendentes = lista.length - conferidas - naoConfirmadas.length;
    const ocupado = carregando || pendentes > 0;
    barra.classList.toggle('om30r-ocupado', ocupado);
    const feito = lista.length ? (conferidas + naoConfirmadas.length) / lista.length : 0;
    const progresso = barra.querySelector('.om30r-progresso');
    progresso.querySelector('span').style.width = `${Math.round((pendentes > 0 ? feito : carregando && !lista.length ? .08 : 1) * 100)}%`;
    progresso.classList.toggle('cheio', !ocupado);
    const partes = [];
    if (carregando) partes.push(lista.length ? 'Atualizando a lista…' : (progressoCarga || 'Carregando as últimas 24 horas…'));
    if (pendentes > 0) partes.push(`Conferindo a unidade das senhas novas… ${conferidas + naoConfirmadas.length} de ${lista.length}`);
    if (!ocupado && ultimaAtualizacao) partes.push(`Atualizado às ${horarioCurto(ultimaAtualizacao)} · atualiza sozinho a cada minuto`);
    if (naoConfirmadas.length) partes.push(`${naoConfirmadas.length} sem unidade confirmada (no fim da lista)`);
    barra.querySelector('.om30r-status').textContent = partes.join(' · ');

    // Tabela.
    const tbody = document.querySelector(`#${CAIXA_ID} tbody`);
    if (!tbody) return;
    const minuto = Math.floor(agora / 60000);
    const assinatura = [termo, setorSel, situacaoSel, minuto, historicoVersao, ...exibidas.map(l => l.id + l.status + sit.get(l.id)), '|', ...exibidasNc.map(l => l.id + l.status + sit.get(l.id))].join(',');
    if (assinatura === assinaturaTabela) return;
    assinaturaTabela = assinatura;

    if (!exibidas.length && !exibidasNc.length) {
      const msg = ocupado && !daUnidade.length ? 'Procurando as senhas desta unidade…'
        : (termo || setorSel !== 'TODOS' || situacaoSel !== 'TODAS') ? 'Nenhuma senha com esse filtro.' : 'Nenhuma senha desta unidade nas últimas 24 horas.';
      tbody.innerHTML = `<tr><td colspan="6" class="om30r-vazio">${esc(msg)}</td></tr>`;
      return;
    }
    tbody.innerHTML = exibidas.map(l => linhaHtml(l, sit.get(l.id), agora, false)).join('') +
      exibidasNc.map(l => linhaHtml(l, sit.get(l.id), agora, true)).join('');
  }

  // ---------------------------------------------------------------------------
  // Ciclos
  // ---------------------------------------------------------------------------

  function pedirUnidades() {
    // Mais recentes primeiro: a fila de consultas respeita essa ordem.
    [...linhas.values()].sort((a, b) => b.instante - a.instante).forEach(garantirUnidade);
  }

  async function atualizarSituacao({ forcarAusentes = false } = {}) {
    const tarefas = [];
    if (!filas.ok || Date.now() - filas.at > FILAS_MS) tarefas.push(atualizarFilas());
    if (!salas.ok || Date.now() - salas.at > SALAS_MS) tarefas.push(atualizarSalas());
    if (!acolh.ok || Date.now() - acolh.at > ACOLH_MS) tarefas.push(atualizarAcolhimento());
    if (forcarAusentes || !ausentes.ok || Date.now() - ausentes.at > AUSENTES_MS) tarefas.push(atualizarAusentes());
    const r = await Promise.allSettled(tarefas);
    if (r.some(x => x.status === 'rejected' && x.reason?.message === 'sessao')) marcarSessaoExpirada();
  }

  async function cicloCompleto() {
    if (carregando || sessaoExpirada) return;
    carregando = true;
    progressoCarga = 'Carregando as últimas 24 horas…';
    render();
    try {
      const [achadas] = await Promise.all([
        carregarJanela(qtd => { progressoCarga = `Carregando as últimas 24 horas… ${qtd} senhas lidas`; agendarRender(); }),
        atualizarSituacao()
      ]);
      linhas = achadas;
      ultimaCompleta = ultimaAtualizacao = Date.now();
      salvarLinhas();
      definirAviso('');
    } catch (e) {
      if (e.message === 'sessao') marcarSessaoExpirada();
      else definirAviso(`Falha ao ler o rastreamento (${e.message}). Tentando de novo em 1 min.`);
    } finally {
      carregando = false;
      pedirUnidades();
      render();
    }
  }

  async function cicloLeve() {
    if (carregando || sessaoExpirada) return;
    try {
      const corte = Date.now() - JANELA_MS;
      const [novas] = await Promise.all([lerPaginaRastreamento(0), atualizarSituacao()]);
      for (const l of novas) if (l.instante >= corte) linhas.set(l.id, l);
      for (const [id, l] of linhas) if (l.instante < corte) linhas.delete(id);
      ultimaAtualizacao = Date.now();
      salvarLinhas();
      definirAviso('');
    } catch (e) {
      if (e.message === 'sessao') marcarSessaoExpirada();
    }
    pedirUnidades();
    render();
  }

  function iniciar() {
    if (!montarTela()) return false;

    // Volta com o que já foi pesquisado: lista salva aparece na hora, unidades vêm do cache.
    const salvo = lerLinhasSalvas();
    linhas = salvo.linhas;
    ultimaCompleta = salvo.completa;
    ultimaAtualizacao = salvo.atualizada;
    render();
    pedirUnidades();

    if (!linhas.size || Date.now() - ultimaCompleta > RECARREGAR_TUDO_MS) cicloCompleto();
    else cicloLeve();

    setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - ultimaCompleta > RECARREGAR_TUDO_MS) cicloCompleto();
      else cicloLeve();
    }, ATUALIZAR_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - ultimaAtualizacao > ATUALIZAR_MS) cicloLeve();
    });
    return true;
  }

  // Suporte: OM30Rastreamento.diagnostico() no console.
  window.OM30Rastreamento = {
    versao: VERSAO,
    diagnostico() {
      const vals = Object.values(cache);
      return {
        versao: VERSAO, unidade: unidadeLogada(), linhas24h: linhas.size, emCache: vals.length,
        pelaFicha: vals.filter(v => v.f === 'P').length, falhas: falhas.size, resolvendo: resolvendo.size,
        historico: { ativo: !!(SENHAS_API && SENHAS_KEY), senhas: Object.keys(hist?.porSenha || {}).length, cursor: hist?.cursor ?? null, versao: historicoVersao },
        naFila: filas.porId.size, noAcolhimento: acolh.porId.size, ausentes24h: ausentes.ids.size, salas: salas.estado,
        camposHistoricoSala: salas.camposHistorico, saidasVistas: Object.keys(saidas).length, carregando, sessaoExpirada
      };
    },
    recarregar: () => { ultimaCompleta = 0; filas.at = salas.at = acolh.at = 0; return cicloCompleto(); }
  };

  if (!iniciar()) {
    let tentativas = 0;
    const t = setInterval(() => { if (iniciar() || ++tentativas >= 50) clearInterval(t); }, 200);
  }
})();
