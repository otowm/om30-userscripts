// ==UserScript==
// @name         OM30 - Ausentes Acolhimento e Fila Médica | Origem
// @namespace    https://om30.com.br/
// @version      2.4.4
// @description  Ausentes do acolhimento e da fila médica separados por origem (Acolhimento x Fila Médica x Outros), devolução da mesma senha ao remover a ausência e liberação de senha presa em outro profissional ao chamar.
// @author       Pedro Sampaio - Samp
// @updateURL    https://raw.githubusercontent.com/pdrjsampaio/om30-userscripts/main/OM30-Ausentes-Acolhimento.user.js
// @downloadURL  https://raw.githubusercontent.com/pdrjsampaio/om30-userscripts/main/OM30-Ausentes-Acolhimento.user.js
// @match        https://guaruja.saudesimples.net/acolhimentos*
// @match        https://guarujahomolog.saudesimples.net/acolhimentos*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// ===== OM30 AUSÊNCIAS D1 — coletor V5 (idêntico nos dois scripts) =====
// Grava no Cloudflare D1 em qual setor (MEDICO / ACOLHIMENTO) o paciente foi ausentado,
// no momento em que o próprio Saúde Simples confirma a ausência.
//
// Como a ausência é reconhecida (sem adivinhar rota):
//   - O botão nativo "Paciente ausente" (fila-chamada e menu de opções da lista) faz
//     saudeSimplesProxy.put(baseAusenteUrl). Essa URL-modelo vem das props Vue da própria
//     página (baseAusenteUrl / baseAusenteRollbackUrl, com :atendimento_id: e :atendimento_type:).
//   - O coletor lê esses modelos da página e só reconhece um PUT que case com eles.
//   - Só grava depois de resposta 2xx sem rejeição explícita do Saúde Simples.
//   - Desfazer nativo cancela a pendência e confirma o UUID exato no Worker, inclusive
//     depois do envio; preserva o histórico e impede reaplicação de uma escrita atrasada.
//   - Setor: /prontuarios* = MEDICO, /acolhimentos* = ACOLHIMENTO (onde o botão foi clicado).
//   - ID: o mesmo par atendimento_type + atendimento_id que a lista de ausentes usa.
// Nada é mostrado ao profissional. Suporte: OM30Ausencias.diagnostico() no console.
(() => {
  'use strict';
  const BUILD = 'OM30-D1-V5.4-2026-11-07';
  if (window.__OM30_AUSENCIAS_D1__) return;   // o outro script OM30 já instalou o mesmo coletor
  const API = 'https://om30-ausencias.cloud-om30-2.workers.dev';
  const KEY = String.fromCharCode(65,67,106,90,81,57,71,82,56,86,115,82,79,107,83,113,107,100,54,76,55,86,67,82,53,114,71,84,80,117,68,72,70,104,76,88,86,109,116,82,98,112,87,81,86,55,121,71);
  const PENDENTES = 'om30:ausencias-d1:v5:pendentes';
  const ESPERA_DESFAZER_MS = 20000;   // tempo para o Saúde Simples desfazer (rollback) antes de enviar
  const nativeFetch = window.fetch.bind(window);
  const SETOR = location.pathname.startsWith('/prontuarios') ? 'MEDICO'
    : location.pathname.startsWith('/acolhimentos') ? 'ACOLHIMENTO' : null;

  const stats = { build: BUILD, setorDaTela: SETOR, modelos: [], reconhecidas: 0, desfeitas: 0, falhasNativas: 0,
    enviadas: 0, recusadas: 0, errosEnvio: 0, ignoradas: {}, ultimo: null };
  const anotarIgnorada = motivo => { stats.ignoradas[motivo] = (stats.ignoradas[motivo] || 0) + 1; };
  const validId = v => typeof v === 'string' && /^\d{1,14}$/.test(v);
  const validTipo = v => typeof v === 'string' && /^[A-Z][A-Za-z]{2,40}$/.test(v);

  // ---------- modelos de URL lidos da página (props Vue) ----------
  let modelos = [];
  function compilar(tpl, papel) {
    const [p, q = ''] = String(tpl).split('?');
    const nomes = [];
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:(atendimento_id|atendimento_type):/g, (_, n) => { nomes.push(n); return '([^/?#&]+)'; });
    const consulta = {}, fixos = {};
    for (const [k, v] of new URLSearchParams(q)) {
      if (v === ':atendimento_id:') consulta[k] = 'atendimento_id';
      else if (v === ':atendimento_type:') consulta[k] = 'atendimento_type';
      else fixos[k] = v;
    }
    return { papel, rota: p.replace(/:(atendimento_id|atendimento_type):/g, ':$1'), re: new RegExp('^' + esc.replace(/\\\.json$/, '') + '(?:\\.json)?$'), nomes, consulta, fixos };
  }
  function lerModelos() {
    const achados = new Map();
    const vistos = new Set();
    const visitar = (vm, d) => {
      if (!vm || vistos.has(vm) || d > 60) return;
      vistos.add(vm);
      const p = vm.$props || {};
      if (typeof p.baseAusenteUrl === 'string' && p.baseAusenteUrl) achados.set('A|' + p.baseAusenteUrl, ['AUSENTAR', p.baseAusenteUrl]);
      if (typeof p.baseAusenteRollbackUrl === 'string' && p.baseAusenteRollbackUrl) achados.set('D|' + p.baseAusenteRollbackUrl, ['DESFAZER', p.baseAusenteRollbackUrl]);
      for (const c of vm.$children || []) visitar(c, d + 1);
    };
    try {
      for (const el of document.querySelectorAll('#app-vue, [id^="app"], [data-v-app]')) visitar(el.__vue__, 0);
      if (!achados.size) for (const el of document.body ? document.body.querySelectorAll('*') : []) { if (el.__vue__) { visitar(el.__vue__.$root, 0); break; } }
    } catch {}
    if (achados.size) {
      modelos = [...achados.values()].map(([papel, tpl]) => compilar(tpl, papel));
      stats.modelos = modelos.map(m => `${m.papel} ${m.rota}${Object.keys(m.consulta).length || Object.keys(m.fixos).length ? ' ?' + [...Object.keys(m.fixos), ...Object.keys(m.consulta)].join('&') : ''}`);
    }
    return modelos;
  }

  // ---------- leitura de uma requisição ----------
  // Junta parâmetros da URL e do corpo guardando TODOS os valores (divergência não é sobrescrita).
  function paramsDe(url, data) {
    const out = {};
    const por = (k, v) => { (out[k] = out[k] || []).push(String(v)); };
    for (const [k, v] of url.searchParams) por(k, v);
    let d = data;
    if (typeof d === 'string') {
      const t = d.trim();
      if (t.startsWith('{')) { try { d = JSON.parse(t); } catch { d = null; } }
      else { for (const [k, v] of new URLSearchParams(t)) por(k, v); d = null; }
    } else if (typeof URLSearchParams !== 'undefined' && d instanceof URLSearchParams) { for (const [k, v] of d) por(k, v); d = null; }
    else if (typeof FormData !== 'undefined' && d instanceof FormData) { for (const [k, v] of d) if (typeof v === 'string') por(k, v); d = null; }
    if (d && typeof d === 'object') for (const [k, v] of Object.entries(d)) if (typeof v === 'string' || typeof v === 'number') por(k, v);
    return out;
  }
  // Retorna { papel, id, tipo, rota } quando a requisição é exatamente um modelo da página.
  function reconhecer(rawUrl, metodo, data) {
    if (!SETOR) return null;
    const m = String(metodo || 'GET').toUpperCase();
    if (!['PUT', 'POST', 'PATCH'].includes(m)) return null;
    let url;
    try { url = new URL(rawUrl, location.href); } catch { return null; }
    if (url.origin !== location.origin) return null;
    if (!modelos.length) lerModelos();
    if (!modelos.length) return null;
    const caminho = url.pathname.replace(/\/$/, '');
    for (const mod of modelos) {
      const mm = caminho.match(mod.re);
      if (!mm) continue;
      const params = paramsDe(url, data);
      if (Object.entries(mod.fixos).some(([k, v]) => !params[k] || params[k].some(x => x !== v))) continue;
      const valores = { atendimento_id: new Set(), atendimento_type: new Set() };
      mod.nomes.forEach((n, i) => valores[n].add(decodeURIComponent(mm[i + 1])));
      for (const [k, n] of Object.entries(mod.consulta)) for (const v of params[k] || []) valores[n].add(v);
      // Campos explícitos no corpo também devem concordar com o ID/tipo da URL nativa.
      for (const n of ['atendimento_id', 'atendimento_type']) for (const v of params[n] || []) valores[n].add(v);
      const ids = [...valores.atendimento_id], tipos = [...valores.atendimento_type];
      if (ids.length !== 1 || tipos.length > 1) return { papel: mod.papel, rota: mod.rota, erro: ids.length > 1 || tipos.length > 1 ? 'ID_DIVERGENTE' : 'SEM_ID' };
      return { papel: mod.papel, rota: mod.rota, id: ids[0], tipo: tipos[0] || null };
    }
    return null;
  }

  // ---------- quem ausentou (lido da tela no momento da confirmação) ----------
  // Profissional logado: nome no topo do Saúde Simples. Local: guichê/sala escolhido na fila (store Vue).
  const limpo = (v, max) => { const t = String(v || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, max) : null; };
  function profissionalLogado() {
    try {
      const a = document.querySelector('#header-bar a.navbar-avatar, a.navbar-avatar');
      return a ? limpo([...a.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join(' '), 80) : null;
    } catch { return null; }
  }
  function localAtual() {
    try {
      const locais = document.querySelector('#app-vue')?.__vue__?.$store?.getters?.localAtendimentoAtual || {};
      return limpo(locais[SETOR === 'MEDICO' ? 'atendimento' : 'acolhimento']?.nome, 60);
    } catch { return null; }
  }

  // ---------- fila local de envio ----------
  // Chaves independentes por evento/operação impedem perda de eventos entre abas.
  // Date.parse é substituído pelo Saúde Simples; use new Date(...).getTime().
  const PREFIXO_EVENTO = PENDENTES + ':evento:';
  const CHAVE_RETRY = PENDENTES + ':proximo-envio';
  const RETENCAO_CONFIRMADOS_MS = 72 * 3600000;
  const reservaMemoria = new Map();
  const instante = x => Number(x?.criadoEm) || new Date(x?.evento?.observadoEm).getTime() || 0;
  const chaveEvento = (id, operacao) => PREFIXO_EVENTO + id + (operacao === 'desfazer' ? ':desfazer' : '');
  function guardarItem(item) {
    if (!item?.evento?.eventId) return;
    const chave = chaveEvento(item.evento.eventId, item.operacao);
    try { localStorage.setItem(chave, JSON.stringify(item)); reservaMemoria.delete(chave); }
    catch { reservaMemoria.set(chave, item); stats.falhasPersistencia = (stats.falhasPersistencia || 0) + 1; }
  }
  function removerItem(item) {
    const chave = chaveEvento(item.evento.eventId, item.operacao);
    reservaMemoria.delete(chave);
    try { localStorage.removeItem(chave); } catch { /* operação já confirmada no servidor */ }
  }
  function todosItens() {
    const mapa = new Map();
    try {
      // Migração idempotente: preserva UUID, origem e instante do evento original.
      let legado = [];
      try { legado = JSON.parse(localStorage.getItem(PENDENTES) || '[]'); }
      catch { stats.legadoCorrompido = true; }
      if (Array.isArray(legado) && legado.length) {
        let completo = true;
        for (const item of legado) if (item?.evento?.eventId) {
          const chave = chaveEvento(item.evento.eventId);
          if (!localStorage.getItem(chave)) guardarItem(item);
          if (reservaMemoria.has(chave)) completo = false;
        }
        if (completo) localStorage.removeItem(PENDENTES);
      }
      for (let i = 0; i < localStorage.length; i++) {
        const chave = localStorage.key(i);
        if (!chave?.startsWith(PREFIXO_EVENTO)) continue;
        try { const item = JSON.parse(localStorage.getItem(chave)); if (item?.evento?.eventId) mapa.set(chave, item); } catch {}
      }
    } catch { stats.falhasLeituraLocal = (stats.falhasLeituraLocal || 0) + 1; }
    for (const [chave, item] of reservaMemoria) mapa.set(chave, item);
    // Nunca expira pendência ou recusa. Confirmações locais servem para rollback tardio.
    for (const [chave, item] of mapa) if (item.enviadoEm && Date.now() - item.enviadoEm > RETENCAO_CONFIRMADOS_MS) {
      const operacaoPendente = mapa.get(chaveEvento(item.evento.eventId, 'desfazer'));
      if (operacaoPendente && !operacaoPendente.enviadoEm) continue;
      removerItem(item); mapa.delete(chave);
    }
    return [...mapa.values()].sort((a, b) => instante(a) - instante(b));
  }
  function lerPendentes() {
    const todos = todosItens();
    const cancelados = new Set(todos.filter(x => x.operacao === 'desfazer').map(x => x.evento.eventId));
    return todos.filter(x => !x.enviadoEm && !x.recusado && !x.cancelado &&
      (x.operacao === 'desfazer' || !cancelados.has(x.evento.eventId)))
      .sort((a, b) => (b.operacao === 'desfazer') - (a.operacao === 'desfazer') || instante(a) - instante(b));
  }
  function invalidarOrigens() { try { window.dispatchEvent(new Event('om30:ausencias-alteradas')); } catch {} }
  const recentes = new Map(); // axios e XHR podem observar a mesma resposta nativa.
  function registrar(req, ok) {
    if (!req) return;
    const chave = req.papel + '|' + req.tipo + '|' + req.id + '|' + ok;
    const agora = Date.now();
    for (const [k, em] of recentes) if (agora - em >= 4000) recentes.delete(k);
    if (recentes.has(chave)) return;
    recentes.set(chave, agora);
    if (req.erro) { anotarIgnorada(req.erro); stats.ultimo = { estado: req.erro, rota: req.rota, em: new Date().toISOString() }; return; }
    if (!ok) { if (req.papel === 'AUSENTAR') stats.falhasNativas++; stats.ultimo = { estado: 'RESPOSTA_NATIVA_SEM_SUCESSO', rota: req.rota, em: new Date().toISOString() }; return; }
    if (!validId(req.id)) { anotarIgnorada('ID_INVALIDO'); return; }
    if (!validTipo(req.tipo)) { anotarIgnorada('SEM_TIPO'); stats.ultimo = { estado: 'SEM_TIPO', rota: req.rota, em: new Date().toISOString() }; return; }
    if (req.papel === 'DESFAZER') {
      // Nunca adivinha UUID nem cancela registros de outros computadores por data.
      const alvo = todosItens().filter(x => x.operacao !== 'desfazer' && x.evento.tipo === req.tipo &&
        x.evento.atendimentoId === req.id && instante(x) <= agora).at(-1);
      recentes.delete('AUSENTAR|' + req.tipo + '|' + req.id + '|true');
      if (!alvo) {
        anotarIgnorada('ROLLBACK_SEM_EVENTO_LOCAL');
        stats.ultimo = { estado: 'ROLLBACK_SEM_EVENTO_LOCAL', em: new Date().toISOString() };
        invalidarOrigens(); return;
      }
      const existente = todosItens().find(x => x.operacao === 'desfazer' && x.evento.eventId === alvo.evento.eventId);
      if (!existente) {
        // Chave separada: a resposta da escrita em voo não pode sobrescrever o cancelamento.
        guardarItem({ operacao: 'desfazer', criadoEm: agora, liberarEm: agora, evento: {
          eventId: alvo.evento.eventId, atendimentoId: req.id, tipo: req.tipo,
          acaoNativa: req.rota, observadoEm: new Date().toISOString()
        } });
        stats.desfeitas++;
      }
      invalidarOrigens();
      stats.ultimo = { estado: 'DESFAZER_AGUARDANDO_D1', em: new Date().toISOString() };
      void enviar(true);
      return;
    }
    recentes.delete('DESFAZER|' + req.tipo + '|' + req.id + '|true');
    const evento = { eventId: crypto.randomUUID(), atendimentoId: req.id, tipo: req.tipo, origem: SETOR,
      acaoNativa: req.rota, atorId: null, autor: req.autor ?? profissionalLogado(), local: req.local ?? localAtual(), observadoEm: new Date().toISOString() };
    guardarItem({ evento, criadoEm: agora, liberarEm: agora + ESPERA_DESFAZER_MS });
    stats.reconhecidas++;
    invalidarOrigens();
    stats.ultimo = { estado: 'AGUARDANDO_ENVIO', origem: SETOR, rota: req.rota, em: evento.observadoEm };
  }

  let enviando = false, proximoEnvio = 0, falhasConsecutivas = 0;
  const adiarEnvio = () => {
    falhasConsecutivas++; proximoEnvio = Date.now() + Math.min(60000, 5000 * 2 ** Math.min(4, falhasConsecutivas - 1));
    try { localStorage.setItem(CHAVE_RETRY, String(proximoEnvio)); } catch {}
  };
  const podeEnviar = () => {
    let compartilhado = 0;
    try { compartilhado = Number(localStorage.getItem(CHAVE_RETRY)) || 0; } catch {}
    // Um relógio corrigido ou valor local inválido não pode bloquear a fila indefinidamente.
    const agora = Date.now();
    if (compartilhado > agora + 60000) compartilhado = 0;
    if (proximoEnvio > agora + 60000) proximoEnvio = 0;
    return agora >= Math.max(proximoEnvio, compartilhado);
  };
  async function enviar(forcar = false) {
    if (enviando || (!forcar && !podeEnviar())) return;
    enviando = true;
    const executar = async () => {
      // Reenviar ignora só o backoff; nunca antecipa a janela de confirmação nativa.
      // Reconsulta após cada await para priorizar cancelamento recebido durante um POST.
      for (let n = 0; n < 20; n++) {
        const item = lerPendentes().find(x => Date.now() >= x.liberarEm);
        if (!item) break;
        let r, obj = null;
        const controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const limite = controle ? setTimeout(() => controle.abort(), 15000) : null;
        try {
          r = await nativeFetch(API + (item.operacao === 'desfazer' ? '/v1/events/desfazer' : '/v1/events'), {
            method: 'POST', mode: 'cors', credentials: 'omit', keepalive: true,
            signal: controle?.signal,
            headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Accept': 'application/json', 'X-OM30-Key': KEY },
            body: JSON.stringify(item.evento)
          });
          obj = await r.json().catch(() => null);
        } catch { stats.errosEnvio++; adiarEnvio(); stats.ultimo = { estado: 'SEM_REDE_ENVIO_PENDENTE' }; break; }
        finally { if (limite !== null) clearTimeout(limite); }
        if (r.ok && obj?.ok) {
          // Mantém apenas o necessário para correlacionar eventual desfazer tardio (72h).
          guardarItem({ ...item, enviadoEm: Date.now(), ...(obj.cancelado === true ? { cancelado: true } : {}), evento: {
            eventId: item.evento.eventId, atendimentoId: item.evento.atendimentoId,
            tipo: item.evento.tipo, observadoEm: item.evento.observadoEm
          } });
          if (item.operacao === 'desfazer') {
            const alvo = todosItens().find(x => x.operacao !== 'desfazer' && x.evento.eventId === item.evento.eventId);
            if (alvo) guardarItem({ ...alvo, cancelado: true, enviadoEm: Date.now(), evento: {
              eventId: alvo.evento.eventId, atendimentoId: alvo.evento.atendimentoId,
              tipo: alvo.evento.tipo, observadoEm: alvo.evento.observadoEm
            } });
          }
          falhasConsecutivas = 0; proximoEnvio = 0;
          try { localStorage.removeItem(CHAVE_RETRY); } catch {}
          stats.enviadas++; stats.ultimo = { estado: item.operacao === 'desfazer' ? 'DESFEITA_NO_D1' : obj.cancelado === true ? 'CANCELADO_NO_D1' : 'GRAVADO_NO_D1', em: new Date().toISOString() };
          invalidarOrigens(); continue;
        }
        if (r.status === 422 || r.status === 400) {
          // Recusas permanecem disponíveis ao suporte, sem repetição de escrita inválida.
          guardarItem({ ...item, recusado: true, recusadoEm: Date.now(), http: r.status });
          stats.recusadas++; stats.ultimo = { estado: 'RECUSADO_PELO_WORKER', http: r.status }; continue;
        }
        stats.errosEnvio++; stats.ultimo = { estado: 'ERRO_ENVIO', http: r.status };
        adiarEnvio(); break;
      }
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        try { await navigator.locks.request('om30:ausencias-envio:v6', { ifAvailable: true }, async lock => { if (lock) await executar(); }); }
        catch { await executar(); } // API indisponível neste contexto: a idempotência continua no Worker.
      } else await executar(); // UUID estável: o Worker deduplica qualquer repetição após falha.
    } finally { enviando = false; }
  }

  // ---------- captura: interceptor do axios nativo (mesmo mecanismo da classificação de risco) ----------
  function instalarAxios() {
    const p = (typeof saudeSimplesProxy !== 'undefined') ? saudeSimplesProxy : null;   // eslint-disable-line no-undef
    if (!p?.interceptors?.response?.use) return false;
    if (p.__om30AusenciasD1) return true;
    const ler = cfg => { try { return reconhecer(cfg?.url, cfg?.method, cfg?.data); } catch { return null; } };
    p.interceptors.response.use(resp => {
      const req = ler(resp?.config);
      if (req) registrar(req, resp.status >= 200 && resp.status < 300 && !(resp.data && (resp.data.ok === false || resp.data.success === false)));
      return resp;
    }, err => { const req = ler(err?.config); if (req) registrar(req, false); return Promise.reject(err); });
    try { Object.defineProperty(p, '__om30AusenciasD1', { value: true }); } catch { p.__om30AusenciasD1 = true; }
    stats.axios = true;
    return true;
  }
  // Reserva: telas que façam a mesma operação por jQuery/XHR direto.
  function instalarXHR() {
    const proto = window.XMLHttpRequest?.prototype;
    if (!proto || proto.__om30AusenciasD1) return;
    const abrir = proto.open, mandar = proto.send;
    proto.open = function(method, url, ...resto) { this.__om30AusD1 = { method, url }; return abrir.call(this, method, url, ...resto); };
    proto.send = function(body) {
      let req = null;
      try { const m = this.__om30AusD1; req = m ? reconhecer(m.url, m.method, body) : null; } catch {}
      if (req) {
        // A identidade é capturada na solicitação, antes que navegação altere a tela.
        req.autor = profissionalLogado(); req.local = localAtual();
        this.addEventListener('loadend', () => {
          let data = null;
          try {
            if (this.responseType === 'json') data = this.response;
            else if (!this.responseType || this.responseType === 'text') {
              const texto = String(this.responseText || '').trim();
              if (texto.startsWith('{')) data = JSON.parse(texto);
            }
          } catch { registrar(req, false); return; }
          registrar(req, this.status >= 200 && this.status < 300 && !(data && (data.ok === false || data.success === false)));
        }, { once: true });
      }
      return mandar.call(this, body);
    };
    try { Object.defineProperty(proto, '__om30AusenciasD1', { value: true }); } catch { proto.__om30AusenciasD1 = true; }
  }

  window.__OM30_AUSENCIAS_D1__ = BUILD;
  for (const antigo of ['V1', 'V2', 'V3', 'V4'])
    if (window[`__OM30_ABSENCE_COLLECTOR_${antigo}__`]) console.warn(`[OM30 D1] Coletor antigo ${antigo} também está ativo: remova do Tampermonkey os scripts "D1 TESTE".`);
  instalarXHR();
  if (!instalarAxios()) {
    let n = 0;
    const t = setInterval(() => { if (instalarAxios() || ++n > 100) clearInterval(t); }, 300);
  }
  if (SETOR) setTimeout(lerModelos, 3000);

// Cache somente em memória: separa histórico de presença e compartilha entre abas da mesma origem.
  const leituras = new Map(), emLeitura = new Map();
  const epocas = { origem: 0, presenca: 0 }, invalidadoEm = { origem: 0, presenca: 0 };
  const recuos = { origem: { falhas: 0, ate: 0 }, presenca: { falhas: 0, ate: 0 } };
  const LIMITE_HTTP = 300, CACHE_ORIGEM_MS = 20000, CACHE_PRESENCA_MS = 5000;
  let canal = null;
  const chaveItem = x => x.tipo + '#' + x.id;
  const instanteServidor = valor => {
    if (typeof valor === 'number') return valor < 1e12 ? valor * 1000 : valor;
    return new Date(valor).getTime() || 0; // Date.parse é substituído pelo Saúde Simples.
  };
  function normalizar(itens, origem = false) {
    return [...new Map((itens || []).map(x => ({ id: String(x?.id || ''), tipo: x?.tipo || (origem ? 'AtendimentoPa' : '') }))
      .filter(x => validId(x.id) && validTipo(x.tipo)).map(x => [chaveItem(x), x])).values()]
      .sort((a, b) => chaveItem(a).localeCompare(chaveItem(b)));
  }
  function transmitir(mensagem) { try { canal?.postMessage(mensagem); } catch {} }
  function invalidar(classe, publicar = true) {
    epocas[classe]++; invalidadoEm[classe] = Date.now(); recuos[classe].ate = 0;
    for (const [chave, registro] of leituras) if (registro.classe === classe) leituras.delete(chave);
    if (publicar) transmitir({ acao: 'invalidar', classe });
  }
  function guardar(chave, registro, publicar = true) {
    if (registro.inicio < invalidadoEm[registro.classe]) return;
    const anterior = leituras.get(chave);
    if (anterior && anterior.em > registro.em) return;
    leituras.delete(chave); leituras.set(chave, registro);
    while (leituras.size > 32) leituras.delete(leituras.keys().next().value);
    if (publicar) transmitir({ acao: 'cache', chave, registro });
  }
  try {
    canal = typeof BroadcastChannel === 'function' ? new BroadcastChannel('om30:leituras:v1') : null;
    if (canal) canal.onmessage = ({ data: m }) => {
      if (!m || !['origem', 'presenca'].includes(m.classe || m.registro?.classe)) return;
      if (m.acao === 'invalidar') invalidar(m.classe, false);
      else if (m.acao === 'cache' && typeof m.chave === 'string' && Array.isArray(m.registro?.entradas)) guardar(m.chave, m.registro, false);
      else if (m.acao === 'consultar') {
        const registro = leituras.get(m.chave);
        if (registro && Date.now() - registro.em < (registro.classe === 'origem' ? CACHE_ORIGEM_MS : CACHE_PRESENCA_MS))
          transmitir({ acao: 'cache', chave: m.chave, registro });
      }
    };
  } catch { canal = null; }
  window.addEventListener('om30:ausencias-alteradas', () => invalidar('origem'));
  function mapaDoRegistro(registro, classe, falhou = false) {
    const mapa = new Map(), agora = Date.now();
    if (registro) for (const [chave, valor] of registro.entradas) {
      // Worker antigo pode não devolver expiração: valor só é usado na resposta de sucesso, sem prorrogação em erro.
      if (classe === 'presenca' && valor.validoAte && !(valor.validoAte > agora)) continue;
      if (classe === 'presenca' && falhou && !valor.validoAte) continue;
      if (classe === 'origem' && agora - registro.em >= CACHE_ORIGEM_MS) continue;
      mapa.set(chave, { ...valor });
    }
    mapa.consultaOk = !falhou;
    return mapa;
  }
  async function postar(caminho, corpo, keepalive = false) {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), 10000);
    try {
      const r = await nativeFetch(API + caminho, {
        method: 'POST', mode: 'cors', credentials: 'omit', keepalive, signal: controle.signal,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Accept': 'application/json', 'X-OM30-Key': KEY },
        body: JSON.stringify(corpo)
      });
      const obj = await r.json().catch(() => null);
      if (!r.ok || !obj?.ok) throw new Error('HTTP ' + r.status + ' ' + (obj?.error || 'RESPOSTA_INVALIDA'));
      return obj;
    } finally { clearTimeout(timer); }
  }
  function nomeTrava(chave) {
    let hash = 2166136261;
    for (let i = 0; i < chave.length; i++) hash = Math.imul(hash ^ chave.charCodeAt(i), 16777619);
    return 'om30:leitura:' + (hash >>> 0) + ':' + chave.length;
  }
  async function consultarLote(classe, lista, forcar = false) {
    const chave = classe + ':' + lista.map(chaveItem).join(',');
    const ttl = classe === 'origem' ? CACHE_ORIGEM_MS : CACHE_PRESENCA_MS;
    const emCache = () => { const r = leituras.get(chave); return r && Date.now() - r.em < ttl ? r : null; };
    const fresco = emCache();
    if (fresco && !forcar) return mapaDoRegistro(fresco, classe);
    if (emLeitura.has(chave)) {
      if (!forcar) return emLeitura.get(chave);
      await emLeitura.get(chave); // ação precisa de consulta iniciada depois da anterior.
    }
    const executar = async () => {
      let r = forcar ? null : emCache();
      if (!r && canal && !forcar) {
        transmitir({ acao: 'consultar', classe, chave });
        await new Promise(resolve => setTimeout(resolve, 40));
        r = emCache();
      }
      if (r) return mapaDoRegistro(r, classe);
      if (!forcar && Date.now() < recuos[classe].ate) return mapaDoRegistro(leituras.get(chave), classe, true);
      const inicio = Date.now(), epoca = epocas[classe];
      try {
        const obj = await postar(classe === 'origem' ? '/v1/lookup' : '/v1/presenca/lote', classe === 'origem' || !SETOR ? { atendimentos: lista } : { atendimentos: lista, setor: SETOR });
        if (epoca !== epocas[classe]) return mapaDoRegistro(null, classe, true);
        const entradas = [], solicitados = new Set(lista.map(chaveItem));
        const dados = classe === 'origem' ? obj.encontrados : obj.presentes;
        if (!Array.isArray(dados)) throw new Error('RESPOSTA_INVALIDA');
        for (const p of dados) {
          if (!solicitados.has(p.atendimento)) continue;
          if (classe === 'origem') {
            if (p.origem === 'MEDICO' || p.origem === 'ACOLHIMENTO') entradas.push([p.atendimento,
              { origem: p.origem, por: limpo(p.por, 80), local: limpo(p.local, 60), em: p.registradoEm || null, eventId: p.eventId || null }]);
          } else if (p.por && (!SETOR || p.setor === SETOR)) {
            // Cada tela só mostra a presença do próprio setor: ficha do Acolhimento não vira "Em atendimento" na fila médica.
            // Expiração real da concessão, nunca inferida de "desde" (início do atendimento).
            const expira = instanteServidor(p.expiresAt), servidor = instanteServidor(obj.serverNow);
            const validoAte = expira ? (servidor ? inicio + Math.max(0, expira - servidor) : expira) : 0;
            if (!validoAte || validoAte > Date.now()) entradas.push([p.atendimento,
              { por: limpo(p.por, 80), local: limpo(p.local, 60), setor: p.setor, desde: p.desde, validoAte }]);
          }
        }
        const registro = { classe, inicio, em: Date.now(), entradas };
        guardar(chave, registro); recuos[classe] = { falhas: 0, ate: 0 };
        stats[classe === 'origem' ? 'ultimaConsulta' : 'ultimaPresenca'] = { ok: true, consultados: lista.length, encontrados: entradas.length, em: new Date().toISOString() };
        return mapaDoRegistro(registro, classe);
      } catch (e) {
        const recuo = recuos[classe]; recuo.falhas++;
        recuo.ate = Date.now() + Math.min(60000, 5000 * 2 ** Math.min(recuo.falhas - 1, 4));
        stats[classe === 'origem' ? 'ultimaConsulta' : 'ultimaPresenca'] = { ok: false, erro: String(e?.message || e), em: new Date().toISOString() };
        return mapaDoRegistro(leituras.get(chave), classe, true);
      }
    };
    const promessa = (async () => {
      // A chave completa continua no cache: colisão de hash só serializa duas leituras distintas.
      if (canal && navigator.locks?.request) {
        try { return await navigator.locks.request(nomeTrava(chave), executar); } catch { return executar(); }
      }
      return executar();
    })();
    emLeitura.set(chave, promessa);
    try { return await promessa; } finally { if (emLeitura.get(chave) === promessa) emLeitura.delete(chave); }
  }
  async function consultarTodos(classe, itens, forcar = false) {
    const lista = normalizar(itens, classe === 'origem'), mapa = new Map();
    mapa.consultaOk = true;
    mapa.consultadosOk = new Set();
    // O Worker divide o SQL. Aqui dividimos apenas conjuntos acima do contrato HTTP, sem omitir pacientes.
    for (let i = 0; i < lista.length; i += LIMITE_HTTP) {
      const parte = await consultarLote(classe, lista.slice(i, i + LIMITE_HTTP), forcar);
      if (!parte.consultaOk) mapa.consultaOk = false;
      else for (const item of lista.slice(i, i + LIMITE_HTTP)) mapa.consultadosOk.add(chaveItem(item));
      for (const [k, v] of parte) mapa.set(k, v);
    }
    return mapa;
  }
  window.OM30Ausencias = {
    versao: BUILD,
    diagnostico: () => { if (SETOR && !modelos.length) lerModelos(); const itens = todosItens(); return { ...stats, pendentes: lerPendentes().length, recusadosLocais: itens.filter(x => x.recusado).length, pendentesEmMemoria: reservaMemoria.size }; },
    reenviar: () => enviar(true),
    health: () => nativeFetch(API + '/health', { credentials: 'omit' }).then(r => r.json()),
    origens: (itens, opcoes = {}) => consultarTodos('origem', itens, opcoes.forcar === true)
  };
  const marcacoes = new Map(), sequencias = new Map();
  function versaoPresenca(tag) {
    if (!/^[0-9a-f-]{36}$/i.test(tag.sessionId || '')) tag.sessionId = crypto.randomUUID();
    const chave = 'om30:presenca:seq:' + tag.sessionId;
    let salvo = 0;
    try { salvo = Number(sessionStorage.getItem(chave)) || 0; } catch {}
    const sequencia = Math.max(salvo, sequencias.get(chave) || 0) + 1;
    sequencias.set(chave, sequencia);
    try { sessionStorage.setItem(chave, String(sequencia)); } catch {}
    return { sessionId: tag.sessionId, sequencia };
  }
  window.OM30Ausencias.presenca = {
    marcar: tag => {
      const { id, tipo, setor, local } = tag;
      const chave = tipo + '#' + id, anterior = marcacoes.get(chave);
      if (anterior) return anterior;
      const promessa = postar('/v1/presenca', { atendimentoId: String(id), tipo, setor, local: limpo(local, 60),
        autor: profissionalLogado(), ttlSeg: 150, ...versaoPresenca(tag) }).then(obj => { invalidar('presenca'); return obj; });
      marcacoes.set(chave, promessa);
      return promessa.finally(() => { if (marcacoes.get(chave) === promessa) marcacoes.delete(chave); });
    },
    fim: async (tag, keepalive = false) => {
      const { id, tipo } = tag;
      // Envia imediatamente com sequência maior: o Worker rejeita a renovação antiga que chegue depois.
      // Não aguarda rede antes do keepalive, pois a aba pode fechar agora.
      const obj = await postar('/v1/presenca/fim', { atendimentoId: String(id), tipo, autor: profissionalLogado(), ...versaoPresenca(tag) }, keepalive);
      invalidar('presenca'); return obj;
    },
    lote: itens => consultarTodos('presenca', itens)
  };
  window.OM30Ausencias.profissionalLogado = profissionalLogado;

  window.addEventListener('online', () => void enviar());
  setInterval(() => { if (lerPendentes().some(x => Date.now() >= x.liberarEm)) void enviar(); }, 5000);
  setTimeout(() => void enviar(), 3000);
  console.info('[OM30 D1] Coletor V5.3 ativo', SETOR ? `(${SETOR})` : '');
})();
// ===== FIM OM30 AUSÊNCIAS D1 =====

// ===== OM30 SENHAS D1 — envio das chamadas (idêntico nos scripts de fila) =====
// Manda cada chamada de senha (Acolhimento / Fila médica) para o Worker om30-senhas, que guarda o
// histórico por senha: quem chamou, guichê/sala, horário, rechamadas. Nada do paciente é enviado.
// Fila no localStorage; o servidor ignora repetidos. Desligado enquanto API/KEY estiverem vazios.
// Suporte: OM30Senhas.diagnostico() no console.
(() => {
  'use strict';
  if (window.__OM30_SENHAS_ENVIO__) return;
  window.__OM30_SENHAS_ENVIO__ = true;
  const API = 'https://ps.worker-senhas.workers.dev';   // Worker om30-senhas (conta Senhas PS).<conta>.workers.dev
  const KEY = String.fromCharCode(83,52,86,67,112,89,48,67,119,115,103,119,109,45,89,82,110,65,102,105,67,53,97,55,65,104,51,120,82,54,80,118,89,84,69,116,102,76,106,104,69,100,66,109,116,104,104,108);   // chave do cliente (secret CLIENT_KEY do Worker)
  const FILA = 'om30:senhas-d1:v1:fila';
  const limpo = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const norm = v => limpo(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const st = { enfileirados: 0, enviados: 0, recusados: 0, erros: 0, falhas: 0, proximoEm: 0, ultimo: null };
  // "senha|chamado_em" já enviados por este navegador (24 h, sobrevive a recarregar a página):
  // cada página da fila reconsulta as senhas chamadas e, sem isso, reenviaria tudo a cada abertura.
  const VISTOS = 'om30:senhas-d1:v1:vistos';
  const vistos = new Map((() => { try { const o = JSON.parse(localStorage.getItem(VISTOS) || '{}'); return Object.entries(o).filter(([, t]) => Date.now() - t < 86400000); } catch { return []; } })());
  function gravarVistos() {
    try { localStorage.setItem(VISTOS, JSON.stringify(Object.fromEntries([...vistos.entries()].filter(([, t]) => Date.now() - t < 86400000).slice(-2000)))); } catch {}
  }
  const RECENTE_MS = 15 * 60000;   // chamada só observada (não feita aqui): envia só se aconteceu há pouco

  const unidade = () => norm(document.querySelector('a[href*="trocar_unidade_saude"]')?.textContent);
  const profissional = () => { try { return limpo(window.OM30Ausencias?.profissionalLogado?.()); } catch { return ''; } };
  function grupo(s) {
    const t = norm(s?.tipo_atendimento?.nome);
    if (/PEDIAT/.test(t)) return 'PEDIATRA';
    if (/DENTIST|ODONTO/.test(t)) return 'DENTISTA';
    if (/CLINIC/.test(t)) return 'CLINICO';
    const p = (norm(s?.senha).match(/^([A-Z]{2})\d/) || [])[1];
    return { CN: 'CLINICO', PD: 'PEDIATRA', DT: 'DENTISTA' }[p] || 'OUTRO';
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  function lerFila() { try { const a = JSON.parse(localStorage.getItem(FILA) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
  function gravarFila(a) { try { localStorage.setItem(FILA, JSON.stringify(a.slice(-500))); } catch {} }

  async function enviar(keepalive = false) {
    if (!API || !KEY || (!keepalive && Date.now() < st.proximoEm)) return;
    const executar = async () => {
      for (let i = 0; i < 10; i++) {
        const fila = lerFila();
        if (!fila.length) return;
        const parte = fila.slice(0, 20);   // limite do Worker (≤ 40 consultas por requisição)
        let r;
        try {
          r = await fetch(API.replace(/\/$/, '') + '/v1/eventos', { method: 'POST', mode: 'cors', credentials: 'omit', keepalive,
            headers: { 'Content-Type': 'application/json', 'X-OM30-Key': KEY }, body: JSON.stringify({ eventos: parte }) });
        } catch { st.erros++; st.falhas++; st.proximoEm = Date.now() + Math.min(300000, 15000 * 2 ** Math.min(st.falhas, 4)); return; }
        st.ultimo = { http: r.status, em: new Date().toISOString() };
        if (r.ok || r.status === 422 || r.status === 400) {
          gravarFila(lerFila().slice(parte.length));
          if (r.ok) st.enviados += parte.length; else st.recusados += parte.length;
          st.falhas = 0; st.proximoEm = 0;
          continue;
        }
        st.erros++; st.falhas++;
        st.proximoEm = Date.now() + (r.status === 401 || r.status === 403 ? 3600000 : Math.min(300000, 15000 * 2 ** Math.min(st.falhas, 4)));
        return;
      }
    };
    try {
      if (navigator.locks?.request) await navigator.locks.request('om30-senhas-envio', { ifAvailable: true }, async l => { if (l) await executar(); });
      else await executar();
    } catch {}
  }

  // s = senha devolvida pelo Senha Simples; url = rota da requisição; setor = ACOLHIMENTO | MEDICO.
  let agendado = 0;
  function observar(s, url, setor) {
    if (!API || !KEY || !s?.senha || !s.chamado_em || !/^(ACOLHIMENTO|MEDICO|RECEPCAO)$/.test(setor || '')) return;
    url = String(url || '');
    if (/desvincular|concluir|retornar/i.test(url)) return;
    const chamou = /chamar|proximo|rechama/i.test(url);
    const chave = `${norm(s.senha)}|${s.chamado_em}`;
    const jaVista = vistos.has(chave);
    if (jaVista && !chamou) return;          // consulta repetida da mesma chamada
    // Chamada feita em outro computador e vista só na consulta: o computador que chamou já mandou;
    // aqui só complementa se for recente (cobre quem está sem o script), nunca as antigas da lista.
    if (!chamou && !(Date.now() - Date.parse(s.chamado_em) < RECENTE_MS)) { vistos.set(chave, Date.now()); return; }
    vistos.set(chave, Date.now()); gravarVistos();
    const un = unidade();
    if (!un) return;
    const fila = lerFila();
    fila.push({ tipo: 'chamada', eventId: uuid(), setor,
      chamadoEm: jaVista ? new Date().toISOString() : s.chamado_em, rechamadaSemHorario: jaVista,
      por: limpo(s.usuario?.nome) || (chamou ? profissional() : '') || null, local: limpo(s.local_atendimento?.nome) || null,
      senha: norm(s.senha), unidade: un, criadaEm: s.created_at || null, grupo: grupo(s),
      tipoSenha: limpo(s.tipo_atendimento?.nome) || null, preferencial: !!s.tipo_atendimento?.preferencial });
    gravarFila(fila);
    st.enfileirados++;
    clearTimeout(agendado); agendado = setTimeout(() => enviar(), 4000);   // junta eventos próximos numa requisição
  }

  window.OM30Senhas = { observar, enviar: () => enviar(),
    diagnostico: () => ({ ativo: !!(API && KEY), unidade: unidade(), naFila: lerFila().length, ...st }) };
  if (API && KEY) {
    setInterval(() => { if (lerFila().length) enviar(); }, 30000);
    window.addEventListener('online', () => enviar());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && lerFila().length) enviar(true); });
    setTimeout(() => enviar(), 5000);
  }
})();
// ===== FIM OM30 SENHAS D1 =====

// ===== OM30 PROFISSIONAL NA FILA (idêntico nos dois scripts) =====
// Filas do acolhimento (/acolhimentos) e médica (/prontuarios): mostra quem está com cada paciente,
// no padrão do Controle de Salas.
//   - "Em atendimento: Fulano · Local": a ficha do paciente está aberta (presença gravada no D1 pela aba da ficha).
//   - "Chamado por Fulano · Guichê": a senha foi chamada (resposta nativa do Senha Simples).
// "Confirmar atendimento" e "Atender" abrem a ficha numa aba nova (se o navegador bloquear, segue na mesma aba);
// a aba da ficha renova a presença a cada 45 s e encerra ao fechar ou ao voltar para a fila.
(() => {
  'use strict';
  if (window.__OM30_PROFISSIONAL_FILA__) return;
  window.__OM30_PROFISSIONAL_FILA__ = true;

  const caminho = location.pathname.replace(/\/+$/, '') || '/';
  // Formulário de ficha (ex.: "Salvar" com erro volta em /acolhimentos com o formulário): não é a lista.
  const TEM_FICHA = !!document.querySelector('.desvincular-senha-e-sair, .botao-salvar-acolhimento, form.acolhimento_form');
  const PAGINA_FILA = /^\/(acolhimentos|prontuarios(\/urgencia_emergencia)?)$/.test(caminho) && !TEM_FICHA;
  const TIPO = !PAGINA_FILA ? null : caminho.startsWith('/prontuarios') ? 'atendimento' : 'acolhimento';
  const SETOR = TIPO === 'atendimento' ? 'MEDICO' : 'ACOLHIMENTO';
  const TAG = 'om30ficha:';
  const limpo = v => String(v || '').replace(/\s+/g, ' ').trim();
  const api = () => window.OM30Ausencias?.presenca || null;
  const usuarioLogado = () => { try { return window.OM30Ausencias?.profissionalLogado?.() || ''; } catch { return ''; } };

  // ---------- marca da aba da ficha (window.name sobrevive aos redirecionamentos do servidor) ----------
  function lerTag() {
    try {
      if (!String(window.name || '').startsWith(TAG)) return null;
      const t = JSON.parse(window.name.slice(TAG.length));
      return t && /^\d{1,14}$/.test(String(t.id)) && /^[A-Z][A-Za-z]{2,40}$/.test(t.tipo) && Date.now() - Number(t.em || 0) < 12 * 3600000 ? t : null;
    } catch { return null; }
  }
  const textoTag = t => TAG + JSON.stringify(t);

  // ---------- título da aba (igual ao Controle de Salas: travado contra outros scripts) ----------
  const TITULO = { atual: '', escrever: null, vigia: null, travado: false };
  function travarTitulo() {
    if (TITULO.travado) return;
    TITULO.travado = true;
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
    if (desc?.set && desc?.get) {
      TITULO.escrever = v => desc.set.call(document, v);
      try { Object.defineProperty(document, 'title', { configurable: true, get() { return desc.get.call(document); }, set() { /* título desta tela é do OM30 */ } }); }
      catch { TITULO.escrever = null; }
    }
    const vigiar = () => {
      const el = document.querySelector('head > title');
      if (!el || TITULO.vigia) return !!el;
      TITULO.vigia = new MutationObserver(() => { if (TITULO.atual && el.textContent !== TITULO.atual) escreverTitulo(TITULO.atual); });
      TITULO.vigia.observe(el, { childList: true, characterData: true, subtree: true });
      return true;
    };
    if (!vigiar()) document.addEventListener('DOMContentLoaded', vigiar);
  }
  function escreverTitulo(t) { if (TITULO.escrever) TITULO.escrever(t); else document.title = t; }
  function definirTitulo(t) {
    if (!t || (t === TITULO.atual && document.title === t)) return;
    travarTitulo();
    TITULO.atual = t;
    escreverTitulo(t);
  }

  // ===================== Parte 1: aba da ficha registra presença =====================
  if (!PAGINA_FILA) {
    let tag = lerTag();
    // Ficha do acolhimento aberta por qualquer caminho: a própria URL já diz quem é o paciente.
    if (!tag && /^\/acolhimentos\/new$/.test(caminho)) {
      const q = new URLSearchParams(location.search);
      const id = q.get('acolhivel_id'), tipo = q.get('acolhivel_type');
      if (/^\d{1,14}$/.test(id || '') && /^[A-Z][A-Za-z]{2,40}$/.test(tipo || '')) tag = { id, tipo, setor: 'ACOLHIMENTO', local: '', em: Date.now() };
    }
    if (tag && /^\/(acolhimentos|prontuarios|atendimentos|atendimentos_pas)(\/|$)/.test(caminho)) {
      let ativo = true, encerrada = false;
      if (!/^[0-9a-f-]{36}$/i.test(tag.sessionId || '')) tag.sessionId = crypto.randomUUID();
      window.name = textoTag(tag);
      // Uma aba duplicada pelo navegador pode copiar window.name/sessionStorage. A aba já ativa conserva a sessão.
      let canalFicha = null;
      const dono = crypto.randomUUID();
      try {
        canalFicha = typeof BroadcastChannel === 'function' ? new BroadcastChannel('om30:presenca:fichas:v1') : null;
        if (canalFicha) {
          canalFicha.onmessage = ({ data: m }) => {
            if (!m || m.sessionId !== tag.sessionId) return;
            if (m.acao === 'ocupar' && ativo && m.dono !== dono) canalFicha.postMessage({ acao: 'ocupada', sessionId: tag.sessionId, destino: m.dono });
            if (m.acao === 'ocupada' && m.destino === dono) { tag.sessionId = crypto.randomUUID(); window.name = textoTag(tag); }
          };
          canalFicha.postMessage({ acao: 'ocupar', sessionId: tag.sessionId, dono });
        }
      } catch { canalFicha = null; }
      const encerrar = () => {
        if (encerrada) return;
        encerrada = true; ativo = false;
        try { Promise.resolve(api()?.fim(tag, true)).catch(() => {}); } catch {}
      };
      const marcar = async (tentativa = 0) => {
        if (!ativo) return;
        if (!api() || !usuarioLogado()) { if (tentativa < 20) setTimeout(() => marcar(tentativa + 1), 1000); return; }
        try { await api().marcar(tag); } catch (e) { console.warn('[OM30 Presença]', e?.message || e); }
      };
      setTimeout(marcar, 800);
      setInterval(marcar, 45000);
      // pagehide também ocorre em Salvar/recarregar/navegar: não equivale a atendimento encerrado.
      // Fechamento sem confirmação nativa deixa de renovar e vence pelo TTL do servidor (150 s).
      window.addEventListener('pagehide', () => { ativo = false; });
      window.addEventListener('pageshow', () => { if (!encerrada) { ativo = true; void marcar(); } });
      window.OM30PresencaFicha = { tag };
      // "Sair" da ficha (aba aberta pelo script): assim que o Saúde Simples desvincula a senha, fecha a aba na
      // hora, sem esperar a lista recarregar. Se a desvinculação falhar, segue o fluxo nativo.
      {
        const instalarSair = () => {
          const f = window.desvincularSenha;
          if (typeof f !== 'function') return false;
          if (f.__om30Sair) return true;
          const novo = function (...args) {
            return Promise.resolve(f.apply(this, args)).then(r => {
              if (r === false || r?.ok === false || r?.success === false || r?.data?.ok === false || r?.data?.success === false) return r;
              encerrar();
              if (window.opener && !window.opener.closed) { try { window.close(); } catch {} }
              return r;
            });
          };
          novo.__om30Sair = true;
          window.desvincularSenha = novo;
          return true;
        };
        if (!instalarSair()) { let n = 0; const ti = setInterval(() => { if (instalarSair() || ++n > 40) clearInterval(ti); }, 250); }
      }
      // Título da aba da ficha: "Acolhimento · NOME" / "Atendimento · NOME".
      const onde = tag.setor === 'MEDICO' ? 'Atendimento' : 'Acolhimento';
      definirTitulo(tag.nome ? `${onde} · ${tag.nome}` : onde);
    }
    return;
  }

  // ===================== Parte 2: página da fila =====================
  // A aba da ficha voltou para a lista ("Sair" ou "Salvar"): encerra a presença e, se foi aberta
  // por este script (aba nova), fecha sozinha como no Controle de Salas. A fila original segue aberta.
  {
    const t = lerTag();
    if (t) {
      window.name = '';
      const abaFilha = !!window.opener && !window.opener.closed;
      const fechar = () => { try { Promise.resolve(api()?.fim(t, true)).catch(() => {}); } catch {} if (abaFilha) setTimeout(() => { try { window.close(); } catch {} }, 400); };
      if (api()) fechar(); else setTimeout(fechar, 1200);
      if (abaFilha) return;
    }
  }

  const CICLO_MS = 20000, VALIDADE_SENHA_MS = 45000, VALIDADE_CHAMADA_MS = 90000, MAX_POR_CICLO = 15;
  const tentativasSenha = new Map(), revisoesChamada = new Map();
  const chamadas = new Map();   // "Tipo#id" -> { estado, nome, guiche, t }   (Senha Simples)
  let presencas = new Map();    // "Tipo#id" -> { por, local, desde }        (D1)
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const conectores = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
  const titulo = t => t.toLocaleLowerCase('pt-BR').split(' ').map((p, i) => i > 0 && conectores.has(p) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)).join(' ');
  // PEDRO JUSTINO SAMPAIO ANDRADE -> Pedro J. S. Andrade (mesma regra do Controle de Salas)
  function nomeVisual(nome) {
    let n = limpo(nome);
    if (!n) return '';
    if (n === n.toUpperCase()) n = titulo(n);
    if (n.length <= 24) return n;
    const p = n.split(' ');
    const meio = p.slice(1, -1).filter(x => !conectores.has(x.toLowerCase())).map(x => x.charAt(0).toUpperCase() + '.');
    const c = [p[0], ...meio, p[p.length - 1]].join(' ');
    return c.length <= 26 ? c : `${p[0]} ${p[p.length - 1]}`;
  }
  const localVisual = g => { const t = limpo(g); return t && t === t.toUpperCase() ? titulo(t) : t; };
  function localNome() {
    try { return limpo(document.querySelector('#app-vue')?.__vue__?.$store?.getters?.localAtendimentoAtual?.[TIPO]?.nome); } catch { return ''; }
  }
  function localId(vm) {
    try { return vm?.$store?.getters?.localAtendimentoAtual?.[TIPO]?.id || null; } catch { return null; }
  }

  // ---------- abrir a ficha numa aba nova ----------
  function nomeDoPaciente(id, tipo, extra) {
    const it = itensValidos(colecao()).find(x => x.atendimento_str === `${tipo}#${id}`);
    return limpo(extra || it?.nome_municipe).slice(0, 80);
  }
  function abrirFicha(url, id, tipo, nome) {
    if (!/^\d{1,14}$/.test(String(id || '')) || !/^[A-Z][A-Za-z]{2,40}$/.test(tipo || '')) return 'SEM_ID';
    // O nome do paciente fica só na marca da aba (título); nunca é enviado ao Cloudflare.
    const tag = { id: String(id), tipo, setor: SETOR, local: localNome(), nome: nomeDoPaciente(id, tipo, nome), em: Date.now(), sessionId: crypto.randomUUID() };
    let janela = null;
    try { janela = window.open(url, textoTag(tag)); } catch { janela = null; }
    if (janela) {
      // O estado Em atendimento só será exibido após confirmação da ficha no Worker.
      setTimeout(() => void ciclo(), 1800);
      return 'NOVA_ABA';
    }
    window.name = textoTag(tag);   // navegador bloqueou: segue na mesma aba, que leva a marca
    return 'MESMA_ABA';
  }
  function remendarMetodo(nomeComp, metodo, fabrica) {
    const V = window.Vue;
    const C = V?.options?.components?.[nomeComp];
    if (!C?.options) return false;
    for (const alvo of [C.options, C.extendOptions].filter(Boolean)) {
      alvo.methods = alvo.methods || {};
      const original = alvo.methods[metodo];
      if (!original || original.__om30Ficha) continue;
      const novo = fabrica(original);
      novo.__om30Ficha = true;
      alvo.methods[metodo] = novo;
    }
    return true;
  }
  function instalarAbaNova() {
    // "Confirmar atendimento" do painel de chamada (mesmo que o sistema faz, mas em aba nova).
    const a = remendarMetodo('fila-chamada', 'atender', original => function () {
      if (this.criarRegistro || this.controleSala || !this.redirectUrl) return original.apply(this, arguments);
      const s = this.proximaSenha || {};
      this.$store.dispatch('defineSenhaChamada', s);   // antes de abrir: a aba nova recebe uma cópia do sessionStorage
      const r = abrirFicha(this.redirectUrl, s.saude_atendimento_id, s.saude_atendimento_type, this.nomeMunicipe);
      if (r !== 'NOVA_ABA') return original.apply(this, arguments);
      this.$emit('fechar');
    });
    // "Atender" da linha.
    const b = remendarMetodo('botao-iniciar-atendimento', 'definicoesInicioAtendimento', original => function () {
      if (this.criarRegistro || this.controleSala || !this.redirectUrl
          || (typeof this.parametrizacaoEscutaInicial === 'function' && this.parametrizacaoEscutaInicial())) return original.apply(this, arguments);
      const r = abrirFicha(this.redirectUrl, this.atendimentoId, this.atendimentoType);
      if (r !== 'NOVA_ABA') return original.apply(this, arguments);
    });
    return a && b;
  }
  if (!instalarAbaNova()) { let n = 0; const ti = setInterval(() => { if (instalarAbaNova() || ++n > 60) clearInterval(ti); }, 500); }

  // ---------- "Chamado por": resposta nativa do Senha Simples ----------
  async function consultarSenha(local, tipo, id) {
    const fn = typeof senhaSimplesGetSenhaAtendimento === 'function' ? senhaSimplesGetSenhaAtendimento : null;   // eslint-disable-line no-undef
    if (!fn) return null;
    try {
      let timer;
      const { data: s } = await Promise.race([
        fn({ localAtendimentoAtualId: local, params: { atendimento_id: id, atendimento_type: tipo } }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('TIMEOUT_SENHA')), 8000); })
      ]).finally(() => clearTimeout(timer));
      if (!s?.chamado_em && !s?.confirmado_em) return { estado: 'AGUARDANDO' };
      return { estado: s.confirmado_em ? 'ATENDENDO' : 'CHAMADO', nome: limpo(s.usuario?.nome), guiche: limpo(s.local_atendimento?.nome) };
    } catch (e) {
      const st = e?.response?.status, d = e?.response?.data || {};
      if (st === 422 && d.ja_chamada) {
        const m = String(d.error || '').match(/por\s+(.+?)\s+no\s+guich[eê]\s+(.+)$/i) || [];
        const quem = m[1] && /seu usu[aá]rio/i.test(m[1]) ? usuarioLogado() : limpo(m[1]);
        return { estado: 'CHAMADO', nome: quem, guiche: limpo(m[2]) };
      }
      if (st === 404) return { estado: 'SEM_SENHA' };
      return null;
    }
  }
  function registrarResposta(cfg, data) {
    const url = String(cfg?.url || '');
    const s = data && typeof data === 'object' ? (data.saude_atendimento_id ? data : data.senha && typeof data.senha === 'object' ? data.senha : null) : null;
    if (!s?.saude_atendimento_id || !s?.saude_atendimento_type) return;
    const chave = `${s.saude_atendimento_type}#${s.saude_atendimento_id}`;
    revisoesChamada.set(chave, (revisoesChamada.get(chave) || 0) + 1);
    try { window.OM30Senhas?.observar(s, url, SETOR); } catch {}   // histórico de chamadas (OM30 Senhas D1)
    if (/desvincular|concluir|retornar/i.test(url)) chamadas.delete(chave);
    else if (s.chamado_em || s.confirmado_em || /chamar|proximo/i.test(url))
      chamadas.set(chave, { estado: s.confirmado_em ? 'CONFIRMADO' : 'CHAMADO',
        nome: limpo(s.usuario?.nome) || (/chamar|proximo/i.test(url) ? usuarioLogado() : ''),
        guiche: limpo(s.local_atendimento?.nome) || (/chamar|proximo/i.test(url) ? localNome() : ''), t: Date.now() });
    else return;
    agendarPintura();
  }
  function instalarCapturaChamada() {
    const p = (typeof senhaSimplesProxy !== 'undefined') ? senhaSimplesProxy : null;   // eslint-disable-line no-undef
    if (!p?.interceptors?.response?.use) return false;
    if (p.__om30ProfissionalFila) return true;
    p.interceptors.response.use(resp => { try { registrarResposta(resp?.config, resp?.data); } catch {} return resp; });
    try { Object.defineProperty(p, '__om30ProfissionalFila', { value: true }); } catch { p.__om30ProfissionalFila = true; }
    return true;
  }
  if (!instalarCapturaChamada()) { let n = 0; const ti = setInterval(() => { if (instalarCapturaChamada() || ++n > 100) clearInterval(ti); }, 300); }

  // ---------- tabela da fila ----------
  let vmAtual = null;
  function colecao() {
    if (vmAtual?.$el?.isConnected && !vmAtual._isDestroyed) return vmAtual;
    const vistos = new Set();
    let achado = null;
    const visitar = (vm, d) => {
      if (!vm || achado || vistos.has(vm) || d > 60) return;
      vistos.add(vm);
      if ((vm.$options?.name || '') === 'collection-with-search-atendimento' && Array.isArray(vm.items)) { achado = vm; return; }
      for (const c of vm.$children || []) visitar(c, d + 1);
    };
    try { visitar(document.querySelector('#app-vue')?.__vue__, 0); } catch {}
    return (vmAtual = achado);
  }
  const itensValidos = vm => (vm?.items || []).filter(it => /^[A-Za-z]+#\d+$/.test(it?.atendimento_str || ''));

  // Linha do paciente pelo ID do atendimento: cada linha tem os botões Chamar/Atender/(*) (componentes Vue
  // com a prop atendimentoStr). Nunca pelo nome: há pacientes homônimos na fila (ex.: testes, retornos).
  function atendimentoDaLinha(tr) {
    for (const el of tr.querySelectorAll('*')) {
      const s = el.__vue__?.$props?.atendimentoStr;
      if (typeof s === 'string' && /^[A-Za-z]+#\d+$/.test(s)) return s;
    }
    return null;
  }
  function mapaLinhas(tbody) {
    const mapa = new Map();
    for (const tr of tbody?.rows || []) { const s = atendimentoDaLinha(tr); if (s && !mapa.has(s)) mapa.set(s, tr); }
    return mapa;
  }
  // O texto vai na célula do NOME (larga), como no Controle de Salas.
  function celulaDoItem(linhas, it) {
    const tr = linhas.get(it.atendimento_str);
    if (!tr) return null;
    const nome = limpo(it.nome_municipe).toUpperCase();
    return [...tr.cells].find(td => nome && limpo(td.textContent).toUpperCase().startsWith(nome)) || tr.cells[2] || null;
  }

  // OM30 visual do profissional: estado + nome completo e local, sem novas consultas.
  function om30ProfessionalName(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text || text !== text.toLocaleUpperCase('pt-BR')) return text;
  const links = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
  return text.toLocaleLowerCase('pt-BR').split(' ').map((word, i) =>
    i && links.has(word) ? word : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
  ).join(' ');
}
  function om30ProfessionalMarkup(name, location, attending) {
  const safe = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const displayName = om30ProfessionalName(name);
  if (!displayName) return '';
  const displayLocation = om30ProfessionalName(location);
  const state = attending ? 'Em atendimento' : 'Chamado por';
  return `<span class="om30-prof-corpo"><span class="om30-prof-estado"><span class="om30-prof-ponto" aria-hidden="true"></span>${state}</span><span class="om30-prof-detalhes"><span class="om30-prof-nome">${safe(displayName)}</span>${displayLocation ? `<span class="om30-prof-local">${safe(displayLocation)}</span>` : ''}</span></span>`;
}

  let tValidadeVisual = 0;
  function agendarValidadeVisual() {
    clearTimeout(tValidadeVisual);
    const agora = Date.now(), prazos = [];
    for (const p of presencas.values()) if (p.validoAte > agora) prazos.push(p.validoAte);
    for (const c of chamadas.values()) if (c.t + VALIDADE_CHAMADA_MS > agora) prazos.push(c.t + VALIDADE_CHAMADA_MS);
    if (prazos.length) tValidadeVisual = setTimeout(() => { const vm = colecao(); if (!document.hidden && vm) pintar(vm); }, Math.max(1, Math.min(...prazos) - agora));
  }
  function pintar(vm) {
    const tbody = vm?.$el?.querySelector?.('tbody');
    if (!tbody) return;
    const vistos = new Set();
    const linhas = mapaLinhas(tbody);
    for (const it of itensValidos(vm)) {
      const atual = presencas.get(it.atendimento_str);
      const p = atual && atual.setor === SETOR && (!atual.validoAte || atual.validoAte > Date.now()) ? atual : null;
      const ultima = !p && chamadas.get(it.atendimento_str);
      const c = ultima && Date.now() - ultima.t < VALIDADE_CHAMADA_MS ? ultima : null;
      if (!p?.por && !c?.nome) continue;
      const td = celulaDoItem(linhas, it);
      if (!td) continue;
      let box = td.querySelector(':scope > .om30-prof-fila');
      if (!box) { box = document.createElement('div'); td.appendChild(box); }
      const html = om30ProfessionalMarkup(p ? p.por : c.nome, p ? p.local : c.guiche, !!p);
      const classe = `om30-prof-fila${p ? ' om30-prof-atendendo' : ''}`;
      if (box.__h !== html || box.className !== classe) {
        box.className = classe; box.innerHTML = html; box.__h = html;
        box.title = p ? `Ficha aberta por ${p.por}${p.local ? ' · ' + p.local : ''}` : `Senha chamada por ${c.nome}${c.guiche ? ' no ' + c.guiche : ''}`;
      }
      vistos.add(box);
    }
    for (const b of tbody.querySelectorAll('.om30-prof-fila')) if (!vistos.has(b)) b.remove();
    agendarValidadeVisual();
  }
  // Título da fila: "📢 NOME · Acolhimento" com paciente chamado; senão "(N) Acolhimento" (🔴 se há vermelho).
  const NOME_TELA = TIPO === 'atendimento' ? 'Fila Médica' : 'Acolhimento';
  function painelChamada(vm) {
    let v = vm;
    for (let i = 0; v && i < 12; i++, v = v.$parent) if (v.$refs?.filaChamarProximo) return v.$refs.filaChamarProximo;
    return null;
  }
  function atualizarTitulo(vm) {
    const fila = painelChamada(vm);
    if (fila?.proximoFila) { definirTitulo(`📢 ${limpo(fila.nomeMunicipe) || limpo(fila.proximoFila.senha) || 'Paciente chamado'} · ${NOME_TELA}`); return; }
    const itens = vm?.items || [];
    const vermelho = itens.some(it => /vermelh/i.test(it?.nome_grau_risco || ''));
    definirTitulo(`${vermelho ? '🔴 ' : ''}(${itens.length}) ${NOME_TELA}`);
  }
  let tPintura = 0;
  function agendarPintura() { clearTimeout(tPintura); tPintura = setTimeout(() => { const vm = colecao(); if (vm) { pintar(vm); atualizarTitulo(vm); } }, 300); }

  let rodando = false;
  async function ciclo() {
    if (rodando || document.hidden) return;
    const vm = colecao();
    if (!vm) return;
    rodando = true;
    try {
      const itens = itensValidos(vm);
      const ativos = new Set(itens.map(it => it.atendimento_str));
      // Presença (uma consulta em lote ao D1).
      if (api() && itens.length) {
        const m = await api().lote(itens.map(it => { const [tipo, id] = it.atendimento_str.split('#'); return { id, tipo }; }));
        // Falha não é lista vazia: só conserva concessões com expiração real ainda válida.
        if (m.consultaOk === false) {
          for (const [k, p] of presencas) if (ativos.has(k) && p.validoAte > Date.now() && !m.has(k) && !m.consultadosOk?.has(k)) m.set(k, p);
        }
        for (const [k, p] of m) if (p.setor !== SETOR) m.delete(k);
        presencas = m;
        pintar(vm); // não espera consultas lentas de senha para mostrar a presença confirmada.
      }
      for (const [k, p] of presencas) if (!ativos.has(k) || (p.validoAte && p.validoAte <= Date.now())) presencas.delete(k);
      // Chamadas: prioridade por tentativa mais antiga, inclusive quando a consulta falha.
      // O limite 15 controla carga por ciclo, mas não deixa os últimos pacientes presos atrás dos primeiros.
      const local = localId(vm);
      if (local) {
        const agora = Date.now();
        const alvo = itens.filter(it => it.senha && (it.chamada_em || chamadas.has(it.atendimento_str)) && !presencas.has(it.atendimento_str))
          .filter(it => !(chamadas.get(it.atendimento_str)?.t > agora - VALIDADE_SENHA_MS))
          .sort((a, b) => (tentativasSenha.get(a.atendimento_str) || 0) - (tentativasSenha.get(b.atendimento_str) || 0))
          .slice(0, MAX_POR_CICLO);
        // Três consultas nativas por vez. Não sobrescreve uma chamada capturada durante a consulta.
        for (let i = 0; i < alvo.length; i += 3) await Promise.all(alvo.slice(i, i + 3).map(async it => {
          const inicio = Date.now(), anterior = chamadas.get(it.atendimento_str), revisao = revisoesChamada.get(it.atendimento_str) || 0;
          tentativasSenha.set(it.atendimento_str, inicio);
          const [tipo, id] = it.atendimento_str.split('#');
          const r = await consultarSenha(local, tipo, id);
          if (r && chamadas.get(it.atendimento_str) === anterior && (revisoesChamada.get(it.atendimento_str) || 0) === revisao) chamadas.set(it.atendimento_str, { ...r, t: Date.now() });
        }));
      }
      for (const k of chamadas.keys()) if (!ativos.has(k)) chamadas.delete(k);
      for (const k of tentativasSenha.keys()) if (!ativos.has(k)) tentativasSenha.delete(k);
      pintar(vm);
      atualizarTitulo(vm);
    } catch (e) { console.warn('[OM30 Profissional na fila]', e?.message || e); }
    finally { rodando = false; }
  }

  const css = document.createElement('style');
  css.textContent = "\n.om30-prof-fila{display:flex;box-sizing:border-box;width:fit-content;max-width:100%;margin-top:6px;padding:7px 10px;border:1px solid #b7c2cc;border-left:3px solid #718494;border-radius:7px;background:#eef2f5;color:#2f3740;text-align:left;white-space:normal;font-family:inherit;font-size:12px;line-height:1.35;letter-spacing:normal;text-transform:none}\n.om30-prof-fila .om30-prof-corpo{display:flex;flex-direction:column;min-width:0;gap:3px}\n.om30-prof-fila .om30-prof-estado{display:inline-flex;align-items:center;gap:6px;max-width:100%;font-size:12px;line-height:1.35;font-weight:700;color:#394f60}\n.om30-prof-fila .om30-prof-ponto{display:inline-block;box-sizing:border-box;flex:0 0 6px;width:6px;height:6px;border:1px solid currentColor;border-radius:50%}\n.om30-prof-fila .om30-prof-detalhes{display:flex;flex-wrap:nowrap;align-items:baseline;min-width:0;max-width:100%;column-gap:5px;row-gap:0}\n.om30-prof-fila .om30-prof-nome{display:block;flex:0 1 auto;min-width:0;max-width:100%;font-size:13px;line-height:1.4;font-weight:600;color:#26333e;overflow-wrap:anywhere}\n.om30-prof-fila .om30-prof-local{display:block;flex:0 0 auto;min-width:0;font-size:11px;line-height:1.4;font-weight:400;color:#526371;white-space:nowrap}\n.om30-prof-fila .om30-prof-local::before{content:'·';padding-right:7px;color:#74838e}\n.om30-prof-fila.om30-prof-atendendo{border-color:#a8c6b8;border-left-color:#3d7f62;background:#eaf4ee}\n.om30-prof-fila.om30-prof-atendendo .om30-prof-estado{color:#285c41}\n.om30-prof-fila.om30-prof-atendendo .om30-prof-ponto{background:currentColor}\n@media(forced-colors:active){.om30-prof-fila{border:1px solid CanvasText;border-left-width:2px;background:Canvas;color:CanvasText}.om30-prof-fila .om30-prof-nome,.om30-prof-fila .om30-prof-estado,.om30-prof-fila .om30-prof-local,.om30-prof-fila .om30-prof-local::before{color:CanvasText}}\n";
  (document.head || document.documentElement).appendChild(css);
  setInterval(ciclo, CICLO_MS);
  setTimeout(ciclo, 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { agendarPintura(); void ciclo(); } });
  window.addEventListener('focus', () => { agendarPintura(); void ciclo(); });
  // A fila é redesenhada pelo Vue/scripts: repinta do cache; paciente recém-chamado sem nome dispara consulta.
  let t = 0, ultimaRapida = 0;
  new MutationObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      const vm = colecao();
      if (!vm) return;
      pintar(vm);
      atualizarTitulo(vm);
      const falta =itensValidos(vm).some(it => it.senha && it.chamada_em && !chamadas.has(it.atendimento_str) && !presencas.has(it.atendimento_str));
      if (falta && Date.now() - ultimaRapida > 3000) { ultimaRapida = Date.now(); void ciclo(); }
    }, 300);
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.OM30ProfissionalFila = {
    status: () => ({ tela: TIPO, presencas: [...presencas.entries()], chamadas: [...chamadas.entries()] }),
    atualizar: () => { for (const c of chamadas.values()) c.t = Math.min(c.t, Date.now() - VALIDADE_SENHA_MS); return ciclo(); }
  };
})();
// ===== FIM OM30 PROFISSIONAL NA FILA =====


(() => {
  'use strict';

  // v2.4.3:
  // - Desfaz a mudança visual da 2.4.2 (etiqueta de espera, idade, células): volta como era no PS.
  //   Fica só a correção do filtro.
  //
  // v2.4.2:
  // - Filtro da fila do acolhimento (Preferencial/Retorno/Dentista) voltava a mostrar todas as linhas:
  //   a regra que esconde exigia a tabela dentro de .collection-with-search-atendimento, que não existe
  //   na tela do acolhimento do PS. Agora esconde em qualquer tabela.
  //
  // v2.4.1:
  // - Envio das chamadas para o Worker ps (histórico de chamadas por senha).
  //
  // v2.3.17 (candidata, não publicada):
  // - Presença: o acolhimento só mostra "Em atendimento" de ficha aberta no setor ACOLHIMENTO.
  //
  // v2.3.16:
  // - Fila principal do acolhimento: cards de filtro no padrão da fila médica —
  //   Todos, Preferencial, Retorno e Dentista, cada um com quantidade e tempo médio de espera.
  // - Clicar no card mostra só aquele grupo (as outras linhas ficam ocultas, nada sai da fila).
  //   O filtro escolhido fica salvo no navegador.
  // - Grupo pelo prefixo da senha: RT = Retorno (mesma regra da fila médica),
  //   PF = Preferencial, DT = Dentista.
  //
  // v2.3.9:
  // - Origem da ausência registrada no Cloudflare D1 no momento em que o Saúde Simples confirma
  //   "Paciente ausente" (PUT nativo, resposta 2xx; descartada se o próprio sistema desfizer).
  // - Lista de ausentes consulta o D1 em lote: com registro, a origem vem do D1 (sem varrer guichês);
  //   sem registro, segue exatamente como antes. Nada técnico aparece na tela.
  // - Grava também QUEM ausentou (profissional logado) e o local/guichê no momento do clique;
  //   a coluna "Ausente em" mostra "Ausentado por Fulano · Local" e a hora real da ausência.
  // - "Fila não encontrada" passa a ser "Origem não confirmada" (remoção continua bloqueada).
  // - Filas do acolhimento e médica, como no Controle de Salas: "Confirmar atendimento" e "Atender"
  //   abrem a ficha numa aba nova; a linha mostra "Em atendimento: Fulano · Local" enquanto a ficha
  //   estiver aberta (presença no D1) e "Chamado por Fulano · Guichê" quando a senha foi chamada.
  //   Título da aba: "(N) Acolhimento" / "📢 NOME · Fila Médica"; na ficha "Atendimento · NOME".
  //   "Sair" ou "Salvar" na ficha aberta em aba nova: encerra a presença e fecha a aba.
  // - O script do Acolhimento não roda mais na fila do médico (/prontuarios): lá fica só a Fila Médica,
  //   com o "Desvincular senha de outro profissional" dela.
  // - Fila médica: menu (*) não fica mais atrás do Chamar/Atender da linha de baixo nem quebra na última
  //   linha (a proteção existente passa a ser ligada no modo atual da fila).
  // - Suporte: OM30Ausencias.diagnostico() no console.
  //
  // v2.0.13:
  // - Chamar NÃO desvincula mais senha automaticamente quando recebe 422 ja_chamada.
  // - Mostra aviso orientando a usar a engrenagem (*) > "Desvincular senha de outro profissional".
  // - A desvinculação continua exclusivamente manual, com confirmação.
  //
  // v2.0.12:
  // - Fila principal do acolhimento passa a usar a mesma estratégia da Fila Médica/Controle de Salas.
  // - Primeira carga prepara customPerPage antes do fetch nativo e mostra a lista completa de uma vez.
  // - BTable fica com perPage=0 (sem corte interno em 10 linhas).
  // - Paginação manual fica somente como fallback se o backend realmente não devolver tudo, em lotes paralelos.
  // - Remove a tentativa de decoração antecipada da v2.0.11.
  //
  // v2.0.10:
  // - Preserva a pesquisa nativa por nome na fila principal do acolhimento.
  // - Enquanto houver texto pesquisado, o refresh silencioso de 20s não substitui o resultado.
  // - Ao limpar a pesquisa, a atualização automática volta normalmente.
  //
  // v2.0.9:
  // - Fila principal do acolhimento: visual reorganizado no padrão da fila médica.
  // - Data/Hora passa a mostrar tempo de espera atualizado sem redesenhar a tabela.
  // - Idade recebe leitura compacta e o topo mostra Total, Tempo médio e Horário.
  // - Mantidos fluxo, ordem nativa, Cloud/classificação, Ausentes e ações existentes.
  //
  // v2.0.8:
  // - Fila principal do acolhimento: adiciona no menu de ações (*) a opção
  //   "Desvincular senha de outro profissional".
  // - A ação só é liberada após confirmar no Senha Simples que a senha está presa em outro guichê/profissional.
  // - Mantém a mesma senha: retornar_para_atendimento -> desvincular, sem chamar automaticamente.
  //
  // v2.0.7:
  // - /acolhimentos: fila principal estável, sem o refresh nativo que reconstrói a tabela.
  // - Atualização silenciosa a cada 20s, preservando as linhas Vue existentes e carregando todas as páginas.
  // - Cloud/classificação e módulo de Ausentes permanecem inalterados.
  //
  // v2.0.6:
  // - CLOUD OM30 2 zero-config: credencial padrão embarcada de forma ofuscada, sem etapa manual por PC.
  // - Mantidos retry, deduplicação, pendência de sessão e possibilidade de override local para manutenção.
  //
  // v2.0.5:
  // - Ponte CLOUD OM30 2: após o encaminhamento do acolhimento ser confirmado, envia a classificação
  //   uma única vez ao Worker om30-classificacao-risco. API key fica somente no localStorage do navegador.
  // - Retry automático em falha de rede/Worker; pendência fica na sessão até receber confirmação 2xx.
  //
  // v2.0.4:
  // - Captura confirmada da classificação de risco enviada pelo Acolhimento ao Senha Simples:
  //   PUT /api/v2/filas/{categoria}/{tipo}/{senha_id}/encaminhar, lendo grau_risco_id (1..4).
  // - Não envia nada para Cloudflare ainda: guarda somente a última captura na sessão e dispara
  //   o evento "om30:classificacao-risco", pronto para a ponte da CLOUD OM30 2.
  //
  // v2.0.3:
  // - Mensagem ao devolver: deixa claro que é a MESMA senha do munícipe (não precisa informar
  //   número novo), só avisar que voltou para a fila.
  //
  // v2.0.2:
  // - Senha da ficha aparece igual às outras (sem etiqueta "ficha" nem borda tracejada).
  //
  // v2.0.1:
  // - Senha da ficha: passando o mouse mostra por que o Senha Simples não deu o número.
  //
  // v2.0.0:
  // - FICHA FUNCIONANDO: a leitura pulava o conteúdo da página porque confundia o dicionário
  //   dele com o da imagem anterior (PDF iText). Agora lê "SENHA:PD0038 08/10/2026 15:14:19".
  //
  // v1.9.9:
  // - Senha EM = Emergência sempre (venha do Senha Simples ou da ficha), com ou sem profissional.
  // - Ficha: quando não acha a senha, o motivo aparece ao passar o mouse e o texto lido vai
  //   para o console ([OM30 Ausentes] ficha sem senha), para ajustar a leitura.
  //
  // v1.9.8:
  // - CORREÇÃO (regressão da 1.9.0): voltou a consulta pelo guichê de quem está com a senha.
  //   Era isso que trazia o número da maioria quando o Senha Simples responde "em atendimento
  //   por FULANO no guichê X". Vale para a fila médica, emergência, acolhimento e a volta pelo
  //   acolhimento.
  // - "sem nº": passando o mouse mostra o motivo (o que o Senha Simples e a ficha responderam).
  //
  // v1.9.7:
  // - Senha vinda da ficha aparece marcada com "ficha" (só para visualizar; a devolução continua
  //   pelo Senha Simples). Medidor de tempo escondido na versão normal.
  //
  // v1.9.6:
  // - Não fica mais preso em "Conectando ao Senha Simples": a cada 5 s testa se o Senha Simples
  //   já responde e, respondendo, volta a buscar os números (antes esperava um token novo que
  //   podia nunca chegar, e aí ficava sem número para sempre).
  // - Console: OM30AusentesDebug(id) mostra fila por fila o que o Senha Simples respondeu.
  //
  // v1.9.5:
  // - Ficha (PDF iText/Jasper): lê também texto em hexadecimal, aceita a senha longe do rótulo
  //   (único código tipo AA0000 da ficha) e, se não achar, tenta de novo em 10 min (não 12 h).
  //
  // v1.9.4:
  // - CORREÇÃO: no 401 o script apagava o login (token) que a própria tela usa. Agora nunca
  //   mexe no token da tela nem recarrega o login do Senha Simples.
  //
  // v1.9.3:
  // - Clicar no tempo da barra copia o resultado (modo, tempos e quantos com número).
  //
  // v1.9.2:
  // - MODO_NUMERO (AMBOS / SENHA / FICHA) e medição de tempo na barra, para comparar.
  //
  // v1.9.1:
  // - Ausentes da fila médica voltaram a ter número: se a senha está com o profissional
  //   (Senha Simples esconde o número), pega o número na fila do acolhimento, onde a mesma
  //   senha já foi concluída. Só depois tenta a ficha.
  // - Console: OM30AusentesFicha(id) mostra o que o script leu na ficha (para conferir).
  //
  // v1.9.0:
  // - Origem pela coluna PROFISSIONAL da lista de ausentes da fila médica (mesma lista, mesmo
  //   atendimento): sem profissional = ausentado no ACOLHIMENTO; com profissional = ausentado
  //   na FILA MÉDICA (EM... = Emergência). É instantâneo e não depende do Senha Simples.
  //   No acolhimento a coluna vem da lista da fila médica, lida junto com a lista.
  // - O Senha Simples agora só completa a senha / quem chamou (1 consulta por paciente, só na
  //   fila certa). Com 401 a lista continua separada normalmente.
  //
  // v1.8.5:
  // - "sem nº" acabou: quando o Senha Simples não mostra o número (senha com outro profissional),
  //   o script lê a SENHA impressa na ficha do atendimento (PDF da ficha, lido por trás, sem
  //   abrir nada na tela). O número fica guardado, então cada ficha é lida uma vez só.
  //
  // v1.8.4:
  // - Emergência separada da fila médica: card/filtro próprio "Emergência" (fila EMERGÊNCIA
  //   do Senha Simples ou senha começando com EM). Na tela da fila médica pode ser removida
  //   (devolve para a emergência); no acolhimento fica bloqueada.
  //
  // v1.8.3:
  // - Ausente novo aparece sozinho em até ~30 s: a cada 30 s lê só a página 1 da lista (os mais
  //   recentes vêm primeiro) e consulta no Senha Simples só quem é novo. A conferência completa
  //   de hoje (quem saiu da lista em outro computador) roda a cada 5 min e no Atualizar.
  //
  // v1.8.2:
  // - Lista: as páginas dos ausentes são buscadas 6 de uma vez (cada página do sistema leva ~2,5 s).
  // - HTTP 401: não sobrescreve mais o token que a própria tela está usando; ao dar 401, recarrega
  //   o login do Senha Simples da tela (iframe) e espera o token novo, sem ficar repetindo consultas.
  // - Mais consultas simultâneas ao Senha Simples (8).
  //
  // v1.8.1:
  // - Bem mais rápido: para cada ausente consulta primeiro a fila médica; só se não decidir
  //   consulta o acolhimento, e só no fim as outras filas (antes eram TODAS as filas, sempre).
  //   4 consultas ao mesmo tempo. O resultado fica guardado 30 min (vale entre recargas e
  //   entre as telas), então a segunda abertura é quase imediata.
  // - Emergência/urgência contam como fila médica. Fila reconhecida também pelo nome.
  // - O histórico completo da senha é buscado só ao abrir os detalhes.
  //
  // v1.8.0:
  // - Funciona também na aba AUSENTES da fila médica (/prontuarios e /prontuarios/urgencia_emergencia).
  //   Lá só remove quem foi ausentado na fila médica (devolvendo a mesma senha para a fila médica);
  //   quem foi ausentado no acolhimento fica só para consulta, com o botão bloqueado.
  //
  // v1.7.2:
  // - HTTP 401 do Senha Simples (token vencido / login ainda não terminou): não mostra erro.
  //   Espera o token novo que a própria tela recebe do Senha Simples e verifica sozinho.
  //   Se o Senha Simples não estiver logado no navegador, avisa o que fazer.
  //
  // v1.7.1:
  // - Muito mais rápido: a lista de ausentes do sistema tem o histórico inteiro (dezenas de páginas).
  //   Agora carrega só as páginas de HOJE (várias ao mesmo tempo, mostrando conforme chegam).
  //   As páginas antigas só são buscadas quando "Somente hoje" é desmarcado.
  // - Usa a paginação certa da aba (#paginacaoAusentes, parâmetro page_ausentes).
  //
  // v1.7.0:
  // - Lista completa numa página só: busca todas as páginas dos ausentes (sem o limite de 10)
  //   e esconde a paginação. A cada revisita, entra quem foi ausentado e sai quem foi removido,
  //   sem recarregar a tela.
  //
  // v1.6.3:
  // - Não precisa clicar em Atualizar: se nada for encontrado, refaz sozinho do zero;
  //   revisita a lista a cada 90 s e quando a aba volta ao foco. "Não encontrada" não fica em cache.
  //
  // v1.6.2:
  // - Senha Simples logado em outra unidade: consulta direto as filas de acolhimento e médica
  //   desta unidade (antes tudo virava "sem senha") e avisa na barra.
  // - Remoção só liberada para ausentes confirmados no ACOLHIMENTO; o resto fica bloqueado.
  //
  // v1.6.0:
  // - Visual: colunas "Senha" e "Ausente em" na lista de ausentes; janelas e avisos novos
  //   (confirmação, sucesso, erro, bloqueio) no padrão OM30; detalhe da senha redesenhado.
  //
  // v1.5.0:
  // - Senha presa: ao clicar em Chamar e o Senha Simples responder "já chamada / em atendimento
  //   por FULANO", solta a senha (retornar + desvincular) e chama por este guichê.
  //   Vale no acolhimento e na tela do médico.
  // - Devolver da ausência já solta a senha (desvincular), para qualquer guichê chamar.
  //
  // v1.4.2:
  // - 422 "em atendimento no guichê X": consulta de novo pelo guichê X (às vezes vem a senha completa).
  // - "seu usuário" do Senha Simples não vira mais "você" (era texto genérico).
  // - Quando a senha foi concluída sem ser chamada, mostra quem concluiu.
  //
  // v1.4.1:
  // - Consulta com até 3 tentativas e 2 pacientes por vez (o Senha Simples recusava rajadas);
  //   se ainda falhar, o código do erro aparece na etiqueta.
  // - Etiqueta reorganizada: senha em destaque + "Ausente: Emergência"; nomes de setor curtos;
  //   "Chamado por Bianca Jeniffer no Emergência".
  //
  // v1.4.0:
  // - Botão "Senha" em cada ausente: mostra a senha, em qual fila foi ausentado, a hora em que a
  //   senha foi concluída (= ausência) e o histórico por fila (gerada, chamada, concluída, por quem).
  //
  // v1.3.1:
  // - Ausentes da fila médica / emergência / outros: botão de remover BLOQUEADO no acolhimento
  //   (cinza, sem opção de forçar). Os grupos continuam visíveis para consulta.
  //
  // v1.3.0:
  // - Mostra quem chamou a senha por último na fila de origem ("chamado por FULANO · GUICHÊ").
  // - Remover ausência de quem foi ausentado NO ACOLHIMENTO: remove a ausência e devolve a
  //   mesma senha para a fila do acolhimento (retornar_para_atendimento), mostrando o número.
  //   Se a senha não voltar, avisa claramente.
  //
  // v1.2.1:
  // - Salas não ausentam: quem passou por medicação/exames/raio-x/procedimento conta como FILA MÉDICA.
  //
  // v1.2.0:
  // - Consulta a senha em TODAS as filas do Senha Simples da unidade.
  // - 422 "já chamada" conta como senha existente naquela fila (antes virava "Erro").
  // - Origem = fila mais adiantada no fluxo onde a senha existe
  //   (recepção < acolhimento < médico/emergência/pediatria), desempate por created_at.
  //   Salas (medicação, exames, raio-x, procedimento) NÃO ausentam: quem passou por sala
  //   volta para a fila médica e conta como FILA MÉDICA.
  //   Senha parada (nunca chamada nem concluída) só conta se não houver outra.
  // - "Outros setores" mostra o nome da fila (ex.: EMERGÊNCIA, MEDICAÇÃO).
  //
  // v1.1.1:
  // - Leitura das filas em sequência + nova tentativa; o aviso mostra o erro real.
  //
  // v1.1.0:
  // - Locais das filas descobertos pela parametrização DA UNIDADE LOGADA
  //   (/filas/parametrizacoes/{acolhimento|atendimento} -> categoria -> locais_atendimento).
  //   Não depende mais do guichê salvo no computador (que podia ser de outra unidade).
  //
  // v1.0.0:
  // - Origem da ausência pela senha do Senha Simples (recuperar_senha_saude_atendimento):
  //     senha na fila médica          -> FILA MÉDICA
  //     senha só na fila acolhimento  -> ACOLHIMENTO
  //     senha nas duas                -> vale a mais recente (created_at)
  //     nenhuma das duas              -> OUTROS (encaminhado p/ outro setor / sem senha)
  // - Remover pelo acolhimento um ausente da FILA MÉDICA pede confirmação
  //   (removendo pela tela errada o paciente some das duas filas).

  if (window.__OM30_AUSENTES_ACOLHIMENTO_V203__) return;
  window.__OM30_AUSENTES_ACOLHIMENTO_V203__ = true;

  // De onde vem o NÚMERO da senha (a origem é sempre pelo profissional):
  //   'AMBOS' = Senha Simples e, se ele esconder, a ficha | 'SENHA' = só Senha Simples | 'FICHA' = só a ficha
  const MODO_NUMERO = 'AMBOS';
  let T0 = performance.now();
  const VERSAO = (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '2.0.13';
  const PREFIX = 'om30-ausentes-acolhimento';
  // Tela atual: acolhimento ou fila médica (prontuarios e urgencia_emergencia são a mesma fila).
  const TELA = location.pathname.startsWith('/prontuarios') ? 'MEDICO' : 'ACOLHIMENTO';
  const STORAGE_FILTRO = TELA === 'MEDICO' ? `${PREFIX}:filtro-medico` : `${PREFIX}:filtro`;
  const STORAGE_HOJE = `${PREFIX}:somente-hoje`;
  const SESSION_LOCAIS = `${PREFIX}:locais-unidade-v17`;
  const SESSION_CACHE = `${PREFIX}:origem-v22:`;   // guardado no localStorage
  const BAR_ID = `${PREFIX}-barra`;
  const MODAL_ID = `${PREFIX}-modal`;
  const STYLE_ID = `${PREFIX}-css-v161`;
  const CACHE_LOCAIS_MS = 30 * 60 * 1000;
  const CACHE_ORIGEM_MS = 30 * 60 * 1000;
  const REVERIFICAR_MS = 30 * 1000;            // leitura leve (página 1)
  const CONFERENCIA_COMPLETA_MS = 5 * 60 * 1000;  // relê todas as páginas de hoje
  const CONCORRENCIA = 6;
  // /ausentes/{id} no acolhimento, /atendimento_ausentes/{id} na fila médica
  const SEL_REMOVER = 'a[href*="ausentes/"][data-method="delete"]';

  const FILTROS = [
    { key: 'TODOS',       label: 'Todos',       sub: 'ausentes',              cor: '#6c757d' },
    { key: 'ACOLHIMENTO', label: 'Acolhimento', sub: 'pode devolver aqui',    cor: '#198754' },
    { key: 'MEDICO',      label: 'Fila médica', sub: 'só consulta aqui',      cor: '#6f42c1' },
    { key: 'EMERGENCIA',  label: 'Emergência',  sub: '',                      cor: '#dc3545' },
    { key: 'OUTROS',      label: 'Outros setores', sub: 'emergência · só consulta', cor: '#f9b000' }
  ];
  const FILTROS_VALIDOS = new Set(FILTROS.map(f => f.key));

  const ROTULO_ORIGEM = {
    ACOLHIMENTO: 'Acolhimento',
    MEDICO: 'Fila médica',
    EMERGENCIA: 'Emergência',
    OUTROS: 'Outro setor',
    SEM_SENHA: 'Origem não confirmada',
    ERRO: 'Origem não confirmada',
    INDEFINIDO: 'Origem não confirmada'
  };

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  const clean = valor => String(valor ?? '').replace(/\s+/g, ' ').trim();
  const norm = valor => clean(valor).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const semEspaco = valor => norm(valor).replace(/\s/g, '');
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const hora = iso => {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  };
  const horarioCurtoAgora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  function lerJSON(chave, store = localStorage) {
    try { return JSON.parse(store.getItem(chave) || 'null') || {}; } catch { return {}; }
  }

  function gravar(chave, valor, store = localStorage) {
    try { store.setItem(chave, typeof valor === 'string' ? valor : JSON.stringify(valor)); } catch {}
  }

  function esperar(condicao, ms = 30000) {
    return new Promise((resolve, reject) => {
      const inicio = Date.now();
      (function loop() {
        try { if (condicao()) return resolve(); } catch {}
        if (Date.now() - inicio > ms) return reject(new Error('timeout'));
        setTimeout(loop, 300);
      })();
    });
  }

  async function emParalelo(itens, limite, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: limite }, async () => {
      while (i < itens.length) { const k = i++; await fn(itens[k]); }
    }));
  }

  // ---------------------------------------------------------------------------
  // Classificação de risco enviada pelo Acolhimento
  //   Captura confirmada do Senha Simples:
  //   PUT /api/v2/filas/{categoria_origem}/{tipo_origem}/{senha_id}/encaminhar
  //   body: grau_risco_id + tipo_atendimento_destino_id
  //
  //   Guarda a última captura da sessão e dispara "om30:classificacao-risco".
  //   A ponte CLOUD OM30 2, abaixo, escuta esse evento e faz o POST sem alterar o fluxo nativo.
  // ---------------------------------------------------------------------------

  const OM30_CLASSIFICACAO_RISCO_CAPTURE_V1 = true;
  const STORAGE_ULTIMA_CLASSIFICACAO = `${PREFIX}:ultima-classificacao-risco`;
  const RISCO_POR_ID = Object.freeze({
    1: 'VERMELHO',
    2: 'AMARELO',
    3: 'VERDE',
    4: 'AZUL'
  });

  function corpoComoObjeto(corpo) {
    if (corpo == null) return {};
    if (typeof FormData !== 'undefined' && corpo instanceof FormData) {
      return Object.fromEntries([...corpo.entries()]);
    }
    if (typeof URLSearchParams !== 'undefined' && corpo instanceof URLSearchParams) {
      return Object.fromEntries(corpo.entries());
    }
    if (typeof corpo === 'object') return corpo;
    const txt = String(corpo || '').trim();
    if (!txt) return {};
    try {
      const j = JSON.parse(txt);
      if (j && typeof j === 'object') return j;
    } catch {}
    try {
      return Object.fromEntries(new URLSearchParams(txt).entries());
    } catch {}
    return {};
  }

  function valorProfundo(obj, nomes, nivel = 0) {
    if (!obj || typeof obj !== 'object' || nivel > 4) return null;
    for (const nome of nomes) {
      if (Object.prototype.hasOwnProperty.call(obj, nome) && obj[nome] != null) return obj[nome];
    }
    for (const valor of Object.values(obj)) {
      if (!valor || typeof valor !== 'object') continue;
      const achou = valorProfundo(valor, nomes, nivel + 1);
      if (achou != null) return achou;
    }
    return null;
  }

  function lerEncaminhamentoClassificacao(url, metodo, corpo) {
    if (!location.pathname.startsWith('/acolhimentos')) return null;
    if (String(metodo || '').toUpperCase() !== 'PUT') return null;

    let u;
    try { u = new URL(String(url || ''), location.href); } catch { return null; }

    const m = u.pathname.match(/\/api\/v2\/filas\/([^/]+)\/([^/]+)\/([^/]+)\/encaminhar\/?$/i);
    if (!m) return null;

    const dados = corpoComoObjeto(corpo);
    const riscoBruto = valorProfundo(dados, ['grau_risco_id']);
    const riscoId = Number(riscoBruto);
    if (!Number.isInteger(riscoId) || !RISCO_POR_ID[riscoId]) return null;

    return {
      senha_id: decodeURIComponent(m[3]),
      categoria_origem_id: decodeURIComponent(m[1]),
      tipo_atendimento_origem_id: decodeURIComponent(m[2]),
      tipo_atendimento_destino_id: String(
        valorProfundo(dados, ['tipo_atendimento_destino_id']) ?? ''
      ) || null,
      grau_risco_id: riscoId,
      classificacao: RISCO_POR_ID[riscoId],
      capturado_em: new Date().toISOString()
    };
  }

  let ultimaAssinaturaClassificacao = '';
  let ultimaAssinaturaClassificacaoEm = 0;

  function registrarClassificacaoCapturada(info) {
    if (!info?.senha_id || !info?.grau_risco_id) return;

    // Axios/fetch/XHR podem passar pela mesma camada em alguns ambientes.
    // Evita registrar duas vezes a mesma operação.
    const assinatura = `${info.senha_id}:${info.grau_risco_id}:${info.tipo_atendimento_destino_id || ''}`;
    const agora = Date.now();
    if (assinatura === ultimaAssinaturaClassificacao && agora - ultimaAssinaturaClassificacaoEm < 3000) return;
    ultimaAssinaturaClassificacao = assinatura;
    ultimaAssinaturaClassificacaoEm = agora;

    gravar(STORAGE_ULTIMA_CLASSIFICACAO, info, sessionStorage);
    console.info('[OM30 Ausentes] classificação capturada:', info);
    try {
      window.dispatchEvent(new CustomEvent('om30:classificacao-risco', { detail: info }));
    } catch {}
  }

  // 1) Caminho principal: o Saúde Simples usa um proxy Axios para conversar com o Senha Simples.
  //    Interceptamos somente respostas 2xx, ou seja, a classificação já foi aceita.
  async function instalarCapturaClassificacaoAxios() {
    try {
      await esperar(() => {
        const p = (typeof senhaSimplesProxy !== 'undefined') ? senhaSimplesProxy : null;
        return !!p?.interceptors?.response?.use;
      }, 30000);
    } catch { return false; }

    const p = (typeof senhaSimplesProxy !== 'undefined') ? senhaSimplesProxy : null;
    if (!p?.interceptors?.response?.use) return false;
    if (p.__om30ClassificacaoRiscoInterceptor) return true;

    p.interceptors.response.use(resp => {
      try {
        const cfg = resp?.config || {};
        const info = lerEncaminhamentoClassificacao(cfg.url, cfg.method, cfg.data);
        if (info) registrarClassificacaoCapturada(info);
      } catch (e) {
        console.warn('[OM30 Ausentes] captura da classificação:', e);
      }
      return resp;
    });

    try { Object.defineProperty(p, '__om30ClassificacaoRiscoInterceptor', { value: true }); }
    catch { p.__om30ClassificacaoRiscoInterceptor = true; }
    return true;
  }

  // 2) Fallback de segurança para telas que façam o PUT diretamente por XMLHttpRequest.
  function instalarCapturaClassificacaoXHR() {
    const proto = window.XMLHttpRequest?.prototype;
    if (!proto || proto.__om30ClassificacaoRiscoXHR) return;

    const abrir = proto.open;
    const enviar = proto.send;

    proto.open = function(method, url, ...resto) {
      this.__om30ClassificacaoMeta = { method, url };
      return abrir.call(this, method, url, ...resto);
    };

    proto.send = function(body) {
      const meta = this.__om30ClassificacaoMeta;
      let candidato = null;
      try { candidato = lerEncaminhamentoClassificacao(meta?.url, meta?.method, body); } catch {}
      if (candidato) {
        this.addEventListener('loadend', () => {
          if (this.status >= 200 && this.status < 300) registrarClassificacaoCapturada(candidato);
        }, { once: true });
      }
      return enviar.call(this, body);
    };

    try { Object.defineProperty(proto, '__om30ClassificacaoRiscoXHR', { value: true }); }
    catch { proto.__om30ClassificacaoRiscoXHR = true; }
  }

  instalarCapturaClassificacaoXHR();
  instalarCapturaClassificacaoAxios();

  // Diagnóstico rápido no console. Retorna somente a última classificação desta aba.
  window.OM30ClassificacaoRiscoUltima = () => lerJSON(STORAGE_ULTIMA_CLASSIFICACAO, sessionStorage);


  // ---------------------------------------------------------------------------
  // Ponte CLOUD OM30 2
  //   Zero-config: a credencial padrão já acompanha o script.
  //   OM30ClassificacaoCloudConfig(...) fica apenas como override opcional para manutenção.
  // ---------------------------------------------------------------------------

  const OM30_CLASSIFICACAO_CLOUD_V1 = true;
  const CLASSIFICACAO_CLOUD_URL = 'https://om30-classificacao-risco.cloud-om30-2.workers.dev';
  const STORAGE_CLASSIFICACAO_CLOUD_KEY = `${PREFIX}:classificacao-cloud-api-key`;
  const CLASSIFICACAO_CLOUD_KEY_PADRAO = () => String.fromCharCode(111,109,51,48,50,48,50,54);
  const SESSION_CLASSIFICACAO_PENDENTE = `${PREFIX}:classificacao-cloud-pendente`;
  const SESSION_CLASSIFICACAO_ULTIMO_ENVIO = `${PREFIX}:classificacao-cloud-ultimo-envio`;

  let envioClassificacaoEmCurso = null;
  let avisoCloudSemChave = false;

  function classificacaoCloudKey() {
    try {
      return clean(localStorage.getItem(STORAGE_CLASSIFICACAO_CLOUD_KEY)) || CLASSIFICACAO_CLOUD_KEY_PADRAO();
    } catch {
      return CLASSIFICACAO_CLOUD_KEY_PADRAO();
    }
  }

  function payloadClassificacaoCloud(info) {
    return {
      senha_id: String(info?.senha_id || ''),
      grau_risco_id: Number(info?.grau_risco_id || 0),
      categoria_origem_id: info?.categoria_origem_id || null,
      tipo_atendimento_origem_id: info?.tipo_atendimento_origem_id || null,
      tipo_atendimento_destino_id: info?.tipo_atendimento_destino_id || null
    };
  }

  function assinaturaClassificacaoCloud(info) {
    return [
      info?.senha_id || '',
      info?.grau_risco_id || '',
      info?.tipo_atendimento_destino_id || ''
    ].join(':');
  }

  async function postarClassificacaoCloud(info, { tentativas = 3 } = {}) {
    const apiKey = classificacaoCloudKey();
    if (!apiKey) {
      if (!avisoCloudSemChave) {
        avisoCloudSemChave = true;
        console.info('[OM30 Ausentes] CLOUD OM30 2 sem credencial disponível.');
      }
      return { ok: false, sem_chave: true };
    }

    const payload = payloadClassificacaoCloud(info);
    if (!payload.senha_id || !RISCO_POR_ID[payload.grau_risco_id]) {
      return { ok: false, invalido: true };
    }

    const assinatura = assinaturaClassificacaoCloud(payload);
    const ultimo = lerJSON(SESSION_CLASSIFICACAO_ULTIMO_ENVIO, sessionStorage);
    if (ultimo.assinatura === assinatura && Date.now() - Number(ultimo.t || 0) < 10000) {
      return { ok: true, duplicado: true };
    }

    gravar(SESSION_CLASSIFICACAO_PENDENTE, info, sessionStorage);

    let erro = null;
    for (let i = 0; i < tentativas; i++) {
      try {
        const r = await fetch(`${CLASSIFICACAO_CLOUD_URL}/v1/classificacoes`, {
          method: 'POST',
          mode: 'cors',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'X-OM30-Key': apiKey
          },
          body: JSON.stringify(payload)
        });

        let resposta = null;
        try { resposta = await r.json(); } catch {}

        if (!r.ok) {
          const detalhe = resposta?.erro || `HTTP ${r.status}`;
          // 401 não melhora com retry: chave configurada neste navegador está incorreta.
          if (r.status === 401) throw Object.assign(new Error(detalhe), { semRetry: true, status: 401 });
          throw new Error(detalhe);
        }

        try { sessionStorage.removeItem(SESSION_CLASSIFICACAO_PENDENTE); } catch {}
        gravar(SESSION_CLASSIFICACAO_ULTIMO_ENVIO, { assinatura, t: Date.now() }, sessionStorage);
        console.info('[OM30 Ausentes] classificação enviada à CLOUD OM30 2:', {
          senha_id: payload.senha_id,
          classificacao: RISCO_POR_ID[payload.grau_risco_id]
        });
        return { ok: true, resposta };
      } catch (e) {
        erro = e;
        if (e?.semRetry || i === tentativas - 1) break;
        await new Promise(ok => setTimeout(ok, [1000, 3000, 6000][i] || 6000));
      }
    }

    console.warn('[OM30 Ausentes] CLOUD OM30 2: classificação ficou pendente para reenvio:', erro);
    return { ok: false, erro: String(erro?.message || erro) };
  }

  function enviarClassificacaoCloud(info) {
    // Serializa os envios nesta aba para não criar duas gravações concorrentes
    // caso Axios/XHR notifiquem quase juntos.
    const anterior = envioClassificacaoEmCurso || Promise.resolve();
    const atual = anterior.catch(() => {}).then(() => postarClassificacaoCloud(info));
    envioClassificacaoEmCurso = atual;
    atual.finally(() => {
      if (envioClassificacaoEmCurso === atual) envioClassificacaoEmCurso = null;
    });
    return atual;
  }

  window.addEventListener('om30:classificacao-risco', ev => {
    const info = ev?.detail;
    if (info?.senha_id) void enviarClassificacaoCloud(info);
  });

  // Configura a chave somente neste navegador/origem. Não imprime nem devolve a chave.
  window.OM30ClassificacaoCloudConfig = chave => {
    const valor = clean(chave);
    if (!valor) {
      return {
        ok: false,
        configurada: !!classificacaoCloudKey(),
        mensagem: 'Informe a chave da CLOUD OM30 2.'
      };
    }
    try { localStorage.setItem(STORAGE_CLASSIFICACAO_CLOUD_KEY, valor); }
    catch { return { ok: false, configurada: false, mensagem: 'Não consegui gravar no localStorage.' }; }

    avisoCloudSemChave = false;
    const pendente = lerJSON(SESSION_CLASSIFICACAO_PENDENTE, sessionStorage);
    const ultima = lerJSON(STORAGE_ULTIMA_CLASSIFICACAO, sessionStorage);
    const reenviar = pendente?.senha_id ? pendente : ultima?.senha_id ? ultima : null;
    if (reenviar) void enviarClassificacaoCloud(reenviar);

    return {
      ok: true,
      configurada: true,
      endpoint: CLASSIFICACAO_CLOUD_URL,
      reenviando_pendente: !!reenviar
    };
  };

  window.OM30ClassificacaoCloudStatus = () => {
    const pendente = lerJSON(SESSION_CLASSIFICACAO_PENDENTE, sessionStorage);
    return {
      versao: '1.0',
      configurada: !!classificacaoCloudKey(),
      endpoint: CLASSIFICACAO_CLOUD_URL,
      pendente: pendente?.senha_id ? {
        senha_id: pendente.senha_id,
        grau_risco_id: pendente.grau_risco_id,
        classificacao: pendente.classificacao
      } : null
    };
  };

  window.OM30ClassificacaoCloudReenviar = () => {
    const pendente = lerJSON(SESSION_CLASSIFICACAO_PENDENTE, sessionStorage);
    const ultima = lerJSON(STORAGE_ULTIMA_CLASSIFICACAO, sessionStorage);
    const info = pendente?.senha_id ? pendente : ultima?.senha_id ? ultima : null;
    return info ? enviarClassificacaoCloud(info) : Promise.resolve({ ok: false, vazio: true });
  };

  // Se a página recarregou depois de uma falha, tenta novamente a classificação pendente.
  setTimeout(() => {
    const pendente = lerJSON(SESSION_CLASSIFICACAO_PENDENTE, sessionStorage);
    if (pendente?.senha_id && classificacaoCloudKey()) void enviarClassificacaoCloud(pendente);
  }, 1500);

  // ---------------------------------------------------------------------------
  // Senha Simples (somente leitura)
  // ---------------------------------------------------------------------------

  const fnRecuperar = () =>
    (typeof senhaSimplesGetSenhaAtendimento === 'function') ? senhaSimplesGetSenhaAtendimento : null;
  const proxySenha = () =>
    (typeof senhaSimplesProxy !== 'undefined') ? senhaSimplesProxy : null;
  const senhaSimplesPronto = () =>
    !!fnRecuperar() && !!sessionStorage.getItem('senhaSimplesToken');

  // Sempre usa o token mais novo que a tela recebeu do Senha Simples.
  function garantirTokenSenha() {
    const proxy = proxySenha();
    const token = sessionStorage.getItem('senhaSimplesToken');
    if (!proxy || !token) return;
    const h = proxy.defaults.headers || {};
    // Se a tela já tem um token no proxy, é ele que vale (pode ser mais novo que o guardado).
    if (!h.Authorization && !(h.common && h.common.Authorization)) {
      proxy.defaults.headers = { ...h, Authorization: `Bearer ${token}` };
    }
  }

  // ---- Token do Senha Simples ----
  // A tela recebe o token por mensagem do Senha Simples (iframe) a cada carga. O token que já
  // estava guardado pode estar vencido (HTTP 401) até essa mensagem chegar.
  let tokenRecebidoEm = 0;
  let erroLoginSenha = '';
  let aguardandoToken = false;
  let aoChegarToken = null;
  window.addEventListener('message', ev => {
    const a = ev.data;
    if (!a || a.source !== 'om30-senha-simples') return;
    if (!/^https:\/\/senha[a-z]*\.saudesimples\.net$/.test(ev.origin)) return;
    if (a.token) {
      erroLoginSenha = '';
      tokenRecebidoEm = Date.now();
      setTimeout(() => {
        if (aoChegarToken) aoChegarToken();
      }, 300);
    } else if (a.error) {
      erroLoginSenha = clean(a.error);
      if (aoChegarToken) aoChegarToken();
    }
  });

  const eh401 = e => e?.response?.status === 401 || /HTTP 401/.test(String(e));

  // Recarrega o iframe de login do Senha Simples que a própria tela usa: ele manda um token novo.
  let renovadoEm = 0;
  function renovarTokenSenha() {
    if (Date.now() - renovadoEm < 60000) return false;
    renovadoEm = Date.now();
    const frames = [...document.querySelectorAll('iframe')].filter(f => /senha[a-z]*\.saudesimples\.net/i.test(f.src || ''));
    frames.forEach(f => { try { const src = f.src; f.src = 'about:blank'; setTimeout(() => { f.src = src; }, 50); } catch {} });
    console.info(`[OM30 Ausentes] 401 do Senha Simples: login da tela recarregado (${frames.length} iframe).`);
    return frames.length > 0;
  }

  // Quando der 401: avisa sem cara de erro e refaz sozinho assim que o token mudar.
  function esperarTokenNovo(refazer) {
    if (aguardandoToken) return;
    aguardandoToken = true;

    const antigo = sessionStorage.getItem('senhaSimplesToken');
    const inicio = Date.now();
    const pronto = () => {
      clearInterval(timer);
      aguardandoToken = false;
      aoChegarToken = null;
      definirAviso('');
      refazer();
    };
    aoChegarToken = () => {
      if (erroLoginSenha) {
        definirAviso(`Senha Simples não está logado neste navegador (${erroLoginSenha}). Faça login em senhaguaruja.saudesimples.net e recarregue esta página.`);
      } else pronto();
    };
    definirAviso('Conectando ao Senha Simples… a lista será verificada sozinha.');
    let testando = false, ultimoTeste = Date.now();
    const timer = setInterval(async () => {
      const t = sessionStorage.getItem('senhaSimplesToken');
      if (t && t !== antigo) return pronto();
      // O 401 pode ter sido passageiro: testa se o Senha Simples já responde.
      if (!testando && Date.now() - ultimoTeste >= 5000) {
        testando = true; ultimoTeste = Date.now();
        try { garantirTokenSenha(); await senhaSimplesGetSenhaCategorias(); testando = false; return pronto(); }
        catch { testando = false; }
      }
      if (Date.now() - inicio > 20000 && !erroLoginSenha) {
        definirAviso('O Senha Simples não respondeu o login nesta tela. Abra senhaguaruja.saudesimples.net neste navegador, faça login e recarregue esta página.');
      }
    }, 1500);
  }

  // ---------------------------------------------------------------------------
  // Filas da unidade logada (parametrização + categorias do Senha Simples)
  // ---------------------------------------------------------------------------

  async function lerParametrizacao(tipo) {
    if (typeof saudeSimplesProxy !== 'undefined') {
      return (await saudeSimplesProxy.get(`/filas/parametrizacoes/${tipo}`)).data;
    }
    const r = await fetch(`/filas/parametrizacoes/${tipo}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function comRetentativa(fn, vezes = 2) {
    let ultimo;
    for (let i = 0; i < vezes; i++) {
      try { return await fn(); } catch (e) { ultimo = e; await new Promise(r => setTimeout(r, 600)); }
    }
    throw ultimo;
  }

  const descricaoErro = e => e?.response?.status ? `HTTP ${e.response.status}` : String(e?.message || e);

  // Ordem do fluxo do PA. Na dúvida entre duas filas onde a senha existe,
  // a mais adiantada no fluxo é onde o paciente estava quando foi ausentado.
  function classificarFila(cat, nome, acolhCat, medCat) {
    const n = norm(nome);
    const igual = (a, b) => a != null && b != null && String(a) === String(b);
    if (igual(cat, acolhCat)) return { grupo: 'ACOLHIMENTO', ordem: 1 };
    if (igual(cat, medCat)) return { grupo: 'MEDICO', ordem: 2 };
    if (/EMERGENC|URGENC/.test(n)) return { grupo: 'EMERGENCIA', ordem: 2 };
    if (/ACOLHIMENTO|CLASSIFICACAO DE RISCO|TRIAGEM/.test(n)) return { grupo: 'ACOLHIMENTO', ordem: 1 };
    if (/ATENDIMENTO MEDICO|CLINICO|CONSULTORIO/.test(n)) return { grupo: 'MEDICO', ordem: 2 };
    if (/RECEP/.test(n)) return { grupo: 'RECEPCAO', ordem: 0 };
    // Salas (controle de salas) não ausentam: o paciente volta para a fila médica e é o médico que ausenta.
    if (/MEDICACAO|EXAME|RADIO|RAIO|PROCEDIMENTO|GESSO|IMOBILIZ/.test(n)) return { grupo: 'SALA', ordem: -1 };
    return { grupo: 'OUTROS', ordem: 2 }; // pediatria, emergência e demais filas de atendimento
  }

  const tituloCaso = v => clean(v).toLowerCase()
    .replace(/(^|\s)(\S)/g, (m, e, c) => e + c.toUpperCase())
    .replace(/\s(De|Da|Do|Das|Dos|E)(?=\s)/g, m => m.toLowerCase());

  // "EMERGÊNCIA MATHEUS SANTAMARIA" -> "Emergência"; "MEDICAÇÃO (MATHEUS SANTAMARIA)" -> "Medicação"
  const SETORES = [
    [/EMERGENCIA/, 'Emergência'], [/PEDIATR/, 'Pediatria'], [/MEDICACAO/, 'Medicação'],
    [/EXAME/, 'Exames'], [/RADIOGRAF|RAIO/, 'Raio-X'], [/SUTURA|CURATIVO/, 'Sutura/Curativo'],
    [/PROCEDIMENTO/, 'Procedimento'], [/RECEP/, 'Recepção'], [/ACOLHIMENTO/, 'Acolhimento'],
    [/ATENDIMENTO MEDICO/, 'Fila médica'], [/DENTISTA|ODONTO/, 'Dentista']
  ];
  const nomeCurto = nome => {
    const n = norm(nome);
    const achado = SETORES.find(([rx]) => rx.test(n));
    return achado ? achado[1] : (tituloCaso(String(nome || '').replace(/\(.*?\)/g, '')) || 'Outro setor');
  };
  const guicheCurto = g => {
    if (!g) return '';
    const n = norm(g);
    const achado = SETORES.find(([rx]) => rx.test(n));
    return /\d/.test(g) || !achado ? tituloCaso(g) : achado[1];
  };
  // "BIANCA JENIFFER VIEIRA MARQUES" -> "Bianca Jeniffer"
  const pessoaCurta = nome => {
    if (!nome || nome === 'você') return nome || '';
    const p = tituloCaso(nome).split(' ');
    return p.slice(0, /^(de|da|do|das|dos|e)$/i.test(p[1] || '') ? 3 : 2).join(' ');
  };

  async function filasDaUnidade(forcar = false) {
    const cache = lerJSON(SESSION_LOCAIS, sessionStorage);
    if (!forcar && cache.t && Date.now() - cache.t < CACHE_LOCAIS_MS && cache.filas?.length) return cache;

    const erros = {};
    // Em sequência (não em paralelo): o proxy do Saúde Simples pode descartar chamadas simultâneas.
    const acolhCat = await comRetentativa(() => lerParametrizacao('acolhimento'))
      .then(p => p?.senha_simples_categoria?.id || null).catch(e => { erros.acolhimento = descricaoErro(e); return null; });
    const medCat = await comRetentativa(() => lerParametrizacao('atendimento'))
      .then(p => p?.senha_simples_categoria?.id || null).catch(e => { erros.atendimento = descricaoErro(e); return null; });

    let categorias = [];
    try {
      const { data } = await comRetentativa(() => senhaSimplesGetSenhaCategorias());
      categorias = Array.isArray(data) ? data : (Object.values(data || {}).find(Array.isArray) || []);
    } catch (e) { erros.categorias = descricaoErro(e); }

    const filas = [];
    for (const c of categorias) {
      let locais = c.locais_atendimento;
      if (!locais) {
        try { locais = (await proxySenha().get(`categorias/${c.id}`)).data?.locais_atendimento; } catch {}
      }
      const local = (locais || []).map(l => l.id).find(Boolean);
      if (!local) continue;
      const guiches = (locais || []).filter(l => l.id).map(l => ({ id: l.id, nome: norm(l.nome) }));
      filas.push({ cat: c.id, nome: c.nome, local, guiches, ...classificarFila(c.id, c.nome, acolhCat, medCat) });
    }

    // Se o Senha Simples estiver logado em OUTRA unidade, a lista de categorias não traz as
    // filas desta unidade. Garante pelo menos acolhimento e fila médica buscando direto.
    let unidadeDiferente = false;
    for (const cat of [acolhCat, medCat]) {
      if (!cat || filas.some(f => f.cat === cat)) continue;
      unidadeDiferente = true;
      try {
        const c = (await proxySenha().get(`categorias/${cat}`)).data;
        const locais = (c?.locais_atendimento || []).filter(l => l.id);
        if (locais.length) {
          filas.push({ cat, nome: c.nome, local: locais[0].id,
                       guiches: locais.map(l => ({ id: l.id, nome: norm(l.nome) })),
                       ...classificarFila(cat, c.nome, acolhCat, medCat) });
        }
      } catch (e) { erros.categorias = descricaoErro(e); }
    }

    const r = { acolhCat, medCat, filas, erros, unidadeDiferente, t: Date.now() };
    console.info('[OM30 Ausentes] Filas do Senha Simples:', filas.map(f => `${f.nome} → ${f.grupo}`).join(' | '));
    if (filas.length && acolhCat && medCat) gravar(SESSION_LOCAIS, r, sessionStorage);
    return r;
  }

  // 200 = senha existe (com datas); 422 ja_chamada = existe e já foi chamada; 404 = não existe.
  async function consultarSenha(local, atendimentoId, tipo) {
    let r;
    for (let i = 0; i < 3; i++) {
      r = await consultarSenhaUmaVez(local, atendimentoId, tipo);
      if (!r?.erro || r.auth) return r;
      await new Promise(ok => setTimeout(ok, 700 * (i + 1)));
    }
    return r;
  }

  // No máximo 8 consultas ao Senha Simples ao mesmo tempo.
  const LIMITE_SIMULTANEAS = 8;
  let emVoo = 0;
  const filaEspera = [];
  async function comLimite(fn) {
    if (emVoo >= LIMITE_SIMULTANEAS) await new Promise(ok => filaEspera.push(ok));
    emVoo++;
    try { return await fn(); } finally { emVoo--; filaEspera.shift()?.(); }
  }

  function consultarSenhaUmaVez(local, atendimentoId, tipo) {
    return comLimite(() => consultarSenhaUmaVezSemLimite(local, atendimentoId, tipo));
  }

  async function consultarSenhaUmaVezSemLimite(local, atendimentoId, tipo) {
    try {
      const { data: s } = await fnRecuperar()({
        localAtendimentoAtualId: local,
        params: { atendimento_id: atendimentoId, atendimento_type: tipo }
      });
      return {
        existe: true, senha: s.senha, created_at: s.created_at, chamado_em: s.chamado_em, confirmado_em: s.confirmado_em,
        chamadoPor: (s.chamado_em || s.confirmado_em) ? clean(s.usuario?.nome) || null : null,
        guiche: (s.chamado_em || s.confirmado_em) ? clean(s.local_atendimento?.nome) || null : null
      };
    } catch (e) {
      const st = e?.response?.status;
      if (st === 404) return null;
      if (st === 422 && e.response?.data?.ja_chamada) {
        // "Senha já se encontra em atendimento por FULANO no guichê X"
        const m = String(e.response.data.error || '').match(/por\s+(.+?)\s+no\s+guich[eê]\s+(.+)$/i);
        const quem = m ? clean(m[1]) : null;
        return {
          existe: true, chamada: true,
          // "seu usuário" é texto genérico do Senha Simples, não quer dizer que foi este login.
          chamadoPor: quem && /seu usu[aá]rio/i.test(quem) ? null : quem,
          guiche: m ? clean(m[2]) : null
        };
      }
      return { erro: st || 'falha', auth: st === 401 };
    }
  }

  // Guarda de origens: apaga as vencidas uma vez por carga.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(`${PREFIX}:origem-`)) continue;
      const v = lerJSON(k);
      if (!k.startsWith(SESSION_CACHE) || !v.t || Date.now() - v.t > CACHE_ORIGEM_MS) localStorage.removeItem(k);
    }
  } catch {}

  const usada = a => !!(a.chamada || a.chamado_em || a.confirmado_em);

  // Consulta por etapas, parando assim que der para decidir:
  //   1) fila médica / emergência / outras de atendimento  -> se a senha foi usada lá, é de lá
  //   2) acolhimento                                       -> se foi usada lá, é do acolhimento
  //   3) recepção e salas (só se ainda não decidiu)
  // completo=true consulta todas (para o histórico nos detalhes).
  async function origemDoAusente(atendimentoId, tipo, unidade, { completo = false } = {}) {
    const chave = SESSION_CACHE + tipo + '#' + atendimentoId;
    const cache = lerJSON(chave);
    if (!completo && cache.t && Date.now() - cache.t < CACHE_ORIGEM_MS) return cache;

    const achados = [];
    const errosHttp = [];
    // Outras filas de atendimento (pediatria etc.) vêm antes do acolhimento: quem foi do
    // acolhimento para lá e foi ausentado lá não pode ser tratado como ausente do acolhimento.
    const etapas = [
      unidade.filas.filter(f => f.grupo === 'MEDICO' || f.grupo === 'EMERGENCIA'),
      unidade.filas.filter(f => f.grupo === 'OUTROS'),
      unidade.filas.filter(f => f.grupo === 'ACOLHIMENTO'),
      unidade.filas.filter(f => f.grupo === 'RECEPCAO' || f.grupo === 'SALA')
    ];
    const decidido = () => achados.some(a => a.grupo !== 'SALA' && a.grupo !== 'RECEPCAO' && usada(a));
    let parcial = false;
    for (let e = 0; e < etapas.length; e++) {
      if (!completo && decidido()) { parcial = true; break; }
      await consultarFilas(etapas[e]);
    }
    // Decidiu sem número (senha com outro profissional): tenta pegar o número no acolhimento.
    // Se ainda não tiver o número, tenta nas filas que faltaram (acolhimento primeiro).
    if (parcial && !achados.some(a => a.senha)) {
      const naoConsultada = f => !achados.some(a => a.cat === f.cat);
      const acolh = etapas[2].filter(naoConsultada);
      if (acolh.length) await consultarFilas(acolh);
    }

    // As filas de uma etapa são consultadas ao mesmo tempo (o limite geral segura o excesso).
    async function consultarFilas(filas) {
    await Promise.all(filas.map(async f => {
      let r = await consultarSenha(f.local, atendimentoId, tipo);
      // 422 diz em qual guichê a senha está; consultando por esse guichê, às vezes vem completa.
      if (r?.chamada && r.guiche) {
        const g = (f.guiches || []).find(x => x.nome === norm(r.guiche));
        if (g && g.id !== f.local) {
          const r2 = await consultarSenha(g.id, atendimentoId, tipo);
          if (r2?.existe && !r2.chamada) {
            r = { ...r2, chamadoPor: r2.chamadoPor || r.chamadoPor,
                  guiche: r2.guiche || r.guiche, jaChamadaEm: r.guiche };
          }
        }
      }
      if (!r) return;
      if (r.erro) { errosHttp.push(r.erro); return; }
      achados.push({ ...f, ...r });
    }));
    }

    // Senha parada (nunca chamada nem concluída) é fila que ele ainda não usou;
    // só vale se não houver outra. Recepção só vale se não houver mais nada.
    // Salas não ausentam: se a senha passou por uma sala, o paciente voltou para a fila médica.
    // Senha de sala parada (nunca chamada nem concluída) não conta como passagem pela sala.
    const passouPorSala = achados.some(a => a.grupo === 'SALA' && (a.chamada || a.chamado_em || a.confirmado_em));
    const filasQueAusentam = achados.filter(a => a.grupo !== 'SALA');
    const usadas = filasQueAusentam.filter(a => !(a.created_at && !a.chamado_em && !a.confirmado_em));
    let candidatas = usadas.length ? usadas : filasQueAusentam;
    const semRecepcao = candidatas.filter(a => a.grupo !== 'RECEPCAO');
    if (semRecepcao.length) candidatas = semRecepcao;

    candidatas.sort((a, b) =>
      (b.ordem - a.ordem) || ((Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)));
    const escolhida = candidatas[0];

    const senha = achados.find(a => a.senha)?.senha || null;
    const historico = [...achados]
      .sort((a, b) => (a.ordem - b.ordem) || ((Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0)))
      .map(a => ({
        fila: nomeCurto(a.nome), grupo: a.grupo, senha: a.senha || null,
        gerada: a.created_at || null, chamada: a.chamado_em || null, concluida: a.confirmado_em || null,
        jaChamada: !!a.chamada, por: a.chamadoPor || null, guiche: a.guiche || null
      }));
    let r;
    if (passouPorSala && !['OUTROS', 'EMERGENCIA'].includes(escolhida?.grupo)) {
      // Voltou da sala para a fila médica: foi lá que o médico ausentou.
      const med = achados.find(a => a.grupo === 'MEDICO');
      r = { origem: 'MEDICO', setor: null, senha, cat: unidade.medCat,
            chamadoPor: med?.chamadoPor || null, guiche: med?.guiche || null,
            acao: (med?.chamada || med?.chamado_em) ? 'Chamado' : 'Concluída' };
    } else if (!escolhida) r = { origem: errosHttp.length ? 'ERRO' : 'SEM_SENHA', setor: null, senha: null, cat: null,
             erroHttp: [...new Set(errosHttp)].join(', ') };
    else r = {
      origem: escolhida.grupo === 'RECEPCAO' ? 'OUTROS' : escolhida.grupo,
      setor: nomeCurto(escolhida.nome),
      senha,
      cat: escolhida.cat,
      chamadoPor: escolhida.chamadoPor || null,
      guiche: escolhida.guiche || null,
      acao: (escolhida.chamada || escolhida.chamado_em) ? 'Chamado' : 'Concluída'
    };
    // Senha EM é da emergência.
    if (r.origem === 'MEDICO' && /^EM/i.test(r.senha || '')) {
      const em = achados.find(a => a.grupo === 'EMERGENCIA');
      r.origem = 'EMERGENCIA';
      r.setor = 'Emergência';
      if (em) r.cat = em.cat;
    }
    r.historico = historico;
    r.parcial = parcial;
    r.t = Date.now();
    // Só guarda resultado confirmado; "não encontrada" e erro são consultados de novo na próxima vez.
    if (r.origem !== 'ERRO' && r.origem !== 'SEM_SENHA') gravar(chave, r);
    return r;
  }

  // ---------------------------------------------------------------------------
  // Origem rápida: o grupo vem do profissional; o Senha Simples só completa senha/quem chamou.
  // ---------------------------------------------------------------------------
  // Consulta uma fila; se a senha estiver com alguém ("em atendimento por X no guichê Y"),
  // consulta de novo pelo guichê Y, que costuma devolver a senha completa.
  async function consultarComGuiche(f, atendimentoId, tipo) {
    let r = await consultarSenha(f.local, atendimentoId, tipo);
    if (r?.chamada && r.guiche) {
      const g = (f.guiches || []).find(x => x.nome === norm(r.guiche));
      if (g && g.id !== f.local) {
        const r2 = await consultarSenha(g.id, atendimentoId, tipo);
        if (r2?.existe && !r2.chamada) {
          r = { ...r2, chamadoPor: r2.chamadoPor || r.chamadoPor, guiche: r2.guiche || r.guiche, jaChamadaEm: r.guiche };
        }
      }
    }
    return r;
  }

  async function origemRapida(atendimentoId, tipo, unidade, grupo, prof, comSenhaSimples) {
    const chave = SESSION_CACHE + tipo + '#' + atendimentoId;
    const cache = lerJSON(chave);
    if (cache.t && cache.base === grupo && Date.now() - cache.t < CACHE_ORIGEM_MS) return cache;

    const achados = [];
    const errosHttp = [];
    if (comSenhaSimples) {
      const filas = unidade.filas.filter(f => grupo === 'MEDICO'
        ? (f.grupo === 'MEDICO' || f.grupo === 'EMERGENCIA') : f.grupo === 'ACOLHIMENTO');
      await Promise.all(filas.map(async f => {
        const x = await consultarComGuiche(f, atendimentoId, tipo);
        if (!x) return;
        if (x.erro) { errosHttp.push(x.erro); return; }
        achados.push({ ...f, ...x });
      }));
    }
    // Sem número na fila médica (senha com o profissional): a mesma senha passou pelo
    // acolhimento e lá já está concluída, então o Senha Simples mostra o número.
    // Ainda sem número: procura a mesma senha nas outras filas (acolhimento, salas de
    // medicação/exames, recepção...). Onde ela já foi concluída, o Senha Simples mostra o número.
    let numeroExtra = null;
    if (comSenhaSimples && !achados.some(a => a.senha)) {
      const jaVistas = new Set(achados.map(a => a.cat));
      const resto = unidade.filas.filter(f => !jaVistas.has(f.cat) &&
        !(grupo === 'MEDICO' ? (f.grupo === 'MEDICO' || f.grupo === 'EMERGENCIA') : f.grupo === 'ACOLHIMENTO'));
      resto.sort((a, b) => (a.grupo === 'ACOLHIMENTO' ? 0 : a.grupo === 'SALA' ? 1 : 2) - (b.grupo === 'ACOLHIMENTO' ? 0 : b.grupo === 'SALA' ? 1 : 2));
      const res = await Promise.all(resto.map(f => consultarComGuiche(f, atendimentoId, tipo).catch(() => null)));
      numeroExtra = res.find(x => x?.senha)?.senha || null;
    }
    achados.sort((a, b) => Number(usada(b)) - Number(usada(a)) || ((Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)));
    const ach = achados[0];
    const senha = achados.find(a => a.senha)?.senha || numeroExtra || null;
    let origem = grupo;
    if (grupo === 'MEDICO' && (/^EM/i.test(senha || '') || (ach && ach.grupo === 'EMERGENCIA'))) origem = 'EMERGENCIA';
    const r = {
      origem, base: grupo,
      setor: origem === 'EMERGENCIA' ? 'Emergência' : (ach ? nomeCurto(ach.nome) : null),
      senha,
      cat: ach?.cat || (grupo === 'ACOLHIMENTO' ? unidade.acolhCat : unidade.medCat) || null,
      chamadoPor: ach?.chamadoPor || (grupo === 'MEDICO' ? prof : null) || null,
      guiche: ach?.guiche || null,
      acao: ach ? ((ach.chamada || ach.chamado_em) ? 'Chamado' : 'Concluída') : (prof ? 'Profissional' : 'Chamado'),
      historico: achados.map(a => ({
        fila: nomeCurto(a.nome), grupo: a.grupo, senha: a.senha || null,
        gerada: a.created_at || null, chamada: a.chamado_em || null, concluida: a.confirmado_em || null,
        jaChamada: !!a.chamada, por: a.chamadoPor || null, guiche: a.guiche || null
      })),
      parcial: true,
      erroHttp: [...new Set(errosHttp)].join(', '),
      motivoSemNumero: senha ? '' : !comSenhaSimples ? 'Senha Simples não consultado (conectando)'
        : errosHttp.length ? `Senha Simples deu erro ${[...new Set(errosHttp)].join(', ')}`
          : achados.length ? `Senha Simples não mostra o número (com ${achados.find(a => a.chamadoPor)?.chamadoPor || 'outro profissional'})`
            : 'Senha Simples não achou a senha nas filas',
      t: Date.now()
    };
    if (comSenhaSimples && !errosHttp.length) gravar(chave, r);
    return r;
  }

  // ---------------------------------------------------------------------------
  // Senha pela ficha do atendimento (PDF "SENHA: PF0087 11/10/2026 15:17:30")
  // ---------------------------------------------------------------------------

  const CHAVE_FICHA = `${PREFIX}:ficha-v4:`;
  const FICHA_MS = 12 * 60 * 60 * 1000;

  // Junta o texto das strings do PDF: (texto) Tj, [(te) -20 (xto)] TJ.
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

  // Descompacta aproveitando o que der, mesmo com lixo no fim do stream.
  async function inflar(bytes) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const dec = new TextDecoder('latin1');
    let out = '';
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; out += dec.decode(value, { stream: true }); }
    } catch {}
    return out;
  }

  function ascii85(bytes) {
    const txt = new TextDecoder('latin1').decode(bytes).replace(/\s/g, '').replace(/^<~/, '').replace(/~>.*$/, '');
    const out = [];
    let grupo = [];
    for (const ch of txt) {
      if (ch === 'z' && !grupo.length) { out.push(0, 0, 0, 0); continue; }
      grupo.push(ch.charCodeAt(0) - 33);
      if (grupo.length === 5) {
        let v = 0; for (const d of grupo) v = v * 85 + d;
        out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
        grupo = [];
      }
    }
    if (grupo.length) {
      const n = grupo.length;
      while (grupo.length < 5) grupo.push(84);
      let v = 0; for (const d of grupo) v = v * 85 + d;
      out.push(...[(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].slice(0, n - 1));
    }
    return new Uint8Array(out);
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
      // Dicionário do PRÓPRIO objeto (do "N 0 obj" até "stream"), não os 300 caracteres anteriores,
      // que podiam pegar o "/Subtype/Image" da imagem de antes e pular o conteúdo da página.
      const objIni = bin.lastIndexOf('obj', i);
      const dic = bin.slice(objIni >= 0 && i - objIni < 4000 ? objIni : Math.max(0, i - 300), i);
      if (!/\/Subtype\s*\/Image|\/FontFile/.test(dic)) {
        let c = '';
        try {
          let bytes = buf.slice(ini, fim);
          if (/ASCII85Decode/.test(dic)) bytes = ascii85(bytes);
          c = /FlateDecode/.test(dic) ? await inflar(bytes) : new TextDecoder('latin1').decode(bytes);
        } catch {}
        if (c) textos.push(textoDoConteudoPdf(c), c);
      }
      i = fim + 9; n++;
    }
    return textos.join('\n');
  }

  let ultimoTextoFicha = '';
  let fichaLogada = 0;
  async function senhaPelaFicha(id, tipo) {
    if (tipo !== 'AtendimentoPa') return null;
    const cache = lerJSON(CHAVE_FICHA + id);
    if (cache.t && Date.now() - cache.t < FICHA_MS) return cache.senha || null;
    const texto = await lerTextoPdf(`/atendimentos_pas/${id}.pdf`);
    ultimoTextoFicha = texto;
    const m = texto.match(/SENHA\s*:?\s*([A-Z]{2}\s?\d{3,4})\b/);
    let senha = m ? m[1].replace(/\s/g, '').toUpperCase() : null;
    if (!senha) {
      // Jasper desenha rótulo e valor separados: vale o único código tipo AA0000 da ficha.
      const codigos = [...new Set(texto.match(/\b[A-Z]{2}\d{4}\b/g) || [])];
      if (codigos.length === 1) senha = codigos[0];
    }
    // Sem senha: guarda só 10 min, para tentar de novo.
    gravar(CHAVE_FICHA + id, { senha, t: senha ? Date.now() : Date.now() - FICHA_MS + 10 * 60 * 1000 });
    return senha;
  }

  window.OM30AusentesDebug = async id => {
    const u = unidadeAtual || await filasDaUnidade(true);
    const out = { aguardandoToken, acolhCat: u.acolhCat, medCat: u.medCat, erros: u.erros, prof: mapaProf.get(String(id)) || null, filas: [] };
    for (const f of u.filas || []) {
      const r = await consultarSenhaUmaVezSemLimite(f.local, String(id), 'AtendimentoPa');
      out.filas.push({ fila: f.nome, grupo: f.grupo, resposta: r ? (r.erro ? `erro ${r.erro}` : (r.senha || (r.chamada ? `com ${r.chamadoPor || '?'}` : 'existe sem nº'))) : 'não existe' });
    }
    console.log(JSON.stringify(out, null, 2));
  };

  window.OM30AusentesFicha = async id => {
    const t = await lerTextoPdf(`/atendimentos_pas/${id}.pdf`);
    const i = t.search(/SENHA/i);
    console.log(JSON.stringify({ tamanho: t.length, codigos: [...new Set(t.match(/\b[A-Z]{2}\d{4}\b/g) || [])],
                  trecho: i >= 0 ? t.slice(Math.max(0, i - 120), i + 200) : t.slice(0, 600) }, null, 2));
  };

  // Fila de leitura das fichas (3 por vez), só para quem ficou sem número.
  const filaFicha = [];
  let fichasLendo = 0;
  function pedirSenhaFicha(tr) {
    const inf = infoLinha(tr);
    if (!inf?.id || tr.dataset.om30FichaPedida === inf.id) return;
    tr.dataset.om30FichaPedida = inf.id;
    filaFicha.push(tr);
    rodarFilaFicha();
  }
  function rodarFilaFicha() {
    while (fichasLendo < 3 && filaFicha.length) {
      const tr = filaFicha.shift();
      fichasLendo++;
      (async () => {
        try {
          const inf = infoLinha(tr);
          const senha = await senhaPelaFicha(inf.id, inf.tipo);
          const r = detalhes.get(inf.id);
          if (!senha) {
            tr.dataset.om30FichaFalhou = '1';
            const t = ultimoTextoFicha || '';
            tr.dataset.om30FichaMotivo = inf.tipo !== 'AtendimentoPa' ? `Ficha: tipo ${inf.tipo} sem ficha PA.`
              : t.length < 20 ? 'Ficha: não consegui ler o texto do PDF.' : 'Ficha: lida, mas não achei o código da senha.';
            if (fichaLogada < 3 && inf.tipo === 'AtendimentoPa') {
              fichaLogada++;
              const i = t.search(/SENHA/i);
              console.info('[OM30 Ausentes] ficha sem senha', inf.id, JSON.stringify(i >= 0 ? t.slice(Math.max(0, i - 150), i + 250) : t.slice(0, 600)));
            }
            const b = tr.querySelector('.om30a-senha-btn.sem-numero');
            if (b) b.textContent = '—';
          }
          if (senha && r && !r.senha && tr.isConnected) {
            r.senha = senha;
            r.senhaDaFicha = true;
            marcarLinha(tr, r);
            aplicarFiltros();
          }
        } catch (e) {
          console.warn('[OM30 Ausentes] ficha:', e);
          tr.dataset.om30FichaFalhou = '1';
          tr.dataset.om30FichaMotivo = `Ficha: não abriu (${e?.message || e}).`;
          const b = tr.querySelector('.om30a-senha-btn.sem-numero');
          if (b) b.textContent = '—';
        } finally {
          fichasLendo--;
          rodarFilaFicha();
          verificarConclusao();
        }
      })();
    }
  }

  // ---------------------------------------------------------------------------
  // Senha presa em outro profissional
  //   Ao clicar em Chamar, se o Senha Simples responder 422 ja_chamada,
  //   NÃO altera a senha automaticamente. Apenas orienta o profissional a abrir
  //   a engrenagem (*) e usar "Desvincular senha de outro profissional".
  // ---------------------------------------------------------------------------

  async function desvincularSenha(s, localPadrao) {
    const local = s.local_atendimento?.id || localPadrao;
    if (!s?.id || !s?.tipo_atendimento?.id || !local) throw new Error('senha sem id/tipo/guichê');
    return (await senhaSimplesPutFilas(`${local}/${s.tipo_atendimento.id}/${s.id}/desvincular`)).data;
  }

  async function instalarLiberacaoSenhaPresa() {
    try { await esperar(() => typeof senhaSimplesChamarSenhaAtendimento === 'function'); } catch { return; }
    const original = window.senhaSimplesChamarSenhaAtendimento;
    if (!original || original.__om30Liberacao) return;

    const embrulho = async function (args) {
      try {
        return await original(args);
      } catch (e) {
        const dados = e?.response?.data || {};
        if (!(e?.response?.status === 422 && dados.ja_chamada)) throw e;

        const m = String(dados.error || '').match(/por\s+(.+?)\s+no\s+guich[eê]\s+(.+)$/i) || [];
        const profissional = m[1] && !/seu usu[aá]rio/i.test(m[1]) ? pessoaCurta(m[1]) : '';
        const guiche = m[2] ? guicheCurto(clean(m[2])) : '';
        const onde = [profissional, guiche].filter(Boolean).join(' · ');

        toast({
          tipo: 'aviso',
          titulo: 'Senha vinculada a outro profissional',
          texto: [
            onde
              ? `Esta senha está vinculada a ${onde}.`
              : 'O Senha Simples informou que esta senha já está vinculada a outro profissional/guichê.',
            'Nenhuma alteração foi feita.',
            'Para liberar a senha, abra a engrenagem (*) desta linha e escolha "Desvincular senha de outro profissional".'
          ].join(' ')
        });

        // Mantém a chamada como FALHA. Não retorna a senha, não desvincula e não chama novamente.
        throw e;
      }
    };
    embrulho.__om30Liberacao = true;
    window.senhaSimplesChamarSenhaAtendimento = embrulho;
  }

  instalarLiberacaoSenhaPresa();

  // ---------------------------------------------------------------------------
  // Menu (*) da fila principal do acolhimento — desvincular senha manualmente
  // ---------------------------------------------------------------------------

  const OM30_DESVINCULAR_MENU_CLASS = 'om30-desvincular-outro-profissional';
  let observerMenuDesvincular = null;

  function localAtualAcolhimentoId() {
    const listVm = acolhEstavelListVm || acharListagemPrincipalAcolhimento?.();
    const direto = clean(listVm?.localAtendimentoId);
    if (direto) return direto;

    try {
      const tipo = clean(listVm?.tipoParametrizacao || 'acolhimento');
      const local = listVm?.$store?.getters?.localAtendimentoAtual?.[tipo] ||
                    listVm?.$store?.getters?.localAtendimentoAtual?.acolhimento ||
                    null;
      return clean(local?.id);
    } catch {
      return '';
    }
  }

  function itensVisiveisFilaAcolhimento() {
    const collection = acolhEstavelCollectionVm || collectionPrincipalAcolhimento?.();
    if (Array.isArray(collection?.items)) return collection.items;
    if (Array.isArray(collection?.$data?.items)) return collection.$data.items;
    return [];
  }

  function itemFilaAcolhimentoDaLinha(tr) {
    if (!tr) return null;
    const itens = itensVisiveisFilaAcolhimento();
    if (!itens.length) return null;

    // A tabela nativa do acolhimento: Data | CNS | Nome | Mãe | Nascimento | Idade | Senha | Ações
    const senha = clean(tr.cells?.[6]?.innerText || tr.cells?.[6]?.textContent);
    const cns = clean(tr.cells?.[1]?.innerText || tr.cells?.[1]?.textContent);
    const nome = clean(tr.cells?.[2]?.innerText || tr.cells?.[2]?.textContent);

    if (senha && senha !== '—') {
      const achou = itens.find(item => norm(item?.senha) === norm(senha));
      if (achou) return achou;
    }

    if (cns && cns !== '—') {
      const porCns = itens.filter(item => clean(item?.codigo_cns) === cns);
      if (porCns.length === 1) return porCns[0];
      if (porCns.length > 1 && nome) {
        const achou = porCns.find(item => norm(item?.nome_municipe) === norm(nome));
        if (achou) return achou;
      }
    }

    if (nome) {
      const porNome = itens.filter(item => norm(item?.nome_municipe) === norm(nome));
      if (porNome.length === 1) return porNome[0];
    }

    return null;
  }

  function atendimentoFilaAcolhimento(item) {
    if (!item || typeof item !== 'object') return null;

    let id =
      item.atendimento_id ??
      item.saude_atendimento_id ??
      item.atendimento?.id ??
      item.saude_atendimento?.id ??
      null;

    let tipo = clean(
      item.atendimento_type ??
      item.saude_atendimento_type ??
      item.atendimento?.type ??
      item.atendimento?.tipo ??
      item.saude_atendimento?.type ??
      ''
    );

    const str = clean(item.atendimento_str || item.saude_atendimento_str || '');
    const m = str.match(/^([^#]+)#(\d+)$/);
    if (m) {
      if (id == null) id = m[2];
      if (!tipo) tipo = m[1];
    }

    if (id == null || !tipo) return null;
    return { id: String(id), tipo };
  }

  async function retornarEDesvincularSenhaAcolhimento(atendimentoId, atendimentoType, localPadrao = '') {
    const param = await lerParametrizacao('acolhimento');
    const cat = param?.senha_simples_categoria?.id;
    if (!cat) throw new Error('categoria do acolhimento não encontrada');

    const { data: senha } = await senhaSimplesPutFilas(cat + '/retornar_para_atendimento', {
      atendimento_id: Number(atendimentoId),
      atendimento_type: atendimentoType,
      categoria_id: cat
    });

    if (!senha?.id) throw new Error('Senha Simples não devolveu a senha do atendimento');
    const liberada = await desvincularSenha(senha, localPadrao || null);
    return liberada || senha;
  }

  async function acaoDesvincularOutroProfissional(tr) {
    if (!ehTelaPrincipalAcolhimento?.()) return;

    if (aguardandoToken || !senhaSimplesPronto()) {
      toast({
        tipo: 'aviso',
        titulo: 'Aguarde o Senha Simples',
        texto: 'Ainda não foi possível consultar a senha. Tente novamente em alguns segundos.'
      });
      return;
    }

    const item = itemFilaAcolhimentoDaLinha(tr);
    const atendimento = atendimentoFilaAcolhimento(item);
    const nome = clean(item?.nome_municipe || tr?.cells?.[2]?.innerText || 'Paciente');
    const senhaVisual = clean(item?.senha || tr?.cells?.[6]?.innerText || '');

    if (!atendimento) {
      await dialogo({
        tipo: 'erro',
        titulo: 'Não consegui identificar o atendimento',
        subtitulo: nome,
        texto: ['Nada foi alterado.', 'Atualize a fila e tente novamente.'],
        botoes: [{ rotulo: 'Fechar', valor: true, primario: true }]
      });
      return;
    }

    const localAtual = localAtualAcolhimentoId();
    if (!localAtual) {
      toast({
        tipo: 'aviso',
        titulo: 'Guichê não identificado',
        texto: 'Selecione novamente o guichê do acolhimento e tente de novo.'
      });
      return;
    }

    let estado;
    try {
      estado = await consultarSenha(localAtual, atendimento.id, atendimento.tipo);
    } catch (e) {
      estado = { erro: descricaoErro(e) };
    }

    if (estado?.auth || estado?.erro) {
      await dialogo({
        tipo: 'erro',
        titulo: 'Não foi possível conferir a senha',
        subtitulo: nome,
        texto: ['Nada foi alterado.', 'Detalhe: ' + (estado?.erro || 'falha no Senha Simples')],
        botoes: [{ rotulo: 'Fechar', valor: true, primario: true }]
      });
      return;
    }

    // 422 ja_chamada é a confirmação de que ela está vinculada a outro atendimento/guichê.
    if (!estado?.chamada) {
      await dialogo({
        tipo: 'info',
        titulo: 'Senha não está presa em outro profissional',
        subtitulo: nome,
        senha: estado?.senha || senhaVisual || '',
        senhaRotulo: 'Senha',
        texto: ['Nenhuma alteração foi feita. A senha está disponível neste fluxo ou já pertence a este guichê.'],
        botoes: [{ rotulo: 'Fechar', valor: true, primario: true }]
      });
      return;
    }

    const de = estado.chamadoPor ? pessoaCurta(estado.chamadoPor) : '';
    const guiche = estado.guiche ? guicheCurto(estado.guiche) : '';
    const onde = [de, guiche].filter(Boolean).join(' · ');

    const confirmar = await dialogo({
      tipo: 'pergunta',
      titulo: 'Desvincular senha de outro profissional?',
      subtitulo: nome,
      senha: senhaVisual || '',
      senhaRotulo: 'Senha atual',
      texto: [
        onde ? 'A senha está vinculada a ' + onde + '.' : 'O Senha Simples confirmou que esta senha está vinculada a outro profissional/guichê.',
        'Ela será liberada e continuará com o mesmo número. Nenhum atendimento será iniciado automaticamente.'
      ],
      botoes: [
        { rotulo: 'Cancelar', valor: false },
        { rotulo: 'Desvincular senha', valor: true, primario: true }
      ]
    });
    if (!confirmar) return;

    try {
      const liberada = await retornarEDesvincularSenhaAcolhimento(atendimento.id, atendimento.tipo, localAtual);
      await dialogo({
        tipo: 'sucesso',
        titulo: 'Senha desvinculada',
        subtitulo: nome,
        senha: liberada?.senha || senhaVisual || '',
        senhaRotulo: 'Mesma senha do munícipe',
        texto: ['A senha foi liberada do outro profissional/guichê e já pode ser chamada novamente.'],
        botoes: [{ rotulo: 'Fechar', valor: true, primario: true }]
      });
      atualizarFilaAcolhimentoSilenciosa?.({ forcar:true }).catch(() => {});
    } catch (e) {
      await dialogo({
        tipo: 'erro',
        titulo: 'Não foi possível desvincular a senha',
        subtitulo: nome,
        texto: ['Nada mais será feito automaticamente.', 'Detalhe: ' + descricaoErro(e)],
        botoes: [{ rotulo: 'Fechar', valor: true, primario: true }]
      });
    }
  }

  function encontrarMenuAcoesLinhaAcolhimento(tr) {
    if (!tr?.cells?.length) return null;
    const acao = tr.cells[tr.cells.length - 1];

    return acao.querySelector(
      '.dropdown-menu, [role="menu"], .dropdown-menu-right'
    ) || null;
  }

  function instalarOpcaoDesvincularLinha(tr) {
    if (!ehTelaPrincipalAcolhimento?.() || !tr || tr.dataset.om30DesvincularMenu === '1') return false;
    const menu = encontrarMenuAcoesLinhaAcolhimento(tr);
    if (!menu) return false;

    if (menu.querySelector('.' + OM30_DESVINCULAR_MENU_CLASS)) {
      tr.dataset.om30DesvincularMenu = '1';
      return true;
    }

    const item = document.createElement('a');
    item.href = 'javascript:void(0)';
    item.className = 'dropdown-item ' + OM30_DESVINCULAR_MENU_CLASS;
    item.setAttribute('role', 'menuitem');
    item.textContent = 'Desvincular senha de outro profissional';
    item.title = 'Libera a mesma senha caso esteja presa em outro profissional/guichê';

    item.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      acaoDesvincularOutroProfissional(tr).catch(e => {
        console.warn('[OM30] Desvincular senha manual:', e);
      });
    });

    // Se o menu tiver separadores nativos, mantém a opção no fim como ação administrativa.
    const divider = document.createElement('div');
    divider.className = 'dropdown-divider om30-desvincular-divider';
    menu.appendChild(divider);
    menu.appendChild(item);

    tr.dataset.om30DesvincularMenu = '1';
    return true;
  }

  function instalarMenusDesvincularAcolhimento() {
    if (!ehTelaPrincipalAcolhimento?.()) return;

    const aplicar = () => {
      const collection = acolhEstavelCollectionVm || collectionPrincipalAcolhimento?.();
      const raiz = collection?.$el || document;
      const linhas = raiz.querySelectorAll('tbody tr.collection-row, tbody tr');
      linhas.forEach(instalarOpcaoDesvincularLinha);
    };

    aplicar();

    if (observerMenuDesvincular) return;
    let debounce = null;
    observerMenuDesvincular = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(aplicar, 80);
    });
    observerMenuDesvincular.observe(document.body, { childList:true, subtree:true });
  }

  // ---------------------------------------------------------------------------
  // Tabela nativa de ausentes
  // ---------------------------------------------------------------------------

  function acharTabelaAusentes(raiz = document) {
    return [...raiz.querySelectorAll('table')].find(t => {
      if (t.querySelector(SEL_REMOVER)) return true;
      const ths = [...t.querySelectorAll('th')].map(th => norm(th.textContent));
      return ths.includes('DATA DO ATENDIMENTO') && ths.includes('TELEFONE');
    });
  }

  function infoLinha(tr) {
    const a = tr.querySelector(SEL_REMOVER);
    if (!a) return null;
    const u = new URL(a.href, location.origin);
    return {
      id: u.pathname.match(/(\d+)$/)?.[1],
      tipo: u.searchParams.get('type') || 'AtendimentoPa'
    };
  }

  function linhaEhDeHoje(tr) {
    const m = (tr.cells[0]?.textContent || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return true;
    const d = new Date();
    return +m[1] === d.getDate() && +m[2] === d.getMonth() + 1 && +m[3] === d.getFullYear();
  }

  // ---------------------------------------------------------------------------
  // Lista completa (sem paginação)
  //   Lê a página 1, 2, 3... da própria lista de ausentes até não vir ninguém novo,
  //   junta tudo na tabela da tela e esconde a paginação nativa.
  // ---------------------------------------------------------------------------

  const MAX_PAGINAS = 50;
  const SEL_PAGINACAO = '.pagination, ul.pagination, nav.pagination, .pagy-nav, .pagy, [class*="paginat"]';
  let fonteLista = null;      // { url: URL, param: 'page' }
  let sincronizando = null;

  // Paginação que pertence à tabela de ausentes (sobe até a aba, sem invadir outras abas).
  function paginacaoDa(tabela) {
    let el = tabela;
    for (let i = 0; i < 10 && el?.parentElement; i++) {
      el = el.parentElement;
      const pags = [...el.querySelectorAll(SEL_PAGINACAO)]
        .filter(p => !p.contains(tabela) && !p.closest('table'))
        .filter(p => !(p.parentElement && p.parentElement.closest(SEL_PAGINACAO)));
      if (pags.length) {
        const nativa = pags.find(p => p.id === 'paginacaoAusentes');
        return nativa ? [nativa] : pags;
      }
      if (el.matches('.tab-pane, [role="tabpanel"], body')) break;
    }
    return [];
  }

  function fonteDaPaginacao(pags, base) {
    for (const p of pags) {
      for (const a of p.querySelectorAll('a[href]')) {
        const h = a.getAttribute('href') || '';
        if (!h || h.startsWith('#') || /^javascript:/i.test(h)) continue;
        let u;
        try { u = new URL(h, base); } catch { continue; }
        for (const [k, v] of u.searchParams) {
          if (/page/i.test(k) && !/per_?page/i.test(k) && /^\d+$/.test(v)) return { url: u, param: k };
        }
      }
    }
    return null;
  }

  function urlDaPagina(fonte, n) {
    const u = new URL(fonte.url.href);
    u.searchParams.set(fonte.param, String(n));
    u.hash = '';
    return u.href;
  }

  async function lerPaginaLista(url) {
    const r = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'text/html,application/xhtml+xml' }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const t = acharTabelaAusentes(doc);
    return { doc, t, linhas: t ? [...(t.tBodies[0]?.rows || [])].filter(tr => infoLinha(tr)?.id) : [] };
  }

  // Candidatas a "endereço da lista", na ordem: link da paginação, a carga da aba
  // (se a aba vier por ajax) e a própria URL da tela.
  function candidatasFonte(tabela) {
    const lista = [];
    const nativa = document.getElementById('paginacaoAusentes');
    const daNativa = nativa && fonteDaPaginacao([nativa], location.href);
    if (daNativa) lista.push(daNativa);
    const daPag = fonteDaPaginacao(paginacaoDa(tabela), location.href);
    if (daPag) lista.push(daPag);
    try {
      for (const e of performance.getEntriesByType('resource')) {
        if (!/ausent/i.test(e.name) || /\/ausentes\/\d+|paciente_ausente|reverter_situacao/i.test(e.name)) continue;
        if (!['xmlhttprequest', 'fetch'].includes(e.initiatorType)) continue;
        const u = new URL(e.name);
        const k = [...u.searchParams.keys()].find(x => /page/i.test(x) && !/per_?page/i.test(x)) || 'page';
        lista.push({ url: u, param: k });
      }
    } catch {}
    lista.push({ url: new URL(location.href), param: 'page' });
    return lista;
  }

  // Maior número de página que aparece nos links da paginação.
  function ultimaPagina(raiz, param) {
    let max = 0;
    for (const a of raiz.querySelectorAll(`a[href*="${param}="]`)) {
      try {
        const v = +new URL(a.getAttribute('href'), location.origin).searchParams.get(param);
        if (v > max) max = v;
      } catch {}
    }
    return max;
  }

  function idNum(tr) { return +(infoLinha(tr)?.id || 0); }

  function esconderPaginacao(tabela) {
    document.getElementById('paginacaoAusentes')?.classList.add('om30a-pag-oculta');
    for (const p of paginacaoDa(tabela)) p.classList.add('om30a-pag-oculta');
  }

  let todasCarregadas = false;

  // Junta na tabela da tela as linhas buscadas: acrescenta quem falta e (se pedido)
  // tira quem saiu. Ordena do mais recente para o mais antigo, como a lista nativa.
  function mesclarLinhas(tabela, mapa, remover) {
    const tbody = tabela.tBodies[0];
    const atuais = new Map();
    for (const tr of [...tbody.rows]) {
      const id = infoLinha(tr)?.id;
      if (id) atuais.set(id, tr);
    }
    let novos = 0, saiu = 0;
    if (remover) {
      for (const [id, tr] of atuais) {
        if (mapa.has(id) || !remover(tr)) continue;
        tr.remove(); atuais.delete(id); detalhes.delete(id); saiu++;
      }
    }
    for (const [id, trRemota] of mapa) {
      if (!trRemota || atuais.has(id)) continue;
      const tr = document.importNode(trRemota, true);
      if (tabela.querySelector('.om30a-th')) prepararLinha(tr);
      atuais.set(id, tr);
      novos++;
    }
    if (novos || saiu) {
      const ordem = [...atuais.values()].sort((x, y) => idNum(y) - idNum(x));
      for (const tr of ordem) tbody.appendChild(tr);
    }
    for (const tr of [...tbody.rows]) {
      if (!infoLinha(tr) && tr.cells.length === 1) tr.style.display = atuais.size ? 'none' : '';
    }
    return { novos, saiu };
  }

  // Busca a lista no sistema.
  //   completa=false: só as páginas de hoje (a lista vem do mais recente para o mais antigo,
  //                   então para na primeira página que já tem gente de outro dia).
  //   completa=true : todas as páginas, 4 por vez, mostrando conforme chegam.
  //   inicial=true  : a página 1 é a própria tela, não precisa buscar de novo.
  // Leitura leve: só a página 1 (e as seguintes enquanto vierem só pessoas novas).
  // ---- Profissional de cada ausente (coluna "Profissional" da lista da fila médica) ----
  const mapaProf = new Map();   // id -> { prof, esp }
  function registrarProfissionais(t) {
    const cab = t.tHead?.rows[0] || t.rows[0];
    if (!cab) return 0;
    const ths = [...cab.cells].map(c => norm(c.textContent));
    const ip = ths.indexOf('PROFISSIONAL');
    if (ip < 0) return 0;
    const ie = ths.indexOf('ESPECIALIDADE');
    let n = 0;
    for (const tr of t.tBodies[0]?.rows || []) {
      const inf = infoLinha(tr);
      if (!inf?.id) continue;
      const prof = clean(tr.cells[ip]?.textContent).replace(/^[—–-]+$/, '');
      mapaProf.set(inf.id, { prof, esp: ie >= 0 ? clean(tr.cells[ie]?.textContent) : '' });
      n++;
    }
    return n;
  }
  const fonteProf = { url: new URL('/prontuarios', location.origin), param: 'page_ausentes' };
  function lerProfPagina(n) {
    if (TELA !== 'ACOLHIMENTO') return Promise.resolve();
    return comRetentativa(() => lerPaginaLista(urlDaPagina(fonteProf, n)), 2)
      .then(pg => { if (pg.t) registrarProfissionais(pg.t); })
      .catch(() => {});
  }

  async function buscarNovos(tabela) {
    if (sincronizando) return { novos: 0 };
    const fonte = fonteLista || candidatasFonte(tabela)[0];
    if (!fonte) return { novos: 0 };
    fonteLista = fonte;
    const conhecidos = new Set([...tabela.tBodies[0].rows].map(tr => infoLinha(tr)?.id).filter(Boolean));
    const mapa = new Map();
    const prof1 = lerProfPagina(1);
    for (let n = 1; n <= 5; n++) {
      let pg;
      try { pg = await lerPaginaLista(urlDaPagina(fonte, n)); } catch { break; }
      if (!pg.t || !pg.linhas.length) break;
      let algumConhecido = false;
      for (const tr of pg.linhas) {
        const id = infoLinha(tr).id;
        if (conhecidos.has(id)) algumConhecido = true; else mapa.set(id, tr);
      }
      if (algumConhecido) break;
    }
    await prof1;
    if (!mapa.size) return { novos: 0 };
    const r = mesclarLinhas(tabela, mapa, null);
    if (TELA === 'MEDICO') registrarProfissionais(tabela);
    if (r.novos) console.info(`[OM30 Ausentes] ${r.novos} ausente(s) novo(s).`);
    return r;
  }

  async function sincronizarLista(tabela, { completa = false, inicial = false } = {}) {
    if (sincronizando) return sincronizando;
    sincronizando = (async () => {
      esconderPaginacao(tabela);
      const fonte = fonteLista || candidatasFonte(tabela)[0];
      if (!fonte) return { ok: false };
      fonteLista = fonte;

      const mapa = new Map();
      let maxPag = Math.max(ultimaPagina(document, fonte.param), 1);
      let n = 1, fim = false, falhou = false, totalNovos = 0;
      const profs = [];
      if (inicial) profs.push(lerProfPagina(1));

      if (inicial) {
        const vivas = [...tabela.tBodies[0].rows].filter(tr => infoLinha(tr)?.id);
        vivas.forEach(tr => mapa.set(infoLinha(tr).id, null));
        n = 2;
        const ultima = vivas[vivas.length - 1];
        if (!vivas.length || (!completa && ultima && !linhaEhDeHoje(ultima))) fim = true;
      }

      const LOTE = 6;
      while (!fim && n <= Math.min(maxPag, MAX_PAGINAS)) {
        const nums = [];
        while (nums.length < LOTE && n <= Math.min(maxPag, MAX_PAGINAS)) nums.push(n++);
        nums.forEach(k => profs.push(lerProfPagina(k)));
        const pgs = await Promise.all(nums.map(k =>
          comRetentativa(() => lerPaginaLista(urlDaPagina(fonte, k)), 2).catch(() => null)));
        for (const pg of pgs) {
          if (!pg || !pg.t) { falhou = !pg; fim = true; break; }
          maxPag = Math.max(maxPag, ultimaPagina(pg.doc, fonte.param));
          let novos = 0;
          for (const tr of pg.linhas) {
            const id = infoLinha(tr).id;
            if (!mapa.has(id)) { mapa.set(id, tr); novos++; }
          }
          if (!novos) { fim = true; break; }
          const ultima = pg.linhas[pg.linhas.length - 1];
          if (!completa && ultima && !linhaEhDeHoje(ultima)) { fim = true; break; }
        }
        // mostra o que já chegou
        totalNovos += mesclarLinhas(tabela, mapa, null).novos;
        if (completa) definirStatus(`Carregando ausentes… ${Math.min(n - 1, maxPag)}/${maxPag}`);
        aplicarFiltros();
      }

      await Promise.all(profs);
      if (TELA === 'MEDICO') registrarProfissionais(tabela);

      // Tira quem não está mais na lista (ausência removida em outro computador),
      // só dentro do trecho que foi lido e só se a leitura deu certo.
      let saiu = 0;
      if (!falhou) {
        saiu = mesclarLinhas(tabela, mapa, completa ? () => true : tr => linhaEhDeHoje(tr)).saiu;
        if (completa) todasCarregadas = true;
      }
      if (totalNovos || saiu) console.info(`[OM30 Ausentes] Lista: +${totalNovos} / -${saiu} (páginas lidas até ${Math.min(n - 1, maxPag)} de ${maxPag}).`);
      return { ok: !falhou, novos: totalNovos, saiu };
    })();
    try { return await sincronizando; } finally { sincronizando = null; }
  }

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------

  let filtroSelecionado = localStorage.getItem(STORAGE_FILTRO) || TELA;
  if (!FILTROS_VALIDOS.has(filtroSelecionado)) filtroSelecionado = TELA;
  let somenteHoje = localStorage.getItem(STORAGE_HOJE) !== '0';
  let busca = '';
  let tabelaRef = null;
  let verificando = false;
  const detalhes = new Map();

  // ---------------------------------------------------------------------------
  // Visual (mesmo padrão da Fila Médica / Controle de Salas)
  // ---------------------------------------------------------------------------

  function garantirCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      :root {
        --om30a-azul:#123f68; --om30a-verde:#198754; --om30a-roxo:#6f42c1; --om30a-ambar:#e0a000;
        --om30a-vermelho:#c0392b; --om30a-texto:#263942; --om30a-suave:#6b7a85; --om30a-borda:#dde3e8;
      }

      /* ---------- barra de filtros ---------- */
      #${BAR_ID} {
        display:flex;flex-wrap:wrap;gap:7px;align-items:stretch;
        margin:6px 0 8px;padding:7px 8px;border:1px solid #d9dfe4;border-radius:7px;
        background:#f8fafb;font-family:Arial,Helvetica,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.035);
      }
      #${BAR_ID} .om30a-filtro {
        --c:#6c757d;display:grid;grid-template-columns:7px 1fr auto;
        column-gap:8px;align-items:center;min-width:132px;min-height:43px;padding:5px 10px;
        border:1px solid #d6dce1;border-left:4px solid var(--c);border-radius:6px;background:#fff;
        color:#35404a;cursor:pointer;text-align:left;line-height:1.1;
      }
      #${BAR_ID} .om30a-filtro:hover { background:#f7f9fb; }
      #${BAR_ID} .om30a-filtro.ativo { box-shadow:0 0 0 2px color-mix(in srgb,var(--c) 20%,transparent);background:#f7f9fb; }
      #${BAR_ID} .om30a-dot { width:7px;height:7px;border-radius:50%;background:var(--c); }
      #${BAR_ID} .om30a-label { font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.25px;color:#68737c; }
      #${BAR_ID} .om30a-qtd { justify-self:end;font-size:18px;font-weight:800;color:#252d34; }
      #${BAR_ID} .om30a-sub { grid-column:2/4;font-size:9px;color:#7b858e;white-space:nowrap; }
      #${BAR_ID} .om30a-ferramentas {
        display:flex;align-items:center;gap:8px;padding:5px 8px;
        border:1px solid #d6dce1;border-radius:6px;background:#fff;
      }
      #${BAR_ID} .om30a-busca {
        width:230px;max-width:100%;border:1px solid #d6dce1;border-radius:999px;
        padding:6px 11px;font-size:11px;color:#35404a;outline:none;background:#f8fafb;
      }
      #${BAR_ID} .om30a-busca:focus { background:#fff;border-color:#b9c2cc;box-shadow:0 0 0 3px rgba(18,63,104,.07); }
      #${BAR_ID} .om30a-hoje { display:flex;align-items:center;gap:5px;margin:0;font-size:10px;font-weight:700;color:#68737c;cursor:pointer;white-space:nowrap; }
      #${BAR_ID} .om30a-atualizar {
        border:1px solid #b9c2cc;border-radius:5px;background:#fff;color:#24313f;
        font-size:10px;font-weight:700;padding:5px 9px;cursor:pointer;white-space:nowrap;
      }
      #${BAR_ID} .om30a-atualizar:hover { background:#eaf4f8; }
      #${BAR_ID} .om30a-atualizado {
        margin-left:auto;align-self:center;display:inline-flex;align-items:center;gap:8px;min-width:108px;
        padding:7px 12px;border:1px solid #d8dfe5;border-radius:8px;background:#fff;
        box-shadow:0 1px 2px rgba(15,23,42,.04);white-space:nowrap;
      }
      #${BAR_ID} .om30a-atualizado-label { font-size:11px;font-weight:700;color:#7a8590;letter-spacing:.3px;text-transform:uppercase; }
      #${BAR_ID} .om30a-atualizado-hora { font-size:18px;font-weight:800;color:#3f4a54;line-height:1;letter-spacing:.4px;font-variant-numeric:tabular-nums; }
      #${BAR_ID} .om30a-aviso {
        flex-basis:100%;display:flex;gap:8px;align-items:flex-start;padding:7px 10px;border-radius:6px;
        border:1px solid #f1d39a;border-left:4px solid var(--om30a-ambar);background:#fffaf0;
        font-size:11px;color:#6b4e00;line-height:1.35;
      }
      #${BAR_ID} .om30a-aviso:empty { display:none; }
      #${BAR_ID} .om30a-vazio {
        flex-basis:100%;padding:10px;text-align:center;font-size:11px;color:#7b858e;
        border:1px dashed #d6dce1;border-radius:6px;background:#fff;
      }
      #${BAR_ID} .om30a-vazio[hidden] { display:none; }

      /* ---------- colunas Senha e Ausente em ---------- */
      th.om30a-th { white-space:nowrap; }
      .om30a-pag-oculta { display:none !important; }
      #${BAR_ID} .om30a-tempo { font:600 11px Arial,Helvetica,sans-serif;color:#4a5560;white-space:nowrap;
        border:1px solid #d6dde3;background:#fff;border-radius:6px;padding:5px 8px;cursor:pointer; }
      #${BAR_ID} .om30a-tempo:empty { display:none; }
      ${MODO_NUMERO === 'AMBOS' ? `#${BAR_ID} .om30a-tempo { display:none !important; }` : ''}
      #${BAR_ID} .om30a-tempo:hover { background:#f2f5f7; }
      td.om30a-td-senha { white-space:nowrap;vertical-align:middle !important; }
      td.om30a-td-origem { vertical-align:middle !important;min-width:170px; }
      .om30a-senha-btn.da-ficha { border-style:dashed !important; }
      .om30a-tag-ficha { margin-left:6px;padding:1px 5px;border-radius:4px;background:#eef1f3;color:#6b7680;
        font:700 9px Arial,Helvetica,sans-serif;letter-spacing:.3px;text-transform:uppercase;vertical-align:middle; }
      .om30a-senha-btn {
        display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:6px;
        border:1px solid #c9d1d8;background:#fff;cursor:pointer;
        font:800 12px Consolas,'Courier New',monospace;letter-spacing:.6px;color:#1f2d37;
      }
      .om30a-senha-btn:hover { border-color:var(--om30a-azul);background:#f2f7fb; }
      .om30a-senha-btn .om30a-lupa { font:700 10px Arial,sans-serif;color:#8a98a3; }
      .om30a-senha-btn.sem-numero { font:700 10px Arial,Helvetica,sans-serif;letter-spacing:0;color:#8a96a0;border-style:dashed; }
      .om30a-senha-btn.carregando { color:#a0aab2;border-style:dashed;cursor:default; }
      .om30a-origem {
        display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;
        font:700 10.5px Arial,Helvetica,sans-serif;white-space:nowrap;background:#eef1f3;color:#5c6770;
      }
      .om30a-origem::before { content:'';width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.85; }
      .om30a-origem[data-o="ACOLHIMENTO"] { background:#e8f5ee;color:#1d6b40; }
      .om30a-origem[data-o="MEDICO"] { background:#f0e9fb;color:#5a3399; }
      .om30a-origem[data-o="EMERGENCIA"] { background:#fde8ea;color:#b02a37; }
      .om30a-origem[data-o="OUTROS"], .om30a-origem[data-o="SEM_SENHA"] { background:#fff3d6;color:#8a5a00; }
      .om30a-origem[data-o="ERRO"], .om30a-origem[data-o="INDEFINIDO"] { background:#fde8e6;color:#a8332a; }
      .om30a-origem[data-o="PENDENTE"] { background:#f1f3f5;color:#9aa4ac; }
      .om30a-origem-hora { font-weight:600;opacity:.75; }
      .om30a-quem { margin-top:4px;font:11px Arial,Helvetica,sans-serif;color:#7b858e;line-height:1.3; }
      .om30a-quem b { color:#4a5560;font-weight:700; }
      a.om30a-bloqueado { opacity:.28 !important;filter:grayscale(1) !important;cursor:not-allowed !important; }
      tr.om30a-linha > td:first-child { position:relative !important;padding-left:14px !important; }
      tr.om30a-linha > td:first-child::before {
        content:'';position:absolute;left:2px;top:4px;bottom:4px;width:4px;border-radius:4px;background:transparent;
      }
      tr.om30a-linha[data-om30-origem="ACOLHIMENTO"] > td:first-child::before { background:var(--om30a-verde); }
      tr.om30a-linha[data-om30-origem="MEDICO"] > td:first-child::before { background:var(--om30a-roxo); }
      tr.om30a-linha[data-om30-origem="EMERGENCIA"] > td:first-child::before { background:#dc3545; }
      tr.om30a-linha[data-om30-origem="OUTROS"] > td:first-child::before { background:var(--om30a-ambar); }

      /* ---------- janelas ---------- */
      #${MODAL_ID} {
        position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
        background:rgba(15,23,42,.42);font-family:Arial,Helvetica,sans-serif;animation:om30aFade .12s ease-out;
      }
      #${MODAL_ID} .om30a-caixa {
        --c:var(--om30a-azul);position:relative;width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;
        background:#fff;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.28);border-top:5px solid var(--c);
        padding:22px 24px 18px;color:var(--om30a-texto);animation:om30aSobe .14s ease-out;
      }
      #${MODAL_ID} .om30a-caixa.largo { width:min(760px,calc(100vw - 32px)); }
      #${MODAL_ID} .om30a-caixa[data-tipo="sucesso"] { --c:var(--om30a-verde); }
      #${MODAL_ID} .om30a-caixa[data-tipo="erro"] { --c:var(--om30a-vermelho); }
      #${MODAL_ID} .om30a-caixa[data-tipo="aviso"] { --c:var(--om30a-ambar); }
      #${MODAL_ID} .om30a-topo { display:flex;align-items:center;gap:12px;margin-bottom:10px; }
      #${MODAL_ID} .om30a-icone {
        flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;
        background:color-mix(in srgb,var(--c) 14%,#fff);color:var(--c);font-size:19px;font-weight:900;
      }
      #${MODAL_ID} .om30a-titulo { font-size:15px;font-weight:800;line-height:1.25; }
      #${MODAL_ID} .om30a-subtitulo { font-size:11px;color:var(--om30a-suave);margin-top:2px; }
      #${MODAL_ID} .om30a-senha-box {
        margin:12px 0;padding:12px;border-radius:10px;text-align:center;
        background:color-mix(in srgb,var(--c) 7%,#fff);border:1px solid color-mix(in srgb,var(--c) 30%,#fff);
      }
      #${MODAL_ID} .om30a-senha-rot { font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--om30a-suave); }
      #${MODAL_ID} .om30a-senha-num {
        margin-top:2px;font:900 40px Consolas,'Courier New',monospace;letter-spacing:3px;color:var(--c);
      }
      #${MODAL_ID} .om30a-senha-num.pequena { font:800 16px Arial,Helvetica,sans-serif;letter-spacing:0; }
      #${MODAL_ID} .om30a-texto { font-size:12.5px;line-height:1.5;color:#4b5963; }
      #${MODAL_ID} .om30a-texto p { margin:0 0 6px; }
      #${MODAL_ID} .om30a-acoes { display:flex;justify-content:flex-end;gap:8px;margin-top:16px; }
      #${MODAL_ID} .om30a-btn {
        border:1px solid #c5ced5;border-radius:7px;background:#fff;color:#2b3a44;
        font:700 12px Arial,Helvetica,sans-serif;padding:9px 16px;cursor:pointer;
      }
      #${MODAL_ID} .om30a-btn:hover { background:#f3f6f8; }
      #${MODAL_ID} .om30a-btn.primario { border-color:var(--c);background:var(--c);color:#fff; }
      #${MODAL_ID} .om30a-btn.primario:hover { filter:brightness(.94); }
      #${MODAL_ID} .om30a-resumo { display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px; }
      #${MODAL_ID} .om30a-hist { width:100%;border-collapse:separate;border-spacing:0;font-size:11.5px;text-align:left;border:1px solid var(--om30a-borda);border-radius:8px;overflow:hidden; }
      #${MODAL_ID} .om30a-hist th { background:#f5f7f9;color:#6b7680;font-size:10px;text-transform:uppercase;letter-spacing:.3px;padding:7px 8px;border-bottom:1px solid var(--om30a-borda); }
      #${MODAL_ID} .om30a-hist td { padding:7px 8px;border-bottom:1px solid #eef1f3;color:#35404a; }
      #${MODAL_ID} .om30a-hist tr:last-child td { border-bottom:0; }
      #${MODAL_ID} .om30a-hist tr.aqui td { background:#fff8e6; }
      #${MODAL_ID} .om30a-hist .marca { display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:#ffe4a3;color:#7a5200;font-size:9.5px;font-weight:800; }
      #${MODAL_ID} .om30a-hist .mono { font-family:Consolas,'Courier New',monospace;font-weight:800; }
      #${MODAL_ID} .om30a-hist .vazio { color:#b0b8bf; }
      #${MODAL_ID} .om30a-nota { margin-top:8px;font-size:10.5px;color:#8a949c;line-height:1.4; }

      /* ---------- avisos rápidos ---------- */
      #om30a-toasts { position:fixed;top:16px;right:16px;z-index:2147483001;display:flex;flex-direction:column;gap:8px;font-family:Arial,Helvetica,sans-serif; }
      .om30a-toast {
        --c:var(--om30a-azul);display:flex;gap:10px;align-items:flex-start;width:min(360px,calc(100vw - 32px));
        padding:11px 12px;border-radius:10px;background:#fff;border:1px solid var(--om30a-borda);border-left:5px solid var(--c);
        box-shadow:0 10px 28px rgba(15,23,42,.18);animation:om30aEntra .16s ease-out;
      }
      .om30a-toast[data-tipo="sucesso"] { --c:var(--om30a-verde); }
      .om30a-toast[data-tipo="erro"] { --c:var(--om30a-vermelho); }
      .om30a-toast[data-tipo="aviso"] { --c:var(--om30a-ambar); }
      .om30a-toast .ico { flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 14%,#fff);color:var(--c);font-weight:900;font-size:13px; }
      .om30a-toast .tt { font-size:12.5px;font-weight:800;color:var(--om30a-texto); }
      .om30a-toast .tx { margin-top:2px;font-size:11.5px;color:#5b6670;line-height:1.4; }
      .om30a-toast .x { margin-left:auto;border:0;background:transparent;color:#9aa4ac;font-size:16px;line-height:1;cursor:pointer;padding:0 2px; }

      @keyframes om30aFade { from { opacity:0 } to { opacity:1 } }
      @keyframes om30aSobe { from { transform:translateY(8px);opacity:.6 } to { transform:none;opacity:1 } }
      @keyframes om30aEntra { from { transform:translateX(12px);opacity:0 } to { transform:none;opacity:1 } }

      @media (max-width:1100px) {
        #${BAR_ID} .om30a-filtro { min-width:112px; }
        #${BAR_ID} .om30a-busca { width:180px; }
      }
    `;
    document.head.appendChild(st);
  }

  const ICONES = { sucesso: '✓', erro: '✕', aviso: '!', info: 'i', pergunta: '?' };

  // Janela padrão OM30. botoes: [{ rotulo, valor, primario }]. Resolve com o valor do botão.
  function dialogo({ tipo = 'info', titulo, subtitulo, senha, senhaRotulo = 'Senha', senhaPequena = false,
                     texto, html, botoes = [{ rotulo: 'OK', valor: true, primario: true }], largo = false }) {
    garantirCSS();
    return new Promise(resolve => {
      document.getElementById(MODAL_ID)?.remove();
      const m = document.createElement('div');
      m.id = MODAL_ID;
      const caixa = document.createElement('div');
      caixa.className = 'om30a-caixa' + (largo ? ' largo' : '');
      caixa.dataset.tipo = tipo;
      caixa.innerHTML = `
        <div class="om30a-topo">
          <div class="om30a-icone">${ICONES[tipo] || 'i'}</div>
          <div><div class="om30a-titulo"></div>${subtitulo ? '<div class="om30a-subtitulo"></div>' : ''}</div>
        </div>
        ${senha ? `<div class="om30a-senha-box"><div class="om30a-senha-rot"></div><div class="om30a-senha-num${senhaPequena ? ' pequena' : ''}"></div></div>` : ''}
        ${texto ? '<div class="om30a-texto"></div>' : ''}
        ${html ? `<div class="om30a-html">${html}</div>` : ''}
        <div class="om30a-acoes"></div>`;
      caixa.querySelector('.om30a-titulo').textContent = titulo || '';
      if (subtitulo) caixa.querySelector('.om30a-subtitulo').textContent = subtitulo;
      if (senha) {
        caixa.querySelector('.om30a-senha-rot').textContent = senhaRotulo;
        caixa.querySelector('.om30a-senha-num').textContent = senha;
      }
      if (texto) {
        const alvo = caixa.querySelector('.om30a-texto');
        for (const par of [].concat(texto)) { const p = document.createElement('p'); p.textContent = par; alvo.appendChild(p); }
      }

      const fechar = valor => { document.removeEventListener('keydown', teclas, true); m.remove(); resolve(valor); };
      const temCancelar = botoes.some(b => b.valor === false || b.valor === null);
      const teclas = ev => {
        if (ev.key === 'Escape') { ev.preventDefault(); fechar(temCancelar ? false : (botoes[0]?.valor ?? true)); }
      };
      const acoes = caixa.querySelector('.om30a-acoes');
      let principal = null;
      for (const b of botoes) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'om30a-btn' + (b.primario ? ' primario' : '');
        el.textContent = b.rotulo;
        el.addEventListener('click', () => fechar(b.valor));
        acoes.appendChild(el);
        if (b.primario) principal = el;
      }
      m.addEventListener('click', ev => { if (ev.target === m && temCancelar) fechar(false); });
      document.addEventListener('keydown', teclas, true);
      m.appendChild(caixa);
      document.body.appendChild(m);
      (principal || acoes.lastChild)?.focus();
    });
  }

  function toast({ tipo = 'info', titulo, texto, ms = 7000 }) {
    garantirCSS();
    let pilha = document.getElementById('om30a-toasts');
    if (!pilha) { pilha = document.createElement('div'); pilha.id = 'om30a-toasts'; document.body.appendChild(pilha); }
    const t = document.createElement('div');
    t.className = 'om30a-toast';
    t.dataset.tipo = tipo;
    t.innerHTML = `<div class="ico">${ICONES[tipo] || 'i'}</div><div><div class="tt"></div><div class="tx"></div></div><button type="button" class="x" title="Fechar">×</button>`;
    t.querySelector('.tt').textContent = titulo || '';
    t.querySelector('.tx').textContent = texto || '';
    if (!texto) t.querySelector('.tx').remove();
    t.querySelector('.x').addEventListener('click', () => t.remove());
    pilha.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // ---------------------------------------------------------------------------
  // Barra de filtros
  // ---------------------------------------------------------------------------

  function montarBarra(tabela) {
    garantirCSS();
    let bar = document.getElementById(BAR_ID);
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = BAR_ID;

    for (const filtro of FILTROS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'om30a-filtro';
      b.dataset.filtro = filtro.key;
      b.style.setProperty('--c', filtro.cor);
      b.innerHTML = `<span class="om30a-dot"></span><span class="om30a-label">${filtro.label}</span><span class="om30a-qtd">0</span>`;
      b.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation();
        filtroSelecionado = filtro.key;
        gravar(STORAGE_FILTRO, filtroSelecionado);
        aplicarFiltros();
      });
      bar.appendChild(b);
    }

    const ferramentas = document.createElement('div');
    ferramentas.className = 'om30a-ferramentas';
    ferramentas.innerHTML = `
      <input type="search" class="om30a-busca" placeholder="Buscar nome ou senha (ex: CN0003)">
      <label class="om30a-hoje"><input type="checkbox"${somenteHoje ? ' checked' : ''}> Somente hoje</label>
      <button type="button" class="om30a-atualizar" title="Consulta de novo o Senha Simples">↻ Atualizar</button>
      <button type="button" class="om30a-tempo" title="Tempo de carga (clique para copiar)"></button>
    `;
    bar.appendChild(ferramentas);
    ferramentas.querySelector('.om30a-tempo').addEventListener('click', async ev => {
      const t = ev.currentTarget.dataset.copiar;
      if (!t) return;
      try { await navigator.clipboard.writeText(t); }
      catch {
        const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta);
        ta.select(); try { document.execCommand('copy'); } catch {} ta.remove();
      }
      toast({ tipo: 'sucesso', titulo: 'Tempo copiado', texto: 'Cole aqui no chat para comparar.' });
    });

    const at = document.createElement('span');
    at.className = 'om30a-atualizado';
    bar.appendChild(at);

    const aviso = document.createElement('div');
    aviso.className = 'om30a-aviso';
    bar.appendChild(aviso);

    const vazio = document.createElement('div');
    vazio.className = 'om30a-vazio';
    vazio.hidden = true;
    vazio.textContent = 'Nenhum ausente neste grupo com os filtros atuais.';
    bar.appendChild(vazio);

    const inputBusca = ferramentas.querySelector('.om30a-busca');
    inputBusca.addEventListener('input', () => { busca = inputBusca.value; aplicarFiltros(); });
    inputBusca.addEventListener('keydown', ev => { if (ev.key === 'Enter') ev.preventDefault(); });

    ferramentas.querySelector('input[type=checkbox]').addEventListener('change', ev => {
      somenteHoje = ev.target.checked;
      gravar(STORAGE_HOJE, somenteHoje ? '1' : '0');
      aplicarFiltros();
      if (!somenteHoje && tabelaRef) {
        (async () => {
          if (!todasCarregadas) {
            definirStatus('Carregando ausentes antigos…');
            try { await sincronizarLista(tabelaRef, { completa: true }); } catch {}
            aplicarFiltros();
          }
          classificarTodos(false);
        })();
      }
    });

    ferramentas.querySelector('.om30a-atualizar').addEventListener('click', async () => {
      if (verificando || !tabelaRef) return;
      definirStatus('Carregando ausentes…');
      T0 = performance.now(); tLista = 0; tFim = 0; classificou = false;
      const el = document.querySelector(`#${BAR_ID} .om30a-tempo`); if (el) el.textContent = '';
      try { await sincronizarLista(tabelaRef, { completa: !somenteHoje }); } catch {}
      marcarTempoLista();
      aplicarFiltros();
      classificarTodos(true);
    });

    tabela.parentElement.insertBefore(bar, tabela);
    definirStatus('');
    return bar;
  }

  function definirStatus(texto) {
    const el = document.querySelector(`#${BAR_ID} .om30a-atualizado`);
    if (!el) return;
    el.innerHTML = texto
      ? `<span class="om30a-atualizado-label">${esc(texto)}</span>`
      : `<span class="om30a-atualizado-label">Horário</span><span class="om30a-atualizado-hora">${horarioCurtoAgora()}</span>`;
  }

  function definirAviso(texto) {
    // Avisos técnicos (Senha Simples, parametrização) ficam só no console do suporte; profissionais não veem.
    if (texto) console.info('[OM30 Ausentes] aviso:', texto);
    const el = document.querySelector(`#${BAR_ID} .om30a-aviso`);
    if (el) el.innerHTML = '';
  }

  // ---------------------------------------------------------------------------
  // Colunas "Senha" e "Ausente em" na tabela nativa
  // ---------------------------------------------------------------------------

  const COL_SENHA = 2;   // logo depois de "Nome"
  const COL_ORIGEM = 3;

  function prepararColunas(tabela) {
    const cab = tabela.tHead?.rows[0] || tabela.rows[0];
    if (cab && !cab.querySelector('.om30a-th')) {
      const ref = cab.cells[COL_SENHA] || null;
      for (const nome of ['Senha', 'Ausente em']) {
        const th = document.createElement('th');
        th.className = 'om30a-th';
        th.textContent = nome;
        cab.insertBefore(th, ref);
      }
    }
    for (const tr of tabela.tBodies[0]?.rows || []) prepararLinha(tr);
  }

  function prepararLinha(tr) {
    if (tr.querySelector('.om30a-td-senha')) return;
    if (!tr.querySelector(SEL_REMOVER)) {
      // linha "nenhum registro": só alarga o colspan
      const td = tr.cells[0];
      if (td?.colSpan > 1) td.colSpan += 2;
      return;
    }
    const ref = tr.cells[COL_SENHA] || null;
    const tdSenha = document.createElement('td');
    tdSenha.className = 'om30a-td-senha';
    tdSenha.innerHTML = '<span class="om30a-senha-btn carregando">…</span>';
    const tdOrigem = document.createElement('td');
    tdOrigem.className = 'om30a-td-origem';
    tdOrigem.innerHTML = '<span class="om30a-origem" data-o="PENDENTE">Verificando…</span>';
    tr.insertBefore(tdSenha, ref);
    tr.insertBefore(tdOrigem, ref);
  }

  // ---------------------------------------------------------------------------
  // Filtros
  // ---------------------------------------------------------------------------

  function grupoDaLinha(tr) {
    const o = tr.dataset.om30Origem;
    if (o === 'ACOLHIMENTO' || o === 'MEDICO' || o === 'EMERGENCIA') return o;
    return o ? 'OUTROS' : 'PENDENTE';
  }

  function passaFiltros(tr) {
    if (somenteHoje && !linhaEhDeHoje(tr)) return false;
    const q = semEspaco(busca);
    if (!q) return true;
    const nome = tr.dataset.om30Nome || '';
    const senha = semEspaco(tr.dataset.om30Senha);
    return nome.includes(q) || (!!senha && senha.includes(q));
  }

  function aplicarFiltros() {
    if (!tabelaRef) return;
    const contagem = { TODOS: 0, ACOLHIMENTO: 0, MEDICO: 0, EMERGENCIA: 0, OUTROS: 0 };
    let visiveis = 0;

    for (const tr of tabelaRef.tBodies[0].rows) {
      if (!tr.querySelector(SEL_REMOVER)) continue;
      if (!tr.dataset.om30Nome) tr.dataset.om30Nome = semEspaco(tr.cells[1]?.textContent);
      tr.classList.add('om30a-linha');

      const ok = passaFiltros(tr);
      const grupo = grupoDaLinha(tr);
      if (ok) {
        contagem.TODOS++;
        if (contagem[grupo] !== undefined) contagem[grupo]++;
      }
      const mostrar = ok && (filtroSelecionado === 'TODOS' || grupo === filtroSelecionado);
      tr.style.display = mostrar ? '' : 'none';
      if (mostrar) visiveis++;
    }

    const bar = document.getElementById(BAR_ID);
    if (!bar) return;
    for (const f of FILTROS) {
      const b = bar.querySelector(`[data-filtro="${f.key}"]`);
      if (!b) continue;
      b.classList.toggle('ativo', f.key === filtroSelecionado);
      b.querySelector('.om30a-qtd').textContent = String(contagem[f.key] || 0);
    }
    const vazio = bar.querySelector('.om30a-vazio');
    if (vazio) vazio.hidden = visiveis > 0;
  }

  // ---------------------------------------------------------------------------
  // Linha: senha, origem, quem chamou, bloqueio
  // ---------------------------------------------------------------------------

  const nomeDaLinha = tr => clean(String(tr.cells[1]?.innerText || '').split('\n').map(clean).find(Boolean)) || 'o paciente';
  const rotuloOrigem = r => r.origem === 'OUTROS' && r.setor ? r.setor : (ROTULO_ORIGEM[r.origem] || r.origem);

  function historicoDaOrigem(r) {
    return (r.historico || []).find(h =>
      r.origem === 'MEDICO' ? h.grupo === 'MEDICO'
        : r.origem === 'EMERGENCIA' ? (h.grupo === 'EMERGENCIA' || h.grupo === 'MEDICO')
        : r.origem === 'ACOLHIMENTO' ? h.grupo === 'ACOLHIMENTO'
          : h.fila === r.setor);
  }

  // Na tela do acolhimento só remove ausente do acolhimento; na fila médica, ausente da
  // fila médica (ou de outra fila de atendimento, ex.: emergência). Recepção/acolhimento não.
  function podeRemoverAqui(origem, setor) {
    if (TELA === 'ACOLHIMENTO') return origem === 'ACOLHIMENTO';
    return origem === 'MEDICO' || origem === 'EMERGENCIA' || (origem === 'OUTROS' && setor !== 'Recepção');
  }
  const nomeTela = () => TELA === 'MEDICO' ? 'fila médica' : 'acolhimento';
  const nomeFilaDestino = (origem, setor) =>
    TELA === 'ACOLHIMENTO' ? 'acolhimento'
      : origem === 'EMERGENCIA' ? 'emergência'
        : (origem === 'OUTROS' && setor ? setor : 'fila médica');

  function textoBloqueio(origem, setor) {
    if (origem === 'ACOLHIMENTO' || (TELA === 'MEDICO' && setor === 'Recepção')) {
      const onde = origem === 'ACOLHIMENTO' ? 'acolhimento' : 'recepção';
      return {
        titulo: `Ausente no ${onde}`.replace('no recepção', 'na recepção'),
        paragrafos: [
          `Este paciente foi ausentado ${origem === 'ACOLHIMENTO' ? 'no acolhimento' : 'na recepção'}, não na fila médica.`,
          origem === 'ACOLHIMENTO' ? 'Para tirar da ausência, use a aba AUSENTES da tela do acolhimento.' : 'Para tirar da ausência, use a tela da recepção.',
          'Removendo por aqui, ele sai da lista mas não volta para nenhuma fila.'
        ]
      };
    }
    const onde = origem === 'MEDICO' ? 'fila médica' : origem === 'EMERGENCIA' ? 'emergência' : (setor || 'outra fila');
    const comoRemover = origem === 'MEDICO' || origem === 'EMERGENCIA'
      ? 'Para tirar da ausência, use a aba AUSENTES da tela do médico (Prontuários).'
      : `Para tirar da ausência, use a tela da fila ${onde}.`;
    return {
      titulo: `Ausente na ${onde}`,
      paragrafos: [
        `Este paciente foi ausentado na ${onde}, não no acolhimento.`,
        comoRemover,
        'Removendo por aqui, ele sai da lista mas não volta para nenhuma fila.'
      ]
    };
  }

  function marcarLinha(tr, r) {
    prepararLinha(tr);
    const inf = infoLinha(tr);
    if (inf?.id) { tr.dataset.om30Id = inf.id; detalhes.set(inf.id, r); }
    if (!tr.dataset.om30Nome) tr.dataset.om30Nome = semEspaco(tr.cells[1]?.textContent);
    if (!r.senha && inf?.id) {
      const f = lerJSON(CHAVE_FICHA + inf.id);
      if (MODO_NUMERO !== 'SENHA' && f.senha && Date.now() - f.t < FICHA_MS) { r.senha = f.senha; r.senhaDaFicha = true; }
      else if (MODO_NUMERO !== 'SENHA' && !['ERRO', 'INDEFINIDO', 'PENDENTE'].includes(r.origem)) pedirSenhaFicha(tr);
    }
    // O número da senha não substitui o setor registrado no evento de ausência.
    if (r.fonte !== 'D1' && /^EM/i.test(r.senha || '') && ['MEDICO', 'ACOLHIMENTO', 'OUTROS'].includes(r.origem)) {
      r.origem = 'EMERGENCIA';
      r.setor = 'Emergência';
      const em = (unidadeAtual?.filas || []).find(f => f.grupo === 'EMERGENCIA');
      if (em) r.cat = em.cat;
    }
    tr.dataset.om30Origem = r.origem;
    tr.dataset.om30Fonte = r.fonte || '';
    tr.dataset.om30Erro = r.erroHttp || '';
    if (r.senha) tr.dataset.om30Senha = r.senha; else delete tr.dataset.om30Senha;
    if (r.setor) tr.dataset.om30Setor = r.setor; else delete tr.dataset.om30Setor;
    if (r.cat) tr.dataset.om30Cat = r.cat; else delete tr.dataset.om30Cat;

    // Coluna Senha
    const tdSenha = tr.querySelector('.om30a-td-senha');
    const bSenha = document.createElement('button');
    bSenha.type = 'button';
    if (r.senha) {
      bSenha.className = 'om30a-senha-btn';
      bSenha.innerHTML = `${esc(r.senha)}<span class="om30a-lupa">▸</span>`;
      bSenha.title = 'Ver detalhes da senha';
    } else {
      bSenha.className = 'om30a-senha-btn sem-numero';
      bSenha.textContent = tr.dataset.om30FichaPedida && !tr.dataset.om30FichaFalhou ? '…' : '—';
      bSenha.title = 'O número da senha aparece ao devolver o paciente.';
    }
    bSenha.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); abrirDetalheSenha(tr); });
    tdSenha.replaceChildren(bSenha);

    // Coluna Ausente em
    const tdOrigem = tr.querySelector('.om30a-td-origem');
    const aqui = historicoDaOrigem(r);
    let rotulo = rotuloOrigem(r);
    const horaAusencia = hora(r.ausenteEm || aqui?.concluida);
    let quemHtml = '';
    if (r.chamadoPor || r.guiche) {
      const verbo = r.acao === 'Ausentado' ? 'Ausentado por' : r.acao === 'Concluída' ? 'Concluída por' : r.acao === 'Profissional' ? 'Profissional' : 'Chamado por';
      const g = guicheCurto(r.guiche);
      quemHtml = `<div class="om30a-quem" title="${esc(`${r.chamadoPor || ''}${r.guiche ? ` · ${r.guiche}` : ''}`)}">` +
        (r.chamadoPor ? `${verbo} <b>${esc(pessoaCurta(r.chamadoPor))}</b>${g ? ` · ${esc(g)}` : ''}` : `Guichê ${esc(g)}`) +
        '</div>';
    }
    tdOrigem.innerHTML =
      `<span class="om30a-origem" data-o="${esc(r.origem)}">${esc(rotulo)}` +
      `${horaAusencia ? ` <span class="om30a-origem-hora">· ${esc(horaAusencia)}</span>` : ''}</span>${quemHtml}`;

    // Botão remover: bloqueado se a ausência é de outra fila
    const btn = tr.querySelector(SEL_REMOVER);
    if (btn) {
      const bloquear = r.fonte === 'D1' && !podeRemoverAqui(r.origem, r.setor);
      btn.classList.toggle('om30a-bloqueado', bloquear);
      if (bloquear) {
        if (btn.dataset.om30TituloOriginal === undefined) btn.dataset.om30TituloOriginal = btn.getAttribute('title') || '';
        btn.setAttribute('title', ['ACOLHIMENTO', 'MEDICO', 'EMERGENCIA', 'OUTROS'].includes(r.origem)
          ? `Bloqueado: ${textoBloqueio(r.origem, r.setor).paragrafos.slice(0, 2).join(' ')}`
          : 'Bloqueado: origem da ausência não confirmada. Clique em Atualizar.');
      } else if (btn.dataset.om30TituloOriginal !== undefined) {
        btn.setAttribute('title', 'Remover ausência e devolver a senha');
      }
    }
  }

  async function abrirDetalheSenha(tr) {
    let r = detalhes.get(tr.dataset.om30Id);
    if (!r) return;
    // A classificação para cedo; o histórico de todas as filas só é buscado aqui.
    if (r.parcial && unidadeAtual) {
      const inf = infoLinha(tr);
      const bt = tr.querySelector('.om30a-senha-btn');
      bt?.classList.add('carregando');
      try {
        const completo = await origemDoAusente(inf.id, inf.tipo, unidadeAtual, { completo: true });
        if (completo.origem === r.origem) { r = { ...r, historico: completo.historico, senha: r.senha || completo.senha, parcial: false }; detalhes.set(inf.id, r); }
      } catch {}
      bt?.classList.remove('carregando');
    }
    const aqui = historicoDaOrigem(r);
    const linhas = (r.historico || []).map(h => {
      const chamada = hora(h.chamada) || (h.jaChamada ? 'chamada' : '');
      const quem = [pessoaCurta(h.por), guicheCurto(h.guiche)].filter(Boolean).join(' · ');
      const cel = v => v ? esc(v) : '<span class="vazio">—</span>';
      return `<tr${h === aqui ? ' class="aqui"' : ''}>
        <td>${esc(h.fila)}${h === aqui ? '<span class="marca">ausente aqui</span>' : ''}</td>
        <td class="mono">${cel(h.senha)}</td>
        <td>${cel(hora(h.gerada))}</td>
        <td>${cel(chamada)}</td>
        <td>${cel(hora(h.concluida))}</td>
        <td>${cel(quem)}</td>
      </tr>`;
    }).join('');

    const temSemNumero = (r.historico || []).some(h => h.jaChamada && !h.senha);
    const html = `
      <div class="om30a-resumo">
        <span class="om30a-origem" data-o="${esc(r.origem)}">Ausente em: ${esc(rotuloOrigem(r))}</span>
        ${aqui?.concluida ? `<span class="om30a-origem" data-o="PENDENTE">Ausência às ${esc(hora(aqui.concluida))}</span>` : ''}
      </div>
      ${linhas ? `<table class="om30a-hist">
        <thead><tr><th>Fila</th><th>Senha</th><th>Gerada</th><th>Chamada</th><th>Concluída</th><th>Quem</th></tr></thead>
        <tbody>${linhas}</tbody></table>` : ''}
      `;

    dialogo({
      tipo: 'info',
      titulo: nomeDaLinha(tr),
      subtitulo: 'Senha e caminho pelas filas',
      senha: r.senha || 'Número não informado',
      senhaPequena: !r.senha,
      html,
      largo: true,
      botoes: [{ rotulo: 'Fechar', valor: true, primario: true }]
    });
  }

  // ---------------------------------------------------------------------------
  // Classificação de todos os ausentes
  // ---------------------------------------------------------------------------

  let unidadeLite = null;
  async function unidadeSoParametrizacao() {
    if (unidadeLite) return unidadeLite;
    const acolhCat = await comRetentativa(() => lerParametrizacao('acolhimento')).then(p => p?.senha_simples_categoria?.id || null).catch(() => null);
    const medCat = await comRetentativa(() => lerParametrizacao('atendimento')).then(p => p?.senha_simples_categoria?.id || null).catch(() => null);
    unidadeLite = { acolhCat, medCat, filas: [], erros: {} };
    return unidadeLite;
  }

  // ---- Medição de tempo (para comparar os modos) ----
  let tLista = 0, tFim = 0, classificou = false;
  function marcarTempoLista() { if (!tLista) tLista = performance.now() - T0; }
  function verificarConclusao() {
    if (tFim || !classificou || fichasLendo || filaFicha.length) return;
    tFim = performance.now() - T0;
    const linhas = [...(tabelaRef?.tBodies[0]?.rows || [])].filter(tr => infoLinha(tr) && (!somenteHoje || linhaEhDeHoje(tr)));
    const comNumero = linhas.filter(tr => tr.dataset.om30Senha).length;
    const s = v => (v / 1000).toFixed(1).replace('.', ',') + ' s';
    const nome = { AMBOS: 'Senha Simples + ficha', SENHA: 'só Senha Simples', FICHA: 'só ficha' }[MODO_NUMERO];
    const texto = `Lista ${s(tLista)} · tudo ${s(tFim)} · ${comNumero}/${linhas.length} com número`;
    console.info(`[OM30 Ausentes] (${nome}) ${texto}`);
    const el = document.querySelector(`#${BAR_ID} .om30a-tempo`);
    if (el) {
      el.textContent = `⏱ ${texto}`;
      el.dataset.copiar = `OM30 Ausentes v${VERSAO} | modo: ${nome} | tela: ${nomeTela()} | ${texto} | ${new Date().toLocaleString('pt-BR')}`;
      el.title = `Modo do número: ${nome}. Medido desde que a página abriu. Clique para copiar.`;
    }
  }

  // OM30_ORIGEM_SEGURA_BEGIN: somente o evento confirmado define o setor da ausência.
  const origensConfirmadas = new Map();
  async function origemConfirmadaDaLinha(inf, unidade, mapa, configurado) {
    const chave = inf.tipo + '#' + inf.id;
    let d1 = mapa.get(chave);
    const consultaOk = mapa.consultaOk === true || mapa.consultadosOk?.has(chave) === true;
    if (!d1 && !consultaOk) d1 = origensConfirmadas.get(chave);
    if (consultaOk && !d1) origensConfirmadas.delete(chave);
    if (d1 && ['MEDICO', 'ACOLHIMENTO'].includes(d1.origem)) {
      if (origensConfirmadas.get(chave)?.em !== d1.em) {
        try { localStorage.removeItem(SESSION_CACHE + inf.tipo + '#' + inf.id); } catch {}
      }
      origensConfirmadas.set(chave, { ...d1 });
      const complemento = await origemRapida(inf.id, inf.tipo, unidade, d1.origem, null, configurado)
        .catch(() => ({}));
      return { ...complemento, origem: d1.origem, fonte: 'D1', atendimento: chave,
        ausenteEm: d1.em || null, eventoId: d1.eventId || null, chamadoPor: d1.por || null, guiche: d1.local || null,
        acao: 'Ausentado', consultaPendente: !consultaOk };
    }
    // Senha e histórico nativos continuam disponíveis. Especialidade, profissional ou
    // passagem por uma fila não comprovam onde a ausência foi marcada.
    const complemento = configurado
      ? await origemDoAusente(inf.id, inf.tipo, unidade).catch(() => ({})) : {};
    return { ...complemento, origem: 'INDEFINIDO', fonte: 'SEM_ORIGEM_CONFIRMADA',
      atendimento: chave, setor: null, cat: null, chamadoPor: null, guiche: null,
      acao: null, ausenteEm: null };
  }
  async function confirmarOrigemParaDevolver(inf, registro, origem) {
    if (!inf?.id || !inf.tipo || registro?.fonte !== 'D1' || !registro.ausenteEm ||
        registro.atendimento !== inf.tipo + '#' + inf.id || !window.OM30Ausencias?.origens) return false;
    try {
      const mapa = await window.OM30Ausencias.origens([inf], { forcar: true });
      const atual = mapa.get(inf.tipo + '#' + inf.id);
      return mapa.consultaOk === true && atual?.origem === origem && atual.em === registro.ausenteEm &&
        (!registro.eventoId || atual.eventId === registro.eventoId);
    } catch { return false; }
  }
  // OM30_ORIGEM_SEGURA_END

  async function classificarTodos(forcar = false) {
    if (verificando || !tabelaRef) return;
    verificando = true;
    try {
      definirStatus('Lendo filas…');
      garantirTokenSenha();
      // Esperando o login do Senha Simples: não insiste nele, separa só pelo profissional.
      const unidade = MODO_NUMERO === 'FICHA' ? await unidadeSoParametrizacao()
        : aguardandoToken
          ? { ...(unidadeAtual || {}), filas: [], erros: { categorias: 'HTTP 401' } }
          : await filasDaUnidade(forcar);
      if (!aguardandoToken && MODO_NUMERO !== 'FICHA') unidadeAtual = unidade;
      const deu401 = Object.values(unidade.erros || {}).some(e => /401/.test(e));
      if (deu401) esperarTokenNovo(() => classificarTodos(false));   // segue separando pelo profissional
      const configurado = !deu401 && !!(unidade.acolhCat && unidade.medCat && unidade.filas.length);

      if (!deu401 && MODO_NUMERO !== 'FICHA') definirAviso(configurado ? (unidade.unidadeDiferente
        ? 'O Senha Simples deste computador está em outra unidade. Consultei só o acolhimento e a fila médica desta unidade. Para ver emergência e salas, troque a unidade no site do Senha Simples.'
        : '') :
        !unidade.medCat
          ? `Não encontrei a fila médica na parametrização desta unidade (${unidade.erros?.atendimento || 'sem detalhe'}).`
          : !unidade.acolhCat
            ? `Não encontrei a fila de acolhimento na parametrização desta unidade (${unidade.erros?.acolhimento || 'sem detalhe'}).`
            : `Não consegui ler as filas do Senha Simples (${unidade.erros?.categorias || 'sem detalhe'}).`);

      const linhas = [...tabelaRef.tBodies[0].rows]
        .map(tr => ({ tr, inf: infoLinha(tr) }))
        .filter(x => x.inf?.id)
        .filter(x => !somenteHoje || linhaEhDeHoje(x.tr))   // antigos só quando "Somente hoje" estiver desmarcado
        .sort((a, b) => Number(linhaEhDeHoje(b.tr)) - Number(linhaEhDeHoje(a.tr)));

      if (forcar) linhas.forEach(x => { try { localStorage.removeItem(SESSION_CACHE + x.inf.tipo + '#' + x.inf.id); localStorage.removeItem(CHAVE_FICHA + x.inf.id); } catch {} });
      if (forcar) { tFim = 0; classificou = false; }

      // Origem registrada no D1 no momento da ausência (coletor OM30 D1). Uma consulta em lote;
      // sem registro (ou sem rede) segue exatamente o caminho anterior.
      const consultaFalhou = () => Object.assign(new Map(), { consultaOk: false });
      const origensD1 = window.OM30Ausencias?.origens ? await window.OM30Ausencias.origens(linhas.map(x => x.inf)).catch(consultaFalhou) : consultaFalhou();

      let feitos = 0;
      definirStatus(`Verificando 0/${linhas.length}`);
      await emParalelo(linhas, CONCORRENCIA, async ({ tr, inf }) => {
        const r = await origemConfirmadaDaLinha(inf, unidade, origensD1, configurado);
        marcarLinha(tr, r);
        feitos++;
        definirStatus(`Verificando ${feitos}/${linhas.length}`);
        aplicarFiltros();
      });
      definirStatus('');
      ultimaVerificacao = Date.now();
      classificou = true;
      if (!tLista) tLista = performance.now() - T0;
      verificarConclusao();

      // Token venceu no meio: espera o novo e refaz, sem mostrar "Erro".
      if (!deu401 && linhas.some(x => /401/.test(x.tr.dataset.om30Erro || ''))) {
        esperarTokenNovo(() => classificarTodos(false));
        return;
      }

      // Se NENHUM ausente teve a senha encontrada, a leitura das filas veio errada
      // (ex.: Senha Simples ainda trocando de unidade). Refaz sozinho uma vez, do zero.
      const total = linhas.length;
      const semNada = linhas.filter(x => ['SEM_SENHA', 'ERRO', 'INDEFINIDO'].includes(x.tr.dataset.om30Origem)).length;
      if (total && semNada === total && !refezAutomatico) {
        refezAutomatico = true;
        setTimeout(() => classificarTodos(true), 2000);
      } else if (semNada < total) {
        refezAutomatico = false;
      }
    } finally {
      verificando = false;
    }
  }

  let ultimaVerificacao = 0;
  let unidadeAtual = null;
  let refezAutomatico = false;

  // Mantém a lista atualizada sozinha: revisita de tempos em tempos e quando a aba volta ao foco.
  function agendarReverificacao() {
    let ultimaCompleta = Date.now();
    let revisitando = false;
    const revisitar = async () => {
      if (revisitando || verificando || !tabelaRef) return;
      revisitando = true;
      ultimaVerificacao = Date.now();
      try {
        if (Date.now() - ultimaCompleta >= CONFERENCIA_COMPLETA_MS) {
          ultimaCompleta = Date.now();
          await sincronizarLista(tabelaRef, { completa: false });
        } else {
          await buscarNovos(tabelaRef);
        }
      } catch {}
      aplicarFiltros();
      // Quem já foi conferido vem da memória (30 min); só os novos vão ao Senha Simples.
      try { await classificarTodos(false); } finally { revisitando = false; }
    };
    setInterval(() => {
      if (!document.hidden && Date.now() - ultimaVerificacao >= REVERIFICAR_MS) revisitar();
    }, 5000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - ultimaVerificacao >= 10000) revisitar();
    });
  }

  // ---------------------------------------------------------------------------
  // Remover ausência
  //   - Ausente do ACOLHIMENTO: remove a ausência, devolve a MESMA senha para a fila do
  //     acolhimento (retornar + desvincular) e mostra o número ao profissional.
  //   - Ausente de outra fila: bloqueado nesta tela.
  // ---------------------------------------------------------------------------

  async function removerAusenciaNativa(href) {
    const csrfParam = document.querySelector('meta[name="csrf-param"]')?.content || 'authenticity_token';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';
    const corpo = new URLSearchParams({ _method: 'delete', [csrfParam]: csrfToken });
    const r = await fetch(href, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: corpo.toString(),
      redirect: 'follow'
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  }

  async function devolverSenha(cat, atendimentoId, tipo) {
    let ultimoErro;
    for (let i = 0; i < 2; i++) {
      try {
        const { data } = await senhaSimplesPutFilas(`${cat}/retornar_para_atendimento`, {
          atendimento_id: Number(atendimentoId), atendimento_type: tipo, categoria_id: cat
        });
        if (data && !data.confirmado_em) {
          // Solta a senha de quem chamou antes da ausência, para qualquer guichê poder chamar.
          try { await desvincularSenha(data, null); } catch (e) { console.warn('[OM30] desvincular após devolver:', e); }
          return data;
        }
        ultimoErro = new Error('a senha continuou concluída');
      } catch (e) {
        ultimoErro = e;
      }
      await new Promise(r => setTimeout(r, 800));
    }
    throw ultimoErro;
  }

  let removendo = false;

  document.addEventListener('click', async ev => {
    const a = ev.target.closest && ev.target.closest(SEL_REMOVER);
    if (!a) return;
    const tr = a.closest('tr');
    const origem = tr?.dataset.om30Origem;

    // Sem evento D1 confirmado, o script não escolhe uma fila: preserva a ação nativa.
    if (tr?.dataset.om30Fonte !== 'D1') return;
    if (origem && !['ACOLHIMENTO', 'MEDICO', 'EMERGENCIA', 'OUTROS'].includes(origem)) return;
    if (!origem) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      toast({ tipo: 'aviso', titulo: 'Aguarde a verificação', texto: 'Ainda estou conferindo onde este paciente foi ausentado.' });
      return;
    }

    const setor = tr.dataset.om30Setor || '';
    // Origem só deduzida (sem D1) e de outra fila: não bloqueia; remoção nativa, sem escolher fila.
    if (tr.dataset.om30Fonte !== 'D1' && !podeRemoverAqui(origem, setor)) return;
    if (!podeRemoverAqui(origem, setor)) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const b = textoBloqueio(origem, setor);
      dialogo({
        tipo: 'aviso',
        titulo: `Remoção bloqueada na ${nomeTela()}`.replace('na acolhimento', 'no acolhimento'),
        subtitulo: b.titulo,
        texto: b.paragrafos,
        botoes: [{ rotulo: 'Entendi', valor: true, primario: true }]
      });
      return;
    }

    if (!tr.dataset.om30Cat) return; // sem classificação: fluxo nativo
    if (aguardandoToken) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      toast({ tipo: 'aviso', titulo: 'Aguarde um instante', texto: 'Tente de novo em alguns segundos.' });
      return;
    }
    const destino = nomeFilaDestino(origem, setor);
    const ao = destino === 'acolhimento' ? 'ao acolhimento' : `à ${destino}`;
    const doDestino = destino === 'acolhimento' ? 'do acolhimento' : `da ${destino}`;

    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (removendo) return;

    const inf = infoLinha(tr);
    const registro = inf?.id ? { ...detalhes.get(inf.id) } : null;
    const categoriaDestino = tr.dataset.om30Cat;
    const nome = nomeDaLinha(tr);
    const ok = await dialogo({
      tipo: 'pergunta',
      titulo: `Devolver ${ao}?`,
      subtitulo: nome,
      senha: tr.dataset.om30Senha || '',
      senhaRotulo: 'Senha atual',
      texto: [`O paciente sai da lista de ausentes e volta para ${destino === 'acolhimento' ? 'a fila do acolhimento' : `a ${destino}`} com a mesma senha, livre para qualquer guichê chamar.`],
      botoes: [
        { rotulo: 'Cancelar', valor: false },
        { rotulo: 'Remover e devolver', valor: true, primario: true }
      ]
    });
    if (!ok || removendo) return;

    removendo = true;
    definirStatus('Conferindo devolução…');
    try {
      if (!await confirmarOrigemParaDevolver(inf, registro, origem) ||
          tr.dataset.om30Cat !== categoriaDestino || tr.dataset.om30Origem !== origem ||
          tr.dataset.om30Fonte !== 'D1') {
        toast({ tipo: 'aviso', titulo: 'Atualize a lista', texto: 'Não foi possível confirmar a devolução. Atualize a lista e tente novamente.' });
        void classificarTodos(true);
        return;
      }
      definirStatus('Removendo ausência…');
      try {
        await removerAusenciaNativa(a.href);
      } catch (e) {
        await dialogo({
          tipo: 'erro',
          titulo: 'Não foi possível remover a ausência',
          subtitulo: nome,
          texto: ['Nada foi alterado. Tente de novo em alguns segundos.', `Detalhe: ${descricaoErro(e)}`]
        });
        return;
      }

      definirStatus('Devolvendo senha…');
      try {
        const senha = await devolverSenha(categoriaDestino, inf.id, inf.tipo);
        try { localStorage.removeItem(SESSION_CACHE + inf.tipo + '#' + inf.id); } catch {}
        await dialogo({
          tipo: 'sucesso',
          titulo: `Paciente devolvido ${ao}`,
          subtitulo: nome,
          senha: senha.senha || tr.dataset.om30Senha || '—',
          senhaRotulo: 'Mesma senha do munícipe',
          texto: [
            `A senha do munícipe voltou para a fila ${doDestino} e já pode ser chamada em qualquer guichê.`,
            'Ele continua com a mesma senha que já tem; é só avisar que voltou para a fila e aguardar a chamada.'
          ]
        });
      } catch (e) {
        await dialogo({
          tipo: 'erro',
          titulo: 'A senha não voltou para a fila',
          subtitulo: nome,
          texto: [
            'A ausência foi removida, mas o Senha Simples não reativou a senha.',
            'O paciente não vai aparecer no "chamar próximo". Avise o suporte antes de chamá-lo.',
            `Detalhe: ${descricaoErro(e)}`
          ]
        });
      }
      location.reload();
    } finally {
      removendo = false;
      definirStatus('');
    }
  }, true);


  // ---------------------------------------------------------------------------
  // FILA PRINCIPAL DO ACOLHIMENTO ESTÁVEL
  // ---------------------------------------------------------------------------
  // O Saúde Simples atualiza automaticamente a fila do acolhimento e recria a
  // collection/tabela. Este bloco mantém a tela estável: desliga SOMENTE o
  // intervalo automático nativo e sincroniza /acolhimentos.json por trás,
  // preservando os mesmos objetos Vue de quem continua na fila.
  //
  // Não interfere:
  // - na captura/classificação CLOUD OM30 2;
  // - na lista de Ausentes;
  // - no clique manual "Atualizar lista";
  // - nos filtros nativos do Saúde Simples.

  const ACOLH_ESTAVEL_REFRESH_MS = 20000;
  const ACOLH_ESTAVEL_PER_PAGE = 5000;
  let acolhEstavelListVm = null;
  let acolhEstavelCollectionVm = null;
  let acolhEstavelAtualizando = false;
  let acolhEstavelTimer = null;
  let acolhEstavelAssinatura = '';
  let acolhEstavelObserver = null;
  let acolhEstavelBTable = null;
  let acolhEstavelOriginalFetch = null;
  let acolhEstavelCargaInicial = null;
  let acolhEstavelPronto = false;

  function ehTelaPrincipalAcolhimento() {
    return /^\/acolhimentos\/?$/i.test(location.pathname);
  }

  function chaveFilaAcolhimento(item) {
    if (!item || typeof item !== 'object') return '';
    if (item.atendimento_str) return String(item.atendimento_str);
    if (item.id != null) return 'id:' + String(item.id);

    const atendimentoId = item.atendimento_id ?? item.saude_atendimento_id ?? null;
    const atendimentoTipo = item.atendimento_type ?? item.saude_atendimento_type ?? '';
    if (atendimentoId != null) return 'at:' + String(atendimentoTipo) + ':' + String(atendimentoId);

    return [
      clean(item.codigo_cns),
      clean(item.senha),
      clean(item.data_senha_timestamp || item.data_senha_formatada),
      norm(item.nome_municipe)
    ].join('|');
  }

  function assinaturaFilaAcolhimento(lista) {
    return (Array.isArray(lista) ? lista : []).map(item => [
      chaveFilaAcolhimento(item),
      clean(item?.senha),
      clean(item?.chamada_em),
      clean(item?.confirmado_em),
      clean(item?.status || item?.nome_status),
      clean(item?.data_senha_timestamp || item?.data_senha_formatada)
    ].join('~')).join('||');
  }

  function acharListagemPrincipalAcolhimento() {
    if (!ehTelaPrincipalAcolhimento()) return null;

    const vms = [...document.querySelectorAll('*')]
      .map(el => el.__vue__)
      .filter(Boolean);

    // Caminho preferencial: componente específico da U/E.
    let lista = vms.find(vm =>
      norm(vm?.$options?.name) === 'URGENCIA-EMERGENCIA-LISTAGEM-FILA-ACOLHIMENTO' &&
      vm?.$refs?.collectionWithSearch
    );
    if (lista) return lista;

    // Fallback: sobe a partir da collection cuja fonte é /acolhimentos.
    const colecao = vms.find(vm => {
      if (norm(vm?.$options?.name) !== 'COLLECTION-WITH-SEARCH-ATENDIMENTO') return false;
      const fontes = [
        vm?.$props?.propsTable?.pathUrl,
        vm?.propsTable?.pathUrl,
        vm?.$parent?.sourceDataUrl,
        vm?.$parent?.$props?.sourceDataUrl
      ].filter(Boolean).map(String);
      return fontes.some(x => /\/acolhimentos(?:\.json)?(?:\?|$)/i.test(x));
    });

    if (!colecao) return null;
    let pai = colecao.$parent;
    for (let i = 0; pai && i < 8; i++, pai = pai.$parent) {
      if (norm(pai?.$options?.name) === 'URGENCIA-EMERGENCIA-LISTAGEM-FILA-ACOLHIMENTO') return pai;
    }
    return colecao.$parent || null;
  }

  function collectionPrincipalAcolhimento(listVm = acolhEstavelListVm) {
    const direta = listVm?.$refs?.collectionWithSearch;
    if (direta && Array.isArray(direta?.$data?.items)) return direta;

    const vms = [...document.querySelectorAll('*')]
      .map(el => el.__vue__)
      .filter(Boolean);

    return vms.find(vm => {
      if (norm(vm?.$options?.name) !== 'COLLECTION-WITH-SEARCH-ATENDIMENTO') return false;
      if (!Array.isArray(vm?.$data?.items)) return false;
      const fontes = [
        vm?.$props?.propsTable?.pathUrl,
        vm?.propsTable?.pathUrl,
        vm?.$parent?.sourceDataUrl,
        vm?.$parent?.$props?.sourceDataUrl
      ].filter(Boolean).map(String);
      return fontes.some(x => /\/acolhimentos(?:\.json)?(?:\?|$)/i.test(x));
    }) || null;
  }


  function campoPesquisaFilaAcolhimento(listVm = acolhEstavelListVm, collection = acolhEstavelCollectionVm) {
    const candidatos = [];

    // Caminho mais confiável: o próprio componente do acolhimento expõe o filtro
    // do munícipe por ref. Procuramos primeiro dentro dele.
    const filtro = listVm?.$refs?.filtroMunicipe;
    const raizFiltro = filtro?.$el || (filtro instanceof Element ? filtro : null);
    if (raizFiltro?.querySelectorAll) {
      candidatos.push(...raizFiltro.querySelectorAll('input[type="search"],input[type="text"],input:not([type])'));
    }

    // Fallback visual, para instalações em que o ref não está exposto.
    if (!candidatos.length) {
      const raizFila = collection?.$el || listVm?.$el || document.querySelector('#classificacao');
      const rectFila = raizFila?.getBoundingClientRect?.() || null;

      for (const input of document.querySelectorAll('input[type="search"],input[type="text"],input:not([type])')) {
        if (input.disabled || input.readOnly) continue;
        if (input.closest('#' + BAR_ID + ', .dropdown-menu, table, #' + MODAL_ID)) continue;

        const meta = norm([
          input.placeholder,
          input.name,
          input.id,
          input.className,
          input.getAttribute('aria-label'),
          input.getAttribute('data-original-title')
        ].filter(Boolean).join(' '));

        let pontos = 0;
        if (/PESQUIS|BUSC|SEARCH/.test(meta)) pontos += 60;
        if (/NOME|PACIENTE|MUNICIPE|CNS/.test(meta)) pontos += 35;
        if (String(input.type || '').toLowerCase() === 'search') pontos += 15;

        const bloco = input.closest('form,.form-group,.row,.card,.panel,div');
        const contexto = norm(bloco?.innerText || bloco?.textContent || '');
        if (/PESQUIS|BUSC|NOME|PACIENTE|MUNICIPE/.test(contexto)) pontos += 20;
        if (/LIMPAR/.test(contexto)) pontos += 15;

        const r = input.getBoundingClientRect?.();
        if (r && rectFila) {
          const distancia = rectFila.top - r.bottom;
          if (distancia >= -80 && distancia <= 500) pontos += 35;
        }

        if (pontos >= 45) candidatos.push({ input, pontos });
      }

      if (candidatos.length && candidatos[0]?.input) {
        candidatos.sort((a,b) => b.pontos - a.pontos);
        return candidatos[0].input;
      }
    }

    const simples = candidatos
      .filter(el => el instanceof HTMLInputElement && !el.disabled && !el.readOnly)
      .filter(el => !el.closest('#' + BAR_ID));

    if (!simples.length) return null;

    // Se houver mais de um campo no filtro do munícipe, prefere o que menciona nome/pesquisa
    // e, em seguida, o que estiver preenchido.
    simples.sort((a,b) => {
      const score = el => {
        const meta = norm([el.placeholder, el.name, el.id, el.className, el.getAttribute('aria-label')].filter(Boolean).join(' '));
        let p = 0;
        if (/NOME|PACIENTE|MUNICIPE/.test(meta)) p += 30;
        if (/PESQUIS|BUSC|SEARCH/.test(meta)) p += 30;
        if (clean(el.value)) p += 20;
        return p;
      };
      return score(b) - score(a);
    });

    return simples[0] || null;
  }

  function pesquisaFilaAcolhimentoAtiva(listVm = acolhEstavelListVm, collection = acolhEstavelCollectionVm) {
    const campo = campoPesquisaFilaAcolhimento(listVm, collection);
    return !!clean(campo?.value);
  }


  function tabelaDomFilaAcolhimento() {
    const raizes = [
      document.querySelector('#classificacao'),
      acolhEstavelCollectionVm?.$el,
      acolhEstavelListVm?.$el
    ].filter(Boolean);

    for (const raiz of raizes) {
      const tabelas = [...raiz.querySelectorAll('table')];
      const achou = tabelas.find(table => {
        const hs = [...table.querySelectorAll('thead th')].map(th => norm(th.innerText || th.textContent));
        return hs.length >= 7 &&
          hs.some(x => x === 'SENHA') &&
          hs.some(x => x === 'IDADE') &&
          (hs.some(x => /DATA.*HORA|CHEGADA/.test(x)) || hs[0]?.includes('DATA'));
      });
      if (achou) return achou;
    }
    return null;
  }

  function tabelaVueFilaAcolhimento() {
    const dom = tabelaDomFilaAcolhimento();
    const candidatos = [...document.querySelectorAll('*')]
      .map(el => el.__vue__)
      .filter(Boolean);

    let tabela = candidatos.find(vm =>
      vm?.$options?.name === 'BTable' &&
      Array.isArray(vm?.items) &&
      (!dom || vm.$el === dom || vm.$el?.contains?.(dom) || dom.contains?.(vm.$el))
    );

    if (!tabela) {
      tabela = candidatos.find(vm =>
        vm?.$options?.name === 'BTable' &&
        Array.isArray(vm?.items) &&
        (vm.fields || []).some?.(f => ['senha','idade','nome_municipe','codigo_cns'].includes(String(f?.key || '').toLowerCase()))
      );
    }

    acolhEstavelBTable = tabela || null;
    return acolhEstavelBTable;
  }

  function prepararBTableFilaAcolhimento(total = null) {
    const tabela = acolhEstavelBTable || tabelaVueFilaAcolhimento();
    if (!tabela) return null;

    let mudouPerPage = false;
    try {
      if (Number(tabela.perPage) !== 0) {
        if (tabela._props) tabela._props.perPage = 0;
        else tabela.perPage = 0;
        mudouPerPage = true;
      }
    } catch {}
    try {
      if (Number(tabela.currentPage) !== 1) {
        if (tabela._props) tabela._props.currentPage = 1;
        else tabela.currentPage = 1;
      }
    } catch {}

    if (total != null) {
      try { tabela.totalRows = Number(total) || 0; } catch {}
    }

    // Só força uma vez, quando o BTable sai de 10 para 0.
    if (mudouPerPage) {
      try { tabela.$forceUpdate?.(); } catch {}
    }
    return tabela;
  }

  function itensRenderizadosFilaAcolhimento(collection = acolhEstavelCollectionVm) {
    const tabela = acolhEstavelBTable || tabelaVueFilaAcolhimento();
    if (Array.isArray(tabela?.items)) return tabela.items;
    if (Array.isArray(collection?.$data?.items)) return collection.$data.items;
    return [];
  }

  function substituirItensFilaAcolhimento(collection, lista) {
    const novos = Array.isArray(lista) ? lista : [];
    const tabela = prepararBTableFilaAcolhimento(novos.length);
    const arrCollection = collection?.$data?.items;
    const arrTabela = tabela?.items;

    // O BTable é quem realmente desenha a fila. Mantemos os dois arrays alinhados
    // caso o BootstrapVue não esteja usando a mesma referência do componente pai.
    if (Array.isArray(arrTabela)) {
      arrTabela.splice(0, arrTabela.length, ...novos);
    }
    if (Array.isArray(arrCollection) && arrCollection !== arrTabela) {
      arrCollection.splice(0, arrCollection.length, ...novos);
    }

    try { collection.totalRows = novos.length; } catch {}
    try {
      if (collection?.$data && 'totalRows' in collection.$data) collection.$data.totalRows = novos.length;
    } catch {}
    try { collection.isLoading = false; } catch {}
    try { collection.preparingLoading = false; } catch {}
    if (collection?.errorRequest == null) {
      try { collection.errorRequest = {}; } catch {}
    }

    if (typeof tabela?.$nextTick === 'function') {
      tabela.$nextTick(() => requestAnimationFrame(() => decorarFilaPrincipalAcolhimento(collection)));
    } else {
      requestAnimationFrame(() => decorarFilaPrincipalAcolhimento(collection));
    }
    return true;
  }

  function pontuarUrlFilaAcolhimento(urlOriginal) {
    try {
      const u = new URL(urlOriginal, location.origin);
      if (!/\/acolhimentos\.json$/i.test(u.pathname)) return -1;

      let pontos = 1;
      if (u.searchParams.toString()) pontos += 2;
      if (u.searchParams.has('ocupacoes_ids[]') || u.searchParams.has('ocupacoes_ids')) pontos += 4;
      if (u.searchParams.has('status')) pontos += 2;
      if (u.searchParams.has('sortable')) pontos += 1;
      return pontos;
    } catch {
      return -1;
    }
  }

  function descobrirUrlFilaAcolhimento(listVm = acolhEstavelListVm, collection = acolhEstavelCollectionVm) {
    const candidatos = [];

    // Usa a URL REAL que o próprio Saúde Simples já utilizou. Assim acompanha
    // unidade, ocupação e filtros sem inventar parâmetros.
    try {
      for (const entrada of performance.getEntriesByType('resource')) {
        if (/\/acolhimentos\.json(?:\?|$)/i.test(entrada.name)) candidatos.push(entrada.name);
      }
    } catch {}

    candidatos.push(
      collection?.$props?.propsTable?.pathUrl,
      collection?.propsTable?.pathUrl,
      listVm?.sourceDataUrl,
      listVm?.$props?.sourceDataUrl
    );

    let melhor = null;
    let melhorPontos = -1;
    for (const candidato of candidatos.filter(Boolean)) {
      const pontos = pontuarUrlFilaAcolhimento(candidato);
      if (pontos < 0) continue;
      // Empate = fica com a URL mais recente observada.
      if (pontos >= melhorPontos) {
        try {
          melhor = new URL(candidato, location.origin).href;
          melhorPontos = pontos;
        } catch {}
      }
    }
    return melhor;
  }

  function normalizarUrlFilaAcolhimento(urlOriginal) {
    const u = new URL(urlOriginal, location.origin);
    u.searchParams.delete('page');
    u.searchParams.delete('per_page');
    return u;
  }

  async function buscarPaginaFilaAcolhimento(urlBase, pagina) {
    const u = new URL(urlBase.href);
    u.searchParams.set('page', String(pagina));
    u.searchParams.set('per_page', '100');

    const resp = await fetch(u.href, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json, text/plain, */*' },
      cache: 'no-store'
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ao atualizar fila do acolhimento');

    const dados = await resp.json();
    if (!Array.isArray(dados)) throw new Error('Resposta de /acolhimentos.json não é uma lista.');
    return dados;
  }

  async function carregarFilaAcolhimentoSilenciosa(listVm = acolhEstavelListVm, collection = acolhEstavelCollectionVm) {
    const descoberta = descobrirUrlFilaAcolhimento(listVm, collection);
    if (!descoberta) throw new Error('Fonte nativa /acolhimentos.json ainda não identificada.');

    const urlBase = normalizarUrlFilaAcolhimento(descoberta);
    const todos = [];
    const vistos = new Set();

    const adicionar = lote => {
      let novos = 0;
      for (const item of lote || []) {
        const chave = chaveFilaAcolhimento(item);
        if (!chave || vistos.has(chave)) continue;
        vistos.add(chave);
        todos.push(item);
        novos++;
      }
      return novos;
    };

    // Primeiro descobre como esse backend pagina.
    const primeira = await buscarPaginaFilaAcolhimento(urlBase, 1);
    if (!primeira.length) return todos;
    adicionar(primeira);

    // Se aceitou per_page=100 e veio menos de 100 (mas mais de 10), acabou.
    if (primeira.length > 10 && primeira.length < 100) return todos;
    // Página curta também significa fim.
    if (primeira.length < 10) return todos;

    // Backend limitado a 10 (ou fila >100): busca as próximas em blocos paralelos.
    const LOTE_PAGINAS = 5;
    for (let inicio = 2; inicio <= 50; inicio += LOTE_PAGINAS) {
      const nums = [];
      for (let p = inicio; p < inicio + LOTE_PAGINAS && p <= 50; p++) nums.push(p);

      const paginas = await Promise.all(
        nums.map(p => buscarPaginaFilaAcolhimento(urlBase, p).catch(() => null))
      );

      let encerrar = false;
      let teveNovo = false;

      for (const lote of paginas) {
        if (!Array.isArray(lote) || !lote.length) {
          encerrar = true;
          continue;
        }
        if (adicionar(lote)) teveNovo = true;

        if (lote.length > 10 && lote.length < 100) encerrar = true;
        if (lote.length < 10) encerrar = true;
      }

      if (!teveNovo || encerrar) break;
    }

    return todos;
  }

  function atualizarObjetoFilaAcolhimento(destino, origem) {
    if (!destino || !origem || destino === origem) return destino;
    for (const [k, v] of Object.entries(origem)) {
      if (destino[k] !== v) {
        try { destino[k] = v; } catch {}
      }
    }
    return destino;
  }

  function reconciliarFilaAcolhimento(collection, desejados) {
    const atual = collection?.$data?.items;
    if (!Array.isArray(atual) || !Array.isArray(desejados)) return false;

    let estrutural = false;
    const chavesDesejadas = new Set(desejados.map(chaveFilaAcolhimento));

    // 1) Tira somente quem realmente saiu da fila.
    for (let i = atual.length - 1; i >= 0; i--) {
      if (!chavesDesejadas.has(chaveFilaAcolhimento(atual[i]))) {
        atual.splice(i, 1);
        estrutural = true;
      }
    }

    // 2) Mantém a referência dos itens existentes. Insere/move somente o necessário.
    for (let alvo = 0; alvo < desejados.length; alvo++) {
      const novo = desejados[alvo];
      const chave = chaveFilaAcolhimento(novo);

      if (chaveFilaAcolhimento(atual[alvo]) === chave) {
        atualizarObjetoFilaAcolhimento(atual[alvo], novo);
        continue;
      }

      const existente = atual.findIndex((it, idx) => idx > alvo && chaveFilaAcolhimento(it) === chave);
      if (existente >= 0) {
        const mesmoObjeto = atual.splice(existente, 1)[0];
        atualizarObjetoFilaAcolhimento(mesmoObjeto, novo);
        atual.splice(alvo, 0, mesmoObjeto);
      } else {
        atual.splice(alvo, 0, novo);
      }
      estrutural = true;
    }

    if (atual.length > desejados.length) {
      atual.splice(desejados.length, atual.length - desejados.length);
      estrutural = true;
    }

    return estrutural;
  }

  function prepararCollectionFilaAcolhimento(collection, { inicial = false } = {}) {
    if (!collection) return;
    // 100 foi o valor já validado no mesmo collection-with-search da fila médica.
    // Depois da primeira carga mantemos 5000 para impedir qualquer retorno a 10.
    const porPagina = inicial ? 100 : ACOLH_ESTAVEL_PER_PAGE;
    try { collection.customPerPage = porPagina; } catch {}
    try { collection.currentPage = 1; } catch {}
    if (collection.$data) {
      try {
        if ('customPerPage' in collection.$data) collection.$data.customPerPage = porPagina;
        if ('currentPage' in collection.$data) collection.$data.currentPage = 1;
      } catch {}
    }
    prepararBTableFilaAcolhimento(collection.totalRows || collection.$data?.totalRows || null);
  }

  function timestampFilaAcolhimento(item) {
    const candidatos = [
      item?.data_senha_timestamp,
      item?.data_hora_chegada,
      item?.data_chegada,
      item?.created_at,
      item?.data_senha_formatada
    ];

    for (const bruto of candidatos) {
      if (bruto == null || bruto === '') continue;

      if (typeof bruto === 'number' && Number.isFinite(bruto)) {
        if (bruto > 1e12) return bruto;
        if (bruto > 1e9) return bruto * 1000;
      }

      const txt = clean(bruto);
      if (/^\d{13}$/.test(txt)) return Number(txt);
      if (/^\d{10}$/.test(txt)) return Number(txt) * 1000;

      let m = txt.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), 0).getTime();

      m = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0), 0).getTime();

      const parsed = Date.parse(txt);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function tempoEsperaAcolhimentoMs(item, agora = Date.now()) {
    const inicio = timestampFilaAcolhimento(item);
    return inicio > 0 ? Math.max(0, agora - inicio) : 0;
  }

  function formatarEsperaAcolhimento(ms) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 60000));
    if (total < 60) return total + ' min';
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? h + 'h ' + m + 'min' : h + 'h';
  }

  function idadeVisualAcolhimento(item, celula) {
    const bruto = clean(item?.idade_municipe || celula?.textContent || '');
    if (!bruto) return '—';
    if (/^\d+$/.test(bruto)) return bruto + (Number(bruto) === 1 ? ' ano' : ' anos');
    return bruto
      .replace(/\banos?\b/gi, m => m.toLowerCase())
      .replace(/\bmeses?\b/gi, m => m.toLowerCase());
  }

  function linhasFilaPrincipalAcolhimento(collection = acolhEstavelCollectionVm) {
    const raiz = collection?.$el || acolhEstavelListVm?.$el || document;
    return [...raiz.querySelectorAll('tbody tr.collection-row, tbody tr')]
      .filter(tr => tr.cells?.length >= 7);
  }

  function decorarLinhaFilaAcolhimento(tr, item) {
    if (!tr || !item) return;

    const chegada = tr.cells?.[0];
    if (chegada) {
      let espera = chegada.querySelector('.om30-acolh-espera');
      if (!espera) {
        espera = document.createElement('div');
        espera.className = 'om30-acolh-espera';
        chegada.appendChild(espera);
      }
      espera.innerHTML =
        '<span class="om30-acolh-clock">🕒</span><span>Espera</span> <strong>' +
        formatarEsperaAcolhimento(tempoEsperaAcolhimentoMs(item)) + '</strong>';
    }

    const idade = tr.cells?.[5];
    if (idade) {
      let pill = idade.querySelector('.om30-acolh-idade');
      if (!pill) {
        const textoOriginal = clean(idade.textContent);
        idade.dataset.om30IdadeOriginal = textoOriginal;
        idade.textContent = '';
        pill = document.createElement('span');
        pill.className = 'om30-acolh-idade';
        idade.appendChild(pill);
      }
      pill.textContent = idadeVisualAcolhimento(item, { textContent: idade.dataset.om30IdadeOriginal || '' });
    }
  }

  function atualizarCabecalhosFilaAcolhimento(collection = acolhEstavelCollectionVm) {
    const raiz = collection?.$el || acolhEstavelListVm?.$el || document;
    const tabela = raiz.querySelector('table');
    if (!tabela) return;

    const ths = tabela.querySelectorAll('thead th');
    if (ths[0] && !ths[0].dataset.om30AcolhCabecalho) {
      ths[0].dataset.om30AcolhCabecalho = '1';
      ths[0].innerHTML = 'Data/Hora da<br>chegada <span class="om30-acolh-th-espera">+ espera</span>';
    }
    if (ths[5]) ths[5].textContent = 'Idade';
  }

  // ---- Filtro da fila do acolhimento (Emergência / Preferencial / Retorno / Dentista) ----
  // Mesmo padrão da fila médica: card com quantidade + tempo médio; clicar filtra.
  const STORAGE_FILTRO_FILA_ACOLH = `${PREFIX}:filtro-fila-acolhimento`;
  const FILTROS_FILA_ACOLH = [
    { key: 'TODOS',        label: 'Na fila',      cor: '#6c757d' },
    { key: 'EMERGENCIA',   label: 'Emergência',   cor: '#dc3545' },
    { key: 'PREFERENCIAL', label: 'Preferencial', cor: '#fd7e14' },
    { key: 'RETORNO',      label: 'Retorno',      cor: '#6f42c1' },
    { key: 'DENTISTA',     label: 'Dentista',     cor: '#0aa2c0' }
  ];
  const FILTROS_FILA_ACOLH_VALIDOS = new Set(FILTROS_FILA_ACOLH.map(f => f.key));
  let filtroFilaAcolh = localStorage.getItem(STORAGE_FILTRO_FILA_ACOLH) || 'TODOS';
  if (!FILTROS_FILA_ACOLH_VALIDOS.has(filtroFilaAcolh)) filtroFilaAcolh = 'TODOS';

  // Regra da operação: o grupo vem do prefixo da senha (RT retorno, PF preferencial, DT dentista).
  const PREFIXO_SENHA_FILA_ACOLH = {
    EMERGENCIA: /^EM\d/,
    RETORNO: /^RT\d/,
    PREFERENCIAL: /^PF\d/,
    DENTISTA: /^DT\d/
  };

  function itemAcolhEh(item, grupo) {
    const rx = PREFIXO_SENHA_FILA_ACOLH[grupo];
    return rx ? rx.test(norm(item?.senha)) : true;
  }

  function mediaEsperaAcolh(itens, agora) {
    if (!itens.length) return 0;
    return itens.reduce((acc, x) => acc + tempoEsperaAcolhimentoMs(x, agora), 0) / itens.length;
  }

  function aplicarFiltroFilaAcolhimento(collection = acolhEstavelCollectionVm) {
    if (!collection) return;
    for (const tr of linhasFilaPrincipalAcolhimento(collection)) {
      // Sem item Vue, a senha da própria linha ainda permite filtrar retorno/prefixos.
      const item = itemFilaAcolhimentoDaLinha(tr) ||
        { senha: clean(tr.cells?.[6]?.innerText || tr.cells?.[6]?.textContent) };
      const mostrar = filtroFilaAcolh === 'TODOS' || itemAcolhEh(item, filtroFilaAcolh);
      tr.classList.toggle('om30-acolh-fora-filtro', !mostrar);
    }
  }

  function atualizarResumoFilaAcolhimento(collection = acolhEstavelCollectionVm) {
    if (!collection) return;
    const itens = Array.isArray(collection?.$data?.items) ? collection.$data.items : [];
    const agora = Date.now();

    let bar = document.getElementById('om30-acolh-resumo');
    if (!bar) {
      const host = acolhEstavelListVm?.$el?.parentNode || collection.$el?.parentNode;
      const ref = acolhEstavelListVm?.$el || collection.$el;
      if (!host || !ref) return;

      bar = document.createElement('div');
      bar.id = 'om30-acolh-resumo';
      bar.innerHTML = FILTROS_FILA_ACOLH.map(f =>
        `<button type="button" class="om30-acolh-card om30-acolh-filtro" data-filtro="${f.key}" style="--c:${f.cor}">` +
          `<span class="om30-acolh-rotulo"><i class="om30-acolh-dot"></i>${f.label}</span>` +
          '<strong class="om30-acolh-qtd">0</strong>' +
          '<em class="om30-acolh-media">Sem pacientes</em>' +
        '</button>'
      ).join('') +
        '<div class="om30-acolh-card om30-acolh-horario"><span>Horário</span><strong class="om30-acolh-agora">--:--</strong></div>';
      bar.querySelectorAll('.om30-acolh-filtro').forEach(card => {
        card.addEventListener('click', () => {
          const key = card.dataset.filtro;
          // Clicar de novo no filtro ativo volta para Todos.
          filtroFilaAcolh = key === filtroFilaAcolh ? 'TODOS' : key;
          try { localStorage.setItem(STORAGE_FILTRO_FILA_ACOLH, filtroFilaAcolh); } catch {}
          aplicarFiltroFilaAcolhimento(acolhEstavelCollectionVm);
          atualizarResumoFilaAcolhimento(acolhEstavelCollectionVm);
        });
      });
      host.insertBefore(bar, ref);
    }

    for (const f of FILTROS_FILA_ACOLH) {
      const card = bar.querySelector(`.om30-acolh-filtro[data-filtro="${f.key}"]`);
      if (!card) continue;
      const grupo = f.key === 'TODOS' ? itens : itens.filter(item => itemAcolhEh(item, f.key));
      card.classList.toggle('ativo', f.key === filtroFilaAcolh);
      card.querySelector('.om30-acolh-qtd').textContent = String(grupo.length);
      const media = card.querySelector('.om30-acolh-media');
      if (grupo.length) media.innerHTML = `Tempo médio <b>${formatarEsperaAcolhimento(mediaEsperaAcolh(grupo, agora))}</b>`;
      else media.textContent = 'Sem pacientes';
    }
    bar.querySelector('.om30-acolh-agora').textContent = horarioCurtoAgora();
  }

  function decorarFilaPrincipalAcolhimento(collection = acolhEstavelCollectionVm) {
    if (!collection) return;
    atualizarCabecalhosFilaAcolhimento(collection);
    for (const tr of linhasFilaPrincipalAcolhimento(collection)) {
      const item = itemFilaAcolhimentoDaLinha(tr);
      if (item) decorarLinhaFilaAcolhimento(tr, item);
    }
    aplicarFiltroFilaAcolhimento(collection);
    atualizarResumoFilaAcolhimento(collection);
  }

  function atualizarRelogiosFilaAcolhimento() {
    const collection = acolhEstavelCollectionVm;
    if (!collection) return;
    for (const tr of linhasFilaPrincipalAcolhimento(collection)) {
      const item = itemFilaAcolhimentoDaLinha(tr);
      const forte = tr.querySelector('.om30-acolh-espera strong');
      if (item && forte) forte.textContent = formatarEsperaAcolhimento(tempoEsperaAcolhimentoMs(item));
    }
    atualizarResumoFilaAcolhimento(collection);
  }

  function esconderPaginacaoFilaAcolhimento() {
    if (document.getElementById('om30-acolhimento-estavel-css')) return;
    const style = document.createElement('style');
    style.id = 'om30-acolhimento-estavel-css';
    style.textContent = [
      '#classificacao .collection-with-search-atendimento ul.pagination,.listagem-fila .collection-with-search-atendimento ul.pagination{display:none!important;}',
      '#om30-acolh-resumo{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap;margin:8px 0 10px;font-family:Arial,Helvetica,sans-serif;}',
      '#om30-acolh-resumo .om30-acolh-card{min-width:130px;padding:7px 11px;border:1px solid #d8dfe5;border-radius:8px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04);display:flex;align-items:center;justify-content:space-between;gap:12px;}',
      '#om30-acolh-resumo .om30-acolh-card span{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.35px;color:#7a8590;}',
      '#om30-acolh-resumo .om30-acolh-card strong{font-size:15px;font-weight:800;color:#35404a;font-variant-numeric:tabular-nums;}',
      '#om30-acolh-resumo .om30-acolh-filtro{position:relative;display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 12px;min-width:150px;text-align:left;cursor:pointer;font-family:inherit;border-left:4px solid var(--c);}',
      '#om30-acolh-resumo .om30-acolh-filtro:hover{background:#f7f9fb;}',
      '#om30-acolh-resumo .om30-acolh-filtro.ativo{background:#f7f9fb;border-color:var(--c);box-shadow:0 0 0 2px color-mix(in srgb,var(--c) 22%,transparent);}',
      '#om30-acolh-resumo .om30-acolh-rotulo{display:inline-flex;align-items:center;gap:6px;}',
      '#om30-acolh-resumo .om30-acolh-dot{width:8px;height:8px;border-radius:50%;background:var(--c);display:inline-block;}',
      '#om30-acolh-resumo .om30-acolh-filtro .om30-acolh-qtd{font-size:17px;}',
      '#om30-acolh-resumo .om30-acolh-media{grid-column:1 / -1;font-style:normal;font-size:10px;color:#7a8590;white-space:nowrap;}',
      '#om30-acolh-resumo .om30-acolh-media b{color:#35404a;font-weight:800;}',
      // Sem depender de wrapper: na unidade do PS a tabela não fica dentro de .collection-with-search-atendimento.
      'tr.om30-acolh-fora-filtro{display:none!important;}',
      '#om30-acolh-resumo .om30-acolh-horario{margin-left:auto;}',
      '#om30-acolh-resumo .om30-acolh-horario strong{font-size:18px;}',
      '.collection-with-search-atendimento .om30-acolh-th-espera{display:block;margin-top:2px;font-size:8px;font-weight:700;color:#8a949c;text-transform:none;white-space:nowrap;}',
      '.collection-with-search-atendimento .om30-acolh-espera{display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:2px 7px;border-radius:10px;background:#eef1f3;color:#68727b;font-size:9px;line-height:1.25;white-space:nowrap;}',
      '.collection-with-search-atendimento .om30-acolh-espera strong{color:#303941;font-size:9.5px;font-weight:800;}',
      '.collection-with-search-atendimento .om30-acolh-clock{font-size:11px;line-height:1;}',
      '.collection-with-search-atendimento .om30-acolh-idade{display:inline-flex;align-items:center;justify-content:center;min-width:48px;padding:3px 7px;border:1px solid #d8dfe5;border-radius:10px;background:#f7f9fb;color:#46515a;font-size:10px;font-weight:800;white-space:nowrap;}',
      '.collection-with-search-atendimento tbody td{vertical-align:middle!important;}',
      '.collection-with-search-atendimento tbody td:nth-child(3),.collection-with-search-atendimento tbody td:nth-child(4){white-space:normal!important;overflow-wrap:anywhere!important;}',
      '.collection-with-search-atendimento tbody td:last-child{min-width:72px;overflow:visible!important;}',
      '.collection-with-search-atendimento tbody tr:hover td{background-color:#f7f9fb!important;}',
      '.collection-with-search-atendimento .dropdown-menu{z-index:3000!important;}',
      '@media(max-width:1100px){#om30-acolh-resumo .om30-acolh-horario{margin-left:0;}}'
    ].join('');
    document.head.appendChild(style);
  }


  async function carregarInicialFilaAcolhimento(listVm, collection) {
    if (acolhEstavelCargaInicial) return acolhEstavelCargaInicial;

    const promessa = (async () => {
      acolhEstavelListVm = listVm;
      acolhEstavelCollectionVm = collection;
      acolhEstavelOriginalFetch =
        collection.fetchCollection?.__om30Original ||
        acolhEstavelOriginalFetch ||
        collection.fetchCollection;

      // Igual à fila médica: configura ANTES de chamar o fetch nativo.
      prepararCollectionFilaAcolhimento(collection, { inicial:true });
      prepararBTableFilaAcolhimento();

      const jaTem = itensRenderizadosFilaAcolhimento(collection).length > 0;
      try { collection.isLoading = !jaTem; } catch {}

      if (typeof acolhEstavelOriginalFetch === 'function') {
        await Promise.resolve(acolhEstavelOriginalFetch.call(collection));
        await new Promise(resolve =>
          collection.$nextTick ? collection.$nextTick(resolve) : setTimeout(resolve, 0)
        );
      }

      prepararBTableFilaAcolhimento();

      let todos = [...itensRenderizadosFilaAcolhimento(collection)];
      const total = Number(collection.totalRows || collection.$data?.totalRows || 0);

      // Normalmente o fetch nativo, já com customPerPage=100, resolve tudo em uma
      // requisição. Só cai no paginador direto se o backend realmente limitar.
      if (
        (total > 0 && total > todos.length) ||
        todos.length === 10 ||
        (!todos.length && descobrirUrlFilaAcolhimento(listVm, collection))
      ) {
        const completos = await carregarFilaAcolhimentoSilenciosa(listVm, collection);
        if (Array.isArray(completos) && completos.length >= todos.length) todos = completos;
      }

      substituirItensFilaAcolhimento(collection, todos);
      prepararCollectionFilaAcolhimento(collection, { inicial:false });
      acolhEstavelAssinatura = assinaturaFilaAcolhimento(todos);
      acolhEstavelPronto = true;
      return true;
    })();

    acolhEstavelCargaInicial = promessa;
    try {
      return await promessa;
    } finally {
      acolhEstavelCargaInicial = null;
    }
  }

  async function atualizarFilaAcolhimentoSilenciosa({ forcar = false } = {}) {
    if (!ehTelaPrincipalAcolhimento() || document.hidden || acolhEstavelAtualizando) return false;

    const listVm = acharListagemPrincipalAcolhimento();
    const collection = collectionPrincipalAcolhimento(listVm);
    if (!listVm || !collection) return false;

    // Enquanto a pesquisa nativa estiver preenchida, NÃO substitui a coleção.
    // Isso vale inclusive para refresh forçado por pageshow/volta de aba.
    if (pesquisaFilaAcolhimentoAtiva(listVm, collection)) {
      pararRefreshNativoFilaAcolhimento(listVm);
      decorarFilaPrincipalAcolhimento(collection);
      return false;
    }

    acolhEstavelListVm = listVm;
    acolhEstavelCollectionVm = collection;
    prepararCollectionFilaAcolhimento(collection, { inicial:false });
    prepararBTableFilaAcolhimento();
    pararRefreshNativoFilaAcolhimento(listVm);

    // Se ainda não fizemos a primeira carga completa, não começa uma segunda leitura
    // concorrente. A inicial já vai devolver a fila inteira.
    if (!acolhEstavelPronto && acolhEstavelCargaInicial) return acolhEstavelCargaInicial;

    acolhEstavelAtualizando = true;
    try {
      const todos = await carregarFilaAcolhimentoSilenciosa(listVm, collection);
      const assinatura = assinaturaFilaAcolhimento(todos);

      if (!forcar && assinatura === acolhEstavelAssinatura) {
        // Nada entrou/saiu: atualiza os mesmos objetos sem reconstruir linha nenhuma.
        const mapa = new Map(itensRenderizadosFilaAcolhimento(collection).map(item => [chaveFilaAcolhimento(item), item]));
        for (const novo of todos) {
          const existente = mapa.get(chaveFilaAcolhimento(novo));
          if (existente) atualizarObjetoFilaAcolhimento(existente, novo);
        }
        try { collection.isLoading = false; } catch {}
        decorarFilaPrincipalAcolhimento(collection);
        return true;
      }

      acolhEstavelAssinatura = assinatura;

      const renderizados = itensRenderizadosFilaAcolhimento(collection);
      if (Array.isArray(renderizados)) {
        reconciliarFilaAcolhimento({ $data:{ items:renderizados } }, todos);
        const pai = collection.$data?.items;
        if (Array.isArray(pai) && pai !== renderizados) {
          pai.splice(0, pai.length, ...renderizados);
        }
      } else {
        substituirItensFilaAcolhimento(collection, todos);
      }

      prepararBTableFilaAcolhimento(todos.length);
      try { collection.totalRows = todos.length; } catch {}
      try {
        if (collection.$data && 'totalRows' in collection.$data) collection.$data.totalRows = todos.length;
      } catch {}
      try { collection.isLoading = false; } catch {}

      const apos = () => decorarFilaPrincipalAcolhimento(collection);
      const tabela = acolhEstavelBTable || tabelaVueFilaAcolhimento();
      if (typeof tabela?.$nextTick === 'function') tabela.$nextTick(() => requestAnimationFrame(apos));
      else requestAnimationFrame(apos);
      return true;
    } catch (e) {
      console.warn('[OM30 Acolhimento Estável]', e);
      try { collection.isLoading = false; } catch {}
      return false;
    } finally {
      acolhEstavelAtualizando = false;
    }
  }

  function pararRefreshNativoFilaAcolhimento(listVm = acolhEstavelListVm) {
    // intervalId pertence ao próprio urgencia-emergencia-listagem-fila-acolhimento.
    if (listVm?.intervalId) {
      try { clearInterval(listVm.intervalId); } catch {}
      try { listVm.intervalId = null; } catch {}
    }
  }

  function conectarFilaAcolhimentoEstavel() {
    if (!ehTelaPrincipalAcolhimento()) return false;

    const listVm = acharListagemPrincipalAcolhimento();
    const collection = collectionPrincipalAcolhimento(listVm);
    if (!listVm || !collection) return false;

    const mudouComponente = listVm !== acolhEstavelListVm || collection !== acolhEstavelCollectionVm;
    acolhEstavelListVm = listVm;
    acolhEstavelCollectionVm = collection;

    pararRefreshNativoFilaAcolhimento(listVm);
    esconderPaginacaoFilaAcolhimento();

    if (mudouComponente) {
      acolhEstavelPronto = false;
      acolhEstavelBTable = null;
      acolhEstavelOriginalFetch = collection.fetchCollection?.__om30Original || collection.fetchCollection;
    }

    prepararCollectionFilaAcolhimento(collection, { inicial:!acolhEstavelPronto });
    prepararBTableFilaAcolhimento();

    if (!acolhEstavelPronto && !pesquisaFilaAcolhimentoAtiva(listVm, collection)) {
      carregarInicialFilaAcolhimento(listVm, collection).catch(e => {
        console.warn('[OM30 Acolhimento Estável] primeira carga:', e);
        try { collection.isLoading = false; } catch {}
      });
    } else {
      decorarFilaPrincipalAcolhimento(collection);
    }
    return true;
  }

  function iniciarFilaAcolhimentoEstavel() {
    if (!ehTelaPrincipalAcolhimento()) return;

    if (!window.__OM30_ACOLH_PESQUISA_PROTEGIDA__) {
      window.__OM30_ACOLH_PESQUISA_PROTEGIDA__ = true;
      const tratarPesquisa = ev => {
        const campo = campoPesquisaFilaAcolhimento();
        if (!campo || ev?.target !== campo) return;

        // Campo preenchido: o refresh automático permanece suspenso.
        // Campo limpo: espera o Saúde Simples restaurar a lista e sincroniza por baixo.
        if (!clean(campo.value)) {
          setTimeout(() => atualizarFilaAcolhimentoSilenciosa({ forcar:true }).catch(() => {}), 250);
        }
      };
      document.addEventListener('input', tratarPesquisa, true);
      document.addEventListener('search', tratarPesquisa, true);
      document.addEventListener('change', tratarPesquisa, true);
    }

    const tentar = () => conectarFilaAcolhimentoEstavel();
    if (!tentar()) {
      let tentativas = 0;
      const inicio = setInterval(() => {
        tentativas++;
        if (tentar() || tentativas >= 50) clearInterval(inicio);
      }, 100);
    }

    clearInterval(acolhEstavelTimer);
    acolhEstavelTimer = setInterval(() => {
      // Se o Vue recriou o componente (troca de guichê/filtro), conecta no novo
      // e mata o intervalId nativo dele antes da próxima atualização automática.
      conectarFilaAcolhimentoEstavel();
      if (acolhEstavelPronto && !acolhEstavelCargaInicial) {
        atualizarFilaAcolhimentoSilenciosa({ forcar:false }).catch(() => {});
      }
    }, ACOLH_ESTAVEL_REFRESH_MS);

    if (!window.__OM30_ACOLH_RELOGIOS__) {
      window.__OM30_ACOLH_RELOGIOS__ = setInterval(atualizarRelogiosFilaAcolhimento, 30000);
    }

    if (!acolhEstavelObserver) {
      let debounce = null;
      acolhEstavelObserver = new MutationObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          if (!acolhEstavelListVm?.$el?.isConnected || !acolhEstavelCollectionVm?.$el?.isConnected) {
            conectarFilaAcolhimentoEstavel();
          }
          // Linhas recriadas pelo Vue (pesquisa nativa, troca de guichê) voltam sem a classe do filtro.
          if (filtroFilaAcolh !== 'TODOS') aplicarFiltroFilaAcolhimento();
        }, 150);
      });
      acolhEstavelObserver.observe(document.body, { childList:true, subtree:true });
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        conectarFilaAcolhimentoEstavel();
        atualizarFilaAcolhimentoSilenciosa({ forcar:true }).catch(() => {});
      }
    });

    window.addEventListener('pageshow', () => {
      setTimeout(() => {
        conectarFilaAcolhimentoEstavel();
        atualizarFilaAcolhimentoSilenciosa({ forcar:true }).catch(() => {});
      }, 100);
    });
  }

  // ---------------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------------

  async function iniciar(tabela) {
    tabela.dataset.om30Ausentes = '1';
    if (!tabela.tBodies[0]) tabela.appendChild(document.createElement('tbody'));
    tabelaRef = tabela;

    montarBarra(tabela);
    definirStatus('Carregando ausentes de hoje…');
    esconderPaginacao(tabela);
    await sincronizarLista(tabela, { inicial: true, completa: !somenteHoje }).catch(e => console.warn('[OM30 Ausentes]', e));
    prepararColunas(tabela);
    aplicarFiltros();
    marcarTempoLista();

    if (MODO_NUMERO === 'FICHA') {   // não precisa do Senha Simples para mostrar a lista
      await classificarTodos();
      agendarReverificacao();
      return;
    }

    definirStatus('Aguardando Senha Simples…');
    try {
      await esperar(senhaSimplesPronto);
      garantirTokenSenha();
    } catch {
      definirStatus('');
      definirAviso('Senha Simples não autenticado nesta tela. Recarregue a página e tente de novo.');
      return;
    }
    await classificarTodos();
    agendarReverificacao();
  }

  function tentarIniciar() {
    if (!/^\/(acolhimentos|prontuarios)(\/urgencia_emergencia)?\/?$/.test(location.pathname)) return true;
    const tabela = acharTabelaAusentes();
    if (tabela && !tabela.dataset.om30Ausentes) { iniciar(tabela); return true; }
    return false;
  }

  iniciarFilaAcolhimentoEstavel();
  instalarMenusDesvincularAcolhimento();

  if (!tentarIniciar()) {
    const obs = new MutationObserver(() => { if (tentarIniciar()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 20000);
  }
})();
