// ==UserScript==
// @name         OM30 - Controle de Salas
// @namespace    om30-guaruja
// @version      3.0.67
// @updateURL    https://raw.githubusercontent.com/pdrjsampaio/om30-userscripts/main/OM30-Controle-de-Salas.user.js
// @downloadURL  https://raw.githubusercontent.com/pdrjsampaio/om30-userscripts/main/OM30-Controle-de-Salas.user.js
// @description  Controle de Salas OM30: fila, histórico, risco, dados do munícipe, medicação, alergia, cancelamento, pendências e presença Cloudflare.
// @author       Pedro Sampaio
// @match        https://guaruja.saudesimples.net/*
// @match        https://guarujahomolog.saudesimples.net/*
// @grant        none
// @inject-into  page
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* OM30 - CONTROLE DE SALAS v3.0.67
     * Arquitetura unificada e leve para o Controle de Salas.
     * Recursos compartilham o mesmo ciclo da fila, evitando observers/timers concorrentes.
     * Segurança: /edit nunca é consultado passivamente.
     * v3.0.67: depois de salvar a ficha, a tela de consulta (só Imprimir/Sair) é pulada e volta direto para a lista (SAIR_DIRETO_APOS_SALVAR); CPF/CNS num cartão com o número em destaque e cópia pelo ícone (vira ✓ ao copiar); sinais vitais do acolhimento (PA, temperatura, FC, FR, glicemia, saturação, peso) aparecem embaixo do risco de cada paciente na fila, em caixa compacta; o nome do munícipe fica em negrito com a faixa da cor do risco; o aviso "Encaminhamento concluído" fecha sozinho depois de salvar a ficha e o próximo destino aparece como aviso na página seguinte (PULAR_POPUP_CONCLUSAO); no Histórico da Medicação aparece a hora de cada cancelamento (com quem cancelou e o motivo) e de cada aplicação (lida da ficha de medicação; HORARIO_HISTORICO = 'sem_pdf' desliga e mostra só a hora da chamada).
     * v3.0.66: na ficha de Exames/Raio-X/Enfermagem, a Situação muda na hora para REALIZADO (verde) ou CANCELADO (vermelho) ao clicar em Realizar/Cancelar; antes ficava PENDENTE até salvar.
     * v3.0.65: o aviso "Senha perdida" do sistema (janela .swal2-modal) agora é reconhecido; na 3.0.64 ele passava despercebido.
     * v3.0.64: com o aviso "senha perdida" do sistema, o Atender daquele paciente passa a usar o comportamento original do sistema e abre a ficha (antes ficava tentando chamar de novo e não abria).
     * v3.0.63: o número da ficha aparece só na sala de Raio-X; nas outras salas (Medicação, Exames, Enfermagem) volta o botão "Dados do Munícipe" como era. A ficha em segundo plano só é lida no Raio-X.
     * v3.0.62: desfaz a espera parada na chamada (3.0.60/3.0.61): a espera volta a contar desde o encaminhamento para a sala, para todos.
     * v3.0.61: tira o rótulo "Esperou"; fica sempre "Espera" (para quem já foi chamado na sala o número continua parado no tempo até a chamada).
     * v3.0.60: espera real: quem já foi chamado nesta sala (Em Andamento) para de contar e mostra "Esperou 4 min" (do encaminhamento até a chamada). Chamada de outro setor, anterior ao encaminhamento, não conta.
     * v3.0.59: ficha sem nada guardado sai numa consulta só (1000 senhas mais recentes, ~9 s; antes 2 rodadas, ~16 s); o aquecimento em segundo plano lê 300 a cada 2 min (mesmo custo de 100).
     * v3.0.58: ficha mais rápida (o rastreamento do sistema leva ~10 s: agora as 100 senhas mais recentes são lidas em segundo plano ao abrir e a cada 2 min, e a ficha de quem entra na fila já aparece pronta) e com visual de pílula azul com ícone; número sem os zeros da frente (o clique copia completo).
     * v3.0.57: Raio-X manda para o faturamento sem chave nenhuma (nada para configurar nos PCs).
     * v3.0.56: a chave de envio do Raio-X para o faturamento saiu do código; cada PC da sala de Raio-X guarda a chave uma vez (OM30RaioXFat.chave(...) no console). Sem chave, o envio fica desligado e nada muda no resto.
     * v3.0.55: a ficha aparece rápido (uma leitura do rastreamento para a fila toda, guardada no navegador; usa também a lista salva pelo Rastreamento de Senhas) e com visual discreto (FICHA em cinza, sem caixa roxa).
     * v3.0.54: na fila, cada paciente mostra o número da ficha (o mesmo do Rastreamento de Senhas, clique copia) no lugar do botão "Dados do Munícipe"; CPF/CNS continuam aparecendo sozinhos para medicação controlada. Ao clicar em "Chamar", a página sobe até o painel Confirmar atendimento / Paciente ausente / Chamar novamente.
     * v3.0.53: Raio-X sem faturamento: na sala de Raio-X, os exames finalizados como REALIZADO (paciente, CNS, código SIGTAP, médico) vão para o faturamentops.pages.dev, para o faturamento lançar no médico. Bloco separado no fim do arquivo ("OM30 RAIO-X FATURAMENTO"); só age na sala de Raio-X; só lê, não clica em nada.
     * v3.0.52: ao abrir ou recarregar a página o período volta para "Hoje"; a contagem do título e da barra segue a mesma regra em todos os computadores (Hoje, sem filtro do sistema), mesmo com período 24 horas/Data ou filtro salvo neste PC; o "hoje" usa o relógio do servidor quando o do PC está errado; com a tela visível e a lista mais de 1 min sem atualizar (aba em segundo plano, PC que acordou, ciclo do sistema parado), atualiza sozinha.
     * v3.0.51: aplica o pacote visual completo do layout Claude 3.0.49 (resumo e risco em badges, idade, medicação destacada, via quadrada, Chamar azul, Cancelar separado e tipografia), preservando a lógica atual.
     * v3.0.50: restaura somente o desenho da coluna de ações usado no layout Claude 3.0.49 (botões 30px e largura natural da coluna), preservando toda a lógica atual e a remoção de "obs." vazio.
     * v3.0.45: observação vazia ou composta apenas por traços não exibe mais "obs.".
     * v3.0.44: corrige falso conflito quando Acolhimento/Atendimento negam alergia com texto truncado ou colado (ex.: "NEGA ALERGIAS MEDICAÇOE..."). Prefixos NG/NGA/NEGA/SEM/NÃO POSSUI + ALERGIA são sempre tratados como negativa.
     * v3.0.43: corrige leitura de alergia abreviada (ex.: "NG ALERGIAS A MEDICAÇÕES") e impede campos seguintes do prontuário de vazarem para o alerta.
     * Revisão: espera copiada do padrão da Fila Médica; ícone de Dados do Munícipe copiado do Unificado v2.0.20; alergia com lógica integral da v2.0.80,
     * Pendências/Cancelar preservados da v2.0.80, handoff exato por AtendimentoPa,
     * pendências/retorno pela ponte central do médico + handoff nativo; AtendimentoPa exato por linha/ficha; Cancelar e vínculo de local em todas as filas.
     */

    // ── CONFIGURAÇÃO ────────────────────────────────────────────────────────────
    // Mostrar na fila os medicamentos de cada paciente (produto, via, posologia e
    // situação) e o botão "Cancelar todas" de cada linha.
    // Os medicamentos são lidos da página de consulta /aplicacoes_medicamentos/{id},
    // usada somente como rota segura de leitura e não deve mudar o status do paciente. A tela
    // de aplicação (/new) muda para "Em Andamento" (confirmado em 01/10/2026) e só é
    // aberta quando se confirma um cancelamento. Se a consulta for redirecionada para
    // outra página, a leitura para sozinha.
    const MOSTRAR_MEDICACOES = true;

    // Esconder o botão "Atender" de cada linha (true) e deixar só o "Chamar". Para as
    // unidades onde o Atender da tabela não funciona: depois de chamar, o atendimento
    // começa pelo "Confirmar atendimento" que aparece no topo da página.
    const ESCONDER_ATENDER = false;

    // Rolar a página até o topo depois de chamar um paciente (true), para o
    // "Confirmar atendimento" ficar à vista.
    const ROLAR_AO_CHAMAR = true;

    // Abrir o atendimento (tela de aplicação) numa aba nova (true). A lista fica aberta
    // na aba original e não precisa carregar de novo a cada atendimento; a aba do
    // atendimento fecha sozinha quando o sistema volta para a lista (depois de salvar
    // ou de sair do atendimento). Se o navegador bloquear a aba, abre na mesma.
    const ABRIR_ATENDIMENTO_EM_NOVA_ABA = true;

    // CPF e CNS aparecem sozinhos (sem clicar) quando o paciente tem medicação
    // controlada (lista da Anvisa, abaixo no núcleo) ou uma destas, de alto custo.
    // Escreva o nome como aparece no produto, ex.: 'ENOXAPARINA', 'ALTEPLASE'.
    const MEDICAMENTOS_CPF_CNS = [];

    // Alerta de alergia na fila (true), lido do prontuário do AtendimentoPa pela
    // rota segura GET /prontuarios/new?prontuariavel_id=…&prontuariavel_type=AtendimentoPa
    // e combinado com informação positiva da ficha segura de medicamentos, como na v2.0.80.
    const MOSTRAR_ALERGIA = true;

    // Fecha sozinho o aviso "Encaminhamento concluído" depois de salvar a ficha (true).
    // O próximo destino aparece como aviso rápido na página seguinte, em vez de
    // exigir o clique em OK. Com false, o popup com o destino continua como antes.
    const PULAR_POPUP_CONCLUSAO = true;

    // Depois de salvar a ficha, o sistema abre a consulta dela (só "Imprimir" e "Sair").
    // Com true, essa tela é pulada: segue o "Sair" dela e volta direto para a lista.
    // Abrir a consulta pela lupa ou pelo Histórico continua igual.
    const SAIR_DIRETO_APOS_SALVAR = true;

    // No Histórico da Medicação, 'automatico' lê a ficha de medicação (PDF de impressão)
    // de cada finalizado para mostrar a hora da aplicação, 2 por vez, guardado no
    // navegador; 'sem_pdf' não baixa PDF: aplicados mostram só a hora da chamada na sala.
    // Cancelados mostram a hora exata nos dois modos (vem da consulta).
    const HORARIO_HISTORICO = 'automatico';

    // #region nucleo
    // Regras puras (sem DOM, sem Vue). Os testes extraem esta região.
    function criarNucleo() {
        // Ordem de atendimento pela classificação de risco (Manchester).
        const RISCO_ORDEM = { VERMELHO: 0, LARANJA: 1, AMARELO: 2, VERDE: 3, AZUL: 4 };
        const RISCO_SEM = 5;
        // Quem ainda espera vem antes; quem já está em atendimento ou em outra sala vai para o fim.
        const STATUS_ORDEM = { 'Em Espera': 0, 'Em Andamento': 1, 'Em Outra Sala': 2 };
        const PERIODOS = {
            hoje: { rotulo: 'Hoje', dias: 0 },
            '24h': { rotulo: '24 horas', dias: 1, horas: 24 },
        };

        function pad(n) { return String(n).padStart(2, '0'); }
        function isoDia(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

        // "01/10/2026" + "11:22" → Date local; null se não der para ler.
        function dataHora(item) {
            const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(item.data_encaminhamento || '');
            if (!m) return null;
            const h = /^(\d{1,2}):(\d{2})/.exec(item.hora_encaminhamento || '') || [0, '0', '0'];
            return new Date(+m[3], +m[2] - 1, +m[1], +h[1], +h[2]);
        }

        function riscoOrdem(item) {
            const nome = String(item.grau_risco || '').trim().toUpperCase();
            return nome in RISCO_ORDEM ? RISCO_ORDEM[nome] : RISCO_SEM;
        }

        function statusOrdem(item) {
            return item.status in STATUS_ORDEM ? STATUS_ORDEM[item.status] : 3;
        }

        // Parâmetros de data enviados ao servidor (formato que o filtro do próprio sistema usa)
        // e o instante mínimo para o corte fino feito aqui (24h).
        function periodoParams(periodo, agora) {
            const p = PERIODOS[periodo] || PERIODOS['24h'];
            const ini = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - p.dias);
            return {
                dataInicial: isoDia(ini),
                dataFinal: isoDia(agora),
                minimo: p.horas ? new Date(agora.getTime() - p.horas * 3600e3) : null,
            };
        }

        // Condições da lista com o período do script, a menos que o filtro do sistema
        // já traga data. Usada na carga normal e no pedido adiantado: as duas têm que
        // chegar exatamente aos mesmos parâmetros.
        function aplicarPeriodo(condicoes, periodo, agora) {
            const cond = Object.assign({}, condicoes);
            const filtroDataSistema = !!(cond.dataInicial || cond.dataFinal);
            let minimo = null;
            if (!filtroDataSistema) {
                const p = periodoParams(periodo, agora);
                cond.dataInicial = p.dataInicial;
                cond.dataFinal = p.dataFinal;
                minimo = p.minimo;
            }
            return { cond, minimo, filtroDataSistema };
        }

        // Chave canônica de parâmetros (ordem das chaves não importa; null/undefined
        // ficam de fora, como o axios faz).
        function chaveParams(params) {
            return JSON.stringify(Object.keys(params).filter(k => params[k] != null).sort().map(k => [k, params[k]]));
        }

        // Query string como o axios 0.x do sistema monta: arrays como chave[]=v,
        // objetos em JSON, null/undefined omitidos.
        function queryAxios(params) {
            const enc = v => encodeURIComponent(v).replace(/%3A/gi, ':').replace(/%24/g, '$').replace(/%2C/gi, ',').replace(/%20/g, '+').replace(/%5B/gi, '[').replace(/%5D/gi, ']');
            const partes = [];
            for (const k of Object.keys(params)) {
                const v = params[k];
                if (v == null) continue;
                const lista = Array.isArray(v) ? v : [v];
                for (const x of lista) partes.push(`${enc(Array.isArray(v) ? k + '[]' : k)}=${enc(x !== null && typeof x === 'object' ? JSON.stringify(x) : x)}`);
            }
            return partes.join('&');
        }

        // Ordem final: status (espera primeiro) → cor de risco → data/hora de chegada
        // (mais antigo primeiro) → senha. O dia não separa: um amarelo de hoje vem antes
        // de qualquer verde de ontem.
        function ordenar(itens) {
            const chave = it => {
                const d = dataHora(it);
                return {
                    r: riscoOrdem(it),
                    t: d ? d.getTime() : Infinity,
                    senha: it.senha || '',
                };
            };
            return itens
                .map((it, i) => ({ it, k: chave(it), i }))
                .sort((a, b) => (a.k.r - b.k.r)
                    || (a.k.t - b.k.t)
                    || a.k.senha.localeCompare(b.k.senha)
                    || (a.i - b.i))
                .map(x => x.it);
        }

        function filtrar(itens, { minimo = null, soEspera = false } = {}) {
            return itens.filter(it => {
                if (soEspera && it.status !== 'Em Espera') return false;
                if (minimo) {
                    const d = dataHora(it);
                    if (d && d < minimo) return false;
                }
                return true;
            });
        }

        // Junta páginas e tira repetidos (a lista pode mudar entre uma página e outra).
        function juntarPaginas(paginas) {
            const vistos = new Set();
            const saida = [];
            for (const pag of paginas) {
                for (const it of pag || []) {
                    const id = it.encaminhamento_id || JSON.stringify(it);
                    if (vistos.has(id)) continue;
                    vistos.add(id);
                    saida.push(it);
                }
            }
            return saida;
        }

        function textoMinutos(min) {
            if (min < 60) return `${min} min`;
            const h = Math.floor(min / 60);
            if (h < 24) return `${h}h ${min % 60}min`;
            return `${Math.floor(h / 24)}d ${h % 24}h`;
        }
        // Já chamado nesta sala (chamada DEPOIS do encaminhamento para a sala): a espera parou na chamada.
        // Chamada anterior ao encaminhamento é de outro setor (acolhimento, médico) e não conta.
        function esperaAteChamada(item) {
            const d = dataHora(item);
            const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(item.chamada_em || ''));
            if (!d || !m) return '';
            const chamada = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
            if (chamada < d) return '';
            return textoMinutos(Math.max(0, Math.floor((chamada - d) / 60000)));
        }
        function espera(item, agora) {
            const d = dataHora(item);
            if (!d) return '—';
            const min = Math.max(0, Math.floor((agora - d) / 60000));
            if (min < 60) return `${min} min`;
            const h = Math.floor(min / 60);
            if (h < 24) return `${h}h ${min % 60}min`;
            return `${Math.floor(h / 24)}d ${h % 24}h`;
        }

        // Histórico: status do filtro do sistema que não aparecem na fila normal.
        const STATUS_HISTORICO = { 3: 'Cancelado', 4: 'Finalizado' };

        // Mais recente primeiro (quem acabou de sair da fila está no topo).
        function ordenarHistorico(itens) {
            return itens
                .map((it, i) => ({ it, t: (dataHora(it) || { getTime: () => -Infinity }).getTime(), i }))
                .sort((a, b) => (b.t - a.t) || String(a.it.senha || '').localeCompare(String(b.it.senha || '')) || (a.i - b.i))
                .map(x => x.it);
        }

        function classesHistorico(itens) {
            const nomes = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'sem'];
            return itens.map(it => `cs-risco-${nomes[riscoOrdem(it)]} cs-hist-${semAcento(it.status).toLowerCase() === 'cancelado' ? 'cancelado' : 'finalizado'}`);
        }

        // Registro local dos cancelamentos feitos pelo botão da lista: guarda os
        // últimos dias, no máximo `max` entradas, mais novas primeiro.
        function podarRegistro(lista, agoraMs, { dias = 7, max = 500 } = {}) {
            return (Array.isArray(lista) ? lista : [])
                .filter(r => r && r.enc && agoraMs - r.em <= dias * 86400e3)
                .sort((a, b) => b.em - a.em)
                .slice(0, max);
        }

        function resumo(itens) {
            const r = {
                espera: 0,
                andamento: 0,
                outraSala: 0,
                cores: [0, 0, 0, 0, 0, 0],
                mediaEsperaMin: null,
                mediaCoresMin: [null, null, null, null, null, null]
            };
            let somaEsperaMs = 0, qtdEsperaComHora = 0;
            const somaCoresMs = [0, 0, 0, 0, 0, 0];
            const qtdCoresHora = [0, 0, 0, 0, 0, 0];
            const agora = Date.now();

            for (const it of itens) {
                if (it.status === 'Em Espera') {
                    const idx = riscoOrdem(it);
                    r.espera++;
                    r.cores[idx]++;
                    const d = dataHora(it);
                    if (d && Number.isFinite(d.getTime())) {
                        const esperaMs = Math.max(0, agora - d.getTime());
                        somaEsperaMs += esperaMs;
                        qtdEsperaComHora++;
                        somaCoresMs[idx] += esperaMs;
                        qtdCoresHora[idx]++;
                    }
                } else if (it.status === 'Em Andamento') r.andamento++;
                else if (it.status === 'Em Outra Sala') r.outraSala++;
            }

            if (qtdEsperaComHora) r.mediaEsperaMin = Math.round((somaEsperaMs / qtdEsperaComHora) / 60000);
            for (let i = 0; i < r.mediaCoresMin.length; i++) {
                if (qtdCoresHora[i]) r.mediaCoresMin[i] = Math.round((somaCoresMs[i] / qtdCoresHora[i]) / 60000);
            }
            return r;
        }

        // Classes da linha: cor de risco, status e linha separando os grupos de status.
        function classesLinhas(itens) {
            const nomes = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'sem'];
            return itens.map(it => {
                const cls = [`cs-risco-${nomes[riscoOrdem(it)]}`];
                if (it.status === 'Em Andamento') cls.push('cs-em-andamento');
                return cls.join(' ');
            });
        }

        // Filtros do modal do sistema que vale guardar entre recarregamentos.
        // Datas só valem no mesmo dia em que foram escolhidas.
        function filtrosParaSalvar(f, agora) {
            return {
                dia: isoDia(agora),
                profissionalId: f.profissional && f.profissional.id != null ? f.profissional.id : null,
                status: f.status || '',
                grauRisco: f.grauRisco || '',
                dataInicial: f.dataInicial || '',
                dataFinal: f.dataFinal || '',
            };
        }

        function filtrosParaRestaurar(salvo, agora) {
            if (!salvo || typeof salvo !== 'object') return null;
            const mesmoDia = salvo.dia === isoDia(agora);
            const r = {
                profissionalId: salvo.profissionalId ?? null,
                status: salvo.status || '',
                grauRisco: salvo.grauRisco || '',
                dataInicial: mesmoDia ? salvo.dataInicial || '' : '',
                dataFinal: mesmoDia ? salvo.dataFinal || '' : '',
            };
            const algum = r.profissionalId != null || r.status || r.grauRisco || r.dataInicial || r.dataFinal;
            return algum ? r : null;
        }

        function semAcento(t) {
            return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
        }

        // Sigla e cor da via de administração (texto da tela; tipo_uso_medicamento_id como reserva).
        function via(texto, tipoUsoId) {
            const n = semAcento(texto);
            const tabela = [
                [/^INTRAMUSCULAR$/, 'IM', 'im'], [/^(INTRAVENOSA|ENDOVENOSA)$/, 'IV', 'iv'],
                [/^SUBCUTANEA$/, 'SC', 'sc'], [/^ORAL$/, 'VIA ORAL', 'oral'], [/^SUBLINGUAL$/, 'SL', 'oral'],
                [/^PARENTERAL$/, 'PAR', 'outra'], [/^(INALATORIA|INALACAO)$/, 'INAL', 'inal'],
                [/^TOPICA$/, 'TOP', 'outra'], [/^NASAL$/, 'NAS', 'outra'], [/^RETAL$/, 'RET', 'outra'],
                [/^INTRADERMICA$/, 'ID', 'outra'], [/OFTALM|OCULAR/, 'OFT', 'outra'],
            ];
            for (const [re, sigla, classe] of tabela) if (re.test(n)) return { sigla, classe, nome: String(texto).trim() };
            const porId = { 9: ['IM', 'im', 'INTRAMUSCULAR'], 11: ['IV', 'iv', 'INTRAVENOSA'], 12: ['VIA ORAL', 'oral', 'ORAL'] }[tipoUsoId];
            if (!n && porId) return { sigla: porId[0], classe: porId[1], nome: porId[2] };
            if (n) return { sigla: n.length <= 5 ? n : n.slice(0, 4) + '.', classe: 'outra', nome: String(texto).trim() };
            return { sigla: '?', classe: 'outra', nome: 'Via não informada' };
        }

        // Itens da página de consulta /aplicacoes_medicamentos/{id}: tabela com as
        // colunas Medicamento, Via de Administração, Posologia e Situação (o que o
        // usada pela leitura segura). null se a página não tiver essa tabela.
        function extrairMedicacoesConsulta(doc) {
            const cabecalho = t => {
                const ths = t.querySelectorAll('thead th').length ? t.querySelectorAll('thead th') : (t.querySelector('tr') || t).querySelectorAll('th');
                return Array.from(ths).map(th => semAcento(th.textContent));
            };
            const tabela = Array.from(doc.querySelectorAll('table')).find(t => {
                const cab = cabecalho(t).join(' ');
                return cab.includes('MEDICAMENTO') && cab.includes('VIA DE ADMINISTRACAO');
            });
            if (!tabela) return null;
            const cab = cabecalho(tabela);
            const col = nome => cab.findIndex(h => h.includes(nome));
            const iMed = col('MEDICAMENTO'), iVia = col('VIA DE ADMINISTRACAO'), iPos = col('POSOLOGIA'), iSit = col('SITUACAO'), iObs = col('OBSERVACAO');
            const linhas = tabela.querySelectorAll('tbody tr').length ? tabela.querySelectorAll('tbody tr') : tabela.querySelectorAll('tr');
            const saida = [];
            for (const tr of linhas) {
                const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.replace(/\s+/g, ' ').trim());
                const produto = tds[iMed] || '';
                if (!produto) continue;
                const situacao = iSit >= 0 ? tds[iSit] || '' : '';
                const s = semAcento(situacao);
                const estado = !s || s.includes('PENDENTE') ? 'pendente' : s.includes('CANCEL') ? 'cancelado' : 'feito';
                const obs = iObs >= 0 ? tds[iObs] || '' : '';
                const obsLimpa = String(obs || '').replace(/\s+/g, ' ').trim();
                const obsVazia = !obsLimpa || /^(?:-|–|—)+$/.test(obsLimpa);
                const item = {
                    produto,
                    posologia: iPos >= 0 ? tds[iPos] || '' : '',
                    via: via(tds[iVia] || '', null),
                    observacao: obsVazia ? '' : obsLimpa,
                    estado,
                    situacao: situacao || 'PENDENTE',
                };
                // Cancelado: a célula da Situação traz data, profissional e motivo em data-*.
                const canc = iSit >= 0 ? tr.querySelectorAll('td')[iSit]?.querySelector('[data-canceled-at]') : null;
                if (canc) {
                    const limpa = v => String(v || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                    const m = /(\d{2}\/\d{2}\/\d{4})\D+(\d{2}:\d{2}(?::\d{2})?)/.exec(limpa(canc.getAttribute('data-canceled-at')));
                    if (m) item.canceladoEm = `${m[1]} ${m[2].length === 5 ? m[2] + ':00' : m[2]}`;
                    item.canceladoPor = limpa(canc.getAttribute('data-profissional-nome')).replace(/^PROFISSIONAL\s*:\s*/i, '');
                    item.justificativa = limpa(canc.getAttribute('data-justificativa'));
                }
                saida.push(item);
            }
            return saida;
        }

        // Id do munícipe na página de consulta, se ela trouxer (campo municipe_id ou
        // link /municipes/{id}, usado pela consulta de dados). '' se não tiver.
        function municipeIdConsulta(doc) {
            const campo = Array.from(doc.querySelectorAll('input')).find(el =>
                /(^|\[|_)municipe_id(\]|$|_)/i.test(`${el.name || ''} ${el.id || ''}`) && /^\d+$/.test(el.value || ''));
            if (campo) return campo.value;
            for (const a of doc.querySelectorAll('a[href*="/municipes/"]')) {
                const m = /\/municipes\/(\d+)/.exec(a.getAttribute('href') || '');
                if (m) return guardarAtendimentoPaFilho(m[1]);
            }
            return '';
        }

        // Escolhe o cadastro certo na busca de munícipes (search_padronizado_com_mudanca):
        // pelo id quando se sabe; senão só se o nome (ou nome social) for exatamente
        // igual ao da fila (maiúsculas e acentos contam; só espaços sobrando são
        // ignorados) e o nascimento bater, com um único cadastro. O sistema não cadastra
        // dois munícipes com o mesmo nome; o caso ambíguo fica só como proteção.
        function escolherMunicipe(resultados, { municipeId = '', nome = '', nascimento = '' }) {
            const lista = (Array.isArray(resultados) ? resultados : []).filter(r => r && !r.deleted_at);
            if (municipeId) {
                const r = lista.find(x => String(x.id) === String(municipeId));
                return r ? { municipe: r, por: 'id' } : { municipe: null, por: '', candidatos: [] };
            }
            const limpo = t => String(t || '').replace(/\s+/g, ' ').trim();
            const alvo = limpo(nome);
            const iguais = lista.filter(r => alvo && (limpo(r.nome) === alvo || limpo(r.nome_social) === alvo)
                && (r.data_nascimento_formatada || '') === nascimento);
            if (iguais.length === 1) return { municipe: iguais[0], por: 'nome e nascimento' };
            return { municipe: null, por: '', candidatos: iguais };
        }

        function soDigitos(v) { return String(v || '').replace(/\D/g, ''); }
        function formatarCPF(v) {
            const d = soDigitos(v);
            return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
        }
        function formatarCNS(v) {
            const d = soDigitos(v);
            return d.length === 15 ? d.replace(/(\d{3})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4') : '';
        }

        // Substâncias controladas da Anvisa (Portaria SVS/MS 344/1998, consolidada pela
        // RDC 1.036/2026): A2 entorpecentes (inclui tramadol), A3/B1/B2 psicotrópicos.
        // Lista e apelidos utilizados para identificar medicamentos controlados.
        const CONTROLADOS = {
            A2: ['ACETILDIHIDROCODEINA', 'CODEINA', 'DEXTROPROPOXIFENO', 'DIHIDROCODEINA', 'ETILMORFINA', 'FOLCODINA', 'NALBUFINA',
                'NALORFINA', 'NICOCODINA', 'NICODICODINA', 'NORCODEINA', 'PROPIRAM', 'TRAMADOL'],
            A3: ['ANFETAMINA', 'CATINA', 'CLORFENTERMINA', 'DEXANFETAMINA', 'DRONABINOL', 'FEMETRAZINA', 'FENCICLIDINA', 'FENETILINA',
                'FENFLURAMINA', 'LEVANFETAMINA', 'LISDEXANFETAMINA', 'METILFENIDATO', 'METILSINEFRINA', 'TANFETAMINA'],
            B1: ['ALFAXALONA', 'ALOBARBITAL', 'ALPRAZOLAM', 'AMINEPTINA', 'AMOBARBITAL', 'APROBARBITAL', 'ARMODAFINILA', 'BARBEXACLONA',
                'BARBITAL', 'BROMAZEPAM', 'BROMAZOLAM', 'BROTIZOLAM', 'BUTABARBITAL', 'BUTALBITAL', 'CAMAZEPAM', 'CARISOPRODOL',
                'CETAMINA', 'CETAZOLAM', 'CICLOBARBITAL', 'CLOBAZAM', 'CLONAZEPAM', 'CLONAZOLAM', 'CLORAZEPAM', 'CLORAZEPATO',
                'CLORDIAZEPOXIDO', 'CLORETO DE ETILA', 'CLORETO DE METILENO', 'CLOTIAZEPAM', 'CLOXAZOLAM', 'DELORAZEPAM', 'DIAZEPAM',
                'DICLAZEPAM', 'ESCETAMINA', 'ESTAZOLAM', 'ESZOPICLONA', 'ETCLORVINOL', 'ETILANFETAMINA', 'ETINAMATO', 'ETIZOLAM',
                'FENAZEPAM', 'FENOBARBITAL', 'FLUALPRAZOLAM', 'FLUBROMAZOLAM', 'FLUDIAZEPAM', 'FLUNITRAZEPAM', 'FLUNITRAZOLAM',
                'FLURAZEPAM', 'GBL', 'GHB', 'GLUTETIMIDA', 'HALAZEPAM', 'HALOXAZOLAM', 'LEFETAMINA', 'LEMBOREXANTE',
                'LOFLAZEPATO DE ETILA', 'LOPRAZOLAM', 'LORAZEPAM', 'LORMETAZEPAM', 'MEDAZEPAM', 'MEPROBAMATO', 'MESOCARBO',
                'METILFENOBARBITAL', 'METIPRILONA', 'MIDAZOLAM', 'MODAFINILA', 'NIMETAZEPAM', 'NITRAZEPAM', 'NORCANFANO', 'NORDAZEPAM',
                'OXAZEPAM', 'OXAZOLAM', 'PEMOLINA', 'PENTAZOCINA', 'PENTOBARBITAL', 'PERAMPANEL', 'PINAZEPAM', 'PIPRADROL',
                'PIROVALERONA', 'PRAZEPAM', 'PROLINTANO', 'PROPILEHEXEDRINA', 'REMIMAZOLAM', 'SECBUTABARBITAL', 'SECOBARBITAL',
                'TEMAZEPAM', 'TETRAZEPAM', 'TIAMILAL', 'TIOPENTAL', 'TRIAZOLAM', 'TRICLOROETILENO', 'TRIEXIFENIDIL', 'VINILBITAL',
                'ZALEPLONA', 'ZOLPIDEM', 'ZOPICLONA'],
            B2: ['AMINOREX', 'ANFEPRAMONA', 'FEMPROPOREX', 'FENDIMETRAZINA', 'FENTERMINA', 'MAZINDOL', 'MEFENOREX', 'SIBUTRAMINA'],
        };
        const APELIDOS_CONTROLADOS = [
            ['DICLOROMETANO', 'CLORETO DE METILENO', 'B1'], ['N-ETILANFETAMINA', 'ETILANFETAMINA', 'B1'],
            ['ACIDO GAMA HIDROXIBUTIRICO', 'GHB', 'B1'], ['GAMA HIDROXIBUTIRICO', 'GHB', 'B1'],
            ['PROMINAL', 'METILFENOBARBITAL', 'B1'], ['FENCANFAMINA', 'NORCANFANO', 'B1'],
            ['TRAMAL', 'TRAMADOL', 'A2'], // nome comercial visto no Saúde Simples
        ];

        // Nome comparado por palavras inteiras (" DIAZEPAM " dentro de " DIAZEPAM 5MG ML ").
        function chaveMedicamento(t) {
            return ` ${semAcento(t).replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
        }

        // Itens que pedem CPF/CNS: controlados da Anvisa ou da lista extra (alto custo).
        // Devolve [{ produto, principio, lista }] (lista 'A2'…'B2' ou 'alto custo').
        function classificarCpfCns(itens, extras = []) {
            const regras = [
                ...Object.entries(CONTROLADOS).flatMap(([lista, nomes]) => nomes.map(n => ({ chave: chaveMedicamento(n), principio: n, lista }))),
                ...APELIDOS_CONTROLADOS.map(([apelido, principio, lista]) => ({ chave: chaveMedicamento(apelido), principio, lista })),
                ...extras.filter(e => String(e || '').trim()).map(e => ({ chave: chaveMedicamento(e), principio: semAcento(e), lista: 'alto custo' })),
            ].sort((a, b) => b.chave.length - a.chave.length);
            const achados = [];
            for (const it of Array.isArray(itens) ? itens : []) {
                const texto = chaveMedicamento(it && it.produto);
                if (!texto.trim()) continue;
                const r = regras.find(x => texto.includes(x.chave));
                if (r) achados.push({ produto: it.produto, principio: r.principio, lista: r.lista });
            }
            return achados;
        }

        // ── Alergia no prontuário ─────────────────────────────────────────────
        // Duas fontes: o campo "Alergias" do acolhimento (<strong>Alergias</strong>
        // <li>valor</li>) e o texto livre da evolução ("ALÉRGICO A DIPIRONA", "NEGA
        // ALERGIA", "ALERGIA NEGA"). Alergia positiva sempre vence uma negativa.
        const NEGATIVA_ALERGIA = /^(NAO|NAO POSSUI|NAO POSSUI ALERGIAS?|NENHUMA|NENHUMA ALERGIA|SEM ALERGIAS?|NEGA|NEGA ALERGIAS?( MEDICAMENTOSAS?)?|NEGADO|NEGATIVO)$/;
        const VAZIO_ALERGIA = /^(|—|-|NAO INFORMADO|NAO INFORMADA|NAO PREENCHIDO|SEM INFORMACAO)$/;

        function cortarTermoAlergia(v) {
            return String(v || '').split(/[.;,\n]|\s+(?=(?:CID|DIAGNOSTICO|CONDUTA|EXAMES?|MEDICAMENTOS?|PROCEDIMENTOS?|APP|HDA|HMA|HPP|NEGA|REG|AR|ACV|ABDOME|ABD|COMORBIDADES?|MUC|PA|FC|FR|SAT|TAX)\b)/)[0]
                .replace(/^[\s:;,.\-]+|[\s:;,.\-]+$/g, '').trim().slice(0, 80);
        }

        function interpretarAlergia(doc) {
            // Leitura robusta reaproveitada do módulo anterior: cruza o campo estruturado
            // do acolhimento com texto livre da evolução. Informação positiva sempre é
            // preservada; conflito só existe quando outra fonte nega alergia explicitamente.
            const limpar = v => String(v ?? '').replace(/\s+/g, ' ').trim();
            const norm = v => semAcento(limpar(v));
            const ehNegativa = v => /^(?:NG|NGA|NEGA|NEGOU|SEM|NAO POSSUI|NAO TEM|NAO REFERE|NAO RELATA)\s+ALERGIAS?\b/.test(norm(v))
                || /^(NAO|NAO POSSUI|NENHUMA|NENHUMA ALERGIA|NEGADO|NEGATIVO)$/.test(norm(v));
            const ehVazia = v => /^(|—|-|NAO INFORMADO|NAO INFORMADA|NAO PREENCHIDO|SEM INFORMACAO)$/.test(norm(v));
            const positivas = [];
            const fontes = [];
            let negativaAcolhimento = false;
            let negativaEvolucao = false;

            // 1) Campo estruturado "Alergias" do acolhimento.
            for (const rotulo of doc.querySelectorAll('strong,b,label')) {
                if (norm(rotulo.textContent) !== 'ALERGIAS') continue;
                const bloco = rotulo.closest('.grid_8,.grid_16,td,li,.row')
                    || rotulo.parentElement?.closest?.('.grid_8,.grid_16,td,li,.row')
                    || rotulo.parentElement;
                if (!bloco) continue;
                const vals = [...bloco.querySelectorAll('li')]
                    .map(el => limpar(el.textContent))
                    .filter(Boolean)
                    .filter(v => norm(v) !== 'ALERGIAS');
                let valor = vals[0] || limpar(rotulo.nextElementSibling?.textContent || '');
                if (!valor || ehVazia(valor)) continue;
                if (ehNegativa(valor)) {
                    negativaAcolhimento = true;
                    fontes.push('acolhimento');
                } else {
                    positivas.push(valor.slice(0, 160));
                    fontes.push('acolhimento');
                }
            }

            // 2) Evolução / motivo do atendimento. Dá preferência a campos clínicos
            // pequenos para não capturar a página inteira.
            const candidatos = [];
            const add = (texto, fonte) => {
                const t = limpar(texto);
                if (!t || !/ALERG/.test(norm(t)) || t.length < 5 || t.length > 800) return;
                if (candidatos.some(x => norm(x.texto) === norm(t))) return;
                candidatos.push({ texto: t, fonte });
            };
            for (const el of doc.querySelectorAll('textarea[id*="motivo_descricao"],textarea[name*="motivo_descricao"],input[id*="motivo_descricao"],input[name*="motivo_descricao"]')) add(el.value || el.textContent, 'evolução');
            for (const el of doc.querySelectorAll('li,p,span,td,div')) add(el.textContent, 'evolução');
            candidatos.sort((a,b) => a.texto.length - b.texto.length);

            const regexPositivas = [
                /\bALERGIA(?:S)?\s+(?:A|AO|AOS|AS)\s+([^.;,\n<]{2,180})/i,
                /\bAL[EÉ]RGIC[OA]S?\s+(?:A|AO|AOS|AS)\s+([^.;,\n<]{2,180})/i,
                /\b(?:REFERE|RELATA|POSSUI|TEM)\s+ALERGIA(?:S)?\s+(?:A|AO|AOS|AS)\s+([^.;,\n<]{2,180})/i,
                /\bALERGIA(?:S)?\s*:\s*([^.;,\n<]{2,180})/i,
            ];
            for (const c of candidatos) {
                const n = norm(c.texto);
                const negou = /\b(NEGA|NEGOU|SEM|NAO POSSUI|NAO TEM|NAO REFERE|NAO RELATA)\s+ALERGIAS?\b/.test(n)
                    || /\bALERGIAS?\s*:?\s*(NEGA|NEGADA|NAO|NENHUMA)\b/.test(n);
                if (negou) negativaEvolucao = true;
                for (const re of regexPositivas) {
                    const m = c.texto.match(re);
                    if (!m) continue;
                    const antes = norm(c.texto.slice(0, m.index));
                    if (/\b(NEGA|NEGOU|SEM|NAO POSSUI|NAO TEM|NAO REFERE|NAO RELATA)\s*$/.test(antes)) continue;
                    const termo = cortarTermoAlergia(m[1]);
                    if (termo && !ehNegativa(termo) && !ehVazia(termo) && !/^NEGA\b/.test(norm(termo))) {
                        positivas.push(termo.slice(0,160));
                        fontes.push('evolução');
                    }
                    break;
                }
            }
            if (negativaEvolucao) fontes.push('evolução');

            const vistos = new Set();
            const unicas = positivas.filter(v => {
                const k = norm(v);
                if (!k || vistos.has(k)) return false;
                vistos.add(k); return true;
            });
            const negativa = negativaAcolhimento || negativaEvolucao;
            return {
                estado: unicas.length ? 'positiva' : negativa ? 'negativa' : 'desconhecida',
                alergias: unicas,
                conflito: unicas.length > 0 && negativa,
                fontes: [...new Set(fontes)],
            };
        }

        // ── Pendências em outras salas (tela "Consultar Repousos/Medicações") ──
        // As seis tabelas da tela devolvem [data, hora, nascimento, nome, médico,
        // senha, status]; sem filtro, só encaminhamentos ativos.
        const SALAS_CONSULTA = [
            { chave: 'medicacao', nome: 'Medicação', tabela: 'datatable_medicacoes' },
            { chave: 'exames', nome: 'Exames', tabela: 'datatable_exames' },
            { chave: 'repouso', nome: 'Repouso', tabela: 'datatable_repousos' },
            { chave: 'radiografia', nome: 'Raio-X', tabela: 'datatable_radiografias' },
            { chave: 'enfermagem', nome: 'Procedimento de enfermagem', tabela: 'datatable_procedimentos_enfermagem' },
            { chave: 'gesso', nome: 'Gesso / imobilização', tabela: 'datatable_gessos_imobilizacoes' },
        ];

        function linhasConsultaSala(json, sala) {
            const linhas = json && Array.isArray(json.aaData) ? json.aaData : [];
            return linhas.map(l => ({
                sala: sala.chave, salaNome: sala.nome,
                data: String(l[0] || '').trim(), hora: String(l[1] || '').trim(), nascimento: String(l[2] || '').trim(),
                nome: String(l[3] || '').trim(), medico: String(l[4] || '').trim(), senha: String(l[5] || '').trim(),
                status: String(l[6] || '').trim(),
            }));
        }

        // Encaminhamentos ativos do paciente nas outras salas: os do mesmo dia/hora do
        // encaminhamento atual ("deste atendimento") e os abertos nas 24 h antes dele.
        // Mais antigos costumam ser encaminhamentos nunca fechados: só são contados.
        function pendenciasOutrasSalas(linhas, { nome, nascimento, salaAtual = 'medicacao', agora = new Date() }) {
            const alvo = semAcento(nome);
            const doPaciente = linhas.filter(l => alvo && semAcento(l.nome) === alvo && (!nascimento || !l.nascimento || l.nascimento === nascimento));
            const ativo = l => !/FINALIZ|CANCEL|CONCLU/.test(semAcento(l.status));
            const t = l => {
                const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(l.data), h = /^(\d{1,2}):(\d{2})/.exec(l.hora);
                return d ? new Date(+d[3], +d[2] - 1, +d[1], h ? +h[1] : 0, h ? +h[2] : 0).getTime() : 0;
            };
            // Âncora: o encaminhamento da sala atual mais recente (em andamento primeiro).
            const daSala = doPaciente.filter(l => l.sala === salaAtual && ativo(l)).sort((a, b) =>
                (/ANDAMENTO/.test(semAcento(b.status)) - /ANDAMENTO/.test(semAcento(a.status))) || (t(b) - t(a)));
            const ancora = daSala[0] || null;
            const referencia = ancora ? t(ancora) : agora.getTime();
            const todas = doPaciente.filter(l => l.sala !== salaAtual && ativo(l))
                .map(l => Object.assign({}, l, { mesmoAtendimento: !!ancora && l.data === ancora.data && l.hora === ancora.hora }));
            const recente = l => l.mesmoAtendimento || t(l) >= referencia - 24 * 3600e3;
            const outras = todas.filter(recente).sort((a, b) => (b.mesmoAtendimento - a.mesmoAtendimento) || (t(b) - t(a)));
            return { ancora, outras, antigas: todas.length - outras.length };
        }

        // Filtro gravado na sessão pela tela "Consultar Repousos/Medicações" (GET
        // /consultar_repousos_medicacoes/filtrar devolve o formulário com o que está
        // valendo). Com filtro, as tabelas deixam de mostrar só os ativos.
        function filtroConsultaAtivo(doc) {
            const ativos = [];
            for (const sel of doc.querySelectorAll('select[name^="filtro_sala_encaminhamento["]')) {
                const o = sel.querySelector('option[selected]');
                if (o && o.value) ativos.push(`${(sel.closest('li') && sel.closest('li').querySelector('label') || {}).textContent || sel.name}: ${o.textContent.trim()}`.replace(/\s+/g, ' ').replace(/\*/g, ''));
            }
            for (const inp of doc.querySelectorAll('input[name^="filtro_sala_encaminhamento["]')) {
                if (inp.type !== 'hidden' && inp.value) ativos.push(`${(inp.closest('li') && inp.closest('li').querySelector('label') || {}).textContent || inp.name}: ${inp.value}`.replace(/\s+/g, ' ').replace(/\*/g, ''));
            }
            return ativos;
        }

        // Formulário da tela de aplicação (/new) com todos os itens pendentes marcados
        // como cancelados, nos mesmos campos que o botão "Cancelar" de cada item preenche
        // (pendente=false, cancelada=true, para_atendimento=false, para_cancelamento=true,
        // canceled_at, profissional_cancelamento_id, justificativa_cancelamento).
        // Devolve quantos itens foram marcados; erro se faltar algum campo.
        function marcarCancelamento(form, { motivo, momento, reavaliar = false, justificativaReavaliacao = '' }) {
            const just = String(motivo || '').trim();
            if (!just) throw new Error('motivo obrigatório');
            const profissional = (form.querySelector('#current_profissional') || {}).value;
            if (!profissional) throw new Error('profissional atual não encontrado na tela de aplicação');
            const caixa = form.querySelector('#encaminhamento_medicacao_encaminhar_paciente_para_reavaliacao_medica');
            const justEnc = form.querySelector('#encaminhamento_medicacao_justificativa_encaminhamento');
            if (reavaliar && (!caixa || !justEnc)) throw new Error('campo de reavaliação médica não encontrado');
            if (reavaliar && !String(justificativaReavaliacao).trim()) throw new Error('justificativa da reavaliação obrigatória');
            if (caixa) caixa.checked = !!reavaliar;
            if (justEnc) justEnc.value = reavaliar ? String(justificativaReavaliacao).trim() : '';

            let n = 0;
            for (const item of form.querySelectorAll('.item-encaminhamento-controle-salas')) {
                const campo = sufixo => item.querySelector(`input[id$="${sufixo}"], textarea[id$="${sufixo}"]`);
                const pendente = campo('_pendente'), cancelada = campo('_cancelada');
                if (!pendente || !cancelada || pendente.value !== 'true' || cancelada.value === 'true') continue;
                const em = campo('_canceled_at'), prof = campo('_profissional_cancelamento_id'), j = campo('_justificativa_cancelamento');
                if (!em || !prof || !j) throw new Error('campos de cancelamento incompletos na tela de aplicação');
                pendente.value = 'false';
                cancelada.value = 'true';
                const pa = campo('_para_atendimento'), pc = campo('_para_cancelamento');
                if (pa) pa.value = 'false';
                if (pc) pc.value = 'true';
                em.value = momento;
                prof.value = profissional;
                j.value = just;
                n++;
            }
            return n;
        }

        // Corpo x-www-form-urlencoded do formulário, como o navegador enviaria
        // (sem campos desabilitados, sem caixas desmarcadas, sem botões).
        function serializarFormulario(form) {
            const corpo = new URLSearchParams();
            for (const el of form.elements) {
                if (!el.name || el.disabled) continue;
                const tipo = (el.type || '').toLowerCase();
                if (['submit', 'button', 'reset', 'image', 'file'].includes(tipo)) continue;
                if ((tipo === 'checkbox' || tipo === 'radio') && !el.checked) continue;
                if (el.tagName === 'SELECT') {
                    for (const o of el.options) if (o.selected) corpo.append(el.name, o.value);
                    continue;
                }
                corpo.append(el.name, el.value);
            }
            return corpo;
        }

        // A resposta do salvar (JS do Rails) termina a senha com
        // concluirSenhaOpcional("controle_de_salas_medicacao", { atendimento_id: N, atendimento_type: "..." }).
        function conclusaoSenha(texto) {
            const m = /concluirSenhaOpcional\(\s*["']([^"']+)["']\s*,\s*\{[\s\S]*?atendimento_id\s*:\s*["']?(\d+)["']?\s*,[\s\S]*?atendimento_type\s*:\s*["']([^"']+)["'][\s\S]*?\}\s*\)/.exec(String(texto || ''));
            return m ? { tipo: m[1], atendimentoId: +m[2], atendimentoType: m[3] } : null;
        }

        // Resposta do salvar. Com erro de validação o servidor responde 200 e
        // redesenha o formulário ($('.form').replaceWith(...)) com as mensagens em
        // .inline-errors (visto na captura de 01/10: "não é compatível com a
        // ocupação do profissional").
        function resultadoSalvar(texto) {
            const t = String(texto || '');
            const erros = [];
            const re = /inline-errors\\?["'][^>]*>([^<]+)</g;
            for (let m; (m = re.exec(t));) erros.push(m[1].replace(/\\(.)/g, '$1').trim());
            const redesenhou = /\$\(\s*["']\.form["']\s*\)\.replaceWith/.test(t);
            return { ok: !redesenhou && !erros.length, erros, conclusao: conclusaoSenha(t) };
        }

        // ── Ficha de medicação em PDF (wkhtmltopdf): só o texto, sem DOM ──────────
        async function inflarPdf(bytes) {
            const r = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')));
            return new Uint8Array(await r.arrayBuffer());
        }
        function cmapPdf(t) {
            const mapa = new Map();
            const u = h => { let o = ''; for (let i = 0; i + 4 <= h.length; i += 4) o += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return o; };
            for (const bloco of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
                for (const m of bloco[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) mapa.set(parseInt(m[1], 16), u(m[2]));
            for (const bloco of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
                for (const m of bloco[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f]+>)/g)) {
                    const ini = parseInt(m[1], 16), fim = parseInt(m[2], 16);
                    if (m[3][0] === '[') {
                        const arr = Array.from(m[3].matchAll(/<([0-9A-Fa-f]+)>/g), x => u(x[1]));
                        for (let c = ini; c <= fim && c - ini < arr.length; c++) mapa.set(c, arr[c - ini]);
                    } else {
                        const base = m[3].slice(1, -1), ult = parseInt(base.slice(-4), 16);
                        for (let c = ini; c <= fim; c++) mapa.set(c, u(base.slice(0, -4) + (ult + c - ini).toString(16).padStart(4, '0')));
                    }
                }
            return mapa;
        }
        // Texto da ficha, em linhas na ordem de leitura (colunas da mesma linha separadas por 2 espaços).
        async function lerTextoFichaPdf(arrayBuffer) {
            try {
                const bytes = new Uint8Array(arrayBuffer);
                let bin = '';
                for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
                const objs = new Map(); // número → { dic, dados (bytes decodificados) | null }
                for (const m of bin.matchAll(/(\d+)\s+\d+\s+obj\b/g)) {
                    const ini = m.index + m[0].length;
                    const fimObj = bin.indexOf('endobj', ini);
                    if (fimObj < 0) continue;
                    const corpo = bin.slice(ini, fimObj);
                    const posS = corpo.indexOf('stream');
                    if (posS < 0) { objs.set(m[1], { dic: corpo, dados: null }); continue; }
                    const dic = corpo.slice(0, posS);
                    let a = ini + posS + 6;
                    if (bin[a] === '\r') a++;
                    if (bin[a] === '\n') a++;
                    let e = bin.indexOf('endstream', a);
                    if (e < 0) e = fimObj;
                    let dados = bytes.subarray(a, e);
                    if (/FlateDecode/.test(dic)) {
                        // O fim do stream costuma ter \r\n antes de "endstream"; o inflate rejeita lixo no final.
                        let ok = null;
                        for (let cortar = 0; cortar <= 2 && !ok; cortar++) { try { ok = await inflarPdf(dados.subarray(0, dados.length - cortar)); } catch (_) { /* tenta cortar mais um byte */ } }
                        dados = ok;
                    }
                    objs.set(m[1], { dic, dados });
                }
                const latin1 = u8 => { let o = ''; for (let i = 0; i < u8.length; i += 8192) o += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return o; };
                const texto = n => { const o = objs.get(String(n)); return o && o.dados ? latin1(o.dados) : ''; };
                const cmaps = new Map(); // número da fonte → Map
                const cmapDaFonte = n => {
                    if (cmaps.has(n)) return cmaps.get(n);
                    const o = objs.get(String(n));
                    const tu = o && /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(o.dic);
                    const mapa = tu ? cmapPdf(texto(tu[1])) : new Map();
                    cmaps.set(n, mapa);
                    return mapa;
                };
                const paginas = [];
                for (const [num, o] of objs) {
                    if (!/\/Type\s*\/Page\b(?!s)/.test(o.dic)) continue;
                    paginas.push({ num: +num, dic: o.dic });
                }
                paginas.sort((a, b) => a.num - b.num);
                const linhasTodas = [];
                for (const pg of paginas) {
                    // Fontes da página: /Font << /F6 6 0 R ... >> (inline ou em objeto de /Resources).
                    let recursos = pg.dic;
                    const rr = /\/Resources\s+(\d+)\s+0\s+R/.exec(pg.dic);
                    if (rr && objs.get(rr[1])) recursos = objs.get(rr[1]).dic;
                    const fontes = new Map();
                    let fd = /\/Font\s*<<([\s\S]*?)>>/.exec(recursos);
                    if (!fd) { const fr = /\/Font\s+(\d+)\s+0\s+R/.exec(recursos); if (fr && objs.get(fr[1])) fd = [0, objs.get(fr[1]).dic]; }
                    if (fd) for (const m of fd[1].matchAll(/\/(\S+?)\s+(\d+)\s+0\s+R/g)) fontes.set(m[1], cmapDaFonte(m[2]));
                    // Conteúdo: /Contents N 0 R ou [N 0 R ...].
                    const ct = /\/Contents\s*(\[[^\]]*\]|\d+\s+0\s+R)/.exec(pg.dic);
                    const conteudo = ct ? Array.from(ct[1].matchAll(/(\d+)\s+0\s+R/g), x => texto(x[1])).join('\n') : '';
                    const segs = [];
                    let fonte = new Map(), tam = 12, tm = [1, 0, 0, 1, 0, 0], atual = null;
                    const abrir = () => { atual = { x: tm[4], y: tm[5], t: '' }; segs.push(atual); };
                    const decodifica = (hex) => {
                        const mapa = fonte; let o = '';
                        for (let i = 0; i + 4 <= hex.length; i += 4) o += mapa.get(parseInt(hex.slice(i, i + 4), 16)) || '';
                        return o;
                    };
                    const literal = s => s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[c] ?? (/[0-7]/.test(c[0]) ? String.fromCharCode(parseInt(c, 8)) : c)));
                    const emite = t => { if (!atual) abrir(); atual.t += t; };
                    const re = /\/(\S+?)\s+([\d.+-]+)\s+Tf|([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+Tm|([\d.+-]+)\s+([\d.+-]+)\s+(Td|TD)|\bT\*|\bBT\b|\bET\b|\[((?:[^\]\\]|\\.)*)\]\s*TJ|<([0-9A-Fa-f\s]*)>\s*Tj|\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
                    for (let m; (m = re.exec(conteudo));) {
                        const k = m[0];
                        if (m[1] !== undefined) { fonte = fontes.get(m[1]) || new Map(); tam = parseFloat(m[2]) || 12; }
                        else if (m[3] !== undefined) { tm = [3, 4, 5, 6, 7, 8].map(i => parseFloat(m[i])); atual = null; }
                        else if (m[11] !== undefined) {
                            const tx = parseFloat(m[9]), ty = parseFloat(m[10]);
                            tm = [tm[0], tm[1], tm[2], tm[3], tm[4] + tx * tm[0] + ty * tm[2], tm[5] + tx * tm[1] + ty * tm[3]];
                            if (ty !== 0 || tx > tam * 1.6 || tx < 0) atual = null;
                        }
                        else if (k === 'T*') atual = null;
                        else if (k === 'BT') { tm = [1, 0, 0, 1, 0, 0]; atual = null; }
                        else if (k === 'ET') atual = null;
                        else if (m[12] !== undefined) {
                            for (const p of m[12].matchAll(/<([0-9A-Fa-f\s]*)>|\(((?:[^()\\]|\\.)*)\)|(-?[\d.]+)/g)) {
                                if (p[1] !== undefined) emite(decodifica(p[1].replace(/\s+/g, '')));
                                else if (p[2] !== undefined) emite(literal(p[2]));
                                else if (parseFloat(p[3]) < -tam * 200 / 1000 * 3) emite(' ');
                            }
                        }
                        else if (m[13] !== undefined) emite(decodifica(m[13].replace(/\s+/g, '')));
                        else if (m[14] !== undefined) emite(literal(m[14]));
                    }
                    // Agrupa por y (tolerância 2) e ordena por x dentro da linha.
                    const grupos = [];
                    for (const sg of segs.filter(x => x.t.trim()).sort((a, b) => a.y - b.y || a.x - b.x)) {
                        const g = grupos.find(x => Math.abs(x.y - sg.y) < 2);
                        if (g) g.s.push(sg); else grupos.push({ y: sg.y, s: [sg] });
                    }
                    grupos.sort((a, b) => a.y - b.y);
                    for (const g of grupos) linhasTodas.push(g.s.sort((a, b) => a.x - b.x).map(x => x.t.replace(/\s+/g, ' ').trim()).join('  '));
                }
                return linhasTodas;
            } catch (_) { return []; }
        }
        // Blocos "Medicamento … Situação / produto  SITUAÇÃO / … / Data: dd/mm/aaaa hh:mm:ss".
        function horariosFichaPdf(linhas) {
            const saida = [];
            try {
                let estado = '', acc = [], produto = '', situacao = '';
                for (const linha of linhas || []) {
                    const s = semAcento(linha);
                    if (/^MEDICAMENTO\b.*\bSITUACAO$/.test(s)) { estado = 'produto'; acc = []; produto = ''; situacao = ''; continue; }
                    if (estado === 'produto') {
                        const m = /^(.*?)\s*\b(ATENDIDA|CANCELADA|PENDENTE|REALIZADA|SUSPENSA)$/.exec(s);
                        if (m) { produto = [...acc, m[1]].join(' ').replace(/\s+/g, ' ').trim(); situacao = m[2]; estado = 'data'; }
                        else if (/^POSOLOGIA$/.test(s)) estado = '';
                        else acc.push(linha.trim());
                    } else if (estado === 'data') {
                        const m = /^DATA\s*:\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)/.exec(s);
                        if (m) { saida.push({ produto, situacao, data: `${m[1]} ${m[2].length === 5 ? m[2] + ':00' : m[2]}` }); estado = ''; }
                    }
                }
            } catch (_) { return []; }
            return saida;
        }

        return {
            RISCO_ORDEM, PERIODOS, dataHora, riscoOrdem, periodoParams, aplicarPeriodo, chaveParams, queryAxios, ordenar, filtrar,
            juntarPaginas, espera, esperaAteChamada, resumo, classesLinhas, STATUS_HISTORICO, ordenarHistorico, classesHistorico, podarRegistro, filtrosParaSalvar, filtrosParaRestaurar, isoDia,
            via, semAcento, extrairMedicacoesConsulta, lerTextoFichaPdf, horariosFichaPdf, municipeIdConsulta, escolherMunicipe, soDigitos, formatarCPF, formatarCNS, classificarCpfCns, interpretarAlergia, SALAS_CONSULTA, linhasConsultaSala, pendenciasOutrasSalas, filtroConsultaAtivo, marcarCancelamento, serializarFormulario, conclusaoSenha, resultadoSalvar,
        };
    }
    // #endregion nucleo

    const N = criarNucleo();
    const CHAVE_CONFIG = 'cs-fila-config';
    const CHAVE_FILTROS = 'cs-fila-filtros';
    const CHAVE_MOTIVOS = 'cs-motivos-cancelamento';
    const CHAVE_REGISTRO = 'cs-registro-cancelamentos';
    const CHAVE_ULTIMA_LISTA = 'cs-ultima-lista'; // url da última lista carregada (sala)
    const CHAVE_ULTIMO_TOTAL = 'cs-ultimo-total'; // quantos vieram na última carga (páginas a adiantar)
    const POR_PAGINA = 100;
    const MAX_PAGINAS = 20; // 2000 encaminhamentos no período é o teto
    const MOTIVOS_PADRAO = [
        'Paciente recusou a medicação.',
        'Paciente não compareceu à sala de medicação após ser chamado.',
        'Medicação em falta na unidade no momento.',
        'Medicação já administrada anteriormente.',
        'Prescrição suspensa/alterada pelo médico.',
        'Difícil acesso venoso.',
    ];
    const MOTIVOS_LEGADO = [
        'Atendimento realizado manualmente.',
        'Paciente evadiu-se.',
        'Paciente negou a medicação.',
        'Outro',
    ];

    function lerJSON(chave, padrao) {
        try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; }
    }
    function gravarJSON(chave, valor) {
        try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem armazenamento */ }
    }
    function lerConfig() {
        const c = lerJSON(CHAVE_CONFIG, {});
        return {
            periodo: (N.PERIODOS[c.periodo] || c.periodo === 'datas') ? c.periodo : 'hoje',
            mostrar: ['todos', 'historico'].includes(c.mostrar) ? c.mostrar : 'todos',
            medicacoes: true,
            dataInicial: /^\d{4}-\d{2}-\d{2}$/.test(c.dataInicial || '') ? c.dataInicial : '',
            dataFinal: /^\d{4}-\d{2}-\d{2}$/.test(c.dataFinal || '') ? c.dataFinal : '',
        };
    }

    function estilo(css) {
        const s = document.createElement('style');
        s.textContent = css;
        const por = () => (document.head || document.documentElement).appendChild(s);
        // Em document-start o <html> pode ainda não existir.
        if (document.documentElement) por();
        else new MutationObserver((_, obs) => {
            if (!document.documentElement) return;
            obs.disconnect();
            por();
        }).observe(document, { childList: true });
    }

    function esc(t) {
        return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function swalSeguro(opcoes) {
        if (typeof window.swal === 'function') return Promise.resolve(window.swal(opcoes)).catch(() => false);
        window.alert([opcoes.title, (opcoes.html || '').replace(/<[^>]+>/g, '')].filter(Boolean).join('\n\n'));
        return Promise.resolve(true);
    }

    function confirmar(titulo, html) {
        if (typeof window.swal !== 'function') return Promise.resolve(window.confirm(titulo));
        return Promise.resolve(window.swal({
            type: 'warning', title: titulo, html, showCancelButton: true,
            confirmButtonText: 'Sim', cancelButtonText: 'Não',
        })).then(() => true, () => false);
    }

    // ── Motivos rápidos de cancelamento (lista e tela de aplicação) ──────────
    estilo(`
        .cs-motivos { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; margin:10px 0 6px; }
        .cs-motivos button { border:1px solid #c9d1da; background:#f4f6f8; border-radius:14px; padding:4px 10px;
            font-size:13px; cursor:pointer; }
        .cs-motivos button:hover { background:#e3e9ef; }
        .cs-motivos .cs-editar { background:none; border:none; color:#2b6cb0; text-decoration:underline; }
        .cs-editor { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:100000; display:flex; align-items:center; justify-content:center; }
        .cs-editor > div { background:#fff; border-radius:8px; padding:16px; width:min(560px,92vw); max-height:88vh; overflow:auto; box-shadow:0 8px 30px rgba(0,0,0,.25); }
        .cs-editor textarea { width:100%; height:200px; box-sizing:border-box; font-size:13px; }
        .cs-editor .cs-acoes { display:flex; gap:8px; justify-content:flex-end; margin-top:8px; }
        .cs-editor .cs-data-modal { width:min(430px,92vw); }
        .cs-editor .cs-data-modal > b { display:block; margin-bottom:12px; font-size:14px; color:#263442; }
        .cs-editor .cs-data-campos { display:flex; gap:10px; align-items:flex-end; margin:0 0 14px; }
        .cs-editor .cs-data-campos label { flex:1; margin:0; font-weight:600; color:#3f4b57; }
        .cs-editor .cs-data-campos input.form-control { margin-top:5px; height:34px; border:1px solid #cfd7df; border-radius:6px; box-shadow:none; }
        .cs-editor .cs-data-modal .cs-acoes { margin-top:4px; }
        .cs-editor .cs-data-modal .cs-acoes button { height:32px; border-radius:6px; padding:0 13px; border:1px solid #cfd7df; font-size:13px; font-weight:600; cursor:pointer; transition:background .12s,border-color .12s,box-shadow .12s; }
        .cs-editor .cs-data-modal .cs-acoes button[data-a="limpar"] { background:#fff; color:#5c6670; }
        .cs-editor .cs-data-modal .cs-acoes button[data-a="limpar"]:hover { background:#f5f7f9; border-color:#b8c2cc; }
        .cs-editor .cs-data-modal .cs-acoes button[data-a="sair"] { background:#eef2f6; color:#34404c; }
        .cs-editor .cs-data-modal .cs-acoes button[data-a="sair"]:hover { background:#e4e9ee; border-color:#b8c2cc; }
        .cs-editor .cs-data-modal .cs-acoes button[data-a="ok"] { background:#08b6ce; border-color:#08b6ce; color:#fff; box-shadow:0 1px 2px rgba(8,182,206,.18); }
        .cs-editor .cs-data-modal .cs-acoes button[data-a="ok"]:hover { background:#069fb5; border-color:#069fb5; }
    `);

    function motivos() {
        const m = lerJSON(CHAVE_MOTIVOS, null);
        if (!Array.isArray(m) || !m.length) return MOTIVOS_PADRAO.slice();

        // Migração automática do conjunto antigo que ainda tinha "Paciente evadiu-se".
        // Se o usuário realmente personalizou a lista, preserva os itens, mas remove
        // apenas esse motivo que já foi aposentado.
        const legado = m.length === MOTIVOS_LEGADO.length &&
            m.every((x, i) => String(x || '').trim() === MOTIVOS_LEGADO[i]);
        if (legado) {
            gravarJSON(CHAVE_MOTIVOS, MOTIVOS_PADRAO);
            return MOTIVOS_PADRAO.slice();
        }

        const limpos = m
            .map(x => String(x || '').trim())
            .filter(Boolean)
            .filter(x => semAcento(x) !== 'PACIENTE EVADIU-SE.');
        return limpos.length ? limpos : MOTIVOS_PADRAO.slice();
    }

    function editarMotivos(depois) {
        const fundo = document.createElement('div');
        fundo.className = 'cs-editor';
        fundo.innerHTML = `<div><b>Motivos rápidos de cancelamento</b><p style="margin:4px 0 8px;color:#555">Um por linha. Linha vazia volta ao padrão.</p>
            <textarea></textarea><div class="cs-acoes"><button type="button" data-a="padrao">Restaurar padrão</button>
            <button type="button" data-a="sair">Fechar</button><button type="button" data-a="salvar" class="btn btn-primary">Salvar</button></div></div>`;
        const ta = fundo.querySelector('textarea');
        ta.value = motivos().join('\n');
        fundo.addEventListener('click', ev => {
            const a = ev.target.dataset && ev.target.dataset.a;
            if (ev.target === fundo || a === 'sair') fundo.remove();
            if (a === 'padrao') ta.value = MOTIVOS_PADRAO.join('\n');
            if (a === 'salvar') {
                const lista = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
                gravarJSON(CHAVE_MOTIVOS, lista.length ? lista : MOTIVOS_PADRAO);
                fundo.remove();
                if (depois) depois();
            }
        });
        document.body.appendChild(fundo);
        ta.focus();
    }

    function botoesMotivos(aoEscolher) {
        const box = document.createElement('div');
        box.className = 'cs-motivos';
        const desenhar = () => {
            box.innerHTML = motivos().map((m, i) => `<button type="button" data-i="${i}">${esc(m)}</button>`).join('')
                + '<button type="button" class="cs-editar" data-editar="1">editar motivos</button>';
        };
        desenhar();
        box.addEventListener('click', ev => {
            const b = ev.target.closest('button');
            if (!b) return;
            ev.preventDefault();
            if (b.dataset.editar) return editarMotivos(desenhar);
            aoEscolher(motivos()[+b.dataset.i]);
        });
        return box;
    }

    // ── Título da aba ────────────────────────────────────────────────────────
    // Nestas telas o título é deste script. Outros scripts (ex.: "Saúde Simples -
    // Atualizar título + logo") reescrevem document.title a cada mudança na página:
    // as escritas de fora são ignoradas e, se mesmo assim a tag <title> mudar, o
    // título daqui volta.
    const TITULO = { atual: '', escrever: null, vigia: null };
    function travarTitulo() {
        const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
        if (desc && desc.set && desc.get) {
            TITULO.escrever = v => desc.set.call(document, v);
            try {
                Object.defineProperty(document, 'title', { configurable: true, get() { return desc.get.call(document); }, set() { /* ignorado */ } });
            } catch (e) { TITULO.escrever = null; }
        }
        const vigiar = () => {
            const el = document.querySelector('head > title');
            if (!el || TITULO.vigia) return !!el;
            TITULO.vigia = new MutationObserver(() => {
                if (TITULO.atual && el.textContent !== TITULO.atual) escreverTitulo(TITULO.atual);
            });
            TITULO.vigia.observe(el, { childList: true, characterData: true, subtree: true });
            return true;
        };
        if (!vigiar()) document.addEventListener('DOMContentLoaded', vigiar);
    }
    function escreverTitulo(t) {
        if (TITULO.escrever) TITULO.escrever(t);
        else document.title = t;
    }
    function definirTitulo(t) {
        if (!t || (t === TITULO.atual && document.title === t)) return;
        TITULO.atual = t;
        escreverTitulo(t);
    }

    const caminho = location.pathname.replace(/\/+$/, '');
    const CS_PRESENCA_FILHA='cs-presenca-filho';
    const CS_ATENDIMENTO_PA_FILHO='om30-atendimento-pa-filho-v1';
    const CS_ATENDIMENTO_CHAMADO='om30-atendimento-pa-chamado-v1';

    // Mantém o AtendimentoPa preso à aba filha durante TODO o percurso entre salas.
    // Query string pode desaparecer quando o Saúde Simples redireciona Medicação ->
    // Raio-X/Exames/Enfermagem; sessionStorage permanece na mesma aba e evita perder
    // a identidade do episódio.
    (function csSemearAtendimentoPaFilho(){
        try {
            const q=new URLSearchParams(location.search);
            let id=String(q.get('om30_atendimento_pa')||'').match(/\d+/)?.[0]||'';
            if(!id){
                const filho=JSON.parse(sessionStorage.getItem(CS_PRESENCA_FILHA)||'null');
                id=String(filho?.atendimento||'').match(/^AtendimentoPa#(\d+)$/i)?.[1]||'';
            }
            if(!id){
                const chamado=JSON.parse(localStorage.getItem(CS_ATENDIMENTO_CHAMADO)||'null');
                if(chamado&&Date.now()-Number(chamado.em||0)<30*60*1000){
                    id=String(chamado.atendimento||'').match(/^AtendimentoPa#(\d+)$/i)?.[1]||'';
                }
            }
            if(!id){
                const seed=JSON.parse(localStorage.getItem('cs-presenca-seed')||'null');
                if(seed&&Date.now()-Number(seed.em||0)<30*60*1000){
                    id=String(seed.atendimento||'').match(/^AtendimentoPa#(\d+)$/i)?.[1]||'';
                }
            }
            if(id) sessionStorage.setItem(CS_ATENDIMENTO_PA_FILHO,id);
        } catch(_) {}
    })();
    function csAtendimentoPres(str){const m=String(str||'').match(/^([A-Za-z0-9_]+)#(\d+)$/);if(!m||!/^Atendimento/i.test(m[1]))return null;const t=m[1].toLowerCase(),id=m[2];let p;if(t==='atendimentopa')p='1';else if(t==='atendimentoambulatorial')p='2';else{let h=0;for(const ch of t)h=(h*31+ch.charCodeAt(0))%900000;p=String(100000+h);}return{tipo:m[1],id,bruto:`${m[1]}#${id}`,chave:`${p}${id}`};}
    const CS_PRES_COOLDOWN='om30-presenca-cloudflare-cooldown-v1';
    function csPresCooldownAte(){
        try{return Number(localStorage.getItem(CS_PRES_COOLDOWN)||0)||0;}catch(_){return Number(window.__csPresCooldownAte||0)||0;}
    }
    function csPresMarcarCooldown(ms=180000){
        const ate=Date.now()+Math.max(30000,Number(ms)||180000);
        window.__csPresCooldownAte=ate;
        try{localStorage.setItem(CS_PRES_COOLDOWN,String(ate));}catch(_){}
        return ate;
    }
    function csPresLimparCooldown(){
        window.__csPresCooldownAte=0;
        try{localStorage.removeItem(CS_PRES_COOLDOWN);}catch(_){}
    }
    const CS_REQ_DIA='om30-cloudflare-requests-dia-v1';
    function csContarReqLocal(path){
        try{
            const hoje=new Date().toISOString().slice(0,10);
            let d=JSON.parse(localStorage.getItem(CS_REQ_DIA)||'null');
            if(!d||d.dia!==hoje)d={dia:hoje,total:0,porEndpoint:{}};
            d.total=Number(d.total||0)+1;
            const ep=String(path||'');
            d.porEndpoint[ep]=Number(d.porEndpoint[ep]||0)+1;
            localStorage.setItem(CS_REQ_DIA,JSON.stringify(d));
            window.__OM30_CLOUDFLARE_USO_LOCAL__=d;
        }catch(_){}
    }
    async function csPresReq(path,payload,keepalive=false){
        const ate=csPresCooldownAte();
        if(Date.now()<ate)throw new Error(`Ponte Cloudflare em cooldown por ${Math.ceil((ate-Date.now())/1000)}s`);
        const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),5000);
        try{
            csContarReqLocal(path);
            const r=await fetch('https://om30-fluxo-controle-salas.om30-pedro.workers.dev'+path,{
                method:'POST',mode:'cors',cache:'no-store',credentials:'omit',keepalive,signal:ctrl.signal,
                headers:{'Content-Type':'application/json','X-OM30-Key':'om302026'},
                body:JSON.stringify(payload||{})
            });
            const txt=await r.text();let j={};try{j=JSON.parse(txt||'{}')}catch(_){}
            if(r.status===429){csPresMarcarCooldown();throw new Error('HTTP 429: limite temporário da ponte Cloudflare');}
            if(!r.ok||!j.ok)throw new Error(`HTTP ${r.status}: ${txt||'erro'}`);
            csPresLimparCooldown();
            return j;
        }catch(e){
            if(e?.name==='TypeError'||/Failed to fetch|NetworkError|Load failed/i.test(String(e?.message||e)))csPresMarcarCooldown();
            throw e;
        }finally{clearTimeout(timer);}
    }

    function csSalaAtualPresenca(){
        const p=location.pathname.replace(/\/+$/,'');
        if(/^\/aplicacoes_medicamentos(?:\/new|\/create)?$/.test(p))return 'medicacao';
        if(/^\/encaminhamentos_exames\/\d+\/edit$/.test(p))return 'exames';
        if(/^\/encaminhamentos_radiografias\/\d+\/edit$/.test(p))return 'radiografia';
        if(/^\/encaminhamentos_procedimentos_enfermagem\/\d+\/edit$/.test(p))return 'enfermagem';
        if(/^\/encaminhamentos_gessos_imobilizacoes\/\d+\/edit$/.test(p))return 'gesso';
        if(/^\/encaminhamentos_repousos\/\d+\/edit$/.test(p))return 'repouso';
        return '';
    }

    function csAtendimentoAtualPresenca(info){
        const candidatos=[];
        if(info?.atendimento)candidatos.push(info.atendimento);
        try{
            const q=new URLSearchParams(location.search);
            const id=q.get('om30_atendimento_pa');
            if(id)candidatos.push(`AtendimentoPa#${id}`);
        }catch(_){}
        try{
            const id=sessionStorage.getItem(CS_ATENDIMENTO_PA_FILHO);
            if(id)candidatos.push(`AtendimentoPa#${id}`);
        }catch(_){}
        for(const el of document.querySelectorAll('[atendimento-id]')){
            const tipo=String(el.getAttribute('atendimento-type')||el.getAttribute('atendimento_type')||'AtendimentoPa');
            const id=String(el.getAttribute('atendimento-id')||'').match(/\d+/)?.[0]||'';
            if(id)candidatos.push(`${tipo}#${id}`);
        }
        try{
            const seed=JSON.parse(localStorage.getItem('cs-presenca-seed')||'null');
            if(seed?.atendimento)candidatos.push(seed.atendimento);
        }catch(_){}
        for(const v of candidatos){const a=csAtendimentoPres(v);if(a)return a;}
        return null;
    }

    const CS_USUARIO_CACHE='om30-presenca-usuario-v1';

    function csTextoUsuarioValido(valor){
        const t=String(valor||'').replace(/\s+/g,' ').trim();
        if(t.length<5||t.length>100)return '';
        if(/Minha Conta|Sair|Logout|Entrar|Menu|Notifica[cç][aã]o|Configura[cç][oõ]es/i.test(t))return '';
        if(/^\d+$/.test(t))return '';
        return t;
    }

    function csNomeUsuario(){
        // Primeiro tenta o padrão mais específico já usado no Procedimentos PA:
        // "NOME DO PROFISSIONAL | XX000". Se não existir neste layout, cai nos
        // seletores genéricos abaixo.
        const candidatosPa=[...document.querySelectorAll(
            '.navbar a,.navbar button,.navbar .dropdown-toggle,'+
            'nav a,nav button,.topbar a,.topbar button'
        )]
            .map(el=>String(el.textContent||'').replace(/\s+/g,' ').trim())
            .filter(t=>t.length>=5&&t.length<=180)
            .filter(t=>/\|\s*[A-Z]{1,8}\s*\d{2,}$/i.test(t));
        if(candidatosPa.length){
            const melhor=candidatosPa.sort((a,b)=>b.length-a.length)[0];
            const nome=melhor.replace(/\s*\|\s*[A-Z]{1,8}\s*\d{2,}\s*$/i,'').trim();
            const valido=csTextoUsuarioValido(nome);
            if(valido)return valido;
        }

        const seletores=[
            '.navbar .dropdown-toggle',
            '.navbar-nav .dropdown-toggle',
            '.user-menu .dropdown-toggle',
            '.user-menu',
            '.username',
            '[data-user-name]',
            '[data-usuario-nome]',
            '[data-profissional-nome]',
            '[aria-label*="usuário" i]',
            '[aria-label*="usuario" i]',
            '[title*="usuário" i]',
            '[title*="usuario" i]'
        ];
        for(const sel of seletores){
            for(const el of document.querySelectorAll(sel)){
                const atributos=[
                    el.getAttribute?.('data-user-name'),
                    el.getAttribute?.('data-usuario-nome'),
                    el.getAttribute?.('data-profissional-nome'),
                    el.getAttribute?.('aria-label'),
                    el.getAttribute?.('title'),
                    el.textContent
                ];
                for(const bruto of atributos){
                    const t=csTextoUsuarioValido(bruto);
                    if(t)return t;
                }
            }
        }

        // Alguns layouts deixam o nome junto ao link de conta/sair.
        for(const a of document.querySelectorAll('a[href*="logout" i],a[href*="sign_out" i],a[href*="minha_conta" i],a[href*="perfil" i]')){
            const alvos=[a.previousElementSibling,a.parentElement?.querySelector?.('.name,.nome,.username'),a.parentElement];
            for(const el of alvos){
                const t=csTextoUsuarioValido(el?.textContent);
                if(t&&!/Sair|Logout/i.test(t))return t;
            }
        }

        return '';
    }

    function csActorAtual(){
        const seletores=[
            '#current_profissional',
            'input[name="current_profissional"]',
            'input[id$="_current_profissional"]',
            'input[name$="[current_profissional]"]'
        ];
        for(const sel of seletores){
            for(const el of document.querySelectorAll(sel)){
                const v=String(el.value||'').trim();
                if(v)return v;
            }
        }
        return '';
    }

    async function csIdentidadeUsuario(){
        let nome=csNomeUsuario();
        let actor=csActorAtual();

        // Fallback adicional do Procedimentos PA: alguns layouts deixam
        // o usuário logado exposto em globals do próprio Saúde Simples.
        if(!nome){
            const objs=[
                window.currentUser,
                window.current_user,
                window.usuarioLogado,
                window.usuario_logado,
                window.loggedUser,
                window.logged_user,
                window.gon?.current_user,
                window.gon?.user
            ];
            for(const o of objs){
                if(!o||typeof o!=='object')continue;
                const candidato=csTextoUsuarioValido(
                    o.nome||o.name||o.nome_completo||o.full_name||o.login||''
                );
                if(candidato){
                    nome=candidato;
                    if(!actor)actor=String(o.id||o.user_id||o.usuario_id||o.profissional_id||'');
                    break;
                }
            }
        }

        if(nome){
            try{localStorage.setItem(CS_USUARIO_CACHE,JSON.stringify({nome,actor,em:Date.now()}));}catch(_){}
            return {nome,actor};
        }

        // /current_usuario não existe nesta instalação (404). Reaproveita o último
        // nome confirmado neste navegador apenas por curto período.
        try{
            const c=JSON.parse(localStorage.getItem(CS_USUARIO_CACHE)||'null');
            if(c?.nome&&Date.now()-Number(c.em||0)<8*60*60*1000){
                nome=csTextoUsuarioValido(c.nome);
                if(!actor)actor=String(c.actor||'');
            }
        }catch(_){}

        return {nome,actor};
    }

    function csAgendarRetryPresenca(info,tentativa,motivo){
        // Não desiste mais depois de poucos segundos. Enquanto a ficha estiver aberta,
        // tenta novamente sem tocar no Cloudflare até AtendimentoPa/sala/usuário existirem.
        const atraso=tentativa<6 ? Math.min(5000,900+(tentativa*650)) : 15000;
        clearTimeout(window.__csRetryPresenca);
        window.__csRetryPresenca=setTimeout(()=>{
            if(document.visibilityState==='hidden'){
                csAgendarRetryPresenca(info,tentativa+1,motivo);
                return;
            }
            csRegistrarPresencaFilha(info,tentativa+1).catch(e=>
                console.warn('[OM30 PRESENÇA] retry falhou:',e?.message||e)
            );
        },atraso);
        if(tentativa<6||tentativa%4===0){
            console.warn('[OM30 PRESENÇA] aguardando dados para registrar presença',{
                tentativa:tentativa+1,motivo,proximaTentativaMs:atraso
            });
        }
    }

    function csInstalarRecuperacaoPresenca(){
        if(window.__csPresencaRecuperacaoInstalada)return;
        window.__csPresencaRecuperacaoInstalada=true;
        const renovar=()=>{
            if(document.visibilityState==='hidden')return;
            if(typeof window.__csRenovarPresenca==='function'){
                Promise.resolve(window.__csRenovarPresenca()).catch(()=>{});
            }else{
                clearTimeout(window.__csRetryPresenca);
                csRegistrarPresencaFilha({},0).catch(()=>{});
            }
        };
        window.addEventListener('focus',renovar,{passive:true});
        window.addEventListener('pageshow',renovar,{passive:true});
        window.addEventListener('online',renovar,{passive:true});
        document.addEventListener('visibilitychange',()=>{
            if(document.visibilityState==='visible')renovar();
        },{passive:true});
    }

    async function csRegistrarPresencaFilha(info={},tentativa=0){
        // Instala recuperação antes mesmo do primeiro sucesso: foco/retorno da aba
        // também pode destravar DOM/identidade que ainda não existiam na abertura.
        csInstalarRecuperacaoPresenca();
        const a=csAtendimentoAtualPresenca(info);
        const sala=csSalaAtualPresenca()||String(info?.sala||'');
        if(!a||!sala){
            csAgendarRetryPresenca(info,tentativa,!a?'AtendimentoPa ainda não identificado':'sala ainda não identificada');
            return;
        }

        try{sessionStorage.setItem(CS_ATENDIMENTO_PA_FILHO,a.id);}catch(_){}

        const {nome,actor}=await csIdentidadeUsuario();
        if(!nome){
            csAgendarRetryPresenca(info,tentativa,'nome do profissional ainda não identificado');
            return;
        }

        let anterior=null;
        try{anterior=JSON.parse(sessionStorage.getItem(CS_PRESENCA_FILHA)||'null');}catch(_){}
        // Uma única chave canônica para novos registros. Gravar chave + ID cru
        // dobrava o tráfego sem necessidade.
        const chaves=[a.chave].filter(Boolean);

        // Se a mesma aba avançou para outra sala, remove a presença da sala anterior.
        if(anterior?.sala && anterior.sala!==sala && String(anterior.id||'')===String(a.id)){
            for(const k of [...new Set([anterior.chave,anterior.id].filter(Boolean))]){
                try{await csPresReq('/api/attendance/delete',{atendimento_id:k,sala:anterior.sala},true);}catch(_){}
            }
        }

        const gravar=async()=>{
            const resultados=await Promise.allSettled(chaves.map(atendimento_id=>csPresReq('/api/attendance/upsert',{
                atendimento_id,sala,display_name:nome,actor_id:actor
            })));
            if(!resultados.some(x=>x.status==='fulfilled')){
                throw resultados.find(x=>x.status==='rejected')?.reason||new Error('Cloudflare não confirmou a presença.');
            }
            try{sessionStorage.setItem(CS_PRESENCA_FILHA,JSON.stringify({
                atendimento:a.bruto,id:a.id,chave:a.chave,sala,nome,em:Date.now()
            }));}catch(_){}
            return true;
        };

        try{
            await gravar();
        }catch(e){
            const restante=Math.max(60000,csPresCooldownAte()-Date.now()+1500);
            clearTimeout(window.__csRetryPresenca);
            window.__csRetryPresenca=setTimeout(()=>{
                csRegistrarPresencaFilha(info,0).catch(()=>{});
            },restante);
            console.warn('[OM30 PRESENÇA] ponte indisponível; nova tentativa após cooldown',e?.message||e);
            return;
        }
        clearTimeout(window.__csRetryPresenca);
        window.__csRenovarPresenca=()=>gravar().catch(e=>{
            console.warn('[OM30 PRESENÇA] renovação temporariamente indisponível:',e?.message||e);
            return false;
        });
        csInstalarRecuperacaoPresenca();

        if(window.__csHeartbeatPresenca)clearInterval(window.__csHeartbeatPresenca);
        window.__csHeartbeatPresenca=setInterval(()=>{
            if(document.visibilityState!=='hidden')window.__csRenovarPresenca?.();
        },180000);

        console.log('[OM30 PRESENÇA] registrada e protegida',{
            atendimento:a.bruto,sala,nome,tentativa
        });
    }

    async function csExcluirPresencaConcluida(){
        let info=null;try{info=JSON.parse(sessionStorage.getItem(CS_PRESENCA_FILHA)||'null')}catch(_){}
        if(!info?.sala)return;
        for(const k of [...new Set([info.chave,info.id].filter(Boolean))]){
            try{await csPresReq('/api/attendance/delete',{atendimento_id:k,sala:info.sala},true);}catch(_){}
        }
        try{sessionStorage.removeItem(CS_PRESENCA_FILHA)}catch(_){}
        if(window.__csHeartbeatPresenca)clearInterval(window.__csHeartbeatPresenca);
        clearTimeout(window.__csRetryPresenca);
        window.__csRenovarPresenca=null;
    }

    // Aba filha voltou à lista por conclusão/saída real do fluxo: agora sim limpa a presença.
    // Fechar a aba manualmente não passa por este bloco e NÃO apaga o registro.
    if (caminho === '/aplicacoes_medicamentos' && /^cs-atendimento-/.test(window.name) && window.opener) {
        window.name = '';
        try { window.stop(); } catch (e) { /* segue */ }
        csExcluirPresencaConcluida().finally(() => {
            window.close();
            setTimeout(() => { if (!window.closed) location.replace(location.href); }, 800);
        });
    }



    // Remove apenas os componentes substituídos pelo módulo preservado da v2.0.80.
    function om30RemoverUiFichaAntiga() {
        document.querySelectorAll('.cs-pend,.cs-cancelar-todos').forEach(el => el.remove());
    }


  // ============================================================
  // FLUXO / HANDOFF — módulo v2.0.80 preservado integralmente
  // ============================================================
  // MÓDULO: FLUXO DO CONTROLE DE SALAS v1.1.0
  // Aprende passivamente a ordem/retorno quando o próprio Saúde Simples os expõe.
  // Não cria encaminhamentos, não conclui salas e não chama paciente.
  // ============================================================

  (function () {
    'use strict';

    const pageWindow = window;

    const KEY = 'om30_controle_salas_fluxo_local_v1';
    const HANDOFF_KEY = 'om30_controle_salas_destino_pos_salvar_v1';
    const SAVE_CTX_KEY = 'om30_controle_salas_save_context_v3';
    const mapaSala = {
      medicamentos: 'medicacao',
      medicacao: 'medicacao',
      exames: 'exames',
      radiografias: 'radiografia',
      radiografia: 'radiografia',
      raio_x: 'radiografia',
      procedimentos_enfermagem: 'enfermagem',
      procedimento_enfermagem: 'enfermagem',
      gessos_imobilizacoes: 'gesso',
      gesso_imobilizacao: 'gesso',
      repousos: 'repouso',
      repouso: 'repouso'
    };

    function ler() {
      try {
        const v = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (v && typeof v === 'object') return v;
      } catch (_) {}
      return { porProntuario: {}, porAtendimento: {} };
    }

    function gravar(db) {
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) {}
    }

    function salaKey(valor) {
      const bruto = String(valor || '')
        .replace(/^controle_de_salas_/, '')
        .replace(/^controle_salas_/, '')
        .trim();
      return mapaSala[bruto] || bruto || '';
    }

    function importarPostOriginalLegado() {
      // Durante o mapeamento do fluxo foi usado um monitor local que já possui
      // POSTs originais com salas_ordem[] e retorno. Aproveitamos esses dados
      // para não perder a ordem já conhecida neste navegador.
      try {
        const capturas = JSON.parse(localStorage.getItem('OM30_POST_CONTROLE_SALAS_COMPLETO') || '[]');
        if (!Array.isArray(capturas) || !capturas.length) return;
        const db = ler();
        let mudou = false;

        for (const item of capturas) {
          const body = String(item?.bodyEnviado || '');
          if (!body) continue;
          const params = new URLSearchParams(body);
          const prontuario = String(
            params.get('encaminhamento_controle_salas[prontuario_id]') ||
            params.get('prontuario_id') ||
            String(item?.pagina || '').match(/[?&]prontuario_id=(\d+)/)?.[1] || ''
          ).match(/\d+/)?.[0];
          if (!prontuario) continue;

          const ordem = params.getAll('salas_ordem[]').map(v => {
            const m = String(v || '').match(/^([^#]+)#(\d+)$/);
            return m ? { sala: salaKey(m[1]), posicao: Number(m[2]) } : null;
          }).filter(Boolean).sort((a,b) => a.posicao - b.posicao);
          const retornoValores = params.getAll('encaminhamento_controle_salas[retornar_paciente_para_avaliacao]').map(String);
          const retorno = retornoValores.includes('1');
          if (!ordem.length) continue;

          db.porProntuario[prontuario] = {
            ...(db.porProntuario[prontuario] || {}),
            prontuario, ordem, retornoOriginal: retorno, fonte: 'captura_local_legada',
            atualizadoEm: item?.hora || new Date().toISOString()
          };
          mudou = true;
        }

        if (mudou) gravar(db);
      } catch (_) {}
    }

    // Não importa captura local do PC do médico como verdade operacional.
    // Em produção médico e Controle de Salas estão em computadores diferentes.
    // importarPostOriginalLegado();

    function guardarAtendimentoPaFilho(id) {
      const limpo=String(id||'').match(/\d+/)?.[0]||'';
      if(limpo) try { sessionStorage.setItem(CS_ATENDIMENTO_PA_FILHO, limpo); } catch (_) {}
      return limpo;
    }

    function atendimentoDaPagina() {
      // 0) ID exato passado pela própria fila ao abrir a aba filha.
      // Não depende de nome/data/hora e não pode misturar episódios do mesmo munícipe.
      try {
        const q = new URLSearchParams(location.search);
        const idQuery = String(q.get('om30_atendimento_pa') || '').match(/\d+/)?.[0] || '';
        if (idQuery) {
          try { sessionStorage.setItem(CS_ATENDIMENTO_PA_FILHO, idQuery); } catch (_) {}
          return idQuery;
        }
      } catch (_) {}

      // 0.5) Persistência da própria aba filha. Esta é a fonte principal depois
      // que o Saúde Simples troca a rota entre Medicação/Exames/Raio-X/Enfermagem.
      try {
        const idPersistido = String(sessionStorage.getItem(CS_ATENDIMENTO_PA_FILHO) || '').match(/\d+/)?.[0] || '';
        if (idPersistido) return idPersistido;
      } catch (_) {}

      // 1) A fila grava este seed ANTES de abrir a aba filha. É a fonte mais
      // precisa para ligar a ficha ao mesmo AtendimentoPa da linha escolhida.
      try {
        const filho = JSON.parse(sessionStorage.getItem('cs-presenca-filho') || 'null');
        const mFilho = String(filho?.atendimento || '').match(/^AtendimentoPa#(\d+)$/i);
        if (mFilho) return guardarAtendimentoPaFilho(mFilho[1]);
      } catch (_) {}
      try {
        const chamado = JSON.parse(localStorage.getItem(CS_ATENDIMENTO_CHAMADO) || 'null');
        if (chamado && Date.now() - Number(chamado.em || 0) < 30 * 60 * 1000) {
          const mChamado = String(chamado.atendimento || '').match(/^AtendimentoPa#(\d+)$/i);
          if (mChamado) return guardarAtendimentoPaFilho(mChamado[1]);
        }
      } catch (_) {}
      try {
        const seed = JSON.parse(localStorage.getItem('cs-presenca-seed') || 'null');
        if (seed && Date.now() - Number(seed.em || 0) < 30 * 60 * 1000) {
          const mSeed = String(seed.atendimento || '').match(/^AtendimentoPa#(\d+)$/i);
          if (mSeed) return guardarAtendimentoPaFilho(mSeed[1]);
        }
      } catch (_) {}

      // 2) Atributos/inputs nativos já presentes na ficha.
      for (const el of document.querySelectorAll('[atendimento-id]')) {
        const tipo = String(el.getAttribute('atendimento-type') || el.getAttribute('atendimento_type') || '');
        const id = String(el.getAttribute('atendimento-id') || '').match(/\d+/)?.[0];
        if (id && (!tipo || /AtendimentoPa/i.test(tipo))) return guardarAtendimentoPaFilho(id);
      }
      for (const el of document.querySelectorAll('input[name*="atendimento_id"],input[id*="atendimento_id"],input[name*="prontuariavel_id"],input[id*="prontuariavel_id"]')) {
        const id = String(el.value || '').match(/\d+/)?.[0];
        const bloco = String(el.closest('form')?.textContent || '');
        if (id && (!bloco || /Atendimento|Mun[ií]cipe|Medica[cç][aã]o/i.test(bloco))) return guardarAtendimentoPaFilho(id);
      }

      // 3) Vue: mesma informação pode estar como prontuariavelId/atendimentoId.
      const vistos = new Set();
      for (const el of document.querySelectorAll('*')) {
        let vm = el.__vue__;
        while (vm && !vistos.has(vm)) {
          vistos.add(vm);
          const tipo = String(vm.prontuariavelType || vm.atendimentoType || vm?.prontuariavel?.type || '');
          const candidatos = [vm.prontuariavelId, vm.atendimentoId, vm?.prontuariavel?.id];
          for (const valor of candidatos) {
            const id = String(valor || '').match(/\d+/)?.[0];
            if (id && (!tipo || /AtendimentoPa/i.test(tipo))) return guardarAtendimentoPaFilho(id);
          }
          const str = String(vm.atendimento_str || vm.atendimentoStr || '');
          const m = str.match(/^AtendimentoPa#(\d+)$/i);
          if (m) return m[1];
          vm = vm.$parent;
        }
      }

      // 4) Último fallback: scripts da própria página.
      const scripts = [...document.scripts].map(x => x.textContent || '').join('\n');
      const idScript = scripts.match(/atendimento_id\s*:\s*["']?(\d+)/i)?.[1]
        || scripts.match(/atendimento-id=["'](\d+)/i)?.[1]
        || scripts.match(/prontuariavel_id\s*:\s*["']?(\d+)/i)?.[1]
        || scripts.match(/prontuariavel-id=["'](\d+)/i)?.[1]
        || '';
      return guardarAtendimentoPaFilho(idScript);
    }

    function registrarOriginal(form) {
      try {
        const fd = new FormData(form);
        const prontuario = String(fd.get('encaminhamento_controle_salas[prontuario_id]') || fd.get('prontuario_id') || '').match(/\d+/)?.[0];
        if (!prontuario) return;

        const ordem = fd.getAll('salas_ordem[]')
          .map(v => {
            const m = String(v || '').match(/^([^#]+)#(\d+)$/);
            return m ? { sala: salaKey(m[1]), posicao: Number(m[2]) } : null;
          })
          .filter(Boolean)
          .sort((a, b) => a.posicao - b.posicao);

        const retornoValores = fd.getAll('encaminhamento_controle_salas[retornar_paciente_para_avaliacao]').map(String);
        const retorno = retornoValores.includes('1');
        const atendimento = atendimentoDaPagina();

        const db = ler();
        const registro = {
          prontuario,
          atendimento: atendimento || '',
          ordem,
          retornoOriginal: retorno,
          fonte: 'encaminhamento_original',
          atualizadoEm: new Date().toISOString()
        };
        db.porProntuario[prontuario] = { ...(db.porProntuario[prontuario] || {}), ...registro };
        if (atendimento) db.porAtendimento[atendimento] = { ...(db.porAtendimento[atendimento] || {}), ...registro };
        gravar(db);
      } catch (_) {}
    }

    document.addEventListener('submit', event => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      let path = '';
      try { path = new URL(form.action || location.href, location.href).pathname; } catch (_) {}
      if (path !== '/encaminhamentos_controle_salas') return;
      registrarOriginal(form);
    }, true);

    function origemPorUrl(url) {
      const u = String(url || '');
      if (/\/aplicacoes_medicamentos(?:\/|$)/.test(u)) return 'medicacao';
      if (/\/encaminhamentos_exames\//.test(u)) return 'exames';
      if (/\/encaminhamentos_radiografias\//.test(u)) return 'radiografia';
      if (/\/encaminhamentos_procedimentos_enfermagem\//.test(u)) return 'enfermagem';
      if (/\/encaminhamentos_gessos_imobilizacoes\//.test(u)) return 'gesso';
      if (/\/encaminhamentos_repousos\//.test(u)) return 'repouso';
      return '';
    }


    function contextoSalvarAtual() {
      try {
        const c = JSON.parse(sessionStorage.getItem(SAVE_CTX_KEY) || 'null');
        if (!c || Date.now() - Number(c.em || 0) > 2 * 60 * 1000) return null;
        return c;
      } catch (_) { return null; }
    }

    function capturarContextoSalvar(form = null) {
      try {
        form = form || document.querySelector('form.encaminhamento_medicacao,form[id^="edit_encaminhamento_medicacao_"],form.encaminhamento_exame,form.encaminhamento_radiografia,form.encaminhamento_procedimento_enfermagem');
        const reav = form?.querySelector('input[name$="[encaminhar_paciente_para_reavaliacao_medica]"][type="checkbox"],#encaminhamento_medicacao_encaminhar_paciente_para_reavaliacao_medica');
        const ctx = {
          atendimento: atendimentoDaPagina(),
          origem: origemPorUrl(location.pathname),
          reavaliar: reav ? !!reav.checked : null,
          em: Date.now()
        };
        sessionStorage.setItem(SAVE_CTX_KEY, JSON.stringify(ctx));
        return ctx;
      } catch (_) { return null; }
    }

    document.addEventListener('click', event => {
      const b = event.target?.closest?.('.salvar-encaminhamento-controle-salas');
      if (!b) return;
      capturarContextoSalvar(b.closest('form'));
    }, true);

    document.addEventListener('submit', event => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!origemPorUrl(form.action || location.pathname)) return;
      capturarContextoSalvar(form);
    }, true);

    const NOMES_DESTINO = Object.freeze({
      medicacao: 'MEDICAÇÃO',
      exames: 'EXAMES',
      radiografia: 'RAIO-X',
      enfermagem: 'PROCEDIMENTOS DE ENFERMAGEM',
      gesso: 'GESSO / IMOBILIZAÇÃO',
      repouso: 'REPOUSO',
      atendimento: 'RETORNO AO CONSULTÓRIO MÉDICO'
    });

    function caminhoFluxo(valor) {
      try {
        return new URL(String(valor || location.pathname), location.origin).pathname
          .replace(/\/edit\/?$/i, '')
          .replace(/\/$/, '');
      } catch (_) {
        return String(valor || '').split('?')[0].replace(/\/edit\/?$/i, '').replace(/\/$/, '');
      }
    }

    function salvarHandoffPosSalvar({ origem, destino, atendimento, url, origemPath }) {
      if (!origem || !destino) return;
      const registro = {
        origem,
        destino,
        atendimento: String(atendimento || ''),
        // Na Medicação o POST é feito em /aplicacoes_medicamentos, mas após o OK
        // o sistema abre /aplicacoes_medicamentos/{id}. Por isso a origem real
        // deve vir do primeiro argumento que o próprio backend devolveu no JS.
        origemPath: caminhoFluxo(origemPath || url),
        salvoEm: Date.now()
      };
      try { sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(registro)); } catch (_) {}
    }

    function handoffDaPagina() {
      try {
        const h = JSON.parse(sessionStorage.getItem(HANDOFF_KEY) || 'null');
        if (!h || !h.destino || !h.origemPath || !Number.isFinite(Number(h.salvoEm))) return null;
        if (Date.now() - Number(h.salvoEm) > 10 * 60 * 1000) {
          sessionStorage.removeItem(HANDOFF_KEY);
          return null;
        }
        const mesmoCaminho = caminhoFluxo(location.pathname) === caminhoFluxo(h.origemPath);
        const mesmoSetor = h.origem && origemPorUrl(location.pathname) === h.origem;
        if (!mesmoCaminho && !mesmoSetor) return null;
        return h;
      } catch (_) {
        return null;
      }
    }

    function decorarPopupConclusao({ destino = '', semRetorno = false, fallback = false } = {}) {
      const nome = destino ? (NOMES_DESTINO[destino] || String(destino || '').toUpperCase()) : '';
      let tentativas = 0;
      const timer = setInterval(() => {
        tentativas++;
        const modal = document.querySelector('.swal2-modal.swal2-show, .swal2-popup.swal2-show');
        const titulo = modal?.querySelector('.swal2-title');
        const texto = String(modal?.textContent || '');
        if (!modal || !/sucesso|encaminhamento conclu[ií]do/i.test(String(titulo?.textContent || '')) || !/sucesso|atualizado/i.test(texto)) {
          if (tentativas > 160) clearInterval(timer);
          return;
        }

        if (titulo) titulo.textContent = 'Encaminhamento concluído';
        const content = modal.querySelector('.swal2-content, #swal2-content, .swal2-html-container');
        if (content) content.innerHTML = '<div style="font-size:13px;color:#52616b;line-height:1.35">Atendimento desta sala concluído com sucesso.</div>';

        let aviso = modal.querySelector('#om30-destino-pos-salvar');
        if (!aviso) {
          aviso = document.createElement('div');
          aviso.id = 'om30-destino-pos-salvar';
          Object.assign(aviso.style, {
            margin: '12px auto 2px', padding: '9px 12px', maxWidth: '330px',
            border: '1px solid #b9cfe0', borderLeft: '4px solid #0f4c81', borderRadius: '7px', background: '#f5f9fc',
            color: '#243f53', fontSize: '12px', lineHeight: '1.3', fontWeight: '800', textAlign: 'left'
          });
          const actions = modal.querySelector('.swal2-actions');
          if (actions) modal.insertBefore(aviso, actions); else modal.appendChild(aviso);
        }

        if (semRetorno) {
          aviso.innerHTML = '<div style="font-size:10.5px;letter-spacing:.5px;color:#5b6672">RETORNO MÉDICO</div><div style="font-size:14px;font-weight:900;margin-top:2px">Sem retorno ao consultório médico</div>';
        } else if (destino === 'atendimento') {
          aviso.innerHTML = '<div style="font-size:10.5px;letter-spacing:.5px;color:#5b6672">PRÓXIMO DESTINO</div><div style="font-size:14px;font-weight:900;margin-top:2px">↩ Retorno ao consultório médico</div>';
        } else if (nome) {
          aviso.innerHTML = `<div style="font-size:10.5px;letter-spacing:.5px;color:#5b6672">PRÓXIMO DESTINO</div><div style="font-size:14px;font-weight:900;margin-top:2px">→ ${nome}</div>${fallback ? '<div style="margin-top:3px;font-size:9px;color:#7a8a92;font-weight:700">Destino obtido do contexto confirmado do atendimento.</div>' : ''}`;
        }
        clearInterval(timer);
      }, 80);
    }

    function agendarAvisoDestino(destino) {
      const nome = NOMES_DESTINO[destino] || String(destino || '').toUpperCase();
      if (!nome) return;
      // Apenas publica o handoff. O popup é desenhado por UM único módulo mais abaixo,
      // evitando dois cards de destino/retorno no mesmo SweetAlert.
      pageWindow.__OM30_ULTIMO_DESTINO_CONTROLE_SALAS__ = { destino, nome, em: new Date().toISOString() };
    }

    function agendarAvisoSemRetorno() {
      // Mantido apenas para fontes EXPLÍCITAS de sem-retorno. Não desenha popup aqui.
      pageWindow.__OM30_ULTIMO_DESTINO_CONTROLE_SALAS__ = { destino: '', nome: 'SEM RETORNO AO CONSULTÓRIO MÉDICO', semRetorno: true, em: new Date().toISOString() };
    }

    const SALAS_MAPA_FINAL = [
      { key:'medicacao', codigo:'controle_de_salas_medicacao' },
      { key:'exames', codigo:'controle_de_salas_exames' },
      { key:'radiografia', codigo:'controle_de_salas_raio_x' },
      { key:'enfermagem', codigo:'controle_de_salas_procedimento_enfermagem' },
      { key:'gesso', codigo:'controle_de_salas_gesso_imobilizacao' }
    ];

    async function mapaAtivoAposSalvar(atendimento) {
      atendimento=String(atendimento||'').match(/\d+/)?.[0]||'';
      if(!atendimento) return null;
      const resultados=await Promise.allSettled(SALAS_MAPA_FINAL.map(async sala=>{
        const u=new URL('/encaminhamentos_controle_salas/buscar_url_encaminhamentos_prontuario',location.origin);
        u.searchParams.set('prontuariavel_id',atendimento);
        u.searchParams.set('prontuariavel_type','AtendimentoPa');
        u.searchParams.set('codigo_sala',sala.codigo);
        const r=await fetch(u.toString(),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
        if(!r.ok) throw new Error(`HTTP_${r.status}`);
        const v=await r.json();
        return {sala:sala.key,url:typeof v==='string'?v:''};
      }));
      if(resultados.some(x=>x.status!=='fulfilled')) return null;
      return resultados.filter(x=>x.status==='fulfilled'&&x.value.url).map(x=>x.value.sala);
    }

    async function confirmarSemRetornoAposSalvar(atendimento, origem) {
      atendimento=String(atendimento||'').match(/\d+/)?.[0]||'';
      if(!atendimento||!origem) return;
      // Dá tempo para o backend retirar a sala recém-concluída do mapa.
      for(const espera of [250,650,1200]){
        await new Promise(r=>setTimeout(r,espera));
        const ativos=await mapaAtivoAposSalvar(atendimento).catch(()=>null);
        if(!ativos) continue;
        // Se apareceu outra sala, não inventa ordem aqui; o handoff/fila é quem decide.
        if(ativos.length) return;
        const db=ler();
        const atual=db.porAtendimento[atendimento]||{atendimento,transicoes:{}};
        // Só marca "sem retorno" se até aqui não houve retorno nem outra sala
        // confirmada pela ordem/transição do próprio atendimento.
        if(atual.retornoConfirmado===true || atual.retornoOriginal===true) return;
        const transicao=String(atual.transicoes?.[origem]||'');
        if(transicao && transicao!=='atendimento') return;
        const ordem=Array.isArray(atual.ordem)?atual.ordem:[];
        const posAtual=ordem.find(x=>String(x?.sala||'')===String(origem))?.posicao;
        if(Number.isFinite(Number(posAtual)) && ordem.some(x=>Number(x?.posicao)>Number(posAtual))) return;
        atual.retornoConfirmado=false;
        atual.semRetornoConfirmado=true;
        atual.concluidas=Array.isArray(atual.concluidas)?[...atual.concluidas]:[];
        if(!atual.concluidas.includes(origem)) atual.concluidas.push(origem);
        atual.atualizadoEm=new Date().toISOString();
        db.porAtendimento[atendimento]=atual;gravar(db);
        agendarAvisoSemRetorno();
        return;
      }
    }

    function aprenderResposta(url, textoResposta, meta = {}) {
      const texto = String(textoResposta || '');
      if (!texto) return;
      const metodo=String(meta?.method||'GET').toUpperCase();
      const ctx=contextoSalvarAtual();
      const atendimento = texto.match(/atendimento_id\s*:\s*["']?(\d+)/i)?.[1]
        || texto.match(/,\s*(\d+)\s*,\s*["']AtendimentoPa["']/i)?.[1]
        || ctx?.atendimento
        || atendimentoDaPagina();
      const chamadas = [...texto.matchAll(/(?:redirecionarControleSalasSemSenha|encaminharSenhaControleSalas)\(\s*["']([^"']*)["']\s*,\s*["']([^"']+)["']/g)];
      if (!chamadas.length) {
        // A ausência de redirecionarControleSalas/encaminharSenhaControleSalas NÃO
        // significa "sem retorno médico". Pode ser apenas uma resposta parcial do Rails.
        // Portanto não inferimos retorno=false aqui. O painel/popup aguardam uma fonte
        // explícita: handoff do backend, retorno_medico central ou encaminhamento original
        // vinculado ao AtendimentoPa exato.
        return;
      }
      if (!atendimento) return;

      const chamadaEscolhida = chamadas.find(m => m[2] === 'atendimento') || chamadas[0];
      const recursoOrigemConfirmado = chamadaEscolhida?.[1] || '';
      const destinoBruto = chamadaEscolhida?.[2] || '';
      // A URL da requisição é a fonte correta da sala que acabou de ser salva.
      // Algumas respostas (especialmente Raio-X) usam /aplicacoes_medicamentos
      // apenas como URL de retorno; usar esse primeiro argumento como origem
      // corrompia o fluxo, registrando Raio-X como se fosse Medicação.
      const origem = origemPorUrl(url) || origemPorUrl(recursoOrigemConfirmado);
      const destino = destinoBruto === 'atendimento' ? 'atendimento' : salaKey(destinoBruto);
      salvarHandoffPosSalvar({
        origem,
        destino,
        atendimento,
        url,
        origemPath: recursoOrigemConfirmado || url
      });
      agendarAvisoDestino(destino);

      const db = ler();
      const atual = db.porAtendimento[atendimento] || { atendimento, transicoes: {} };
      atual.transicoes = { ...(atual.transicoes || {}) };
      if (origem && destino) atual.transicoes[origem] = destino;
      atual.concluidas = Array.isArray(atual.concluidas) ? [...atual.concluidas] : [];
      if (origem && !atual.concluidas.includes(origem)) atual.concluidas.push(origem);
      if (destino === 'atendimento') {
        atual.retornoConfirmado = true;
        atual.semRetornoConfirmado = false;
      }
      atual.atualizadoEm = new Date().toISOString();
      db.porAtendimento[atendimento] = atual;
      gravar(db);
    }

    function importarMonitoresLegados() {
      for (const key of ['OM30_MONITOR_FLUXO_REAL_V1', 'OM30_MONITOR_FINAL_ENFERMAGEM']) {
        try {
          const logs = JSON.parse(localStorage.getItem(key) || '[]');
          if (!Array.isArray(logs)) continue;
          for (const item of logs) {
            if (item?.response && item?.url) aprenderResposta(item.url, item.response);
          }
        } catch (_) {}
      }
    }
    // Não reaplica monitores históricos no carregamento. Eles eram úteis só no
    // mapeamento inicial, mas chamavam aprenderResposta() e podiam sobrescrever
    // o handoff do atendimento atual com uma resposta antiga.
    // importarMonitoresLegados();

    try {
      const fetchOriginal = pageWindow.fetch;
      if (typeof fetchOriginal === 'function' && !fetchOriginal.__om30FluxoControleSalas) {
        const wrapped = function(input, init) {
          const rawUrl = typeof input === 'string' ? input : (input?.url || '');
          const metodoFluxo = String(init?.method || input?.method || 'GET').toUpperCase();
          const p = fetchOriginal.apply(this, arguments);
          try {
            p.then(response => {
              try {
                const url = String(response?.url || rawUrl || '');
                if (!origemPorUrl(url)) return;
                response.clone().text().then(t => aprenderResposta(url, t, { method: metodoFluxo })).catch(() => {});
              } catch (_) {}
            }).catch(() => {});
          } catch (_) {}
          return p;
        };
        wrapped.__om30FluxoControleSalas = true;
        wrapped.__om30Original = fetchOriginal;
        pageWindow.fetch = wrapped;
      }
    } catch (_) {}

    try {
      const XHR = pageWindow.XMLHttpRequest || XMLHttpRequest;
      const proto = XHR?.prototype;
      if (proto && !proto.__om30FluxoControleSalas) {
        const open = proto.open;
        const send = proto.send;

        proto.open = function(method, url) {
          this.__om30FluxoUrl = String(url || '');
          this.__om30FluxoMethod = String(method || 'GET').toUpperCase();
          return open.apply(this, arguments);
        };

        proto.send = function() {
          if (origemPorUrl(this.__om30FluxoUrl)) {
            this.addEventListener('loadend', () => {
              try { aprenderResposta(this.__om30FluxoUrl, this.responseText, { method: this.__om30FluxoMethod || 'GET' }); } catch (_) {}
            });
          }
          return send.apply(this, arguments);
        };

        proto.__om30FluxoControleSalas = true;
      }
    } catch (_) {}

    async function resolverProntuario(atendimento) {
      atendimento = String(atendimento || '').match(/\d+/)?.[0] || '';
      if (!atendimento) return '';

      const db = ler();
      const salvo = db.porAtendimento[atendimento]?.prontuario;
      if (salvo) return String(salvo);

      try {
        const r = await fetch(`/prontuarios/new?prontuariavel_id=${encodeURIComponent(atendimento)}&prontuariavel_type=AtendimentoPa`, {
          credentials: 'same-origin', cache: 'no-store', redirect: 'follow', headers: { Accept: 'text/html,*/*' }
        });
        const id = String(r.url || '').match(/\/prontuarios\/(\d+)/)?.[1] || '';
        if (id) {
          const novo = ler();
          novo.porAtendimento[atendimento] = { ...(novo.porAtendimento[atendimento] || {}), prontuario: id, atendimento };
          gravar(novo);
        }
        return id;
      } catch (_) {
        return '';
      }
    }

    const fluxoCentralCache = new Map();

    // Contrato aceito da ponte. O Worker atual entrega ordem + retorno_medico;
    // versões futuras podem acrescentar pendencias/salas_pendentes, proxima_sala
    // e concluidas sem exigir nova mudança no Controle de Salas.
    function booleanoFluxoCentral(valor) {
      if (typeof valor === 'boolean') return valor;
      if (valor === 1 || valor === '1') return true;
      if (valor === 0 || valor === '0') return false;
      const t = String(valor ?? '').trim().toLowerCase();
      if (['sim','s','true','yes'].includes(t)) return true;
      if (['nao','não','n','false','no'].includes(t)) return false;
      return null;
    }

    function valorSalaCentral(item) {
      if (typeof item === 'string' || typeof item === 'number') return String(item);
      if (!item || typeof item !== 'object') return '';
      return String(
        item.sala ?? item.key ?? item.codigo_sala ?? item.codigo ??
        item.destino ?? item.nome ?? item.room ?? ''
      );
    }

    function listaSalasCentral(valor, usarPosicao = false) {
      if (!Array.isArray(valor)) return [];
      const saida = [];
      const vistos = new Set();
      valor.forEach((item, i) => {
        const sala = salaKey(valorSalaCentral(item));
        if (!sala || sala === 'atendimento' || vistos.has(sala)) return;
        vistos.add(sala);
        const obj = item && typeof item === 'object' ? item : {};
        const pos = Number(obj.posicao ?? obj.ordem ?? obj.position ?? (usarPosicao ? i + 1 : NaN));
        const status = String(obj.status ?? obj.situacao ?? obj.estado ?? '').trim();
        saida.push({
          sala,
          ...(Number.isFinite(pos) && pos > 0 ? { posicao: pos } : {}),
          ...(status ? { status } : {})
        });
      });
      return saida.sort((a,b) => {
        const pa = Number(a.posicao), pb = Number(b.posicao);
        if (Number.isFinite(pa) && Number.isFinite(pb)) return pa - pb;
        if (Number.isFinite(pa)) return -1;
        if (Number.isFinite(pb)) return 1;
        return 0;
      });
    }

    function normalizarFluxoCentral(body) {
      if (!body || typeof body !== 'object' || body.found === false) return null;
      const interno = body.fluxo && typeof body.fluxo === 'object' && !Array.isArray(body.fluxo)
        ? body.fluxo
        : (body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {});
      const raiz = { ...body, ...interno };

      const ordemBruta = [raiz.ordem, raiz.salas_ordem, raiz.fluxo_salas, raiz.rota]
        .find(Array.isArray) || [];
      const pendenciasBrutas = [raiz.pendencias, raiz.salas_pendentes, raiz.pendentes]
        .find(Array.isArray) || [];
      const concluidasBrutas = [raiz.concluidas, raiz.salas_concluidas, raiz.finalizadas]
        .find(Array.isArray) || [];

      const ordem = listaSalasCentral(ordemBruta, true);
      const pendencias = listaSalasCentral(pendenciasBrutas, false);
      const concluidas = listaSalasCentral(concluidasBrutas, false).map(x => x.sala);

      const proximaBruta = raiz.proxima_sala ?? raiz.proximo_destino ?? raiz.proximaSala ?? raiz.proxima ?? '';
      const proximaSala = salaKey(valorSalaCentral(proximaBruta));
      const retorno = booleanoFluxoCentral(
        raiz.retorno_medico ??
        raiz.retornar_paciente_para_avaliacao ??
        raiz.retornar_ao_medico ??
        raiz.retorno
      );

      const found = raiz.found === true ||
        ordem.length > 0 ||
        pendencias.length > 0 ||
        concluidas.length > 0 ||
        !!proximaSala ||
        retorno !== null;
      if (!found) return null;

      return {
        ...raiz,
        found: true,
        ordem,
        pendencias,
        concluidas,
        proxima_sala: proximaSala,
        retorno_medico: retorno
      };
    }

    const FLUXO_ORDENS_BASE = 'https://om30-fluxo-ordens.om30-pedro.workers.dev';
    const FLUXO_ORDENS_CACHE_MS = 10000;

    async function buscarFluxoCentral(prontuario, atendimento = '', forcar = false) {
      // Compatibilidade com chamadas antigas de diagnóstico: (id, true).
      if (typeof atendimento === 'boolean') {
        forcar = atendimento;
        atendimento = '';
      }

      const idProntuario = String(prontuario || '').match(/\d+/)?.[0] || '';
      const idAtendimento = String(atendimento || '').match(/\d+/)?.[0] || '';
      if (!idProntuario) return null;

      const cacheKey = `ordens:${idProntuario}`;
      const anterior = fluxoCentralCache.get(cacheKey);
      if (!forcar && anterior && Date.now() - anterior.em < FLUXO_ORDENS_CACHE_MS) {
        return anterior.valor;
      }

      try {
        const r = await fetch(
          `${FLUXO_ORDENS_BASE}/api/fluxo/prontuario/${encodeURIComponent(idProntuario)}`,
          {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
          }
        );

        const body = await r.json().catch(() => null);
        if (!r.ok || !body?.ok) {
          throw new Error(body?.error || `HTTP ${r.status}`);
        }

        // O Worker om30-fluxo-ordens é a fonte do fluxo original definido pelo médico.
        // Se não houver registro, NÃO tenta inventar SIM/NÃO e NÃO usa outra nuvem:
        // o restante do Controle de Salas segue pelas APIs nativas já existentes.
        let valor = null;
        if (body?.exists) {
          valor = normalizarFluxoCentral({ ...body, found: true });
          if (valor) {
            valor = {
              ...valor,
              prontuario: idProntuario,
              atendimento: idAtendimento || String(body.atendimento || ''),
              fonte: 'cloudflare_fluxo_ordens',
              fonteCentral: true,
              flow_hash: String(body.flow_hash || ''),
              updated_at: body.updated_at || ''
            };
          }
        }

        fluxoCentralCache.set(cacheKey, { em: Date.now(), valor });

        if (valor) {
          console.info('[OM30 FLUXO ORDENS] Fluxo do médico lido por prontuário.', {
            prontuario: idProntuario,
            atendimento: idAtendimento,
            ordem: valor.ordem,
            retorno_medico: valor.retorno_medico,
            flow_hash: valor.flow_hash
          });
        }

        return valor;
      } catch (e) {
        console.warn('[OM30 FLUXO ORDENS] Falha ao consultar ordem/retorno; seguindo pelas APIs nativas:', e?.message || e);
        return anterior?.valor || null;
      }
    }

    async function obter(atendimento) {
      const handoff = handoffDaPagina();
      atendimento = String(atendimento || atendimentoDaPagina() || handoff?.atendimento || '').match(/\d+/)?.[0] || '';
      const prontuario = await resolverProntuario(atendimento);
      const db = ler();
      const a = atendimento ? (db.porAtendimento[atendimento] || {}) : {};
      const p = prontuario ? (db.porProntuario[prontuario] || {}) : {};
      const unido = { ...a, ...p };
      unido.transicoes = { ...(a.transicoes || {}), ...(p.transicoes || {}) };
      unido.concluidas = [...new Set([...(Array.isArray(a.concluidas)?a.concluidas:[]), ...(Array.isArray(p.concluidas)?p.concluidas:[])])];
      if (handoff?.origem && handoff?.destino) {
        unido.transicoes[handoff.origem] = handoff.destino;
        if (!unido.concluidas.includes(handoff.origem)) unido.concluidas.push(handoff.origem);
      }
      unido.atendimento = atendimento || unido.atendimento || '';
      unido.prontuario = prontuario || unido.prontuario || '';

      // Fonte principal entre computadores: fluxo original salvo pelo médico
      // no Worker om30-fluxo-ordens, indexado pelo PRONTUÁRIO.
      //
      // Se a nuvem não responder ou não houver registro, NÃO bloqueia o fluxo:
      // as datatables exatas + buscar_url_encaminhamentos_prontuario continuam
      // sendo a fonte nativa para pendências e próxima sala quando for inequívoca.
      let central = prontuario ? await buscarFluxoCentral(prontuario, atendimento) : null;
      if (central?.found && typeof central.retorno_medico !== 'boolean') {
        central = await buscarFluxoCentral(prontuario, atendimento, true);
      }
      if (central?.found) {
        unido.fonte = String(central.fonte || 'cloudflare_fluxo_ordens');
        unido.fonteCentral = true;

        const ordemCentral = (Array.isArray(central.ordem) ? central.ordem : [])
          .map((x, i) => ({ sala: salaKey(x?.sala), posicao: Number(x?.posicao || i + 1) }))
          .filter(x => x.sala && Number.isFinite(x.posicao) && x.posicao > 0)
          .sort((a,b) => a.posicao - b.posicao);
        if (ordemCentral.length) {
          unido.ordem = ordemCentral;
          unido.ordemFonte = String(central.fonte || 'cloudflare_fluxo_ordens');
          unido.transicoes = { ...(unido.transicoes || {}) };
          for (let i = 0; i < ordemCentral.length - 1; i++) {
            unido.transicoes[ordemCentral[i].sala] = ordemCentral[i + 1].sala;
          }
        }

        const pendenciasCentral = (Array.isArray(central.pendencias) ? central.pendencias : [])
          .map(x => ({
            sala: salaKey(x?.sala),
            ...(Number.isFinite(Number(x?.posicao)) ? { posicao: Number(x.posicao) } : {}),
            ...(String(x?.status || '').trim() ? { status: String(x.status).trim() } : {})
          }))
          .filter(x => x.sala && x.sala !== 'atendimento');
        if (pendenciasCentral.length) unido.pendenciasCentral = pendenciasCentral;

        const proximaCentral = salaKey(central.proxima_sala || '');
        if (proximaCentral) unido.proximaSalaCentral = proximaCentral;

        const concluidasCentral = (Array.isArray(central.concluidas) ? central.concluidas : [])
          .map(salaKey)
          .filter(Boolean);
        if (concluidasCentral.length) {
          unido.concluidas = [...new Set([...(unido.concluidas || []), ...concluidasCentral])];
        }

        if (typeof central.retorno_medico === 'boolean') {
          unido.retorno_medico = central.retorno_medico;
          unido.retornoConfirmado = central.retorno_medico;
          unido.semRetornoConfirmado = central.retorno_medico === false;
        }
        unido.fluxoCentralAtualizadoEm = central.updated_at || central.atualizado_em || '';
        unido.cloudFlowHash = String(central.flow_hash || '');
      }

      // Retorno médico: aceita apenas fontes vinculadas ao AtendimentoPa exato.
      // true pode vir do handoff/backend. false pode vir do encaminhamento original
      // capturado para este AtendimentoPa, da ponte central futura ou da confirmação
      // server-side pós-salvar de que não restou sala ativa nem retorno ao médico.
      if (unido.retornoConfirmado === true || handoff?.destino === 'atendimento') unido.retornoConfirmado = true;
      else if (unido.retornoConfirmado === false || unido.semRetornoConfirmado === true) unido.retornoConfirmado = false;
      else if ((unido.fonteCentral === true || unido.fonte === 'ponte_central') && typeof unido.retorno_medico === 'boolean') unido.retornoConfirmado = unido.retorno_medico;
      // Não usa retornoOriginal/localStorage do PC atual como verdade operacional.
      // O SIM/NÃO vem da ponte do médico ou do handoff/resposta nativa vinculada ao AtendimentoPa.
      if (handoff) unido.handoffPosSalvar = { ...handoff };

      // Se o encaminhamento original não foi capturado neste navegador, ainda podemos
      // reconstruir a parte já comprovada da sequência a partir das respostas nativas.
      if ((!Array.isArray(unido.ordem) || !unido.ordem.length) && unido.transicoes?.medicacao) {
        const ordem = [];
        const vistos = new Set();
        let atual = 'medicacao';
        let posicao = 1;
        while (atual && atual !== 'atendimento' && !vistos.has(atual) && posicao <= 10) {
          vistos.add(atual);
          ordem.push({ sala: atual, posicao });
          atual = unido.transicoes?.[atual] || '';
          posicao++;
        }
        if (ordem.length >= 2) { unido.ordem = ordem; unido.ordemFonte = 'transicoes_backend'; }
      }

      return unido;
    }

    pageWindow.OM30FluxoControleSalas = {
      obter,
      atendimentoDaPagina,
      handoffDaPagina,
      aprenderResposta,
      buscarFluxoCentral,
      async testarNuvem(atendimento = '') {
        const idAtendimento = String(atendimento || atendimentoDaPagina() || '').match(/\d+/)?.[0] || '';
        const prontuario = await resolverProntuario(idAtendimento);
        const cloud = prontuario ? await buscarFluxoCentral(prontuario, idAtendimento, true) : null;
        const resultado = { atendimento: idAtendimento, prontuario, cloud };
        console.log('☁️ OM30 - TESTE FLUXO ORDENS', resultado);
        return resultado;
      },
      get dados() { return ler(); }
    };
  })();

  // ============================================================


  (function () {
    'use strict';

    const pageWindow = window;

    const ID_PAINEL = 'om30-pendencias-controle-salas';
    const ESTADO_PEND = {
      iniciado: false,
      assinatura: '',
      html: '',
      estado: null
    };

    // Fontes nativas da tela "Consulta do Controle de Salas".
    const SALAS = [
      {
        key: 'medicacao',
        nome: 'Medicação',
        endpoint: '/consultar_repousos_medicacoes/datatable_medicacoes.json'
      },
      {
        key: 'exames',
        nome: 'Exames',
        endpoint: '/consultar_repousos_medicacoes/datatable_exames.json'
      },
      {
        key: 'repouso',
        nome: 'Repouso',
        endpoint: '/consultar_repousos_medicacoes/datatable_repousos.json'
      },
      {
        key: 'radiografia',
        nome: 'Raio-X',
        endpoint: '/consultar_repousos_medicacoes/datatable_radiografias.json'
      },
      {
        key: 'enfermagem',
        nome: 'Procedimentos de Enfermagem',
        endpoint: '/consultar_repousos_medicacoes/datatable_procedimentos_enfermagem.json'
      },
      {
        key: 'gesso',
        nome: 'Gesso e Imobilização',
        endpoint: '/consultar_repousos_medicacoes/datatable_gessos_imobilizacoes.json'
      }
    ];

    // Quando conhecemos o AtendimentoPa, estas filas são muito mais seguras que
    // a consulta por nome/data: cada registro traz atendimento_str e permite
    // separar exatamente o episódio atual de atendimentos antigos do munícipe.
    const SALAS_EXATAS = [
      { key: 'medicacao', nome: 'Medicação', endpoint: '/aplicacoes_medicamentos', codigo: 'controle_de_salas_medicacao' },
      { key: 'exames', nome: 'Exames', endpoint: '/encaminhamentos_exames', codigo: 'controle_de_salas_exames' },
      { key: 'radiografia', nome: 'Raio-X', endpoint: '/encaminhamentos_radiografias', codigo: 'controle_de_salas_raio_x' },
      { key: 'enfermagem', nome: 'Procedimentos de Enfermagem', endpoint: '/encaminhamentos_procedimentos_enfermagem', codigo: 'controle_de_salas_procedimento_enfermagem' },
      { key: 'gesso', nome: 'Gesso e Imobilização', endpoint: '/encaminhamentos_gessos_imobilizacoes', codigo: 'controle_de_salas_gesso_imobilizacao' }
    ];

    const normalizar = valor => String(valor ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    const texto = el => String(el?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();

    const senhaVazia = valor => {
      const v = normalizar(valor);
      return !v || v === '-' || v === '—' || v === 'SEM SENHA';
    };

    function valorDepoisDoRotulo(regex) {
      const fortes = [...document.querySelectorAll('strong, b')];

      for (const forte of fortes) {
        if (!regex.test(texto(forte))) continue;

        const pai = forte.parentElement;
        if (!pai) continue;

        const clone = pai.cloneNode(true);
        clone.querySelectorAll('strong, b').forEach(x => x.remove());
        const valor = texto(clone);
        if (valor) return valor;
      }

      return '';
    }

    function obterSenhaDaPagina() {
      const candidatos = [...document.querySelectorAll('div, span, li, p, label')]
        .map(el => texto(el))
        .filter(t => /^SENHA\s*:/i.test(t) && t.length <= 80);

      for (const candidato of candidatos) {
        const m = candidato.match(/^SENHA\s*:\s*(.+)$/i);
        if (m && m[1]) return m[1].trim();
      }

      const pagina = String(document.body?.innerText ?? '');
      const m = pagina.match(/(?:^|\n)\s*SENHA\s*:\s*([^\n\r]+)/i);
      return m ? m[1].trim() : '';
    }

    function obterIdentidade() {
      return {
        nome: valorDepoisDoRotulo(/^MUN[IÍ]CIPE$/i),
        nascimento: valorDepoisDoRotulo(/^DATA DE NASCIMENTO$/i),
        medico: valorDepoisDoRotulo(/^M[EÉ]DICO RESPONS[AÁ]VEL$/i),
        senha: obterSenhaDaPagina()
      };
    }

    function detectarSalaAtual() {
      const seletores = [
        ['medicacao', 'input[name^="encaminhamento_medicacao["], form.encaminhamento_medicacao'],
        ['exames', 'input[name^="encaminhamento_exame["], form[id^="edit_encaminhamento_exame_"]'],
        ['radiografia', 'input[name^="encaminhamento_radiografia["], form[id*="encaminhamento_radiografia"]'],
        ['enfermagem', 'input[name^="encaminhamento_procedimento_enfermagem["], input[name^="encaminhamento_procedimentoenfermagem["], form[id*="procedimento_enfermagem"], form[id*="procedimentoenfermagem"]'],
        ['repouso', 'input[name^="encaminhamento_repouso["], form[id*="encaminhamento_repouso"]'],
        ['gesso', 'input[name^="encaminhamento_gesso_imobilizacao["], input[name^="encaminhamento_gessoimobilizacao["], form[id*="gesso_imobilizacao"], form[id*="gessoimobilizacao"]']
      ];

      for (const [key, seletor] of seletores) {
        if (document.querySelector(seletor)) return key;
      }

      const path = location.pathname.toLowerCase();
      if (path.startsWith('/aplicacoes_medicamentos/')) return 'medicacao';
      if (path.startsWith('/encaminhamentos_exames/')) return 'exames';
      if (path.startsWith('/encaminhamentos_radiografias/')) return 'radiografia';
      if (path.startsWith('/encaminhamentos_procedimentos_enfermagem/')) return 'enfermagem';
      if (path.startsWith('/encaminhamentos_gessos_imobilizacoes/')) return 'gesso';
      if (path.startsWith('/encaminhamentos_repousos/')) return 'repouso';

      return null;
    }

    function ehTelaDeAtendimentoDoControle() {
      if (location.pathname.startsWith('/consultar_repousos_medicacoes')) return false;

      const identidade = obterIdentidade();
      if (!identidade.nome || !identidade.nascimento) return false;

      if (document.querySelector('.salvar-encaminhamento-controle-salas')) return true;
      if (detectarSalaAtual()) return true;

      return false;
    }

    function parametrosDataTable(busca) {
      const p = new URLSearchParams();
      p.set('sEcho', '1');
      p.set('iColumns', '7');
      p.set('sColumns', '');
      p.set('iDisplayStart', '0');
      p.set('iDisplayLength', '100');
      p.set('sSearch', busca || '');
      p.set('bRegex', 'false');

      for (let i = 0; i < 7; i++) {
        p.set(`mDataProp_${i}`, String(i));
        p.set(`sSearch_${i}`, '');
        p.set(`bRegex_${i}`, 'false');
        p.set(`bSearchable_${i}`, 'true');
        p.set(`bSortable_${i}`, 'false');
      }

      p.set('iSortCol_0', '0');
      p.set('sSortDir_0', 'desc');
      p.set('iSortingCols', '1');
      return p;
    }

    async function buscarSala(sala, busca) {
      const url = `${sala.endpoint}?${parametrosDataTable(busca).toString()}`;
      const resp = await fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store'
      });

      if (!resp.ok) {
        throw new Error(`${sala.nome}: HTTP ${resp.status}`);
      }

      const json = await resp.json();
      const linhas = Array.isArray(json?.aaData) ? json.aaData : [];

      return linhas.map(linha => ({
        sala: sala.key,
        salaNome: sala.nome,
        data: String(linha?.[0] ?? '').trim(),
        hora: String(linha?.[1] ?? '').trim(),
        nascimento: String(linha?.[2] ?? '').trim(),
        nome: String(linha?.[3] ?? '').trim(),
        medico: String(linha?.[4] ?? '').trim(),
        senha: String(linha?.[5] ?? '').trim(),
        status: String(linha?.[6] ?? '').trim()
      }));
    }


    async function buscarSalaExata(sala, atendimento, busca) {
      atendimento = String(atendimento || '').match(/\d+/)?.[0] || '';
      if (!atendimento) return [];

      const p = new URLSearchParams();
      p.set('format', 'json');
      p.set('per_page', '200');
      if (busca) p.set('search', busca);

      const resp = await fetch(`${sala.endpoint}?${p.toString()}`, {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!resp.ok) throw new Error(`${sala.nome}: HTTP ${resp.status}`);

      const json = await resp.json();
      const arr = Array.isArray(json) ? json
        : Array.isArray(json?.data) ? json.data
        : Array.isArray(json?.items) ? json.items
        : [];
      const alvo = `AtendimentoPa#${atendimento}`;

      return arr
        .filter(item => String(item?.atendimento_str || '').trim() === alvo)
        .map(item => ({
          sala: sala.key,
          salaNome: sala.nome,
          data: String(item?.data_encaminhamento ?? '').trim(),
          hora: String(item?.hora_encaminhamento ?? '').trim(),
          nascimento: String(item?.data_nascimento_municipe ?? '').trim(),
          nome: String(item?.nome_municipe ?? '').trim(),
          medico: String(item?.profissional_responsavel ?? '').trim(),
          senha: String(item?.senha ?? '').trim(),
          status: String(item?.status ?? '').trim(),
          atendimentoStr: String(item?.atendimento_str ?? '').trim(),
          encaminhamentoId: String(item?.encaminhamento_id ?? '').trim(),
          fonteExata: true
        }));
    }

    function idEncaminhamentoDaFicha(salaAtual) {
      const path = location.pathname;
      if (salaAtual === 'medicacao') {
        try {
          const q = new URLSearchParams(location.search);
          const qid = String(q.get('encaminhamento_medicacao_id') || '').match(/\d+/)?.[0] || '';
          if (qid) return qid;
        } catch (_) {}
        return path.match(/^\/aplicacoes_medicamentos\/(\d+)/)?.[1] || '';
      }
      const mapas = {
        exames: /^\/encaminhamentos_exames\/(\d+)/,
        radiografia: /^\/encaminhamentos_radiografias\/(\d+)/,
        enfermagem: /^\/encaminhamentos_procedimentos_enfermagem\/(\d+)/,
        gesso: /^\/encaminhamentos_gessos_imobilizacoes\/(\d+)/
      };
      return String(path.match(mapas[salaAtual])?.[1] || '');
    }

    async function resolverAtendimentoExatoDaFicha(salaAtual, identidade = {}) {
      const idEnc = idEncaminhamentoDaFicha(salaAtual);
      if (!idEnc || !salaAtual) return '';
      const sala = SALAS_EXATAS.find(x => x.key === salaAtual);
      if (!sala) return '';
      try {
        const p = new URLSearchParams({ format:'json', per_page:'200' });
        if (identidade?.nome) p.set('search', identidade.nome);
        const r = await fetch(`${sala.endpoint}?${p.toString()}`, {
          method:'GET', credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}
        });
        if (!r.ok) return '';
        const j = await r.json();
        const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.items) ? j.items : [];
        const item = arr.find(x => String(x?.encaminhamento_id ?? x?.id ?? '').replace(/\D/g,'') === String(idEnc));
        const m = String(item?.atendimento_str || item?.atendimentoStr || '').match(/^AtendimentoPa#(\d+)$/i);
        if (!m) return '';
        try { sessionStorage.setItem(CS_ATENDIMENTO_PA_FILHO, m[1]); } catch (_) {}
        try {
          localStorage.setItem(CS_ATENDIMENTO_CHAMADO, JSON.stringify({ atendimento:`AtendimentoPa#${m[1]}`, em:Date.now(), origem:'ficha_exata', encaminhamento:idEnc }));
        } catch (_) {}
        return m[1];
      } catch (_) { return ''; }
    }

    async function buscarMapaAtivoServidor(atendimento) {
      atendimento = String(atendimento || '').match(/\d+/)?.[0] || '';
      if (!atendimento) return null;

      const resultados = await Promise.allSettled(SALAS_EXATAS.map(async sala => {
        const u = new URL('/encaminhamentos_controle_salas/buscar_url_encaminhamentos_prontuario', location.origin);
        u.searchParams.set('prontuariavel_id', atendimento);
        u.searchParams.set('prontuariavel_type', 'AtendimentoPa');
        u.searchParams.set('codigo_sala', sala.codigo);
        const r = await fetch(u.toString(), { credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' } });
        if (!r.ok) throw new Error(`${sala.nome}: HTTP ${r.status}`);
        const valor = await r.json();
        return { sala:sala.key, url:typeof valor === 'string' ? valor : '' };
      }));

      const ativos = new Set(), urls = new Map(), erros = [];
      let sucessos = 0;
      resultados.forEach((r,i) => {
        if (r.status === 'fulfilled') {
          sucessos++;
          urls.set(r.value.sala, r.value.url || '');
          if (r.value.url) ativos.add(r.value.sala);
        } else erros.push(String(r.reason?.message || r.reason || SALAS_EXATAS[i].nome));
      });

      // Só usa o mapa para EXCLUIR salas quando todas responderam. Assim uma falha
      // momentânea nunca faz uma pendência verdadeira desaparecer.
      return { confiavel: sucessos === SALAS_EXATAS.length, ativos, urls, erros };
    }

    function episodioExato(linhas, identidade, salaAtual, fluxo = {}) {
      const todas = Array.isArray(linhas) ? linhas : [];
      const handoff = fluxo?.handoffPosSalvar || null;
      const destino = String(handoff?.destino || '');

      let ancora = null;
      if (destino && destino !== 'atendimento') {
        ancora = todas.find(l => l.sala === destino && statusAtivo(l.status)) || null;
      }
      if (!ancora && salaAtual) ancora = todas.find(l => l.sala === salaAtual) || null;
      if (!ancora) {
        ancora = [...todas].sort((a,b) => timestampLinha(b) - timestampLinha(a))[0] || null;
      }

      // Mesmo que a fila ainda não tenha refletido a transição, o backend já
      // confirmou o destino no POST. Criamos uma âncora sem data inventada para
      // manter o painel no episódio certo e nunca cair em atendimento antigo.
      if (!ancora && handoff?.atendimento) {
        ancora = {
          sala: destino && destino !== 'atendimento' ? destino : salaAtual,
          salaNome: nomeSalaPorKey(destino && destino !== 'atendimento' ? destino : salaAtual),
          data: '', hora: '', nascimento: identidade.nascimento || '', nome: identidade.nome || '',
          medico: identidade.medico || '', senha: identidade.senha || '', status: 'Em Espera', fonteExata: true
        };
      }

      if (!ancora) return null;
      return { ancora, linhas: todas, ambiguo: false, exato: true };
    }

    function correspondeAoPaciente(linha, identidade) {
      if (normalizar(linha.nome) !== normalizar(identidade.nome)) return false;

      if (
        identidade.nascimento &&
        linha.nascimento &&
        normalizar(linha.nascimento) !== normalizar(identidade.nascimento)
      ) return false;

      if (
        identidade.medico &&
        linha.medico &&
        normalizar(linha.medico) !== normalizar(identidade.medico)
      ) return false;

      if (
        !senhaVazia(identidade.senha) &&
        !senhaVazia(linha.senha) &&
        normalizar(linha.senha) !== normalizar(identidade.senha)
      ) return false;
      return true;
    }

    function timestampLinha(linha) {
      const m = String(linha.data).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const h = String(linha.hora).match(/^(\d{2}):(\d{2})/);
      if (!m || !h) return 0;

      return new Date(
        Number(m[3]),
        Number(m[2]) - 1,
        Number(m[1]),
        Number(h[1]),
        Number(h[2]),
        0,
        0
      ).getTime();
    }

    function statusEh(linha, valor) {
      return normalizar(linha.status) === normalizar(valor);
    }

    function escolherEpisodio(linhas, identidade, salaAtual, fluxo = {}) {
      const compativeis = linhas.filter(l => correspondeAoPaciente(l, identidade));
      if (!compativeis.length) return null;

      const handoff = fluxo?.handoffPosSalvar || null;
      const destinoHandoff = String(handoff?.destino || '');
      let ancoras = [];

      // Logo após salvar, a sala atual pode já ter desaparecido da Consulta do
      // Controle de Salas. Se procurarmos a sala concluída, podemos cair em um
      // atendimento ANTIGO do mesmo munícipe. O destino confirmado pelo backend
      // é a melhor âncora para localizar o episódio recém-salvo.
      if (destinoHandoff && destinoHandoff !== 'atendimento') {
        ancoras = compativeis.filter(l => l.sala === destinoHandoff && statusAtivo(l.status));
      }

      // Fora do pós-salvar, só usa a sala atual como âncora se ela ainda estiver
      // ATIVA. Nunca ancora em registro concluído/cancelado antigo.
      if (!ancoras.length && salaAtual) {
        ancoras = compativeis.filter(l => l.sala === salaAtual && statusAtivo(l.status));
      }

      if (ancoras.length) {
        const andamento = ancoras.filter(l => statusEh(l, 'Em Andamento'));
        const espera = ancoras.filter(l => statusEh(l, 'Em Espera'));
        ancoras = andamento.length ? andamento : (espera.length ? espera : ancoras);
      } else {
        const ativos = compativeis.filter(l => statusAtivo(l.status));
        ancoras = ativos.length ? ativos : compativeis;
      }

      ancoras.sort((a, b) => timestampLinha(b) - timestampLinha(a));
      const ancora = ancoras[0];
      if (!ancora) return null;

      const episodio = compativeis.filter(l =>
        l.data === ancora.data &&
        l.hora === ancora.hora
      );

      return {
        ancora,
        linhas: episodio,
        ambiguo: ancoras.length > 1 && timestampLinha(ancoras[0]) === timestampLinha(ancoras[1])
      };
    }

    function statusAtivo(status) {
      const s = normalizar(status);
      return !/CONCLUI|FINALIZ|CANCEL/.test(s);
    }

    function instalarCss() {
      if (document.getElementById('om30-pendencias-controle-salas-css')) return;

      const style = document.createElement('style');
      style.id = 'om30-pendencias-controle-salas-css';
      style.textContent = `
        #${ID_PAINEL}{
          width:calc(100% - 24px);
          max-width:none;
          box-sizing:border-box;
          margin:0 12px 12px 12px;
          border:1px solid #dfe6ea;
          border-radius:10px;
          background:#fff;
          box-shadow:0 3px 12px rgba(38,57,66,.08);
          font-family:"Segoe UI",Arial,Helvetica,sans-serif;
          overflow:hidden;
        }
        #${ID_PAINEL} .om30cs-head{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
          padding:9px 11px;
          background:#f8fafb;
          border-bottom:1px solid #e8edef;
        }
        #${ID_PAINEL} .om30cs-heading{
          display:flex;
          align-items:center;
          gap:10px;
          min-width:0;
        }
        #${ID_PAINEL} .om30cs-mark{
          width:3px;
          height:24px;
          border-radius:999px;
          background:#c62828;
          flex:0 0 auto;
        }
        #${ID_PAINEL} .om30cs-title-wrap{
          min-width:0;
        }
        #${ID_PAINEL} .om30cs-title{
          color:#263942;
          font-size:14px;
          line-height:1.2;
          font-weight:700;
          letter-spacing:.1px;
        }
        #${ID_PAINEL} .om30cs-subtitle{
          margin-top:2px;
          color:#7a8a92;
          font-size:11px;
          line-height:1.25;
        }
        #${ID_PAINEL} .om30cs-body{
          padding:10px 11px 10px;
        }
        #${ID_PAINEL} .om30cs-meta{
          display:flex;
          flex-wrap:wrap;
          gap:6px;
          margin-bottom:8px;
        }
        #${ID_PAINEL} .om30cs-chip{
          display:inline-flex;
          align-items:center;
          min-height:24px;
          padding:3px 8px;
          border:1px solid #e1e7ea;
          border-radius:999px;
          background:#f8fafb;
          color:#60727b;
          font-size:11px;
          line-height:1.2;
        }
        #${ID_PAINEL} .om30cs-section-head{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin-bottom:8px;
        }
        #${ID_PAINEL} .om30cs-current{
          margin:0 0 7px 0;padding:8px 11px;border-radius:8px;background:#f4f7f9;border:1px solid #dde6ea;
          color:#40545e;font-size:11px;font-weight:800;
        }
        #${ID_PAINEL} .om30cs-next{
          margin:0 0 10px 0;padding:10px 12px;border-radius:8px;border:2px solid #0f4c81;background:#eef6ff;color:#123b5d;
          font-size:12px;font-weight:800;line-height:1.35;
        }
        #${ID_PAINEL} .om30cs-next strong{display:block;margin-top:2px;font-size:14px;font-weight:900;color:#0b3556}
        #${ID_PAINEL} .om30cs-next.aguardando{border-color:#d7dee2;background:#f8fafb;color:#667780}
        #${ID_PAINEL} .om30cs-note{
          margin:0 0 10px 0;
          padding:9px 11px;
          border:1px solid #ead9d7;
          border-left:3px solid #c62828;
          border-radius:8px;
          background:#fffafa;
          color:#4f626b;
          font-size:11px;
          line-height:1.4;
        }
        #${ID_PAINEL} .om30cs-note strong{
          color:#a12622;
          font-weight:700;
        }
        #${ID_PAINEL} .om30cs-label{
          color:#263942;
          font-size:13px;
          font-weight:700;
        }
        #${ID_PAINEL} .om30cs-count{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          min-width:24px;
          height:24px;
          padding:0 7px;
          border-radius:999px;
          background:#eef2f4;
          color:#52666f;
          font-size:11px;
          font-weight:700;
        }
        #${ID_PAINEL} .om30cs-list{
          display:grid;
          gap:7px;
        }
        #${ID_PAINEL} .om30cs-row{
          display:flex;
          align-items:center;
          gap:10px;
          min-height:34px;
          padding:7px 9px;
          border:1px solid #e4eaed;
          border-radius:8px;
          background:#fff;
        }
        #${ID_PAINEL} .om30cs-dot{
          width:9px;
          height:9px;
          border-radius:50%;
          background:#c62828;
          box-shadow:0 0 0 3px rgba(198,40,40,.10);
          flex:0 0 auto;
        }
        #${ID_PAINEL} .om30cs-room{
          color:#2d414a;
          font-size:13px;
          font-weight:700;
          line-height:1.3;
        }
        #${ID_PAINEL} .om30cs-pos{
          min-width:24px; height:24px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center;
          border-radius:999px; background:#eef2f4; color:#455a64; font-size:11px; font-weight:900; flex:0 0 auto;
        }
        #${ID_PAINEL} .om30cs-room-wrap{ min-width:0; flex:1 1 auto; }
        #${ID_PAINEL} .om30cs-status{ margin-top:2px; color:#7a8a92; font-size:10px; font-weight:700; }
        #${ID_PAINEL} .om30cs-status.proxima{ color:#a12622; }
        #${ID_PAINEL} .om30cs-status.andamento{ color:#1d4ed8; font-weight:900; }
        #${ID_PAINEL} .om30cs-row.om30cs-row-andamento{
          border-color:#93c5fd;
          background:#eff6ff;
          box-shadow:inset 4px 0 0 #2563eb;
        }
        #${ID_PAINEL} .om30cs-row.om30cs-row-andamento .om30cs-dot{
          background:#2563eb;
          box-shadow:0 0 0 3px rgba(37,99,235,.12);
        }
        #${ID_PAINEL} .om30cs-row.om30cs-row-andamento .om30cs-room{color:#1e3a5f;}
        #${ID_PAINEL} .om30cs-retorno{
          margin-top:12px;
          padding:10px 12px;
          border-radius:9px;
          border:1px solid #dbe3e7;
          background:#f8fafb;
          color:#33464f;
          font-size:12px;
          font-weight:700;
        }
        #${ID_PAINEL} .om30cs-retorno.sim{
          position:relative;
          display:flex;
          align-items:center;
          gap:11px;
          padding:12px 13px;
          border:2px solid #263238;
          border-left:6px solid #c62828;
          background:#fff;
          box-shadow:0 3px 10px rgba(38,50,56,.10);
          color:#17262d;
        }
        #${ID_PAINEL} .om30cs-retorno-icon{
          width:34px;
          height:34px;
          border-radius:50%;
          display:flex;
          align-items:center;
          justify-content:center;
          flex:0 0 auto;
          background:#263238;
          color:#fff;
          font-size:19px;
          font-weight:900;
          line-height:1;
        }
        #${ID_PAINEL} .om30cs-retorno-main{
          min-width:0;
          flex:1 1 auto;
        }
        #${ID_PAINEL} .om30cs-retorno-top{
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        }
        #${ID_PAINEL} .om30cs-retorno-title{
          color:#17262d;
          font-size:13px;
          font-weight:950;
          letter-spacing:.15px;
          line-height:1.25;
        }
        #${ID_PAINEL} .om30cs-retorno-badge{
          display:inline-flex;
          align-items:center;
          min-height:20px;
          padding:2px 7px;
          border-radius:999px;
          background:#c62828;
          color:#fff;
          font-size:9px;
          font-weight:900;
          letter-spacing:.45px;
          white-space:nowrap;
        }
        #${ID_PAINEL} .om30cs-retorno-desc{
          margin-top:4px;
          color:#50636c;
          font-size:11px;
          font-weight:650;
          line-height:1.35;
        }
        #${ID_PAINEL} .om30cs-retorno.nao{
          position:relative;
          display:flex;
          align-items:center;
          gap:11px;
          padding:12px 13px;
          border:2px solid #263238;
          border-left:6px solid #2e7d32;
          background:#fff;
          box-shadow:0 3px 10px rgba(38,50,56,.10);
          color:#17262d;
        }
        #${ID_PAINEL} .om30cs-retorno.nao .om30cs-retorno-icon{
          background:#2e7d32;
        }
        #${ID_PAINEL} .om30cs-retorno.nao .om30cs-retorno-badge{
          background:#2e7d32;
        }
        #${ID_PAINEL} .om30cs-empty{
          padding:8px 10px;
          border:1px solid #e3e9ec;
          border-radius:8px;
          background:#f8fafb;
          color:#60727b;
          font-size:13px;
        }
        #${ID_PAINEL} .om30cs-error{
          padding:10px 12px;
          border:1px solid #efd2d0;
          border-radius:8px;
          background:#fff8f7;
          color:#a12622;
          font-size:13px;
        }
        #${ID_PAINEL} .om30cs-foot{
          margin-top:10px;
          color:#98a5aa;
          font-size:10px;
          text-align:right;
        }
      `;
      document.head.appendChild(style);
    }

    function garantirPainel() {
      let painel = document.getElementById(ID_PAINEL);
      if (painel) return painel;

      instalarCss();

      painel = document.createElement('div');
      painel.id = ID_PAINEL;
      painel.innerHTML = `
        <div class="om30cs-head">
          <div class="om30cs-heading">
            <span class="om30cs-mark"></span>
            <div class="om30cs-title-wrap">
              <div class="om30cs-title">Salas pendentes do munícipe</div>
            </div>
          </div>
        </div>
        <div class="om30cs-body">
          <div class="om30cs-empty">Carregando pendências...</div>
        </div>
      `;

      const pageContent = document.querySelector('.page-content');
      const contentBox = pageContent?.querySelector('.content-box');

      if (contentBox?.parentElement) {
        contentBox.parentElement.insertBefore(painel, contentBox);
      } else if (pageContent) {
        pageContent.prepend(painel);
      } else {
        document.body.prepend(painel);
      }

      return painel;
    }

    function escaparHtml(valor) {
      return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function renderizarCarregando() {
      // Só mostra "Carregando" na PRIMEIRA montagem. Em atualizações silenciosas
      // mantém o último estado válido na tela para não piscar.
      if (ESTADO_PEND.html || ESTADO_PEND.estado) return;
      const painel = garantirPainel();
      const body = painel.querySelector('.om30cs-body');
      if (!body.dataset.om30Inicial) {
        body.dataset.om30Inicial = '1';
        body.innerHTML = '<div class="om30cs-empty">Carregando pendências...</div>';
      }
    }

    function renderizarErro(msg) {
      // Falha transitória não apaga um estado já válido da tela.
      if (ESTADO_PEND.html || ESTADO_PEND.estado) {
        console.warn('[OM30 PENDÊNCIAS] atualização ignorada; mantendo último estado:', msg);
        return;
      }
      const painel = garantirPainel();
      const body = painel.querySelector('.om30cs-body');
      body.innerHTML = `
        <div class="om30cs-error">${escaparHtml(msg)}</div>
      `;
    }

    function rotuloStatusPendencia(status) {
      const s = normalizar(status);
      if (s === 'EM ANDAMENTO') return { texto: 'Em atendimento agora', classe: 'andamento' };
      if (s === 'EM ESPERA') return { texto: 'Próxima sala', classe: 'proxima' };
      if (s === 'EM OUTRA SALA') return { texto: 'Pendente', classe: '' };
      return { texto: String(status || 'Pendente'), classe: '' };
    }

    function nomeSalaPorKey(key) {
      if (key === 'atendimento') return 'Retorno ao consultório médico';
      return SALAS.find(x => x.key === key)?.nome || String(key || '').replace(/_/g, ' ');
    }

    function salasJaPercorridas(salaAtual, fluxo, posicoes) {
      const anteriores = new Set();
      if (!salaAtual) return anteriores;

      const posAtual = posicoes.get(salaAtual);
      if (Number.isFinite(posAtual)) {
        for (const [sala, pos] of posicoes.entries()) {
          if (Number.isFinite(pos) && pos < posAtual) anteriores.add(String(sala));
        }
      }

      // O status devolvido pelas datatables das salas acompanha a fila global e
      // pode continuar como PENDENTE/EM OUTRA SALA mesmo depois daquela sala já
      // ter sido concluída. Por isso o histórico confirmado pelo próprio backend
      // tem prioridade para dizer o que já ficou para trás.
      const transicoes = fluxo?.transicoes || {};
      const fila = [String(salaAtual)];
      const visitados = new Set();
      while (fila.length) {
        const alvo = fila.shift();
        if (!alvo || visitados.has(alvo)) continue;
        visitados.add(alvo);
        for (const [origem, destino] of Object.entries(transicoes)) {
          if (!origem || !destino) continue;
          if (String(destino) !== alvo) continue;
          if (origem === 'atendimento') continue;
          if (!anteriores.has(origem)) anteriores.add(origem);
          fila.push(String(origem));
        }
      }

      const handoff = fluxo?.handoffPosSalvar;
      if (handoff?.destino === salaAtual && handoff?.origem) anteriores.add(String(handoff.origem));
      anteriores.delete(String(salaAtual));
      return anteriores;
    }

    function ultimaSalaConhecida(salaAtual, fluxo, posicoes, pendencias) {
      if (!salaAtual) return false;

      const transicao = String(fluxo?.transicoes?.[salaAtual] || '');
      if (transicao === 'atendimento') return true;
      if (transicao && transicao !== 'atendimento') return false;

      const posAtual = posicoes.get(salaAtual);
      if (Number.isFinite(posAtual) && posicoes.size) {
        const maiores = [...posicoes.values()].filter(pos => Number.isFinite(pos) && pos > posAtual);
        if (!maiores.length) return true;
      }

      // Se chegamos aqui por um handoff confirmado do backend e, depois de
      // remover as salas já percorridas, não existe outra sala futura, tratamos
      // esta como a última conhecida. O retorno em si continua NÃO presumido:
      // será confirmado somente na resposta do Salvar.
      const handoff = fluxo?.handoffPosSalvar;
      if (handoff?.destino === salaAtual && handoff?.origem && !pendencias.length) return true;

      // Sem ordem/retorno confirmados não adivinha que uma sala é a última.
      return false;
    }

    function proximoDestinoSeguro(salaAtual, pendencias, fluxo, posicoes, mapaAtivo = null) {
      if (!salaAtual) return { key: '', fonte: '' };

      // Depois do Salvar, a resposta real do Saúde Simples continua soberana.
      const handoff = fluxo?.handoffPosSalvar;
      if (handoff?.origem === salaAtual && handoff?.destino) {
        return { key: String(handoff.destino), fonte: 'handoff_backend' };
      }

      // Antes do Salvar, primeiro aproveita a verdade nativa da fila: se exatamente
      // uma sala do AtendimentoPa está marcada "Em Espera", ela é a próxima.
      const emEsperaNativa = pendencias.filter(p => p?.fonteNativa === true && normalizar(p.status) === 'EM ESPERA');
      if (emEsperaNativa.length === 1) {
        return { key: String(emEsperaNativa[0].sala), fonte: 'api_nativa_em_espera' };
      }

      // buscar_url_encaminhamentos_prontuario informa as salas ainda ativas.
      // Se, excluindo a sala atual/concluídas, só sobrou uma, não há ambiguidade.
      if (mapaAtivo?.confiavel && mapaAtivo.ativos instanceof Set) {
        const concluidas = new Set((Array.isArray(fluxo?.concluidas) ? fluxo.concluidas : []).map(String));
        const futuras = [...mapaAtivo.ativos]
          .map(String)
          .filter(sala => sala && sala !== String(salaAtual) && !concluidas.has(sala));
        if (futuras.length === 1) return { key: futuras[0], fonte: 'api_nativa_mapa_ativo' };
      }

      // Quando o script dos médicos passar a enviar a próxima sala explicitamente,
      // este campo já será entendido sem nova alteração deste lado.
      const proximaCentral = String(fluxo?.proximaSalaCentral || '');
      if (proximaCentral && proximaCentral !== String(salaAtual)) {
        return { key: proximaCentral, fonte: 'ponte_central_proxima' };
      }

      const posAtual = posicoes.get(salaAtual);
      if (Number.isFinite(posAtual)) {
        const candidatos = [...posicoes.entries()]
          .filter(([, pos]) => Number.isFinite(pos) && pos > posAtual)
          .sort((a, b) => a[1] - b[1]);
        if (candidatos.length) return { key: candidatos[0][0], fonte: 'ponte_central_ordem' };
        if (fluxo?.retornoConfirmado === true) return { key: 'atendimento', fonte: 'ponte_central_retorno' };
      }

      const transicao = String(fluxo?.transicoes?.[salaAtual] || '');
      if (transicao) return { key: transicao, fonte: 'transicao_backend' };

      const emEspera = pendencias.filter(p => normalizar(p.status) === 'EM ESPERA');
      if (emEspera.length === 1) return { key: emEspera[0].sala, fonte: 'status_em_espera' };
      if (pendencias.length === 1) return { key: pendencias[0].sala, fonte: 'unica_pendencia' };

      return { key: '', fonte: '' };
    }

    function renderizarResultado(identidade, salaAtual, episodio, fluxo = {}, mapaAtivo = null) {
      const painel = garantirPainel();
      const body = painel.querySelector('.om30cs-body');

      if (!episodio) {
        renderizarErro('Não foi possível localizar com segurança este atendimento na Consulta do Controle de Salas.');
        return;
      }

      const fonteOrdemConfiavel = fluxo?.ordemFonte === 'transicoes_backend' || fluxo?.fonteCentral === true || fluxo?.fonte === 'ponte_central';
      const ordemConfirmada = fonteOrdemConfiavel && Array.isArray(fluxo?.ordem) && fluxo.ordem.length
        ? fluxo.ordem.filter(x => x?.sala && Number.isFinite(Number(x?.posicao)))
        : [];
      const posicoes = new Map(ordemConfirmada.map(x => [String(x.sala), Number(x.posicao)]));

      const rankStatus = linha => {
        const st = normalizar(linha?.status);
        if (st === 'EM ANDAMENTO') return 0;
        if (st === 'EM ESPERA') return 1;
        if (st === 'EM OUTRA SALA') return 2;
        return 3;
      };

      const jaPercorridas = salasJaPercorridas(salaAtual, fluxo, posicoes);
      const concluidasBackend = new Set((Array.isArray(fluxo?.concluidas) ? fluxo.concluidas : []).map(String));
      const posAtualConfirmada = posicoes.get(salaAtual);

      // 1) Estado real do Saúde Simples para ESTE AtendimentoPa.
      let pendenciasNativas = (episodio?.linhas || [])
        .filter(l => statusAtivo(l.status))
        .filter(l => !salaAtual || l.sala !== salaAtual)
        .filter(l => !concluidasBackend.has(String(l.sala)))
        .filter(l => !mapaAtivo?.confiavel || mapaAtivo.ativos.has(String(l.sala)))
        .filter(l => !jaPercorridas.has(String(l.sala)))
        .filter(l => {
          const pos = posicoes.get(l.sala);
          if (Number.isFinite(posAtualConfirmada) && Number.isFinite(pos) && pos <= posAtualConfirmada) return false;
          return true;
        })
        .map(l => ({ ...l, fonteNativa: true }));

      // Se a datatable ainda não trouxe a linha, mas buscar_url... confirmou a sala
      // como ativa, mantém a pendência visível. Não inventa ordem/status.
      if (mapaAtivo?.confiavel && mapaAtivo.ativos instanceof Set) {
        for (const sala of mapaAtivo.ativos) {
          const key = String(sala || '');
          if (!key || key === String(salaAtual) || concluidasBackend.has(key) || jaPercorridas.has(key)) continue;
          if (pendenciasNativas.some(p => String(p.sala) === key)) continue;
          pendenciasNativas.push({
            sala: key,
            salaNome: nomeSalaPorKey(key),
            status: 'Pendente',
            fonteNativa: true,
            sinteticaMapaAtivo: true
          });
        }
      }

      // 2) A ponte do médico pode mandar pendências explicitamente. Enquanto o Worker
      // atual mandar apenas "ordem", derivamos as pendências futuras dessa ordem.
      let pendenciasCentral = [];
      if (Array.isArray(fluxo?.pendenciasCentral) && fluxo.pendenciasCentral.length) {
        pendenciasCentral = fluxo.pendenciasCentral
          .filter(x => x?.sala && String(x.sala) !== String(salaAtual))
          .filter(x => !concluidasBackend.has(String(x.sala)))
          .filter(x => !jaPercorridas.has(String(x.sala)))
          .filter(x => {
            const pos = Number(x?.posicao);
            return !Number.isFinite(posAtualConfirmada) || !Number.isFinite(pos) || pos > posAtualConfirmada;
          })
          .map(x => ({
            sala: String(x.sala),
            salaNome: nomeSalaPorKey(x.sala),
            status: String(x.status || 'Pendente'),
            sinteticaPonteCentral: true,
            ...(Number.isFinite(Number(x.posicao)) ? { posicao:Number(x.posicao) } : {})
          }));
      } else if (ordemConfirmada.length && Number.isFinite(posAtualConfirmada)) {
        pendenciasCentral = ordemConfirmada
          .filter(x => Number(x.posicao) > Number(posAtualConfirmada))
          .filter(x => !concluidasBackend.has(String(x.sala)))
          .map(x => ({
            sala: String(x.sala),
            salaNome: nomeSalaPorKey(x.sala),
            status: 'Pendente',
            sinteticaOrdemConfirmada: true,
            sinteticaPonteCentral: true,
            posicao: Number(x.posicao)
          }));
      }

      // Mescla as duas fontes. A ponte dá sequência/retorno; a API nativa dá o
      // estado atual. Quando ambas conhecem a mesma sala, preserva o status nativo.
      let pendencias = pendenciasCentral.length
        ? pendenciasCentral.map(p => {
            const nativa = pendenciasNativas.find(n => String(n.sala) === String(p.sala));
            return nativa
              ? { ...p, ...nativa, posicao: p.posicao ?? nativa.posicao, fonteNativa: true }
              : p;
          })
        : [...pendenciasNativas];

      for (const nativa of pendenciasNativas) {
        if (!pendencias.some(p => String(p.sala) === String(nativa.sala))) pendencias.push(nativa);
      }

      pendencias.sort((a, b) => {
        const pa = Number(a.posicao ?? posicoes.get(a.sala));
        const pb = Number(b.posicao ?? posicoes.get(b.sala));
        if (Number.isFinite(pa) && Number.isFinite(pb) && pa !== pb) return pa - pb;
        if (Number.isFinite(pa)) return -1;
        if (Number.isFinite(pb)) return 1;
        const ra = rankStatus(a), rb = rankStatus(b);
        return ra !== rb ? ra - rb : 0;
      });

      const proximo = proximoDestinoSeguro(salaAtual, pendencias, fluxo, posicoes, mapaAtivo);

      // Se a resposta da última sala já confirmou RETORNO AO CONSULTÓRIO MÉDICO, não deixa
      // datatables atrasadas reapresentarem Exames/Raio-X como pendentes.
      if (proximo.key === 'atendimento' || fluxo?.handoffPosSalvar?.destino === 'atendimento') {
        pendencias = [];
      }

      // Pós-salvar: a resposta do próprio Saúde Simples já confirmou o destino,
      // mas a Consulta do Controle de Salas pode demorar alguns instantes para
      // refletir a nova fila. Nesse intervalo mostramos a sala confirmada sem
      // inventar status e sem abrir /edit em segundo plano.
      if (
        proximo.key &&
        proximo.key !== 'atendimento' &&
        !pendencias.some(p => p.sala === proximo.key)
      ) {
        pendencias = [{
          sala: proximo.key,
          salaNome: nomeSalaPorKey(proximo.key),
          status: 'Em Espera',
          sinteticaDestinoConfirmado: true
        }, ...pendencias];
      }

      const senha = episodio?.ancora?.senha || identidade.senha || '—';
      // retornoConhecido vem somente do fluxo real do atendimento (ponte do médico
      // ou handoff nativo). Nunca usa checkbox da sala atual para inferir SIM/NÃO.
      const retornoConhecido = typeof fluxo?.retorno_medico === 'boolean'
        ? fluxo.retorno_medico
        : (fluxo?.retornoConfirmado === true ? true
        : (fluxo?.retornoConfirmado === false ? false : null));
      const ultimaSala = ultimaSalaConhecida(salaAtual, fluxo, posicoes, pendencias);

      // Retorno médico é o DESTINO FINAL, não deve esconder as salas que ainda
      // vêm antes dele. Só vira "próximo destino" quando não existe outra sala.
      const retornoDiretoAgora =
        proximo.key === 'atendimento' ||
        fluxo?.handoffPosSalvar?.destino === 'atendimento';

      const retornoFinalSim = retornoConhecido === true;
      const retornoFinalNao = retornoConhecido === false;
      const retornoConfirmadoAgora = retornoDiretoAgora || (retornoFinalSim && !pendencias.length);
      // Se o SIM/NÃO do retorno não estiver disponível, não existe um terceiro
      // estado clínico. O painel simplesmente omite a informação de retorno e
      // continua mostrando o que as APIs nativas conseguem confirmar.
      const retornoLeituraFalhou = false;

      const chipData = episodio?.ancora?.data && episodio?.ancora?.hora
        ? `<span class="om30cs-chip">${escaparHtml(episodio.ancora.data)} às ${escaparHtml(episodio.ancora.hora)}</span>`
        : '';
      const semRetornoFinal = retornoFinalNao && !pendencias.length;
      const labelSecao = retornoConfirmadoAgora
        ? 'Próximo destino'
        : (semRetornoFinal ? 'Retorno médico' : 'Ainda precisa passar por');
      const countSecao = retornoConfirmadoAgora ? '↩' : (semRetornoFinal ? '—' : pendencias.length);

      let html = `
        <div class="om30cs-meta">
          ${chipData}
          <span class="om30cs-chip">Senha: ${escaparHtml(senha || '—')}</span>
        </div>
        <div class="om30cs-section-head">
          <div class="om30cs-label">${labelSecao}</div>
          <div class="om30cs-count">${countSecao}</div>
        </div>
      `;

      if (!pendencias.length && retornoConfirmadoAgora) {
        // O cartão de retorno confirmado é renderizado logo abaixo; não mostra
        // "0 / nenhuma pendência", porque isso esconde a informação importante.
      } else if (!pendencias.length && retornoConhecido === false) {
        // O cartão explícito "Sem retorno" é renderizado abaixo; não duplica com
        // "Nenhuma outra sala pendente" porque o que interessa aqui é o destino final.
      } else if (!pendencias.length) {
        html += '<div class="om30cs-empty">Nenhuma outra sala pendente identificada.</div>';
      } else {
        html += '<div class="om30cs-list">';
        for (const p of pendencias) {
          const pos = posicoes.get(p.sala);
          let status = rotuloStatusPendencia(p.status);

          if (proximo.key && p.sala === proximo.key) {
            status = { texto: 'PRÓXIMA SALA', classe: 'proxima' };
          } else if (
            Number.isFinite(pos) &&
            Number.isFinite(posicoes.get(salaAtual)) &&
            pos > posicoes.get(salaAtual)
          ) {
            status = { texto: 'Depois', classe: '' };
          }

          html += `
            <div class="om30cs-row${status.classe === 'andamento' ? ' om30cs-row-andamento' : ''}">
              ${Number.isFinite(pos) ? `<span class="om30cs-pos">${pos}</span>` : '<span class="om30cs-dot"></span>'}
              <div class="om30cs-room-wrap">
                <div class="om30cs-room">${escaparHtml(p.salaNome)}</div>
                <div class="om30cs-status ${status.classe}">${escaparHtml(status.texto)}</div>
              </div>
            </div>
          `;
        }
        html += '</div>';
      }

      if (retornoConfirmadoAgora) {
        html += `
          <div class="om30cs-retorno sim">
            <div class="om30cs-retorno-icon">↩</div>
            <div class="om30cs-retorno-main">
              <div class="om30cs-retorno-top">
                <div class="om30cs-retorno-title">RETORNO MÉDICO OBRIGATÓRIO</div>
                <span class="om30cs-retorno-badge">PRÓXIMO DESTINO</span>
              </div>
              <div class="om30cs-retorno-desc">
                Encaminhar o munícipe de volta ao consultório médico.
              </div>
            </div>
          </div>
        `;
      } else if (retornoFinalSim) {
        // Há salas antes do retorno, mas o destino final já foi confirmado.
        html += `
          <div class="om30cs-retorno sim">
            <div class="om30cs-retorno-icon">↩</div>
            <div class="om30cs-retorno-main">
              <div class="om30cs-retorno-top">
                <div class="om30cs-retorno-title">RETORNO MÉDICO OBRIGATÓRIO</div>
                <span class="om30cs-retorno-badge">ÚLTIMA ETAPA</span>
              </div>
              <div class="om30cs-retorno-desc">
                Após concluir as salas pendentes, o munícipe deve retornar ao consultório médico.
              </div>
            </div>
          </div>
        `;
      } else if (retornoFinalNao) {
        const semRetornoBadge = pendencias.length ? 'DESTINO FINAL' : 'FLUXO FINALIZADO';
        const semRetornoDesc = pendencias.length
          ? 'Após concluir as salas pendentes, o munícipe não retorna ao consultório médico.'
          : 'Não há retorno ao consultório médico após esta etapa.';
        html += `
          <div class="om30cs-retorno nao">
            <div class="om30cs-retorno-icon">✓</div>
            <div class="om30cs-retorno-main">
              <div class="om30cs-retorno-top">
                <div class="om30cs-retorno-title">SEM RETORNO MÉDICO</div>
                <span class="om30cs-retorno-badge">${semRetornoBadge}</span>
              </div>
              <div class="om30cs-retorno-desc">${semRetornoDesc}</div>
            </div>
          </div>
        `;
      }

      // Este painel trabalha pelo AtendimentoPa exato; não usa mais aviso de
      // "mais de um registro no mesmo horário", que pertencia ao fallback por nome/data.

      const estadoAtual = {
        atendimento: String(fluxo?.atendimento || ''),
        salaAtual: String(salaAtual || ''),
        proximo: { key: String(proximo?.key || ''), fonte: String(proximo?.fonte || '') },
        pendencias: pendencias.map(p => ({
          sala: String(p?.sala || ''),
          salaNome: String(p?.salaNome || nomeSalaPorKey(p?.sala) || ''),
          status: String(p?.status || ''),
          fonteNativa: p?.fonteNativa === true,
          sinteticaMapaAtivo: p?.sinteticaMapaAtivo === true,
          sinteticaPonteCentral: p?.sinteticaPonteCentral === true,
          sinteticaDestinoConfirmado: p?.sinteticaDestinoConfirmado === true
        })),
        retornoConhecido,
        retornoConfirmadoAgora,
        retornoLeituraFalhou,
        retornoAConfirmar: false,
        fonteCentral: fluxo?.fonteCentral === true,
        fluxoCentralAtualizadoEm: String(fluxo?.fluxoCentralAtualizadoEm || ''),
        semRetornoFinal,
        ambiguo: episodio?.ambiguo === true
      };

      const assinatura = JSON.stringify(estadoAtual);
      ESTADO_PEND.estado = estadoAtual;
      pageWindow.__OM30_ESTADO_PENDENCIAS__ = estadoAtual;

      // Não recria o DOM se nada mudou. Isso elimina o "piscar" do painel.
      if (assinatura !== ESTADO_PEND.assinatura || html !== ESTADO_PEND.html) {
        ESTADO_PEND.assinatura = assinatura;
        ESTADO_PEND.html = html;
        body.innerHTML = html;
        body.dataset.om30EstadoValido = '1';
      }

      return estadoAtual;
    }

    let atualizando = false;

    async function atualizar(opcoes = {}) {
      if (atualizando) return ESTADO_PEND.estado;
      if (!ehTelaDeAtendimentoDoControle()) return ESTADO_PEND.estado;

      atualizando = true;
      if (!opcoes?.silencioso) renderizarCarregando();

      try {
        const identidade = obterIdentidade();
        const salaAtual = detectarSalaAtual();

        if (!identidade.nome || !identidade.nascimento) {
          throw new Error('Não consegui identificar o munícipe e a data de nascimento nesta tela.');
        }

        let atendimentoId = pageWindow.OM30FluxoControleSalas?.atendimentoDaPagina?.() || '';
        if (!atendimentoId) atendimentoId = await resolverAtendimentoExatoDaFicha(salaAtual, identidade);

        let fluxo = {};
        try { fluxo = await pageWindow.OM30FluxoControleSalas?.obter?.(atendimentoId) || {}; } catch (_) {}

        const atendimentoExato = String(fluxo?.atendimento || '').match(/\d+/)?.[0] || '';
        let episodio = null;
        let mapaAtivo = null;
        let erros = [];

        if (atendimentoExato) {
          const [resultadosExatos, mapaResultado] = await Promise.all([
            Promise.allSettled(SALAS_EXATAS.map(sala => buscarSalaExata(sala, atendimentoExato, identidade.nome))),
            buscarMapaAtivoServidor(atendimentoExato).catch(() => null)
          ]);
          mapaAtivo = mapaResultado;
          const linhasExatas = [];
          resultadosExatos.forEach((r, i) => {
            if (r.status === 'fulfilled') linhasExatas.push(...r.value);
            else erros.push(`${SALAS_EXATAS[i].nome}: ${r.reason?.message || r.reason}`);
          });
          episodio = episodioExato(linhasExatas, identidade, salaAtual, fluxo);
        }

        // Com AtendimentoPa conhecido NÃO existe fallback por nome/data/hora.
        // Se a datatable exata ainda não refletiu a transição, usa somente o mapa
        // server-side do MESMO AtendimentoPa para manter as salas ativas visíveis.
        if (!episodio && atendimentoExato && mapaAtivo?.confiavel) {
          const linhasMapa = [...mapaAtivo.ativos].map(key => ({
            sala: String(key),
            salaNome: nomeSalaPorKey(key),
            data: '', hora: '',
            nascimento: identidade.nascimento || '',
            nome: identidade.nome || '',
            medico: identidade.medico || '',
            senha: identidade.senha || '',
            status: String(fluxo?.handoffPosSalvar?.destino || '') === String(key) ? 'Em Espera' : 'Em Outra Sala',
            fonteExata: true,
            sinteticaMapaAtivo: true
          }));
          episodio = episodioExato(linhasMapa, identidade, salaAtual, fluxo);
        }

        // Sem linhas ativas ainda podemos renderizar o destino final/retorno usando
        // apenas o AtendimentoPa exato e o fluxo já confirmado. Nunca mistura outro episódio.
        if (!episodio && atendimentoExato) {
          episodio = {
            ancora: {
              sala: salaAtual || '', salaNome: nomeSalaPorKey(salaAtual), data: '', hora: '',
              nascimento: identidade.nascimento || '', nome: identidade.nome || '',
              medico: identidade.medico || '', senha: identidade.senha || '', status: '', fonteExata: true
            },
            linhas: [], ambiguo: false, exato: true
          };
        }

        // Só páginas realmente antigas/abertas fora da fila podem não ter AtendimentoPa.
        // Nesse caso NÃO mostramos um episódio por nome/data, pois isso pode misturar
        // dois atendimentos do mesmo munícipe.
        if (!episodio && !atendimentoExato) {
          throw new Error('Não consegui vincular esta ficha ao atendimento atual. Abra a ficha pela fila do Controle de Salas e tente novamente.');
        }

        return renderizarResultado(identidade, salaAtual, episodio, fluxo, mapaAtivo);
      } catch (e) {
        console.error('[OM30 Controle de Salas]', e);
        renderizarErro(e?.message || String(e));
      } finally {
        atualizando = false;
      }
    }

    function iniciar() {
      if (ESTADO_PEND.iniciado) return;
      if (!ehTelaDeAtendimentoDoControle()) return;

      ESTADO_PEND.iniciado = true;
      garantirPainel();

      pageWindow.OM30PendenciasControleSalas = {
        atualizar: (opcoes = {}) => atualizar({ silencioso: true, ...opcoes }),
        get estado() { return ESTADO_PEND.estado; },
        get assinatura() { return ESTADO_PEND.assinatura; }
      };

      atualizar({ silencioso: false });
    }

    // A v3.0.0 carrega em document-start; a v2.0.80 original carregava em document-idle.
    // Mantém o módulo da 2.0.80, apenas esperando a ficha existir antes de iniciar.
    function iniciarQuandoFichaEstiverPronta() {
      if (ehTelaDeAtendimentoDoControle()) { iniciar(); return true; }
      return false;
    }
    if (!iniciarQuandoFichaEstiverPronta()) {
      const tentativas = [250, 600, 1000, 1600, 2500, 4000];
      tentativas.forEach(ms => setTimeout(iniciarQuandoFichaEstiverPronta, ms));
      document.addEventListener('DOMContentLoaded', iniciarQuandoFichaEstiverPronta, { once:true });
    }
    document.addEventListener('change', event => {
      const el=event.target;
      if(!(el instanceof HTMLInputElement)||el.type!=='checkbox')return;
      if(!/encaminhar_paciente_para_reavaliacao_medica/i.test(String(el.name||el.id||'')))return;
      setTimeout(()=>pageWindow.OM30PendenciasControleSalas?.atualizar?.({silencioso:true}),0);
    },true);
  })();

  // ============================================================
  // CANCELAR TODOS NA FICHA — módulo preservado da v2.0.80
  // ============================================================
  (function OM30CancelarTodosFicha280() {
    'use strict';

    if (!/^\/aplicacoes_medicamentos\/(?:new|create)\/?$/.test(location.pathname)) return;

    const MOTIVOS = [
      'Paciente recusou a medicação.',
      'Paciente não compareceu à sala de medicação após ser chamado.',
      'Medicação em falta na unidade no momento.',
      'Medicação já administrada anteriormente.',
      'Prescrição suspensa/alterada pelo médico.',
      'Difícil acesso venoso.',
      'Outro'
    ];

    const esc280 = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const sleep280 = ms => new Promise(r => setTimeout(r, ms));

    function visivel280(el) {
      if (!el || !el.isConnected) return false;
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && !el.hidden;
    }

    async function esperar280(fn, timeout = 12000, intervalo = 80) {
      const inicio = Date.now();
      while (Date.now() - inicio < timeout) {
        const r = fn();
        if (r) return r;
        await sleep280(intervalo);
      }
      throw new Error('TEMPO_ESGOTADO');
    }

    function modalTitulo280(...titulos) {
      const alvos = titulos.map(x => String(x).trim());
      return [...document.querySelectorAll('.swal2-modal.swal2-show,.swal2-popup.swal2-show')]
        .find(m => visivel280(m) && alvos.includes(String(m.querySelector('.swal2-title')?.textContent || '').replace(/\s+/g,' ').trim())) || null;
    }

    function preencherTextarea280(ta, valor) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(ta, valor); else ta.value = valor;
      ta.dispatchEvent(new Event('input', { bubbles:true }));
      ta.dispatchEvent(new Event('change', { bubbles:true }));
    }

    function itemBotao280(btn) {
      return btn?.closest?.('.encaminhamento_medicacao_atendimento_prescricao_interna,.item-encaminhamento-controle-salas') || null;
    }

    function cancelado280(item) {
      if (!item) return false;
      const c = item.querySelector('input[id$="_cancelada"]');
      const pc = item.querySelector('input[id$="_para_cancelamento"]');
      return String(c?.value || '').toLowerCase() === 'true' || String(pc?.value || '').toLowerCase() === 'true';
    }

    function temAcao280(item) {
      if (!item) return true;
      const pa = item.querySelector('input[id$="_para_atendimento"]');
      const c = item.querySelector('input[id$="_cancelada"]');
      const pc = item.querySelector('input[id$="_para_cancelamento"]');
      return [pa,c,pc].some(el => String(el?.value || '').toLowerCase() === 'true');
    }

    function css280() {
      if (document.getElementById('om30-cancel-ficha-css')) return;
      const st = document.createElement('style');
      st.id = 'om30-cancel-ficha-css';
      st.textContent = `
        .om30-cancel-ficha-topo{display:flex;align-items:center;justify-content:flex-start;gap:8px;margin:0 0 10px;padding:7px 9px;border:1px solid #f1d0d0;border-radius:8px;background:#fffafa}
        .om30-cancel-ficha-btn{margin:0!important;padding:5px 9px!important;min-height:0!important;border:1px solid #ef9a9a!important;border-radius:7px!important;background:#fff5f5!important;color:#b42318!important;font-size:11px!important;line-height:1.15!important;font-weight:800!important;box-shadow:none!important}
        .om30-cancel-ficha-btn:hover{background:#fee2e2!important;border-color:#e57373!important;color:#991b1b!important}
        .om30-cancel-ficha-overlay{position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.48);display:flex;align-items:center;justify-content:center;padding:20px}
        .om30-cancel-ficha-modal{width:min(520px,94vw);max-height:82vh;overflow:auto;background:#fff;border-radius:11px;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:14px;font:12px Arial,sans-serif;color:#1f2937}
        .om30-cancel-ficha-modal h3{margin:0 0 5px;font-size:15px}.om30-cancel-ficha-sub{font-size:11px;color:#64748b;margin-bottom:8px}
        .om30-cancel-ficha-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
        .om30-cancel-ficha-motivo{display:block;width:100%;box-sizing:border-box;margin:0;padding:6px 8px;min-height:32px;border:1px solid #d1d5db;border-radius:6px;background:#fff;text-align:left;font-size:11px;line-height:1.18;font-weight:700;cursor:pointer}
        .om30-cancel-ficha-motivo[data-on="1"]{background:#fff1f2;border-color:#b91c1c;color:#991b1b}
        .om30-cancel-ficha-texto{width:100%;box-sizing:border-box;min-height:50px;margin-top:6px;padding:7px;border:1px solid #d1d5db;border-radius:6px;resize:vertical;font-size:11px}
        .om30-cancel-ficha-acoes{display:flex;justify-content:flex-end;gap:6px;margin-top:10px}.om30-cancel-ficha-acoes button{padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;font-size:11px;font-weight:800;cursor:pointer}.om30-cancel-ficha-acoes .danger{background:#b91c1c;border-color:#b91c1c;color:#fff}.om30-cancel-ficha-acoes .primary{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
      `;
      document.head.appendChild(st);
    }

    function abrir280() {
      return new Promise(resolve => {
        document.querySelector('.om30-cancel-ficha-overlay')?.remove();
        const overlay = document.createElement('div'); overlay.className='om30-cancel-ficha-overlay';
        const modal = document.createElement('div'); modal.className='om30-cancel-ficha-modal';
        overlay.appendChild(modal); document.body.appendChild(overlay);
        let motivo='', reavaliar=false, justificativaReavaliacao='';

        const etapaMotivo = () => {
          modal.innerHTML='<h3>Cancelar todas as medicações pendentes</h3><div class="om30-cancel-ficha-sub">Selecione uma justificativa. Itens já aplicados ou cancelados não serão alterados.</div>';
          const grupo=document.createElement('div'); grupo.className='om30-cancel-ficha-grid';
          const ta=document.createElement('textarea'); ta.className='om30-cancel-ficha-texto'; ta.placeholder='Justificativa do cancelamento'; ta.value=motivo; ta.oninput=()=>motivo=ta.value.trim();
          for(const texto of MOTIVOS){
            const b=document.createElement('button'); b.type='button'; b.className='om30-cancel-ficha-motivo'; b.textContent=texto;
            b.onclick=()=>{ if(texto==='Outro'){motivo='';ta.value='';ta.focus();}else{motivo=texto;ta.value=texto;} grupo.querySelectorAll('button').forEach(x=>x.dataset.on=x===b?'1':'0'); };
            grupo.appendChild(b);
          }
          modal.append(grupo,ta);
          const linha=document.createElement('label'); linha.style.cssText='display:flex;align-items:center;gap:6px;margin:8px 0 4px;padding:6px 7px;border:1px solid #dbe2ea;border-radius:6px;background:#f8fafc;font-size:11px;font-weight:800;cursor:pointer';
          const chk=document.createElement('input'); chk.type='checkbox'; chk.checked=reavaliar;
          const sp=document.createElement('span'); sp.textContent='Encaminhar paciente para reavaliação médica'; linha.append(chk,sp); modal.appendChild(linha);
          const tr=document.createElement('textarea'); tr.className='om30-cancel-ficha-texto'; tr.placeholder='Justificativa para encaminhar ao médico'; tr.value=justificativaReavaliacao; tr.style.display=reavaliar?'block':'none'; tr.oninput=()=>justificativaReavaliacao=tr.value.trim(); chk.onchange=()=>{reavaliar=chk.checked;tr.style.display=reavaliar?'block':'none';}; modal.appendChild(tr);
          const a=document.createElement('div'); a.className='om30-cancel-ficha-acoes';
          const sair=document.createElement('button'); sair.textContent='Sair'; sair.onclick=()=>{overlay.remove();resolve(null)};
          const cont=document.createElement('button'); cont.className='primary'; cont.textContent='Continuar'; cont.onclick=()=>{motivo=ta.value.trim()||motivo;justificativaReavaliacao=tr.value.trim();if(!motivo){ta.focus();return}if(reavaliar&&!justificativaReavaliacao){tr.style.display='block';tr.focus();return}etapaConfirmar();};
          a.append(sair,cont); modal.appendChild(a);
        };

        const etapaConfirmar=()=>{
          const rr=reavaliar?`<br>Reavaliação médica: <b>SIM</b><br>Justificativa: <b>${esc280(justificativaReavaliacao)}</b>`:'<br>Reavaliação médica: <b>NÃO</b>';
          modal.innerHTML=`<h3>Atenção</h3><div style="font-size:14px;font-weight:800;margin:10px 0">Deseja confirmar o cancelamento de todas as medicações desse paciente?</div><div class="om30-cancel-ficha-sub">Somente as medicações pendentes serão canceladas.<br>Motivo: <b>${esc280(motivo)}</b>${rr}</div>`;
          const a=document.createElement('div');a.className='om30-cancel-ficha-acoes';const voltar=document.createElement('button');voltar.textContent='Voltar';voltar.onclick=etapaMotivo;const ok=document.createElement('button');ok.className='danger';ok.textContent='Sim, cancelar todos';ok.onclick=()=>{overlay.remove();resolve({motivo,reavaliar,justificativaReavaliacao})};a.append(voltar,ok);modal.appendChild(a);
        };
        overlay.onclick=e=>{if(e.target===overlay){overlay.remove();resolve(null)}}; etapaMotivo();
      });
    }

    async function executar280(cmd) {
      const botoes = await esperar280(() => {
        const ls=[...document.querySelectorAll('.btn-atendimento-prescricao-interna-cancelada')].filter(visivel280);
        return ls.length?ls:null;
      },15000);
      let cancelados=0;
      for(const botao of botoes){
        if(!botao.isConnected||!visivel280(botao))continue;
        const item=itemBotao280(botao); if(cancelado280(item))continue;
        botao.click();
        const modal=await esperar280(()=>modalTitulo280('Motivo do Cancelamento'));
        const ta=modal.querySelector('.swal2-textarea'), salvar=modal.querySelector('.swal2-confirm');
        if(!ta||!salvar)throw new Error('MODAL_MOTIVO_INCOMPLETO');
        preencherTextarea280(ta,cmd.motivo); salvar.click();
        await esperar280(()=>!modal.isConnected||!visivel280(modal),8000).catch(()=>true);
        await esperar280(()=>cancelado280(item),5000,60); cancelados++; await sleep280(60);
      }
      if(!cancelados)throw new Error('NENHUM_ITEM_CANCELAVEL');
      const form=document.querySelector('form.encaminhamento_medicacao,form[id^="edit_encaminhamento_medicacao_"]');
      if(form) await esperar280(()=>{const itens=[...form.querySelectorAll('.item-encaminhamento-controle-salas')];return itens.length&&itens.every(temAcao280)},5000,60);
      const reav=document.querySelector('#encaminhamento_medicacao_encaminhar_paciente_para_reavaliacao_medica,input[name="encaminhamento_medicacao[encaminhar_paciente_para_reavaliacao_medica]"][type="checkbox"]');
      const just=document.querySelector('#encaminhamento_medicacao_justificativa_encaminhamento,textarea[name="encaminhamento_medicacao[justificativa_encaminhamento]"],input[name="encaminhamento_medicacao[justificativa_encaminhamento]"]');
      if(reav){reav.checked=!!cmd.reavaliar;reav.dispatchEvent(new Event('input',{bubbles:true}));reav.dispatchEvent(new Event('change',{bubbles:true}));}
      if(just){just.value=cmd.reavaliar?cmd.justificativaReavaliacao:'';just.dispatchEvent(new Event('input',{bubbles:true}));just.dispatchEvent(new Event('change',{bubbles:true}));}
      const salvarFicha=await esperar280(()=>{const e=document.querySelector('.salvar-encaminhamento-controle-salas');return visivel280(e)?e:null});
      salvarFicha.click();
      const at=await esperar280(()=>modalTitulo280('Atenção'));
      const ok=at.querySelector('.swal2-confirm'); if(!ok)throw new Error('BOTAO_CONFIRMAR_NAO_ENCONTRADO'); ok.click();
      // Mantém o popup final aberto para o módulo de Próximo Destino decorá-lo.
      await esperar280(()=>modalTitulo280('Sucesso','Encaminhamento concluído'),20000);
    }

    async function iniciar280(){
      const escolha=await abrir280(); if(!escolha)return;
      const btn=document.querySelector('.om30-cancel-ficha-btn'); if(btn){btn.disabled=true;btn.textContent='Cancelando…';}
      try{await executar280(escolha);}catch(e){console.error('[OM30][CANCELAR TODOS]',e);alert('Falha ao cancelar todas as medicações. Confira a ficha antes de tentar novamente.');}
      finally{if(btn?.isConnected){btn.disabled=false;btn.textContent='Cancelar todos';}}
    }

    function instalar280(){
      om30RemoverUiFichaAntiga(); css280();
      const salvar=document.querySelector('.salvar-encaminhamento-controle-salas');
      const form=salvar?.closest('form')||document.querySelector('form.encaminhamento_medicacao,form[id^="edit_encaminhamento_medicacao_"]');
      if(!form)return;
      let topo=form.querySelector(':scope > .om30-cancel-ficha-topo');
      if(!topo){topo=document.createElement('div');topo.className='om30-cancel-ficha-topo';form.prepend(topo);}
      let btn=topo.querySelector('.om30-cancel-ficha-btn');
      if(!btn){btn=document.createElement('button');btn.type='button';btn.className='btn om30-cancel-ficha-btn';btn.textContent='Cancelar todos';btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();iniciar280()});topo.appendChild(btn);}
    }

    if(document.body){instalar280();new MutationObserver(instalar280).observe(document.body,{childList:true,subtree:true});}
    else document.addEventListener('DOMContentLoaded',()=>{instalar280();new MutationObserver(instalar280).observe(document.body,{childList:true,subtree:true});},{once:true});
  })();


  // ============================================================
  // MOTIVOS RÁPIDOS NO CANCELAR — lógica da v2.0.80
  // ============================================================
  (function OM30MotivosRapidos280() {
    'use strict';
    if (window.__OM30_MOTIVOS_RAPIDOS_280__) return;
    window.__OM30_MOTIVOS_RAPIDOS_280__ = true;

    const BOX_ID='om30-motivos-cancelamento';
    const MOTIVOS_POR_SETOR={
      medicacao:[
        'Paciente recusou a medicação.',
        'Paciente não compareceu à sala de medicação após ser chamado.',
        'Medicação em falta na unidade no momento.',
        'Medicação já administrada anteriormente.',
        'Prescrição suspensa/alterada pelo médico.',
        'Difícil acesso venoso.',
        'Outro'
      ],
      exames:['Exame realizado manualmente.','Paciente deixou a unidade antes da realização do exame.','Paciente recusou a realização do exame.','Outro'],
      raio_x:['Raio-X realizado manualmente.','Paciente deixou a unidade antes da realização do Raio-X.','Paciente recusou a realização do Raio-X.','Outro'],
      enfermagem:['Procedimento realizado manualmente.','Paciente deixou a unidade antes da realização do procedimento.','Paciente recusou a realização do procedimento.','Outro']
    };
    function setorAtual(){
      const p=location.pathname;
      if(/^\/encaminhamentos_exames\//.test(p))return 'exames';
      if(/^\/encaminhamentos_radiografias\//.test(p))return 'raio_x';
      if(/^\/encaminhamentos_procedimentos_enfermagem\//.test(p))return 'enfermagem';
      return 'medicacao';
    }
    function preencher(ta,valor){
      const desc=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
      if(desc?.set)desc.set.call(ta,valor);else ta.value=valor;
      ta.dispatchEvent(new Event('input',{bubbles:true}));ta.dispatchEvent(new Event('change',{bubbles:true}));ta.focus();
    }
    function criarBotao(texto,ta,outro=false){
      const b=document.createElement('button');b.type='button';b.textContent=texto;
      Object.assign(b.style,{display:'block',width:'100%',padding:'7px 10px',marginBottom:'5px',border:'1px solid #d4dbe2',borderRadius:'6px',background:'#fff',color:'#334155',cursor:'pointer',textAlign:'left',fontSize:'12px',fontWeight:'700'});
      b.onmouseenter=()=>b.style.background='#f8fafc'; b.onmouseleave=()=>b.style.background='#fff';
      b.onclick=e=>{e.preventDefault();e.stopPropagation();if(outro||/^Outro$/i.test(texto)){preencher(ta,'');}else preencher(ta,texto);};
      return b;
    }
    function limparBlocos(){document.querySelectorAll(`#${BOX_ID}`).forEach(x=>x.remove());}
    function instalar(){
      const modais=[...document.querySelectorAll('.swal2-popup.swal2-show,.swal2-modal.swal2-show')];
      const modal=modais.find(m=>/Motivo do Cancelamento/i.test(String(m.querySelector('.swal2-title')?.textContent||'')));
      if(!modal){limparBlocos();return;}
      const ta=modal.querySelector('textarea.swal2-textarea,.swal2-textarea');
      if(!ta||modal.querySelector(`#${BOX_ID}`))return;
      const box=document.createElement('div');box.id=BOX_ID;
      box.style.cssText='margin:4px 0 8px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;text-align:left';
      const tit=document.createElement('div');tit.textContent='Motivos rápidos';tit.style.cssText='font-size:11px;font-weight:900;color:#475569;margin:0 0 6px';box.appendChild(tit);
      for(const motivo of MOTIVOS_POR_SETOR[setorAtual()]||MOTIVOS_POR_SETOR.medicacao)box.appendChild(criarBotao(motivo,ta,/^Outro$/i.test(motivo)));
      ta.parentNode.insertBefore(box,ta);
    }
    const ligar=()=>{
      instalar();
      new MutationObserver(instalar).observe(document.body,{childList:true,subtree:true});
      document.addEventListener('click',e=>{
        if(e.target.closest('.btn-atendimento-prescricao-interna-cancelada,.btn-cancelar-exame,.btn-cancelar-radiografia,.btn-cancelar-procedimento-enfermagem')){
          setTimeout(instalar,40);setTimeout(instalar,120);setTimeout(instalar,260);
        }
        if(e.target.closest('.swal2-confirm,.swal2-cancel'))setTimeout(limparBlocos,0);
      },true);
    };
    if(document.body)ligar();else document.addEventListener('DOMContentLoaded',ligar,{once:true});
  })();


    // ── Próximo destino no popup nativo de Sucesso ──────────────────────────
    // Aprende SOMENTE da resposta do backend após salvar/concluir. Não usa a lista de
    // pendências para adivinhar a ordem. O popup continua sendo o nativo do Saúde Simples.
    const CS_DESTINO_KEY='cs-destino-confirmado-pos-salvar-v3';
    function csDestinoNome(bruto){
        const v=String(bruto||'').trim().toLowerCase().replace(/^\/+|\/+$/g,'');
        if(!v)return '';
        if(v==='atendimento'||v.includes('consultorio')||v.includes('consultório'))return 'Retorno ao consultório médico';
        if(v.includes('aplicacoes_medicamentos')||v.includes('medicacao')||v.includes('medicação'))return 'Medicação';
        if(v.includes('encaminhamentos_exames')||v==='exames'||v==='exame')return 'Exames';
        if(v.includes('encaminhamentos_radiografias')||v.includes('raio_x')||v.includes('raio-x')||v.includes('radiografia'))return 'Raio-X';
        if(v.includes('encaminhamentos_procedimentos_enfermagem')||v.includes('procedimento_enfermagem')||v.includes('enfermagem'))return 'Procedimentos de Enfermagem';
        return '';
    }
    function csAprenderDestino(texto){
        const t=String(texto||''); if(!t||!/encaminharSenhaControleSalas|redirecionarControleSalasSemSenha/.test(t))return;
        try{window.OM30FluxoControleSalas?.aprenderResposta?.(location.href,t);}catch(_){}
        const chamadas=[...t.matchAll(/(?:redirecionarControleSalasSemSenha|encaminharSenhaControleSalas)\(\s*["']([^"']*)["']\s*,\s*["']([^"']+)["']/g)];
        if(!chamadas.length)return;
        const escolhida=chamadas.find(m=>String(m[2]).toLowerCase()==='atendimento')||chamadas[0];
        const nome=csDestinoNome(escolhida?.[2]); if(!nome)return;
        try{sessionStorage.setItem(CS_DESTINO_KEY,JSON.stringify({nome,em:Date.now()}));}catch(_){}
        csDecorarSucesso();
    }
    function csDestinoAtual(){
        try{
            const g=window.__OM30_ULTIMO_DESTINO_CONTROLE_SALAS__;
            if(g && Date.now()-new Date(g.em||0).getTime()<120000 && (g.nome||g.semRetorno)) {
                return {nome:g.nome||'',semRetorno:!!g.semRetorno,em:Date.now(),fonte:'handoff'};
            }
            const d=JSON.parse(sessionStorage.getItem(CS_DESTINO_KEY)||'null');
            return d&&d.nome&&Date.now()-Number(d.em||0)<120000?{...d,fonte:'resposta'}:null;
        }catch(_){return null;}
    }

    const csSleep = ms => new Promise(r => setTimeout(r, ms));

    function csNomePorKey(key){
        const mapa={
            medicacao:'Medicação',
            exames:'Exames',
            radiografia:'Raio-X',
            raio_x:'Raio-X',
            enfermagem:'Procedimentos de Enfermagem',
            gesso:'Gesso / Imobilização',
            repouso:'Repouso',
            atendimento:'Retorno ao consultório médico'
        };
        return mapa[String(key||'')]||csDestinoNome(key)||'';
    }

    async function csResolverDestinoConfirmado(){
        // 1) Resposta/handoff explícito tem prioridade absoluta.
        const direto=csDestinoAtual();
        if(direto) return direto;

        // 2) Atualiza o painel SEM apagar/recriar o que já está visível.
        try{
            await window.OM30PendenciasControleSalas?.atualizar?.({silencioso:true});
        }catch(_){}

        // 3) Consulta o fluxo real do atendimento (ponte central + handoff nativo).
        let fluxo=null;
        try{
            const api=window.OM30FluxoControleSalas;
            const id=api?.atendimentoDaPagina?.()||'';
            fluxo=await api?.obter?.(id);
        }catch(_){}

        const salaAtual = window.OM30PendenciasControleSalas?.estado?.salaAtual || '';
        const ordem = Array.isArray(fluxo?.ordem) ? [...fluxo.ordem].sort((a,b)=>Number(a.posicao)-Number(b.posicao)) : [];
        const posAtual = ordem.find(x=>String(x.sala)===String(salaAtual))?.posicao;
        if(Number.isFinite(Number(posAtual))){
            const prox=ordem.find(x=>Number(x.posicao)>Number(posAtual));
            if(prox?.sala) return {nome:csNomePorKey(prox.sala),semRetorno:false,key:String(prox.sala),fonte:'ponte_central'};
            if(typeof fluxo?.retorno_medico==='boolean') return fluxo.retorno_medico
                ? {nome:'Retorno ao consultório médico',semRetorno:false,key:'atendimento',fonte:'ponte_central'}
                : {nome:'Sem retorno ao consultório médico',semRetorno:true,key:'',fonte:'ponte_central'};
        }

        const h=fluxo?.handoffPosSalvar;
        if(h?.destino){
            return {
                nome:csNomePorKey(h.destino),
                semRetorno:false,
                key:String(h.destino),
                fonte:'handoff_backend'
            };
        }

        // 5) Estado calculado pelas Pendências: ordem confirmada/transição/status.
        const e=window.OM30PendenciasControleSalas?.estado||window.__OM30_ESTADO_PENDENCIAS__||null;
        if(e?.proximo?.key){
            return {
                nome:csNomePorKey(e.proximo.key),
                semRetorno:false,
                key:String(e.proximo.key),
                fonte:String(e.proximo.fonte||'pendencias')
            };
        }

        if(e?.retornoConfirmadoAgora || e?.retornoConhecido===true || fluxo?.retornoConfirmado===true){
            return {
                nome:'Retorno ao consultório médico',
                semRetorno:false,
                key:'atendimento',
                fonte:'retorno_confirmado'
            };
        }

        if((e?.retornoConhecido===false || fluxo?.retornoConfirmado===false) && !(e?.pendencias||[]).length){
            return {
                nome:'Sem retorno ao consultório médico',
                semRetorno:true,
                key:'',
                fonte:'sem_retorno_confirmado'
            };
        }

        // 6) Se existe exatamente uma sala "Em Espera", o próprio backend já a
        // marcou como próxima; não é inferência de ordem.
        const espera=(e?.pendencias||[]).filter(p=>String(p?.status||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase()==='EM ESPERA');
        if(espera.length===1){
            return {
                nome:espera[0].salaNome||csNomePorKey(espera[0].sala),
                semRetorno:false,
                key:String(espera[0].sala||''),
                fonte:'status_em_espera'
            };
        }

        return null;
    }

    function csPrepararPopup(modal){
        const tituloEl=modal.querySelector('.swal2-title');
        if(tituloEl) tituloEl.textContent='Encaminhamento concluído';

        const conteudo=modal.querySelector('.swal2-content,.swal2-html-container,#swal2-content');
        if(conteudo) conteudo.innerHTML='<div class="cs-destino-msg">Atendimento desta sala concluído com sucesso.</div>';

        modal.querySelectorAll('#om30-destino-pos-salvar').forEach(x=>x.remove());
        const extras=[...modal.querySelectorAll('.cs-destino-sucesso')];
        extras.slice(1).forEach(x=>x.remove());

        let box=modal.querySelector('.cs-destino-sucesso');
        if(!box){
            box=document.createElement('div');
            box.className='cs-destino-sucesso';
            const actions=modal.querySelector('.swal2-actions');
            if(actions) modal.insertBefore(box,actions); else modal.appendChild(box);
        }
        box.innerHTML='<div class="cs-destino-label">PRÓXIMO DESTINO</div><div class="cs-destino-valor">Identificando…</div>';
        return box;
    }

    async function csDecorarSucesso(){
        for(const modal of document.querySelectorAll('.swal2-popup.swal2-show,.swal2-modal.swal2-show')){
            const titulo=String(modal.querySelector('.swal2-title')?.textContent||'').trim();
            const corpo=String(modal.textContent||'');
            // Só o sucesso de SALVAR/CONCLUIR a ficha entra aqui.
            if(!/Sucesso|Encaminhamento concluído/i.test(titulo)) continue;
            if(!/Encaminhamento atualizado com sucesso|Atendimento desta sala concluído com sucesso|encaminhamento.*sucesso/i.test(corpo)) continue;
            if(modal.dataset.om30DestinoProcessando==='1'||modal.dataset.om30DestinoResolvido==='1') continue;

            modal.dataset.om30DestinoProcessando='1';
            try{sessionStorage.setItem('cs-sair-pos-salvar',String(Date.now()));}catch(e){}
            const box=csPrepararPopup(modal);

            let destino=null;
            // Backend/fila podem levar alguns instantes para refletir a transição.
            const inicioDestino=Date.now();
            for(let tentativa=0; tentativa<18 && modal.isConnected; tentativa++){
                destino=await csResolverDestinoConfirmado();
                if(destino?.nome) break;
                if(PULAR_POPUP_CONCLUSAO && Date.now()-inicioDestino>=1500) break;
                await csSleep(tentativa<6?180:320);
            }

            if(!modal.isConnected) continue;

            if(destino?.semRetorno){
                box.innerHTML='<div class="cs-destino-label">RETORNO MÉDICO</div><div class="cs-destino-valor">SEM RETORNO AO CONSULTÓRIO MÉDICO</div>';
            }else if(destino?.nome){
                const retorno=/^Retorno ao consultório médico$/i.test(destino.nome);
                box.innerHTML=`<div class="cs-destino-label">${retorno?'PRÓXIMO DESTINO':'PRÓXIMA SALA'}</div><div class="cs-destino-valor">${retorno?'↩':'→'} ${esc(destino.nome).toUpperCase()}</div>`;
            }else{
                // Sem destino confirmado, não inventa "retorno a confirmar".
                // O popup nativo de sucesso permanece suficiente; a próxima sala
                // será mostrada quando a resposta/fila do Saúde Simples confirmar.
                box.remove();
            }

            modal.dataset.om30DestinoProcessando='0';
            modal.dataset.om30DestinoResolvido='1';

            if(PULAR_POPUP_CONCLUSAO){
                // Guarda o destino para o aviso da próxima página e clica no OK do próprio
                // popup: o .then() do sistema segue sozinho (concluir a senha e navegar).
                let texto='Atendimento concluído';
                if(destino?.semRetorno) texto+=' · Sem retorno ao consultório médico';
                else if(destino?.nome) texto+=/^Retorno ao consultório médico$/i.test(destino.nome)?' · ↩ Retorno ao consultório médico':` · → PRÓXIMA SALA: ${destino.nome}`;
                try{sessionStorage.setItem('cs-aviso-pos-conclusao',JSON.stringify({texto,em:Date.now()}));}catch(e){}
                modal.querySelector('.swal2-confirm')?.click();
                // Se o OK não trocar de página, o aviso aparece aqui mesmo.
                setTimeout(csMostrarAvisoPosConclusao,1500);
            }
        }
    }
    // Aviso pós-conclusão (PULAR_POPUP_CONCLUSAO): toast não bloqueante no topo, 6 s.
    estilo(`
        .cs-toast-conclusao{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483000;max-width:min(520px,92vw);box-sizing:border-box;padding:10px 14px;border:1px solid #d8dee5;border-left:4px solid #7D09D5;border-radius:8px;background:#f0fdf4;color:#263238;font:700 13px/1.3 system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.18);cursor:pointer}
    `);
    function csMostrarAvisoPosConclusao(){
        let dado=null;
        try{
            const bruto=sessionStorage.getItem('cs-aviso-pos-conclusao');
            if(!bruto) return;
            sessionStorage.removeItem('cs-aviso-pos-conclusao');
            dado=JSON.parse(bruto);
        }catch(e){return;}
        if(!dado?.texto||!(Date.now()-Number(dado.em)<30000)) return;
        const el=document.createElement('div');
        el.className='cs-toast-conclusao';
        el.textContent=String(dado.texto);
        el.addEventListener('click',()=>el.remove());
        document.body.appendChild(el);
        setTimeout(()=>el.remove(),6000);
    }
    // Tela de consulta logo depois de salvar (SAIR_DIRETO_APOS_SALVAR): a marca vale 2 min e
    // é apagada em qualquer página carregada, para não pular uma consulta aberta depois.
    function csMarcaSairPosSalvar(){
        let em=0;
        try{em=Number(sessionStorage.getItem('cs-sair-pos-salvar'))||0;sessionStorage.removeItem('cs-sair-pos-salvar');}catch(e){}
        return em&&Date.now()-em<120000;
    }
    function csSairDaConsultaPosSalvar(){
        if(!document.querySelector('.imprimir-documentos-controle-salas')) return false;
        // O "Sair" do formulário, não o do topo (/usuarios/sair desloga).
        const sair=Array.from(document.querySelectorAll('fieldset.buttons a[href]'))
            .find(a=>/^\s*sair\s*$/i.test(a.textContent)&&!/\/usuarios\/sair/i.test(a.getAttribute('href')||''));
        if(!sair) return false;
        location.replace(sair.href);
        return true;
    }
    const csSairAgora=SAIR_DIRETO_APOS_SALVAR&&csMarcaSairPosSalvar();
    if(csSairAgora){
        // Esconde a página enquanto decide, para a consulta não piscar na tela.
        const oculta=document.createElement('style');
        oculta.id='cs-oculta-consulta';
        oculta.textContent='html{visibility:hidden !important}';
        const por=()=>{const alvo=document.head||document.documentElement;if(alvo)alvo.appendChild(oculta);return !!alvo;};
        if(!por()){const mo=new MutationObserver(()=>{if(por())mo.disconnect();});mo.observe(document,{childList:true,subtree:true});}
        setTimeout(()=>oculta.remove(),4000);
    }
    function csAoCarregarPagina(){
        if(csSairAgora&&csSairDaConsultaPosSalvar()) return;
        document.getElementById('cs-oculta-consulta')?.remove();
        if(PULAR_POPUP_CONCLUSAO) csMostrarAvisoPosConclusao();
    }
    if(document.readyState!=='loading')csAoCarregarPagina();else document.addEventListener('DOMContentLoaded',csAoCarregarPagina,{once:true});
    estilo(`
        .cs-destino-sucesso{margin:11px auto 12px;padding:10px 12px;width:min(330px,88%);box-sizing:border-box;border:1px solid #d8dee5;border-left:4px solid #7D09D5;border-radius:8px;background:#fafafa;color:#263238;text-align:left}
        .cs-destino-label{font-size:10.5px;letter-spacing:.7px;font-weight:900;line-height:1.15;color:#6b7280}
        .cs-destino-msg{font-size:12px;color:#475569;line-height:1.35}
        .cs-destino-valor{margin-top:4px;font-size:14px;line-height:1.2;font-weight:900;color:#4c1d95}
        .cs-destino-ajuda{margin-top:4px;font-size:10.5px;line-height:1.25;font-weight:700;color:#7a8691}
    `);
    function csInstalarCapturaDestino(){
        // O módulo OM30FluxoControleSalas acima já captura fetch/XHR com a URL real.
        // Mantemos apenas a flag para não instalar um segundo wrapper concorrente.
        window.__CS_DESTINO_V3__=true;
    }

    const fichaOutraSala = /^\/encaminhamentos_(?:exames|radiografias|procedimentos_enfermagem)\/\d+\/edit$/.test(caminho);
    if (caminho === '/aplicacoes_medicamentos' || caminho === '/aplicacoes_medicamentos/new' || caminho === '/aplicacoes_medicamentos/create' || fichaOutraSala) travarTitulo();
    if (caminho === '/aplicacoes_medicamentos/new' || caminho === '/aplicacoes_medicamentos/create' || fichaOutraSala) {
        csInstalarCapturaDestino();
        // O popup pode ser criado DEPOIS da resposta Ajax. Por isso a decoração
        // precisa observar Medicação também, não só Exames/Raio-X/Enfermagem.
        const ligarDestino=()=>{
            csDecorarSucesso();
            if(!window.__CS_DESTINO_OBSERVER__ && document.body){
                window.__CS_DESTINO_OBSERVER__=new MutationObserver(csDecorarSucesso);
                window.__CS_DESTINO_OBSERVER__.observe(document.body,{childList:true,subtree:true});
            }
        };
        if(document.body)ligarDestino();else document.addEventListener('DOMContentLoaded',ligarDestino,{once:true});
    }

    // Situação do item na ficha de Exames/Raio-X/Enfermagem: o Realizar/Cancelar do sistema
    // só marca o campo escondido e o texto fica "PENDENTE" até salvar. Aqui o texto acompanha.
    if (fichaOutraSala) {
        const ehSim = el => !!el && /^(?:true|1)$/i.test(String(el.value || '').trim());
        function textoSituacao(item) {
            const li = [...item.querySelectorAll('li.text')].find(l => /^\s*Situa[cç][aã]o\s*$/i.test((l.querySelector('label') || {}).textContent || ''));
            if (!li) return null;
            let span = li.querySelector('.cs-sit');
            if (span) return span;
            const no = [...li.childNodes].find(n => n.nodeType === 3 && /^\s*PENDENTE\s*$/i.test(n.textContent));
            if (!no) return null;   // só mexe no que o sistema mostra como PENDENTE
            span = document.createElement('span');
            span.className = 'cs-sit';
            span.dataset.orig = no.textContent.trim();
            no.replaceWith(span);
            return span;
        }
        function atualizarSituacoes() {
            for (const item of document.querySelectorAll('.item-encaminhamento-controle-salas')) {
                const span = textoSituacao(item);
                if (!span) continue;
                const feito = ehSim(item.querySelector('input[id$="_realizado"]'));
                const cancel = ehSim(item.querySelector('input[id$="_cancelado"], input[id$="_cancelada"]'));
                const txt = feito ? 'REALIZADO' : cancel ? 'CANCELADO' : span.dataset.orig;
                const cor = feito ? '#15803d' : cancel ? '#b91c1c' : '';
                if (span.textContent !== txt) span.textContent = txt;
                if (span.style.color !== cor) { span.style.color = cor; span.style.fontWeight = cor ? '700' : ''; }
            }
        }
        const ligarSituacao = () => { atualizarSituacoes(); setInterval(atualizarSituacoes, 400); };
        if (document.body) ligarSituacao(); else document.addEventListener('DOMContentLoaded', ligarSituacao, { once: true });
    }

    // ============================================================
    // PROTEÇÃO DA FICHA - NÃO SALVAR COM MEDICAÇÕES SEM AÇÃO
    // Restaurado da lógica estável da v2.0.80 como módulo independente.
    // ============================================================
    (function instalarBloqueioSalvarComPendenciasV2080() {
        'use strict';

        if (location.hostname !== 'guaruja.saudesimples.net') return;
        if (!/^\/aplicacoes_medicamentos\/(?:new|create)\/?$/.test(location.pathname)) return;
        if (window.__OM30_BLOQUEIO_SALVAR_MEDICACAO_V2080__) return;
        window.__OM30_BLOQUEIO_SALVAR_MEDICACAO_V2080__ = true;

        const ID_AVISO='om30-aviso-salvar-pendencias';
        const ID_CSS='om30-aviso-salvar-pendencias-css';

        const limpar=valor=>String(valor??'').replace(/\s+/g,' ').trim();
        const ehTrue=valor=>/^(?:true|1)$/i.test(String(valor??'').trim());

        function instalarCss(){
            if(document.getElementById(ID_CSS))return;
            const st=document.createElement('style');
            st.id=ID_CSS;
            st.textContent=`
                .om30-pendente-salvar-destaque{outline:3px solid #dc2626!important;outline-offset:2px!important;border-radius:7px!important;background:#fff7f7!important}
                #${ID_AVISO}{position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Arial,sans-serif}
                #${ID_AVISO} .om30-box{width:min(500px,95vw);background:#fff;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.34);overflow:hidden}
                #${ID_AVISO} .om30-head{padding:13px 15px;background:#fff1f2;border-bottom:1px solid #fecaca;color:#991b1b}
                #${ID_AVISO} .om30-title{font-size:16px;line-height:1.2;font-weight:900}
                #${ID_AVISO} .om30-sub{margin-top:4px;font-size:12px;line-height:1.35;font-weight:700;color:#7f1d1d}
                #${ID_AVISO} .om30-body{padding:13px 15px;color:#334155;font-size:12px}
                #${ID_AVISO} .om30-contagem{padding:8px 10px;border:1px solid #e2e8f0;border-radius:7px;background:#f8fafc;font-weight:800;margin-bottom:9px}
                #${ID_AVISO} .om30-pend-title{font-weight:900;margin-bottom:5px;color:#991b1b}
                #${ID_AVISO} ul{margin:0;padding-left:19px;max-height:180px;overflow:auto}
                #${ID_AVISO} li{margin:4px 0;line-height:1.3;font-weight:700}
                #${ID_AVISO} .om30-foot{display:flex;justify-content:flex-end;padding:0 15px 14px}
                #${ID_AVISO} .om30-ok{border:0;border-radius:7px;background:#b91c1c;color:#fff;padding:8px 12px;font-size:12px;font-weight:900;cursor:pointer}
            `;
            (document.head||document.documentElement).appendChild(st);
        }

        function itensDoFormulario(form){
            return [...form.querySelectorAll('.item-encaminhamento-controle-salas')];
        }

        function itemEstaPendente(item){
            const paraAtendimento=item.querySelector('input[id$="_para_atendimento"],input[name$="[para_atendimento]"]');
            const paraCancelamento=item.querySelector('input[id$="_para_cancelamento"],input[name$="[para_cancelamento]"]');
            const cancelada=item.querySelector('input[id$="_cancelada"],input[name$="[cancelada]"]');

            const aplicada=ehTrue(paraAtendimento?.value);
            const canceladaSelecionada=ehTrue(paraCancelamento?.value)||ehTrue(cancelada?.value);
            return !aplicada&&!canceladaSelecionada;
        }

        function nomeMedicamento(item,indice){
            const texto=limpar(item?.innerText||item?.textContent||'');
            const m=texto.match(/\bProduto\s+(.+?)(?=\s+(?:Situa[cç][aã]o|Posologia|Via\s+de\s+Administra[cç][aã]o|Unidade\s+de\s+Medida|Observa[cç][aã]o|Aplicar|Cancelar)\b)/i);
            if(m?.[1])return limpar(m[1]);

            const candidato=[...item.querySelectorAll('strong,b,label,span,td')]
                .map(el=>limpar(el.textContent))
                .find(v=>v&&v.length>=3&&v.length<=140&&!/^(produto|situa[cç][aã]o|posologia|aplicar|cancelar)$/i.test(v));
            return candidato||`Medicação ${indice+1}`;
        }

        function analisar(form){
            const itens=itensDoFormulario(form);
            const pendentes=itens.filter(itemEstaPendente);
            return {
                total:itens.length,
                pendentes,
                resolvidos:Math.max(0,itens.length-pendentes.length)
            };
        }

        function destacarPendentes(pendentes){
            document.querySelectorAll('.om30-pendente-salvar-destaque').forEach(el=>el.classList.remove('om30-pendente-salvar-destaque'));
            for(const item of pendentes)item.classList.add('om30-pendente-salvar-destaque');
            if(pendentes[0]){
                try{pendentes[0].scrollIntoView({behavior:'smooth',block:'center'});}catch(_){}
            }
            setTimeout(()=>pendentes.forEach(item=>item.classList.remove('om30-pendente-salvar-destaque')),6500);
        }

        function abrirAviso(resumo){
            instalarCss();
            document.getElementById(ID_AVISO)?.remove();

            const overlay=document.createElement('div');
            overlay.id=ID_AVISO;
            overlay.innerHTML=`
                <div class="om30-box">
                    <div class="om30-head">
                        <div class="om30-title">⚠</div>
                        <div class="om30-sub">Antes de salvar, aplique ou cancele todas as medicações da ficha.</div>
                    </div>
                    <div class="om30-body">
                        <div class="om30-contagem">${resumo.total} medicação(ões) na ficha • ${resumo.resolvidos} resolvida(s) • ${resumo.pendentes.length} sem ação</div>
                        <div class="om30-pend-title">${resumo.pendentes.length===1?'Medicação que ainda precisa de ação:':'Medicações que ainda precisam de ação:'}</div>
                        <ul>${resumo.pendentes.map((item,i)=>`<li>${String(nomeMedicamento(item,i)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</li>`).join('')}</ul>
                    </div>
                    <div class="om30-foot"><button type="button" class="om30-ok">Voltar e finalizar as medicações</button></div>
                </div>
            `;

            const fechar=()=>{
                overlay.remove();
                destacarPendentes(resumo.pendentes);
            };
            overlay.querySelector('.om30-ok')?.addEventListener('click',fechar);
            overlay.addEventListener('click',e=>{if(e.target===overlay)fechar();});
            document.body.appendChild(overlay);
        }

        function bloquearSeNecessario(evento,form){
            if(!form)return false;
            const resumo=analisar(form);
            if(!resumo.pendentes.length)return false;

            evento?.preventDefault?.();
            evento?.stopPropagation?.();
            evento?.stopImmediatePropagation?.();
            abrirAviso(resumo);

            console.warn('[OM30][SALVAR BLOQUEADO] Existem medicações sem aplicar/cancelar.',{
                total:resumo.total,
                resolvidos:resumo.resolvidos,
                pendentes:resumo.pendentes.length,
                medicamentos:resumo.pendentes.map(nomeMedicamento)
            });
            return true;
        }

        // Captura antes dos handlers nativos do Saúde Simples.
        document.addEventListener('click',evento=>{
            const salvar=evento.target?.closest?.('.salvar-encaminhamento-controle-salas');
            if(!salvar)return;
            const form=salvar.closest('form')||document.querySelector('form.encaminhamento_medicacao,form[id^="edit_encaminhamento_medicacao_"]');
            bloquearSeNecessario(evento,form);
        },true);

        // Fallback para submit por Enter ou qualquer outro disparo do formulário.
        document.addEventListener('submit',evento=>{
            const form=evento.target;
            if(!(form instanceof HTMLFormElement))return;
            if(!form.querySelector('.salvar-encaminhamento-controle-salas'))return;
            bloquearSeNecessario(evento,form);
        },true);

        instalarCss();

        // Exposto apenas para diagnóstico manual, sem alterar estado.
        window.OM30BloqueioSalvarMedicacao={
            analisar:()=>{
                const form=document.querySelector('form.encaminhamento_medicacao,form[id^="edit_encaminhamento_medicacao_"]');
                if(!form)return {ok:false,motivo:'FORM_NAO_ENCONTRADO'};
                const r=analisar(form);
                return {
                    ok:true,total:r.total,resolvidos:r.resolvidos,pendentes:r.pendentes.length,
                    medicamentos:r.pendentes.map(nomeMedicamento)
                };
            }
        };
    })();

    if (caminho === '/aplicacoes_medicamentos') iniciarFila();
    else if (caminho === '/aplicacoes_medicamentos/new' || caminho === '/aplicacoes_medicamentos/create') iniciarAplicacao();
    else if (fichaOutraSala && /^cs-atendimento-/.test(window.name)) {
        // A identidade do AtendimentoPa permanece na sessionStorage da aba.
        // Não depende mais do seed de 60 s nem reutiliza a sala anterior.
        csRegistrarPresencaFilha({}).catch(e=>console.warn('[OM30 PRESENÇA] registro da sala não realizado:',e?.message||e));
        try {
            const seed=JSON.parse(localStorage.getItem('cs-presenca-seed')||'null');
            definirTitulo(seed?.nome?`${seed.nome} · Atendimento`:'Atendimento');
        } catch(_) { definirTitulo('Atendimento'); }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Tela "Controle de Salas" (lista)
    // ─────────────────────────────────────────────────────────────────────────────
    function iniciarFila() {
        // Ao abrir ou recarregar a página o período volta para "Hoje": 24 horas/Data...
        // valem só enquanto a página está aberta e não ficam presos neste PC.
        const cfgSalva = lerJSON(CHAVE_CONFIG, {});
        if (cfgSalva.periodo !== 'hoje' || cfgSalva.dataInicial || cfgSalva.dataFinal) {
            gravarJSON(CHAVE_CONFIG, Object.assign({}, cfgSalva, { periodo: 'hoje', dataInicial: '', dataFinal: '' }));
        }

        // Estado compartilhado entre os componentes remendados.
        const CS = {
            itens: new Map(),          // encaminhamento_id → item da última carga
            botoesAtender: new Set(),  // instâncias vivas de botao-iniciar-atendimento
            botoesChamar: new Set(),
            colecao: null,             // collection-with-search-atendimento do Controle de Salas
            carga: 0,                  // sequência para descartar respostas atrasadas
            ultimaAssinatura: '',
            ultimaAtualizacao: null,
            truncado: false,
            totalPeriodo: 0,
            erro: null,
            desvioRelogio: 0,          // ms (servidor − PC), só quando o relógio do PC está errado
        };
        window.__controleSalasFila = CS; // para depuração no console


        // ── Quem está atendendo (Cloudflare) — integrado ao ciclo da fila ───
        // Sem timer de polling próprio e sem MutationObserver: consulta apenas quando a
        // fila já seria atualizada. Fechar a aba NÃO exclui o registro.
        const PRES = {
            base:'https://om30-fluxo-controle-salas.om30-pedro.workers.dev',
            key:'om302026',
            cache:new Map(),
            misses:new Map(),
            atualizando:false,
            ultimaLeitura:0,
            ultimoErro:'',
            emAndamento:new Set(),
            retryMudancaTimer:null,
            forcarDepois:false,
        };
        function atendimentoPres(str) {
            const m=String(str||'').match(/^([A-Za-z0-9_]+)#(\d+)$/); if(!m||!/^Atendimento/i.test(m[1]))return null;
            const tipo=m[1],id=m[2]; let p=''; const t=tipo.toLowerCase();
            if(t==='atendimentopa')p='1'; else if(t==='atendimentoambulatorial')p='2'; else {let h=0;for(const ch of t)h=(h*31+ch.charCodeAt(0))%900000;p=String(100000+h);}
            return {tipo,id,bruto:`${tipo}#${id}`,chave:`${p}${id}`};
        }
        async function presReq(path,payload) {
            return csPresReq(path,payload,false);
        }
        async function atualizarPresencas(vm,lista,opcoes={}) {
            const setor=setorDaColecao(vm); if(!setor) return;

            // Detecta a mudança que realmente importa: paciente entrou em "Em Andamento".
            // A própria carga da fila chama esta função; portanto, quando o status muda,
            // fazemos um batch imediatamente sem esperar o watchdog.
            const atualEmAndamento=new Set(
                (lista||[])
                    .filter(it=>it?.status==='Em Andamento')
                    .map(it=>String(
                        it?.atendimento_str||
                        it?.atendimentoStr||
                        it?.atendimento||
                        it?.encaminhamento_id||
                        it?.senha||
                        ''
                    ))
                    .filter(Boolean)
            );
            const novosEmAndamento=[...atualEmAndamento].filter(k=>!PRES.emAndamento.has(k));
            PRES.emAndamento=atualEmAndamento;

            const forcarMudanca=novosEmAndamento.length>0;
            const forcar=Boolean(opcoes?.forcar||forcarMudanca);

            if(PRES.atualizando){
                if(forcar)PRES.forcarDepois=true;
                return;
            }

            // Sem ninguém em atendimento, não há motivo para fazer polling de presença.
            // Uma nova entrada será percebida pela próxima carga normal da fila.
            if(!atualEmAndamento.size&&!forcar){
                try{vm.$nextTick(pintarMedicacoes);}catch(_){}
                return;
            }

            // Watchdog: no máximo um batch normal a cada ~30 s por aba.
            // Mudança para Em Andamento e retry explícito ignoram este throttle.
            const agora=Date.now();
            if(!forcar&&PRES.ultimaLeitura&&agora-PRES.ultimaLeitura<28000){
                try{vm.$nextTick(pintarMedicacoes);}catch(_){}
                return;
            }

            if(forcarMudanca){
                // A ficha e a fila podem mudar quase ao mesmo tempo. Faz uma segunda
                // conferência única 6 s depois para cobrir a pequena corrida do upsert.
                clearTimeout(PRES.retryMudancaTimer);
                PRES.retryMudancaTimer=setTimeout(()=>{
                    if(document.visibilityState==='hidden')return;
                    const atual=Array.isArray(CS?.colecao?.items)&&CS.colecao.items.length
                        ? CS.colecao.items
                        : Array.from(CS?.itens?.values?.()||[]);
                    atualizarPresencas(vm,atual,{forcar:true,motivo:'retry-entrada-em-atendimento'}).catch(()=>{});
                },6000);
            }

            PRES.atualizando=true;

            try{
                // A presença não pode depender só de item.atendimento_str: em algumas
                // renderizações esse campo não vem serializado. Usa o mesmo resolvedor
                // robusto da alergia para chegar ao AtendimentoPa da própria linha.
                try{await new Promise(resolve=>vm.$nextTick(resolve));}catch(_){}
                const linhas=[...(vm.$el?.querySelectorAll?.('tbody > tr')||[])];
                const at=[];
                (lista||[]).forEach((it,i)=>{
                    if(it.status!=='Em Espera'&&it.status!=='Em Andamento'&&it.status!=='Em Outra Sala')return;
                    let a=atendimentoPres(it.atendimento_str||it.atendimentoStr||it.atendimento||'');
                    if(!a){
                        const pa=typeof atendimentoPa==='function' ? atendimentoPa(it,linhas[i]||null) : '';
                        if(pa)a=atendimentoPres(`AtendimentoPa#${pa}`);
                    }
                    if(a)at.push(a);
                });

                const unicos=[...new Map(at.map(x=>[x.bruto,x])).values()];
                if(!unicos.length){
                    // Não apaga o último cache por uma renderização intermediária vazia.
                    vm.$nextTick(pintarMedicacoes);
                    return;
                }

                const ativos=new Set(unicos.map(x=>x.bruto));
                const mapaChave=new Map();
                for(const a of unicos){
                    mapaChave.set(String(a.chave),a.bruto);
                    mapaChave.set(String(a.id),a.bruto);
                }

                const interpretar = res => {
                    const novo=new Map();
                    const arr=[];

                    // O Worker atual devolve:
                    // { ok:true, sala:'medicacao', items:{ '13079536':{ profissional:'...' } } }
                    // Versões anteriores também já devolveram arrays. Aceita os dois formatos.
                    for(const k of ['results','items','presencas','data','atendimentos']) {
                        const bloco=res?.[k];
                        if(Array.isArray(bloco)){
                            arr.push(...bloco);
                            continue;
                        }
                        if(bloco && typeof bloco==='object'){
                            for(const [chave,v] of Object.entries(bloco)){
                                if(!v||typeof v!=='object'||Array.isArray(v))continue;
                                arr.push({...v,atendimento_id:v.atendimento_id||chave});
                            }
                        }
                    }

                    if(Array.isArray(res))arr.push(...res);

                    // Compatibilidade com respostas antigas em que os atendimentos
                    // vinham diretamente no objeto raiz.
                    if(!arr.length && res && typeof res==='object'){
                        for(const [k,v] of Object.entries(res)){
                            if(['ok','sala'].includes(k)||!v||typeof v!=='object'||Array.isArray(v))continue;
                            arr.push({...v,atendimento_id:v.atendimento_id||k});
                        }
                    }

                    for(const item of arr){
                        if(item?.found===false)continue;
                        const chave=String(item?.atendimento_id||item?.id||item?.atendimento||'');
                        const original=mapaChave.get(chave);
                        const nome=String(item?.profissional||item?.display_name||item?.nome||'').trim();
                        if(original&&nome)novo.set(original,{
                            found:true,
                            profissional:nome,
                            abertoEm:item?.aberto_em||item?.abertoEm||'',
                            atualizadoEm:item?.atualizado_em||item?.atualizadoEm||'',
                            expiraEm:item?.expira_em||item?.expiraEm||'',
                            vistoEm:Date.now()
                        });
                    }
                    return novo;
                };

                // Uma única chamada batch resolve toda a fila. Não fazemos GET
                // individual por paciente: isso podia gerar dezenas de requisições
                // em cada ciclo e provocar 429 no Worker.
                const chavesBatch=[...new Set(unicos.flatMap(x=>[x.chave,x.id]).filter(Boolean))];
                const res=await presReq('/api/attendance/batch',{sala:setor.api,atendimentos:chavesBatch});
                const encontrados=interpretar(res);

                const mesclado=new Map();
                // Mantém o último nome válido enquanto o paciente continuar na fila.
                // Resultado parcial/vazio do batch não apaga presença conhecida.
                for(const [k,v] of PRES.cache){
                    if(ativos.has(k))mesclado.set(k,v);
                }
                for(const [k,v] of encontrados){
                    mesclado.set(k,v);
                    PRES.misses.delete(k);
                }

                PRES.cache=mesclado;
                PRES.ultimaLeitura=Date.now();
                PRES.ultimoErro='';
                vm.$nextTick(pintarMedicacoes);
            }catch(e){
                PRES.ultimoErro=String(e?.message||e);
                // Falha de rede/Worker NÃO apaga o último nome válido.
                console.warn('[Controle de Salas] presença Cloudflare temporariamente indisponível',PRES.ultimoErro);
                try{vm.$nextTick(pintarMedicacoes);}catch(_){}
            }finally{
                PRES.atualizando=false;
                if(PRES.forcarDepois){
                    PRES.forcarDepois=false;
                    setTimeout(()=>{
                        if(document.visibilityState==='hidden')return;
                        const atual=Array.isArray(CS?.colecao?.items)&&CS.colecao.items.length
                            ? CS.colecao.items
                            : Array.from(CS?.itens?.values?.()||[]);
                        atualizarPresencas(vm,atual,{forcar:true,motivo:'mudanca-durante-leitura'}).catch(()=>{});
                    },250);
                }
            }
        }
        window.OM30CloudflarePresenca = {
            versao: '3.0.40',
            atualizar: () => {
                if(!CS?.colecao)return Promise.resolve();
                const lista=Array.isArray(CS.colecao.items)&&CS.colecao.items.length
                    ? CS.colecao.items
                    : Array.from(CS.itens?.values?.()||[]);
                return atualizarPresencas(CS.colecao,lista);
            },
            cache: () => Array.from(PRES.cache.entries()),
            status: () => ({
                cache:Array.from(PRES.cache.entries()),
                misses:Array.from(PRES.misses.entries()),
                ultimaLeitura:PRES.ultimaLeitura,
                ultimoErro:PRES.ultimoErro,
                atualizando:PRES.atualizando,
                usoLocalCloudflare:(()=>{
                    try{return JSON.parse(localStorage.getItem(CS_REQ_DIA)||'null');}catch(_){return null;}
                })(),
                emAndamento:Array.from(PRES.emAndamento),
                watchdogMs:30000
            }),
            testar: async (atendimento, sala='medicacao') => {
                const a=atendimentoPres(String(atendimento||'').includes('#') ? atendimento : `AtendimentoPa#${String(atendimento||'').match(/\d+/)?.[0]||''}`);
                if(!a) throw new Error('AtendimentoPa inválido');
                const saida={atendimento:a.bruto||`AtendimentoPa#${a.id}`,sala,resultados:[]};
                for(const atendimento_id of [...new Set([a.chave,a.id].filter(Boolean))]){
                    try{saida.resultados.push({atendimento_id,resposta:await presReq('/api/attendance/get',{atendimento_id,sala})});}
                    catch(e){saida.resultados.push({atendimento_id,erro:String(e?.message||e)});}
                }
                return saida;
            }
        };

        if(!window.__OM30_PRESENCA_AUTOREFRESH__){
            window.__OM30_PRESENCA_AUTOREFRESH__=true;
            const atualizarPresencaVisivel=()=>{
                if(document.visibilityState==='hidden')return;
                const lista=Array.isArray(CS?.colecao?.items)&&CS.colecao.items.length
                    ? CS.colecao.items
                    : Array.from(CS?.itens?.values?.()||[]);
                if(!lista.some(it=>it?.status==='Em Andamento'))return;
                atualizarPresencas(CS.colecao,lista,{motivo:'watchdog'}).catch?.(()=>{});
            };
            // Watchdog apenas enquanto houver alguém em atendimento.
            window.__OM30_PRESENCA_TIMER__=setInterval(atualizarPresencaVisivel,30000);
            window.addEventListener('focus',atualizarPresencaVisivel,{passive:true});
            window.addEventListener('online',atualizarPresencaVisivel,{passive:true});
            document.addEventListener('visibilitychange',()=>{
                if(document.visibilityState==='visible')atualizarPresencaVisivel();
            },{passive:true});
        }

        function nomePresencaVisual(nome){
            let original=String(nome||'').replace(/\s+/g,' ').trim();
            if(!original)return '';

            const conectores=new Set(['da','das','de','do','dos','e']);
            if(original===original.toUpperCase()){
                original=original.toLocaleLowerCase('pt-BR').split(' ').map((p,i)=>{
                    if(i>0&&conectores.has(p))return p;
                    return p ? p.charAt(0).toLocaleUpperCase('pt-BR')+p.slice(1) : p;
                }).join(' ');
            }

            // Nome curto: preserva inteiro. Nome longo: Primeiro + iniciais + Último,
            // ex.: PEDRO JUSTINO SAMPAIO ANDRADE -> Pedro J. S. Andrade.
            if(original.length<=24)return original;

            const partes=original.split(' ').filter(Boolean);
            if(partes.length<2)return original;

            const primeiro=partes[0];
            const ultimo=partes[partes.length-1];
            const meios=partes.slice(1,-1)
                .filter(p=>!conectores.has(p.toLocaleLowerCase('pt-BR')))
                .map(p=>p.charAt(0).toLocaleUpperCase('pt-BR')+'.');

            const compacto=[primeiro,...meios,ultimo].join(' ');
            if(compacto.length<=26)return compacto;

            const curto=`${primeiro} ${ultimo}`;
            if(curto.length<=26)return curto;

            return `${primeiro.charAt(0).toLocaleUpperCase('pt-BR')}. ${ultimo}`;
        }

        function aplicarPresencaNaLinha(tr,it,setor,campos){
            let a=atendimentoPres(it.atendimento_str||it.atendimentoStr||it.atendimento||'');
            if(!a){
                const pa=typeof atendimentoPa==='function' ? atendimentoPa(it,tr) : '';
                if(pa)a=atendimentoPres(`AtendimentoPa#${pa}`);
            }
            const d=a&&PRES.cache.get(a.bruto);
            const idx=campos.findIndex(f=>f.key==='status'); const td=idx>=0?tr.children[idx]:null; if(!td)return;

            let box=td.querySelector(':scope > .cs-presenca');
            const subtitulo=td.querySelector(':scope > .om30-ficha-aberta .om30-atendimento-texto small');

            if(!d){
                if(box)box.remove();
                if(subtitulo&&it.status==='Em Andamento'&&subtitulo.textContent!=='ATENDIMENTO EM CURSO'){
                    subtitulo.textContent='ATENDIMENTO EM CURSO';
                }
                return;
            }

            // No status "Em Andamento", o nome vai direto no card azul.
            // Evita mostrar "ATENDIMENTO EM CURSO" e depois repetir "Por:" embaixo.
            if(it.status==='Em Andamento'&&subtitulo){
                const nomeVisual=nomePresencaVisual(d.profissional);
                if(nomeVisual){
                    subtitulo.innerHTML=`<span class="om30-por-label">Por</span> ${esc(nomeVisual)}`;
                    subtitulo.title=`Atendido por: ${String(d.profissional||'').trim()}`;
                }else{
                    subtitulo.textContent='ATENDIMENTO EM CURSO';
                    subtitulo.title='';
                }
                if(box)box.remove();
                return;
            }

            if(!box){box=document.createElement('div');box.className='cs-presenca';td.appendChild(box);}
            const html=`Por: ${esc(d.profissional)}`;
            if(box.__h!==html){box.innerHTML=html;box.__h=html;}
        }
        // ── Lista adiantada ───────────────────────────────────────────────────
        // A página só pede a lista depois de uma cadeia de etapas (sala, guichê,
        // senha), ~4 s depois de abrir, e o servidor leva ~2 s para responder. Assim
        // que o <controle-salas> chega no HTML, a lista é pedida com os mesmos
        // parâmetros que a primeira carga vai usar; quando a tabela pedir, a resposta
        // já está pronta. Se os parâmetros não forem idênticos, a carga busca do jeito
        // normal. Só vale para a sala de medicação, sem filtro de profissional salvo
        // e fora do histórico.
        const ADIANTADA = { paginas: new Map(), em: 0, VALIDADE_MS: 15e3, usada: false };

        function pedirPaginaFetch(url, params) {
            return fetch(`${url}${url.includes('?') ? '&' : '?'}${N.queryAxios(params)}`, {
                credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json, text/plain, */*' },
            }).then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const total = parseInt(r.headers.get('total'), 10);
                return r.json().then(d => ({ dados: Array.isArray(d) ? d : [], total }));
            });
        }

        function adiantarLista() {
            const url = '/aplicacoes_medicamentos?format=json';
            if (lerJSON(CHAVE_ULTIMA_LISTA, null) !== url) return;
            const cfg = lerConfig();
            if (cfg.mostrar === 'historico' || cfg.periodo === 'datas') return;
            const salvo = N.filtrosParaRestaurar(lerJSON(CHAVE_FILTROS, null), new Date());
            if (salvo && salvo.profissionalId != null) return; // precisaria do objeto do profissional
            const el = document.querySelector('controle-salas[ocupacoes-profissional-atual]');
            let ocupacoes;
            try { ocupacoes = JSON.parse(el.getAttribute('ocupacoes-profissional-atual')); } catch (e) { /* sem ocupações */ }
            const base = {
                search_term: null, profissional: {}, status: (salvo && salvo.status) || '', grau_risco: (salvo && salvo.grauRisco) || '',
                dataInicial: (salvo && salvo.dataInicial) || '', dataFinal: (salvo && salvo.dataFinal) || '',
            };
            if (ocupacoes !== undefined) base.ocupacoes_ids = ocupacoes;
            const { cond } = N.aplicarPeriodo(base, cfg.periodo, new Date());
            const params = pagina => Object.assign({ sortable: {}, page: pagina, per_page: POR_PAGINA }, cond);
            const guardar = (pagina, promessa) => {
                promessa.catch(() => {}); // sem uso, a falha não deve aparecer no console
                ADIANTADA.paginas.set(url + ' ' + N.chaveParams(params(pagina)), promessa);
            };
            ADIANTADA.em = Date.now();
            // Todas as páginas saem juntas, pelo total da última carga; se agora houver
            // mais, as que faltam saem quando a 1ª trouxer o total.
            const ultimo = +lerJSON(CHAVE_ULTIMO_TOTAL, 0) || 0;
            const previstas = Math.min(MAX_PAGINAS, Math.max(1, Math.ceil(ultimo / POR_PAGINA)));
            const p1 = pedirPaginaFetch(url, params(1));
            guardar(1, p1);
            for (let pg = 2; pg <= previstas; pg++) guardar(pg, pedirPaginaFetch(url, params(pg)));
            p1.then(r => {
                if (!Number.isFinite(r.total) || r.dados.length < POR_PAGINA) return;
                const n = Math.min(MAX_PAGINAS, Math.ceil(r.total / POR_PAGINA));
                for (let pg = previstas + 1; pg <= n; pg++) guardar(pg, pedirPaginaFetch(url, params(pg)));
            }, () => {});
        }

        // Página da lista: usa a adiantada se os parâmetros forem idênticos. Ela vale
        // para todos os pedidos iguais dentro da validade: no começo a página dispara
        // a carga duas vezes seguidas, e a segunda não pode refazer tudo.
        function pedirPagina(url, params) {
            const pronta = Date.now() - ADIANTADA.em < ADIANTADA.VALIDADE_MS && ADIANTADA.paginas.get(url + ' ' + N.chaveParams(params));
            if (pronta) {
                ADIANTADA.usada = true;
                return pronta.catch(() => pedirPaginaAxios(url, params));
            }
            if (ADIANTADA.paginas.size && Date.now() - ADIANTADA.em >= ADIANTADA.VALIDADE_MS) ADIANTADA.paginas.clear();
            return pedirPaginaAxios(url, params);
        }
        function pedirPaginaAxios(url, params) {
            return window.axios.get(url, { params }).then(resp => {
                // Relógio do servidor: com o PC adiantado/atrasado o "Hoje" pedia outro dia.
                const t = new Date(resp.headers && resp.headers.date).getTime();
                if (Number.isFinite(t)) {
                    const d = t - Date.now();
                    CS.desvioRelogio = Math.abs(d) > 120e3 ? d : 0;
                }
                return {
                    dados: Array.isArray(resp.data) ? resp.data : [],
                    total: parseInt(resp.headers && resp.headers.total, 10),
                };
            });
        }

        (function vigiarControleSalas() {
            const tentar = () => {
                if (!document.querySelector('controle-salas[ocupacoes-profissional-atual]')) return false;
                try { adiantarLista(); } catch (e) { console.warn('[Controle de Salas] lista adiantada', e); }
                return true;
            };
            if (tentar()) return;
            const obs = new MutationObserver(() => { if (tentar()) obs.disconnect(); });
            obs.observe(document, { childList: true, subtree: true });
            document.addEventListener('DOMContentLoaded', () => obs.disconnect());
        })();

        estilo(`
            .cs-barra { display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center; margin:6px 0 4px;
                padding:6px 10px; border:1px solid #d6dbe1; border-radius:6px; background:#f7f9fb; font-size:13px; }
            .cs-barra b { font-weight:600; }
            .cs-barra .cs-grupo { display:flex; gap:4px; align-items:center; }
            .cs-barra button { border:1px solid #b9c2cc; background:#fff; border-radius:4px; padding:2px 8px;
                font-size:12px; cursor:pointer; line-height:18px; }
            .cs-barra button.cs-ativo { background:#2b6cb0; border-color:#2b6cb0; color:#fff; }
            .cs-barra button[data-cs="periodo:limpar"]{color:#5f6b76;background:#f8fafc;border:1px solid #cfd7df}\n            .cs-barra button[data-cs="periodo:limpar"]:hover{background:#eef3f7;border-color:#b7c1cb;color:#36424e}
            .cs-barra .cs-resumo { display:flex; flex-wrap:wrap; align-items:stretch; gap:0; min-width:0; }
            .cs-barra .cs-media-cor {
                display:grid; grid-template-columns:8px auto auto; grid-template-rows:auto auto; align-items:center; column-gap:5px;
                min-width:88px; padding:1px 10px; border-left:1px solid #dbe1e7; color:#44515f; line-height:1.12; box-sizing:border-box;
            }
            .cs-barra .cs-media-cor:first-child { border-left:0; padding-left:2px; }
            .cs-barra .cs-media-dot { grid-row:1 / 3; width:7px; height:7px; border-radius:50%; align-self:center; }
            .cs-barra .cs-media-nome { font-size:9.5px; font-weight:800; letter-spacing:.02em; text-transform:uppercase; color:#5d6875; white-space:nowrap; }
            .cs-barra .cs-media-qtd { justify-self:end; font-size:12px; font-weight:900; color:#2f3740; line-height:1; }
            .cs-barra .cs-media-tempo { grid-column:2 / 4; margin-top:2px; font-size:9px; color:#7e8790; white-space:nowrap; }
            .cs-barra .cs-media-tempo strong { color:#4b5563; font-size:9.5px; font-weight:800; }
            .cs-barra .cs-em-atendimento-resumo { margin-left:8px; align-self:center; color:#1d4ed8; font-weight:700; }
            .cs-barra .cs-hora { color:#6b7785; margin-left:auto; }
            .cs-barra .cs-aviso { color:#a15c00; }
            .cs-barra .cs-erro { color:#b42318; }
            .cs-fila ul.pagination { display:none !important; }
            .cs-fila tr.cs-risco-vermelho > td:first-child { box-shadow: inset 6px 0 0 #d32f2f; }
            .cs-fila tr.cs-risco-laranja > td:first-child { box-shadow: inset 6px 0 0 #ef6c00; }
            .cs-fila tr.cs-risco-amarelo > td:first-child { box-shadow: inset 6px 0 0 #f9a825; }
            .cs-fila tr.cs-risco-verde > td:first-child { box-shadow: inset 6px 0 0 #2e7d32; }
            .cs-fila tr.cs-risco-azul > td:first-child { box-shadow: inset 6px 0 0 #1565c0; }
            .cs-fila tr.cs-risco-sem > td:first-child { box-shadow: inset 6px 0 0 #b0b7bf; }
            .cs-fila tr.cs-risco-vermelho > td { background-color: rgba(211,47,47,.055); }
            /* Atendimento em curso: MESMO desenho/lógica visual da v2.0.80.
               A faixa lateral continua sendo exclusivamente a classificação de risco. */
            .cs-fila tbody tr.om30-em-atendimento > td {
              background:#eff6ff !important;
              border-top:1px solid #bfdbfe !important;
              border-bottom:1px solid #bfdbfe !important;
            }
            .cs-fila tbody tr.om30-em-atendimento > td:last-child {
              box-shadow:inset -1px 0 0 #bfdbfe;
            }
            .cs-fila tbody td.om30-status-cell-atendimento {
              font-size:0 !important;
              color:transparent !important;
              vertical-align:middle !important;
              text-align:center !important;
            }
            /* A coluna Status volta a respeitar o layout nativo.
               O card é compacto e não força as demais colunas. */
            .cs-fila th.cs-col-status,
            .cs-fila td.cs-col-status {
              min-width:0 !important;
              width:auto !important;
              max-width:none !important;
              box-sizing:border-box !important;
            }
            .om30-ficha-aberta {
              position:relative;
              display:inline-flex;
              align-items:center;
              justify-content:center;
              width:128px;
              max-width:100%;
              box-sizing:border-box;
              margin:0 auto;
              padding:6px 16px;
              border:1px solid #1d4ed8;
              border-radius:8px;
              background:#2563eb;
              color:#fff !important;
              font-family:Arial,sans-serif !important;
              text-align:center;
              white-space:normal;
              box-shadow:0 1px 3px rgba(37,99,235,.22);
            }
            .om30-ficha-aberta::before { content:none; }
            .om30-ficha-aberta .om30-atendimento-ponto {
              position:absolute;
              left:7px;
              top:50%;
              transform:translateY(-50%);
              width:7px;
              height:7px;
              border-radius:50%;
              background:#fff;
              display:block;
              box-shadow:0 0 0 2px rgba(255,255,255,.20);
            }
            .om30-ficha-aberta .om30-atendimento-texto {
              display:block;
              width:100%;
              min-width:0;
              color:#fff !important;
              text-align:center !important;
            }
            .om30-ficha-aberta .om30-atendimento-texto strong {
              display:block;
              width:100%;
              color:#fff !important;
              font-size:8px !important;
              line-height:1.08;
              font-weight:900;
              text-transform:uppercase;
              letter-spacing:.035em;
              white-space:nowrap;
              text-align:center !important;
            }
            .om30-ficha-aberta .om30-atendimento-texto small {
              display:block;
              width:100%;
              overflow:visible;
              margin-top:3px;
              color:#eaf2ff !important;
              font-size:8.5px !important;
              line-height:1.12;
              font-weight:700;
              letter-spacing:0;
              text-transform:none !important;
              text-align:center !important;
              white-space:normal;
              word-break:normal;
              overflow-wrap:anywhere;
            }
            .om30-ficha-aberta .om30-por-label {
              color:#bfdbfe !important;
              font-weight:500;
              margin-right:2px;
            }
            .om30-status-cell-atendimento > .cs-presenca {
              margin-top:4px;
              color:#1e3a5f !important;
              font-size:10px !important;
              line-height:1.2;
              font-weight:700;
            }
            /* Chegada/espera: NÃO altera fonte nem tamanho nativos do Saúde Simples. */
            .cs-fila td.cs-chegada {
                line-height:1.25;
                font-variant-numeric:tabular-nums;
                text-align:center;
                color:inherit;
                font-family:inherit !important;
                font-size:inherit !important;
                font-weight:inherit;
                white-space:nowrap;
            }
            .cs-chegada-bloco {
                display:flex;
                flex-direction:column;
                align-items:center;
                line-height:1.15;
                font:inherit !important;
            }
            .cs-chegada-data {
                color:inherit;
                font:inherit !important;
                font-variant-numeric:tabular-nums;
                white-space:nowrap;
            }
            /* Primeira linha = relógio + Espera; segunda = tempo. Sem badge/barra e sem mudar a tipografia. */
            .cs-fila .cs-chegada-bloco > .om30-tempo-espera {
                display:flex !important;
                flex-direction:column !important;
                align-items:center !important;
                justify-content:center !important;
                width:auto !important;
                min-width:0 !important;
                height:auto !important;
                min-height:0 !important;
                margin:3px 0 0 !important;
                padding:0 !important;
                border:0 !important;
                border-radius:0 !important;
                outline:0 !important;
                background:none !important;
                background-color:transparent !important;
                box-shadow:none !important;
                color:inherit !important;
                font-family:inherit !important;
                font-size:inherit !important;
                line-height:1.15 !important;
                white-space:nowrap !important;
            }
            .cs-fila .om30-tempo-espera .om30-espera-topo {
                display:flex !important;
                align-items:center !important;
                justify-content:center !important;
                gap:3px !important;
                margin:0 !important;
                padding:0 !important;
                border:0 !important;
                background:none !important;
                box-shadow:none !important;
                font:inherit !important;
                line-height:1.05 !important;
            }
            .cs-fila .om30-tempo-espera .om30-espera-relogio {
                width:1em !important;
                height:1em !important;
                display:inline-flex !important;
                align-items:center !important;
                justify-content:center !important;
                color:inherit !important;
                flex:0 0 1em !important;
            }
            .cs-fila .om30-tempo-espera .om30-espera-relogio svg {
                width:1em !important;
                height:1em !important;
                display:block !important;
                fill:none !important;
                stroke:currentColor !important;
                stroke-width:1.8 !important;
                stroke-linecap:round !important;
                stroke-linejoin:round !important;
            }
            .cs-fila .om30-tempo-espera .om30-espera-label {
                font:inherit !important;
                font-weight:400 !important;
            }
            .cs-fila .om30-tempo-espera strong {
                display:block !important;
                margin:2px 0 0 !important;
                padding:0 !important;
                border:0 !important;
                background:none !important;
                box-shadow:none !important;
                color:inherit !important;
                font-family:inherit !important;
                font-size:inherit !important;
                line-height:1.05 !important;
                font-weight:700 !important;
            }

            .cs-fila td.cs-col-med { text-align:left; }
            .cs-fila.cs-com-med th, .cs-fila.cs-com-med td { min-width:0; }
            .cs-fila.cs-com-med td.cs-col-med { overflow-wrap:anywhere; }
            .cs-med-box { display:grid; gap:4px; }
            .cs-med {
                display:block;
                padding:4px 6px;
                border:1px solid #e1e6eb;
                border-radius:5px;
                background:#fbfcfd;
                font-size:12px;
                line-height:1.22;
                box-sizing:border-box;
            }
            .cs-med-prod { font-weight:600; }
            .cs-med-pos { color:#5b6672; }
            .cs-med + .cs-med { margin-top:0; }
            .cs-med-obs { color:#a15c00; font-size:11px; cursor:help; }
            .cs-med-nada { color:#8a94a0; font-size:12px; font-style:italic; }
            .cs-med-feito .cs-med-prod, .cs-med-cancelado .cs-med-prod { text-decoration:line-through; color:#7b8794; font-weight:400; }
            .cs-med-feito .cs-via, .cs-med-cancelado .cs-via { opacity:.45; }
            .cs-med-sit { font-size:11px; font-weight:700; padding:0 4px; border-radius:3px; }
            .cs-med-feito .cs-med-sit { color:#1f7a3f; background:#e5f4ea; }
            .cs-med-cancelado .cs-med-sit { color:#8a1f1f; background:#f8e6e6; }
            .cs-via { display:inline-block; min-width:26px; padding:0 5px; margin-right:5px; border-radius:9px; color:#fff;
                font-size:11px; font-weight:700; text-align:center; line-height:17px; }
            .cs-via-im { background:#6d3fb3; } .cs-via-iv { background:#1f5f9f; } .cs-via-sc { background:#0f766e; }
            .cs-via-oral { background:#24704a; min-width:auto; padding-left:7px; padding-right:7px; } .cs-via-inal { background:#8a4c17; } .cs-via-outra { background:#475569; }
            /* Coluna Ação com medicações: botões com rótulo em vez de ícones soltos. */
            .cs-fila.cs-com-med td.cs-col-senha { white-space:pre-line; }
            .cs-fila.cs-com-med td.cs-col-acoes {
                vertical-align:middle;
                padding-right:2px !important;
            }
            .cs-fila.cs-com-med td.cs-col-acoes > .row { display:flex !important; flex-direction:column !important; gap:2px; margin:0 !important; width:100% !important; }
            .cs-fila.cs-com-med td.cs-col-acoes > .row > * { width:100% !important; max-width:none !important; float:none !important; margin:0 !important; }
            .cs-fila.cs-com-med td.cs-col-acoes .botao-tempo-chegada { display:none !important; }
            /* ESCONDER_ATENDER: só o Chamar, ocupando a célula toda. */
            .cs-fila.cs-sem-atender td .botao-atender, .cs-fila.cs-com-med.cs-sem-atender td.cs-col-acoes .botao-atender { display:none !important; }
            .cs-fila.cs-com-med.cs-sem-atender td.cs-col-acoes > .row { flex-direction:column !important; }
            .cs-fila.cs-com-med td.cs-col-acoes > .row::before, .cs-fila.cs-com-med td.cs-col-acoes > .row::after { display:none !important; } /* clearfix do Bootstrap viraria célula do grid */
            .cs-fila.cs-com-med td.cs-col-acoes .botao-chamar,
            .cs-fila.cs-com-med td.cs-col-acoes .botao-atender {
                display:flex !important; align-items:center; justify-content:center; gap:4px; max-width:none !important; width:auto !important;
                flex:none !important; height:30px; width:100% !important; padding:0 6px 0 26px !important; border:1px solid #b9c2cc; border-radius:5px; background-color:#fff;
                background-position:6px center; background-size:18px; color:#24313f !important; font-size:12px; font-weight:600;
                text-decoration:none !important; white-space:nowrap; filter:none; }
            .cs-fila.cs-com-med td.cs-col-acoes .botao-chamar::after { content:'Chamar'; }
            .cs-fila.cs-com-med td.cs-col-acoes .botao-atender::after { content:'Atender'; }
            /* v3.0.7: ações nativas compactas; Cancelar permanece com o tamanho atual. */
            .cs-fila.cs-com-med td.cs-col-acoes .botao-chamar,
            .cs-fila.cs-com-med td.cs-col-acoes .botao-atender {
                width:100% !important;
                min-width:0 !important;
                padding-left:24px !important;
                padding-right:4px !important;
            }
            .cs-fila.cs-com-med th.cs-col-acoes,
            .cs-fila.cs-com-med td.cs-col-acoes {
                min-width:0 !important;
            }
            .cs-fila td.cs-col-acoes .botao-atender{outline:none!important;box-shadow:none!important}
            .cs-fila td.cs-col-acoes .botao-atender:focus,.cs-fila td.cs-col-acoes .botao-atender:active{outline:none!important;box-shadow:none!important;border-color:#b9c2cc!important}
            .cs-fila td.cs-col-acoes .botao-atender:not(.cs-confirmar-bloqueado){border-color:#b9c2cc!important;background-color:#fff!important}
            .cs-fila td.cs-col-acoes .botao-atender.cs-confirmar-bloqueado{background:#eceff2!important;border-color:#d3d8de!important;color:#8a949e!important;opacity:.78!important;cursor:not-allowed!important;pointer-events:none!important}
            .cs-fila.cs-com-med td.cs-col-acoes .botao-chamar:not(.disabled):hover,
            .cs-fila.cs-com-med td.cs-col-acoes .botao-atender:not(.disabled):not([disabled]):not(.cs-confirmar-bloqueado):hover { filter:none; background-color:#f6f7f8!important; }
            .cs-fila.cs-com-med td.cs-col-acoes .disabled, .cs-fila.cs-com-med td.cs-col-acoes [disabled] { opacity:.45; }
            .cs-acao-extra:empty { display:none; }
            .cs-doc-box { display:flex; flex-direction:column; align-items:center; gap:1px; margin-top:4px; font-size:11px; line-height:1.3; }
            .cs-doc-ver { border:0; background:transparent; color:#2563eb !important; padding:2px 3px !important; margin-top:1px; font-size:10px; line-height:16px; font-weight:700; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:4px; border-radius:5px; }
            .cs-doc-ver:hover { background:#eff6ff; color:#1d4ed8 !important; text-decoration:none; }
            .cs-doc-icon{width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;color:#2563eb;flex:0 0 14px}
            .cs-doc-icon svg{width:13px;height:13px;display:block;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
            .cs-doc-icon-emoji{font-size:13px;line-height:1;color:inherit}
            .cs-doc-chevron{width:9px;height:9px;display:inline-flex;align-items:center;justify-content:center;color:#a1a1aa;flex:0 0 9px}
            .cs-doc-chevron svg{width:8px;height:8px;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
            .cs-doc-cartao{position:relative;width:206px;max-width:100%;margin-top:3px;background:#fff;border:1px solid #e2e8f0;border-radius:9px;box-shadow:0 1px 2px rgba(15,23,42,.07);overflow:hidden;text-align:left}
            .cs-doc-linha{display:flex;align-items:center;gap:7px;padding:3px 6px;cursor:copy;white-space:nowrap}
            .cs-doc-linha+.cs-doc-linha{border-top:1px solid #eef2f6}
            .cs-doc-linha:hover{background:#f8fafc}
            .cs-doc-label-cel{flex:none;width:28px;display:flex;align-items:center}
            .cs-doc-label{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:15px;padding:1px 4px 0;background:#334155;color:#fff;font-size:8.5px;font-weight:800;letter-spacing:0;border-radius:4px;line-height:1}
            .cs-doc-valor{flex:1;font-size:12px;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums;letter-spacing:.02em}
            .cs-doc-cp{flex:none;width:19px;height:19px;border-radius:6px;background:#eef4ff;color:#2563eb;display:grid;place-items:center}
            .cs-doc-cp svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
            .cs-doc-cp .cs-doc-i-ok{display:none}
            .cs-doc-linha:hover .cs-doc-cp{background:#2563eb;color:#fff}
            .cs-doc-linha.cs-doc-ok .cs-doc-cp{background:#dcfce7;color:#15803d}
            .cs-doc-linha.cs-doc-ok .cs-doc-i-copiar{display:none}
            .cs-doc-linha.cs-doc-ok .cs-doc-i-ok{display:block}
            .cs-doc-vazio { cursor:default; }
            .cs-doc-vazio:hover { background:none; }
            .cs-doc-vazio .cs-doc-label{background:#cbd5e1}
            .cs-doc-vazio .cs-doc-valor{font-size:10.5px;font-weight:400;color:#94a3b8;font-style:italic}
            .cs-doc-nada { color:#8a94a0; font-style:italic; }
            .cs-ficha{display:inline-flex;align-items:center;gap:5px;margin-top:4px;padding:2px 9px;border-radius:999px;background:#eef4ff;border:1px solid #cddcfb;color:#1d4ed8;font-size:10.5px;line-height:1.5;cursor:copy;white-space:nowrap;font-variant-numeric:tabular-nums}
            .cs-ficha svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
            .cs-ficha b{color:#1e3a8a;font-weight:700}
            .cs-ficha:hover{background:#dfeaff;border-color:#b6ccf7}
            .cs-doc-aviso { color:#a15c00; }
            .cs-alerg-box:empty { display:none; }
            .cs-vitais-box:empty{display:none}
            .cs-hist-hora:empty{display:none}
            .cs-hist-hora-txt{font-size:11px;color:#6b7684;margin-top:2px}
            .cs-vitais-box{display:flex;justify-content:center;margin-top:5px}
            .cs-vitais{display:inline-grid;grid-template-columns:auto auto;column-gap:7px;text-align:left;font-size:10px;color:#334155;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:5px;padding:2px 5px;white-space:nowrap;line-height:1.3}
            .cs-vitais .cs-sv-pa{grid-column:1 / -1}
            .cs-vitais-vazio{display:inline-block}
            .cs-nome-txt{display:inline-block;font-size:13px;font-weight:800;color:#0f172a;line-height:1.25;padding:2px 7px 2px 8px;border-left:4px solid var(--cs-nr,#94a3b8);border-radius:4px;background:color-mix(in srgb,var(--cs-nr,#94a3b8) 13%,transparent)}
            .cs-nr-vermelho{--cs-nr:#c62828} .cs-nr-laranja{--cs-nr:#e65100} .cs-nr-amarelo{--cs-nr:#f5a623} .cs-nr-verde{--cs-nr:#1b6e2e} .cs-nr-azul{--cs-nr:#1565c0} .cs-nr-sem{--cs-nr:#94a3b8}
            .cs-vitais b{font-weight:800}
            .cs-vitais-rot{font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:1px}
            .cs-vitais-vazio{font-style:italic;color:#94a3b8}
            /* Alergia: mesma lógica clínica da v2.0.80, mas em chip compacto na fila. */
            .cs-alerg-box{display:flex;justify-content:center;align-items:flex-start;margin-top:2px;max-width:100%}
            .cs-alerg-box .om30-med-alergia,
            .cs-alerg-box .om30-med-sem-alergia,
            .cs-alerg-box .om30-med-alergia-nao-verificada{
                display:inline-block!important;width:auto!important;min-width:190px;max-width:300px;box-sizing:border-box;margin-top:3px;padding:5px 8px;
                border-radius:6px;font-size:11px;line-height:1.28;text-align:left;overflow-wrap:anywhere;white-space:normal
            }
            .cs-alerg-box .om30-med-alergia{border:1px solid #fca5a5;background:#fff1f2;color:#991b1b;font-weight:900}
            .cs-alerg-box .om30-med-sem-alergia{border:1px solid #d1d5db;background:#f8fafc;color:#64748b;font-weight:800}
            .cs-alerg-box .om30-med-alergia-nao-verificada{border:1px solid #f1d08a;background:#fffaf0;color:#8a5a00;font-weight:800}
            .cs-alerg-box .om30-med-alergia-fonte{display:block;margin-top:1px;font-size:9px;line-height:1.2;font-weight:700;opacity:.75;text-transform:none}
            .cs-alerg-box .om30-med-alergia-detalhe{display:block;margin-top:1px;font-size:9px;line-height:1.2;font-weight:800;text-transform:none}
            .cs-alerg-box .om30-med-alergia-detalhe b{font-weight:900}
            .cs-alerg-box .om30-med-alergia-conflito{display:block;margin-top:2px;color:#b45309;opacity:1;font-size:9px;line-height:1.2;font-weight:900;text-transform:none}
            .cs-med-ctrl { display:inline-block; padding:0 4px; border-radius:3px; background:#fff1d6; color:#8a4b00; border:1px solid #f0c674;
                font-size:10px; font-weight:700; text-transform:uppercase; vertical-align:1px; cursor:help; }
            /* Histórico: sem Chamar/Atender; cancelados em vermelho. */
            .cs-fila.cs-historico td.cs-col-acoes > .row { display:none !important; }
            .cs-fila.cs-historico tr > td { opacity:1; }
            .cs-fila tr.cs-hist-cancelado > td { background:#fff7f7 !important; }
            .cs-fila tr.cs-hist-finalizado > td { background:#f2fbf5 !important; }
            .cs-fila tr.cs-hist-cancelado td.cs-col-senha { color:#b42318 !important; font-weight:700; }
            .cs-fila tr.cs-hist-finalizado td.cs-col-senha { color:#1f7a3f !important; font-weight:700; }
            .cs-hist-nota { text-align:left; font-size:11px; color:#8a1f1f; background:#fdf0f0; border-left:3px solid #d9534f; padding:2px 6px; border-radius:3px; }
            .cs-barra .cs-dica { color:#6b7785; font-style:italic; }
            .cs-acao-extra {
                margin-top:2px;
                width:100%;
            }
            .cs-cancelar-linha {
                display:flex;
                align-items:center;
                justify-content:center;
                gap:4px;
                width:100%;
                min-width:0;
                height:30px;
                box-sizing:border-box;
                margin:0;
                padding:0 6px;
                border:1px solid #e3a5a5;
                border-radius:5px !important;
                background:#fff5f5;
                color:#a32020;
                font-size:12px;
                line-height:1;
                font-weight:600;
                cursor:pointer;
                white-space:nowrap;
                overflow:hidden;
                text-overflow:ellipsis;
                box-shadow:none;
            }
            .cs-cancelar-linha:hover:not(:disabled) { background:#fde2e2; border-color:#cf6b6b; }
            .cs-cancelar-linha:disabled { opacity:.6; cursor:progress; }
            .cs-cancelar-modal { background:rgba(15,23,42,.46); }
            .cs-cancelar-modal > div {
                width:min(540px,94vw) !important;
                max-height:86vh;
                padding:14px !important;
                border-radius:11px !important;
                box-shadow:0 18px 55px rgba(0,0,0,.28) !important;
                color:#1f2937;
            }
            .cs-cancelar-modal .cs-cancel-title { font-size:15px; font-weight:900; margin:0 0 3px; color:#1f2937; }
            .cs-cancelar-modal .cs-cm-paciente { color:#64748b; margin:0 0 8px; font-size:11px; }
            .cs-cancelar-modal .cs-cm-itens {
                display:grid;
                gap:4px;
                margin:0 0 10px;
                padding:0;
                list-style:none;
                background:transparent;
                border:0;
                font-size:12px;
            }
            .cs-cancelar-modal .cs-cm-itens li {
                margin:0;
                padding:6px 8px;
                border:1px solid #e1e6eb;
                border-radius:6px;
                background:#f8fafc;
                line-height:1.25;
            }
            .cs-cancelar-modal .cs-cm-rotulo { margin:2px 0 6px; font-size:12px; font-weight:800; color:#334155; }
            .cs-cancelar-modal .cs-cm-motivos { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; }
            .cs-cancelar-modal .cs-cm-motivos button {
                width:100%;
                min-height:34px;
                margin:0;
                padding:7px 9px;
                border:1px solid #d1d5db;
                border-radius:6px;
                background:#fff;
                color:#334155;
                text-align:left;
                font-size:11px;
                line-height:1.2;
                font-weight:700;
                cursor:pointer;
            }
            .cs-cancelar-modal .cs-cm-motivos button:hover { background:#f8fafc; border-color:#b9c4cf; }
            .cs-cancelar-modal .cs-cm-motivos button[data-on="1"] { border-color:#b91c1c; background:#fff1f2; color:#991b1b; }
            .cs-cancelar-modal .cs-cm-motivos .cs-editar { display:none !important; }
            .cs-cancelar-modal textarea {
                width:100%;
                box-sizing:border-box;
                min-height:52px;
                height:52px;
                margin-top:6px;
                resize:vertical;
                padding:7px 8px;
                border:1px solid #d1d5db;
                border-radius:6px;
                font-size:11px;
                line-height:1.3;
                outline:none;
            }
            .cs-cancelar-modal textarea:focus { border-color:#93a3b5; box-shadow:0 0 0 2px rgba(100,116,139,.08); }
            .cs-cancelar-modal .cs-cm-reav {
                display:flex;
                gap:7px;
                align-items:center;
                margin:8px 0 4px;
                padding:7px 8px;
                border:1px solid #dbe2ea;
                border-radius:6px;
                background:#f8fafc;
                font-size:11px;
                font-weight:800;
                cursor:pointer;
            }
            .cs-cancelar-modal .cs-cm-just-reav { min-height:52px; }
            .cs-cancelar-modal .cs-cm-nota { color:#7b8794; font-size:10.5px; line-height:1.35; margin-top:7px; }
            .cs-cancelar-modal .cs-acoes { display:flex; justify-content:flex-end; gap:6px; margin-top:10px; }
            .cs-cancelar-modal .cs-acoes button {
                padding:6px 11px;
                border-radius:6px;
                border:1px solid #d1d5db;
                background:#fff;
                color:#334155;
                font-size:11px;
                font-weight:800;
                cursor:pointer;
            }
            .cs-cancelar-modal .cs-acoes button[data-a="ok"] { background:#b91c1c; border-color:#b91c1c; color:#fff; }
            .cs-cancelar-modal .cs-acoes button[data-a="ok"]:disabled { background:#e5a3a3; border-color:#e5a3a3; cursor:not-allowed; }
            #cs-aviso-flutuante { position:fixed; right:20px; bottom:20px; z-index:100000; max-width:420px; padding:10px 14px;
                background:#1f2937; color:#fff; border-radius:6px; font-size:14px; box-shadow:0 6px 20px rgba(0,0,0,.25);
                opacity:0; transform:translateY(10px); transition:opacity .2s, transform .2s; pointer-events:none; }
            #cs-aviso-flutuante.cs-visivel { opacity:1; transform:none; }
        `);

        // ── Visual Claude ────────────────────────────────────────────────────
        // Somente apresentação: não altera ordem, chamada, status, cancelamento,
        // alergia, filas, APIs ou regras clínicas.
        estilo(`
            /* Resumo: nome do risco em etiqueta colorida */
            .cs-barra .cs-media-cor { grid-template-columns:0 auto auto !important; column-gap:6px !important; }
            .cs-barra .cs-media-dot { visibility:hidden !important; width:0 !important; }
            .cs-barra .cs-media-nome { padding:2px 6px; border-radius:3px; font-size:10.5px !important; font-weight:800 !important; letter-spacing:.03em; color:#fff !important; background:#8a96a3; }
            .cs-barra .cs-media-cor[title^="Vermelho"] .cs-media-nome { background:#c62828; }
            .cs-barra .cs-media-cor[title^="Laranja"] .cs-media-nome { background:#e65100; }
            .cs-barra .cs-media-cor[title^="Amarelo"] .cs-media-nome { background:#f5c518; color:#3b2f00 !important; }
            .cs-barra .cs-media-cor[title^="Verde"] .cs-media-nome { background:#1b6e2e; }
            .cs-barra .cs-media-cor[title^="Azul"] .cs-media-nome { background:#1565c0; }
            .cs-barra .cs-media-qtd { font-size:14px !important; }

            /* Risco: etiqueta com o nome */
            .cs-fila td.cs-col-risco.cs-risco-ok { font-size:0 !important; }
            .cs-fila td.cs-col-risco.cs-risco-ok > :not(.cs-risco-box):not(.cs-vitais-box) { display:none !important; }
            .cs-risco-box { font-size:11px; }
            .cs-risco-pill { display:inline-block; padding:3px 7px; border-radius:3px; font-size:10.5px; font-weight:800; letter-spacing:.04em; line-height:1.2; color:#fff; background:#8a96a3; white-space:nowrap; }
            .cs-rp-vermelho { background:#c62828; } .cs-rp-laranja { background:#e65100; } .cs-rp-amarelo { background:#f5c518; color:#3b2f00; }
            .cs-rp-verde { background:#1b6e2e; } .cs-rp-azul { background:#1565c0; }

            /* Senha e idade */
            .cs-fila td.cs-col-senha { font-weight:700 !important; font-variant-numeric:tabular-nums; }
            .cs-idade-box { margin-top:2px; font-size:11px; font-weight:700; color:#5b6672; white-space:nowrap; }
            .cs-idade-box:empty { display:none; }

            /* Medicação */
            .cs-fila .cs-med-prod { color:#1b242e; font-weight:700 !important; }
            .cs-fila .cs-med-pos { font-size:11px; color:#5b6672; }
            .cs-via { border-radius:3px !important; font-size:10px !important; line-height:16px !important; min-width:28px !important; }

            /* Ações */
            .cs-fila.cs-com-med td.cs-col-acoes .botao-chamar,
            .cs-fila.cs-com-med td.cs-col-acoes .botao-atender { padding-left:6px !important; padding-right:6px !important; justify-content:center !important; text-align:center !important; }

            .cs-fila.cs-com-med td.cs-col-acoes .botao-chamar:not(.disabled):not([disabled]) {
                position:relative !important; background-color:#2b6cb0 !important; background-size:0 0 !important;
                border-color:#2b6cb0 !important; color:#fff !important; font-weight:700 !important; }
            .cs-fila.cs-com-med td.cs-col-acoes .botao-chamar:not(.disabled):not([disabled])::before {
                content:''; position:absolute; left:7px; top:50%; width:18px; height:18px; transform:translateY(-50%);
                background-image:inherit; background-repeat:no-repeat; background-position:center; background-size:18px;
                filter:brightness(0) invert(1); pointer-events:none; }
            .cs-fila.cs-com-med td.cs-col-acoes .botao-chamar:not(.disabled):not([disabled]):hover { background-color:#245a93 !important; }

            .cs-fila .cs-acao-extra { margin-top:8px !important; padding-top:6px; border-top:1px solid #e6eaee; }
            .cs-cancelar-linha { height:24px !important; font-size:11px !important; background:#fff !important; border-color:#e8b4b4 !important; }
            .cs-cancelar-linha:hover:not(:disabled) { background:#fdf0f0 !important; }
        `);


        // Espera o Vue e os componentes do Saúde Simples aparecerem para remendar
        // as definições antes da tabela ser montada.
        const inicio = Date.now();
        const timer = setInterval(() => {
            const V = window.Vue;
            if (V && V.options && V.options.components && V.options.components['controle-salas-listagem-fila-aplicacao']) {
                clearInterval(timer);
                try { remendarComponentes(V); } catch (e) { console.error('[Controle de Salas] remendo falhou', e); }
                setInterval(() => { varrerInstancias(); atualizarTitulo(); vigiarListaParada(); }, 3000);
                document.addEventListener('visibilitychange', vigiarListaParada);
                varrerInstancias();
            } else if (Date.now() - inicio > 60000) {
                clearInterval(timer);
                console.warn('[Controle de Salas] componentes Vue não encontrados; script inativo.');
            }
        }, 25);

        // Lista parada (aba voltou do segundo plano, PC acordou, ciclo de 20 s do sistema
        // parou): com a tela visível e mais de 1 min sem atualizar, atualiza sem esperar.
        function vigiarListaParada() {
            if (!CS.colecao || !CS.ultimaAtualizacao || document.visibilityState === 'hidden') return;
            if (Date.now() + (CS.desvioRelogio || 0) - CS.ultimaAtualizacao.getTime() < 60e3) return;
            if (Date.now() - (CS.vigiaEm || 0) < 30e3) return; // falhando, tenta de novo a cada 30 s
            CS.vigiaEm = Date.now();
            carregar(CS.colecao, { silencioso: true });
        }

        // Instância criada já com a definição remendada: a varredura não precisa mexer nela.
        function marcarRemendada() { this.__cs = true; }

        // Aplica o mesmo remendo na definição do componente (vale para instâncias futuras)
        // e em extendOptions (o Vue recompõe options a partir dele se houver Vue.mixin depois).
        function remendar(V, nome, { metodos = {}, mounted, beforeDestroy, watch = {} }) {
            const C = V.options.components[nome];
            if (!C || !C.options) return;
            for (const alvo of [C.options, C.extendOptions].filter(Boolean)) {
                alvo.methods = alvo.methods || {};
                for (const [m, fabrica] of Object.entries(metodos)) {
                    const original = alvo.methods[m];
                    if (original && original.__cs) continue;
                    const novo = fabrica(original);
                    novo.__cs = true;
                    alvo.methods[m] = novo;
                }
                for (const [hook, fn] of [['created', marcarRemendada], ['mounted', mounted], ['beforeDestroy', beforeDestroy]]) {
                    if (!fn) continue;
                    const atual = alvo[hook];
                    if (Array.isArray(atual)) { if (!atual.includes(fn)) atual.push(fn); }
                    else if (typeof atual === 'function') alvo[hook] = [atual, fn];
                    else alvo[hook] = [fn];
                }
                if (Object.keys(watch).length) {
                    alvo.watch = Object.assign({}, alvo.watch || {});
                    for (const [k, fn] of Object.entries(watch)) {
                        const atual = alvo.watch[k];
                        if (Array.isArray(atual)) { if (!atual.includes(fn)) alvo.watch[k] = atual.concat(fn); }
                        else if (atual && atual !== fn) alvo.watch[k] = [atual, fn];
                        else alvo.watch[k] = fn;
                    }
                }
            }
            C.__csRemendo = { metodos, mounted, watch };
        }

        // Instâncias que já existiam antes do remendo (script carregado tarde).
        function varrerInstancias() {
            const raizEl = document.getElementById('app-vue') || document.querySelector('.listagem-fila');
            let raiz = null;
            for (let el = raizEl; el && !raiz; el = el.parentElement) raiz = el.__vue__ || null;
            if (!raiz && raizEl) {
                const algum = raizEl.querySelector('*');
                raiz = algum && algum.__vue__;
            }
            if (!raiz) return;
            const V = window.Vue;
            const pilha = [raiz.$root];
            while (pilha.length) {
                const vm = pilha.pop();
                pilha.push(...(vm.$children || []));
                if (vm.__cs) continue;
                const nome = vm.$options && vm.$options.name;
                const C = nome && V.options.components[nome];
                const r = C && C.__csRemendo;
                if (!r) continue;
                vm.__cs = true;
                for (const m of Object.keys(r.metodos)) {
                    const fn = C.options.methods[m];
                    if (fn) vm[m] = fn.bind(vm);
                }
                for (const [k, fn] of Object.entries(r.watch)) vm.$watch(k, fn);
                if (r.mounted && vm._isMounted) r.mounted.call(vm);
            }
        }

        function remendarComponentes(V) {
            // Lista: atualização automática e manual passam por aqui.
            remendar(V, 'controle-salas', {
                metodos: {
                    atualizarListagemFila: () => function () {
                        atualizarListagem(this.$refs.listagemFila, this.$refs.filtroMunicipe);
                    },
                },
            });
            remendar(V, 'controle-salas-listagem-fila-aplicacao', {
                metodos: {
                    atualizarListagemFila: () => function () {
                        atualizarListagem(this, this.$parent && this.$parent.$refs.filtroMunicipe);
                    },
                },
            });

            // Tabela: busca o período inteiro, ordena e mostra tudo numa página só.
            remendar(V, 'collection-with-search-atendimento', {
                metodos: {
                    fetchCollection: original => function () {
                        if (!this.controleSala) return original.apply(this, arguments);
                        return carregar(this, { silencioso: false });
                    },
                },
                mounted() {
                    if (this.controleSala) prepararColecao(this);
                },
            });

            // Filtro do sistema: guarda o que foi aplicado e restaura depois do reload.
            remendar(V, 'controle-sala-custom-filter-with-modal', {
                metodos: {
                    fetchFilter: original => function () {
                        // O período é controlado pela barra OM30; remove as datas do filtro nativo.
                        this.dataInicial=''; this.dataFinal='';
                        if(this.conditions){this.conditions.dataInicial='';this.conditions.dataFinal='';}
                        const r = original.apply(this, arguments);
                        gravarJSON(CHAVE_FILTROS, N.filtrosParaSalvar({
                            profissional: this.profissionalSelecionado,
                            status: this.statusSelecionado,
                            grauRisco: this.grauRiscoSelecionado,
                            dataInicial: '',
                            dataFinal: '',
                        }, new Date()));
                        atualizarBarra();
                        return r;
                    },
                },
                mounted() { restaurarFiltros(this); },
            });

            // Chamar: o bloqueio era calculado só na montagem; com a lista reordenada a
            // mesma linha passa a ser outro paciente, então recalcula quando o status muda.
            const reavaliarChamar = function () {
                if (this.controleSala) this.botaoBloqueado = this.setDisabledClass();
            };
            remendar(V, 'botao-chamar-paciente', {
                metodos: {
                    // Depois de chamar, rola até o topo para o "Confirmar atendimento" ficar à vista.
                    chamarSenhaManualmente: original => function () {
                        try {
                            const id = String(this.atendimentoId || '').match(/\d+/)?.[0] || '';
                            const tipo = String(this.atendimentoType || '').trim();
                            const str = /^AtendimentoPa#\d+$/i.test(String(this.atendimentoStr || ''))
                                ? String(this.atendimentoStr)
                                : (id && /^AtendimentoPa$/i.test(tipo) ? `AtendimentoPa#${id}` : '');
                            if (str) localStorage.setItem(CS_ATENDIMENTO_CHAMADO, JSON.stringify({ atendimento:str, encaminhamentoStr:String(this.encaminhamentoStr||''), em:Date.now() }));
                        } catch (_) {}
                        const r = original.apply(this, arguments);
                        if (this.controleSala && r && typeof r.then === 'function') {
                            const str = String(this.atendimentoStr || '');
                            r.then(() => marcarSeSenhaPerdida(str), () => marcarSeSenhaPerdida(str));
                        }
                        if (ROLAR_AO_CHAMAR && this.controleSala && r && typeof r.then === 'function') {
                            r.then(() => this.$nextTick(() => {
                                const fila = filaChamarProximo();
                                if (fila && fila.proximoFila && String(fila.prontuariavelId) === String(this.atendimentoId)) {
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }
                            }), () => {});
                        }
                        return r;
                    },
                },
                mounted() { CS.botoesChamar.add(this); },
                beforeDestroy() { CS.botoesChamar.delete(this); },
                watch: { status: reavaliarChamar, atendimentoStr: reavaliarChamar },
            });

            // Atender: só fica travado se o paciente estiver em outra sala.
            const reavaliarAtender = function () { this.desbloqueiBotaoAtendimento(); };
            // "Confirmar atendimento": mesma coisa que o sistema faz (grava a senha chamada
            // e vai para a aplicação), mas numa aba nova.
            remendar(V, 'fila-chamada', {
                metodos: {
                    atender: original => function () {
                        if (!ABRIR_ATENDIMENTO_EM_NOVA_ABA || !this.controleSala || this.criarRegistro || !this.redirectUrl) return original.apply(this, arguments);
                        if (!confirmarSegundaAba()) return;
                        this.$store.dispatch('defineSenhaChamada', this.proximaSenha);
                        let ctxChamado = null;
                        try { ctxChamado = JSON.parse(localStorage.getItem(CS_ATENDIMENTO_CHAMADO) || 'null'); } catch (_) {}
                        const contexto = {
                            atendimentoId: this.prontuariavelId || String(ctxChamado?.atendimento||'').match(/^AtendimentoPa#(\d+)$/i)?.[1] || '',
                            atendimentoType: this.prontuariavelType || (ctxChamado?.atendimento ? 'AtendimentoPa' : ''),
                            atendimentoStr: this.atendimentoStr || ctxChamado?.atendimento || '',
                            encaminhamentoStr: this.encaminhamentoStr || ctxChamado?.encaminhamentoStr || ''
                        };
                        if (!abrirAtendimento(this.redirectUrl, this.nomeMunicipe, contexto)) return original.apply(this, arguments);
                        limparChamada();
                    },
                },
            });

            remendar(V, 'botao-iniciar-atendimento', {
                metodos: {
                    // Paciente sem senha: o Atender vai direto para a aplicação.
                    definicoesInicioAtendimento: original => function () {
                        if (!ABRIR_ATENDIMENTO_EM_NOVA_ABA || !this.controleSala || this.criarRegistro
                            || (typeof this.parametrizacaoEscutaInicial === 'function' && this.parametrizacaoEscutaInicial())
                            || !this.redirectUrl) return original.apply(this, arguments);
                        if (!confirmarSegundaAba()) return;
                        if (!abrirAtendimento(this.redirectUrl, nomeDaLinha(this), { atendimentoId: this.atendimentoId, atendimentoType: this.atendimentoType, atendimentoStr: this.atendimentoStr, encaminhamentoStr: this.encaminhamentoStr })) return original.apply(this, arguments);
                        this.__csAbrindo = false;
                        this.desbloqueiBotaoAtendimento();
                    },
                    desbloqueiBotaoAtendimento: original => function () {
                        if (!this.controleSala) return original.apply(this, arguments);
                        if (this.__csAbrindo) return;
                        this.botaoBloqueado = emOutraSala(this.encaminhamentoStr);
                    },
                    iniciarAtendimento: original => function () {
                        if (!this.controleSala) return original.apply(this, arguments);
                        const args = arguments;
                        return atender(this, () => original.apply(this, args));
                    },
                },
                mounted() {
                    CS.botoesAtender.add(this);
                    if (this.controleSala) this.desbloqueiBotaoAtendimento();
                },
                beforeDestroy() { CS.botoesAtender.delete(this); },
                watch: { encaminhamentoStr: reavaliarAtender },
            });
        }

        function emOutraSala(encaminhamentoStr) {
            const it = CS.itens.get(encaminhamentoStr);
            return !!it && it.status === 'Em Outra Sala';
        }

        // Mesma composição de filtro do sistema (atualizarListagemFila global), mas sem
        // recriar o objeto quando nada mudou: aí só recarrega em silêncio, sem spinner
        // e sem voltar para a página 1.
        function atualizarListagem(listagem, filtro) {
            if (!listagem || !filtro) return;
            const base = Object.assign({}, filtro.conditions);
            if (listagem.ocupacoesProfissional) base.ocupacoes_ids = listagem.ocupacoesProfissional;
            const col = listagem.$refs && listagem.$refs.collectionWithSearch;
            if (col && JSON.stringify(base) === JSON.stringify(listagem.filtroBaseAtendimentos)) {
                carregar(col, { silencioso: true });
            } else {
                listagem.filtroBaseAtendimentos = base;
            }
        }

        // O sistema só monta o filtro base no primeiro tick de 20 s (antes disso a lista
        // ainda não existe quando ele tenta); até lá a tabela carregava sem filtro nenhum
        // e depois recarregava inteira. Monta já na primeira carga.
        function filtroBaseInicial(vm) {
            const listagem = vm.$parent;
            const controle = listagem && listagem.$parent;
            const filtro = controle && controle.$refs && controle.$refs.filtroMunicipe;
            if (!listagem || !filtro || !('filtroBaseAtendimentos' in listagem)) return;
            if (Object.keys(listagem.filtroBaseAtendimentos || {}).length) return;
            atualizarListagem(listagem, filtro);
        }

        function prepararColecao(vm) {
            const primeira = CS.colecao !== vm;
            CS.colecao = vm;
            if (primeira) filtroBaseInicial(vm);
            vm.customPerPage = 5000;
            const original = vm.tableConf && vm.tableConf.tbodyTrClass;
            if (typeof original !== 'function') {
                // Mantém a classe do sistema (collection-row monta o grid das linhas).
                vm.tableConf = Object.assign({}, vm.tableConf, {
                    tbodyTrClass: (item, tipo) => [original || '', item && tipo === 'row' ? item.__csClasse || '' : ''].join(' ').trim(),
                });
            }
            if (vm.$el && vm.$el.classList) {
                vm.$el.classList.add('cs-fila');
                vm.$el.classList.toggle('cs-sem-atender', ESCONDER_ATENDER);
            }
            montarBarra();
        }

        function ehMedicacao(vm) { return /\/aplicacoes_medicamentos/.test(vm.url || ''); }

        // "Sala" é sempre a sala atual: vira a coluna de espera. Com MOSTRAR_MEDICACOES
        // vira a coluna de medicações, data e hora de chegada ficam juntas e a hora vira "Espera".
        function setorDaColecao(vm) {
            const u = String(vm && vm.url || '');
            if (/\/aplicacoes_medicamentos/.test(u)) return { key:'medicacao', nome:'Medicação', endpoint:'/aplicacoes_medicamentos', prefix:'EncaminhamentoMedicacao#', api:'medicacao' };
            if (/\/encaminhamentos_exames/.test(u)) return { key:'exames', nome:'Exames', endpoint:'/encaminhamentos_exames', prefix:'EncaminhamentoExame#', api:'exames', formClass:'encaminhamento_exame', formPrefix:'edit_encaminhamento_exame_', feito:'coletado', item:'exame' };
            if (/\/encaminhamentos_radiografias/.test(u)) return { key:'raio_x', nome:'Raio-X', endpoint:'/encaminhamentos_radiografias', prefix:'EncaminhamentoRadiografia#', api:'radiografia', formClass:'encaminhamento_radiografia', formPrefix:'edit_encaminhamento_radiografia_', feito:'realizado', item:'Raio-X' };
            if (/\/encaminhamentos_procedimentos_enfermagem/.test(u)) return { key:'enfermagem', nome:'Procedimentos de Enfermagem', endpoint:'/encaminhamentos_procedimentos_enfermagem', prefix:'EncaminhamentoProcedimentoEnfermagem#', api:'enfermagem', formClass:'encaminhamento_procedimento_enfermagem', formPrefix:'edit_encaminhamento_procedimento_enfermagem_', feito:'realizado', item:'procedimento' };
            return null;
        }


        // ── FORÇAR SALA DE MEDICAÇÃO — lógica completa da v2.0.80 ──────────
        // Monitora o Vue nativo, recarrega a categoria quando necessário, grava
        // localValorSelecionado e confirma pelo redirectFilaAtendimento().
        let autoSalaEmCurso = false;
        let autoSalaPausada = false;
        let autoSalaViuSemLocal = false;
        let autoSalaMonitor = null;
        let autoSalaUltimoEstado = '';

        const autoSalaSleep = ms => new Promise(r => setTimeout(r, ms));
        function normalizarAutoSala(v) {
            return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
        }
        function autoSalaVisivel(el) {
            if (!el || !el.isConnected) return false;
            try {
                const st=getComputedStyle(el); if(st.display==='none'||st.visibility==='hidden') return false;
                const r=el.getBoundingClientRect(); return r.width>0&&r.height>0;
            } catch(_){ return true; }
        }
        function autoSalaVMs() {
            const out=[], vistos=new Set();
            document.querySelectorAll('*').forEach(el=>{
                let vm=el.__vue__;
                while(vm&&!vistos.has(vm)){vistos.add(vm);out.push(vm);vm=vm.$parent;}
            });
            return out;
        }
        function guicheMedicacaoAtual() {
            const tipo='controle_de_salas_medicacao';
            return autoSalaVMs().find(vm=>
                vm?.tipoParametrizacao===tipo &&
                typeof vm?.redirectFilaAtendimento==='function' &&
                typeof vm?.getCategoriaAtendimento==='function' &&
                autoSalaVisivel(vm?.$el)
            ) || null;
        }
        function localMedicacaoStore(guiche) {
            try { return guiche?.$store?.getters?.localAtendimentoAtual?.controle_de_salas_medicacao || {}; }
            catch (_) { return {}; }
        }
        function salaMedicacaoNaLista(guiche) {
            return (Array.isArray(guiche?.locaisAtendimento)?guiche.locaisAtendimento:[])
                .find(l=>normalizarAutoSala(l?.nome)==='SALA DE MEDICACAO') || null;
        }
        function contextoAutoSalaAtivo(guiche) {
            if(location.pathname!=='/aplicacoes_medicamentos') return false;
            if(!guiche || guiche?.tipoParametrizacao!=='controle_de_salas_medicacao') return false;
            return autoSalaVisivel(guiche.$el);
        }
        async function carregarSalaMedicacao(guiche) {
            if(!contextoAutoSalaAtivo(guiche)) return null;
            let sala=salaMedicacaoNaLista(guiche);
            if(sala) return sala;

            // Mesma recuperação validada: limpa a lista velha e pede os locais novamente.
            if(Array.isArray(guiche.locaisAtendimento)) guiche.locaisAtendimento.splice(0,guiche.locaisAtendimento.length);
            const r=guiche.getCategoriaAtendimento();
            if(r&&typeof r.then==='function') await r;
            if(!contextoAutoSalaAtivo(guiche)) return null;
            for(let i=0;i<20;i++){
                sala=salaMedicacaoNaLista(guiche);
                if(sala) return sala;
                await autoSalaSleep(150);
                if(!contextoAutoSalaAtivo(guiche)) return null;
            }
            return null;
        }
        async function forcarVinculoSalaMedicacao(guiche,sala) {
            if(!contextoAutoSalaAtivo(guiche)||!sala) return false;
            const store=guiche.$store;
            guiche.localValorSelecionado=sala;
            if(typeof guiche.$nextTick==='function') await new Promise(resolve=>guiche.$nextTick(resolve));
            if(!contextoAutoSalaAtivo(guiche)) return false;
            const r=guiche.redirectFilaAtendimento();
            if(r&&typeof r.then==='function') await r;
            await autoSalaSleep(220);
            const atual=localMedicacaoStore(guiche);
            const ok=guiche.localSelecionado===true && String(atual?.id||'')===String(sala.id);
            console[ok?'log':'warn']('[OM30 AUTO SALA]', ok?'SALA DE MEDICAÇÃO vinculada.':'Vínculo ainda não confirmou; o monitor tentará novamente.', {
                localSelecionado:guiche.localSelecionado,
                localValorSelecionado:guiche.localValorSelecionado,
                store:atual,
                sala
            });
            return ok;
        }
        async function verificarAutoSalaMedicacao() {
            if(autoSalaEmCurso||location.pathname!=='/aplicacoes_medicamentos') return;
            const setorAtualFila=setorDaColecao(CS.colecao)?.key||'';
            if(setorAtualFila && setorAtualFila!=='medicacao'){
                // Saiu de Medicação para outro setor: na próxima entrada o monitor
                // pode restaurar SALA DE MEDICAÇÃO normalmente.
                autoSalaPausada=false;autoSalaViuSemLocal=false;
                return;
            }
            const guiche=guicheMedicacaoAtual();
            if(!guiche) return;
            autoSalaEmCurso=true;
            try{
                const atual=localMedicacaoStore(guiche);
                if(autoSalaPausada){
                    const possui=guiche.localSelecionado===true&&!!atual?.id;
                    if(!possui){autoSalaViuSemLocal=true;return;}
                    if(!autoSalaViuSemLocal) return;
                    // Usuário saiu, ficou sem local e escolheu novamente: libera o monitor.
                    autoSalaPausada=false;autoSalaViuSemLocal=false;
                    return;
                }
                const sala=await carregarSalaMedicacao(guiche);
                if(!sala||!contextoAutoSalaAtivo(guiche)) return;
                const storeAtual=localMedicacaoStore(guiche);
                const correto=guiche.localSelecionado===true && String(storeAtual?.id||'')===String(sala.id);
                const estado=JSON.stringify({sel:guiche.localSelecionado,store:storeAtual?.id||'',sala:sala.id,valor:guiche.localValorSelecionado?.id||guiche.localValorSelecionado||''});
                if(estado!==autoSalaUltimoEstado){autoSalaUltimoEstado=estado;console.log('[OM30 AUTO SALA] Estado',JSON.parse(estado));}
                if(!correto) await forcarVinculoSalaMedicacao(guiche,sala);
            }catch(e){console.warn('[OM30 AUTO SALA] Falha',e);}finally{autoSalaEmCurso=false;}
        }
        document.addEventListener('click',ev=>{
            if(!ev.isTrusted||location.pathname!=='/aplicacoes_medicamentos') return;
            const alvo=ev.target?.closest?.('button,a,[role="button"]')||ev.target;
            const txt=normalizarAutoSala(alvo?.textContent||'');
            if(txt.includes('SAIR DA SALA')||txt.includes('SAIR DO LOCAL')){
                autoSalaPausada=true;autoSalaViuSemLocal=false;
            }
        },true);
        // Verificação rápida inicial + monitor igual ao módulo validado da 2.0.80.
        setTimeout(verificarAutoSalaMedicacao,350);
        setTimeout(verificarAutoSalaMedicacao,900);
        autoSalaMonitor=setInterval(verificarAutoSalaMedicacao,500);
        window.OM30AutoSalaMedicacao={
            verificar:verificarAutoSalaMedicacao,
            parar(){if(autoSalaMonitor)clearInterval(autoSalaMonitor);},
            status(){const g=guicheMedicacaoAtual(),s=salaMedicacaoNaLista(g),at=localMedicacaoStore(g);return {guiche:!!g,sala:s||null,localSelecionado:g?.localSelecionado??null,localValorSelecionado:g?.localValorSelecionado??null,localStore:at||null,vinculoCorreto:!!(g&&s&&g.localSelecionado===true&&String(at?.id||'')===String(s.id))};}
        };

        // ── PRESERVAR/FORÇAR LOCAL — Exames, Raio-X e Enfermagem ────────────
        // Um único monitor atende os três setores. Com uma única opção, vincula
        // automaticamente; com várias, preserva a última escolha válida da categoria.
        (function autoLocalOutrasSalas(){
            const TIPOS=new Set(['controle_de_salas_exames','controle_de_salas_raio_x','controle_de_salas_procedimento_enfermagem']);
            const estados=new Map(); let emCurso=false, ultimoTipo='';
            const sleep=ms=>new Promise(r=>setTimeout(r,ms));
            const estado=tipo=>{if(!estados.has(tipo))estados.set(tipo,{pausado:false,viuSem:false});return estados.get(tipo);};
            const chave=(g,t)=>`om30_controle_salas_local_${t}_${String(g?.categoriaId||'sem_categoria')}`;
            const locais=g=>(Array.isArray(g?.locaisAtendimento)?g.locaisAtendimento:[]).filter((x,i,a)=>x?.id&&a.findIndex(y=>String(y?.id)===String(x.id))===i);
            const storeLocal=(g,t)=>{try{return g?.$store?.getters?.localAtendimentoAtual?.[t]||{};}catch(_){return {};}};
            const achar=t=>autoSalaVMs().find(vm=>vm?.tipoParametrizacao===t&&typeof vm?.redirectFilaAtendimento==='function'&&typeof vm?.getCategoriaAtendimento==='function'&&autoSalaVisivel(vm?.$el))||null;
            const lerPref=(g,t)=>{try{return JSON.parse(localStorage.getItem(chave(g,t))||'null');}catch(_){return null;}};
            const salvarPref=(g,t,l)=>{if(!l?.id)return;try{localStorage.setItem(chave(g,t),JSON.stringify({id:String(l.id),nome:String(l.nome||''),em:Date.now()}));}catch(_){}};
            const atualValido=(g,t)=>{if(g?.localSelecionado!==true)return null;const id=String(storeLocal(g,t)?.id||'');return locais(g).find(x=>String(x.id)===id)||null;};
            async function carregar(g){if(locais(g).length)return locais(g);const r=g.getCategoriaAtendimento();if(r?.then)await r;for(let i=0;i<20&&!locais(g).length;i++)await sleep(120);return locais(g);}
            async function vincular(g,t,l){if(!l?.id||!autoSalaVisivel(g?.$el))return false;g.localValorSelecionado=l;if(typeof g.$nextTick==='function')await new Promise(r=>g.$nextTick(r));const r=g.redirectFilaAtendimento();if(r?.then)await r;await sleep(220);const ok=String(atualValido(g,t)?.id||'')===String(l.id);if(ok)salvarPref(g,t,l);return ok;}
            document.addEventListener('click',ev=>{if(!ev.isTrusted)return;const el=ev.target?.closest?.('button,a,[role="button"]')||ev.target;const txt=normalizarAutoSala(el?.textContent||'');if(!txt.includes('SAIR DO LOCAL')&&!txt.includes('SAIR DA SALA'))return;const t=String(setorDaColecao(CS.colecao)?.key||'');const mapa={exames:'controle_de_salas_exames',raio_x:'controle_de_salas_raio_x',enfermagem:'controle_de_salas_procedimento_enfermagem'};if(mapa[t]){const st=estado(mapa[t]);st.pausado=true;st.viuSem=false;}},true);
            async function verificar(){
                if(emCurso||location.pathname!=='/aplicacoes_medicamentos')return;
                const key=setorDaColecao(CS.colecao)?.key||'';
                const mapa={exames:'controle_de_salas_exames',raio_x:'controle_de_salas_raio_x',enfermagem:'controle_de_salas_procedimento_enfermagem'};
                const tipo=mapa[key]||'';
                if(ultimoTipo&&tipo!==ultimoTipo&&TIPOS.has(ultimoTipo)){const st=estado(ultimoTipo);st.pausado=false;st.viuSem=false;}
                ultimoTipo=tipo;if(!TIPOS.has(tipo))return;
                const g=achar(tipo);if(!g)return;emCurso=true;
                try{
                    await carregar(g);const lista=locais(g), atual=atualValido(g,tipo), st=estado(tipo);
                    if(st.pausado){if(!atual){st.viuSem=true;return;}if(!st.viuSem)return;st.pausado=false;st.viuSem=false;salvarPref(g,tipo,atual);return;}
                    if(atual){salvarPref(g,tipo,atual);return;}
                    const pref=lerPref(g,tipo);const salvo=pref?.id?lista.find(x=>String(x.id)===String(pref.id)):null;const alvo=salvo||(lista.length===1?lista[0]:null);
                    if(alvo)await vincular(g,tipo,alvo);
                }catch(e){console.warn('[OM30 AUTO LOCAL]',tipo,e);}finally{emCurso=false;}
            }
            setTimeout(verificar,700);const monitor=setInterval(verificar,650);window.OM30AutoLocalOutrasSalas={verificar,parar(){clearInterval(monitor);}};
        })();

        function ajustarColunas(vm) {
            const campos = (vm.tableFields || []).slice();
            if (campos.some(c => c.key === 'cs_espera' || c.key === 'cs_med' || c.key === 'cs_detalhes')) return;
            const setor = setorDaColecao(vm);
            if (!setor) return;
            const med = setor.key === 'medicacao' && MOSTRAR_MEDICACOES;
            const novos = [];
            for (const c of campos) {
                // v2.0.80: Senha e Status ficam em colunas distintas. O aviso azul
                // pertence à coluna STATUS; por isso ele não fica espremido embaixo da senha.
                if (c.key === 'senha') {
                    novos.push(Object.assign({}, c, {
                        label: 'Senha',
                        class: String(c.class || '') + ' cs-col-senha',
                    }));
                    continue;
                }
                if (c.key === 'status') {
                    novos.push(Object.assign({}, c, {
                        label: 'Status',
                        class: String(c.class || '') + ' cs-col-status',
                        formatter: (v) => v === 'Em Andamento' ? 'Em atendimento' : v,
                    }));
                    continue;
                }
                if (c.key === 'actions') {
                    novos.push(Object.assign({}, c, { class: String(c.class || '') + ' cs-col-acoes' }));
                    continue;
                }
                if (c.key === 'data_encaminhamento') {
                    novos.push(Object.assign({}, c, {
                        label: 'Chegada / espera',
                        class: String(c.class || '') + ' cs-chegada',
                        formatter: (v, k, item) => [`${String(v || '')} ${item.hora_encaminhamento || ''}`.trim(), 'Espera', item.cs_espera].filter(Boolean).join('\n'),
                    }));
                } else if (c.key === 'hora_encaminhamento') {
                    continue;
                } else if (c.key === 'sala') {
                    novos.push(med
                        ? { key: 'cs_med', label: 'Medicação', class: 'col-md-3 col-lg-3 text-left cs-col-med' }
                        : { key: 'cs_detalhes', label: setor.nome, class: 'col-md-3 col-lg-3 text-left cs-col-med' });
                } else if (/risco/i.test(String(c.key || ''))) {
                    novos.push(Object.assign({}, c, { class: String(c.class || '') + ' cs-col-risco' }));
                } else if (c.key === 'profissional_responsavel') {
                    novos.push(Object.assign({}, c, { class: String(c.class || '').replace(/col-(md|lg)-2/g, 'col-$1-1') }));
                } else {
                    novos.push(c);
                }
            }
            vm.tableFields = novos;
            if (vm.$el && vm.$el.classList) vm.$el.classList.toggle('cs-com-med', true);
        }


        // ── Detalhes seguros das outras salas ────────────────────────────────
        // Só usa a página de CONSULTA /{id}. Nunca abre /edit em segundo plano.
        const DET = { cache:new Map(), fila:[], emVoo:new Set(), ativos:0, CONCORRENCIA:3, VALIDADE_MS:5*60e3 };

        function idGenerico(it, setor) {
            const bruto = String(it && it.encaminhamento_id || '');
            if (setor && setor.prefix && bruto.startsWith(setor.prefix)) return (bruto.match(/#(\d+)/) || [])[1] || '';
            return (bruto.match(/#(\d+)/) || bruto.match(/(\d+)/) || [])[1] || '';
        }

        function extrairDetalhesShow(html) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
            const limpar = x => String(x || '').replace(/\s+/g,' ').trim();
            for (const table of doc.querySelectorAll('table')) {
                const headers = [...table.querySelectorAll('thead th, tr:first-child th')].map(th => norm(th.textContent));
                if (!headers.includes('SITUACAO')) continue;
                if (headers.includes('PROFISSIONAL') || headers.includes('ESPECIALIDADE')) continue;
                const itens=[];
                for (const tr of table.querySelectorAll('tbody tr, tr')) {
                    const cells=[...tr.querySelectorAll(':scope > td')].map(td=>limpar(td.textContent));
                    if (cells.length < 2) continue;
                    const descricao=cells[0], situacao=cells[cells.length-1];
                    if (!descricao || /^(DESCRICAO|PROCEDIMENTO|EXAME|RADIOGRAFIA)$/.test(norm(descricao))) continue;
                    itens.push({ descricao, situacao });
                }
                if (itens.length) return itens.slice(0,12);
            }
            return [];
        }

        async function buscarDetalhesSetor(setor, id) {
            const chave=`${setor.key}:${id}`;
            const c=DET.cache.get(chave);
            if (c && Date.now()-c.em < DET.VALIDADE_MS) return c.itens;
            const r=await fetch(`${setor.endpoint}/${encodeURIComponent(id)}`, {credentials:'same-origin',cache:'no-store',headers:{Accept:'text/html,application/xhtml+xml'}});
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const itens=extrairDetalhesShow(await r.text());
            DET.cache.set(chave,{em:Date.now(),itens});
            return itens;
        }

        function pedirDetalhesSetor(vm, lista) {
            const setor=setorDaColecao(vm);
            if (!setor || setor.key === 'medicacao') return;
            const agora=Date.now();
            for (const it of lista) {
                if (it.status !== 'Em Espera' && it.status !== 'Em Andamento' && !CS.historico) continue;
                const id=idGenerico(it,setor); if(!id) continue;
                const chave=`${setor.key}:${id}`, c=DET.cache.get(chave);
                if (DET.emVoo.has(chave) || (c && agora-c.em < DET.VALIDADE_MS)) continue;
                DET.emVoo.add(chave); DET.fila.push({setor,id,chave});
            }
            while (DET.ativos < DET.CONCORRENCIA && DET.fila.length) {
                const t=DET.fila.shift(); DET.ativos++;
                buscarDetalhesSetor(t.setor,t.id).catch(err=>DET.cache.set(t.chave,{em:Date.now(),itens:[],erro:String(err&&err.message||err)}))
                    .finally(()=>{DET.ativos--;DET.emVoo.delete(t.chave);pintarMedicacoes();pedirDetalhesSetor(vm,[]);});
            }
        }

        function htmlDetalhesSetor(it,setor) {
            const id=idGenerico(it,setor), c=DET.cache.get(`${setor.key}:${id}`);
            if (!c) return '<span class="cs-med-nada">carregando…</span>';
            if (c.erro) return '<span class="cs-med-nada">detalhe indisponível</span>';
            if (!c.itens || !c.itens.length) return '<span class="cs-med-nada">sem detalhe</span>';
            return c.itens.map(x=>`<div class="cs-med"><span class="cs-med-prod">${esc(x.descricao)}</span>${x.situacao && !/PENDENTE/i.test(x.situacao)?` <span class="cs-med-sit">${esc(x.situacao)}</span>`:''}</div>`).join('');
        }

        function htmlCancelarSetor(it,setor){
            if(CS.historico || (it.status!=='Em Espera'&&it.status!=='Em Andamento')) return '';
            const id=idGenerico(it,setor); if(!id)return '';
            return `<button type="button" class="cs-cancelar-linha" data-cs-cancelar-setor="${esc(id)}" data-cs-setor="${esc(setor.key)}">✕ Cancelar</button>`;
        }
        function escolhaCancelamentoSetor(setor){
            return new Promise(resolve=>{
                const fundo=document.createElement('div'); fundo.className='cs-editor cs-cancelar-modal';
                const op = setor.key === 'exames'
                    ? ['Exame realizado manualmente.','Paciente deixou a unidade antes da realização do exame.','Paciente recusou a realização do exame.','Outro motivo']
                    : setor.key === 'raio_x'
                    ? ['Raio-X realizado manualmente.','Paciente deixou a unidade antes da realização do Raio-X.','Paciente recusou a realização do Raio-X.','Outro motivo']
                    : ['Procedimento realizado manualmente.','Paciente deixou a unidade antes da realização do procedimento.','Paciente recusou a realização do procedimento.','Outro motivo'];
                fundo.innerHTML=`<div><div class="cs-cancel-title">Cancelar ${esc(setor.item)}</div><div class="cs-cancel-sub">Selecione o motivo. O cancelamento será gravado diretamente, sem precisar abrir e salvar a ficha manualmente.</div><div class="cs-cm-rotulo">Motivo</div><div class="cs-cm-motivos">${op.map((x,i)=>`<button type="button" data-m="${i}">${esc(x)}</button>`).join('')}</div><textarea class="cs-cm-motivo" placeholder="Justificativa do cancelamento"></textarea><div class="cs-acoes"><button type="button" data-a="voltar">Voltar</button><button type="button" data-a="ok" disabled>Cancelar</button></div></div>`;
                const ta=fundo.querySelector('textarea'), ok=fundo.querySelector('[data-a="ok"]');
                fundo.onclick=e=>{const b=e.target.closest('button');if(e.target===fundo||(b&&b.dataset.a==='voltar')){fundo.remove();resolve(null);return;}if(b&&b.dataset.m!=null){const i=+b.dataset.m,t=op[i];fundo.querySelectorAll('[data-m]').forEach(x=>x.dataset.on=x===b?'1':'0');ta.value=/^Outro motivo$/i.test(t)?'':t;ok.disabled=!ta.value.trim();if(/^Outro motivo$/i.test(t))ta.focus();}if(b&&b.dataset.a==='ok'&&!ok.disabled){const motivo=ta.value.trim();fundo.remove();resolve({motivo});}};
                ta.oninput=()=>{ok.disabled=!ta.value.trim();}; document.body.appendChild(fundo);
            });
        }
        async function cancelarSetorDireto(it,setor){
            const id=idGenerico(it,setor);if(!id)return;
            const escolha=await escolhaCancelamentoSetor(setor);if(!escolha)return;
            // /edit somente após este clique humano.
            const r=await fetch(`${setor.endpoint}/${encodeURIComponent(id)}/edit`,{credentials:'same-origin',cache:'no-store',headers:{Accept:'text/html,application/xhtml+xml','X-OM30-Intentional-Edit':'1'}});
            if(!r.ok)throw new Error(`HTTP ${r.status}`);const doc=new DOMParser().parseFromString(await r.text(),'text/html');
            const form=doc.querySelector(`form.${setor.formClass},form[id^="${setor.formPrefix}"]`);if(!form)throw new Error('Ficha não editável');
            const profissional=[...form.querySelectorAll('#current_profissional,input[name="current_profissional"]')].map(x=>String(x.value||'').trim()).find(Boolean)||'';if(!profissional)throw new Error('Profissional atual não encontrado');
            const blocos=[...form.querySelectorAll('.item-encaminhamento-controle-salas')];let qtd=0;const momento=new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
            for(const item of blocos){const feito=item.querySelector(`input[name$="[${setor.feito}]"],input[id$="_${setor.feito}"]`),cancel=item.querySelector('input[name$="[cancelado]"],input[id$="_cancelado"]');if(!cancel||/^(true|1)$/i.test(String(cancel.value))||/^(true|1)$/i.test(String(feito&&feito.value)))continue;const just=item.querySelector('input[name$="[justificativa_cancelamento]"],textarea[name$="[justificativa_cancelamento]"],input[id$="_justificativa_cancelamento"],textarea[id$="_justificativa_cancelamento"]'),at=item.querySelector('input[name$="[canceled_at]"],input[id$="_canceled_at"]'),prof=item.querySelector('input[name$="[profissional_cancelamento_id]"],input[id$="_profissional_cancelamento_id"]');if(!just||!at||!prof)throw new Error('Campos de cancelamento incompletos');cancel.value='true';if(feito)feito.value='false';just.value=escolha.motivo;at.value=momento;prof.value=profissional;qtd++;}
            if(!qtd)throw new Error('Nenhum item pendente');
            const fd=new FormData(form),body=new URLSearchParams();for(const [k,v] of fd.entries())if(typeof v==='string')body.append(k,v);if(!body.has('button'))body.append('button','');const headers={'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',Accept:'*/*;q=0.5, text/javascript, application/javascript, application/ecmascript, application/x-ecmascript','X-Requested-With':'XMLHttpRequest'};const csrf=document.querySelector('meta[name="csrf-token"]');if(csrf&&csrf.content)headers['X-CSRF-Token']=csrf.content;
            const sv=await fetch(form.getAttribute('action')||setor.endpoint,{method:(form.getAttribute('method')||'post').toUpperCase(),credentials:'same-origin',cache:'no-store',headers,body:body.toString()});const txt=await sv.text();if(!sv.ok)throw new Error(`Salvar HTTP ${sv.status}`);
            const m=txt.match(/concluirSenhaOpcional\(\s*["']([^"']+)["']\s*,\s*\{[\s\S]*?atendimento_id\s*:\s*(\d+)\s*,[\s\S]*?atendimento_type\s*:\s*["']([^"']+)["']/i);if(m&&typeof window.concluirSenhaOpcional==='function')await window.concluirSenhaOpcional(m[1],{atendimento_id:+m[2],atendimento_type:m[3]});
            DET.cache.delete(`${setor.key}:${id}`);const ap=atendimentoPres(it.atendimento_str);if(ap)presReq('/api/attendance/delete',{atendimento_id:ap.chave,sala:setor.api}).catch(()=>{});CS.ultimaAssinatura='';aviso(`${setor.nome}: cancelamento concluído.`);if(CS.colecao)carregar(CS.colecao,{silencioso:true});
        }
        function cliqueCancelarSetor(ev){const b=ev.target.closest('button[data-cs-cancelar-setor]');if(!b)return;ev.preventDefault();ev.stopPropagation();const vm=CS.colecao,setor=setorDaColecao(vm),it=(vm.items||[]).find(x=>idGenerico(x,setor)===b.dataset.csCancelarSetor);if(!setor||!it)return;b.disabled=true;cancelarSetorDireto(it,setor).catch(e=>swalSeguro({type:'error',title:'Cancelamento não concluído',html:esc(e&&e.message||e)})).finally(()=>{if(b.isConnected)b.disabled=false;});}
        // ── Medicações de cada paciente ───────────────────────────────────────
        // A lista não traz os medicamentos. Eles são lidos da
        // página de consulta /aplicacoes_medicamentos/{id}, baixada em segundo plano.
        // A tela de aplicação (/new) não é usada aqui: abrir ela põe o paciente
        // "Em Andamento".
        const MED = {
            cache: new Map(),        // id → { itens | erro, em }
            fila: [],
            emVoo: new Set(),
            ativos: 0,
            CONCORRENCIA: 3,
            VALIDADE_MS: 10 * 60e3,
            desligado: '',           // motivo, se a consulta deixou de ser segura
            municipe: new Map(),     // id do encaminhamento → id do munícipe ('' se a consulta não trouxe)
        };

        function idEncaminhamento(str) { return String(str || '').split('#')[1] || ''; }
        function precisaMed(it) {
            return it.status === 'Em Espera' || it.status === 'Em Andamento' || (CS.historico && it.status !== 'Em Outra Sala');
        }

        function pedirMedicacoes(vm, lista) {
            if (ehMedicacao(vm)) pedirFichas(lista);
            if (!MOSTRAR_MEDICACOES || MED.desligado || !ehMedicacao(vm)) return;
            const agora = Date.now();
            const enfileirar = it => {
                const id = idEncaminhamento(it.encaminhamento_id);
                if (!id || MED.emVoo.has(id)) return;
                const c = MED.cache.get(id);
                if (c && agora - c.em < (c.erro ? 60e3 : MED.VALIDADE_MS)) return;
                MED.emVoo.add(id);
                MED.fila.push({ id, it });
            };
            for (const it of lista) if (precisaMed(it)) { enfileirar(it); }
            bombearMedicacoes();
        }

        function bombearMedicacoes() {
            while (MED.ativos < MED.CONCORRENCIA && MED.fila.length) {
                const t = MED.fila.shift();
                MED.ativos++;
                buscarMedicacoes(t.id, t.it)
                    .then(itens => {
                        // Controlados/alto custo: guarda a classificação por produto e já busca o CPF/CNS.
                        const achados = N.classificarCpfCns(itens, MEDICAMENTOS_CPF_CNS);
                        MED.cache.set(t.id, { itens, em: Date.now(), cpfCns: new Map(achados.map(a => [a.produto, a])) });
                        if (achados.length) cpfCnsAutomatico(t.id, itens);
                    })
                    .catch(erro => {
                        MED.cache.set(t.id, { erro: String(erro && erro.message || erro), em: Date.now() });
                        console.warn('[Controle de Salas] medicações de', t.id, erro);
                    })
                    .finally(() => {
                        MED.ativos--;
                        MED.emVoo.delete(t.id);
                        pintarMedicacoes();
                        bombearMedicacoes();
                        bombearFichas();
                    });
            }
        }



        // ── Hora das aplicações no Histórico (HORARIO_HISTORICO) ───────────────
        // A consulta não traz a hora de quem foi atendido; a ficha de medicação (PDF de
        // impressão, só leitura) traz "Data:" de cada item. Finalizado não muda mais, então
        // o resultado fica guardado no navegador (os 300 mais recentes).
        const HORA_FICHA = { cache: new Map(), erros: new Map(), emVoo: new Set(), fila: [], ativos: 0, CONCORRENCIA: 2, carregado: false };
        function fichaCarregar() {
            if (HORA_FICHA.carregado) return;
            HORA_FICHA.carregado = true;
            const o = lerJSON('cs-horario-ficha', {});
            if (o && typeof o === 'object') for (const k of Object.keys(o)) if (o[k] && Array.isArray(o[k].itens)) HORA_FICHA.cache.set(k, o[k]);
        }
        function fichaGuardar() {
            const recentes = Array.from(HORA_FICHA.cache.entries()).sort((a, b) => (b[1].em || 0) - (a[1].em || 0)).slice(0, 300);
            HORA_FICHA.cache = new Map(recentes);
            gravarJSON('cs-horario-ficha', Object.fromEntries(recentes));
        }
        async function buscarFicha(id) {
            const r = await fetch(`/encaminhamentos_medicacoes/${encodeURIComponent(id)}/imprimir_ficha_medicacoes.pdf`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000) });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            if (!/pdf/i.test(r.headers.get('content-type') || '')) throw new Error('a ficha não veio em PDF');
            const itens = N.horariosFichaPdf(await N.lerTextoFichaPdf(await r.arrayBuffer()));
            if (!itens.length) throw new Error('horários não encontrados na ficha');
            return itens;
        }
        function pedirFichas(lista) {
            if (HORARIO_HISTORICO !== 'automatico' || !CS.historico) return;
            fichaCarregar();
            const agora = Date.now();
            for (const it of lista) {
                if (it.status !== 'Finalizado') continue;
                const id = idEncaminhamento(it.encaminhamento_id);
                if (!id || HORA_FICHA.emVoo.has(id) || HORA_FICHA.cache.has(id)) continue;
                const e = HORA_FICHA.erros.get(id);
                if (e && agora - e < 10 * 60e3) continue;
                HORA_FICHA.emVoo.add(id);
                HORA_FICHA.fila.push(id);
            }
            bombearFichas();
        }
        function bombearFichas() {
            // As consultas de medicação vão primeiro; a ficha só sai com a fila delas vazia.
            if (MED.fila.length) return;
            while (HORA_FICHA.ativos < HORA_FICHA.CONCORRENCIA && HORA_FICHA.fila.length) {
                const id = HORA_FICHA.fila.shift();
                HORA_FICHA.ativos++;
                buscarFicha(id)
                    .then(itens => { HORA_FICHA.cache.set(id, { em: Date.now(), itens }); HORA_FICHA.erros.delete(id); fichaGuardar(); })
                    .catch(erro => { HORA_FICHA.erros.set(id, Date.now()); console.warn('[Controle de Salas] ficha de medicação de', id, erro); })
                    .finally(() => { HORA_FICHA.ativos--; HORA_FICHA.emVoo.delete(id); pintarMedicacoes(); bombearFichas(); });
            }
        }
        // Hora da aplicação lida da ficha para um produto (nomes podem vir truncados num dos lados).
        function dataFichaDoProduto(id, produto) {
            const c = HORA_FICHA.cache.get(id);
            if (!c) return '';
            const p = N.semAcento(produto);
            const x = c.itens.find(i => { const q = N.semAcento(i.produto); return q && p && (q.startsWith(p) || p.startsWith(q)); });
            return x ? x.data : '';
        }
        // 'dd/mm/aaaa hh:mm:ss' → 'hh:mm' (+ ' de dd/mm' quando não é hoje).
        function horaCurtaBr(data) {
            const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/.exec(data || '');
            if (!m) return '';
            const h = new Date();
            const hoje = `${String(h.getDate()).padStart(2, '0')}/${String(h.getMonth() + 1).padStart(2, '0')}/${h.getFullYear()}`;
            return m[4] + (`${m[1]}/${m[2]}/${m[3]}` === hoje ? '' : ` de ${m[1]}/${m[2]}`);
        }
        const msBr = d => { const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(d || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime() : 0; };
        // Linha pequena da coluna do nome no Histórico da Medicação.
        function htmlHoraHistorico(it) {
            const id = idEncaminhamento(it.encaminhamento_id);
            const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(String(it.chamada_em || ''));
            const partes = [];
            if (m) partes.push('Chamado ' + horaCurtaBr(`${m[3]}/${m[2]}/${m[1]} ${m[4]}`));
            const datas = [];
            const c = MED.cache.get(id);
            if (c && c.itens) for (const i of c.itens) if (i.canceladoEm) datas.push(i.canceladoEm);
            const f = HORA_FICHA.cache.get(id);
            if (f) for (const i of f.itens) datas.push(i.data);
            const ult = datas.sort((a, b) => msBr(b) - msBr(a))[0];
            if (ult) partes.push('Encerrado ' + horaCurtaBr(ult));
            return partes.length ? `<div class="cs-hist-hora-txt">${esc(partes.join(' · '))}</div>` : '';
        }

        // ── ALERGIA — lógica REAL da v2.0.80 ───────────────────────────────
        // O fluxo abaixo replica a estratégia da v2.0.80:
        // 1) identifica o AtendimentoPa da própria linha;
        // 2) consulta o prontuário em paralelo com a ficha segura de medicamentos;
        // 3) cruza Acolhimento (campo estruturado) + Evolução (texto livre);
        // 4) alergia positiva sempre vence negativa; conflito só existe positivo x negativo;
        // 5) aproveita também alerta positivo explícito vindo do GET seguro
        //    /aplicacoes_medicamentos/{id}; ausência ali nunca vira "sem alergia";
        // 6) cache confirmado = 30 min; não informado = 30 s.
        const ALERGIA280_CFG = {
            cacheConfirmadaMs: 30 * 60 * 1000,
            cacheNaoInformadaMs: 30 * 1000,
        };

        function a280Limpar(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
        function a280Normalizar(v) {
            return a280Limpar(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        }
        function a280CortarNoProximoCampo(valor) {
            const original = a280Limpar(valor);
            if (!original) return '';
            const n = a280Normalizar(original);
            const re = /(?:\s*[·•|]\s*|\s+[—-]\s+)(?=(?:MEDICAC(?:AO|OES)(?:\s+EM\s+USO)?|MEDICAMENTOS?|PRODUTO|SITUACAO|POSOLOGIA|VIA\s+DE\s+ADMINISTRACAO|UNIDADE\s+DE\s+MEDIDA|OBSERVACAO|ACOLHIMENTO|ATENDIMENTO|DESCRITIVO\s+DO\s+ATENDIMENTO|EVOLUCAO|CONDUTA|EXAMES?|PROCEDIMENTOS?|RECEITUARIO|APLICAR|CANCELAR)\b)|\s+(?=(?:MEDICACAO\s+EM\s+USO|ACOLHIMENTO|ATENDIMENTO|DESCRITIVO\s+DO\s+ATENDIMENTO|EVOLUCAO|CONDUTA|EXAMES?|PROCEDIMENTOS?|RECEITUARIO)\b)/;
            const m = re.exec(n);
            return m && m.index > 0 ? original.slice(0, m.index).trim() : original;
        }
        function a280LimparAlergia(valor) {
            let v = a280Limpar(valor)
                .replace(/^ALERTA!?\s*/i, '')
                .replace(/^PACIENTE\s+POSSUI\s+/i, '')
                .replace(/^ALERGIAS?\s*[:\-]?\s*/i, '')
                .replace(/^ALERGICO\s+A\s*[:\-]?\s*/i, '')
                .trim();
            if (a280EhNegativo(v)) return '';
            v = a280CortarNoProximoCampo(v);
            const n = a280Normalizar(v);
            if (!v || /^(NAO|NAO POSSUI|NENHUMA|SEM ALERGIA|NAO INFORMADO|NAO INFORMADA|NEGA|NEGADO|\-)$/.test(n)) return '';
            return v;
        }
        function a280EhGenerico(valor) {
            return /^(?:MEDICACAO|MEDICACOES|MEDICAMENTO|MEDICAMENTOS|DROGA|DROGAS)$/.test(a280Normalizar(valor));
        }
        function a280CapturarAlergiaDoTexto(valor) {
            const texto = a280Limpar(valor);
            if (!texto || !/ALERG/i.test(a280Normalizar(texto))) return '';
            const padroes = [
                /ALERTA!?\s*PACIENTE\s+POSSUI\s+ALERGIAS?\s*[:\-]\s*(.+)/i,
                /PACIENTE\s+POSSUI\s+ALERGIAS?\s*[:\-]\s*(.+)/i,
                /ALERGIAS?\s*[:\-]\s*(.+)/i,
            ];
            for (const re of padroes) {
                const m = texto.match(re);
                if (!m) continue;
                const bruto = a280Limpar(m[1]);
                if (a280EhNegativo(bruto)) continue;
                const v = a280LimparAlergia(bruto);
                if (v && !a280EhGenerico(v)) return v.slice(0, 500);
            }
            return '';
        }
        function a280HtmlParaTextoSeguro(html) {
            if (!html) return '';
            try {
                const preparado = String(html)
                    .replace(/<br\s*\/?>/gi, ' ')
                    .replace(/<\/(?:div|p|li|tr|td|th|h[1-6]|section|article|header|footer|label|span)>/gi, ' ');
                const d = new DOMParser().parseFromString(preparado, 'text/html');
                return a280Limpar(d.documentElement?.textContent || '');
            } catch (_) {
                return a280Limpar(String(html).replace(/<[^>]*>/g, ' '));
            }
        }
        function a280ExtrairAlergiaDaFicha(doc, htmlBruto = '') {
            const fontes = [
                doc?.body?.textContent || '',
                doc?.documentElement?.textContent || '',
                a280HtmlParaTextoSeguro(htmlBruto),
            ];
            for (const fonte of fontes) {
                const v = a280CapturarAlergiaDoTexto(fonte);
                if (v) return v;
            }
            const seletores = [
                '.alert', '.alert-danger', '.alert-warning', '[class*="alert"]',
                '[class*="alerg"]', '[id*="alerg"]', '[name*="alerg"]',
            ];
            for (const el of doc?.querySelectorAll?.(seletores.join(',')) || []) {
                for (const valor of [
                    el.textContent,
                    el.getAttribute?.('title'),
                    el.getAttribute?.('aria-label'),
                    el.getAttribute?.('data-content'),
                    el.getAttribute?.('data-original-title'),
                    el.getAttribute?.('value'),
                ]) {
                    const v = a280CapturarAlergiaDoTexto(valor);
                    if (v) return v;
                }
            }
            const candidatos = [];
            for (const tr of doc?.querySelectorAll?.('tr') || []) {
                const celulas = [...tr.querySelectorAll('th,td')];
                if (celulas.length < 2) continue;
                if (!/ALERG/i.test(a280Normalizar(celulas[0].textContent))) continue;
                candidatos.push(a280Limpar(celulas.map(x => x.textContent).join(' ')));
            }
            for (const dt of doc?.querySelectorAll?.('dt') || []) {
                if (!/ALERG/i.test(a280Normalizar(dt.textContent))) continue;
                candidatos.push(a280Limpar(`${dt.textContent || ''} ${dt.nextElementSibling?.textContent || ''}`));
            }
            for (const label of doc?.querySelectorAll?.('label, .control-label, .form-label, strong, b') || []) {
                if (!/ALERG/i.test(a280Normalizar(label.textContent))) continue;
                const bloco = label.closest('.form-group,.row,.card,.panel,li,div') || label.parentElement;
                if (bloco) candidatos.push(a280Limpar(bloco.textContent));
            }
            for (const c of candidatos) {
                const v = a280CapturarAlergiaDoTexto(c);
                if (v) return v;
            }
            return '';
        }
        function a280FraseNegaAlergia(valor) {
            const n = a280Normalizar(valor);
            if (!n) return false;
            // Exemplos reais do prontuário:
            // "NEGA ALERGIAS A MEDICAÇÕES", "NG ALERGIAS A MEDICAÇÕES",
            // "SEM ALERGIAS MEDICAMENTOSAS", "NÃO POSSUI ALERGIAS".
            if (/^(?:NENHUMA|NENHUMA ALERGIA|NENHUMA ALERGIA MEDICAMENTOSA|NEGADO|NEGATIVO)$/.test(n)) return true;
            const m = n.match(/^(?:NG|NGA|NEGA|NEGOU|SEM|NAO POSSUI|NAO TEM|NAO REFERE|NAO RELATA)\s+ALERGIAS?(?:\s+MEDICAMENTOSAS?)?(?:\s+(?:A|AO|AOS|AS)\s+(?:MEDICACAO|MEDICACOES|MEDICAMENTO|MEDICAMENTOS|DROGA|DROGAS))?/);
            if (!m) return false;
            const resto = n.slice(m[0].length).trim();
            return !resto || /^(?:[·•|—-]|(?:(?:MEDICACAO|MEDICACOES|MEDICAMENTO|MEDICAMENTOS|ACOLHIMENTO|ATENDIMENTO|DESCRITIVO|EVOLUCAO|CONDUTA|EXAMES?|PROCEDIMENTOS?|RECEITUARIO)\b))/.test(resto);
        }
        function a280EhNegativo(valor) {
            const n = a280Normalizar(valor);
            // Negação clínica explícita vence qualquer sufixo truncado/colado.
            // Ex.: "NEGA ALERGIAS MEDICAÇOE...", "NG ALERGIAS A MEDICAÇÕES".
            if (/^(?:NG|NGA|NEGA|NEGOU|SEM|NAO POSSUI|NAO TEM|NAO REFERE|NAO RELATA)\s+ALERGIAS?\b/.test(n)) return true;
            return /^(NAO|NAO POSSUI|NENHUMA|NENHUMA ALERGIA|NEGADO|NEGATIVO)$/.test(n)
                || a280FraseNegaAlergia(valor);
        }
        function a280EhNaoInformado(valor) {
            const n = a280Normalizar(valor);
            return !n || /^(—|-|NAO INFORMADO|NAO INFORMADA|NAO PREENCHIDO|SEM INFORMACAO)$/.test(n);
        }
        function a280LimparTermoEvolucao(valor) {
            let v = a280Limpar(valor).replace(/^[\s:;,.\-]+|[\s:;,.\-]+$/g, '');
            v = a280CortarNoProximoCampo(v);
            v = v.split(/\s+(?=CID\b|CIDS\b|DIAGNOSTICO\b|CONDUTA\b|CONDUTAS\b|EXAMES?\b|MEDICAMENTOS?\b|PROCEDIMENTOS?\b|RECEITUARIO\b|function\b|const\b|let\b|var\b)/i)[0].trim();
            return v.slice(0, 160);
        }
        function a280ExtrairEstruturada(doc) {
            for (const strong of doc?.querySelectorAll?.('strong,b,label') || []) {
                if (a280Normalizar(strong.textContent) !== 'ALERGIAS') continue;
                const bloco = strong.closest('.grid_8,.grid_16,td,li,.row') || strong.parentElement?.closest?.('.grid_8,.grid_16,td,li,.row') || strong.parentElement;
                if (!bloco) continue;
                const valores = [...bloco.querySelectorAll('li')].map(el => a280Limpar(el.textContent)).filter(Boolean).filter(v => a280Normalizar(v) !== 'ALERGIAS');
                let valor = valores[0] || '';
                if (!valor) valor = a280Limpar(strong.nextElementSibling?.textContent || '');
                if (a280EhNaoInformado(valor)) return { localizado: true, valor: '', negativa: false, naoInformada: true };
                if (a280EhNegativo(valor)) return { localizado: true, valor: '', negativa: true, naoInformada: false };
                valor = a280CortarNoProximoCampo(valor);
                if (a280EhNegativo(valor)) return { localizado: true, valor: '', negativa: true, naoInformada: false };
                const limpa = a280LimparAlergia(valor);
                if (!limpa || a280EhGenerico(limpa)) return { localizado: true, valor: '', negativa: false, naoInformada: true };
                return { localizado: true, valor: limpa, negativa: false, naoInformada: false };
            }
            return { localizado: false, valor: '', negativa: false, naoInformada: false };
        }
        function a280ExtrairEvolucao(doc) {
            const candidatos = [];
            const adicionar = (texto, fonte) => {
                const t = a280Limpar(texto);
                if (!t || !/ALERG/i.test(a280Normalizar(t)) || t.length < 5 || t.length > 700) return;
                if (candidatos.some(x => a280Normalizar(x.texto) === a280Normalizar(t))) return;
                candidatos.push({ texto: t, fonte });
            };
            for (const el of doc?.querySelectorAll?.('textarea[id*="motivo_descricao"],textarea[name*="motivo_descricao"],input[id*="motivo_descricao"],input[name*="motivo_descricao"]') || []) adicionar(el.value || el.textContent, 'motivo_descricao');
            for (const el of doc?.querySelectorAll?.('li,p,span,td,div') || []) adicionar(el.textContent, 'bloco-clinico');
            candidatos.sort((a, b) => a.texto.length - b.texto.length);
            const positivos = [
                /\bALERGIA(?:S)?\s+A\s+([^.;,\n<]{2,180})/i,
                /\bAL[EÉ]RGIC[OA]\s+A\s+([^.;,\n<]{2,180})/i,
                /\bREFERE\s+ALERGIA(?:S)?\s+A\s+([^.;,\n<]{2,180})/i,
                /\bRELATA\s+ALERGIA(?:S)?\s+A\s+([^.;,\n<]{2,180})/i,
                /\bPOSSUI\s+ALERGIA(?:S)?\s+A\s+([^.;,\n<]{2,180})/i,
            ];
            for (const candidato of candidatos) {
                const n = a280Normalizar(candidato.texto);
                // Negativa explícita precisa vencer ANTES da regex "ALERGIAS A X".
                // Sem isso, "NEGA ALERGIAS A MEDICAÇÕES" vira falso positivo "MEDICAÇÕES".
                if (
                    a280FraseNegaAlergia(candidato.texto) ||
                    /\b(?:NG|NGA|NEGA|NEGOU|SEM|NAO POSSUI|NAO TEM|NAO REFERE|NAO RELATA)\s+ALERGIAS?\b/.test(n)
                ) {
                    return { positiva: '', negativa: true, trecho: candidato.texto, fonte: candidato.fonte };
                }
                for (const re of positivos) {
                    const m = candidato.texto.match(re);
                    const valor = a280LimparTermoEvolucao(m?.[1] || '');
                    const nv = a280Normalizar(valor);
                    const generico = a280EhGenerico(valor);
                    if (valor && !generico && !a280EhNegativo(valor) && !a280EhNaoInformado(valor)) {
                        return { positiva: valor, negativa: false, trecho: candidato.texto, fonte: candidato.fonte };
                    }
                }
            }
            return { positiva: '', negativa: false, trecho: '', fonte: '' };
        }
        function a280UnirPositivas(valores) {
            const saida = [], vistos = new Set();
            for (const bruto of valores.map(a280Limpar).filter(Boolean)) {
                for (const valor of bruto.split(/\s*·\s*/).map(a280Limpar).filter(Boolean)) {
                    const n = a280Normalizar(valor);
                    if (!n || vistos.has(n)) continue;
                    vistos.add(n); saida.push(valor);
                }
            }
            return saida.join(' · ');
        }
        // Sinais vitais do acolhimento: tabela "Aferição | Sigla | Procedimento" do prontuário.
        function extrairSinaisVitais(doc) {
            const sem = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
            const MAPA = { PA: ['PA', ''], TEMP: ['Tax', '°C'], FC: ['FC', ''], FR: ['FR', ''], GLI: ['Glic', ''], SAT: ['Sat', '%'], PESO: ['Peso', 'kg'] };
            for (const tabela of doc.querySelectorAll('table')) {
                const cab = [...tabela.querySelectorAll('th')].map(th => sem(th.textContent));
                const iVal = cab.findIndex(h => h.includes('AFERICAO'));
                const iSig = cab.findIndex(h => h === 'SIGLA');
                if (iVal < 0 || iSig < 0) continue;
                const saida = [];
                for (const tr of tabela.querySelectorAll('tbody tr')) {
                    const tds = tr.querySelectorAll('td');
                    let valor = String(tds[iVal]?.textContent || '').replace(/\s+/g, ' ').trim();
                    const siglaCrua = String(tds[iSig]?.textContent || '').replace(/\s+/g, ' ').trim();
                    if (!valor || /^[—–-]+$/.test(valor) || !siglaCrua) continue;
                    const base = sem(siglaCrua.replace(/\(.*?\)/g, '')).split(' ')[0].replace(/[^A-Z0-9]/g, '');
                    if (base === 'ALTURA') continue;
                    const m = MAPA[base];
                    if (m && base === 'PA') valor = valor.toLowerCase();
                    saida.push({ rotulo: m ? m[0] : siglaCrua.replace(/\s*\(.*?\)\s*/g, ' ').trim(), valor: valor + (m ? m[1] : '') });
                }
                return saida;
            }
            return [];
        }
        function a280InterpretarProntuario(doc) {
            const estruturada = a280ExtrairEstruturada(doc);
            const evolucao = a280ExtrairEvolucao(doc);
            const alergiaAcolhimento = a280Limpar(estruturada.valor || '');
            const alergiaAtendimento = a280Limpar(evolucao.positiva || '');
            const acolhimentoNegativo = estruturada.negativa === true;
            const atendimentoNegativo = evolucao.negativa === true;
            const alergia = a280UnirPositivas([alergiaAcolhimento, alergiaAtendimento]);
            const negativaExplicita = Boolean(acolhimentoNegativo || atendimentoNegativo);
            const conflito = Boolean((alergiaAcolhimento && atendimentoNegativo) || (alergiaAtendimento && acolhimentoNegativo));
            let fonteAlergia = '';
            if ((alergiaAcolhimento || acolhimentoNegativo) && (alergiaAtendimento || atendimentoNegativo)) fonteAlergia = 'Acolhimento / Atendimento';
            else if (alergiaAtendimento || atendimentoNegativo) fonteAlergia = 'Atendimento';
            else if (alergiaAcolhimento || acolhimentoNegativo) fonteAlergia = 'Acolhimento';
            return {
                alergia,
                alergiaVerificada: Boolean(alergia || negativaExplicita),
                fonteAlergia,
                conflitoAlergia: conflito,
                alergiaEstruturada: alergiaAcolhimento,
                alergiaEstruturadaNegativa: acolhimentoNegativo,
                alergiaEvolucao: alergiaAtendimento,
                alergiaEvolucaoNegativa: atendimentoNegativo,
                trechoAlergiaEvolucao: evolucao.trecho || '',
            };
        }
        function a280CacheReutilizavel(atual, atendimentoId) {
            const raw = atual?._v280 || atual;
            if (!raw || !atendimentoId) return false;
            if (String(raw.alergiaAtendimentoId || '') !== String(atendimentoId)) return false;
            const ts = Number(raw.alergiaTimestamp || atual?.em || 0);
            if (!ts) return false;
            const limite = raw.alergiaVerificada === true ? ALERGIA280_CFG.cacheConfirmadaMs : ALERGIA280_CFG.cacheNaoInformadaMs;
            return Date.now() - ts < limite;
        }
        async function a280BuscarNoProntuario(atendimentoId, atendimentoType = 'AtendimentoPa') {
            const id = String(atendimentoId || '').replace(/\D/g, '');
            const tipo = a280Limpar(atendimentoType || 'AtendimentoPa');
            if (!id || a280Normalizar(tipo) !== 'ATENDIMENTOPA') return null;
            const r = await fetch(`/prontuarios/new?prontuariavel_id=${encodeURIComponent(id)}&prontuariavel_type=AtendimentoPa`, {
                method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'follow', headers: { Accept: 'text/html,application/xhtml+xml' },
                signal: AbortSignal.timeout(20000),
            });
            if (!r.ok) throw new Error(`PRONTUARIO_HTTP_${r.status}`);
            const html = await r.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            return {
                ...a280InterpretarProntuario(doc),
                alergiaTimestamp: Date.now(),
                alergiaAtendimentoId: id,
                prontuarioId: r.url.match(/\/prontuarios\/(\d+)/i)?.[1] || '',
                alergiaConsultaFeita: true,
                sinaisVitais: extrairSinaisVitais(doc),
            };
        }
        function a280ParaAtual(raw, extra = {}) {
            const r = raw || {};
            const alergia = a280Limpar(r.alergia || '');
            const alergias = alergia ? alergia.split(/\s*·\s*/).map(a280Limpar).filter(Boolean) : [];
            const fontes = a280Limpar(r.fonteAlergia || '').split(/\s*\/\s*|\s*\+\s*/).map(a280Limpar).filter(Boolean);
            return {
                estado: alergias.length ? 'positiva' : r.alergiaVerificada === true ? 'negativa' : 'desconhecida',
                alergias,
                conflito: r.conflitoAlergia === true,
                fontes,
                em: Number(r.alergiaTimestamp || Date.now()),
                _v280: r,
                ...extra,
            };
        }
        async function consultarAlergiaProntuario(pa) {
            const raw = await a280BuscarNoProntuario(pa, 'AtendimentoPa');
            return a280ParaAtual(raw);
        }

        async function buscarMedicacoes(id, itContexto = null) {
            const caminhoConsulta = `/aplicacoes_medicamentos/${encodeURIComponent(id)}`;
            const pa = itContexto ? atendimentoPa(itContexto) : '';
            const cacheEnc = ALERG.porEncDados.get(String(id));
            const cachePa = pa ? ALERG.cache.get(String(pa)) : null;

            // Igual à 2.0.80: prontuário e medicamentos em paralelo.
            let promessaAlergia = Promise.resolve(null);
            // No Histórico a alergia não aparece: não baixa o prontuário (2ª página pesada por linha).
            if (pa && !CS.historico) {
                const aproveitavel = a280CacheReutilizavel(cacheEnc, pa) ? cacheEnc : (a280CacheReutilizavel(cachePa, pa) ? cachePa : null);
                if (aproveitavel) promessaAlergia = Promise.resolve(aproveitavel._v280 || null);
                else promessaAlergia = a280BuscarNoProntuario(pa, 'AtendimentoPa').catch(erro => {
                    console.warn('[OM30 ALERGIA 2.0.80] Falha lendo prontuário', pa, erro?.message || erro);
                    return cacheEnc?._v280 || cachePa?._v280 || null;
                });
            }

            const r = await fetch(caminhoConsulta, {
                credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'text/html' },
                signal: AbortSignal.timeout(20000),
            });
            if (r.redirected || new URL(r.url, location.href).pathname.replace(/\/+$/, '') !== caminhoConsulta) {
                MED.desligado = `a consulta de medicações foi redirecionada para ${new URL(r.url, location.href).pathname}`;
                MED.fila.length = 0;
                console.error('[Controle de Salas]', MED.desligado, '— leitura de medicações desligada');
                atualizarBarra();
                throw new Error(MED.desligado);
            }
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const htmlConsulta = await r.text();
            const doc = new DOMParser().parseFromString(htmlConsulta, 'text/html');
            const itens = N.extrairMedicacoesConsulta(doc);
            if (!itens) throw new Error('tabela de medicamentos não encontrada na consulta');
            MED.municipe.set(id, N.municipeIdConsulta(doc));

            const alergiaProntuario = await promessaAlergia;
            const alergiaShow = a280ExtrairAlergiaDaFicha(doc, htmlConsulta);
            let raw = alergiaProntuario || {
                alergia: '', alergiaVerificada: false, fonteAlergia: '', conflitoAlergia: false,
                alergiaEstruturada: '', alergiaEstruturadaNegativa: false,
                alergiaEvolucao: '', alergiaEvolucaoNegativa: false, trechoAlergiaEvolucao: '',
                alergiaTimestamp: 0, alergiaAtendimentoId: pa, prontuarioId: '', alergiaConsultaFeita: false,
            };
            if (alergiaShow) {
                raw = {
                    ...raw,
                    alergia: a280UnirPositivas([raw.alergia, alergiaShow]),
                    alergiaVerificada: true,
                    fonteAlergia: raw.fonteAlergia ? `${raw.fonteAlergia} + ficha-show` : 'ficha-show',
                    alergiaTimestamp: raw.alergiaTimestamp || Date.now(),
                    alergiaAtendimentoId: raw.alergiaAtendimentoId || pa,
                };
            }
            const atual = a280ParaAtual(raw, { fonteConsultaMedicacao: true });
            ALERG.porEncDados.set(String(id), atual);
            if (pa) {
                ALERG.porEnc.set(String(id), String(pa));
                ALERG.cache.set(String(pa), atual);
            }
            return itens;
        }

        function htmlMedicacoes(it) {
            if (!precisaMed(it)) return '';
            return htmlListaMedicacoes(it);
        }

        // No histórico: o que este computador registrou ao cancelar pelo botão.
        function htmlRegistro(it) {
            const r = registro().find(x => x.enc === it.encaminhamento_id);
            if (!r) return '';
            const quando = new Date(r.em);
            const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const dia = N.isoDia(quando) === N.isoDia(new Date()) ? '' : ` de ${quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
            return `<div class="cs-hist-nota" title="Registrado neste computador ao cancelar pela lista">Cancelado aqui às ${hora}${dia}: ${esc(r.motivo)}${r.reavaliar ? ' · enviado para reavaliação médica' : ''}</div>`;
        }

        // Situação do item; no Histórico acrescenta a hora (cancelamento da consulta, aplicação da ficha).
        function htmlSituacaoMed(it, id, m) {
            let rotulo = `${m.estado === 'feito' ? '✓ ' : ''}${esc(m.situacao || 'não pendente')}`, dica = '';
            if (m.estado === 'cancelado' && m.canceladoEm) {
                rotulo = `✕ ${esc(m.situacao || 'CANCELADO')} ${esc(horaCurtaBr(m.canceladoEm))}`;
                dica = `Cancelado em ${m.canceladoEm}${m.canceladoPor ? ' por ' + m.canceladoPor : ''}${m.justificativa ? ' · Motivo: ' + m.justificativa : ''}`;
            } else if (m.estado === 'feito' && CS.historico) {
                const d = dataFichaDoProduto(id, m.produto);
                if (d) { rotulo = `✓ ${esc(m.situacao || 'ATENDIDA')} ${esc(horaCurtaBr(d))}`; dica = `Registrado em ${d} (ficha de medicação)`; }
            }
            return ` <span class="cs-med-sit"${dica ? ` title="${esc(dica)}"` : ''}>${rotulo}</span>`;
        }

        function htmlListaMedicacoes(it) {
            const id = idEncaminhamento(it.encaminhamento_id);
            const c = MED.cache.get(id);
            if (CANC.emCurso.has(id)) return '<span class="cs-med-nada">cancelando…</span>';
            if (c && c.itens) {
                if (!c.itens.length) return '<span class="cs-med-nada">sem itens</span>';
                // Pendentes primeiro; aplicados/cancelados aparecem riscados com a situação.
                const ordem = { pendente: 0, feito: 1, cancelado: 2 };
                return c.itens.slice().sort((a, b) => ordem[a.estado] - ordem[b.estado])
                    .map(m => `<div class="cs-med cs-med-${m.estado}"${m.observacao ? ` title="Obs.: ${esc(m.observacao)}"` : ''}>`
                    + `<span class="cs-via cs-via-${m.via.classe}" title="${esc(m.via.nome)}">${esc(m.via.sigla)}</span>`
                    + `<span class="cs-med-prod">${esc(m.produto)}</span>`

                    + (m.posologia ? ` <span class="cs-med-pos">${esc(m.posologia)}</span>` : '')
                    + (m.observacao ? ' <span class="cs-med-obs">obs.</span>' : '')
                    + (m.estado !== 'pendente' ? htmlSituacaoMed(it, id, m) : '')
                    + '</div>').join('');
            }
            if (c && c.erro) {
                const r = CS.historico && registro().find(x => x.enc === it.encaminhamento_id);
                if (r && r.itens && r.itens.length) {
                    return r.itens.map(m => `<div class="cs-med cs-med-cancelado"><span class="cs-via cs-via-${esc(m.classe)}">${esc(m.sigla)}</span><span class="cs-med-prod">${esc(m.produto)}</span>${m.posologia ? ` <span class="cs-med-pos">${esc(m.posologia)}</span>` : ''}</div>`).join('');
                }
                return `<span class="cs-med-nada" title="${esc(c.erro)}">não consegui consultar</span>`;
            }
            if (MED.desligado) return '';
            if (MED.emVoo.has(id)) return '<span class="cs-med-nada">carregando…</span>';
            return '';
        }

        // Botão de cancelar da coluna Ação: só com item pendente conhecido.
        // No histórico a coluna Ação mostra o motivo registrado neste computador.
        function htmlCancelar(it) {
            if (CS.historico) return htmlRegistro(it);
            if (!precisaMed(it)) return '';
            const id = idEncaminhamento(it.encaminhamento_id);
            if (CANC.emCurso.has(id)) return '<button type="button" class="cs-cancelar-linha" disabled>Cancelando…</button>';
            const c = MED.cache.get(id);
            const pendentes = c && c.itens ? c.itens.filter(m => m.estado === 'pendente').length : 0;
            if (!pendentes || (it.status !== 'Em Espera' && it.status !== 'Em Andamento')) return '';
            return `<button type="button" class="cs-cancelar-linha" data-cs-cancelar="${esc(id)}" title="Cancelar ${pendentes > 1 ? `as ${pendentes} medicações pendentes` : 'a medicação pendente'} com um motivo">✕ Cancelar</button>`;
        }

        // As células das colunas Medicação e Ação são do Vue; o conteúdo extra vai
        // numa caixa própria, reescrita só quando muda (a linha pode passar a ser de
        // outro paciente).
        // Exibe idade abaixo da data de nascimento.
        function idadeTexto(texto) {
            const t = String(texto || '');
            const br = /(\d{2})\/(\d{2})\/(\d{4})/.exec(t), iso = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
            if (!br && !iso) return '';
            const nasc = br ? new Date(+br[3], +br[2] - 1, +br[1]) : new Date(+iso[1], +iso[2] - 1, +iso[3]);
            const hoje = new Date();
            if (isNaN(nasc) || nasc > hoje) return '';
            let anos = hoje.getFullYear() - nasc.getFullYear();
            let meses = hoje.getMonth() - nasc.getMonth();
            if (hoje.getDate() < nasc.getDate()) meses--;
            if (meses < 0) { anos--; meses += 12; }
            if (anos >= 1) return anos === 1 ? '1 ano' : `${anos} anos`;
            const totalMeses = anos * 12 + meses;
            if (totalMeses >= 1) return totalMeses === 1 ? '1 mês' : `${totalMeses} meses`;
            const dias = Math.floor((hoje - nasc) / 864e5);
            return dias === 1 ? '1 dia' : `${dias} dias`;
        }
        function caixa(td, classe, aoClicar) {
            let box = td.querySelector(`:scope > .${classe}`);
            if (!box) {
                box = document.createElement('div');
                box.className = classe;
                if (aoClicar) box.addEventListener('click', aoClicar);
                td.appendChild(box);
            }
            return box;
        }
        function trocarHtml(box, html) {
            if (box.__csHtml === html) return;
            box.innerHTML = html;
            box.__csHtml = html;
        }
        function cliqueCancelar(ev) {
            const b = ev.target.closest('button[data-cs-cancelar]');
            if (!b) return;
            ev.preventDefault();
            ev.stopPropagation();
            cancelarDaLinha(b.dataset.csCancelar);
        }

        const CHAVE_CHAMADOS_CONFIRMAR = 'cs-chamados-confirmar-v1';
        function lerChamadosConfirmar(){
            try{return new Set(JSON.parse(sessionStorage.getItem(CHAVE_CHAMADOS_CONFIRMAR)||'[]').map(String));}catch(_){return new Set();}
        }
        function salvarChamadosConfirmar(set){
            try{sessionStorage.setItem(CHAVE_CHAMADOS_CONFIRMAR,JSON.stringify([...set].slice(-200)));}catch(_){}
        }
        function chaveConfirmarItem(it){
            return String(idEncaminhamento(it?.encaminhamento_id)||it?.encaminhamento_str||it?.atendimento_str||'');
        }
        function marcarPacienteChamado(chave){
            chave=String(chave||''); if(!chave)return;
            const set=lerChamadosConfirmar();set.add(chave);salvarChamadosConfirmar(set);
        }
        function pacienteFoiChamado(chave){return !!chave && lerChamadosConfirmar().has(String(chave));}
        function sincronizarConfirmarLinha(tr,it){
            if(!tr)return;
            const chave=chaveConfirmarItem(it);tr.dataset.csConfirmarChave=chave;
            const confirmar=tr.querySelector('.botao-atender');if(!confirmar)return;
            const liberar=pacienteFoiChamado(chave);
            confirmar.classList.toggle('cs-confirmar-bloqueado',!liberar);
            confirmar.setAttribute('aria-disabled',liberar?'false':'true');
            confirmar.title=liberar?'Atender':'Clique em Chamar antes de atender';
        }
        document.addEventListener('click',ev=>{
            const chamar=ev.target?.closest?.('.cs-fila .botao-chamar');
            if(chamar){
                const tr=chamar.closest('tr');const chave=tr?.dataset?.csConfirmarChave||'';
                if(chave){marcarPacienteChamado(chave);setTimeout(()=>{const b=tr?.querySelector('.botao-atender');if(b){b.classList.remove('cs-confirmar-bloqueado');b.setAttribute('aria-disabled','false');b.title='Atender';}},120);}
                return;
            }
            const confirmar=ev.target?.closest?.('.cs-fila .botao-atender.cs-confirmar-bloqueado');
            if(confirmar){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();}
        },true);

        function pintarMedicacoes() {
            const vm = CS.colecao;
            if (!vm || !vm.$el) return;
            const setor = setorDaColecao(vm);
            if (!setor) return;
            const campos = vm.tableFields || [];
            const colDet = campos.findIndex(f => f.key === (setor.key === 'medicacao' ? 'cs_med' : 'cs_detalhes'));
            const colAcao = campos.findIndex(f => f.key === 'actions');
            const colNome = campos.findIndex(f => f.key === 'nome_municipe');
            const colChegada = campos.findIndex(f => f.key === 'data_encaminhamento');
            const colStatus = campos.findIndex(f => f.key === 'status');
            const colRisco = campos.findIndex(f => /risco/i.test(String(f.key || '')));
            const colNasc = campos.findIndex(f => /nasc/i.test(String(f.key || '')));
            if (colDet < 0) return;
            const linhas = vm.$el.querySelectorAll('tbody > tr');
            (vm.items || []).forEach((it, i) => {
                const tr = linhas[i]; if (!tr) return;

                if (colChegada >= 0 && tr.children[colChegada] && !CS.historico) {
                    const tdChegada = tr.children[colChegada];
                    const hChegada = `<div class="cs-chegada-bloco"><div class="cs-chegada-data">${esc(`${it.data_encaminhamento || ''} ${it.hora_encaminhamento || ''}`.trim())}</div><div class="om30-tempo-espera"><div class="om30-espera-topo"><span class="om30-espera-relogio" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg></span><span class="om30-espera-label">Espera</span></div><strong>${esc(it.cs_espera || '—')}</strong></div></div>`;
                    if (tdChegada.__csChegadaHtml !== hChegada) {
                        tdChegada.innerHTML = hChegada;
                        tdChegada.__csChegadaHtml = hChegada;
                    }
                }

                if (colStatus >= 0 && tr.children[colStatus]) {
                    const tdStatus = tr.children[colStatus];
                    const emAtendimento = it.status === 'Em Andamento';
                    tr.classList.toggle('om30-em-atendimento', emAtendimento);
                    tdStatus.classList.toggle('om30-status-cell-atendimento', emAtendimento);

                    let aviso = tdStatus.querySelector(':scope > .om30-ficha-aberta');
                    // Limpa a tentativa anterior, que criava um card próprio dentro de Senha/status.
                    tdStatus.querySelector(':scope > .cs-status-atendimento')?.remove();

                    if (emAtendimento) {
                        if (!aviso) {
                            aviso = document.createElement('span');
                            aviso.className = 'om30-ficha-aberta';
                            aviso.title = 'Paciente em atendimento nesta sala';
                            aviso.innerHTML = '<span class="om30-atendimento-ponto"></span><span class="om30-atendimento-texto"><strong>EM ATENDIMENTO</strong><small>ATENDIMENTO EM CURSO</small></span>';
                            tdStatus.appendChild(aviso);
                        }
                    } else {
                        aviso?.remove();
                    }
                }

                if (colRisco >= 0 && tr.children[colRisco]) {
                    const tdRisco = tr.children[colRisco];
                    const nomeRisco = String(it.grau_risco || '').trim().toUpperCase();
                    const chaveRisco = ({ VERMELHO:'vermelho', LARANJA:'laranja', AMARELO:'amarelo', VERDE:'verde', AZUL:'azul' })[nomeRisco] || 'sem';
                    trocarHtml(caixa(tdRisco, 'cs-risco-box'), `<span class="cs-risco-pill cs-rp-${chaveRisco}">${esc(nomeRisco || 'SEM RISCO')}</span>`);
                    tdRisco.classList.add('cs-risco-ok');
                    trocarHtml(caixa(tdRisco, 'cs-vitais-box'), CS.historico ? '' : htmlSinaisVitais(it, tr));
                }
                if (colNasc >= 0 && tr.children[colNasc]) {
                    const tdNasc = tr.children[colNasc];
                    const campoNasc = campos[colNasc].key;
                    const textoNasc = `${it[campoNasc] || ''} ${tdNasc.firstChild?.textContent || ''}`;
                    trocarHtml(caixa(tdNasc, 'cs-idade-box'), esc(idadeTexto(textoNasc)));
                }

                if (tr.children[colDet]) trocarHtml(caixa(tr.children[colDet], setor.key === 'medicacao' ? 'cs-med-box' : 'cs-det-box'),
                    setor.key === 'medicacao' ? htmlMedicacoes(it) : htmlDetalhesSetor(it,setor));
                if (setor.key === 'medicacao') {
                    if (colAcao >= 0 && tr.children[colAcao]) trocarHtml(caixa(tr.children[colAcao], 'cs-acao-extra', cliqueCancelar), htmlCancelar(it));
                } else if (colAcao >= 0 && tr.children[colAcao]) {
                    trocarHtml(caixa(tr.children[colAcao], 'cs-acao-extra', cliqueCancelarSetor), htmlCancelarSetor(it,setor));
                }
                if (colNome >= 0 && tr.children[colNome]) {
                    destacarNome(tr.children[colNome], it);
                    if (!CS.historico) pedirAlergia(it, tr);
                    trocarHtml(caixa(tr.children[colNome], 'cs-alerg-box'), CS.historico ? '' : htmlAlergia(it, tr));
                    if (setor.key === 'medicacao') trocarHtml(caixa(tr.children[colNome], 'cs-hist-hora'), CS.historico ? htmlHoraHistorico(it) : '');
                    trocarHtml(caixa(tr.children[colNome], 'cs-doc-box', cliqueDocumentos), htmlDocumentos(it));
                }
                aplicarPresencaNaLinha(tr, it, setor, campos);
                sincronizarConfirmarLinha(tr,it);
            });
            alinharCartoesDoc(vm.$el);
        }

        // ── Alergia (MOSTRAR_ALERGIA) ─────────────────────────────────────────
        // Usa somente GET seguro do prontuário. O AtendimentoPa vem primeiro do item da
        // coleção e, quando essa informação não estiver serializada ali, do Vue nativo
        // dos botões Chamar/Confirmar da própria linha.
        const ALERG = { cache: new Map(), fila: [], ativos: 0, porEnc: new Map(), porEncDados: new Map() };

        // Resolução de AtendimentoPa preservada da v2.0.80: não depende apenas
        // dos campos serializados do item; procura também o componente Vue real
        // dos botões Chamar/Confirmar e percorre pais + filhos da árvore.
        function a280SubirVms(vm) {
            const lista=[]; const vistos=new Set(); let atual=vm;
            while(atual && !vistos.has(atual)){vistos.add(atual);lista.push(atual);atual=atual.$parent;}
            return lista;
        }
        function a280ColetarArvoreVue(raiz, limite=300) {
            const out=[]; const fila=[raiz]; const vistos=new Set();
            while(fila.length && out.length<limite){
                const vm=fila.shift(); if(!vm||vistos.has(vm))continue;
                vistos.add(vm);out.push(vm);if(Array.isArray(vm.$children))fila.push(...vm.$children);
            }
            return out;
        }
        function a280AcharVmAcao(el, propriedades=[]) {
            if(!el)return null;
            const candidatos=[]; const vistos=new Set(); let node=el;
            const avaliar=vm=>{
                if(!vm||vistos.has(vm))return; vistos.add(vm);
                const atende=propriedades.every(prop=>{
                    const valor=vm?.[prop] ?? vm?.$props?.[prop];
                    return valor!==undefined && valor!==null && String(valor).trim()!=='';
                });
                if(!atende)return;
                let score=0;
                const nome=a280Normalizar(vm.$options?.name||'');
                if(propriedades.includes('encaminhamentoStr')&&nome.includes('BOTAO-INICIAR-ATENDIMENTO'))score+=50;
                if(propriedades.includes('atendimentoStr')&&nome.includes('BOTAO-CHAMAR-PACIENTE'))score+=35;
                if(nome.includes('BOTAO-INICIAR-ATENDIMENTO'))score+=20;
                try{const vmEl=vm.$el;if(vmEl===el)score+=100;else if(vmEl?.contains?.(el))score+=60;else if(el.contains?.(vmEl))score+=30;}catch(_){ }
                candidatos.push({vm,score});
            };
            for(let i=0;node&&i<10;i++,node=node.parentElement){
                const base=node.__vue__; if(!base)continue;
                for(const raiz of a280SubirVms(base)){
                    avaliar(raiz);
                    for(const vm of a280ColetarArvoreVue(raiz,300))avaliar(vm);
                }
            }
            candidatos.sort((a,b)=>b.score-a.score);
            return candidatos[0]?.vm||null;
        }
        function atendimentoPa(it, tr) {
            // 1) dados já serializados pelo backend
            const campos=[it?.atendimento_str,it?.atendimentoStr,it?.atendimento];
            for(const bruto of campos){const m=String(bruto||'').trim().match(/^AtendimentoPa#(\d+)$/i);if(m)return m[1];}
            const tipo=String(it?.atendimento_type||it?.atendimentoType||'');
            const id=String(it?.atendimento_id||it?.atendimentoId||'').replace(/\D/g,'');
            if(id&&/^AtendimentoPa$/i.test(tipo))return id;

            // 2) mesma estratégia profunda da v2.0.80 nos componentes nativos
            if(tr){
                const elChamar=tr.querySelector('.botao-chamar');
                const elAtender=tr.querySelector('.botao-atender');
                const vmChamar=a280AcharVmAcao(elChamar,['atendimentoStr']);
                const vmAtender=a280AcharVmAcao(elAtender,['atendimentoStr','encaminhamentoStr']) || a280AcharVmAcao(elAtender,['atendimentoStr']);
                const bruto=String(vmChamar?.atendimentoStr||vmChamar?.$props?.atendimentoStr||vmAtender?.atendimentoStr||vmAtender?.$props?.atendimentoStr||'').trim();
                const m=bruto.match(/^AtendimentoPa#(\d+)$/i); if(m)return m[1];
            }

            // 3) cache já associado ao encaminhamento
            const enc=idEncaminhamento(it?.encaminhamento_id);
            return enc ? (ALERG.porEnc.get(enc)||'') : '';
        }

        function pedirAlergia(it, tr) {
            if(!MOSTRAR_ALERGIA || (it.status!=='Em Espera'&&it.status!=='Em Andamento')) return;
            const enc=idEncaminhamento(it.encaminhamento_id);
            const direto=enc&&ALERG.porEncDados.get(enc);
            const pa=atendimentoPa(it,tr);

            // A ficha segura pode confirmar uma alergia positiva mesmo sem AtendimentoPa.
            // Já um "não informado" nunca bloqueia uma consulta clínica posterior quando
            // o AtendimentoPa aparece — é a mesma regra da 2.0.80.
            if(direto?.estado==='positiva' && Date.now()-Number(direto.em||0) < ALERGIA280_CFG.cacheConfirmadaMs) return;
            if(pa && direto && a280CacheReutilizavel(direto,pa)) return;
            if(!pa)return;
            if(enc)ALERG.porEnc.set(enc,pa);

            // Se a consulta integrada medicamentos + prontuário já está em voo, não duplica.
            if(enc && MED.emVoo.has(enc)) return;
            const c=ALERG.cache.get(pa);
            if((c&&a280CacheReutilizavel(c,pa))||ALERG.fila.includes(pa))return;
            ALERG.fila.push(pa); bombearAlergias();
        }

        function bombearAlergias() {
            while(ALERG.ativos<2&&ALERG.fila.length){
                const pa=ALERG.fila.shift(); ALERG.ativos++;
                consultarAlergiaProntuario(pa)
                    .then(info=>ALERG.cache.set(pa,Object.assign(info||{estado:'desconhecida',alergias:[]},{em:Date.now()})))
                    .catch(erro=>{console.warn('[OM30 ALERGIA] prontuário',pa,erro);ALERG.cache.set(pa,{estado:'desconhecida',alergias:[],erro:String(erro&&erro.message||erro),em:Date.now()});})
                    .finally(()=>{ALERG.ativos--;pintarMedicacoes();bombearAlergias();});
            }
        }

        // Nome do munícipe em negrito com a faixa da cor do risco (classe no span do próprio Vue).
        function destacarNome(td, it) {
            const span = td.querySelector('.nome-municipe-column');
            if (!span) return;
            const r = String(it.grau_risco || '').trim().toUpperCase();
            const chave = ({ VERMELHO:'vermelho', LARANJA:'laranja', AMARELO:'amarelo', VERDE:'verde', AZUL:'azul' })[r] || 'sem';
            span.classList.add('cs-nome-txt');
            for (const c of [...span.classList]) if (c.startsWith('cs-nr-') && c !== `cs-nr-${chave}`) span.classList.remove(c);
            span.classList.add(`cs-nr-${chave}`);
        }

        function htmlSinaisVitais(it, tr) {
            const enc=idEncaminhamento(it.encaminhamento_id);
            const direto=enc&&ALERG.porEncDados.get(enc);
            const pa=atendimentoPa(it,tr);
            const clinico=pa&&ALERG.cache.get(pa);
            const raw=(clinico||direto)?._v280;
            const sv=raw?.sinaisVitais;
            if(!Array.isArray(sv)) return '';
            if(sv.length) return `<div class="cs-vitais" title="Sinais vitais do acolhimento (prontuário)">${sv.map(x=>`<span${x.rotulo==='PA'?' class="cs-sv-pa"':''}><b>${esc(x.rotulo)}</b> ${esc(x.valor)}</span>`).join('')}</div>`;
            return raw.alergiaConsultaFeita===true?'<div class="cs-vitais cs-vitais-vazio">SV não aferidos</div>':'';
        }

        function htmlAlergia(it, tr) {
            if(!MOSTRAR_ALERGIA)return '';
            const enc=idEncaminhamento(it.encaminhamento_id);
            const direto=enc&&ALERG.porEncDados.get(enc);
            const pa=atendimentoPa(it,tr);
            const clinico=pa&&ALERG.cache.get(pa);
            // Regra da v2.0.80: positivo explícito da ficha segura tem prioridade;
            // fora disso, a leitura clínica do AtendimentoPa vence um cache antigo.
            const c=(direto?.estado==='positiva' ? direto : (clinico || direto));

            if(!c){
                if(!pa){
                    return '<div class="om30-med-alergia-nao-verificada" title="AtendimentoPa ainda não identificado e nenhuma alergia positiva veio na ficha segura">Alergia: Não informado</div>';
                }
                return '<div class="om30-med-alergia-nao-verificada">Alergia: consultando…</div>';
            }

            const raw=c._v280||{};
            const alergia=a280Limpar(raw.alergia || (c.alergias||[]).join(' · '));
            const alergiaVerificada=raw.alergiaVerificada===true || c.estado==='negativa' || c.estado==='positiva';
            const fonteAlergia=a280Limpar(raw.fonteAlergia || (c.fontes||[]).join(' / '));
            const conflitoAlergia=raw.conflitoAlergia===true || c.conflito===true;
            const alergiaAcolhimento=a280Limpar(raw.alergiaEstruturada||'');
            const acolhimentoNegativo=raw.alergiaEstruturadaNegativa===true;
            const alergiaAtendimento=a280Limpar(raw.alergiaEvolucao||'');
            const atendimentoNegativo=raw.alergiaEvolucaoNegativa===true;
            const positivosDiferentes=Boolean(
                alergiaAcolhimento && alergiaAtendimento &&
                a280Normalizar(alergiaAcolhimento)!==a280Normalizar(alergiaAtendimento)
            );

            const linhaFonte=(rotulo,valor,negativa=false)=>{
                if(!valor&&!negativa)return '';
                return `<span class="om30-med-alergia-detalhe"><b>${esc(rotulo)}: </b>${esc(negativa?'NEGA ALERGIA':valor)}</span>`;
            };

            if(alergia){
                let html=`<div class="om30-med-alergia"><span>⚠ ALERGIA: ${esc(alergia)}</span>`;
                if(conflitoAlergia||positivosDiferentes){
                    html+=linhaFonte('Acolhimento',alergiaAcolhimento,acolhimentoNegativo);
                    html+=linhaFonte('Atendimento',alergiaAtendimento,atendimentoNegativo);
                    if(conflitoAlergia){
                        html+='<span class="om30-med-alergia-conflito">⚠ Divergência entre acolhimento e atendimento</span>';
                    }
                }else if(fonteAlergia){
                    html+=`<span class="om30-med-alergia-fonte">${esc(fonteAlergia)}</span>`;
                }
                html+='</div>';
                return html;
            }

            if(alergiaVerificada){
                const fontesNegativas=[];
                if(acolhimentoNegativo)fontesNegativas.push('Acolhimento');
                if(atendimentoNegativo)fontesNegativas.push('Atendimento');
                const fonteNegativa=fontesNegativas.join(' / ')||fonteAlergia;
                return `<div class="om30-med-sem-alergia">NEGA ALERGIA${fonteNegativa?`<span class="om30-med-alergia-fonte">${esc(fonteNegativa)}</span>`:''}</div>`;
            }

            return `<div class="om30-med-alergia-nao-verificada" title="${esc(c.erro||'Alergia não informada nas fontes consultadas')}">Alergia: Não informado</div>`;
        }

        // ── CPF e CNS do paciente (medicação de alto custo) ──────────────────
        // Busca só quando alguém clica, pela mesma busca de munícipes da tela de
        // prontuário (/municipes/search_padronizado_com_mudanca.json), que não precisa
        // de token do v3 nem abre janela. O id do munícipe, quando a página de consulta
        // traz, confirma o cadastro; sem ele só vale nome + nascimento com um único
        // resultado. Os dados ficam só na memória desta aba.
        const DOC = new Map(); // id do encaminhamento → { estado: 'carregando'|'ok'|'ambiguo'|'erro', cpf, cns, por, n, erro }

        async function buscarMunicipes(q) {
            const r = await fetch(`/municipes/search_padronizado_com_mudanca.json?q=${encodeURIComponent(q)}`, {
                credentials: 'same-origin', cache: 'no-store',
                headers: { Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' },
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const dados = await r.json();
            return Array.isArray(dados) ? dados : [];
        }

        async function buscarDocumentos(it) {
            const id = idEncaminhamento(it.encaminhamento_id);
            const setorAtual = setorDaColecao(CS.colecao);
            if (setorAtual?.key === 'medicacao' && !MED.municipe.has(id) && !MED.desligado) await buscarMedicacoes(id).catch(() => null);
            const alvo = { municipeId: setorAtual?.key === 'medicacao' ? (MED.municipe.get(id) || '') : '', nome: it.nome_municipe || '', nascimento: it.data_nascimento_municipe || '' };
            let e = N.escolherMunicipe(await buscarMunicipes(`${alvo.nome} ${alvo.nascimento}`.trim()), alvo);
            // A busca com a data pode não achar (índice antigo, nome social): tenta só o nome.
            if (!e.municipe && !(e.candidatos && e.candidatos.length > 1)) e = N.escolherMunicipe(await buscarMunicipes(alvo.nome), alvo);
            if (!e.municipe) {
                const n = (e.candidatos || []).length;
                return n > 1 ? { estado: 'ambiguo', n } : { estado: 'erro', erro: 'cadastro não encontrado na busca de munícipes' };
            }
            return { estado: 'ok', cpf: N.formatarCPF(e.municipe.cpf_numero), cns: N.formatarCNS(e.municipe.codigo_cns), por: e.por };
        }

        // Só para quem ainda vai ser medicado (em espera/andamento) e tem item pendente
        // controlado/alto custo; um de cada vez para não encher o servidor.
        const AUTO = { fila: [], rodando: false };
        function cpfCnsAutomatico(id, itens) {
            const it = itemPorId(id);
            if (!it || (it.status !== 'Em Espera' && it.status !== 'Em Andamento') || DOC.has(id) || AUTO.fila.includes(id)) return;
            if (!N.classificarCpfCns(itens.filter(m => m.estado === 'pendente'), MEDICAMENTOS_CPF_CNS).length) return;
            AUTO.fila.push(id);
            if (AUTO.rodando) return;
            AUTO.rodando = true;
            (async () => {
                while (AUTO.fila.length) {
                    const proximo = AUTO.fila.shift();
                    if (!DOC.has(proximo)) await mostrarDocumentos(proximo);
                }
                AUTO.rodando = false;
            })();
        }

        async function mostrarDocumentos(id) {
            const it = itemPorId(id);
            if (!it || (DOC.get(id) || {}).estado === 'carregando') return;
            DOC.set(id, { estado: 'carregando' });
            pintarMedicacoes();
            try {
                DOC.set(id, await buscarDocumentos(it));
            } catch (erro) {
                console.warn('[Controle de Salas] CPF/CNS de', id, erro);
                DOC.set(id, { estado: 'erro', erro: String((erro && erro.message) || erro) });
            }
            pintarMedicacoes();
        }

        function csIconeDados() {
            return `<span class="cs-doc-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="8.5" cy="10.5" r="2"/><path d="M5.8 15.5c.55-1.55 1.55-2.4 2.7-2.4s2.15.85 2.7 2.4M13.5 9.5h4.5M13.5 13h4.5M13.5 16.5h3"/></svg></span>`;
        }
        function csIconeChevron() {
            return `<span class="cs-doc-chevron" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="m4 2.5 3.5 3.5L4 9.5"/></svg></span>`;
        }
        // Número da ficha do atendimento: o mesmo do Rastreamento de Senhas (coluna "Ficha").
        // Rápido: 1) lista guardada pela tela do Rastreamento neste PC; 2) cache próprio (F5 instantâneo);
        // 3) UMA varredura do rastreamento nativo (mais recentes primeiro, 3 páginas de 100 por vez) para a
        // fila toda, parando quando acha todos ou passa de 26 h. Só leitura.
        const FICHA = new Map(); // id do AtendimentoPa → { estado: 'carregando'|'ok'|'nao', ficha }
        const FICHA_CACHE = 'om30-cs:fichas:v1', FICHA_CACHE_MS = 30 * 3600e3;
        const FICHA_VAR = { pendentes: new Set(), rodando: false, timer: null };
        const atendimentoIdDoItem = it => (String(it?.atendimento_str || '').match(/(\d+)\s*$/) || [])[1] || '';
        const fichaValida = f => /^\d{5,}$/.test(String(f || ''));
        (function carregarFichasGuardadas() {
            try {
                const o = JSON.parse(localStorage.getItem(FICHA_CACHE) || '{}'), lim = Date.now() - FICHA_CACHE_MS;
                for (const [id, v] of Object.entries(o || {})) if (v && v.t > lim && fichaValida(v.f)) FICHA.set(id, { estado: 'ok', ficha: v.f });
            } catch (_) {}
            try {
                // Lista salva pelo script do Rastreamento de Senhas: [id, data, hora, nascimento, nome, ficha, senha, status]
                const r = JSON.parse(localStorage.getItem('om30-rastreamento-unidade:linhas-v1') || 'null');
                for (const l of (Array.isArray(r && r.linhas) ? r.linhas : [])) {
                    const id = String((l && l[0]) || ''), f = String((l && l[5]) || '');
                    if (/^\d+$/.test(id) && fichaValida(f) && !FICHA.has(id)) FICHA.set(id, { estado: 'ok', ficha: f });
                }
            } catch (_) {}
        })();
        function guardarFichas() {
            try {
                const o = JSON.parse(localStorage.getItem(FICHA_CACHE) || '{}') || {}, agora = Date.now(), lim = agora - FICHA_CACHE_MS;
                for (const k of Object.keys(o)) if (!(o[k] && o[k].t > lim)) delete o[k];
                for (const [id, v] of FICHA) if (v.estado === 'ok' && !o[id]) o[id] = { f: v.ficha, t: agora };
                localStorage.setItem(FICHA_CACHE, JSON.stringify(o));
            } catch (_) {}
        }
        const textoCelula = v => { const d = document.createElement('div'); d.innerHTML = String(v ?? ''); return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
        function instanteCelulas(data, hora) {
            const d = String(data || '').match(/(\d{2})\/(\d{2})\/(\d{4})/), h = String(hora || '').match(/(\d{1,2}):(\d{2})/);
            return d ? new Date(+d[3], +d[2] - 1, +d[1], h ? +h[1] : 0, h ? +h[2] : 0).getTime() : 0;
        }
        async function paginaRastreamento(inicio, quantidade = 100) {
            const q = new URLSearchParams({ sEcho: '1', iColumns: '8', sColumns: '', iDisplayStart: String(inicio), iDisplayLength: String(quantidade), sSearch: '', bRegex: 'false', iSortCol_0: '0', sSortDir_0: 'asc', iSortingCols: '1' });
            for (let i = 0; i < 8; i++) { q.set('mDataProp_' + i, String(i)); q.set('sSearch_' + i, ''); q.set('bRegex_' + i, 'false'); q.set('bSearchable_' + i, 'true'); q.set('bSortable_' + i, 'false'); }
            const r = await fetch('/filas/rastreamento_senhas.json?' + q, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const j = await r.json();
            return Array.isArray(j && j.aaData) ? j.aaData : [];
        }
        async function varrerFichas() {
            if (FICHA_VAR.rodando || !FICHA_VAR.pendentes.size) return;
            FICHA_VAR.rodando = true;
            const corte = Date.now() - 26 * 3600e3;
            try {
                // O sistema leva ~8-10 s por consulta, quase igual para 100 ou 1000 linhas: pede 1000 de uma vez.
                for (let p = 0; p < 3 && FICHA_VAR.pendentes.size; p++) {
                    const lote = [await paginaRastreamento(p * 1000, 1000).catch(() => null)];
                    let fimLista = false, achou = false;
                    for (const linhas of lote) {
                        if (!linhas) { fimLista = true; continue; }
                        if (linhas.length < 1000) fimLista = true;
                        for (const l of linhas) {
                            const id = (String((l && l[7]) ?? '').match(/atendimentos_pas\/(\d+)/) || [])[1];
                            const f = textoCelula(l[4]);
                            if (id && fichaValida(f) && (!FICHA.has(id) || FICHA.get(id).estado !== 'ok')) { FICHA.set(id, { estado: 'ok', ficha: f }); achou = true; }
                            if (id) FICHA_VAR.pendentes.delete(id);
                            const t = instanteCelulas(textoCelula(l[0]), textoCelula(l[1]));
                            if (t && t < corte) fimLista = true;
                        }
                    }
                    if (achou) { guardarFichas(); try { pintarMedicacoes(); } catch (_) {} }
                    if (fimLista) break;
                }
            } finally {
                for (const id of FICHA_VAR.pendentes) if (!FICHA.has(id) || FICHA.get(id).estado === 'carregando') FICHA.set(id, { estado: 'nao' });
                FICHA_VAR.pendentes.clear();
                FICHA_VAR.rodando = false;
                try { pintarMedicacoes(); } catch (_) {}
            }
        }
        // Aquece o cache: o rastreamento demora ~8-10 s para responder; lendo em segundo plano, quando o
        // paciente entra na fila a ficha já está guardada e aparece na hora.
        async function aquecerFichas() {
            if (FICHA_VAR.rodando || document.hidden || !naSalaRaioX()) return;
            try {
                let novas = false;
                for (const l of await paginaRastreamento(0, 300)) {
                    const id = (String((l && l[7]) ?? '').match(/atendimentos_pas\/(\d+)/) || [])[1], f = textoCelula(l[4]);
                    if (id && fichaValida(f) && (!FICHA.has(id) || FICHA.get(id).estado !== 'ok')) { FICHA.set(id, { estado: 'ok', ficha: f }); FICHA_VAR.pendentes.delete(id); novas = true; }
                }
                if (novas) { guardarFichas(); try { pintarMedicacoes(); } catch (_) {} }
            } catch (_) {}
        }
        setTimeout(aquecerFichas, 3000);
        setInterval(aquecerFichas, 120000);
        function htmlFicha(it) {
            const aid = atendimentoIdDoItem(it);
            if (!aid) return '<span class="cs-doc-nada">Ficha —</span>';
            let f = FICHA.get(aid);
            if (!f) {
                f = { estado: 'carregando' }; FICHA.set(aid, f); FICHA_VAR.pendentes.add(aid);
                clearTimeout(FICHA_VAR.timer); FICHA_VAR.timer = setTimeout(varrerFichas, 50);   // junta a fila toda numa varredura
            }
            if (f.estado === 'carregando') return '<span class="cs-doc-nada">Ficha …</span>';
            if (f.estado !== 'ok') return '<span class="cs-doc-nada" title="Senha não encontrada no Rastreamento de Senhas">Ficha —</span>';
            const curta = String(f.ficha).replace(/^0+(?=\d)/, '');
            return `<span class="cs-ficha" data-cs-copiar="${esc(f.ficha)}" data-cs-rotulo="Ficha" title="Ficha ${esc(f.ficha)} · clique para copiar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>Ficha <b>${esc(curta)}</b></span>`;
        }
        const naSalaRaioX = () => (setorDaColecao(CS.colecao) || {}).key === 'raio_x';
        // O cartão fica centrado numa coluna de largura quebrada e cairia em meio pixel, o que
        // descentraliza o texto dos rótulos CPF/CNS. Desloca cada cartão para o pixel inteiro.
        function alinharCartoesDoc(raiz) {
            const cartoes = raiz ? Array.from(raiz.querySelectorAll('.cs-doc-cartao')) : [];
            if (!cartoes.length) return;
            for (const c of cartoes) { c.style.left = ''; c.style.top = ''; }
            const dpr = window.devicePixelRatio || 1;
            const resto = v => (v * dpr - Math.round(v * dpr)) / dpr;
            const rets = cartoes.map(c => c.getBoundingClientRect());
            cartoes.forEach((c, i) => {
                const fx = resto(rets[i].left), fy = resto(rets[i].top);
                if (fx) c.style.left = `${-fx}px`;
                if (fy) c.style.top = `${-fy}px`;
            });
        }
        let csAlinharTimer = 0;
        window.addEventListener('resize', () => {
            clearTimeout(csAlinharTimer);
            csAlinharTimer = setTimeout(() => alinharCartoesDoc(document.querySelector('.cs-fila') || document.body), 150);
        });

        // CPF/CNS num cartão: rótulo escuro, número em destaque e cópia pelo ícone (vira ✓ ao copiar).
        const CS_ICONE_COPIAR = '<svg class="cs-doc-i-copiar" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V2.7a.9.9 0 0 0-.9-.9H2.7a.9.9 0 0 0-.9.9v6.9a.9.9 0 0 0 .9.9h2.8"/></svg><svg class="cs-doc-i-ok" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
        function htmlCartaoDoc(d) {
            const linha = (rotulo, valor) => valor
                ? `<div class="cs-doc-linha" data-cs-copiar="${esc(valor.replace(/\D/g, ''))}" data-cs-rotulo="${rotulo}" title="Clique para copiar o ${rotulo}"><span class="cs-doc-label-cel"><span class="cs-doc-label">${rotulo}</span></span><span class="cs-doc-valor">${esc(valor)}</span><span class="cs-doc-cp">${CS_ICONE_COPIAR}</span></div>`
                : `<div class="cs-doc-linha cs-doc-vazio"><span class="cs-doc-label-cel"><span class="cs-doc-label">${rotulo}</span></span><span class="cs-doc-valor">não cadastrado</span></div>`;
            return `<div class="cs-doc-cartao">${linha('CPF', d.cpf)}${linha('CNS', d.cns)}</div>`;
        }

        function htmlDocumentosOriginal(it) {
            const id = idEncaminhamento(it.encaminhamento_id);
            const d = DOC.get(id);
            if (!d) return `<button type="button" class="cs-doc-ver" data-cs-doc="${esc(id)}" title="Buscar CPF e CNS no cadastro do munícipe">${csIconeDados()}<span>Dados do Munícipe</span>${csIconeChevron()}</button>`;
            if (d.estado === 'carregando') return `<span class="cs-doc-nada">${csIconeDados()} buscando CPF/CNS…</span>`;
            if (d.estado === 'ambiguo') return `<span class="cs-doc-aviso" title="Há ${d.n} cadastros com este nome e nascimento; confira no cadastro do munícipe">${d.n} cadastros iguais — confira no cadastro</span>`;
            if (d.estado === 'erro') return `<span class="cs-doc-aviso" title="${esc(d.erro)}">CPF/CNS não encontrados</span> <button type="button" class="cs-doc-ver" data-cs-doc="${esc(id)}">${csIconeDados()}<span>tentar de novo</span></button>`;
            return htmlCartaoDoc(d);
        }

        function htmlDocumentos(it) {
            // Ficha só na sala de Raio-X; nas outras salas, o "Dados do Munícipe" de sempre.
            if (!naSalaRaioX()) return htmlDocumentosOriginal(it);
            // CPF/CNS só aparecem quando já foram buscados (automático para medicação controlada).
            const id = idEncaminhamento(it.encaminhamento_id);
            const d = DOC.get(id);
            let extra = '';
            if (d && d.estado === 'ok') {
                extra = htmlCartaoDoc(d);
            } else if (d && d.estado === 'carregando') extra = '<span class="cs-doc-nada">buscando CPF/CNS…</span>';
            else if (d && d.estado === 'ambiguo') extra = `<span class="cs-doc-aviso" title="Há ${d.n} cadastros com este nome e nascimento">${d.n} cadastros iguais</span>`;
            return htmlFicha(it) + extra;
        }

        function cliqueDocumentos(ev) {
            const ver = ev.target.closest('button[data-cs-doc]');
            const copiar = ev.target.closest('[data-cs-copiar]');
            if (!ver && !copiar) return;
            ev.preventDefault();
            ev.stopPropagation();
            if (ver) return mostrarDocumentos(ver.dataset.csDoc);
            const valor = copiar.dataset.csCopiar;
            const rotulo = copiar.dataset.csRotulo || (valor.length === 11 ? 'CPF' : 'CNS');
            const ok = () => {
                aviso(`${rotulo} copiado: ${valor}`);
                copiar.classList.add('cs-doc-ok');
                setTimeout(() => copiar.classList.remove('cs-doc-ok'), 1600);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(valor).then(ok, () => aviso('Não consegui copiar; selecione o número.'));
        }

        // ── Cancelar todas as medicações pela lista ───────────────────────────
        // Mesmo caminho de quem faz pela tela: chama o paciente (se tem senha e está em
        // espera), abre a tela de aplicação, marca os pendentes como cancelados com o
        // motivo, salva e conclui a senha. A diferença é que tudo corre por fetch, sem
        // sair da lista. Abrir a tela de aplicação põe o paciente "Em Andamento", o que
        // aqui é esperado.
        const CANC = {
            emCurso: new Set(),      // ids de encaminhamento sendo cancelados
            recentes: new Map(),     // encaminhamento_id → instante; some da lista mesmo se o servidor demorar
            OCULTAR_MS: 90e3,
        };

        function registro() { return N.podarRegistro(lerJSON(CHAVE_REGISTRO, []), Date.now()); }
        function registrarCancelamento(it, escolha, pendentes) {
            gravarJSON(CHAVE_REGISTRO, N.podarRegistro([{
                enc: it.encaminhamento_id, nome: it.nome_municipe || '', senha: it.senha || '', em: Date.now(),
                motivo: escolha.motivo, reavaliar: !!escolha.reavaliar,
                itens: pendentes.map(m => ({ produto: m.produto, posologia: m.posologia, sigla: m.via.sigla, classe: m.via.classe })),
            }].concat(registro()), Date.now()));
        }

        function itemPorId(id) {
            for (const it of CS.itens.values()) if (idEncaminhamento(it.encaminhamento_id) === id) return it;
            return null;
        }

        function momentoCancelamento() {
            return new Date().toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false, timeZone: 'America/Sao_Paulo',
            });
        }

        // Motivo (botões rápidos ou texto livre) e, se marcado, reavaliação médica.
        function escolherCancelamento(it, pendentes) {
            return new Promise(resolver => {
                const fundo = document.createElement('div');
                fundo.className = 'cs-editor cs-cancelar-modal';

                const opcoes = motivos();
                fundo.innerHTML = `<div>
                    <div class="cs-cancel-title">Cancelar ${pendentes.length > 1 ? `${pendentes.length} medicações pendentes` : 'a medicação pendente'}</div>
                    <div class="cs-cm-paciente">${esc(it.nome_municipe || 'Paciente')}${it.senha ? ` · senha ${esc(it.senha)}` : ''}</div>
                    <ul class="cs-cm-itens">${pendentes.map(m => `<li><span class="cs-via cs-via-${m.via.classe}">${esc(m.via.sigla)}</span> <b>${esc(m.produto)}</b>${m.posologia ? ` <span class="cs-med-pos">${esc(m.posologia)}</span>` : ''}${m.observacao ? ' <span class="cs-med-obs">obs.</span>' : ''}</li>`).join('')}</ul>
                    <div class="cs-cm-rotulo">Motivo</div>
                    <div class="cs-cm-motivos">
                        ${opcoes.map((x, i) => `<button type="button" data-m="${i}">${esc(x)}</button>`).join('')}
                        <button type="button" data-m="outro">Outro motivo</button>
                    </div>
                    <textarea class="cs-cm-motivo" placeholder="Justificativa do cancelamento"></textarea>
                    <label class="cs-cm-reav"><input type="checkbox"> <span>Encaminhar paciente para reavaliação médica</span></label>
                    <textarea class="cs-cm-just-reav" placeholder="Justificativa para encaminhar ao médico" hidden></textarea>
                    <div class="cs-cm-nota">Somente medicações ainda pendentes serão canceladas. Itens já aplicados ou cancelados não mudam.</div>
                    <div class="cs-acoes"><button type="button" data-a="voltar">Voltar</button>
                    <button type="button" data-a="ok" disabled>Cancelar ${pendentes.length > 1 ? 'medicações' : 'medicação'}</button></div>
                </div>`;

                const motivo = fundo.querySelector('.cs-cm-motivo');
                const reav = fundo.querySelector('.cs-cm-reav input');
                const justReav = fundo.querySelector('.cs-cm-just-reav');
                const ok = fundo.querySelector('[data-a="ok"]');

                const validar = () => {
                    ok.disabled = !motivo.value.trim() || (reav.checked && !justReav.value.trim());
                };

                fundo.querySelectorAll('[data-m]').forEach(btn => {
                    btn.addEventListener('click', ev => {
                        ev.preventDefault();
                        fundo.querySelectorAll('[data-m]').forEach(x => x.dataset.on = x === btn ? '1' : '0');
                        if (btn.dataset.m === 'outro') {
                            motivo.value = '';
                            motivo.focus();
                        } else {
                            motivo.value = opcoes[Number(btn.dataset.m)] || '';
                        }
                        motivo.dispatchEvent(new Event('input', { bubbles:true }));
                        validar();
                    });
                });

                motivo.addEventListener('input', () => {
                    const atual = motivo.value.trim();
                    if (atual && !opcoes.includes(atual)) {
                        fundo.querySelectorAll('[data-m]').forEach(x => x.dataset.on = x.dataset.m === 'outro' ? '1' : '0');
                    }
                    validar();
                });
                justReav.addEventListener('input', validar);
                reav.addEventListener('change', () => {
                    justReav.hidden = !reav.checked;
                    if (reav.checked) justReav.focus();
                    validar();
                });

                const fechar = valor => {
                    fundo.remove();
                    document.removeEventListener('keydown', tecla, true);
                    resolver(valor);
                };
                const tecla = ev => { if (ev.key === 'Escape') fechar(null); };
                document.addEventListener('keydown', tecla, true);

                fundo.addEventListener('click', ev => {
                    const a = ev.target.dataset && ev.target.dataset.a;
                    if (ev.target === fundo || a === 'voltar') fechar(null);
                    if (a === 'ok' && !ok.disabled) {
                        fechar({
                            motivo: motivo.value.trim(),
                            reavaliar: reav.checked,
                            justificativaReavaliacao: justReav.value.trim()
                        });
                    }
                });

                document.body.appendChild(fundo);
            });
        }

        // Mesmo que o ícone de chamar faz, sem armar o "Confirmar atendimento" no topo.
        async function chamarParaCancelar(it) {
            if (it.status !== 'Em Espera' || !it.senha) return;
            const [tipo, atendimentoId] = String(it.atendimento_str || '').split('#');
            if (!tipo || !atendimentoId) throw new Error('atendimento da linha não identificado');
            const params = { atendimento_id: atendimentoId, atendimento_type: tipo };
            const { data } = await window.axios.get('/aplicacoes_medicamentos/chamar_paciente', { params });
            // Objeto vazio = senha perdida; o sistema não chamaria, então segue sem chamar.
            if (!data || (typeof data === 'object' && !Object.keys(data).length)) {
                console.warn('[Controle de Salas] senha perdida ao chamar para cancelar', params);
                return;
            }
            const botao = Array.from(CS.botoesChamar).find(b => b.atendimentoStr === it.atendimento_str);
            if (botao && typeof botao.chamarAtendimentoSelecionado === 'function') return botao.chamarAtendimentoSelecionado();
            // eslint-disable-next-line no-undef
            if (typeof saudeSimplesProxy !== 'undefined') return saudeSimplesProxy.put('/filas/parametrizacoes/chamar_atendimento', params);
            throw new Error('não encontrei como registrar a chamada');
        }

        async function carregarFormularioAplicacao(id) {
            const r = await fetch(`/aplicacoes_medicamentos/new?encaminhamento_medicacao_id=${encodeURIComponent(id)}`, {
                credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'text/html' },
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
            const form = doc.querySelector(`form#edit_encaminhamento_medicacao_${CSS.escape(id)}`)
                || doc.querySelector('form[id^="edit_encaminhamento_medicacao_"]');
            if (!form) throw new Error('a tela de aplicação não abriu o formulário');
            const doForm = (form.querySelector('input[name="encaminhamento_medicacao[id]"]') || {}).value;
            if (doForm && doForm !== id) throw new Error(`a tela abriu o encaminhamento ${doForm}, não o ${id}`);
            return form;
        }

        // Envia como o "Salvar" da tela envia o formulário data-remote (cabeçalhos e
        // campos iguais aos da captura de 01/10, inclusive o button vazio no fim).
        async function salvarFormulario(form) {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                Accept: '*/*;q=0.5, text/javascript, application/javascript, application/ecmascript, application/x-ecmascript',
                'X-Requested-With': 'XMLHttpRequest',
            };
            const csrf = document.querySelector('meta[name="csrf-token"]');
            if (csrf && csrf.content) headers['X-CSRF-Token'] = csrf.content;
            const corpo = N.serializarFormulario(form);
            corpo.append('button', '');
            const r = await fetch(form.getAttribute('action') || '/aplicacoes_medicamentos', {
                method: (form.getAttribute('method') || 'post').toUpperCase(),
                credentials: 'same-origin', cache: 'no-store', headers,
                body: corpo.toString(),
            });
            const texto = await r.text();
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const res = N.resultadoSalvar(texto);
            if (!res.ok) throw new Error('o sistema recusou: ' + (res.erros.join('; ') || 'o formulário voltou com erro'));
            return res;
        }

        // A tela executaria a resposta do salvar, que conclui a senha; aqui só essa
        // chamada é feita, pela função do próprio sistema.
        async function concluirSenha(res, it) {
            let c = res.conclusao;
            if (!c) {
                if (!it.senha) return;
                const [tipo, atendimentoId] = String(it.atendimento_str || '').split('#');
                c = { tipo: 'controle_de_salas_medicacao', atendimentoId: +atendimentoId, atendimentoType: tipo };
            }
            if (typeof window.concluirSenhaOpcional !== 'function') throw new Error('função de concluir senha do sistema não encontrada');
            await window.concluirSenhaOpcional(c.tipo, { atendimento_id: c.atendimentoId, atendimento_type: c.atendimentoType });
        }

        async function cancelarDaLinha(id) {
            if (CANC.emCurso.size) return aviso('Espere o cancelamento em andamento terminar.');
            const it = itemPorId(id);
            const c = MED.cache.get(id);
            const pendentes = ((c && c.itens) || []).filter(m => m.estado === 'pendente');
            if (!it || !pendentes.length) return;
            if (it.status === 'Em Outra Sala') {
                return swalSeguro({ type: 'warning', title: 'Paciente em outra sala', html: 'Este paciente está sendo atendido em outra sala no momento.' });
            }
            const escolha = await escolherCancelamento(it, pendentes);
            if (!escolha) return;

            const nome = it.nome_municipe || 'Paciente';
            CANC.emCurso.add(id);
            pintarMedicacoes();
            let etapa = 'chamar o paciente';
            let tocouAtendimento = false;
            try {
                await chamarParaCancelar(it);
                etapa = 'abrir a tela de aplicação';
                const form = await carregarFormularioAplicacao(id);
                tocouAtendimento = true;
                etapa = 'marcar os itens como cancelados';
                const n = N.marcarCancelamento(form, Object.assign({ momento: momentoCancelamento() }, escolha));
                if (!n) throw new Error('nenhum item pendente na tela de aplicação');
                etapa = 'salvar';
                const salvo = await salvarFormulario(form);
                registrarCancelamento(it, escolha, pendentes);
                CANC.recentes.set(it.encaminhamento_id, Date.now());
                MED.cache.delete(id);
                etapa = 'concluir a senha';
                await concluirSenha(salvo, it);
                // Confere pela consulta (sem efeito no atendimento).
                const depois = await buscarMedicacoes(id).catch(() => null);
                const restam = depois ? depois.filter(m => m.estado === 'pendente').length : 0;
                if (restam) {
                    CANC.recentes.delete(it.encaminhamento_id);
                    MED.cache.set(id, { itens: depois, em: Date.now() });
                    swalSeguro({ type: 'warning', title: 'Confira o paciente', html: `Salvei o cancelamento de ${n} item(ns) de <b>${esc(nome)}</b>, mas a consulta ainda mostra ${restam} pendente(s).` });
                } else {
                    aviso(`${n} medicação(ões) de ${nome} cancelada(s).`);
                    const ap=atendimentoPres(it.atendimento_str), st=setorDaColecao(CS.colecao); if(ap&&st) presReq('/api/attendance/delete',{atendimento_id:ap.chave,sala:st.api}).catch(()=>{});
                }
                console.log('[Controle de Salas] cancelamento pela lista', { id, n, motivo: escolha.motivo, reavaliar: escolha.reavaliar });
            } catch (erro) {
                console.error('[Controle de Salas] cancelamento pela lista falhou ao', etapa, erro);
                const msg = (erro && erro.response && 'HTTP ' + erro.response.status) || (erro && erro.message) || String(erro);
                swalSeguro({
                    type: 'error', title: 'Cancelamento não concluído',
                    html: `Falhou ao ${etapa} (${esc(msg)}).`
                        + (etapa === 'concluir a senha' ? '<br><br>As medicações foram canceladas; só a senha pode ter ficado aberta.' : '')
                        + (tocouAtendimento && etapa !== 'concluir a senha' ? `<br><br><b>${esc(nome)}</b> pode ter ficado "Em Andamento" sem nada cancelado. Abra o atendimento para conferir.` : ''),
                });
            } finally {
                CANC.emCurso.delete(id);
                CS.ultimaAssinatura = '';
                if (CS.colecao) carregar(CS.colecao, { silencioso: true });
            }
        }

        async function carregar(vm, { silencioso }) {
            if (!vm.$el || !vm.$el.classList.contains('cs-fila')) prepararColecao(vm);
            const seq = ++CS.carga;
            const jaTemItens = Array.isArray(vm.items) && vm.items.length > 0;
            vm.preparingLoading = false;
            vm.errorRequest = {};
            // Com itens na tela, recarrega por baixo; o spinner só aparece na primeira carga.
            vm.isLoading = !jaTemItens;

            const cfg = lerConfig();
            const agora = new Date(Date.now() + (CS.desvioRelogio || 0));
            const inicioCarga = performance.now();
            let cond, minimo, filtroDataSistema;
            const condBase = Object.assign({}, vm.conditions || {});
            delete condBase.dataInicial;
            delete condBase.dataFinal;
            if (cfg.periodo === 'datas' && cfg.dataInicial && cfg.dataFinal) {
                cond = Object.assign({}, condBase, { dataInicial: cfg.dataInicial, dataFinal: cfg.dataFinal });
                minimo = null;
                filtroDataSistema = false;
            } else {
                ({ cond, minimo, filtroDataSistema } = N.aplicarPeriodo(condBase, cfg.periodo, agora));
            }
            gravarJSON(CHAVE_ULTIMA_LISTA, vm.url);

            const historico = cfg.mostrar === 'historico' && !!setorDaColecao(vm);
            CS.historico = historico;
            if (vm.$el && vm.$el.classList) vm.$el.classList.toggle('cs-historico', historico);

            // Todas as páginas de uma consulta à lista; null se outra carga começou depois.
            // A 1ª página traz o total; as outras saem todas juntas.
            const buscarTudo = async condicoes => {
                const params = pagina => Object.assign({ sortable: vm.sortable, page: pagina, per_page: POR_PAGINA }, condicoes);
                const p1 = await pedirPagina(vm.url, params(1));
                if (seq !== CS.carga) return null;
                const paginas = [p1.dados];
                let total = Number.isNaN(p1.total) ? Infinity : p1.total;
                if (p1.dados.length >= POR_PAGINA && total > POR_PAGINA) {
                    if (Number.isFinite(total)) {
                        const n = Math.min(MAX_PAGINAS, Math.ceil(total / POR_PAGINA));
                        const resto = await Promise.all(Array.from({ length: n - 1 }, (_, i) => pedirPagina(vm.url, params(i + 2))));
                        if (seq !== CS.carga) return null;
                        paginas.push(...resto.map(r => r.dados));
                    } else {
                        // Sem o total no cabeçalho: uma de cada vez até vir página incompleta.
                        for (let pagina = 2; pagina <= MAX_PAGINAS; pagina++) {
                            const r = await pedirPagina(vm.url, params(pagina));
                            if (seq !== CS.carga) return null;
                            paginas.push(r.dados);
                            if (r.dados.length < POR_PAGINA) break;
                        }
                    }
                }
                return { paginas, total };
            };

            // Contagem do título e da barra: a mesma regra em todos os computadores
            // (Hoje, sem filtro do sistema). Com 24 horas/Data ou filtro salvo neste PC,
            // ela sai de uma consulta à parte; a tabela continua como foi escolhida.
            const comFiltro = !!(cond.status || cond.grau_risco || cond.search_term || (cond.profissional && cond.profissional.id != null));
            const contagemPadrao = !historico && (cfg.periodo !== 'hoje' || comFiltro)
                ? buscarTudo(N.aplicarPeriodo(Object.assign({}, condBase, { search_term: null, profissional: {}, status: '', grau_risco: '' }), 'hoje', agora).cond).catch(() => null)
                : null;

            try {
                const consultas = historico
                    // Histórico: o mesmo filtro do sistema com status Cancelado e Finalizado.
                    ? Object.entries(N.STATUS_HISTORICO).map(([st, nome]) => ({ cond: Object.assign({}, cond, { status: st }), nome }))
                    : [{ cond, nome: '' }];
                const paginas = [];
                let total = 0;
                for (const q of consultas) {
                    const r = await buscarTudo(q.cond);
                    if (!r) return; // outra carga começou depois desta
                    // Se o servidor não mandar o status, vale o que foi pedido.
                    if (q.nome) for (const pag of r.paginas) for (const it of pag) if (!it.status) it.status = q.nome;
                    paginas.push(...r.paginas);
                    total += Number.isFinite(r.total) ? r.total : r.paginas.reduce((n, p) => n + p.length, 0);
                }
                const agoraMs = agora.getTime();
                for (const [k, t] of CANC.recentes) if (agoraMs - t > CANC.OCULTAR_MS) CANC.recentes.delete(k);
                const todos = N.juntarPaginas(paginas).filter(it => historico || !CANC.recentes.has(it.encaminhamento_id));
                CS.totalPeriodo = total;
                if (!historico) gravarJSON(CHAVE_ULTIMO_TOTAL, total);
                CS.truncado = todos.length < CS.totalPeriodo;
                const ativos = historico ? todos : todos.filter(it => it.status === 'Em Espera' || it.status === 'Em Andamento');
                const filtrados = N.filtrar(ativos, { minimo, soEspera: false });
                const lista = historico ? N.ordenarHistorico(filtrados) : N.ordenar(filtrados);
                const classes = historico ? N.classesHistorico(lista) : N.classesLinhas(lista);
                lista.forEach((it, i) => {
                    it.__csClasse = classes[i];
                    it.cs_espera = historico ? '' : N.espera(it, agora);
                });

                CS.itens = new Map(todos.map(it => [it.encaminhamento_id, it]));
                CS.erro = null;
                CS.ultimaAtualizacao = agora;
                let paraContar = lista;
                if (contagemPadrao) {
                    const rp = await contagemPadrao;
                    if (seq !== CS.carga) return;
                    if (rp) paraContar = N.juntarPaginas(rp.paginas).filter(it => !CANC.recentes.has(it.encaminhamento_id) && (it.status === 'Em Espera' || it.status === 'Em Andamento'));
                }
                CS.resumo = N.resumo(paraContar);
                CS.resumoHist = historico ? {
                    cancelados: lista.filter(it => it.status === 'Cancelado').length,
                    finalizados: lista.filter(it => it.status !== 'Cancelado').length,
                } : null;
                CS.filtroDataSistema = filtroDataSistema ? `${cond.dataInicial || '…'} a ${cond.dataFinal || '…'}` : '';

                ajustarColunas(vm);
                const assinatura = JSON.stringify(lista.map(it => [it.encaminhamento_id, it.status, it.senha, it.grau_risco, it.chamada_em, it.cs_espera, it.__csClasse]));
                if (!silencioso || assinatura !== CS.ultimaAssinatura || !jaTemItens) {
                    CS.ultimaAssinatura = assinatura;
                    vm.customPerPage = 5000; // fetchProps volta para 10 quando a busca muda
                    vm.totalRows = lista.length;
                    vm.currentPage = 1;
                    vm.items = lista;
                    vm.$emit('definedItems', lista);
                    vm.$nextTick(() => { sincronizarBotoes(); pintarMedicacoes(); });
                }
                vm.isLoading = false;
                CS.duracaoCarga = performance.now() - inicioCarga;
                if (CS.prontaEm == null && lista.length) {
                    CS.prontaEm = performance.now(); // ms desde que a página começou a abrir
                    console.log(`[Controle de Salas] tabela pronta ${(CS.prontaEm / 1000).toFixed(1)} s após abrir a página (lista adiantada: ${ADIANTADA.usada ? 'sim' : 'não'})`);
                }
                pedirMedicacoes(vm, lista);
                pedirDetalhesSetor(vm, lista);
                if (!historico) for (const it of lista) pedirAlergia(it);
                atualizarPresencas(vm, lista).catch(() => {});
                vm.$nextTick(pintarMedicacoes);
            } catch (erro) {
                if (seq !== CS.carga) return;
                vm.isLoading = false;
                CS.erro = 'Falha ao atualizar a lista (' + ((erro.response && erro.response.status) || erro.message || 'erro') + '). Mantendo a última versão.';
                if (!jaTemItens) {
                    vm.errorRequest = erro.response;
                    vm.$emit('onError', erro);
                }
                console.error('[Controle de Salas] carga da lista', erro);
            }
            atualizarBarra();
        }

        function garantirCancelarOutrasSalasDOM() {
            const vm = CS.colecao;
            const setor = setorDaColecao(vm);
            if (!vm || !setor || setor.key === 'medicacao' || CS.historico) return;
            const linhas = vm.$el?.querySelectorAll?.('tbody > tr') || [];
            (vm.items || []).forEach((it, i) => {
                if (it.status !== 'Em Espera' && it.status !== 'Em Andamento') return;
                const tr = linhas[i]; if (!tr) return;
                const td = tr.querySelector('td.cs-col-acoes') || tr.querySelector('.botao-atender,.botao-chamar')?.closest('td');
                if (!td) return;
                let box = td.querySelector(':scope > .cs-acao-extra');
                if (!box) {
                    box = document.createElement('div');
                    box.className = 'cs-acao-extra';
                    box.addEventListener('click', cliqueCancelarSetor);
                    td.appendChild(box);
                }
                trocarHtml(box, htmlCancelarSetor(it, setor));
            });
        }

        function sincronizarBotoes() {
            for (const b of CS.botoesAtender) if (b.controleSala) b.desbloqueiBotaoAtendimento();
            for (const b of CS.botoesChamar) if (b.controleSala) b.botaoBloqueado = b.setDisabledClass();
            const chamarEl = document.querySelector('.cs-fila .botao-chamar');
            const icone = chamarEl ? getComputedStyle(chamarEl).backgroundImage : '';
            if (icone && icone !== 'none') document.querySelectorAll('.cs-fila .botao-atender').forEach(el => { el.style.backgroundImage = icone; });
            // Exames/Raio-X/Enfermagem também recebem Cancelar na própria fila,
            // no mesmo bloco de ações da Medicação.
            garantirCancelarOutrasSalasDOM();
        }

        function restaurarFiltros(f) {
            const r = N.filtrosParaRestaurar(lerJSON(CHAVE_FILTROS, null), new Date());
            if (!r) return;
            const prof = r.profissionalId != null
                ? (f.profissionaisCollection || []).find(p => String(p.id) === String(r.profissionalId)) || ''
                : '';
            f.profissionalSelecionado = prof;
            f.statusSelecionado = r.status;
            f.grauRiscoSelecionado = r.grauRisco;
            // Data é controlada exclusivamente pela barra Hoje/24 horas/Data.
            // Não restaura o filtro de data antigo do Saúde Simples.
            f.dataInicial = '';
            f.dataFinal = '';
            // Mesmo efeito do "Aplicar", sem disparar a busca agora: o componente da
            // lista ainda pode não existir; a primeira carga já lê estas condições.
            f.conditions.profissional = prof || {};
            f.conditions.status = r.status;
            f.conditions.grau_risco = r.grauRisco;
            f.conditions.dataInicial = '';
            f.conditions.dataFinal = '';
            try { f.textFilter(); } catch (e) { /* só o texto do botão */ }
        }

        // ── Atender pela tabela ────────────────────────────────────────────────
        // Na unidade a entrada é sempre pelo "Confirmar atendimento" do topo, que só
        // aparece depois do "Chamar Paciente". O Atender da tabela segue o mesmo caminho:
        // se o paciente ainda não foi chamado, chama (igual ao ícone da linha) e deixa o
        // "Confirmar atendimento" pronto; se já foi chamado, confirma.
        // "Senha perdida": o sistema não consegue chamar a senha. Quando o aviso aparece depois de um Chamar,
        // aquele atendimento passa a usar o Atender original do sistema (que abre a ficha).
        const SENHA_PERDIDA = new Set();
        function avisoSenhaPerdida() {
            // O aviso do sistema é SweetAlert2 antigo (.swal2-modal dentro de .swal2-container fixo).
            return [...document.querySelectorAll('.swal2-modal, .swal2-popup, .swal2-container, .sweet-alert, .swal-modal, .toast, .toast-message, .alert, .modal.show, .modal.in, [role="alert"], [role="dialog"]')]
                .some(e => (e.getClientRects ? e.getClientRects().length > 0 : e.offsetParent !== null) && /senha\s+perdida/i.test(e.textContent || ''));
        }
        async function marcarSeSenhaPerdida(atendimentoStr) {
            if (!atendimentoStr) return false;
            for (let i = 0; i < 12; i++) {   // o aviso pode aparecer alguns instantes depois
                if (avisoSenhaPerdida()) { SENHA_PERDIDA.add(String(atendimentoStr)); return true; }
                await new Promise(r => setTimeout(r, 150));
            }
            return SENHA_PERDIDA.has(String(atendimentoStr));
        }

        async function atender(btn, nativo) {
            if (btn.__csAbrindo) return;
            if (emOutraSala(btn.encaminhamentoStr)) {
                return swalSeguro({ type: 'warning', title: 'Paciente em outra sala', html: 'Este paciente está sendo atendido em outra sala no momento.' });
            }
            // Sem senha não existe chamada nem "Confirmar atendimento": o sistema abre direto.
            if (!btn.enfileirado) return btn.definicoesInicioAtendimento();
            // Senha perdida: chamar não adianta; segue o Atender original do sistema.
            if (nativo && SENHA_PERDIDA.has(String(btn.atendimentoStr))) return nativo();

            const fila = filaChamarProximo();
            if (!fila) return swalSeguro({ type: 'error', title: 'Fila não encontrada', html: 'Use o ícone de chamar da linha.' });

            if (fila.proximoFila && pacienteChamado(fila, btn)) return confirmarAtendimento(btn, fila);

            if (fila.proximoFila) {
                const ok = await confirmar('Outro paciente já foi chamado',
                    `<b>${esc(fila.nomeMunicipe || fila.proximoFila.senha || '')}</b> está aguardando o "Confirmar atendimento". Chamar <b>${esc(nomeDaLinha(btn))}</b> no lugar?`);
                if (!ok) return;
            }
            const chamar = Array.from(CS.botoesChamar).find(b => b.atendimentoStr === btn.atendimentoStr);
            if (!chamar) return swalSeguro({ type: 'error', title: 'Não foi possível chamar', html: 'Use o ícone de chamar da linha.' });
            btn.__csAbrindo = true;
            try {
                await chamar.chamarSenhaManualmente();
            } finally {
                btn.__csAbrindo = false;
                btn.desbloqueiBotaoAtendimento();
            }
            const depois = filaChamarProximo();
            if (nativo && !(depois && depois.proximoFila && pacienteChamado(depois, btn)) && await marcarSeSenhaPerdida(btn.atendimentoStr)) return nativo();
            if (fila.proximoFila && pacienteChamado(fila, btn)) {
                aviso(`${nomeDaLinha(btn)} chamado. Quando chegar, clique em "Confirmar atendimento" (ou em Atender de novo).`);
            }
        }

        function pacienteChamado(fila, btn) {
            return String(fila.prontuariavelId) === String(btn.atendimentoId) && fila.prontuariavelType === btn.atendimentoType;
        }

        function nomeDaLinha(btn) {
            const it = CS.itens.get(btn.encaminhamentoStr);
            return (it && it.nome_municipe) || 'Paciente';
        }

        // O mesmo que clicar em "Confirmar atendimento" no topo (fila-chamada.atender).
        async function confirmarAtendimento(btn, fila) {
            btn.__csAbrindo = true;
            btn.botaoBloqueado = true;
            // A URL de destino vem de uma consulta que o sistema dispara logo após a chamada.
            for (let i = 0; i < 50 && !fila.baseRedirectUrlControleSala; i++) await new Promise(r => setTimeout(r, 100));
            const chamada = (fila.$children || []).find(c => c.$options && c.$options.name === 'fila-chamada');
            if (!chamada || !fila.baseRedirectUrlControleSala) {
                btn.__csAbrindo = false;
                btn.desbloqueiBotaoAtendimento();
                return swalSeguro({ type: 'warning', title: 'Ainda não deu para confirmar', html: 'Use o botão "Confirmar atendimento" no topo da página.' });
            }
            chamada.atender();
        }

        // ── Atendimento em aba nova ───────────────────────────────────────────
        const ABA = { janela: null, nome: '', timer: null };

        function abaAberta() { return !!(ABA.janela && !ABA.janela.closed); }

        function confirmarSegundaAba() {
            if (!abaAberta()) return true;
            return window.confirm(`O atendimento de ${ABA.nome || 'outro paciente'} ainda está aberto em outra aba.\n\nAbrir mais um atendimento mesmo assim?`);
        }

        // Abre a aplicação numa aba nova; false se o navegador bloqueou (aí o sistema
        // segue pelo caminho normal, na mesma aba).
        function abrirAtendimento(url, nome, contexto = {}) {
            // Alergia já lida na lista vai para a ficha (o sessionStorage é copiado para a aba nova).
            const encMed = (/encaminhamento_medicacao_id=(\d+)/.exec(url) || [])[1];
            const encRota = (/\/(?:encaminhamentos_exames|encaminhamentos_radiografias|encaminhamentos_procedimentos_enfermagem)\/(\d+)(?:\/edit)?/.exec(String(url)) || [])[1];
            const enc = encMed || encRota || '';
            const itContexto = contexto?.encaminhamentoStr ? CS.itens.get(contexto.encaminhamentoStr) : null;
            const itAba = (enc && itemPorId(enc)) || itContexto || null;
            const alerg = encMed && itAba && MOSTRAR_ALERGIA && ALERG.cache.get(atendimentoPa(itAba));
            if (alerg) try { sessionStorage.setItem(`cs-alergia-${encMed}`, JSON.stringify(alerg)); } catch (e) { /* sem armazenamento */ }
            const setorPres = setorDaColecao(CS.colecao);
            const tipoCtx = String(contexto?.atendimentoType || '').trim();
            const idCtx = String(contexto?.atendimentoId || '').match(/\d+/)?.[0] || '';
            const strCtx = String(contexto?.atendimentoStr || '').trim();
            const atPres = (idCtx && /^AtendimentoPa$/i.test(tipoCtx))
                ? `AtendimentoPa#${idCtx}`
                : (/^AtendimentoPa#\d+$/i.test(strCtx) ? strCtx : '')
                || String(itAba?.atendimento_str || itAba?.atendimentoStr || '');
            const idPaAba = String(atPres).match(/^AtendimentoPa#(\d+)$/i)?.[1] || '';
            if (idPaAba) try { sessionStorage.setItem(CS_ATENDIMENTO_PA_FILHO, idPaAba); } catch (_) {}
            try {
                localStorage.setItem('cs-presenca-seed', JSON.stringify({
                    atendimento: atPres || '',
                    sala: setorPres?.api || 'medicacao',
                    nome: nome || '',
                    em: Date.now()
                }));
            } catch (_) {}
            // Carrega o AtendimentoPa exato na própria URL da aba filha. Assim o painel
            // de Pendências nunca precisa reencontrar o episódio por nome/data/hora.
            if (idPaAba) {
                try {
                    const u = new URL(url, location.origin);
                    u.searchParams.set('om30_atendimento_pa', idPaAba);
                    url = u.href;
                } catch (_) {}
            }
            let janela = null;
            try { janela = window.open(url, `cs-atendimento-${Date.now()}`); } catch (e) { janela = null; }
            if (!janela) return false;
            ABA.janela = janela;
            ABA.nome = nome || '';
            clearInterval(ABA.timer);
            // Quando a aba fechar (sozinha depois de salvar, ou na mão), atualiza a lista.
            ABA.timer = setInterval(() => {
                if (ABA.janela && !ABA.janela.closed) return;
                clearInterval(ABA.timer);
                ABA.janela = null;
                CS.ultimaAssinatura = '';
                if (CS.colecao) carregar(CS.colecao, { silencioso: true });
                const fila = filaChamarProximo();
                if (fila && typeof fila.getQuantidadeFila === 'function') fila.getQuantidadeFila();
            }, 700);
            aviso(`Atendimento de ${nome || 'paciente'} aberto em outra aba. Ao salvar, ela fecha e a lista se atualiza.`);
            return true;
        }

        // Tira o "Confirmar atendimento" do topo: o paciente já está sendo atendido na outra aba.
        function limparChamada() {
            const fila = filaChamarProximo();
            if (fila) {
                fila.proximoFila = null;
                fila.loadingProximo = false;
            }
            for (const b of CS.botoesAtender) { b.__csAbrindo = false; b.desbloqueiBotaoAtendimento(); }
        }

        // Título: quantos esperam (🔴 se há vermelho esperando) e a sala; paciente
        // chamado aguardando "Confirmar atendimento" aparece na frente.
        function nomeSala(url) {
            const u = String(url || '');
            if (/aplicacoes_medicamentos/.test(u)) return 'Medicação';
            if (/encaminhamentos_exames/.test(u)) return 'Exames';
            if (/encaminhamentos_radiografias/.test(u)) return 'Raio-X';
            if (/procedimentos_enfermagem/.test(u)) return 'Procedimentos';
            if (/gessos_imobilizacoes/.test(u)) return 'Gesso';
            return '';
        }
        function atualizarTitulo() {
            const sala = CS.colecao ? nomeSala(CS.colecao.url) : '';
            const fim = sala ? `${sala} · Controle de Salas` : 'Controle de Salas';
            const fila = filaChamarProximo();
            const r = CS.resumo;
            let t;
            if (fila && fila.proximoFila) t = `📢 ${fila.nomeMunicipe || fila.proximoFila.senha || 'Paciente chamado'} · ${fim}`;
            else if (CS.historico) t = `Histórico · ${fim}`;
            else if (r) t = `${r.cores[0] ? '🔴 ' : ''}(${r.espera}) ${fim}`;
            else t = `${fim} · carregando…`;
            definirTitulo(t);
        }

        function aviso(texto) {
            let el = document.getElementById('cs-aviso-flutuante');
            if (!el) {
                el = document.createElement('div');
                el.id = 'cs-aviso-flutuante';
                document.body.appendChild(el);
            }
            el.textContent = texto;
            el.classList.add('cs-visivel');
            clearTimeout(el.__t);
            el.__t = setTimeout(() => el.classList.remove('cs-visivel'), 6000);
        }

        function filaChamarProximo() {
            let vm = CS.colecao;
            while (vm && !(vm.$refs && vm.$refs.filaChamarProximo)) vm = vm.$parent;
            return vm ? vm.$refs.filaChamarProximo : null;
        }

        function ocultarDataNativa(){
            for(const input of document.querySelectorAll('input[type="date"]')){
                if(input.closest('.cs-editor'))continue;
                const bloco=input.closest('.form-group,.input-group,.col-md-6,.col-sm-6,.row > div,label')||input.parentElement;
                if(bloco)bloco.style.setProperty('display','none','important');
            }
            for(const el of document.querySelectorAll('label,.control-label,strong')){
                const t=String(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
                if(!/^data (inicial|final)$/.test(t))continue;
                const bloco=el.closest('.form-group,.col-md-6,.col-sm-6,.row > div')||el.parentElement;
                if(bloco && !bloco.closest('.cs-editor'))bloco.style.setProperty('display','none','important');
            }
        }
        document.addEventListener('click',ev=>{
            if(ev.target?.closest?.('#btn_filtro_modal,[data-target*="filtro"],[data-toggle="modal"]')){
                setTimeout(ocultarDataNativa,50);setTimeout(ocultarDataNativa,220);
            }
        },true);

        function abrirDatas() {
            const cfg=lerConfig();
            const fundo=document.createElement('div'); fundo.className='cs-editor';
            const hoje=N.isoDia(new Date());
            const limparModal = cfg.periodo==='datas' ? '<button type="button" data-a="limpar">Limpar data</button>' : '';
            fundo.innerHTML=`<div class="cs-data-modal"><b>Período por datas</b><div class="cs-data-campos"><label>Inicial<input class="form-control" type="date" data-d="ini" value="${esc(cfg.dataInicial||hoje)}"></label><label>Final<input class="form-control" type="date" data-d="fim" value="${esc(cfg.dataFinal||hoje)}"></label></div><div class="cs-acoes">${limparModal}<button type="button" data-a="sair">Cancelar</button><button type="button" data-a="ok">Aplicar</button></div></div>`;
            fundo.onclick=ev=>{const a=ev.target.dataset&&ev.target.dataset.a;if(ev.target===fundo||a==='sair')fundo.remove();if(a==='limpar'){const n=lerConfig();n.periodo='hoje';n.dataInicial='';n.dataFinal='';gravarJSON(CHAVE_CONFIG,n);fundo.remove();CS.ultimaAssinatura='';atualizarBarra();if(CS.colecao)carregar(CS.colecao,{silencioso:false});return;}if(a==='ok'){const ini=fundo.querySelector('[data-d="ini"]').value,fim=fundo.querySelector('[data-d="fim"]').value;if(!ini||!fim||ini>fim)return aviso('Confira as datas.');const n=lerConfig();n.periodo='datas';n.dataInicial=ini;n.dataFinal=fim;gravarJSON(CHAVE_CONFIG,n);fundo.remove();CS.ultimaAssinatura='';atualizarBarra();if(CS.colecao)carregar(CS.colecao,{silencioso:false});}};
            document.body.appendChild(fundo);
        }

        // ── Barra de controle acima da tabela ─────────────────────────────────
        function montarBarra() {
            const col = CS.colecao;
            if (!col || !col.$el || !col.$el.parentNode) return;
            let barra = document.getElementById('cs-barra');
            if (!barra) {
                barra = document.createElement('div');
                barra.id = 'cs-barra';
                barra.className = 'cs-barra';
                barra.addEventListener('click', ev => {
                    const b = ev.target.closest('button[data-cs]');
                    if (!b) return;
                    const cfg = lerConfig();
                    const [campo, valor] = b.dataset.cs.split(':');
                    if (campo === 'periodo' && valor === 'datas') return abrirDatas();
                    if (campo === 'periodo' && valor === 'limpar') {
                        cfg.periodo='hoje'; cfg.dataInicial=''; cfg.dataFinal='';
                    } else if (campo === 'periodo') cfg.periodo = valor;
                    if (campo === 'mostrar') cfg.mostrar = valor;
                    gravarJSON(CHAVE_CONFIG, cfg);
                    CS.ultimaAssinatura = '';
                    atualizarBarra();
                    if (CS.colecao) carregar(CS.colecao, { silencioso: false });
                });
            }
            if (barra.nextSibling !== col.$el) col.$el.parentNode.insertBefore(barra, col.$el);
            atualizarBarra();
        }

        function atualizarBarra() {
            atualizarTitulo();
            const barra = document.getElementById('cs-barra');
            if (!barra) return;
            if (CS.colecao && CS.colecao.$el && barra.nextSibling !== CS.colecao.$el && CS.colecao.$el.parentNode) {
                CS.colecao.$el.parentNode.insertBefore(barra, CS.colecao.$el);
            }
            const cfg = lerConfig();
            const bt = (dado, rotulo, ativo) => `<button type="button" data-cs="${dado}" class="${ativo ? 'cs-ativo' : ''}">${rotulo}</button>`;
            const periodos = bt('periodo:hoje','Hoje',cfg.periodo==='hoje') + bt('periodo:24h','24 horas',cfg.periodo==='24h') + bt('periodo:datas','Data...',cfg.periodo==='datas') + (cfg.periodo==='datas' ? bt('periodo:limpar','Limpar data',false) : '');
            const r = CS.resumo;
            const cores = ['#d32f2f', '#ef6c00', '#f9a825', '#2e7d32', '#1565c0', '#b0b7bf'];
            const nomes = ['Vermelho', 'Laranja', 'Amarelo', 'Verde', 'Azul', 'Sem classificação'];
            const h = CS.resumoHist;
            const resumoHtml = h
                ? `<span class="cs-resumo"><b>Histórico:</b><span>${h.cancelados} cancelado(s)</span><span>· ${h.finalizados} finalizado(s)</span><span class="cs-dica">use a busca do sistema para achar pelo nome ou senha</span></span>`
                : r
                ? (() => {
                    const indices = [0, 2, 3, 4]; // vermelho, amarelo, verde, azul
                    const porCor = indices.map(i => {
                        const media = r.mediaCoresMin?.[i];
                        return `<span class="cs-media-cor" title="${nomes[i]}: ${r.cores[i] || 0} pessoa(s)"><span class="cs-media-dot" style="background:${cores[i]}"></span><span class="cs-media-nome">${nomes[i]}</span><span class="cs-media-qtd">${r.cores[i] || 0}</span><span class="cs-media-tempo">Tempo médio <strong>${media != null ? `${media} min` : '—'}</strong></span></span>`;
                    }).join('');
                    return `<span class="cs-resumo">${porCor}`
                      + (r.andamento ? `<span class="cs-em-atendimento-resumo">${r.andamento} em atendimento</span>` : '')
                      + '</span>';
                  })()
                : '';
            const historicoHtml = CS.colecao && setorDaColecao(CS.colecao)
                ? bt('mostrar:historico', 'Histórico', cfg.mostrar === 'historico')
                : '';
            const avisos = [];
            if (CS.filtroDataSistema) avisos.push(`<span class="cs-aviso">Usando a data do filtro do sistema (${esc(CS.filtroDataSistema)})</span>`);
            if (CS.truncado) avisos.push(`<span class="cs-aviso">Mostrando ${MAX_PAGINAS * POR_PAGINA} de ${CS.totalPeriodo}; reduza o período</span>`);
            if (CS.erro) avisos.push(`<span class="cs-erro">${esc(CS.erro)}</span>`);
            if (MED.desligado) avisos.push(`<span class="cs-erro" title="${esc(MED.desligado)}">Medicações desligadas: a consulta foi redirecionada. Avise quem mantém o script.</span>`);
            const hora = CS.ultimaAtualizacao ? CS.ultimaAtualizacao.toLocaleTimeString('pt-BR') : '…';
            const seg = ms => (ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
            const tempoHtml = '';
            const tempoTitulo = (CS.prontaEm != null ? `Tabela pronta ${seg(CS.prontaEm)} s depois de abrir a página (lista adiantada: ${ADIANTADA.usada ? 'sim' : 'não'}). ` : '')
                + (CS.duracaoCarga != null ? `Última atualização da lista levou ${seg(CS.duracaoCarga)} s. ` : '');
            barra.innerHTML = `
                <span class="cs-grupo"><b>Período:</b>${periodos}</span>
                <span class="cs-grupo"><b>Mostrar:</b>${bt('mostrar:todos', 'Todos', cfg.mostrar === 'todos')}${historicoHtml}</span>
                ${resumoHtml}
                ${avisos.join('')}
                <span class="cs-hora" title="${esc(tempoTitulo)}Ordem: VERMELHO → AMARELO → VERDE → AZUL; na mesma cor, mais antigo primeiro">atualizado ${hora}</span>`;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Tela de aplicação (/aplicacoes_medicamentos/new): motivos rápidos de cancelamento
    // ─────────────────────────────────────────────────────────────────────────────
    function iniciarAplicacao() {
        // Cloudflare: registrar presença também na Medicação.
        // A v3.0.13 semeava o AtendimentoPa ao abrir a aba filha, mas não executava
        // o upsert nesta rota. Exames/Raio-X/Enfermagem já chamavam o registro.
        try {
            const qs = new URLSearchParams(location.search);
            const pa = String(qs.get('om30_atendimento_pa') || sessionStorage.getItem(CS_ATENDIMENTO_PA_FILHO) || '').match(/\d+/)?.[0] || '';
            let seed = null;
            try { seed = JSON.parse(localStorage.getItem('cs-presenca-seed') || 'null'); } catch (_) {}
            const recente = seed && Date.now() - Number(seed.em || 0) < 5 * 60 * 1000;
            const seedPa = String(seed?.atendimento || '').match(/^AtendimentoPa#(\d+)$/i)?.[1] || '';
            const info = recente && (!pa || !seedPa || seedPa === pa)
                ? seed
                : (pa ? { atendimento: `AtendimentoPa#${pa}`, sala: 'medicacao', nome: '', em: Date.now() } : null);
            if (info?.atendimento) {
                info.sala = 'medicacao';
                csRegistrarPresencaFilha(info).catch(e => console.warn('[OM30 PRESENÇA] registro Medicação não realizado:', e?.message || e));
            }
        } catch (e) {
            console.warn('[OM30 PRESENÇA] falha ao preparar registro da Medicação:', e?.message || e);
        }

        estilo(`
            .cs-alerg-ficha { margin:6px 0; padding:8px 12px; border-radius:6px; background:#fde8e8; color:#9b1c1c; border:1px solid #f5a3a3; font-weight:700; font-size:14px; }
            .cs-pend { margin:6px 0 10px; padding:8px 10px; border:1px solid #c9d6e3; border-left:4px solid #2b6cb0; border-radius:6px; background:#f4f8fc; font-size:13px; }
            .cs-pend-cab { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
            .cs-pend-cab button, .cs-pend > button, .cs-pend-corpo button { border:1px solid #b9c2cc; background:#fff; border-radius:4px; padding:1px 8px; font-size:12px; cursor:pointer; }
            .cs-pend-item { margin:2px 0; }
            .cs-pend-item b { display:inline-block; min-width:190px; }
            .cs-pend-mesmo b { color:#a32020; }
            .cs-pend-st { color:#24313f; }
            .cs-pend-qd { color:#6b7785; font-size:12px; }
            .cs-pend-nada { color:#5b6672; font-style:italic; }
            .cs-pend-aviso { color:#a15c00; margin:4px 0; }
            .cs-cancelar-todos { margin:8px 0 4px; padding:8px 10px; border:1px dashed #c9a3a3; border-radius:6px; background:#fdf6f6; }
            .cs-cancelar-todos .cs-titulo { font-weight:600; margin-bottom:4px; }
            .cs-cancelar-todos .cs-motivos { justify-content:flex-start; margin:4px 0 0; }

            .cs-salvar-pend-overlay { position:fixed; inset:0; z-index:2147483647; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(15,23,42,.46); }
            .cs-salvar-pend-box { width:min(500px,94vw); background:#fff; border:1px solid #dce3e8; border-radius:12px; box-shadow:0 20px 55px rgba(15,23,42,.24); overflow:hidden; font-size:12px; color:#26323d; }
            .cs-salvar-pend-head { position:relative; padding:13px 15px 12px 52px; border-bottom:1px solid #e7ecef; background:#fbfcfd; }
            .cs-salvar-pend-head:before { content:'!'; position:absolute; left:15px; top:13px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:#fff4db; border:1px solid #efcf8a; color:#9a6700; font-size:16px; font-weight:900; }
            .cs-salvar-pend-title { font-size:14px; font-weight:900; color:#263942; }
            .cs-salvar-pend-sub { margin-top:3px; color:#64748b; font-size:11px; line-height:1.35; }
            .cs-salvar-pend-body { padding:12px 15px 10px; }
            .cs-salvar-pend-count { margin-bottom:8px; padding:7px 9px; border:1px solid #e1e7eb; border-radius:7px; background:#f8fafb; color:#42545e; font-weight:800; }
            .cs-salvar-pend-body ul { margin:0; padding:7px 9px 7px 25px; max-height:160px; overflow:auto; border:1px solid #edf0f2; border-radius:7px; background:#fff; }
            .cs-salvar-pend-body li { margin:3px 0; font-weight:700; color:#334155; }
            .cs-salvar-pend-foot { display:flex; justify-content:flex-end; padding:0 15px 13px; }
            .cs-salvar-pend-foot button { border:1px solid #2b6cb0; border-radius:6px; background:#fff; color:#245d98; padding:7px 11px; font-size:11px; font-weight:900; cursor:pointer; }
            .cs-salvar-pend-foot button:hover { background:#eef6ff; }
        `);

        // 1) Dentro do popup "Motivo do Cancelamento" do sistema: um clique preenche.
        function injetarNoPopup() {
            const titulo = document.querySelector('.swal2-modal .swal2-title, .swal2-popup .swal2-title');
            if (!titulo || !/Motivo do Cancelamento/i.test(titulo.textContent)) return;
            const modal = titulo.closest('.swal2-modal, .swal2-popup');
            const ta = modal && modal.querySelector('textarea.swal2-textarea');
            if (!ta || modal.querySelector('.cs-motivos')) return;
            const box = botoesMotivos(texto => {
                ta.value = texto;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                ta.focus();
            });
            ta.parentNode.insertBefore(box, ta);
        }

        // 2) Atalho para cancelar todos os itens pendentes com o mesmo motivo
        //    (paciente recusou, não apareceu...). Usa os próprios botões "Cancelar" do
        //    sistema, um por vez, só trocando o popup de justificativa pelo motivo escolhido.
        function itensCancelaveis() {
            return Array.from(document.querySelectorAll('.encaminhamento_medicacao_atendimento_prescricao_interna'))
                .filter(item => {
                    const bt = item.querySelector('.btn-atendimento-prescricao-interna-cancelada');
                    const cancelada = item.querySelector("input[id$='cancelada']");
                    return bt && !bt.hasAttribute('disabled') && !(cancelada && cancelada.value === 'true');
                });
        }

        async function cancelarTodos(motivo) {
            const itens = itensCancelaveis();
            if (!itens.length) return swalSeguro({ type: 'info', title: 'Nada a cancelar', html: 'Não há itens pendentes para cancelar.' });
            const nomes = itens.map(it => {
                const li = Array.from(it.querySelectorAll('li.text')).find(l => /Produto/.test(l.textContent));
                return li ? li.textContent.replace(/^\s*Produto\s*/, '').trim() : 'item';
            });
            const ok = await confirmar(`Cancelar ${itens.length} item(ns)?`,
                `<div style="text-align:left"><b>Motivo:</b> ${esc(motivo)}<br><br>${nomes.map(n => '• ' + esc(n)).join('<br>')}<br><br>Depois confira e clique em <b>Salvar</b>.</div>`);
            if (!ok) return;

            const original = window.exibirJustificativaCancelamento;
            // Mesmo preenchimento que o popup original faz ao confirmar.
            window.exibirJustificativaCancelamento = function (item) {
                const $ = window.jQuery;
                const quando = new Date().toLocaleString('pr-BR', {
                    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
                    timeZone: 'America/Sao_Paulo',
                });
                const just = item.find("input[id$='justificativa_cancelamento']");
                const em = item.find("input[id$='canceled_at']");
                const prof = item.find("input[id$='profissional_cancelamento_id']");
                const atual = item.find("input[id$='current_profissional']").length
                    ? item.find("input[id$='current_profissional']") : $("input[name='current_profissional']");
                if (just.length) just.val(motivo);
                if (em.length) em.val(quando);
                if (prof.length) prof.val(atual.val());
                return Promise.resolve(true);
            };
            try {
                for (const item of itens) {
                    const bt = item.querySelector('.btn-atendimento-prescricao-interna-cancelada');
                    if (window.jQuery) window.jQuery(bt).trigger('click'); else bt.click();
                    // O sistema usa um debounce de 500 ms compartilhado entre os botões.
                    await new Promise(r => setTimeout(r, 900));
                }
            } finally {
                window.exibirJustificativaCancelamento = original;
            }
            const feitos = itens.filter(it => (it.querySelector("input[id$='cancelada']") || {}).value === 'true').length;
            swalSeguro({
                type: feitos === itens.length ? 'success' : 'warning',
                title: `${feitos} de ${itens.length} marcado(s) como cancelado(s)`,
                html: 'Confira os itens e clique em <b>Salvar</b> para gravar.',
            });
        }

        function injetarBarraCancelar() {
            const alvo = document.getElementById('medicamento_container');
            if (!alvo || document.querySelector('.cs-cancelar-todos')) return;
            if (!document.querySelector('.btn-atendimento-prescricao-interna-cancelada')) return;
            const barra = document.createElement('div');
            barra.className = 'cs-cancelar-todos';
            barra.innerHTML = '<div class="cs-titulo">Cancelar todos os itens pendentes com o motivo:</div>';
            barra.appendChild(botoesMotivos(cancelarTodos));
            alvo.parentNode.insertBefore(barra, alvo);
        }

        // ── Pendências em outras salas ────────────────────────────────────────
        // Mostra se o paciente ainda tem exame, raio-X, repouso etc. em aberto, pelas
        // tabelas da tela "Consultar Repousos/Medicações" (só leitura). Se aquela tela
        // estiver com filtro gravado na sessão, avisa e oferece limpar (só no clique).
        const PEND = { html: '', carregando: false, feito: false };

        function valorFicha(rotulo) {
            const el = Array.from(document.querySelectorAll('li > strong')).find(e => e.textContent.trim() === rotulo);
            return el ? el.parentElement.textContent.replace(el.textContent, '').replace(/\s+/g, ' ').trim() : '';
        }

        function paramsTabela(busca) {
            const p = new URLSearchParams({ sEcho: '1', iColumns: '7', sColumns: '', iDisplayStart: '0', iDisplayLength: '500', sSearch: busca || '', bRegex: 'false' });
            for (let i = 0; i < 7; i++) {
                p.set(`mDataProp_${i}`, String(i)); p.set(`sSearch_${i}`, ''); p.set(`bRegex_${i}`, 'false');
                p.set(`bSearchable_${i}`, 'true'); p.set(`bSortable_${i}`, 'false');
            }
            p.set('iSortCol_0', '0'); p.set('sSortDir_0', 'desc'); p.set('iSortingCols', '1');
            return p;
        }

        async function lerFiltroConsulta() {
            const r = await fetch('/consultar_repousos_medicacoes/filtrar', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' } });
            if (!r.ok) throw new Error('filtro HTTP ' + r.status);
            return N.filtroConsultaAtivo(new DOMParser().parseFromString(await r.text(), 'text/html'));
        }

        async function limparFiltroConsulta() {
            const campos = ['profissional_id', 'ocupacao_id_select', 'tipo_encaminhamento_id', 'senha', 'situacao_encaminhamento_id', 'urgencia', 'data_inicial', 'data_final'];
            const corpo = new URLSearchParams({ utf8: '✓' });
            const csrf = document.querySelector('meta[name="csrf-token"]');
            if (csrf) corpo.append('authenticity_token', csrf.content);
            for (const c of campos) corpo.append(`filtro_sala_encaminhamento[${c}]`, '');
            const headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Accept: '*/*;q=0.5, text/javascript, application/javascript', 'X-Requested-With': 'XMLHttpRequest' };
            if (csrf) headers['X-CSRF-Token'] = csrf.content;
            const r = await fetch('/consultar_repousos_medicacoes/filtrar', { method: 'POST', credentials: 'same-origin', headers, body: corpo.toString() });
            if (!r.ok) throw new Error('limpar filtro HTTP ' + r.status);
        }

        async function buscarPendencias() {
            const nome = valorFicha('Munícipe'), nascimento = valorFicha('Data de nascimento');
            if (!nome) throw new Error('não achei o nome do munícipe na ficha');
            const filtro = await lerFiltroConsulta();
            if (filtro.length) return { filtro };
            const resultados = await Promise.allSettled(N.SALAS_CONSULTA.map(async sala => {
                const r = await fetch(`/consultar_repousos_medicacoes/${sala.tabela}.json?${paramsTabela(nome)}`, {
                    credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' },
                });
                if (!r.ok) throw new Error(`${sala.nome}: HTTP ${r.status}`);
                const json = await r.json();
                const linhas = N.linhasConsultaSala(json, sala);
                return { linhas, cortada: +json.iTotalDisplayRecords > linhas.length ? sala.nome : '' };
            }));
            const linhas = [], erros = [], cortadas = [];
            resultados.forEach((r, i) => {
                if (r.status === 'fulfilled') { linhas.push(...r.value.linhas); if (r.value.cortada) cortadas.push(r.value.cortada); }
                else erros.push(N.SALAS_CONSULTA[i].nome);
            });
            if (erros.length === N.SALAS_CONSULTA.length) throw new Error('nenhuma sala respondeu');
            return Object.assign(N.pendenciasOutrasSalas(linhas, { nome, nascimento }), { erros, cortadas });
        }

        function htmlPendencias(r) {
            if (r.filtro) {
                return `<div class="cs-pend-aviso">A tela "Consultar Repousos/Medicações" está com filtro (${r.filtro.map(esc).join('; ')}). Com ele, não dá para saber as pendências.</div>
                    <button type="button" data-cs-pend="limpar">Limpar o filtro e conferir</button>`;
            }
            // div em vez de ul/li: o CSS dos formulários do sistema reordena os <li>.
            const linhas = r.outras.map(l => `<div class="cs-pend-item${l.mesmoAtendimento ? ' cs-pend-mesmo' : ''}"><b>${esc(l.salaNome)}</b> <span class="cs-pend-st">${esc(l.status)}</span>`
                + ` <span class="cs-pend-qd">${esc(l.data.slice(0, 5))} ${esc(l.hora)}${l.mesmoAtendimento ? ' · deste atendimento' : ''}</span></div>`).join('');
            return (r.outras.length ? linhas : '<div class="cs-pend-nada">Nenhuma outra sala pendente.</div>')
                + (r.antigas ? `<div class="cs-pend-nada">+${r.antigas} encaminhamento(s) antigo(s) em aberto (mais de 24 h).</div>` : '')
                + (r.erros.length ? `<div class="cs-pend-aviso">Não consegui consultar: ${r.erros.map(esc).join(', ')}.</div>` : '')
                + (r.cortadas.length ? `<div class="cs-pend-aviso">Lista longa em ${r.cortadas.map(esc).join(', ')}; pode faltar algo.</div>` : '');
        }

        function painelPendencias() {
            const form = document.querySelector('form[id^="edit_encaminhamento_medicacao_"]');
            if (!form) return null;
            let p = form.querySelector(':scope > .cs-pend');
            if (!p) {
                p = document.createElement('div');
                p.className = 'cs-pend';
                p.innerHTML = '<div class="cs-pend-cab"><b>Pendências em outras salas</b><button type="button" data-cs-pend="atualizar">atualizar</button></div><div class="cs-pend-corpo"></div>';
                p.addEventListener('click', ev => {
                    const b = ev.target.closest('button[data-cs-pend]');
                    if (!b) return;
                    ev.preventDefault();
                    carregarPendencias(b.dataset.csPend === 'limpar');
                });
                // Logo abaixo do alerta de alergia, se houver (alergia fica sempre em cima).
                const alerta = form.querySelector(':scope > .cs-alerg-ficha');
                form.insertBefore(p, alerta ? alerta.nextSibling : form.firstChild);
                // O formulário pode ser redesenhado (erro ao salvar): volta com o último resultado.
                if (PEND.html) p.querySelector('.cs-pend-corpo').innerHTML = PEND.html;
            }
            return p;
        }

        async function carregarPendencias(limparAntes) {
            const p = painelPendencias();
            if (!p || PEND.carregando) return;
            PEND.carregando = true;
            PEND.feito = true;
            const corpo = () => painelPendencias().querySelector('.cs-pend-corpo');
            corpo().innerHTML = '<div class="cs-pend-nada">conferindo…</div>';
            try {
                if (limparAntes) await limparFiltroConsulta();
                PEND.html = htmlPendencias(await buscarPendencias());
            } catch (erro) {
                console.warn('[Controle de Salas] pendências', erro);
                PEND.html = `<div class="cs-pend-aviso">Não consegui conferir (${esc((erro && erro.message) || erro)}).</div>`;
            }
            PEND.carregando = false;
            corpo().innerHTML = PEND.html;
        }



        // Alergia lida pela lista antes de abrir esta aba (MOSTRAR_ALERGIA).
        function alertaAlergiaFicha() {
            if (!MOSTRAR_ALERGIA) return;
            const form = document.querySelector('form[id^="edit_encaminhamento_medicacao_"]');
            const enc = (/encaminhamento_medicacao_id=(\d+)/.exec(location.search) || [])[1];
            if (!form || !enc || form.querySelector(':scope > .cs-alerg-ficha')) return;
            let a = null;
            try { a = JSON.parse(sessionStorage.getItem(`cs-alergia-${enc}`) || 'null'); } catch (e) { a = null; }
            if (!a || a.estado !== 'positiva') return;
            const div = document.createElement('div');
            div.className = 'cs-alerg-ficha';
            div.textContent = `⚠ ALERGIA registrada no prontuário: ${a.alergias.join(' · ')}${a.conflito ? ' (há também registro negando; confira)' : ''}`;
            form.insertBefore(div, form.firstChild);
        }

        // Título: "Aplicação · NOME", pelo <strong>Munícipe</strong> da ficha.
        function tituloAplicacao() {
            const rotulo = Array.from(document.querySelectorAll('li > strong')).find(el => el.textContent.trim() === 'Munícipe');
            const nome = rotulo ? rotulo.parentElement.textContent.replace(rotulo.textContent, '').replace(/\s+/g, ' ').trim() : '';
            definirTitulo(nome ? `Aplicação · ${nome}` : 'Aplicação de medicação');
        }

        const observar = () => {
            // Pendências e Cancelar são fornecidos pelos módulos preservados da v2.0.80.
            tituloAplicacao();
            alertaAlergiaFicha();
        };
        const iniciar = () => {
            observar();
            new MutationObserver(observar).observe(document.body, { childList: true, subtree: true });
        };
        if (document.body) iniciar();
        else document.addEventListener('DOMContentLoaded', iniciar);
    }
})();

// ===== OM30 ROLAR AO CHAMAR (igual no Acolhimento, Fila Médica e Controle de Salas) =====
// Ao clicar em "Chamar" numa linha da fila, sobe a página até o painel com
// "Confirmar atendimento / Paciente ausente / Chamar novamente". Se o painel não aparecer
// (chamada recusada, erro), não mexe na tela.
(() => {
  'use strict';
  if (window.__OM30_ROLAR_CHAMAR__) return;
  window.__OM30_ROLAR_CHAMAR__ = true;
  const texto = el => String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  const rotulo = el => `${texto(el)} ${el?.getAttribute?.('title') || ''} ${el?.getAttribute?.('aria-label') || ''} ${el?.getAttribute?.('data-original-title') || ''}`.trim();
  const visivel = el => !!(el && el.offsetParent && el.getClientRects().length);
  let ate = 0, timer = null;
  function painel() {
    const b = [...document.querySelectorAll('button, a')].find(el => /^Confirmar atendimento$/i.test(texto(el)) && visivel(el));
    return b ? (b.closest('fieldset, .card, .panel, .box, section') || b) : null;
  }
  function procurar() {
    clearTimeout(timer);
    const alvo = painel();
    if (alvo) {
      const topo = alvo.getBoundingClientRect().top + window.scrollY - 90;   // desconta a barra azul do topo
      if (Math.abs(window.scrollY - Math.max(0, topo)) > 20) window.scrollTo({ top: Math.max(0, topo), behavior: 'smooth' });
      return;
    }
    if (Date.now() < ate) timer = setTimeout(procurar, 150);
  }
  document.addEventListener('click', ev => {
    const b = ev.target?.closest?.('button, a');
    if (!b || !/^chamar\b/i.test(rotulo(b)) || /novamente/i.test(rotulo(b))) return;
    ate = Date.now() + 6000;
    clearTimeout(timer);
    timer = setTimeout(procurar, 250);
  }, true);
})();
// ===== FIM OM30 ROLAR AO CHAMAR =====

// ===== OM30 RAIO-X FATURAMENTO (bloco separado; para juntar com outra versão, copie daqui até o FIM) =====
// Controle interno do faturamento (faturamentops.pages.dev, com login autorizado por unidade).
// - Só age quando a tela do Controle de Salas está na sala de Raio-X e a aba está visível.
// - A cada 3 min lê os raio-X FINALIZADOS de hoje e de ontem da unidade logada (mesma lista do Histórico),
//   abre a ficha de cada encaminhamento novo (procedimentos REALIZADOS e o que já foi lançado no faturamento)
//   e busca CNS/CPF no cadastro pelo nome + nascimento (só aceita um cadastro exato).
// - Cada encaminhamento é enviado uma vez; o servidor ignora repetidos.
// Suporte: OM30RaioXFat.diagnostico() · OM30RaioXFat.enviarDia('2026-11-08')
(() => {
  'use strict';
  // Só na tela do Controle de Salas (o Raio-X é escolhido como local de atendimento nela).
  if (!/^\/aplicacoes_medicamentos/.test(location.pathname)) return;
  if (window.__OM30_RAIOX_FAT__) return;
  window.__OM30_RAIOX_FAT__ = true;

  const API = 'https://faturamentops.pages.dev';
  const VERSAO = '1.0.0';
  const CICLO_MS = 3 * 60000, POR_CICLO = 15, LOTE = 25;
  const STORE = 'om30:raiox-fat:v1:enviados';
  const GUARDA_MS = 4 * 86400000;

  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const norm = v => clean(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const isoDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const diaIso = br => { const m = String(br || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

  const estado = { ativo: false, ultimoCiclo: 0, enviados: 0, erro: '', rodando: false, pendentes: 0 };
  let enviados = (() => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; } })();
  function gravarEnviados() {
    const corte = Date.now() - GUARDA_MS;
    for (const [k, t] of Object.entries(enviados)) if (!(t > corte)) delete enviados[k];
    try { localStorage.setItem(STORE, JSON.stringify(enviados)); } catch {}
  }

  const unidadeLogada = () => clean(document.querySelector('a[href*="trocar_unidade_saude"]')?.textContent);
  const usuarioLogado = () => clean(document.querySelector('a.navbar-avatar')?.textContent);
  function naSalaRaioX() {
    if (/Raio-X/i.test(document.title)) return true;
    return /SALA DE RAIO|RADIOGRAFIA/i.test(clean(document.querySelector('#content, .content-wrapper, main')?.textContent).slice(0, 600));
  }

  async function lerJson(url) {
    const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' } });
    const t = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    try { return JSON.parse(t); } catch { throw new Error(/usuarios\/login|type=["']?password/i.test(t) ? 'sessao' : 'resposta inválida'); }
  }

  // Lista do Histórico: finalizados (status 4) de um dia.
  async function finalizadosDoDia(dia) {
    const itens = [];
    let tam = 0;
    for (let page = 1; page <= 20; page++) {
      const q = `format=json&sortable=%7B%7D&page=${page}&per_page=100&profissional=%7B%7D&status=4&grau_risco=&dataInicial=${dia}&dataFinal=${dia}`;
      const d = await lerJson(`/encaminhamentos_radiografias?${q}`);
      const lista = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
      itens.push(...lista);
      if (!lista.length) break;
      if (page === 1) tam = lista.length;
      if (lista.length < tam || lista.length < 100) break;
    }
    return itens;
  }

  // Ficha de consulta do encaminhamento (só leitura): procedimentos e faturamento.
  async function lerFicha(id) {
    const r = await fetch(`/encaminhamentos_radiografias/${id}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    if (/usuarios\/login/.test(r.url)) throw new Error('sessao');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const procs = [];
    const tabelas = [...doc.querySelectorAll('table')];
    const linhasDe = t => [...t.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(c => clean(c.textContent)));
    // Tabela "Procedimento | CID | Situação"; a tabela seguinte é a do Faturamento da ficha.
    const iProc = tabelas.findIndex(t => { const cab = [...t.querySelectorAll('th')].map(th => norm(th.textContent)); return cab[0] === 'PROCEDIMENTO' && cab.includes('SITUACAO'); });
    if (iProc < 0) throw new Error('ficha sem tabela de procedimentos');
    const cab = [...tabelas[iProc].querySelectorAll('th')].map(th => norm(th.textContent));
    const iS = cab.indexOf('SITUACAO'), iC = cab.indexOf('CID');
    linhasDe(tabelas[iProc]).forEach((l, idx) => {
      const m = (l[0] || '').match(/^(\d{10})\s*-\s*(.+)$/);
      procs.push({ idx, codigo: m ? m[1] : '', procedimento: m ? m[2] : l[0] || '', cid: iC >= 0 && l[iC] !== '—' ? l[iC] : '', situacao: norm(l[iS]) });
    });
    const fat = tabelas[iProc + 1];
    const faturamento = fat ? linhasDe(fat).map(l => l.join(' ')).join(' | ').slice(0, 300) : '';
    return { procs, faturamento };
  }

  // CNS/CPF: mesma busca de munícipes do prontuário; só vale um cadastro com nome e nascimento exatos.
  const cacheMunicipe = new Map();
  async function buscarMunicipe(nome, nascimento) {
    const chave = `${norm(nome)}|${nascimento}`;
    if (cacheMunicipe.has(chave)) return cacheMunicipe.get(chave);
    const busca = async q => { const j = await lerJson(`/municipes/search_padronizado_com_mudanca.json?q=${encodeURIComponent(q)}`); return Array.isArray(j) ? j : (Object.values(j || {}).find(Array.isArray) || []); };
    const filtra = l => l.filter(m => (norm(m.nome) === norm(nome) || norm(m.nome_social) === norm(nome)) && clean(m.data_nascimento_formatada) === nascimento);
    let c = filtra(await busca(`${nome} ${nascimento}`.trim()));
    if (!c.length) c = filtra(await busca(nome));
    const ids = [...new Set(c.map(m => String(m.id)))];
    const r = ids.length === 1 ? { status: 'ok', cns: clean(c[0].codigo_cns || c[0].cartao_provisorio), cpf: clean(c[0].cpf_numero_sem_formatacao || c[0].cpf_numero) }
      : { status: ids.length > 1 ? 'ambiguo' : 'nao_encontrado', cns: '', cpf: '' };
    cacheMunicipe.set(chave, r);
    return r;
  }

  async function enviarLote(unidade, itens) {
    const r = await fetch(API + '/api/ingest', {
      method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unidade, enviado_por: usuarioLogado(), itens })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.erro || `HTTP ${r.status}`);
    return j.gravados || 0;
  }

  async function processar(dias, forcar = false) {
    const unidade = unidadeLogada();
    if (!unidade) throw new Error('unidade não identificada');
    const novos = [];
    for (const dia of dias) {
      for (const it of await finalizadosDoDia(dia)) {
        const id = (String(it.encaminhamento_id || '').match(/(\d+)$/) || [])[1];
        if (!id) continue;
        const chave = `${norm(unidade)}|${id}`;
        if (!forcar && enviados[chave]) continue;
        novos.push({ id, chave, it });
      }
    }
    estado.pendentes = Math.max(0, novos.length - POR_CICLO);
    const itens = [], feitos = [];
    for (const { id, chave, it } of novos.slice(0, forcar ? 200 : POR_CICLO)) {
      const ficha = await lerFicha(id);
      const realizados = ficha.procs.filter(p => p.situacao === 'REALIZADO');
      feitos.push(chave);
      if (!realizados.length) continue;
      const nasc = clean(it.data_nascimento_municipe);
      const mun = await buscarMunicipe(clean(it.nome_municipe), nasc).catch(e => { if (e.message === 'sessao') throw e; return { status: 'nao_encontrado', cns: '', cpf: '' }; });
      for (const p of realizados) itens.push({
        enc: Number(id), idx: p.idx, atendimento: (String(it.atendimento_str || '').match(/(\d+)$/) || [])[1] || '',
        data: diaIso(it.data_encaminhamento) || dias[0], hora: clean(it.hora_encaminhamento), senha: clean(it.senha),
        nome: clean(it.nome_municipe), nascimento: nasc, cns: mun.cns, cpf: mun.cpf, sexo: '', cns_status: mun.status,
        codigo: p.codigo, procedimento: p.procedimento, cid: p.cid, medico: clean(it.profissional_responsavel), ja_lancado: ficha.faturamento
      });
      await esperar(150);
    }
    let gravados = 0;
    for (let i = 0; i < itens.length; i += LOTE) gravados += await enviarLote(unidade, itens.slice(i, i + LOTE));
    const agora = Date.now();
    for (const k of feitos) enviados[k] = agora;
    gravarEnviados();
    estado.enviados += gravados;
    return { encaminhamentos: feitos.length, procedimentos: gravados, faltam: estado.pendentes };
  }

  async function ciclo() {
    if (estado.rodando || document.hidden || !naSalaRaioX()) return;
    estado.ativo = true; estado.rodando = true;
    try {
      const hoje = new Date(), ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
      await processar([isoDia(hoje), isoDia(ontem)]);
      estado.erro = '';
    } catch (e) {
      estado.erro = String(e?.message || e);
    } finally {
      estado.rodando = false; estado.ultimoCiclo = Date.now();
    }
  }

  window.OM30RaioXFat = {
    versao: VERSAO,
    diagnostico: () => ({ versao: VERSAO, naSalaRaioX: naSalaRaioX(), unidade: unidadeLogada(), ...estado,
      ultimoCiclo: estado.ultimoCiclo ? new Date(estado.ultimoCiclo).toLocaleTimeString('pt-BR') : null, registrados: Object.keys(enviados).length }),
    // Reenvia um dia inteiro (ex.: depois de instalar, para pegar dias anteriores). Formato AAAA-MM-DD.
    enviarDia: async dia => { if (!/^\d{4}-\d{2}-\d{2}$/.test(dia || '')) throw new Error('use AAAA-MM-DD'); return processar([dia], true); }
  };

  setTimeout(ciclo, 8000);
  setInterval(ciclo, CICLO_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - estado.ultimoCiclo > CICLO_MS) ciclo(); });
})();
// ===== FIM OM30 RAIO-X FATURAMENTO =====
