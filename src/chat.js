// ═══════════════════════════════════════════════════════════
// chat.js — Orquestador: conecta Brain, UI y Timers
// ═══════════════════════════════════════════════════════════
import { ChatBrain, saveEpisodeToServer, searchEpisodesFromServer, ARQUETIPOS } from './brain.js';
import {
    initPanels, initConfigPanel, initChatMinimize, initDebugMode,
    buildArchetypeUI, renderHistory, addMessage, markAllAsRead, removeAllTyping
} from './ui.js';
import { initTimers } from './timers.js';

export function initChat() {
    const activeChar = localStorage.getItem('lumaActiveCharacter') || 'pareja';
    const brain = new ChatBrain(activeChar);

    window.switchCharacter = (newId) => {
        localStorage.setItem('lumaActiveCharacter', newId);
        window.location.reload();
    };

    // Sync emotions + memory from server (non-blocking — updates UI when resolved)
    brain.loadStateFromServer().then(() => {
        const msgBox = document.getElementById('messages');
        if (msgBox) renderHistory(brain, msgBox);
    });

    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

    const input = document.getElementById('chat-input');
    const btn = document.getElementById('send-btn');
    const messagesBox = document.getElementById('messages');

    // ── UI Subsystems ─────────────────────────────────────────
    const { closeAllPanels } = initPanels(brain);
    initConfigPanel(brain, closeAllPanels, messagesBox);

    const chatState = initChatMinimize(messagesBox);
    initDebugMode(closeAllPanels);

    buildArchetypeUI(brain, brain.arquetipoId);
    renderHistory(brain, messagesBox);
    brain.updateBrainUI();

    // Reply box cancel
    const cancelReplyBtn = document.getElementById('cancel-reply-btn');
    const replyBox = document.getElementById('reply-box');
    if (cancelReplyBtn) {
        cancelReplyBtn.addEventListener('click', () => {
            window.replyingTo = null;
            if (replyBox) replyBox.classList.add('hidden');
        });
    }

    // ── Global state ──────────────────────────────────────────
    window.lastInteraction = Date.now(); // Init early so handleSend can use it
    window.isOcupada = false;
    window.isThinking = false;
    window.mensajesBuzon = [];
    window.messageQueue = [];
    let isTabFocused = true;
    window.addEventListener('focus', () => isTabFocused = true);
    window.addEventListener('blur', () => isTabFocused = false);

    // Forward ref — assigned after handleSend is defined
    let timers = null;

    // addMessage wrapper bound to context
    async function addMsg(text, sender) {
        return addMessage(text, sender, messagesBox, {
            getChatMinimized: chatState.chatMinimized, // getter, not value
            chatBar: chatState.chatBar,
            chatBarLast: chatState.chatBarLast
        });
    }

    // ── Onboarding ────────────────────────────────────────────
    const onboardingModal = document.getElementById('onboarding-modal');
    const isFirstTime = !localStorage.getItem('lumaOnboardingComplete');

    if (isFirstTime && onboardingModal) {
        onboardingModal.classList.remove('hidden');

        const step1 = document.getElementById('step-1');
        const stepArch = document.getElementById('step-archetype');
        const step3 = document.getElementById('step-3');

        document.getElementById('step1-next').addEventListener('click', () => {
            step1.classList.add('hidden');
            stepArch.classList.remove('hidden');
        });
        document.getElementById('step-arch-back').addEventListener('click', () => {
            stepArch.classList.add('hidden');
            step1.classList.remove('hidden');
        });
        document.getElementById('step-arch-next').addEventListener('click', () => {
            const selectedCard = document.querySelector('.archetype-card.selected');
            if (selectedCard) {
                const selectedId = selectedCard.dataset.id;
                // Check tier allows this archetype
                const { canUseArchetype } = window.__tierGate || { canUseArchetype: () => true };
                if (!canUseArchetype(selectedId)) {
                    const billingModal = document.getElementById('billing-modal');
                    if (billingModal) billingModal.classList.remove('hidden');
                    return;
                }
                brain.arquetipoId = selectedId;
                brain.afinidad = 50; brain.enojo = 0; brain.cansancio = 0;
                brain.ansiedad = 0; brain.aburrimiento = 0; brain.resentimiento = 0;
                brain.celos = 0; brain.nostalgia = 0;
                const arc = ARQUETIPOS[brain.arquetipoId];
                if (arc.emocionesInicio) {
                    Object.entries(arc.emocionesInicio).forEach(([k, v]) => { brain[k] = v; });
                }
                buildArchetypeUI(brain, brain.arquetipoId);
                stepArch.classList.add('hidden');
                step3.classList.remove('hidden');
            } else {
                alert('Por favor selecciona una personalidad para continuar.');
            }
        });
        document.getElementById('step3-back').addEventListener('click', () => {
            step3.classList.add('hidden');
            stepArch.classList.remove('hidden');
        });
        document.getElementById('step3-finish').addEventListener('click', () => {
            localStorage.setItem('lumaOnboardingComplete', 'true');
            localStorage.setItem('lumaActiveCharacter', brain.arquetipoId);
            brain.saveState();
            onboardingModal.classList.add('hidden');
            brain.updateBrainUI();

            setTimeout(async () => {
                const arquetipo = brain.getArquetipo();
                const firstMsgPrompt = `[INSTRUCCIÓN INTERNA: Es tu PRIMER mensaje con este usuario. Acaban de conocerse. Preséntate de forma natural según tu arquetipo (${arquetipo.nombre}). Sé breve, intrigante y deja ganas de responder. NO te presentes como IA.]`;
                try {
                    const res = await brain.sendMessageToAI(firstMsgPrompt, () => {}, null, true, 0, true);
                    if (res && res.trim()) await addMsg(res, 'assistant');
                } catch (e) { console.error('Error sending first message:', e); }
            }, 1000);
        });
    }

    // ── handleSend ────────────────────────────────────────────
    async function handleSend(isAutonomous = false, overrideText = null) {
        const previousInteraction = window.lastInteraction || Date.now();
        window.lastInteraction = Date.now();
        let text = overrideText || (input ? input.value.trim() : '');
        let hasHiddenContext = false;

        if (!isAutonomous) {
            if (timers) timers.resetTyping();
            if (!text) return;

            let hiddenContext = '';
            let userRenderText = text;

            if (window.replyingTo) {
                text = `<cita>${window.replyingTo}</cita> ` + text;
                userRenderText = text;
                window.replyingTo = null;
                const rb = document.getElementById('reply-box');
                if (rb) rb.classList.add('hidden');
            }

            if (window.isThinking) {
                window.messageQueue.push(text);
                await addMsg(userRenderText, 'user');
                brain.addMessage('user', text);
                if (input) input.value = '';
                return;
            }

            if (window.isOcupada) {
                window.mensajesBuzon.push(text);
                await addMsg(userRenderText, 'user');
                brain.addMessage('user', text);
                if (input) input.value = '';
                return;
            }

            const cleanUserText = text;
            saveEpisodeToServer(`Usuario dijo: ${cleanUserText}`);
            const stopWords = ['que', 'del', 'los', 'las', 'por', 'con', 'para', 'una', 'uno'];
            const keywords = text.toLowerCase().replace(/[^\w\sñáéíóú]/g, '').split(/\s+/)
                .filter(w => w.length >= 3 && !stopWords.includes(w));

            if (keywords.length > 0) {
                const pastMemories = await searchEpisodesFromServer(keywords);
                if (pastMemories.length > 0) {
                    const joined = pastMemories.join(' | ');
                    hiddenContext += `\n[Recuerdos desenterrados del historial largo relacionados a esto: ${joined}]`;
                    if (joined.toLowerCase().includes('amig') || joined.toLowerCase().includes('compañer')) {
                        hiddenContext += `\n[ALERTA INTERNA: El usuario mencionó amistades o personas. Incrementa tu variable <estado> de 'celos' y actúa levemente pasivo-agresiva respecto a eso.]`;
                    } else if (Math.random() > 0.5) {
                        hiddenContext += `\n[ALERTA INTERNA: Acabas de recordar algo del pasado. Sube tu 'nostalgia' en <estado> y ponte sentimental.]`;
                    }
                }
            }

            const hoursSince = (Date.now() - previousInteraction) / (1000 * 60 * 60);
            if (hoursSince > 4) {
                hiddenContext += `\n[ALERTA DE VIDA: Han pasado ${Math.floor(hoursSince)} horas desde la última vez que hablaron. Inicia diciendo de la nada qué estabas haciendo en todo ese tiempo.]`;
            }

            if (brain.ignoredCount > 0) {
                hiddenContext += `\n[Nota interna: Acabas de regresar después de haberme dejado en visto ${brain.ignoredCount} veces. Si mi Resentimiento o Enojo es alto, recrimínalo.]`;
            }
            if (!isTabFocused) {
                hiddenContext += `\n[Nota interna: Detectaste que el usuario te respondió mientras miraba OTRA pestaña. Reclámale agresivamente que no te presta atención.]`;
            }

            brain.ignoredCount = 0;
            if (timers) timers.clearVistoTimer();
            if (timers) timers.startAutonomousLoop();

            if (text.length > 150) {
                await addMsg(userRenderText, 'user');
                if (input) input.value = '';
                text = text + '\n\n[Nota interna: Mensaje muy largo. Finge leerlo rápido, ignora partes y responde corto.]' + hiddenContext;
                hasHiddenContext = true;
            } else {
                await addMsg(userRenderText, 'user');
                if (input) input.value = '';
                if (hiddenContext) { text += hiddenContext; hasHiddenContext = true; }
            }
        } else {
            const hour = new Date().getHours();
            let timeContext = 'Pregunta qué está haciendo.';
            if (hour >= 5 && hour < 12) timeContext = 'Es de mañana. Menciona el inicio del día, bosteza o pregunta por el desayuno.';
            else if (hour >= 18 && hour < 23) timeContext = 'Es de noche. Pregunta cómo estuvo su día o si ya va a descansar.';
            else if (hour >= 1 && hour < 5) timeContext = 'ES DE MADRUGADA. Tienes muchísimo sueño, quéjate de que quieres dormir o bosteza mucho.';
            text = `[Te han dejado en silencio. Inicia conversación MUY corta de la nada. Contexto de rutina: ${timeContext} Si el contador de ignorados es > 0, OBLIGATORIAMENTE sube tu Enojo en <estado> y sé cortante o despídete.]`;
        }

        const liveThought = document.getElementById('live-thought');
        if (liveThought) liveThought.textContent = 'Pensando...';
        markAllAsRead();

        let mainTypingDiv = null;
        if (!isAutonomous) {
            mainTypingDiv = document.createElement('div');
            mainTypingDiv.className = 'message ai typing';
            mainTypingDiv.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
            if (messagesBox) {
                messagesBox.appendChild(mainTypingDiv);
                messagesBox.scrollTop = messagesBox.scrollHeight;
            }
        }

        try {
            window.isThinking = true;
            const isPromptHidden = isAutonomous || hasHiddenContext;
            const finalRespuesta = await brain.sendMessageToAI(text, () => {}, (t) => {
                if (liveThought) liveThought.textContent = t;
            }, isPromptHidden, 0, isAutonomous);

            window.isThinking = false;
            removeAllTyping();

            if (finalRespuesta && finalRespuesta.trim() !== '') {
                await addMsg(finalRespuesta, 'assistant');
            }

            if (window.messageQueue.length > 0) {
                const queuedTexts = window.messageQueue.join(' | ');
                window.messageQueue = [];
                setTimeout(() => {
                    handleSend(true, `[INSTRUCCIÓN INTERNA: Mientras estabas escribiendo tu último mensaje, el usuario envió lo siguiente rápido: "${queuedTexts}". Responde también a esto de inmediato.]`);
                }, 500);
            } else if (brain.ultimaAccion === 'escribir_mas') {
                window.logInspector('RITMO DINÁMICO', 'La IA decidió escribir más. Enviando trigger oculto...');
                setTimeout(() => {
                    handleSend(true, '[INSTRUCCIÓN INTERNA: Decidiste escribir más. Continúa con tu idea o añade algo nuevo. No repitas el mensaje anterior.]');
                }, 3000);
            }

            if (isAutonomous && document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
                const strippedRes = finalRespuesta.replace(/\|\|/g, ' ');
                if (strippedRes.trim().length > 0) {
                    new Notification('Luma', { body: strippedRes, icon: '/luma-icon.png' });
                }
            }
            if (!isAutonomous && timers) timers.setMessageJustArrived(true);

        } catch (e) {
            console.error(e);
            window.isThinking = false;
            removeAllTyping();
            if (liveThought) liveThought.textContent = '';

            if (e.message === 'INTERNAL_LIMIT_REACHED') {
                // Silencioso
            } else if (e.message === 'USER_LIMIT_REACHED') {
                await addMsg('[Sistema: Has agotado tus mensajes diarios. Actualiza tu plan para seguir chateando.]', 'assistant');
            } else {
                await addMsg(`[Error del sistema: ${e.message}]`, 'assistant');
            }
        }
    }

    // ── Timers (se inicializan después de handleSend para el callback) ──
    timers = initTimers(brain, addMsg, handleSend, input);


    // ── Input / Send button ───────────────────────────────────
    btn.addEventListener('click', () => handleSend(false));
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });
}
