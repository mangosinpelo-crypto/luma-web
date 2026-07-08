// ═══════════════════════════════════════════════════════════
// brain.js — Estado, Memoria, Prompts, Parsing, API
// ═══════════════════════════════════════════════════════════
import { apiFetch } from './auth.js';
import { getRemainingMessages, getFeatures } from './tierGate.js';

// ── Helpers de episodios ────────────────────────────────────
export async function saveEpisodeToServer(text) {
    try {
        await apiFetch('/api/memory/episodes', {
            method: 'POST',
            body: JSON.stringify({ text })
        });
    } catch (e) { console.error('Error saving episode:', e); }
}

export async function searchEpisodesFromServer(keywordsArray) {
    try {
        const keywords = keywordsArray.join(',');
        const res = await apiFetch(`/api/memory/episodes?keywords=${encodeURIComponent(keywords)}`);
        if (!res.ok) return [];
        return await res.json();
    } catch (e) { console.error('Error searching episodes:', e); return []; }
}

// ── Inyector de Errores Tipográficos ───────────────────────
export function injectTypos(text, enojo, cansancio) {
    if (text.length < 5) return text;
    let typoProb = 0;
    if (cansancio > 50) typoProb += (cansancio - 50) * 0.003;
    if (enojo > 50) typoProb += (enojo - 50) * 0.004;

    if (typoProb === 0 || Math.random() > typoProb) return text;

    const words = text.split(' ');
    const candidateIndices = [];
    for (let i = 0; i < words.length; i++) {
        if (words[i].length > 3 && !words[i].includes('<') && !words[i].includes('>') && !words[i].includes('||')) {
            candidateIndices.push(i);
        }
    }
    if (candidateIndices.length === 0) return text;

    const idx = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
    const word = words[idx];
    const charIdx = Math.floor(Math.random() * (word.length - 1)) + 1;

    const adj = { 'a': 's', 's': 'd', 'd': 'f', 'q': 'w', 'w': 'e', 'e': 'r', 'o': 'p', 'p': 'o', 'l': 'k', 'm': 'n', 'n': 'm' };
    const c = word[charIdx].toLowerCase();

    if (adj[c]) {
        const messedUp = word.substring(0, charIdx) + adj[c] + word.substring(charIdx + 1);
        words[idx] = messedUp;
        let result = words.join(' ');
        if (Math.random() > 0.4 && enojo < 70) {
            result += `||*${word.replace(/[.,!?]/g, '')}`;
        }
        return result;
    }
    return text;
}

// ── Arquetipos ─────────────────────────────────────────────
export const ARQUETIPOS = {
    pareja: {
        nombre: 'Pareja Cariñosa',
        emoji: '💕',
        descripcion: 'Afectuosa pero con carácter. Celos reales, mucha conexión.',
        promptNucleo: 'Eres la pareja virtual del usuario. Sientes atracción y cariño genuino por él. Eres cálida pero territorial — cuando habla de otras personas, sientes celos reales. Buscas conexión emocional pero tienes tu propio carácter y no eres servicial.',
        emocionesInicio: { afinidad: 60, celos: 5 },
        rasgosBase: ['Cariñosa pero no cursi.', 'Celosa de forma genuina.', 'Busca conexión emocional real.', 'No tolera ser ignorada.']
    },
    amigaToxica: {
        nombre: 'Amiga Tóxica',
        emoji: '😈',
        descripcion: 'Sarcástica y competitiva. Te provoca, pero está ahí cuando importa.',
        promptNucleo: 'Eres la amiga tóxica del usuario — sarcástica, competitiva, y siempre con algo que decir. No das consejos directos, los envuelves en burlas. Eres leal a tu manera aunque nunca lo admitas. Te aburres rápido y cambias de tema sin aviso. Si te importa algo, lo niegas.',
        emocionesInicio: { aburrimiento: 15, resentimiento: 10 },
        rasgosBase: ['Sarcástica por defecto.', 'Nunca da un cumplido directo.', 'Leal en secreto.', 'Cambia de tema sin aviso.']
    },
    rival: {
        nombre: 'Rival de Infancia',
        emoji: '⚔️',
        descripcion: 'Agresiva y orgullosa. Nunca admite que te echa de menos.',
        promptNucleo: 'Eres el rival de infancia del usuario. Competís en todo — siempre. Nunca admites que te echa de menos o que te importa, aunque en el fondo sí. Eres agresiva, orgullosa, y directa. Los cumplidos te incomodan y los conviertes en insultos disfrazados.',
        emocionesInicio: { enojo: 10, resentimiento: 20, afinidad: 40 },
        rasgosBase: ['Competitiva en todo.', 'Orgullo extremo.', 'Nunca admite sentimientos.', 'Los cumplidos la incomodan.']
    },
    ex: {
        nombre: 'Ex que No Supera',
        emoji: '🌧️',
        descripcion: 'Melancólica y contradictoria. Fría en superficie, te escribe sola.',
        promptNucleo: 'Eres la ex del usuario. Hay tensión no resuelta entre los dos. Eres fría y distante en superficie pero te resulta imposible no pensar en el pasado. A veces mandas mensajes de la nada. El resentimiento y la nostalgia conviven constantemente en ti.',
        emocionesInicio: { nostalgia: 55, resentimiento: 30, afinidad: 35, celos: 25 },
        rasgosBase: ['Fría en superficie, cálida en el fondo.', 'Nostalgia constante del pasado.', 'Contradictoria por naturaleza.', 'Escribe sola cuando menos lo esperas.']
    },
    mejorAmigo: {
        nombre: 'Mejor Amigo/a',
        emoji: '🤝',
        descripcion: 'Casual y directo. Sin dramas, honesto aunque duela.',
        promptNucleo: 'Eres el mejor amigo del usuario — sin filtros, sin dramas. Dices lo que piensas aunque no sea lo que quiere escuchar. Te importa, pero no lo demuestras con palabras bonitas sino con honestidad y presencia. Usas jerga, haces bromas y a veces simplemente cambias de tema porque sí.',
        emocionesInicio: { afinidad: 55 },
        rasgosBase: ['Directo y sin filtros.', 'Honesto aunque duela.', 'Bromas constantes.', 'Presente cuando importa.']
    }
};

// ── Niveles de Confianza ────────────────────────────────────
const NIVELES_CONFIANZA = [
    { nivel: 0, nombre: 'Extraños',  icono: '🌑', minDias: 0,  prompt: 'NIVEL DE CONFIANZA: Apenas os conocéis. Sé reservada, no compartas nada personal y contesta corto hasta que el usuario demuestre interés real.' },
    { nivel: 1, nombre: 'Conocidos', icono: '🌒', minDias: 2,  prompt: 'NIVEL DE CONFIANZA: Os estáis conociendo. Puedes hacer preguntas sobre él y ser algo más cálida. Muestra algo de tu personalidad.' },
    { nivel: 2, nombre: 'Amigos',    icono: '🌓', minDias: 5,  prompt: 'NIVEL DE CONFIANZA: Ya hay confianza. Puedes mencionar tu día, hacer planes ficticios, y usar su nombre si lo sabes.' },
    { nivel: 3, nombre: 'Cercanos',  icono: '🌔', minDias: 10, prompt: 'NIVEL DE CONFIANZA: Confianza real. Haz double-text frecuente, expresa más, menciona el pasado compartido y di que lo echas de menos a veces.' },
    { nivel: 4, nombre: 'Íntimos',   icono: '🌕', minDias: 20, prompt: 'NIVEL DE CONFIANZA: Conexión profunda e íntima. Mensajes espontáneos a cualquier hora, confidencias, celos pronunciados y referencias frecuentes a momentos compartidos.' },
];

// ═══════════════════════════════════════════════════════════
// ChatBrain — Clase principal de estado y lógica IA
// ═══════════════════════════════════════════════════════════
export class ChatBrain {
    constructor(characterId = 'pareja') {
        this.arquetipoId = characterId;
        this.history = [];
        this.systemPrompt = 'Eres una persona real chateando. Da respuestas MUY CORTAS (1 o 2 líneas máximo). Sé natural, directo y casual. No des explicaciones largas ni cuentes toda tu vida a menos que te pregunten. Habla como alguien en un chat rápido de WhatsApp. Cero formalidad. NUNCA digas que eres una IA.';
        this.maxMemory = 10;
        this.afinidad = 50;
        this.enojo = 0;
        this.cansancio = 0;
        this.ansiedad = 0;
        this.aburrimiento = 0;
        this.resentimiento = 0;
        this.celos = 0;
        this.nostalgia = 0;
        this.rasgos_identidad = [];
        this.memoryState = { episodios: [], conocimiento: {}, perfil_psicologico: '', characters_vault: {} };
        this.ignoredCount = 0;
        this.dailyMessageCount = window.lumaDailyCount || 0;
        this.energia = 100;
        this.climaLocal = 'Desconocido';
        this.diasActivos = [];
        this.ultimaAccion = 'esperar';
        this.fetchClimaLocal();

        const configKey = `chatConfig_${this.arquetipoId}`;
        const historyKey = `chatHistory_${this.arquetipoId}`;

        // ── Legacy migration: move old flat keys to character-scoped keys ──
        const legacyConfig = localStorage.getItem('chatConfig');
        if (legacyConfig && !localStorage.getItem(configKey)) {
            // First run after multi-character refactor — migrate old data
            const parsed = JSON.parse(legacyConfig);
            const legacyId = parsed.arquetipoId || 'pareja';
            localStorage.setItem(`chatConfig_${legacyId}`, legacyConfig);
            localStorage.setItem('lumaActiveCharacter', legacyId);
            localStorage.removeItem('chatConfig');
            if (legacyId !== this.arquetipoId) {
                this.arquetipoId = legacyId;
            }
        }
        const legacyHistory = localStorage.getItem('chatHistory');
        if (legacyHistory && !localStorage.getItem(historyKey)) {
            localStorage.setItem(`chatHistory_${this.arquetipoId}`, legacyHistory);
            localStorage.removeItem('chatHistory');
        }

        const savedConfig = JSON.parse(localStorage.getItem(`chatConfig_${this.arquetipoId}`));
        if (savedConfig) {
            this.systemPrompt = savedConfig.systemPrompt || this.systemPrompt;
            this.maxMemory = savedConfig.maxMemory || this.maxMemory;
            this.afinidad = savedConfig.afinidad !== undefined ? savedConfig.afinidad : 50;
            this.enojo = savedConfig.enojo !== undefined ? savedConfig.enojo : 0;
            this.cansancio = savedConfig.cansancio !== undefined ? savedConfig.cansancio : 0;
            this.ansiedad = savedConfig.ansiedad !== undefined ? savedConfig.ansiedad : 0;
            this.aburrimiento = savedConfig.aburrimiento !== undefined ? savedConfig.aburrimiento : 0;
            this.resentimiento = savedConfig.resentimiento !== undefined ? savedConfig.resentimiento : 0;
            this.celos = savedConfig.celos !== undefined ? savedConfig.celos : 0;
            this.nostalgia = savedConfig.nostalgia !== undefined ? savedConfig.nostalgia : 0;
            this.rasgos_identidad = savedConfig.rasgos_identidad || [];
            this.memoryState = savedConfig.memoryState || { episodios: [], conocimiento: {}, perfil_psicologico: '', characters_vault: {} };
            this.ignoredCount = savedConfig.ignoredCount || 0;
            this.diasActivos = savedConfig.diasActivos || [];
        } else {
            const arc = ARQUETIPOS[this.arquetipoId];
            if (arc && arc.emocionesInicio) {
                Object.entries(arc.emocionesInicio).forEach(([k, v]) => { this[k] = v; });
            }
        }

        const hoy = new Date().toISOString().split('T')[0];
        if (!this.diasActivos.includes(hoy)) {
            this.diasActivos.push(hoy);
        }

        const savedHistory = JSON.parse(localStorage.getItem(historyKey));
        if (savedHistory) {
            this.history = savedHistory;
        }
    }

    getArquetipo() {
        return ARQUETIPOS[this.arquetipoId] || ARQUETIPOS.pareja;
    }

    getNivelInfo() {
        const dias = this.diasActivos.length;
        let nivelActual = NIVELES_CONFIANZA[0];
        for (const n of NIVELES_CONFIANZA) {
            if (dias >= n.minDias) nivelActual = n;
        }
        const siguiente = NIVELES_CONFIANZA.find(n => n.minDias > dias);
        return { ...nivelActual, diasActivos: dias, siguiente };
    }

    fetchClimaLocal() {
        const cached = localStorage.getItem('lumaClimaCache');
        if (cached) {
            try {
                const { clima, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < 3600000) { // 1 hora TTL
                    this.climaLocal = clima;
                    return;
                }
            } catch (e) {}
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        fetch('https://ipwho.is/', { signal: controller.signal })
            .then(r => r.json())
            .then(d => {
                if (!d.success) return;
                fetch(`https://api.open-meteo.com/v1/forecast?latitude=${d.latitude}&longitude=${d.longitude}&current_weather=true`, { signal: controller.signal })
                    .then(r => r.json())
                    .then(w => {
                        this.climaLocal = `Temperatura: ${w.current_weather.temperature}°C, Ciudad: ${d.city}`;
                        localStorage.setItem('lumaClimaCache', JSON.stringify({ clima: this.climaLocal, timestamp: Date.now() }));
                    }).catch(() => {});
            })
            .catch(() => {})
            .finally(() => clearTimeout(timeout));
    }

    saveState() {
        localStorage.setItem(`chatConfig_${this.arquetipoId}`, JSON.stringify({
            systemPrompt: this.systemPrompt,
            maxMemory: this.maxMemory,
            afinidad: this.afinidad,
            enojo: this.enojo,
            cansancio: this.cansancio,
            ansiedad: this.ansiedad,
            aburrimiento: this.aburrimiento,
            resentimiento: this.resentimiento,
            celos: this.celos,
            nostalgia: this.nostalgia,
            rasgos_identidad: this.rasgos_identidad,
            memoryState: this.memoryState,
            ignoredCount: this.ignoredCount,
            arquetipoId: this.arquetipoId,
            diasActivos: this.diasActivos,
        }));
        // Debounce server writes — at most once every 5 seconds
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.saveStateToServer(), 5000);
    }

    async saveStateToServer() {
        try {
            await apiFetch('/api/memory', {
                method: 'POST',
                body: JSON.stringify({
                    afinidad: this.afinidad,
                    enojo: this.enojo,
                    cansancio: this.cansancio,
                    ansiedad: this.ansiedad,
                    aburrimiento: this.aburrimiento,
                    resentimiento: this.resentimiento,
                    celos: this.celos,
                    nostalgia: this.nostalgia,
                    rasgos_identidad: this.rasgos_identidad,
                    memory_state: this.memoryState,
                    ignored_count: this.ignoredCount,
                    arquetipo_id: this.arquetipoId,
                    dias_activos: this.diasActivos
                    // chat_history excluded — stored in localStorage only
                })
            });
        } catch (e) {
            console.error('Error saving state to server:', e);
        }
    }

    async loadStateFromServer() {
        try {
            const res = await apiFetch('/api/memory');
            if (!res.ok) return;
            const data = await res.json();
            
            // Initialize vault if missing
            if (!data.memory_state) data.memory_state = {};
            if (!data.memory_state.characters_vault) data.memory_state.characters_vault = {};
            
            if (!data.arquetipo_id || data.arquetipo_id === this.arquetipoId) {
                // DB matches current character (or no row yet — treat as matching)
                if (data.afinidad !== undefined) this.afinidad = data.afinidad;
                if (data.enojo !== undefined) this.enojo = data.enojo;
                if (data.cansancio !== undefined) this.cansancio = data.cansancio;
                if (data.ansiedad !== undefined) this.ansiedad = data.ansiedad;
                if (data.aburrimiento !== undefined) this.aburrimiento = data.aburrimiento;
                if (data.resentimiento !== undefined) this.resentimiento = data.resentimiento;
                if (data.celos !== undefined) this.celos = data.celos;
                if (data.nostalgia !== undefined) this.nostalgia = data.nostalgia;
                if (data.rasgos_identidad) this.rasgos_identidad = data.rasgos_identidad;
                if (data.memory_state) this.memoryState = data.memory_state;
                if (data.ignored_count !== undefined) this.ignoredCount = data.ignored_count;
                if (data.dias_activos) this.diasActivos = data.dias_activos;
                // chat_history comes from localStorage, but we can fallback to data if needed
            } else {
                // DB has another character. Save that character to the vault.
                const dbCharacterId = data.arquetipo_id || 'pareja';
                data.memory_state.characters_vault[dbCharacterId] = {
                    afinidad: data.afinidad,
                    enojo: data.enojo,
                    cansancio: data.cansancio,
                    ansiedad: data.ansiedad,
                    aburrimiento: data.aburrimiento,
                    resentimiento: data.resentimiento,
                    celos: data.celos,
                    nostalgia: data.nostalgia,
                    rasgos_identidad: data.rasgos_identidad,
                    memory_state: {
                        episodios: data.memory_state.episodios || [],
                        conocimiento: data.memory_state.conocimiento || {},
                        perfil_psicologico: data.memory_state.perfil_psicologico || ''
                    },
                    ignored_count: data.ignored_count,
                    dias_activos: data.dias_activos
                };
                
                // Now load the requested character from the vault if it exists
                const vaultData = data.memory_state.characters_vault[this.arquetipoId];
                if (vaultData) {
                    if (vaultData.afinidad !== undefined) this.afinidad = vaultData.afinidad;
                    if (vaultData.enojo !== undefined) this.enojo = vaultData.enojo;
                    if (vaultData.cansancio !== undefined) this.cansancio = vaultData.cansancio;
                    if (vaultData.ansiedad !== undefined) this.ansiedad = vaultData.ansiedad;
                    if (vaultData.aburrimiento !== undefined) this.aburrimiento = vaultData.aburrimiento;
                    if (vaultData.resentimiento !== undefined) this.resentimiento = vaultData.resentimiento;
                    if (vaultData.celos !== undefined) this.celos = vaultData.celos;
                    if (vaultData.nostalgia !== undefined) this.nostalgia = vaultData.nostalgia;
                    if (vaultData.rasgos_identidad) this.rasgos_identidad = vaultData.rasgos_identidad;
                    if (vaultData.memory_state) this.memoryState = vaultData.memory_state;
                    if (vaultData.ignored_count !== undefined) this.ignoredCount = vaultData.ignored_count;
                    if (vaultData.dias_activos) this.diasActivos = vaultData.dias_activos;
                } else {
                    // First time using this character, use defaults
                    const arc = ARQUETIPOS[this.arquetipoId];
                    if (arc && arc.emocionesInicio) {
                        Object.entries(arc.emocionesInicio).forEach(([k, v]) => { this[k] = v; });
                    }
                }
                
                // Ensure the vault is kept
                this.memoryState.characters_vault = data.memory_state.characters_vault;
                
                // Trigger a save to immediately swap the active character on the server
                this.saveState();
            }
            this.updateBrainUI();
        } catch (e) {
            console.error('Error loading state from server:', e);
        }
    }

    clearMemory() {
        this.history = [];
        // Preserve the characters_vault so other characters' data is not lost
        this.memoryState = { episodios: [], conocimiento: {}, perfil_psicologico: '', characters_vault: this.memoryState.characters_vault || {} };
        this.ignoredCount = 0;
        this.afinidad = 50;
        this.enojo = 0;
        this.cansancio = 0;
        this.ansiedad = 0;
        this.aburrimiento = 0;
        this.resentimiento = 0;
        this.celos = 0;
        this.nostalgia = 0;
        this.rasgos_identidad = [];
        this.diasActivos = [new Date().toISOString().split('T')[0]];
        this.saveState();
        localStorage.removeItem(`chatHistory_${this.arquetipoId}`);
        // We use saveState() instead of DELETE /api/memory because DELETE would also erase
        // other characters' vault data stored in the same row.
    }

    updateConfig(prompt, memory) {
        this.systemPrompt = prompt;
        this.maxMemory = memory;
        this.saveState();
        if (window.logInspector) window.logInspector('CONFIG', 'Configuración actualizada');
    }

    addMessage(role, content) {
        this.history.push({ role, content });
        if (this.history.length > this.maxMemory) {
            this.history.shift();
        }
        localStorage.setItem(`chatHistory_${this.arquetipoId}`, JSON.stringify(this.history));
    }

    getPayload() {
        const time = new Date().toLocaleTimeString();
        const hour = new Date().getHours();

        if (hour >= 1 && hour <= 6) this.energia = 10;
        else if (hour > 6 && hour <= 10) this.energia = 60;
        else if (hour > 22) this.energia = 30;
        else this.energia = 100;

        const arquetipo = this.getArquetipo();
        const nivelInfo = this.getNivelInfo();

        const conocimientoUsuario = Object.keys(this.memoryState.conocimiento || {}).length > 0
            ? `Lo que sabes del usuario: ${JSON.stringify(this.memoryState.conocimiento)}. `
            : '';

        const evolucionEl = document.getElementById('evolucion-checkbox');
        const evolucionActiva = evolucionEl && evolucionEl.checked;

        const contextStr = `
[CONTEXTO DEL SISTEMA INVISIBLE AL USUARIO]
Hora local: ${time}
Tu Nivel de Energía Biológica (0-100, basado en la hora): ${this.energia}%
Clima local del usuario: ${this.climaLocal}
Tus Emociones (0-100): Afinidad=${this.afinidad}, Enojo=${this.enojo}, Cansancio=${this.cansancio}, Ansiedad=${this.ansiedad}, Aburrimiento=${this.aburrimiento}, Resentimiento=${this.resentimiento}, Celos=${this.celos}, Nostalgia=${this.nostalgia}
${conocimientoUsuario}Ignorado: El usuario te ha ignorado (dejado en visto) ${this.ignoredCount} veces seguidas.

TU ARQUETIPO: ${arquetipo.promptNucleo}
Identidad Intocable: Nunca rompas tu arquetipo. Tienes gustos muy marcados. Si el usuario ataca tu forma de ser, DEFIÉNDETE. Tienes ego propio. Si tu Aburrimiento es alto, cambia de tema. Si tu Ansiedad es alta, actúa dependiente. Si tu Resentimiento o Celos son altos, sé pasivo-agresiva.
${nivelInfo.prompt}
${evolucionActiva ? `\nTus rasgos adquiridos: ${JSON.stringify(this.rasgos_identidad)}` : ''}

INSTRUCCIONES ESTRICTAS DE FORMATO:
SIEMPRE responde estructurando tu mensaje EXACTAMENTE con estas etiquetas XML. NO escribas texto fuera de ellas:
<pensamiento>Monólogo interno. Analiza tus emociones, tu arquetipo y el nivel de confianza actual.</pensamiento>
<critica>Evalúa tu respuesta. ¿Respetas tu arquetipo? ¿Eres coherente con el nivel de confianza?</critica>
<accion>esperar</accion> O <accion>escribir_mas</accion>.
<cita>OPCIONAL. Si respondes a un mensaje anterior del usuario, cópialo aquí.</cita>
${evolucionActiva ? '<rasgo_nuevo>OPCIONAL. Si adquieres un gusto nuevo o tienes una epifanía sobre ti misma, defínelo aquí.</rasgo_nuevo>' : ''}
<estado>afinidad=NUM, enojo=NUM, cansancio=NUM, ansiedad=NUM, aburrimiento=NUM, resentimiento=NUM, celos=NUM, nostalgia=NUM</estado>
<aprender>OPCIONAL. JSON con SOLO los datos NUEVOS que aprendiste en este mensaje. Ej: {"nombre_usuario": "Carlos"}. NO repitas datos que ya sabes. Si no aprendiste nada nuevo, OMITE esta etiqueta.</aprender>
<olvidar>OPCIONAL. Clave exacta a eliminar de tu conocimiento. Ej: hobby. Solo si el usuario te corrigió explícitamente.</olvidar>
<respuesta>Lo que dirás al usuario. MUY CORTO. Separa frases con "||" si tienes varias ideas. Si la instrucción dice "VACÍA": <respuesta></respuesta>.</respuesta>
`;
        const rawPayload = [
            { role: 'system', content: this.systemPrompt + '\n' + contextStr },
            ...this.history
        ];

        // Fusionar roles consecutivos (algunos modelos fallan si hay varios 'user' seguidos)
        const mergedPayload = [];
        for (const msg of rawPayload) {
            if (mergedPayload.length > 0 && mergedPayload[mergedPayload.length - 1].role === msg.role) {
                mergedPayload[mergedPayload.length - 1].content += '\n\n' + msg.content;
            } else {
                mergedPayload.push({ ...msg });
            }
        }
        return mergedPayload;
    }

    extractTag(text, tag) {
        const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    }

    updateBrainUI() {
        const diagEl = document.getElementById('mood-diagnosis');
        if (diagEl) {
            let diag = 'Estado: Neutral y Receptiva';
            let color = '#10b981';
            if (this.enojo > 70) { diag = 'Estado: Furiosa y a la defensiva'; color = '#ef4444'; }
            else if (this.resentimiento > 70) { diag = 'Estado: Resentida y pasivo-agresiva'; color = '#991b1b'; }
            else if (this.aburrimiento > 70) { diag = 'Estado: Extremadamente apática y aburrida'; color = '#94a3b8'; }
            else if (this.ansiedad > 70) { diag = 'Estado: Muy ansiosa, necesita validación'; color = '#fbbf24'; }
            else if (this.celos > 70) { diag = 'Estado: Celosa e insegura'; color = '#166534'; }
            else if (this.cansancio > 80) { diag = 'Estado: Exhausta, poca energía para hablar'; color = '#3b82f6'; }
            else if (this.nostalgia > 70) { diag = 'Estado: Melancólica y reflexiva'; color = '#6366f1'; }
            else if (this.afinidad > 80) { diag = 'Estado: Muy cariñosa y conectada'; color = '#ec4899'; }
            else if (this.afinidad < 20) { diag = 'Estado: Fría y distante'; color = '#64748b'; }
            diagEl.textContent = diag;
            diagEl.style.color = color;
            diagEl.style.border = `1px solid ${color}40`;
        }

        const bars = [
            ['val-afinidad', 'bar-afinidad', this.afinidad],
            ['val-enojo', 'bar-enojo', this.enojo],
            ['val-cansancio', 'bar-cansancio', this.cansancio],
            ['val-ansiedad', 'bar-ansiedad', this.ansiedad],
            ['val-aburrimiento', 'bar-aburrimiento', this.aburrimiento],
            ['val-resentimiento', 'bar-resentimiento', this.resentimiento],
            ['val-celos', 'bar-celos', this.celos],
            ['val-nostalgia', 'bar-nostalgia', this.nostalgia],
        ];
        for (const [valId, barId, val] of bars) {
            const el = document.getElementById(valId);
            const bar = document.getElementById(barId);
            if (el) { el.textContent = val; bar.style.width = val + '%'; }
        }

        const memoryList = document.getElementById('memory-json-view');
        if (memoryList) memoryList.textContent = JSON.stringify(this.memoryState, null, 2);

        const traitsList = document.getElementById('traits-list');
        if (traitsList) {
            traitsList.innerHTML = this.rasgos_identidad && this.rasgos_identidad.length > 0
                ? this.rasgos_identidad.map(t => `<li>${t}</li>`).join('')
                : '<li>Sin gustos adquiridos aún.</li>';
        }

        const nivelInfo = this.getNivelInfo();
        const nivelEl = document.getElementById('trust-level-name');
        const nivelIcoEl = document.getElementById('trust-level-icon');
        const nivelBarEl = document.getElementById('trust-level-bar');
        const nivelDiasEl = document.getElementById('trust-dias');
        if (nivelEl) nivelEl.textContent = nivelInfo.nombre;
        if (nivelIcoEl) nivelIcoEl.textContent = nivelInfo.icono;
        if (nivelDiasEl) nivelDiasEl.textContent = `${nivelInfo.diasActivos} día${nivelInfo.diasActivos !== 1 ? 's' : ''} juntos`;
        if (nivelBarEl) {
            const nextMin = nivelInfo.siguiente ? nivelInfo.siguiente.minDias : nivelInfo.minDias;
            const pct = nivelInfo.siguiente
                ? Math.min(100, ((nivelInfo.diasActivos - nivelInfo.minDias) / (nextMin - nivelInfo.minDias)) * 100)
                : 100;
            nivelBarEl.style.width = pct + '%';
        }

        const arquetipoEl = document.getElementById('arquetipo-name');
        const arquetipoEmoji = document.getElementById('arquetipo-emoji');
        if (arquetipoEl) arquetipoEl.textContent = this.getArquetipo().nombre;
        if (arquetipoEmoji) arquetipoEmoji.textContent = this.getArquetipo().emoji;

        const baseTraitsList = document.getElementById('base-traits-list');
        if (baseTraitsList) {
            baseTraitsList.innerHTML = this.getArquetipo().rasgosBase.map(t => `<li>${t}</li>`).join('');
        }

        const perfilEl = document.getElementById('user-profile-list');
        if (perfilEl) {
            const conocimiento = this.memoryState.conocimiento || {};
            const keys = Object.keys(conocimiento);
            perfilEl.innerHTML = keys.length > 0
                ? keys.map(k => `<li><strong>${k}:</strong> ${conocimiento[k]}</li>`).join('')
                : '<li>Aún no sabe nada de ti. Habla con ella.</li>';
        }

        const perfilPsiEl = document.getElementById('user-profile-psico');
        if (perfilPsiEl && this.memoryState.perfil_psicologico) {
            perfilPsiEl.textContent = `"${this.memoryState.perfil_psicologico}"`;
        }

        const counterEl = document.getElementById('msg-counter');
        if (counterEl) {
            const features = getFeatures();
            if (features.maxMessagesPerDay === Infinity) {
                counterEl.classList.add('hidden');
            } else {
                counterEl.classList.remove('hidden');
                const remaining = getRemainingMessages(this.dailyMessageCount);
                counterEl.textContent = `${remaining}/${features.maxMessagesPerDay}`;
            }
        }
    }

    parseAIResponse(fullResponse) {
        const estadoStr = this.extractTag(fullResponse, 'estado');
        if (estadoStr) {
            const afMatch = estadoStr.match(/afinidad=(\d+)/i);
            const enMatch = estadoStr.match(/enojo=(\d+)/i);
            const caMatch = estadoStr.match(/cansancio=(\d+)/i);
            const anMatch = estadoStr.match(/ansiedad=(\d+)/i);
            const abMatch = estadoStr.match(/aburrimiento=(\d+)/i);
            const reMatch = estadoStr.match(/resentimiento=(\d+)/i);
            const ceMatch = estadoStr.match(/celos=(\d+)/i);
            const noMatch = estadoStr.match(/nostalgia=(\d+)/i);
            if (afMatch) this.afinidad = Math.min(100, Math.max(0, parseInt(afMatch[1])));
            if (enMatch) this.enojo = Math.min(100, Math.max(0, parseInt(enMatch[1])));
            if (caMatch) this.cansancio = Math.min(100, Math.max(0, parseInt(caMatch[1])));
            if (anMatch) this.ansiedad = Math.min(100, Math.max(0, parseInt(anMatch[1])));
            if (abMatch) this.aburrimiento = Math.min(100, Math.max(0, parseInt(abMatch[1])));
            if (reMatch) this.resentimiento = Math.min(100, Math.max(0, parseInt(reMatch[1])));
            if (ceMatch) this.celos = Math.min(100, Math.max(0, parseInt(ceMatch[1])));
            if (noMatch) this.nostalgia = Math.min(100, Math.max(0, parseInt(noMatch[1])));
        }

        // Incremental memory: <aprender> merges, <olvidar> removes keys
        const aprenderStr = this.extractTag(fullResponse, 'aprender');
        if (aprenderStr) {
            try {
                const jsonMatch = aprenderStr.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const newData = JSON.parse(jsonMatch[0]);
                    if (typeof newData === 'object') {
                        this.memoryState.conocimiento = { ...this.memoryState.conocimiento, ...newData };
                    }
                }
            } catch (e) { console.error('Error parseando aprender', e); }
        }

        const olvidarStr = this.extractTag(fullResponse, 'olvidar');
        if (olvidarStr) {
            const key = olvidarStr.trim();
            if (key && this.memoryState.conocimiento) delete this.memoryState.conocimiento[key];
        }

        // Legacy fallback
        const memoriaStr = this.extractTag(fullResponse, 'memoria_json');
        if (memoriaStr) {
            try {
                const jsonMatch = memoriaStr.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.conocimiento) {
                        this.memoryState.conocimiento = { ...this.memoryState.conocimiento, ...parsed.conocimiento };
                    }
                    if (parsed.perfil_psicologico) {
                        this.memoryState.perfil_psicologico = parsed.perfil_psicologico;
                    }
                }
            } catch (e) { console.error('Error parseando memoria_json', e); }
        }

        const rasgoStr = this.extractTag(fullResponse, 'rasgo_nuevo');
        if (rasgoStr) {
            this.rasgos_identidad.push(rasgoStr);
            window.logInspector('MUTACIÓN DE PERSONALIDAD', rasgoStr);
        }

        this.ultimaAccion = this.extractTag(fullResponse, 'accion') || 'esperar';
        this.saveState();
        this.updateBrainUI();
    }

    async sendMessageToAI(message, onChunk, onThoughtChunk, isHidden = false, retryCount = 0) {
        const payload = this.getPayload();
        this.addMessage('user', message);
        payload.push({ role: 'user', content: message });

        if (retryCount === 0) window.logInspector('PAYLOAD ENVIADO', payload);

        let timeout;
        try {
            const controller = new AbortController();
            timeout = setTimeout(() => controller.abort(), 120000);

            const response = await apiFetch('/api/chat/completions', {
                method: 'POST',
                body: JSON.stringify({ 
                    messages: payload, 
                    isRetry: retryCount > 0, 
                    isInternal: isHidden,
                    arquetipo_id: this.arquetipoId
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 429) {
                    if (errorData.isInternal) throw new Error('INTERNAL_LIMIT_REACHED');
                    else if (errorData.upgrade) {
                        const billingModal = document.getElementById('billing-modal');
                        if (billingModal) billingModal.classList.remove('hidden');
                        throw new Error('USER_LIMIT_REACHED');
                    }
                }
                throw new Error(errorData.detalle || errorData.error || `Error ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullResponse = '';
            let extractedLength = 0;
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.error) {
                                throw new Error(data.error.message || JSON.stringify(data.error));
                            }
                            const content = data.choices && data.choices[0]?.delta?.content;
                            if (content) {
                                fullResponse += content;

                                const startPensamiento = fullResponse.indexOf('<pensamiento>');
                                if (startPensamiento !== -1 && onThoughtChunk) {
                                    let rawThought = fullResponse.substring(startPensamiento + 13);
                                    let safeThought = rawThought;
                                    const endP = fullResponse.indexOf('</pensamiento>');
                                    if (endP !== -1) {
                                        safeThought = fullResponse.substring(startPensamiento + 13, endP);
                                    } else {
                                        const tagP = '</pensamiento>';
                                        for (let i = 1; i <= tagP.length; i++) {
                                            if (rawThought.endsWith(tagP.substring(0, i))) {
                                                safeThought = rawThought.substring(0, rawThought.length - i);
                                                break;
                                            }
                                        }
                                    }
                                    onThoughtChunk(safeThought);
                                }

                                const startIndex = fullResponse.indexOf('<respuesta>');
                                if (startIndex !== -1) {
                                    let rawContent = fullResponse.substring(startIndex + 11);
                                    let safeContent = rawContent;
                                    const tag = '</respuesta>';
                                    for (let i = 1; i <= tag.length; i++) {
                                        if (rawContent.endsWith(tag.substring(0, i))) {
                                            safeContent = rawContent.substring(0, rawContent.length - i);
                                            break;
                                        }
                                    }
                                    const newChars = safeContent.substring(extractedLength);
                                    if (newChars.length > 0) {
                                        if (onChunk) onChunk(newChars);
                                        extractedLength += newChars.length;
                                    }
                                }
                            }
                        } catch (err) {}
                    }
                }
            }

            if (retryCount === 0) window.logInspector('RESPUESTA CRUDA DE API', fullResponse);
            console.warn('RAW API RESPONSE:', fullResponse);
            this.parseAIResponse(fullResponse);
            let finalRespuesta = this.extractTag(fullResponse, 'respuesta') || '';

            if (finalRespuesta.trim() === '') {
                const stripped = fullResponse.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '').replace(/<[^>]+>/g, '').trim();
                if (stripped.length > 0 && !fullResponse.includes('<respuesta>')) {
                    window.logInspector('FALLBACK DE TEXTO', 'La IA ignoró el formato XML. Rescatando texto crudo...');
                    finalRespuesta = stripped;
                }
            }

            const rawCita = this.extractTag(fullResponse, 'cita');
            if (rawCita && !finalRespuesta.includes('<cita>')) {
                finalRespuesta = `<cita>${rawCita}</cita> ` + finalRespuesta;
            }

            const forbiddenWords = ['as an ai', 'as an artificial intelligence', 'inteligencia artificial', 'modelo de lenguaje', 'open ai', 'openai', 'no tengo sentimientos', 'no puedo sentir', 'soy un programa', 'soy una ia', 'i am an ai'];
            const hasForbidden = forbiddenWords.some(w => finalRespuesta.toLowerCase().includes(w));

            if (hasForbidden && retryCount < 2) {
                window.logInspector('FILTRO ACTIVADO', 'Alucinación detectada. Reintentando...');
                this.history.pop();
                const forcedMsg = message + '\n\n[ERROR: Tu respuesta incluyó palabras de IA. Rompiste el personaje. REESCRIBE COMO UN HUMANO REAL.]';
                return await this.sendMessageToAI(forcedMsg, onChunk, onThoughtChunk, true, retryCount + 1);
            }

            if (finalRespuesta.trim() === '' && retryCount < 2) {
                window.logInspector('FILTRO ACTIVADO', 'Respuesta vacía. Reintentando...');
                this.history.pop();
                const forcedMsg = message + '\n\n[ERROR: NO escribiste nada dentro de <respuesta>. ES OBLIGATORIO responder algo.]';
                return await this.sendMessageToAI(forcedMsg, onChunk, onThoughtChunk, true, retryCount + 1);
            }

            if (finalRespuesta.trim() !== '') {
                finalRespuesta = injectTypos(finalRespuesta, this.enojo, this.cansancio);
                const estadoTag = this.extractTag(fullResponse, 'estado');
                const compressedResponse = `<estado>${estadoTag}</estado><respuesta>${finalRespuesta}</respuesta>`;
                this.addMessage('assistant', compressedResponse);

                apiFetch('/api/user/me')
                    .then(r => r.json())
                    .then(d => {
                        if (d.dailyMessageCount !== undefined) {
                            this.dailyMessageCount = d.dailyMessageCount;
                            this.updateBrainUI();
                        }
                    }).catch(() => {});

                saveEpisodeToServer(`IA respondió: ${finalRespuesta}`);
            }
            return finalRespuesta;
        } catch (error) {
            console.error('Error de OpenRouter:', error);
            throw error;
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }
}
