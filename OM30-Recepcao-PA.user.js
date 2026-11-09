// ==UserScript==
// @name         OM30 - Recepção PA | Especialidade, Chamadas e Cadastro
// @namespace    https://om30.com.br/
// @version      1.9.0
// @description  Recepção do PA (v3): mostra só Clínico, Pediatra e Dentista no select de especialidade (+ Outras especialidades), registra as chamadas de cada senha e mostra cadastro desatualizado (sem CPF, sem CNS, CPF/CNS inválido, muito tempo sem atualizar). Ao clicar em "Criar Ficha", se a especialidade não bate com a senha ou o cadastro está desatualizado, pede confirmação: dá para continuar mesmo assim.
// @author       Pedro Sampaio - Samp
// @updateURL    https://raw.githubusercontent.com/pdrjsampaio/om30-userscripts/main/OM30-Recepcao-PA.user.js
// @downloadURL  https://raw.githubusercontent.com/pdrjsampaio/om30-userscripts/main/OM30-Recepcao-PA.user.js
// @match        https://v3guaruja.saudesimples.net/*
// @match        https://v3guarujahomolog.saudesimples.net/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  // v1.9.0
  // - Chamadas e fichas vão para o Worker om30-senhas (https://ps.worker-senhas.workers.dev): histórico
  //   central por senha, lido pelo Rastreamento de Senhas e pelo painel da coordenação.
  //
  // v1.8.3
  // - Telefone: também pega iguais menos dois (99999987), blocos de 4 repetidos (1234-1234),
  //   5+ iguais seguidos (99999-1234) e 6+ em sequência no meio (99654-3210).
  //
  // v1.8.2
  // - "Sem celular" quando o celular está vazio; número montado com só 2 algarismos (ex.: 9899-8989)
  //   também pede confirmação.
  //
  // v1.8.1
  // - Texto do aviso de telefone: "Confirmar celular" / "Confirmar telefone" (não "suspeito").
  //
  // v1.8.0
  // - Ficha: aviso de telefone com sequência estranha no aviso do cadastro (todos iguais ou iguais menos um,
  //   pares/trincas repetidos, sequência crescente/decrescente, curto demais). Só aviso.
  //
  // v1.7.5
  // - Linha turquesa lateral de volta nos campos diferentes, só da altura do próprio campo (align-items: start);
  //   sem a linha tracejada no "Atual".
  //
  // v1.7.4
  // - Volta o cartão em blocos (1.7.2): "Usar" na linha do rótulo, linha fina separando o valor do CadSUS
  //   do "Atual: …", sem a linha lateral, espaços menores.
  //
  // v1.7.3 (desfeito)
  // - Cartão CadSUS compacto: tabela só com os diferentes, colunas CADSUS (negrito) | ATUAL (cinza) | Usar;
  //   iguais resumidos no rodapé; sem as linhas laterais; largura máxima 920px.
  //
  // v1.7.2
  // - Cartão CadSUS: valor do CadSUS em negrito, rótulos pequenos em maiúsculo, "Usar" como botãozinho.
  //
  // v1.7.1
  // - Resultado volta para a página (sem janela), em cartão; sem laranja. "Usar" ao lado do valor do
  //   CadSUS e "Atual: …" embaixo, em cinza. Linha separando o select do campo.
  //
  // v1.7.0
  // - "Consultar CadSUS": select CNS/CPF igual aos do formulário; máscara no campo (CPF 000.000.000-00,
  //   CNS 000 0000 0000 0000, limitando a quantidade de números).
  // - Resultado numa janela no estilo da "Informações do Indivíduo" nativa (não mais tabela na página).
  //
  // v1.6.2
  // - Seletor CNS | CPF no "Consultar CadSUS" (CNS marcado por padrão, campo preenchido com o do cadastro).
  // - Resultado em cartão: "CadSUS · por CNS", contador de diferenças, ✓ nos iguais, "Usar" nos diferentes.
  //
  // v1.6.1
  // - Campo "Consultar CadSUS" (CPF ou CNS, editável) no padrão do formulário (input-group + botão primário).
  //
  // v1.6.0
  // - "Verificar no CadSUS" saiu da ficha e foi para o cadastro do munícipe (novo e edição), abaixo
  //   da linha do CPF/CNS: busca na hora, mostra cadastro x CadSUS e "Usar" em cada campo diferente.
  //
  // v1.5.0
  // - Botão "Verificar no CadSUS" no aviso do cadastro (substituído na 1.6.0).
  //
  // v1.4.0
  // - CadSUS no aviso do cadastro (mesma consulta da tela Munícipe › Novo, por CPF ou CNS):
  //   sem CNS / CNS inválido → mostra o CNS do CadSUS; sem CPF → mostra o CPF do CadSUS;
  //   endereço com problema → mostra o endereço do CadSUS. Busca por nome não é usada (erro 500 no wscadsus).
  //
  // v1.3.2
  // - "Atualizar cadastro" abre numa aba nova da mesma janela (não janela separada, não a própria
  //   ficha); depois de salvar a aba fecha sozinha e a ficha refaz o aviso.
  //
  // v1.3.1
  // - Aviso da especialidade volta à frase completa e usa "Clínico/Pediatra/Dentista" (não "CLINICO").
  //
  // v1.3.0
  // - "Atualizar cadastro" abre na mesma aba (igual ao "Editar" nativo); ao salvar volta para a ficha.
  // - Aviso da especialidade x senha de volta embaixo do select (e continua no "Criar Ficha").
  // - Sem botão/painel "Chamadas hoje" (o registro das chamadas continua, por trás).
  //
  // v1.2.3
  // - Textos curtos nos avisos (sem explicações longas).
  //
  // v1.2.2
  // - Removido o aviso de país de nascimento (a recepção não consegue corrigir esse campo).
  //
  // v1.2.1
  // - Sem país de nascimento (do relatório de inconsistências do e-SUS APS/PEC).
  //
  // v1.2.0
  // - Endereço do BPA-I (SIA) no aviso do cadastro: CEP (vazio, inválido ou fora de Guarujá),
  //   município, tipo de logradouro, rua, número (vazio ou texto sem número; S/N e SN são aceitos,
  //   "N" sozinho ainda não confirmado, então não avisa) e bairro.
  // - Botão "Atualizar cadastro" (no aviso e na confirmação do Criar Ficha): abre a edição numa
  //   janela; depois de salvar ela fecha sozinha e a ficha reconfere o cadastro.
  //
  // v1.1.0
  // - "+ Outras especialidades" no mesmo estilo do "+ Outras vias" do Procedimentos PA.
  // - Aviso do cadastro com título "Cadastro desatualizado" (sem falar em glosa).
  // - Especialidade x senha e cadastro desatualizado: confirmação ao clicar em "Criar Ficha"
  //   ("Voltar" / "Continuar mesmo assim"), não mais aviso fixo embaixo do select.
  //
  // v1.0.0
  // Tela: Urgência e Emergência > Recepção (Nuxt, v3guaruja). Ficha: /urgencia_emergencia/atendimentos/:municipeId/chamar
  // 1) Select "Especialidade" (#atendimento.ocupacao_id): só Médico clínico, Médico pediatra e
  //    Cirurgião dentista - clínico geral. "Mostrar todas" libera o resto. Nada é removido do sistema.
  // 2) Aviso senha x especialidade: o tipo da senha vem do Senha Simples (store filas.senha.tipo_atendimento);
  //    sem ele, do prefixo (CN/PD/DT). Só aviso, pode seguir.
  // 3) Chamadas: lê a senha que a própria tela grava no store (filas/defineSenhaChamada) e as respostas
  //    do Senha Simples. Guarda no navegador (48h): quem chamou, horários, quantas vezes, ficha salva.
  //    Ainda NÃO envia ao D1: o Worker om30-ausencias não tem rota para chamadas (só ausência/presença).
  // 4) Glosa: CPF/CNS do munícipe (/v1/buscas/municipes/:id/detalhes) e data da última alteração
  //    (/v1/auditorias/logs, a mesma do rodapé "Atualizado em" da edição; reserva: /v1/auditorias/timestamps).
  // Suporte: OM30Recepcao.diagnostico() no console.

  if (window.__OM30_RECEPCAO_PA__) return;
  window.__OM30_RECEPCAO_PA__ = true;

  const VERSAO = (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.9.0';
  const PREFIX = 'om30-recepcao-pa';
  const STORAGE_CHAMADAS = `${PREFIX}:chamadas-v1`;
  const RETENCAO_MS = 48 * 3600 * 1000;
  const DIAS_CADASTRO_DESATUALIZADO = 365;   // A CONFIRMAR com o faturamento
  const ROTA_RECEPCAO = /^\/urgencia_emergencia\/atendimentos/;
  const ROTA_FICHA = /^\/urgencia_emergencia\/atendimentos(?:_retroativos)?\/(\d+)\/chamar\/?$/;
  const SELECT_ID = 'atendimento.ocupacao_id';
  const STYLE_ID = `${PREFIX}-css`;

  // Especialidades visíveis por padrão (texto do select nativo, normalizado).
  const ESPECIALIDADES_PRINCIPAIS = ['MEDICO CLINICO', 'MEDICO PEDIATRA', 'CIRURGIAO DENTISTA - CLINICO GERAL'];

  const GRUPOS = {
    CLINICO:  { label: 'Clínico',  cor: '#1f6fb2' },
    PEDIATRA: { label: 'Pediatra', cor: '#2b8a3e' },
    DENTISTA: { label: 'Dentista', cor: '#0c8599' },
    OUTRO:    { label: 'Outros',   cor: '#868e96' }
  };
  // Ordem importa: "Cirurgião dentista - clínico geral" é DENTISTA, não CLINICO.
  const GRUPO_POR_TIPO_SENHA = [[/PEDIAT/, 'PEDIATRA'], [/DENTIST|ODONTO/, 'DENTISTA'], [/CLINIC/, 'CLINICO']];
  const GRUPO_POR_PREFIXO = { CN: 'CLINICO', PD: 'PEDIATRA', DT: 'DENTISTA' };   // A CONFIRMAR com a operação
  const GRUPO_POR_OCUPACAO = [[/PEDIATRA/, 'PEDIATRA'], [/DENTISTA/, 'DENTISTA'], [/^MEDICO CLINICO$/, 'CLINICO']];

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const norm = v => clean(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const ms = v => { const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? t : null; };
  const hora = v => { const t = ms(v); return t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'; };
  const dataBr = v => { const t = ms(v); return t ? new Date(t).toLocaleDateString('pt-BR') : '—'; };
  const digitos = v => String(v ?? '').replace(/\D/g, '');
  const nx = () => window.$nuxt || null;
  const store = () => nx()?.$store || null;
  const rotaAtual = () => nx()?.$route?.path || location.pathname;

  const stats = { versao: VERSAO, mutacoesSenha: 0, respostasSenha: 0, chamadasForcadas: 0, fichasSalvas: 0,
    ultimaRespostaSenha: null, ultimoPostFicha: null, glosa: null, erros: [] };
  const anotarErro = (onde, e) => { stats.erros.push({ onde, erro: String(e?.message || e), em: new Date().toISOString() }); if (stats.erros.length > 20) stats.erros.shift(); };

  function usuarioLogado() { try { return clean(store()?.state?.auth?.user?.nome) || null; } catch { return null; } }
  function unidadeAtual() {
    try { const u = store()?.state?.auth?.user?.unidade_atual; return clean(typeof u === 'object' ? (u?.nome || u?.descricao) : u) || null; } catch { return null; }
  }

  // ---------------------------------------------------------------------------
  // Grupo da senha e da especialidade
  // ---------------------------------------------------------------------------
  function grupoPorPrefixo(codigo) {
    const m = norm(codigo).match(/^([A-Z]{2})\d/);
    return m ? GRUPO_POR_PREFIXO[m[1]] || null : null;
  }
  function grupoDaSenha(s) {
    const tipo = norm(s?.tipo_atendimento?.nome);
    for (const [rx, g] of GRUPO_POR_TIPO_SENHA) if (rx.test(tipo)) return g;
    return grupoPorPrefixo(s?.senha);
  }
  function grupoDaOcupacao(texto) {
    const t = norm(texto);
    if (!t) return null;
    for (const [rx, g] of GRUPO_POR_OCUPACAO) if (rx.test(t)) return g;
    return 'OUTRO';
  }

  // ---------------------------------------------------------------------------
  // 3) Registro de chamadas (localStorage, 48h)
  // ---------------------------------------------------------------------------
  function lerChamadas() {
    try { const o = JSON.parse(localStorage.getItem(STORAGE_CHAMADAS) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
    catch { return {}; }
  }
  function gravarChamadas(o) {
    const limite = Date.now() - RETENCAO_MS;
    for (const [k, r] of Object.entries(o)) if (!(r?.atualizadoEm > limite)) delete o[k];
    try { localStorage.setItem(STORAGE_CHAMADAS, JSON.stringify(o)); } catch (e) { anotarErro('gravarChamadas', e); }
  }
  const chaveSenha = s => String(s?.id || `${clean(s?.senha)}|${s?.created_at || ''}`);

  function pareceSenha(o) {
    return o && typeof o === 'object' && typeof o.senha === 'string' && /^[A-Z]{1,4}\d+/i.test(o.senha) && ('chamado_em' in o || 'tipo_atendimento' in o);
  }
  function extrairSenha(d) {
    if (pareceSenha(d)) return d;
    if (pareceSenha(d?.data)) return d.data;
    if (pareceSenha(d?.senha)) return d.senha;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Envio ao Worker om30-senhas (histórico de chamadas central). Desligado enquanto vazio.
  // Fila no localStorage; o servidor ignora repetidos (eventId e mesma chamada nativa).
  // ---------------------------------------------------------------------------
  const SENHAS_API = 'https://ps.worker-senhas.workers.dev';   // ex.: https://om30-senhas.<conta>.workers.dev
  const SENHAS_KEY = String.fromCharCode(83,52,86,67,112,89,48,67,119,115,103,119,109,45,89,82,110,65,102,105,67,53,97,55,65,104,51,120,82,54,80,118,89,84,69,116,102,76,106,104,69,100,66,109,116,104,104,108);   // chave do cliente (secret CLIENT_KEY do Worker)
  const FILA_SENHAS = `${PREFIX}:senhas-fila-v1`;
  const envio = { enviados: 0, recusados: 0, erros: 0, ultimo: null, proximoEm: 0, falhas: 0 };

  function lerFila() { try { const a = JSON.parse(localStorage.getItem(FILA_SENHAS) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
  function gravarFila(a) { try { localStorage.setItem(FILA_SENHAS, JSON.stringify(a.slice(-500))); } catch {} }
  const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

  function baseSenha(s) {
    return { senha: clean(s.senha).toUpperCase(), unidade: norm(unidadeAtual()), criadaEm: s.created_at || null,
      grupo: grupoDaSenha(s) || 'OUTRO', tipoSenha: clean(s.tipo_atendimento?.nome) || null, preferencial: !!s.tipo_atendimento?.preferencial };
  }
  let agendadoEnvio = 0;
  function enfileirar(ev) {
    if (!SENHAS_API || !SENHAS_KEY || !ev?.unidade) return;
    const fila = lerFila(); fila.push(ev); gravarFila(fila);
    clearTimeout(agendadoEnvio); agendadoEnvio = setTimeout(() => enviarFila(), 4000);   // junta eventos próximos numa requisição
  }
  async function enviarFila(keepalive = false) {
    if (!SENHAS_API || !SENHAS_KEY || (!keepalive && Date.now() < envio.proximoEm)) return;
    const executar = async () => {
      for (let i = 0; i < 10; i++) {
        const fila = lerFila();
        if (!fila.length) return;
        const parte = fila.slice(0, 20);   // limite do Worker (≤ 40 consultas por requisição)
        let r;
        try {
          r = await fetch(SENHAS_API.replace(/\/$/, '') + '/v1/eventos', { method: 'POST', mode: 'cors', credentials: 'omit', keepalive,
            headers: { 'Content-Type': 'application/json', 'X-OM30-Key': SENHAS_KEY }, body: JSON.stringify({ eventos: parte }) });
        } catch { envio.erros++; envio.falhas++; envio.proximoEm = Date.now() + Math.min(300000, 15000 * 2 ** Math.min(envio.falhas, 4)); return; }
        envio.ultimo = { http: r.status, em: new Date().toISOString() };
        if (r.ok || r.status === 422 || r.status === 400) {
          // 200: gravado (inválidos individuais vêm em "recusados"); 422/400: lote inteiro inválido, descarta.
          const resto = lerFila().slice(parte.length);
          gravarFila(resto);
          if (r.ok) envio.enviados += parte.length; else envio.recusados += parte.length;
          envio.falhas = 0; envio.proximoEm = 0;
          continue;
        }
        envio.erros++; envio.falhas++;
        envio.proximoEm = Date.now() + (r.status === 401 || r.status === 403 ? 3600000 : Math.min(300000, 15000 * 2 ** Math.min(envio.falhas, 4)));
        return;
      }
    };
    try {
      if (navigator.locks?.request) await navigator.locks.request('om30-senhas-envio', { ifAvailable: true }, async l => { if (l) await executar(); });
      else await executar();
    } catch (e) { anotarErro('enviarFila', e); }
  }
  if (SENHAS_API && SENHAS_KEY) {
    setInterval(() => { if (lerFila().length) enviarFila(); }, 30000);
    window.addEventListener('online', () => enviarFila());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && lerFila().length) enviarFila(true); });
    setTimeout(() => enviarFila(), 5000);
  }

  // forcar: houve um "chamar" (URL de chamada) mas o Senha Simples não mudou chamado_em.
  function registrarSenha(s, { forcar = false } = {}) {
    if (!s?.senha) return;
    try {
      const todas = lerChamadas();
      const chave = chaveSenha(s);
      const r = todas[chave] || {
        senha: clean(s.senha), tipo: clean(s.tipo_atendimento?.nome) || null, preferencial: !!s.tipo_atendimento?.preferencial,
        grupo: grupoDaSenha(s) || 'OUTRO', criadaEm: s.created_at || null, unidade: unidadeAtual(),
        chamadas: [], confirmadoEm: null, fichaSalvaEm: null, fichaSalvaPor: null, especialidade: null, divergente: false
      };
      const em = s.chamado_em || null;
      const jaTem = !!em && r.chamadas.some(c => c.em === em);
      const por = clean(s.usuario?.nome) || usuarioLogado();
      const local = clean(s.local_atendimento?.nome) || null;
      if (em && !jaTem) {
        r.chamadas.push({ em, por, local });
        enfileirar({ tipo: 'chamada', eventId: novoId(), setor: 'RECEPCAO', chamadoEm: em, por, local, ...baseSenha(s) });
      } else if (forcar) {
        const agoraIso = new Date().toISOString(), porF = usuarioLogado() || por;
        r.chamadas.push({ em: agoraIso, por: porF, local, semHorarioNativo: true }); stats.chamadasForcadas++;
        enfileirar({ tipo: 'chamada', eventId: novoId(), setor: 'RECEPCAO', chamadoEm: agoraIso, por: porF, local, rechamadaSemHorario: true, ...baseSenha(s) });
      }
      if (s.confirmado_em && !r.confirmadoEm) r.confirmadoEm = s.confirmado_em;
      if (!r.tipo && s.tipo_atendimento?.nome) { r.tipo = clean(s.tipo_atendimento.nome); r.grupo = grupoDaSenha(s) || r.grupo; }
      r.atualizadoEm = Date.now();
      todas[chave] = r;
      gravarChamadas(todas);
    } catch (e) { anotarErro('registrarSenha', e); }
  }

  function registrarFichaSalva(ocupacaoId) {
    const s = store()?.state?.filas?.senha;
    if (!s?.senha) return;
    try {
      const todas = lerChamadas();
      const chave = chaveSenha(s);
      if (!todas[chave]) { registrarSenha(s); Object.assign(todas, lerChamadas()); }
      const r = todas[chave];
      if (!r) return;
      const sel = document.getElementById(SELECT_ID);
      const opt = sel && [...sel.options].find(o => o.value === String(ocupacaoId ?? sel.value));
      r.fichaSalvaEm = new Date().toISOString();
      r.fichaSalvaPor = usuarioLogado();
      r.especialidade = opt ? clean(opt.text) : (ocupacaoId != null ? String(ocupacaoId) : null);
      const gEsc = opt ? grupoDaOcupacao(opt.text) : null;
      r.divergente = !!(gEsc && r.grupo && r.grupo !== 'OUTRO' && gEsc !== r.grupo);
      r.atualizadoEm = Date.now();
      gravarChamadas(todas);
      stats.fichasSalvas++;
      enfileirar({ tipo: 'ficha', fichaEm: r.fichaSalvaEm, fichaPor: r.fichaSalvaPor, especialidade: r.especialidade, divergente: r.divergente, ...baseSenha(s) });
    } catch (e) { anotarErro('registrarFichaSalva', e); }
  }

  // Respostas HTTP (XHR e fetch): senha devolvida pelo Senha Simples.
  const RX_URL_CHAMADA = /chamar|proxim|rechama/i;
  const ehUrlChamada = (url, metodo) => RX_URL_CHAMADA.test(String(url || '')) && /POST|PUT|PATCH/i.test(metodo || '');
  // Horários de chamada já conhecidos NO ENVIO da requisição. A mutação do store pode registrar a
  // chamada antes do "loadend"; comparar com o envio evita contar a mesma chamada duas vezes.
  function horariosConhecidos() {
    const s = new Set();
    for (const r of Object.values(lerChamadas())) for (const c of r.chamadas || []) if (c.em && !c.semHorarioNativo) s.add(c.em);
    return s;
  }
  function observarResposta(url, metodo, status, dados, corpoEnviado, conhecidosNoEnvio) {
    if (!(status >= 200 && status < 300)) return;
    observarSalvarMunicipe(url, metodo, status);
    const s = extrairSenha(dados);
    if (s) {
      stats.respostasSenha++;
      stats.ultimaRespostaSenha = { url: String(url).replace(/\?.*/, ''), metodo, em: new Date().toISOString() };
      // Chamou de novo e o Senha Simples devolveu o mesmo chamado_em: conta mesmo assim.
      const forcar = !!(conhecidosNoEnvio && s.chamado_em && conhecidosNoEnvio.has(s.chamado_em));
      registrarSenha(s, { forcar });
      return;
    }
    // Ficha salva: POST/PUT em .../atendimentos enquanto a tela é a ficha de chamada.
    if (/POST|PUT/i.test(metodo || '') && /urgencia_emergencia\/atendimentos/.test(String(url)) && ROTA_FICHA.test(rotaAtual())) {
      stats.ultimoPostFicha = { url: String(url).replace(/\?.*/, ''), metodo, em: new Date().toISOString() };
      let corpo = corpoEnviado;
      if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { corpo = null; } }
      const ocup = corpo?.ocupacao_id ?? corpo?.atendimento?.ocupacao_id ?? null;
      registrarFichaSalva(ocup);
    }
  }

  function instalarRede() {
    const proto = window.XMLHttpRequest?.prototype;
    if (proto && !proto.__om30RecepcaoPA) {
      const abrir = proto.open, mandar = proto.send;
      proto.open = function (method, url, ...resto) { this.__om30Recep = { method, url }; return abrir.call(this, method, url, ...resto); };
      proto.send = function (body) {
        const m = this.__om30Recep;
        let conhecidos = null;
        try { if (m && ehUrlChamada(m.url, m.method)) conhecidos = horariosConhecidos(); } catch {}
        if (m) this.addEventListener('loadend', () => {
          try {
            let d = null;
            if (this.responseType === 'json') d = this.response;
            else if (!this.responseType || this.responseType === 'text') { const t = String(this.responseText || '').trim(); if (t.startsWith('{')) d = JSON.parse(t); }
            observarResposta(m.url, m.method, this.status, d, body, conhecidos);
          } catch {}
        }, { once: true });
        return mandar.call(this, body);
      };
      try { Object.defineProperty(proto, '__om30RecepcaoPA', { value: true }); } catch { proto.__om30RecepcaoPA = true; }
    }
    if (typeof window.fetch === 'function' && !window.fetch.__om30RecepcaoPA) {
      const original = window.fetch;
      const novo = function (input, init) {
        const url = typeof input === 'string' ? input : input?.url;
        const metodo = init?.method || input?.method || 'GET';
        let conhecidos = null;
        try { if (ehUrlChamada(url, metodo)) conhecidos = horariosConhecidos(); } catch {}
        return original.apply(this, arguments).then(resp => {
          try {
            if ((resp.headers.get('content-type') || '').includes('json'))
              resp.clone().json().then(d => observarResposta(url, metodo, resp.status, d, init?.body, conhecidos)).catch(() => {});
          } catch {}
          return resp;
        });
      };
      novo.__om30RecepcaoPA = true;
      window.fetch = novo;
    }
  }

  function instalarStore() {
    const st = store();
    if (!st || st.__om30RecepcaoPA) return !!st;
    st.subscribe((m, state) => {
      if (/^filas\/GET_SENHA/.test(m.type)) { stats.mutacoesSenha++; registrarSenha(state?.filas?.senha); agendar(); }
    });
    try { Object.defineProperty(st, '__om30RecepcaoPA', { value: true }); } catch { st.__om30RecepcaoPA = true; }
    registrarSenha(st.state?.filas?.senha);   // senha já chamada quando a página abriu
    return true;
  }

  // ---------------------------------------------------------------------------
  // 1) Filtro de especialidades + 2) aviso senha x especialidade
  // ---------------------------------------------------------------------------
  let mostrarTodas = false;

  function aplicarFiltro(sel) {
    const opcoes = [...sel.options].filter(o => o.value);
    const principais = opcoes.filter(o => ESPECIALIDADES_PRINCIPAIS.includes(norm(o.text)));
    let ocultas = 0;
    for (const o of opcoes) {
      // Sem nenhuma das principais na lista (outra unidade/perfil): não esconde nada.
      const ocultar = !mostrarTodas && principais.length > 0 && !principais.includes(o) && o.value !== sel.value;
      if (o.hidden !== ocultar) o.hidden = ocultar;
      if (ocultar) ocultas++;
    }
    let barra = document.getElementById(`${PREFIX}-esp-barra`);
    const ancora = sel.parentElement;
    if (!barra || barra.parentElement !== ancora) {
      barra?.remove();
      barra = document.createElement('div');
      barra.id = `${PREFIX}-esp-barra`;
      barra.className = `${PREFIX}-esp-barra`;
      barra.addEventListener('click', ev => {
        const a = ev.target.closest('[data-acao="todas"]');
        if (!a) return;
        ev.preventDefault();
        mostrarTodas = !mostrarTodas;
        aplicar();
      });
      ancora.appendChild(barra);
    }
    // Mesmo estilo do "+ Outras vias" do OM30 Procedimentos PA.
    const html = (principais.length && (ocultas || mostrarTodas))
      ? `<button type="button" class="${PREFIX}-morevias" data-acao="todas">${mostrarTodas ? '− Ocultar outras especialidades' : '+ Outras especialidades'}</button>`
      : '';
    if (barra.dataset.html !== html) { barra.innerHTML = html; barra.dataset.html = html; }
  }

  function codigoSenhaDaTela() {
    const label = [...document.querySelectorAll('label, legend')].find(l => norm(l.textContent) === 'SENHA');
    const inp = label && ((label.htmlFor && document.getElementById(label.htmlFor)) || label.parentElement?.querySelector('input'));
    return clean(inp?.value) || null;
  }

  function grupoSenhaDaTela() {
    const codigo = codigoSenhaDaTela();
    const s = store()?.state?.filas?.senha;
    if (s?.senha && (!codigo || norm(s.senha) === norm(codigo))) return { codigo: s.senha, grupo: grupoDaSenha(s), tipo: clean(s.tipo_atendimento?.nome) || null };
    return codigo ? { codigo, grupo: grupoPorPrefixo(codigo), tipo: null } : null;
  }

  // Especialidade escolhida x senha. Só é mostrado ao clicar em "Criar Ficha".
  function divergenciaAtual() {
    const sel = document.getElementById(SELECT_ID);
    const opt = sel?.selectedOptions?.[0];
    const escolhida = opt && opt.value ? clean(opt.text) : null;
    const info = grupoSenhaDaTela();
    const gEsc = escolhida ? grupoDaOcupacao(escolhida) : null;
    if (!(info?.grupo && gEsc && gEsc !== info.grupo)) return null;
    // Nome do grupo ("Clínico", "Pediatra", "Dentista"), não o texto cru do Senha Simples ("CLINICO +80").
    return { codigo: info.codigo, tipoSenha: GRUPOS[info.grupo].label, escolhida };
  }

  const textoDivergencia = div => `<b>Atenção:</b> a senha <b>${esc(div.codigo)}</b> foi tirada como <b>${esc(div.tipoSenha)}</b>, ` +
    `mas a especialidade escolhida é <b>${esc(div.escolhida)}</b>. Confira com o paciente.`;

  // Aviso fixo embaixo do select (além da confirmação no "Criar Ficha").
  function aplicarAvisoEspecialidade(sel) {
    let box = document.getElementById(`${PREFIX}-aviso-esp`);
    const div = divergenciaAtual();
    const html = div ? textoDivergencia(div) : '';
    if (!html) { box?.remove(); return; }
    if (!box || box.parentElement !== sel.parentElement) {
      box?.remove();
      box = document.createElement('div');
      box.id = `${PREFIX}-aviso-esp`;
      box.className = `${PREFIX}-aviso ${PREFIX}-aviso-amarelo`;
      box.setAttribute('role', 'alert');
      sel.parentElement.appendChild(box);
    }
    if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
  }

  // ---------------------------------------------------------------------------
  // 4) Aviso de glosa
  // ---------------------------------------------------------------------------
  function cpfValido(v) {
    const c = digitos(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (const n of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
      const dv = (soma * 10) % 11 % 10;
      if (dv !== Number(c[n])) return false;
    }
    return true;
  }
  function cnsValido(v) {
    const c = digitos(v);
    if (c.length !== 15) return false;
    if (/^[12]/.test(c)) {
      const pis = c.slice(0, 11);
      let soma = 0;
      for (let i = 0; i < 11; i++) soma += Number(pis[i]) * (15 - i);
      let dv = 11 - (soma % 11);
      if (dv === 11) dv = 0;
      const esperado = dv === 10
        ? (() => { const s2 = soma + 2; const d2 = 11 - (s2 % 11); return pis + '001' + String(d2 === 11 ? 0 : d2); })()
        : pis + '000' + String(dv);
      return esperado === c;
    }
    if (/^[789]/.test(c)) {
      let soma = 0;
      for (let i = 0; i < 15; i++) soma += Number(c[i]) * (15 - i);
      return soma % 11 === 0;
    }
    return false;
  }

  // Endereço do BPA-I (SIA): CEP, município, tipo de logradouro, logradouro, número e bairro.
  const FAIXA_CEP_MUNICIPIO = { GUARUJA: [11400000, 11449999] };
  function problemasEndereco(m) {
    const out = [];
    const add = txt => out.push({ nivel: 'alto', endereco: true, txt: 'Endereço: ' + txt });
    const cep = digitos(m.residencia_cep);
    const municipio = norm(m.residencia_municipio?.nome ?? (typeof m.residencia_municipio === 'string' ? m.residencia_municipio : ''));
    const temMunicipio = !!(municipio || m.residencia_municipio?.id || m.residencia_municipio_id);
    const temTipo = !!(m.tipo_logradouro?.id || m.tipo_logradouro?.nome || m.tipo_logradouro_id || (typeof m.tipo_logradouro === 'string' && clean(m.tipo_logradouro)));
    const logradouro = clean(m.residencia_logradouro);
    const numero = norm(m.residencia_numero).replace(/\s+/g, '');
    const bairro = clean(m.residencia_bairro);
    if (!cep) add('sem CEP');
    else if (cep.length !== 8 || /^(\d)\1{7}$/.test(cep)) add('CEP inválido');
    else if (FAIXA_CEP_MUNICIPIO[municipio]) {
      const [ini, fim] = FAIXA_CEP_MUNICIPIO[municipio], n = Number(cep);
      if (n < ini || n > fim) add(`CEP não é de ${clean(m.residencia_municipio?.nome) || municipio}`);
    }
    if (!temMunicipio) add('sem município');
    if (!temTipo) add('sem tipo de logradouro');
    if (logradouro.length < 3) add('sem rua');
    if (!numero) add('sem número');
    // S/N (ou SN) é aceito (confirmado com a operação). "N" sozinho ainda não foi confirmado: por ora não avisa.
    else if (!/\d/.test(numero) && !/^S\/?N$/.test(numero) && numero !== 'N') add('número inválido');
    if (!bairro) add('sem bairro');
    return out;
  }

  // ---------------------------------------------------------------------------
  // CadSUS: mesma consulta da tela Munícipe › Novo (POST wscadsus /v1/pdq/consultar, token do store).
  // ---------------------------------------------------------------------------
  const CADSUS_URL = 'https://wscadsus.saudesimples.net/v1/pdq/consultar';
  const fmtCpf = d => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  const fmtCns = d => `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)} ${d.slice(11)}`;
  const fmtCep = d => d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;

  async function tokenCadsus() {
    const st = store();
    let t = st?.state?.cadSus?.cadSusToken;
    if (!t) { try { await st?.dispatch('cadSus/fetchCadsusToken'); } catch {} t = st?.state?.cadSus?.cadSusToken; }
    return typeof t === 'string' && t ? t : null;
  }

  // { http, lista } — http 0 = sem token / sem rede / demorou.
  async function buscarCadsus(busca) {
    const tok = await tokenCadsus();
    if (!tok) { stats.cadsus = { ok: false, motivo: 'sem token', em: new Date().toISOString() }; return { http: 0, lista: null }; }
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const limite = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
    try {
      const r = await fetch(CADSUS_URL, { method: 'POST', signal: ctrl?.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify(busca) });
      const lista = r.ok ? await r.json().catch(() => null) : null;
      stats.cadsus = { ok: r.ok, http: r.status, por: Object.keys(busca)[0], total: Array.isArray(lista) ? lista.length : null, em: new Date().toISOString() };
      return { http: r.status, lista: Array.isArray(lista) ? lista : null };
    } catch (e) { anotarErro('cadsus', e); return { http: 0, lista: null }; }
    finally { if (limite) clearTimeout(limite); }
  }

  // Devolve a pessoa só quando o CadSUS responde exatamente uma.
  async function consultarCadsus(busca) {
    const { lista } = await buscarCadsus(busca);
    return lista && lista.length === 1 ? lista[0] : null;
  }

  // Campos diferentes entre o cadastro (/detalhes) e o CadSUS.
  const dataIso = v => {
    const s = clean(v);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  };
  const isoBr = s => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s;
  // Todas as linhas cadastro x CadSUS (igual = true quando batem). m = formulário/detalhes, p = CadSUS.
  function linhasCadsus(m, p) {
    const out = [];
    const linha = (chave, campo, a, b, igual) => out.push({ chave, campo, cadastro: a || '—', cadsus: b || '—', igual: igual || !b });
    const pCns = digitos(p.codigo_cns), mCns = digitos(m.codigo_cns);
    linha('cns', 'CNS', mCns ? fmtCns(mCns) : '', pCns ? fmtCns(pCns) : '', pCns === mCns);
    const pCpf = digitos(p.cpf_numero), mCpf = digitos(m.cpf_numero);
    linha('cpf', 'CPF', mCpf ? fmtCpf(mCpf) : '', pCpf ? fmtCpf(pCpf) : '', pCpf === mCpf);
    linha('nome', 'Nome', clean(m.nome), clean(p.nome), norm(p.nome) === norm(m.nome));
    const pNasc = dataIso(p.data_nascimento), mNasc = dataIso(m.data_nascimento);
    linha('nascimento', 'Nascimento', isoBr(mNasc), isoBr(pNasc), pNasc === mNasc);
    linha('mae', 'Mãe', clean(m.nome_mae), clean(p.nome_mae), norm(p.nome_mae) === norm(m.nome_mae));
    const chaveEnd = x => [digitos(x.residencia_cep), norm(x.residencia_logradouro), norm(x.residencia_numero).replace(/\s+/g, ''), norm(x.residencia_bairro)].join('|');
    linha('endereco', 'Endereço', enderecoCadsus(m), enderecoCadsus(p), chaveEnd(p) === chaveEnd(m));
    const pCel = digitos(p.telefone_celular), mCel = digitos(m.telefone_celular);
    linha('celular', 'Celular', clean(m.telefone_celular), clean(p.telefone_celular), pCel === mCel);
    return out;
  }
  const compararCadsus = (m, p) => linhasCadsus(m, p).filter(l => !l.igual);

  // ---------------------------------------------------------------------------
  // Cadastro do munícipe (novo e edição): "Verificar no CadSUS".
  // A janela nativa "Informações do Indivíduo" quase nunca aparece (só no cadastro novo, e nem
  // sempre); aqui a busca é feita na hora e cada campo diferente tem "Usar" (só preenche o
  // formulário; para gravar continua sendo "Atualizar Munícipe"/"Criar Munícipe").
  // ---------------------------------------------------------------------------
  const ROTA_CADASTRO = /^\/municipes\/(?:new|\d+\/edit)\/?$/;
  let pessoaCadsus = null;

  function formMunicipe() {
    const vistos = new Set();
    let achou = null;
    const visitar = (vm, d) => {
      if (!vm || achou || vistos.has(vm) || d > 90) return;
      vistos.add(vm);
      if (vm.$options?.methods?.buscarMunicipe && vm.resource) { achou = vm; return; }
      for (const c of vm.$children || []) visitar(c, d + 1);
    };
    visitar(nx()?.$root, 0);
    return achou;
  }

  function garantirBotaoCadastro() {
    const linha = document.getElementById('municipe_identificacao_cpf_numero')?.closest('.row');
    if (!linha) return;
    let barra = document.getElementById(`${PREFIX}-cad-cadsus`);
    if (barra && barra.previousElementSibling === linha) return;
    barra?.remove();
    barra = document.createElement('div');
    barra.id = `${PREFIX}-cad-cadsus`;
    barra.className = 'row';
    // Mesmo padrão dos campos do formulário: coluna col-md-6, label "d-block", select + input + botão.
    barra.innerHTML = `
      <div class="col-xs-12 col-sm-12 col-md-6 col-lg-6 form-group">
        <label class="d-block" for="${PREFIX}-cadsus-busca">Consultar CadSUS</label>
        <div class="input-group">
          <select class="form-control ${PREFIX}-cadsus-tipo" aria-label="Consultar por">
            <option value="cns">CNS</option>
            <option value="cpf">CPF</option>
          </select>
          <input type="text" id="${PREFIX}-cadsus-busca" class="form-control" autocomplete="off" inputmode="numeric">
          <span class="input-group-append">
            <button type="button" class="btn btn-primary" data-acao="verificar-cadsus"><span class="icon zmdi zmdi-search"></span> Buscar</button>
          </span>
        </div>
        <small class="${PREFIX}-cadsus-msg"></small>
      </div>
      <div class="col-12"><div class="${PREFIX}-cc-lugar"></div></div>`;
    const campo = barra.querySelector(`#${PREFIX}-cadsus-busca`);
    const tipo = barra.querySelector(`.${PREFIX}-cadsus-tipo`);
    campo.addEventListener('input', () => { campo.value = mascaraBusca(tipo.value, campo.value); });
    campo.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); verificarNoCadsus(barra); } });
    tipo.addEventListener('change', () => { preencherBusca(barra); campo.focus(); });
    barra.addEventListener('click', ev => {
      const b = ev.target.closest('[data-acao]');
      if (!b) return;
      ev.preventDefault();
      const acao = b.dataset.acao;
      if (acao === 'verificar-cadsus') verificarNoCadsus(barra);
      else if (acao === 'usar') usarDadoCadsus(b.dataset.chave, b);
      else if (acao === 'usar-todos') { for (const x of barra.querySelectorAll('[data-acao="usar"]:not(:disabled)')) usarDadoCadsus(x.dataset.chave, x); b.disabled = true; }
      else if (acao === 'fechar-cadsus') barra.querySelector(`.${PREFIX}-cc-lugar`).innerHTML = '';
    });
    linha.insertAdjacentElement('afterend', barra);
    preencherBusca(barra);   // CNS marcado por padrão, já com o CNS do cadastro
  }

  // Máscara enquanto digita: CPF 000.000.000-00 (11 números), CNS 000 0000 0000 0000 (15 números).
  function mascaraBusca(tipo, valor) {
    if (tipo === 'cpf') {
      const d = digitos(valor).slice(0, 11);
      return d.slice(0, 3) + (d.length > 3 ? '.' + d.slice(3, 6) : '') + (d.length > 6 ? '.' + d.slice(6, 9) : '') + (d.length > 9 ? '-' + d.slice(9) : '');
    }
    const d = digitos(valor).slice(0, 15);
    return [d.slice(0, 3), d.slice(3, 7), d.slice(7, 11), d.slice(11)].filter(Boolean).join(' ');
  }

  function preencherBusca(barra) {
    const tipo = barra.querySelector(`.${PREFIX}-cadsus-tipo`).value;
    const campo = barra.querySelector(`#${PREFIX}-cadsus-busca`);
    const fb = formMunicipe(), r = fb?.resource || {};
    campo.maxLength = tipo === 'cpf' ? 14 : 18;
    campo.placeholder = tipo === 'cpf' ? '000.000.000-00' : '000 0000 0000 0000';
    campo.value = mascaraBusca(tipo, tipo === 'cpf' ? (fb?.cpf_numero || r.cpf_numero) : (fb?.codigo_cns || r.codigo_cns));
    mensagemCadsus(barra, '');
  }

  function mensagemCadsus(barra, texto, erro = false) {
    const el = barra.querySelector(`.${PREFIX}-cadsus-msg`);
    el.textContent = texto;
    el.classList.toggle(`${PREFIX}-cadsus-erro`, erro);
  }

  // Só para conferir o layout (console): abre a janela com uma pessoa fictícia.
  const PESSOA_FICTICIA = { codigo_cns: '898001160660008', cpf_numero: '529.982.247-25', nome: 'PESSOA FICTICIA DE TESTE', data_nascimento: '1990-01-01',
    nome_mae: 'MAE FICTICIA DE TESTE', residencia_cep: '11410000', tipo_logradouro: { nome: 'RUA' }, residencia_logradouro: 'EXEMPLO',
    residencia_numero: '100', residencia_bairro: 'CENTRO', residencia_municipio: { nome: 'GUARUJA' }, telefone_celular: '13900000000' };

  async function verificarNoCadsus(barra, pessoaTeste) {
    const fb = formMunicipe();
    const m = fb?.resource;
    if (!m) { mensagemCadsus(barra, 'Formulário não encontrado.', true); return; }
    const tipo = barra.querySelector(`.${PREFIX}-cadsus-tipo`).value;
    const d = digitos(barra.querySelector(`#${PREFIX}-cadsus-busca`).value);
    let busca = null;
    if (!pessoaTeste) {
      if (tipo === 'cns') {
        if (d.length !== 15) { mensagemCadsus(barra, 'CNS precisa ter 15 números.', true); return; }
        busca = { codigo_cns: d };
      } else {
        if (d.length !== 11 || !cpfValido(d)) { mensagemCadsus(barra, 'CPF inválido.', true); return; }
        busca = { cpf_numero: fmtCpf(d) };
      }
    }
    mensagemCadsus(barra, 'Consultando CadSUS…');
    const { http, lista } = pessoaTeste ? { http: 200, lista: [pessoaTeste] } : await buscarCadsus(busca);
    if (!lista) { mensagemCadsus(barra, http === 401 ? 'CadSUS: falha de autenticação.' : http === 503 ? 'CadSUS fora do ar.' : 'Erro ao consultar o CadSUS.', true); return; }
    if (!lista.length) { mensagemCadsus(barra, `Nenhum cadastro no CadSUS com esse ${tipo.toUpperCase()}.`, true); return; }
    if (lista.length > 1) { mensagemCadsus(barra, `Mais de um cadastro no CadSUS (${lista.length}).`, true); return; }
    mensagemCadsus(barra, '');
    pessoaCadsus = lista[0];
    mostrarCartaoCadsus(barra, m, pessoaCadsus);
  }

  // Resultado na própria página, embaixo da busca: blocos lado a lado (rótulo + Usar / valor do CadSUS em
  // negrito / linha fina / "Atual: …" em cinza). Usar fica na linha do rótulo para não se misturar com o valor.
  function mostrarCartaoCadsus(barra, m, p) {
    const lugar = barra.querySelector(`.${PREFIX}-cc-lugar`);
    const linhas = linhasCadsus(m, p);
    const difs = linhas.filter(l => !l.igual);
    lugar.innerHTML = `
      <div class="${PREFIX}-cc">
        <div class="${PREFIX}-cc-topo">
          <span>CadSUS</span>
          <span class="${PREFIX}-cc-resumo">${difs.length ? `${difs.length} diferente${difs.length > 1 ? 's' : ''} do cadastro` : 'Igual ao cadastro'}</span>
          <button type="button" class="${PREFIX}-cc-x" data-acao="fechar-cadsus" aria-label="Fechar">×</button>
        </div>
        <div class="${PREFIX}-cc-corpo">
          ${linhas.map(l => `
            <div class="${PREFIX}-cc-item${l.igual ? '' : ` ${PREFIX}-cc-dif`}${l.chave === 'endereco' ? ` ${PREFIX}-cc-largo` : ''}">
              <div class="${PREFIX}-cc-rot"><span>${esc(l.campo)}</span>${l.igual ? '' : `<button type="button" class="${PREFIX}-cc-usar" data-acao="usar" data-chave="${l.chave}">Usar</button>`}</div>
              <div class="${PREFIX}-cc-val">${esc(l.cadsus)}</div>
              ${l.igual ? '' : `<div class="${PREFIX}-cc-atual">Atual: ${esc(l.cadastro)}</div>`}
            </div>`).join('')}
        </div>
        ${difs.length > 1 ? `<div class="${PREFIX}-cc-rodape"><button type="button" class="btn btn-primary btn-sm" data-acao="usar-todos">Usar todos do CadSUS</button></div>` : ''}
      </div>`;
  }

  const fmtCel = d => d.length === 11 ? `(${d.slice(0, 2)})${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)})${d.slice(2, 6)}-${d.slice(6)}` : d;
  function usarDadoCadsus(chave, botao) {
    const fb = formMunicipe(), p = pessoaCadsus;
    if (!fb?.resource || !p) return;
    const r = fb.resource, set = (k, v) => fb.$set(r, k, v);
    if (chave === 'cns') { const v = digitos(p.codigo_cns); set('codigo_cns', v); if ('codigo_cns' in fb.$data) fb.codigo_cns = v; }
    else if (chave === 'cpf') { const v = fmtCpf(digitos(p.cpf_numero)); set('cpf_numero', v); if ('cpf_numero' in fb.$data) fb.cpf_numero = v; }
    else if (chave === 'nome') set('nome', clean(p.nome).toUpperCase());
    else if (chave === 'nascimento') set('data_nascimento', dataIso(p.data_nascimento));
    else if (chave === 'mae') set('nome_mae', clean(p.nome_mae).toUpperCase());
    else if (chave === 'celular') set('telefone_celular', fmtCel(digitos(p.telefone_celular)));
    else if (chave === 'endereco') {
      // O CEP dispara a busca de endereço nativa; rua/número/bairro entram depois para não serem sobrescritos.
      set('residencia_cep', fmtCep(digitos(p.residencia_cep)));
      setTimeout(() => {
        if (clean(p.residencia_logradouro)) set('residencia_logradouro', clean(p.residencia_logradouro).toUpperCase());
        if (clean(p.residencia_numero)) set('residencia_numero', clean(p.residencia_numero).toUpperCase());
        if (clean(p.residencia_bairro)) set('residencia_bairro', clean(p.residencia_bairro).toUpperCase());
        if (clean(p.residencia_complemento)) set('residencia_complemento', clean(p.residencia_complemento).toUpperCase());
      }, 1500);
    }
    botao.disabled = true;
    botao.textContent = 'Usado';
  }

  function enderecoCadsus(p) {
    const rua = [clean(p.tipo_logradouro?.nome), clean(p.residencia_logradouro)].filter(Boolean).join(' ');
    const num = clean(p.residencia_numero), bairro = clean(p.residencia_bairro), cep = digitos(p.residencia_cep);
    const cidade = clean(p.residencia_municipio?.nome);
    if (!clean(p.residencia_logradouro) && !cep) return null;
    return `${rua}${num ? ', ' + num : ''}${bairro ? ' - ' + bairro : ''}${cep ? ' · CEP ' + fmtCep(cep) : ''}${cidade ? ' · ' + cidade : ''}`;
  }

  // Telefone de mentira: todos iguais (ou iguais menos um), pares/trincas repetidos, sequência
  // crescente/decrescente, ou curto demais. Confere sem DDD e, no celular, também sem o 9 da frente.
  function telefoneSuspeito(valor) {
    let d = digitos(valor);
    if (!d) return false;
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);   // +55
    const local = d.length >= 10 ? d.slice(2) : d;                                     // sem DDD
    if (local.length < 8) return true;
    const candidatos = [local];
    if (local.length === 9 && local[0] === '9') candidatos.push(local.slice(1));
    return candidatos.some(c => {
      const cont = {};
      for (const ch of c) cont[ch] = (cont[ch] || 0) + 1;
      if (Math.max(...Object.values(cont)) >= c.length - 2) return true;                // 99999999 / 99999997 / 99999987
      if (Object.keys(cont).length <= 2) return true;                                    // 9899-8989 (só 2 algarismos)
      for (let p = 2; p <= 4; p++) if ([...c].every((ch, i) => ch === c[i % p])) return true;   // 98989898 / 123123123 / 12341234
      if (/(\d)\1{4}/.test(c)) return true;                                              // 99999-1234 (5 iguais seguidos)
      const passos = [...c].slice(1).map((ch, i) => (Number(ch) - Number(c[i]) + 10) % 10);
      if (passos.every(x => x === 1) || passos.every(x => x === 9)) return true;         // 12345678 / 987654321
      // 6+ números em sequência no meio (99654-3210): 5 passos iguais de +1 ou -1 seguidos.
      let seq = 1;
      for (let i = 1; i < passos.length; i++) {
        seq = (passos[i] === passos[i - 1] && (passos[i] === 1 || passos[i] === 9)) ? seq + 1 : 1;
        if (seq >= 5) return true;
      }
      return false;
    });
  }

  const corpo = r => (r?.data && typeof r.data === 'object' && 'data' in r.data) ? r.data.data : r?.data;
  const glosaCache = new Map();   // municipeId -> { em, promessa }

  async function lerGlosa(id) {
    const ax = nx()?.$axios;
    if (!ax) throw new Error('axios da página indisponível');
    const [det, logs, ts] = await Promise.allSettled([
      ax.get(`v1/buscas/municipes/${id}/detalhes`),
      ax.get('v1/auditorias/logs', { params: { resource_id: id, resource_source: 'municipes', per_page: 5, page: 1 } }),
      ax.get('v1/auditorias/timestamps', { params: { id, type: 'municipe' } })
    ]);
    if (det.status !== 'fulfilled') throw det.reason;
    const m = corpo(det.value) || {};
    let ultima = null, fonte = null;
    if (logs.status === 'fulfilled') {
      const b = corpo(logs.value);
      const lista = Array.isArray(b) ? b : Array.isArray(b?.logs) ? b.logs : [];
      for (const l of lista) { const t = ms(l?.created_at); if (t && (!ultima || t > ultima)) ultima = t; }
      if (ultima) fonte = 'histórico de alterações';
    }
    if (!ultima && ts.status === 'fulfilled') {
      const b = corpo(ts.value) || {};
      ultima = ms(b.updated_at) || ms(b.created_at);
      if (ultima) fonte = 'data do cadastro';
    }
    const cpf = digitos(m.cpf_numero), cns = digitos(m.codigo_cns), prov = digitos(m.cartao_provisorio);
    const itens = [];
    const cpfOk = !!cpf && cpfValido(cpf), cnsOk = !!cns && cnsValido(cns);
    if (!cpf) itens.push({ nivel: 'alto', tipo: 'cpf', txt: 'Sem CPF' });
    else if (!cpfOk) itens.push({ nivel: 'alto', tipo: 'cpf', txt: 'CPF inválido' });
    if (!cns && prov) itens.push({ nivel: 'alto', tipo: 'cns', txt: 'Só cartão provisório' });
    else if (!cns) itens.push({ nivel: 'alto', tipo: 'cns', txt: 'Sem CNS' });
    else if (!cnsOk) itens.push({ nivel: 'alto', tipo: 'cns', txt: 'CNS inválido' });
    itens.push(...problemasEndereco(m));
    if (!digitos(m.telefone_celular)) itens.push({ nivel: 'alto', txt: 'Sem celular' });
    else if (telefoneSuspeito(m.telefone_celular)) itens.push({ nivel: 'alto', txt: `Confirmar celular: ${clean(m.telefone_celular)}` });
    if (telefoneSuspeito(m.telefone_residencial)) itens.push({ nivel: 'alto', txt: `Confirmar telefone: ${clean(m.telefone_residencial)}` });
    // Completa com o CadSUS (só por CPF ou CNS válidos; a busca por nome está com erro 500 no wscadsus).
    const temEndereco = itens.some(i => i.endereco);
    if ((cpfOk && (!cnsOk || temEndereco)) || (!cpfOk && cnsOk)) {
      const p = await consultarCadsus(cpfOk ? { cpf_numero: fmtCpf(cpf) } : { codigo_cns: cns });
      if (p) {
        const pCns = digitos(p.codigo_cns), pCpf = digitos(p.cpf_numero);
        const itCns = itens.find(i => i.tipo === 'cns'), itCpf = itens.find(i => i.tipo === 'cpf');
        if (itCns && pCns && cnsValido(pCns) && pCns !== cns) itCns.txt += ` · CadSUS: ${fmtCns(pCns)}`;
        if (itCpf && pCpf && cpfValido(pCpf) && pCpf !== cpf) itCpf.txt += ` · CadSUS: ${fmtCpf(pCpf)}`;
        const end = temEndereco ? enderecoCadsus(p) : null;
        if (end) {
          const ult = itens.map(i => !!i.endereco).lastIndexOf(true);
          itens.splice(ult + 1, 0, { nivel: 'info', txt: `Endereço no CadSUS: ${end}` });
        }
      }
    }
    if (ultima) {
      const dias = Math.floor((Date.now() - ultima) / 86400000);
      if (dias > DIAS_CADASTRO_DESATUALIZADO) {
        const meses = Math.floor(dias / 30);
        itens.push({ nivel: 'medio', txt: `Última atualização em ${dataBr(ultima)}` });
      }
    }
    return { id, itens, ultima, fonte, semData: !ultima, municipe: m };
  }

  function avaliarGlosa(id) {
    const c = glosaCache.get(id);
    if (c && Date.now() - c.em < 60000) return c.promessa;
    const promessa = lerGlosa(id).then(r => { stats.glosa = { id, itens: r.itens.length, em: new Date().toISOString() }; return r; })
      .catch(e => { anotarErro('glosa', e); return null; });   // tenta de novo só depois de 60 s
    glosaCache.set(id, { em: Date.now(), promessa });
    return promessa;
  }

  function cartaoCidadao() {
    const h = [...document.querySelectorAll('h1,h2,h3,h4,h5,.card-title,.portlet__head-title,div,span')]
      .find(e => e.childElementCount === 0 && clean(e.textContent) === 'Informações do Cidadão');
    return h ? (h.closest('.panel, .card, .portlet, .kt-portlet, [class*="portlet"]') || h.parentElement) : null;
  }

  let glosaRender = null;   // { id, html }
  let glosaAtual = null;    // { id, r } — usado na confirmação do "Criar Ficha"
  function renderGlosa(id, r) {
    if (!r || !ROTA_FICHA.test(rotaAtual()) || ROTA_FICHA.exec(rotaAtual())[1] !== id) return;
    const card = cartaoCidadao();
    if (!card?.parentElement) return;
    let box = document.getElementById(`${PREFIX}-glosa`);
    const html = r.itens.length
      ? `<div class="${PREFIX}-glosa-titulo">Cadastro desatualizado</div><ul>${r.itens.map(i => `<li class="${PREFIX}-n-${i.nivel}">${esc(i.txt)}</li>`).join('')}</ul>` +
        `<div class="${PREFIX}-glosa-rodape"><button type="button" class="btn btn-sm btn-primary" data-acao="atualizar-cadastro">Atualizar cadastro</button></div>`
      : `<span>Cadastro ok${r.ultima ? ` · atualizado em ${dataBr(r.ultima)}` : ''}</span>`;
    if (!box || box.nextElementSibling !== card) {
      box?.remove();
      box = document.createElement('div');
      box.id = `${PREFIX}-glosa`;
      box.addEventListener('click', ev => {
        if (!ev.target.closest('[data-acao="atualizar-cadastro"]')) return;
        ev.preventDefault();
        abrirEdicaoCadastro(id);
      });
      card.parentElement.insertBefore(box, card);
    }
    box.className = `${PREFIX}-aviso ${r.itens.length ? `${PREFIX}-aviso-vermelho` : `${PREFIX}-aviso-verde`}`;
    if (r.itens.length) box.setAttribute('role', 'alert'); else box.removeAttribute('role');
    if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
    glosaRender = { id, html };
  }

  // ---------------------------------------------------------------------------
  // "Atualizar cadastro"
  // ---------------------------------------------------------------------------
  // Abre a edição numa ABA nova da mesma janela (window.open sem width/height; com tamanho o
  // navegador cria uma janela separada). Ao salvar, a aba avisa a ficha e fecha sozinha.
  const CANAL_CADASTRO = `${PREFIX}:cadastro`;
  const SESSAO_AUTOFECHAR = `${PREFIX}:autofechar`;
  const ROTA_EDICAO = /^\/municipes\/(\d+)\/edit\/?$/;
  const canalCadastro = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CANAL_CADASTRO) : null;

  function abrirEdicaoCadastro(id) {
    const url = `/municipes/${id}/edit?redirect_uri=${encodeURIComponent(rotaAtual())}&om30_autofechar=1`;
    const aba = window.open(url, `${PREFIX}-edicao-${id}`);
    aba?.focus();
  }

  // Na ficha: a aba de edição avisou que salvou.
  function recarregarCadastro(id) {
    glosaCache.delete(String(id));
    glosaRender = null; glosaAtual = null;
    try {   // atualiza também o cartão nativo "Informações do Cidadão"
      for (const el of document.querySelectorAll('*')) {
        const vm = el.__vue__;
        if (vm?.$options?.name === 'CardIdentificacao' && typeof vm.getInformacoesMunicipe === 'function') { vm.getInformacoesMunicipe(); break; }
      }
    } catch {}
    aplicar();
  }

  // Na aba de edição aberta pelo botão.
  let edicaoSalva = false;
  function idAutofechar() { try { return sessionStorage.getItem(SESSAO_AUTOFECHAR); } catch { return null; } }
  function avisarEFechar() {
    const id = idAutofechar();
    if (!id) return;
    try { sessionStorage.removeItem(SESSAO_AUTOFECHAR); } catch {}
    try { canalCadastro?.postMessage({ tipo: 'cadastro-atualizado', id }); } catch {}
    setTimeout(() => window.close(), 400);
  }
  function prepararAutofechar() {
    const m = ROTA_EDICAO.exec(location.pathname);
    if (new URLSearchParams(location.search).get('om30_autofechar') === '1' && m && window.opener) {
      try { sessionStorage.setItem(SESSAO_AUTOFECHAR, m[1]); } catch {}
    }
    if (!idAutofechar()) return;
    // Depois de salvar, o Saúde Simples sai da edição (redirect_uri): é a hora de fechar.
    nx()?.$router?.afterEach(to => { if (!ROTA_EDICAO.test(to.path)) avisarEFechar(); });
  }
  function observarSalvarMunicipe(url, metodo, status) {
    if (!idAutofechar() || !/PUT|PATCH|POST/i.test(metodo || '') || !(status >= 200 && status < 300)) return;
    if (!/\/municipes\/\d+(?:\/[a-z_]+)?\/?(?:\?|$)/.test(String(url))) return;
    edicaoSalva = true;
    // Reserva: se a tela não sair da edição sozinha depois de salvar, fecha mesmo assim.
    setTimeout(() => { if (edicaoSalva && idAutofechar() && ROTA_EDICAO.test(rotaAtual())) avisarEFechar(); }, 2500);
  }


  // ---------------------------------------------------------------------------
  // Confirmação ao clicar em "Criar Ficha" (especialidade x senha e cadastro desatualizado)
  // ---------------------------------------------------------------------------
  let liberarCriarFicha = false;
  const ehBotaoCriarFicha = el => !!el && el.tagName === 'BUTTON' && norm(el.innerText) === 'CRIAR FICHA';
  const botaoCriarFicha = () => [...document.querySelectorAll('button')].find(b => b.offsetParent && ehBotaoCriarFicha(b)) || null;

  function pendenciasDaFicha() {
    const m = ROTA_FICHA.exec(rotaAtual());
    if (!m) return null;
    const div = divergenciaAtual();
    const cad = glosaAtual?.id === m[1] ? glosaAtual.r?.itens || [] : [];
    return div || cad.length ? { div, cad } : null;
  }

  function fecharConfirmacao() { document.getElementById(`${PREFIX}-confirma`)?.remove(); }

  function abrirConfirmacao({ div, cad }, aoContinuar) {
    fecharConfirmacao();
    const fundo = document.createElement('div');
    fundo.id = `${PREFIX}-confirma`;
    fundo.innerHTML = `
      <div class="${PREFIX}-conf-caixa" role="alertdialog" aria-modal="true" aria-labelledby="${PREFIX}-conf-tit">
        <div class="${PREFIX}-conf-icone">!</div>
        <div id="${PREFIX}-conf-tit" class="${PREFIX}-conf-tit">Atenção</div>
        ${div ? `<div class="${PREFIX}-conf-bloco">
          <b>Especialidade diferente da senha</b>
          <div>A senha <b>${esc(div.codigo)}</b> foi tirada como <b>${esc(div.tipoSenha)}</b>, mas a especialidade escolhida é <b>${esc(div.escolhida)}</b>.</div>
        </div>` : ''}
        ${cad.length ? `<div class="${PREFIX}-conf-bloco">
          <b>Cadastro desatualizado</b>
          <ul>${cad.map(i => `<li>${esc(i.txt)}</li>`).join('')}</ul>
        </div>` : ''}
        <div class="${PREFIX}-conf-acoes">
          <button type="button" class="btn btn-default" data-acao="voltar">Voltar</button>
          ${cad.length ? '<button type="button" class="btn btn-secondary" data-acao="atualizar-cadastro">Atualizar cadastro</button>' : ''}
          <button type="button" class="btn btn-primary" data-acao="continuar">Continuar mesmo assim</button>
        </div>
      </div>`;
    const sair = () => { fecharConfirmacao(); document.removeEventListener('keydown', tecla, true); };
    const tecla = ev => { if (ev.key === 'Escape') { ev.preventDefault(); sair(); } };
    fundo.addEventListener('click', ev => {
      if (ev.target === fundo || ev.target.closest('[data-acao="voltar"]')) { sair(); return; }
      if (ev.target.closest('[data-acao="atualizar-cadastro"]')) {
        sair();
        const m = ROTA_FICHA.exec(rotaAtual());
        if (m) abrirEdicaoCadastro(m[1]);
        return;
      }
      if (ev.target.closest('[data-acao="continuar"]')) { sair(); aoContinuar(); }
    });
    document.addEventListener('keydown', tecla, true);
    document.body.appendChild(fundo);
    fundo.querySelector('[data-acao="voltar"]')?.focus();
  }

  function interceptarCriarFicha(ev) {
    if (liberarCriarFicha) return;
    const btn = ev.type === 'submit' ? botaoCriarFicha() : ev.target?.closest?.('button');
    if (ev.type === 'click' && !ehBotaoCriarFicha(btn)) return;
    const p = pendenciasDaFicha();
    if (!p) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    abrirConfirmacao(p, () => {
      const alvo = botaoCriarFicha();
      if (!alvo) return;
      liberarCriarFicha = true;
      try { alvo.click(); } finally { liberarCriarFicha = false; }
    });
  }

  // ---------------------------------------------------------------------------
  // Painel de chamadas
  // ---------------------------------------------------------------------------
  function chamadasDeHoje() {
    const hoje = new Date().toDateString();
    return Object.values(lerChamadas())
      .filter(r => r.chamadas?.length || r.fichaSalvaEm)
      .filter(r => new Date(r.chamadas?.[0]?.em || r.fichaSalvaEm || r.criadaEm || 0).toDateString() === hoje)
      .sort((a, b) => (ms(b.chamadas?.at(-1)?.em) || 0) - (ms(a.chamadas?.at(-1)?.em) || 0));
  }

  function linhaCsv(r) {
    const ult = r.chamadas?.at(-1);
    return [r.senha, r.tipo || '', GRUPOS[r.grupo]?.label || r.grupo, r.criadaEm || '', r.chamadas?.length || 0,
      r.chamadas?.[0]?.em || '', ult?.em || '', ult?.por || '', ult?.local || '', r.confirmadoEm || '',
      r.fichaSalvaEm || '', r.fichaSalvaPor || '', r.especialidade || '', r.divergente ? 'SIM' : '', r.unidade || '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(';');
  }
  function csv(lista = Object.values(lerChamadas())) {
    const cab = 'senha;tipo_senha;grupo;senha_criada_em;vezes_chamada;primeira_chamada;ultima_chamada;chamado_por;guiche;confirmado_em;ficha_salva_em;ficha_salva_por;especialidade_escolhida;divergente;unidade';
    return '﻿' + [cab, ...lista.map(linhaCsv)].join('\r\n');
  }

  // ---------------------------------------------------------------------------
  // Estilo
  // ---------------------------------------------------------------------------
  function estilo() {
    if (document.getElementById(STYLE_ID)) return;
    const css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = `
      .${PREFIX}-esp-barra { margin-top: 2px; }
      .${PREFIX}-morevias { display: inline-block; margin-top: 5px; border: 0; background: transparent; color: #285970;
        padding: 2px 0; font-size: 12px; font-weight: 800; cursor: pointer; }
      .${PREFIX}-morevias:hover { color: #123f68; text-decoration: underline; }
      #${PREFIX}-confirma { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; padding: 16px; }
      .${PREFIX}-conf-caixa { background: #fff; color: #212529; border-radius: 8px; width: min(480px, 100%); padding: 24px; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,.3); }
      .${PREFIX}-conf-icone { width: 56px; height: 56px; margin: 0 auto 10px; border-radius: 50%; border: 3px solid #f0ad4e; color: #f0ad4e;
        font-size: 32px; font-weight: 700; line-height: 50px; }
      .${PREFIX}-conf-tit { font-size: 18px; font-weight: 700; margin-bottom: 12px; }
      .${PREFIX}-conf-bloco { text-align: left; background: #fff8e6; border-left: 4px solid #e67700; border-radius: 4px; padding: 8px 12px; margin-bottom: 10px; font-size: 13px; }
      .${PREFIX}-conf-bloco ul { margin: 4px 0 0 18px; padding: 0; }
      .${PREFIX}-conf-acoes { display: flex; gap: 8px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }
      .${PREFIX}-aviso { margin: 8px 0; padding: 10px 12px; border-radius: 6px; font-size: 13px; line-height: 1.4; border-left: 4px solid; }
      .${PREFIX}-aviso-amarelo { background: #fff4e0; border-color: #e67700; color: #5c3800; }
      .${PREFIX}-aviso-vermelho { background: #fff0f0; border-color: #c92a2a; color: #5c1a1a; margin-bottom: 12px; }
      .${PREFIX}-aviso-verde { background: #ebfbee; border-color: #2b8a3e; color: #1b4d26; margin-bottom: 12px; padding: 6px 12px; }
      .${PREFIX}-aviso ul { margin: 4px 0 4px 18px; padding: 0; }
      .${PREFIX}-glosa-titulo { font-weight: 700; }
      .${PREFIX}-glosa-rodape { font-size: 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
      .${PREFIX}-glosa-rodape span { opacity: .85; }
      .${PREFIX}-n-medio { color: #8a5300; }
      .${PREFIX}-n-info { color: #1f4e79; }
      .${PREFIX}-cadsus-tipo { flex: 0 0 84px; max-width: 84px; border-top-right-radius: 0; border-bottom-right-radius: 0; }
      .${PREFIX}-cadsus-msg { display: block; min-height: 0; margin-top: 4px; font-size: 12px; color: #76838f; }
      .${PREFIX}-cadsus-msg:empty { display: none; }
      .${PREFIX}-cadsus-msg.${PREFIX}-cadsus-erro { color: #c62828; }
      .${PREFIX}-cc { border: 1px solid #e4eaec; border-top: 3px solid #00bcd4; border-radius: 3px; background: #fff; margin: 0 0 16px; }
      .${PREFIX}-cc-topo { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid #f1f4f5; font-size: 13px; font-weight: 600; color: #37474f; }
      .${PREFIX}-cc-resumo { font-weight: 400; font-size: 12px; color: #76838f; }
      .${PREFIX}-cc-x { margin-left: auto; border: 0; background: transparent; color: #a3afb7; font-size: 20px; line-height: 1; cursor: pointer; }
      .${PREFIX}-cc-x:hover { color: #37474f; }
      .${PREFIX}-cc-corpo { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); align-items: start; gap: 12px 28px; padding: 12px 14px; }
      .${PREFIX}-cc-largo { grid-column: 1 / -1; }
      .${PREFIX}-cc-item { padding-left: 8px; border-left: 2px solid transparent; }
      .${PREFIX}-cc-dif { border-left-color: #00bcd4; }
      .${PREFIX}-cc-rot { display: flex; align-items: center; gap: 8px; min-height: 20px; margin-bottom: 2px;
        font-size: 11px; font-weight: 600; letter-spacing: .4px; text-transform: uppercase; color: #a3afb7; }
      .${PREFIX}-cc-val { font-size: 13px; font-weight: 700; color: #263238; }
      .${PREFIX}-cc-atual { margin-top: 4px; font-size: 12px; color: #a3afb7; }
      .${PREFIX}-cc-usar { border: 1px solid #00bcd4; background: #fff; border-radius: 10px; padding: 0 9px; line-height: 18px;
        color: #00838f; font-size: 11px; font-weight: 700; letter-spacing: 0; text-transform: none; cursor: pointer; white-space: nowrap; }
      .${PREFIX}-cc-usar:hover { background: #00bcd4; color: #fff; }
      .${PREFIX}-cc-usar:disabled { border-color: #a5d6a7; background: #f1f8f1; color: #2b8a3e; cursor: default; }
      .${PREFIX}-cc-rodape { padding: 0 14px 12px; }
      .${PREFIX}-sub { font-size: 11px; color: #6c757d; }
    `;
    document.head.appendChild(css);
  }

  // ---------------------------------------------------------------------------
  // Ciclo
  // ---------------------------------------------------------------------------
  function aplicar() {
    try {
      const rota = rotaAtual();
      const m = ROTA_FICHA.exec(rota);
      if (!m) {
        document.getElementById(`${PREFIX}-glosa`)?.remove();
        if (ROTA_CADASTRO.test(rota)) garantirBotaoCadastro();
        return;
      }
      const sel = document.getElementById(SELECT_ID);
      if (sel) { aplicarFiltro(sel); aplicarAvisoEspecialidade(sel); }
      const id = m[1];
      if (glosaRender?.id === id && !document.getElementById(`${PREFIX}-glosa`)) glosaRender = null;   // Vue redesenhou
      if (!glosaRender || glosaRender.id !== id) avaliarGlosa(id).then(r => { if (r) glosaAtual = { id, r }; renderGlosa(id, r); });
    } catch (e) { anotarErro('aplicar', e); }
  }

  let agendado = 0;
  function agendar() { if (agendado) return; agendado = setTimeout(() => { agendado = 0; aplicar(); }, 150); }

  function iniciar() {
    estilo();
    instalarStore();
    prepararAutofechar();
    canalCadastro?.addEventListener('message', ev => {
      const d = ev.data;
      const m = ROTA_FICHA.exec(rotaAtual());
      if (d?.tipo === 'cadastro-atualizado' && m && String(d.id) === m[1]) recarregarCadastro(d.id);
    });
    // Ao voltar da edição do munícipe, a data/CPF/CNS podem ter mudado.
    nx()?.$router?.afterEach(() => { glosaCache.clear(); glosaRender = null; glosaAtual = null; setTimeout(aplicar, 300); });
    document.addEventListener('click', interceptarCriarFicha, true);
    document.addEventListener('submit', interceptarCriarFicha, true);
    document.addEventListener('change', ev => { if (ev.target?.id === SELECT_ID) agendar(); }, true);
    document.addEventListener('input', ev => { if (ev.target?.tagName === 'INPUT') agendar(); }, true);
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
    aplicar();
    console.info(`[OM30 Recepção PA] v${VERSAO} ativo`);
  }

  window.OM30Recepcao = {
    versao: VERSAO,
    chamadas: () => lerChamadas(),
    hoje: () => chamadasDeHoje(),
    csv: () => csv(),
    diagnostico: () => ({ ...stats, envioSenhas: { ativo: !!(SENHAS_API && SENHAS_KEY), naFila: lerFila().length, ...envio }, rota: rotaAtual(), senhaNoStore: store()?.state?.filas?.senha?.senha || null,
      registros: Object.keys(lerChamadas()).length, storeLigado: !!store()?.__om30RecepcaoPA }),
    previaCadsus: () => { const b = document.getElementById(`${PREFIX}-cad-cadsus`); return b ? verificarNoCadsus(b, PESSOA_FICTICIA) : 'abra o cadastro do munícipe'; },
    _teste: { cpfValido, cnsValido, grupoDaSenha, grupoDaOcupacao, grupoPorPrefixo, problemasEndereco, enderecoCadsus, fmtCpf, fmtCns, compararCadsus, mascaraBusca, telefoneSuspeito, enfileirar, enviarFila, lerFila, baseSenha }
  };

  instalarRede();   // o mais cedo possível: pega as respostas do Senha Simples
  let tentativas = 0;
  const espera = setInterval(() => {
    if (store() && nx()?.$router && document.body) { clearInterval(espera); iniciar(); }
    else if (++tentativas > 200) clearInterval(espera);
  }, 300);
})();
