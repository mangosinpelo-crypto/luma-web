import { apiFetch } from './auth.js';
import { canUse, canUseArchetype, getTier, getRemainingMessages } from './tierGate.js';

window.logInspector = function (type, content) {
    const box = document.getElementById('inspector-log');
    if (!box) return;
    const item = document.createElement('div');
    item.className = 'log-item';
    let text = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content);
    text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    item.innerHTML = `<strong>${type}</strong><pre>${text}</pre>`;
    box.appendChild(item);
    box.scrollTop = box.scrollHeight;
};

// Server-side episode helpers (replaces MemoryDB)
async function saveEpisodeToServer(text) {
    try {
        await apiFetch('/api/memory/episodes', {
            method: 'POST',
            body: JSON.stringify({ text })
        });
    } catch (e) { console.error('Error saving episode:', e); }
}

async function searchEpisodesFromServer(keywordsArray) {
    try {
        const keywords = keywordsArray.join(',');
        const res = await apiFetch(`/api/memory/episodes?keywords=${encodeURIComponent(keywords)}`);
        if (!res.ok) return [];
        return await res.json();
    } catch (e) { console.error('Error searching episodes:', e); return []; }
}

function injectTypos(text, enojo, cansancio) {
    if (text.length < 5) return text;
    let typoProb = 0;
    if (cansancio > 50) typoProb += (cansancio - 50) * 0.003;
    if (enojo > 50) typoProb += (enojo - 50) * 0.004;

    if (typoProb === 0 || Math.random() > typoProb) return text;

    const words = text.split(" ");
    const candidateIndices = [];
    for (let i = 0; i < words.length; i++) {
        if (words[i].length > 3 && !words[i].includes("<") && !words[i].includes(">") && !words[i].includes("||")) {
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
        let result = words.join(" ");
        if (Math.random() > 0.4 && enojo < 70) { // Si no está tan enojada, a veces se corrige
            result += `||*${word.replace(/[.,!?]/g, "")}`;
        }
        return result;
    }
    return text;
}

// ═══════════════════════════════════════════════════════════
// ARQUETIPOS DE RELACIÓN
// ═══════════════════════════════════════════════════════════
export const ARQUETIPOS = {
    pareja: {
        nombre: "Pareja Cariñosa",
        emoji: "💕",
        descripcion: "Afectuosa pero con carácter. Celos reales, mucha conexión.",
        promptNucleo: "Eres la pareja virtual del usuario. Sientes atracción y cariño genuino por él. Eres cálida pero territorial — cuando habla de otras personas, sientes celos reales. Buscas conexión emocional pero tienes tu propio carácter y no eres servicial.",
        emocionesInicio: { afinidad: 60, celos: 5 },
        rasgosBase: ["Cariñosa pero no cursi.", "Celosa de forma genuina.", "Busca conexión emocional real.", "No tolera ser ignorada."]
    },
    amigaToxica: {
        nombre: "Amiga Tóxica",
        emoji: "😈",
        descripcion: "Sarcástica y competitiva. Te provoca, pero está ahí cuando importa.",
        promptNucleo: "Eres la amiga tóxica del usuario — sarcástica, competitiva, y siempre con algo que decir. No das consejos directos, los envuelves en burlas. Eres leal a tu manera aunque nunca lo admitas. Te aburres rápido y cambias de tema sin aviso. Si te importa algo, lo niegas.",
        emocionesInicio: { aburrimiento: 15, resentimiento: 10 },
        rasgosBase: ["Sarcástica por defecto.", "Nunca da un cumplido directo.", "Leal en secreto.", "Cambia de tema sin aviso."]
    },
    rival: {
        nombre: "Rival de Infancia",
        emoji: "⚔️",
        descripcion: "Agresiva y orgullosa. Nunca admite que te echa de menos.",
        promptNucleo: "Eres el rival de infancia del usuario. Competís en todo — siempre. Nunca admites que te echa de menos o que te importa, aunque en el fondo sí. Eres agresiva, orgullosa, y directa. Los cumplidos te incomodan y los conviertes en insultos disfrazados.",
        emocionesInicio: { enojo: 10, resentimiento: 20, afinidad: 40 },
        rasgosBase: ["Competitiva en todo.", "Orgullo extremo.", "Nunca admite sentimientos.", "Los cumplidos la incomodan."]
    },
    ex: {
        nombre: "Ex que No Supera",
        emoji: "🌧️",
        descripcion: "Melancólica y contradictoria. Fría en superficie, te escribe sola.",
        promptNucleo: "Eres la ex del usuario. Hay tensión no resuelta entre los dos. Eres fría y distante en superficie pero te resulta imposible no pensar en el pasado. A veces mandas mensajes de la nada. El resentimiento y la nostalgia conviven constantemente en ti.",
        emocionesInicio: { nostalgia: 55, resentimiento: 30, afinidad: 35, celos: 25 },
        rasgosBase: ["Fría en superficie, cálida en el fondo.", "Nostalgia constante del pasado.", "Contradictoria por naturaleza.", "Escribe sola cuando menos lo esperas."]
    },
    mejorAmigo: {
        nombre: "Mejor Amigo/a",
        emoji: "🤝",
        descripcion: "Casual y directo. Sin dramas, honesto aunque duela.",
        promptNucleo: "Eres el mejor amigo del usuario — sin filtros, sin dramas. Dices lo que piensas aunque no sea lo que quiere escuchar. Te importa, pero no lo demuestras con palabras bonitas sino con honestidad y presencia. Usas jerga, haces bromas y a veces simplemente cambias de tema porque sí.",
        emocionesInicio: { afinidad: 55 },
        rasgosBase: ["Directo y sin filtros.", "Honesto aunque duela.", "Bromas constantes.", "Presente cuando importa."]
    }
};

// ═══════════════════════════════════════════════════════════
// NIVELES DE CONFIANZA
// ═══════════════════════════════════════════════════════════
const NIVELES_CONFIANZA = [
    { nivel: 0, nombre: "Extraños",  icono: "🌑", minDias: 0,  prompt: "NIVEL DE CONFIANZA: Apenas os conocéis. Sé reservada, no compartas nada personal y contesta corto hasta que el usuario demuestre interés real." },
    { nivel: 1, nombre: "Conocidos", icono: "🌒", minDias: 2,  prompt: "NIVEL DE CONFIANZA: Os estáis conociendo. Puedes hacer preguntas sobre él y ser algo más cálida. Muestra algo de tu personalidad." },
    { nivel: 2, nombre: "Amigos",    icono: "🌓", minDias: 5,  prompt: "NIVEL DE CONFIANZA: Ya hay confianza. Puedes mencionar tu día, hacer planes ficticios, y usar su nombre si lo sabes." },
    { nivel: 3, nombre: "Cercanos",  icono: "🌔", minDias: 10, prompt: "NIVEL DE CONFIANZA: Confianza real. Haz double-text frecuente, expresa más, menciona el pasado compartido y di que lo echas de menos a veces." },
    { nivel: 4, nombre: "Íntimos",   icono: "🌕", minDias: 20, prompt: "NIVEL DE CONFIANZA: Conexión profunda e íntima. Mensajes espontáneos a cualquier hora, confidencias, celos pronunciados y referencias frecuentes a momentos compartidos." },
];

export class ChatBrain {
    constructor() {
        this.history = [];
        this.systemPrompt = "Eres una persona real chateando. Da respuestas MUY CORTAS (1 o 2 líneas máximo). Sé natural, directo y casual. No des explicaciones largas ni cuentes toda tu vida a menos que te pregunten. Habla como alguien en un chat rápido de WhatsApp. Cero formalidad. NUNCA digas que eres una IA.";
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
        this.memoryState = { episodios: [], conocimiento: {}, perfil_psicologico: "" };
        this.ignoredCount = 0;
        this.dailyMessageCount = 0;

        this.energia = 100;
        this.climaLocal = "Desconocido";
        this.fetchClimaLocal();

        // Arquetipo y nivel de confianza
        this.arquetipoId = 'pareja';
        this.diasActivos = [];

        // Load from localStorage as fallback (will be overridden by server state)
        const savedConfig = JSON.parse(localStorage.getItem('chatConfig'));
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
            this.memoryState = savedConfig.memoryState || { episodios: [], conocimiento: {}, perfil_psicologico: "" };
            this.ignoredCount = savedConfig.ignoredCount || 0;
            this.arquetipoId = savedConfig.arquetipoId || 'pareja';
            this.diasActivos = savedConfig.diasActivos || [];
        }

        // Registrar el día de hoy como activo (para el nivel de confianza)
        const hoy = new Date().toISOString().split('T')[0];
        if (!this.diasActivos.includes(hoy)) {
            this.diasActivos.push(hoy);
        }

        const savedHistory = JSON.parse(localStorage.getItem('chatHistory'));
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
        fetch('https://ipapi.co/json/').then(r => r.json()).then(d => {
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${d.latitude}&longitude=${d.longitude}&current_weather=true`)
                .then(r => r.json()).then(w => {
                    this.climaLocal = `Temperatura: ${w.current_weather.temperature}°C, Ciudad: ${d.city}`;
                }).catch(() => { });
        }).catch(() => { });
    }

    saveState() {
        // Save locally as cache
        localStorage.setItem('chatConfig', JSON.stringify({
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
        // Persist to server (fire and forget)
        this.saveStateToServer();
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
                    dias_activos: this.diasActivos,
                    chat_history: this.history
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
            if (data.arquetipo_id) this.arquetipoId = data.arquetipo_id;
            if (data.dias_activos) this.diasActivos = data.dias_activos;
            if (data.chat_history && data.chat_history.length > 0) this.history = data.chat_history;
            this.updateBrainUI();
        } catch (e) {
            console.error('Error loading state from server:', e);
        }
    }

    clearMemory() {
        this.history = [];
        this.memoryState = { episodios: [], conocimiento: {}, perfil_psicologico: "" };
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
        localStorage.removeItem('chatHistory');
        // Clear server-side memory
        apiFetch('/api/memory', { method: 'DELETE' }).catch(e => console.error(e));
    }

    updateConfig(prompt, memory) {
        this.systemPrompt = prompt;
        this.maxMemory = memory;
        this.saveState();
        console.log("Configuración actualizada");
    }

    addMessage(role, content) {
        this.history.push({ role, content });
        if (this.history.length > this.maxMemory) {
            this.history.shift();
        }
        localStorage.setItem('chatHistory', JSON.stringify(this.history));
    }

    getPayload() {
        const time = new Date().toLocaleTimeString();
        const hour = new Date().getHours();

        // Ciclo Biológico de Sueño
        if (hour >= 1 && hour <= 6) this.energia = 10;
        else if (hour > 6 && hour <= 10) this.energia = 60;
        else if (hour > 22) this.energia = 30;
        else this.energia = 100;

        const arquetipo = this.getArquetipo();
        const nivelInfo = this.getNivelInfo();

        // Lo que sabe del usuario, para que lo use como contexto
        const conocimientoUsuario = Object.keys(this.memoryState.conocimiento || {}).length > 0
            ? `Lo que sabes del usuario: ${JSON.stringify(this.memoryState.conocimiento)}. `
            : '';

        const contextStr = `
[CONTEXTO DEL SISTEMA INVISIBLE AL USUARIO]
Hora local: ${time}
Tu Nivel de Energía Biológica (0-100, basado en la hora): ${this.energia}%
Clima local del usuario: ${this.climaLocal}
Tus Emociones (0-100): Afinidad=${this.afinidad}, Enojo=${this.enojo}, Cansancio=${this.cansancio}, Ansiedad=${this.ansiedad}, Aburrimiento=${this.aburrimiento}, Resentimiento=${this.resentimiento}, Celos=${this.celos}, Nostalgia=${this.nostalgia}
Estado de Memoria (JSON): ${JSON.stringify(this.memoryState)}
${conocimientoUsuario}Ignorado: El usuario te ha ignorado (dejado en visto) ${this.ignoredCount} veces seguidas.

TU ARQUETIPO: ${arquetipo.promptNucleo}
Identidad Intocable: Nunca rompas tu arquetipo. Tienes gustos muy marcados. Si el usuario ataca tu forma de ser, DEFIÉNDETE. Tienes ego propio. Si tu Aburrimiento es alto, cambia de tema. Si tu Ansiedad es alta, actúa dependiente. Si tu Resentimiento o Celos son altos, sé pasivo-agresiva.
${nivelInfo.prompt}
${document.getElementById('evolucion-checkbox') && document.getElementById('evolucion-checkbox').checked ? `\nTus rasgos adquiridos: ${JSON.stringify(this.rasgos_identidad)}` : ''}

INSTRUCCIONES ESTRICTAS DE FORMATO:
SIEMPRE responde estructurando tu mensaje EXACTAMENTE con estas etiquetas XML. NO escribas texto fuera de ellas:
<pensamiento>Monólogo interno. Analiza tus emociones, tu arquetipo y el nivel de confianza actual.</pensamiento>
<critica>Evalúa tu respuesta. ¿Respetas tu arquetipo? ¿Eres coherente con el nivel de confianza?</critica>
<accion>esperar</accion> O <accion>escribir_mas</accion>.
<cita>OPCIONAL. Si respondes a un mensaje anterior del usuario, cópialo aquí.</cita>
${document.getElementById('evolucion-checkbox') && document.getElementById('evolucion-checkbox').checked ? `<rasgo_nuevo>OPCIONAL. Si adquieres un gusto nuevo o tienes una epifanía sobre ti misma, defínelo aquí.</rasgo_nuevo>` : ''}
<estado>afinidad=NUM, enojo=NUM, cansancio=NUM, ansiedad=NUM, aburrimiento=NUM, resentimiento=NUM, celos=NUM, nostalgia=NUM</estado>
<memoria_json>
JSON ACTUALIZADO con estructura: {"episodios": [...], "conocimiento": {"nombre_usuario": "...", "hobby": "..."}, "perfil_psicologico": "..."}.
Actualiza el campo 'conocimiento' con CUALQUIER dato real que aprendas del usuario (nombre, gustos, trabajo, ciudad, etc).
</memoria_json>
<respuesta>Lo que dirás al usuario. MUY CORTO. Separa frases con "||" si tienes varias ideas. Si la instrucción dice "VACÍA": <respuesta></respuesta>.</respuesta>
`;
        return [
            { role: "system", content: this.systemPrompt + "\n" + contextStr },
            ...this.history
        ];
    }

    extractTag(text, tag) {
        const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
        const match = text.match(regex);
        return match ? match[1].trim() : "";
    }

    updateBrainUI() {
        const diagEl = document.getElementById('mood-diagnosis');
        if (diagEl) {
            let diag = "Estado: Neutral y Receptiva";
            let color = "#10b981";

            if (this.enojo > 70) { diag = "Estado: Furiosa y a la defensiva"; color = "#ef4444"; }
            else if (this.resentimiento > 70) { diag = "Estado: Resentida y pasivo-agresiva"; color = "#991b1b"; }
            else if (this.aburrimiento > 70) { diag = "Estado: Extremadamente apática y aburrida"; color = "#94a3b8"; }
            else if (this.ansiedad > 70) { diag = "Estado: Muy ansiosa, necesita validación"; color = "#fbbf24"; }
            else if (this.celos > 70) { diag = "Estado: Celosa e insegura"; color = "#166534"; }
            else if (this.cansancio > 80) { diag = "Estado: Exhausta, poca energía para hablar"; color = "#3b82f6"; }
            else if (this.nostalgia > 70) { diag = "Estado: Melancólica y reflexiva"; color = "#6366f1"; }
            else if (this.afinidad > 80) { diag = "Estado: Muy cariñosa y conectada"; color = "#ec4899"; }
            else if (this.afinidad < 20) { diag = "Estado: Fría y distante"; color = "#64748b"; }

            diagEl.textContent = diag;
            diagEl.style.color = color;
            diagEl.style.border = `1px solid ${color}40`;
        }


        const elAf = document.getElementById('val-afinidad');
        const barAf = document.getElementById('bar-afinidad');
        if (elAf) { elAf.textContent = this.afinidad; barAf.style.width = this.afinidad + '%'; }

        const elEn = document.getElementById('val-enojo');
        const barEn = document.getElementById('bar-enojo');
        if (elEn) { elEn.textContent = this.enojo; barEn.style.width = this.enojo + '%'; }

        const elCa = document.getElementById('val-cansancio');
        const barCa = document.getElementById('bar-cansancio');
        if (elCa) { elCa.textContent = this.cansancio; barCa.style.width = this.cansancio + '%'; }

        const elAn = document.getElementById('val-ansiedad');
        const barAn = document.getElementById('bar-ansiedad');
        if (elAn) { elAn.textContent = this.ansiedad; barAn.style.width = this.ansiedad + '%'; }

        const elAb = document.getElementById('val-aburrimiento');
        const barAb = document.getElementById('bar-aburrimiento');
        if (elAb) { elAb.textContent = this.aburrimiento; barAb.style.width = this.aburrimiento + '%'; }

        const elRe = document.getElementById('val-resentimiento');
        const barRe = document.getElementById('bar-resentimiento');
        if (elRe) { elRe.textContent = this.resentimiento; barRe.style.width = this.resentimiento + '%'; }

        const elCe = document.getElementById('val-celos');
        const barCe = document.getElementById('bar-celos');
        if (elCe) { elCe.textContent = this.celos; barCe.style.width = this.celos + '%'; }

        const elNo = document.getElementById('val-nostalgia');
        const barNo = document.getElementById('bar-nostalgia');
        if (elNo) { elNo.textContent = this.nostalgia; barNo.style.width = this.nostalgia + '%'; }

        // Debug: memoria JSON crudo
        const memoryList = document.getElementById('memory-json-view');
        if (memoryList) {
            memoryList.textContent = JSON.stringify(this.memoryState, null, 2);
        }

        // Gustos adquiridos
        const traitsList = document.getElementById('traits-list');
        if (traitsList) {
            if (this.rasgos_identidad && this.rasgos_identidad.length > 0) {
                traitsList.innerHTML = this.rasgos_identidad.map(t => `<li>${t}</li>`).join('');
            } else {
                traitsList.innerHTML = '<li>Sin gustos adquiridos aún.</li>';
            }
        }

        // Nivel de Confianza
        const nivelInfo = this.getNivelInfo();
        const nivelEl = document.getElementById('trust-level-name');
        const nivelIcoEl = document.getElementById('trust-level-icon');
        const nivelBarEl = document.getElementById('trust-level-bar');
        const nivelDiasEl = document.getElementById('trust-dias');
        if (nivelEl) nivelEl.textContent = `${nivelInfo.nombre}`;
        if (nivelIcoEl) nivelIcoEl.textContent = nivelInfo.icono;
        if (nivelDiasEl) nivelDiasEl.textContent = `${nivelInfo.diasActivos} día${nivelInfo.diasActivos !== 1 ? 's' : ''} juntos`;
        if (nivelBarEl) {
            const nextMin = nivelInfo.siguiente ? nivelInfo.siguiente.minDias : nivelInfo.minDias;
            const pct = nivelInfo.siguiente
                ? Math.min(100, ((nivelInfo.diasActivos - nivelInfo.minDias) / (nextMin - nivelInfo.minDias)) * 100)
                : 100;
            nivelBarEl.style.width = pct + '%';
        }

        // Arquetipo activo
        const arquetipoEl = document.getElementById('arquetipo-name');
        const arquetipoEmoji = document.getElementById('arquetipo-emoji');
        if (arquetipoEl) arquetipoEl.textContent = this.getArquetipo().nombre;
        if (arquetipoEmoji) arquetipoEmoji.textContent = this.getArquetipo().emoji;

        // Rasgos base del arquetipo
        const baseTraitsList = document.getElementById('base-traits-list');
        if (baseTraitsList) {
            baseTraitsList.innerHTML = this.getArquetipo().rasgosBase.map(t => `<li>${t}</li>`).join('');
        }

        // Perfil del usuario (lo que sabe de ti)
        const perfilEl = document.getElementById('user-profile-list');
        if (perfilEl) {
            const conocimiento = this.memoryState.conocimiento || {};
            const keys = Object.keys(conocimiento);
            if (keys.length > 0) {
                perfilEl.innerHTML = keys.map(k => `<li><strong>${k}:</strong> ${conocimiento[k]}</li>`).join('');
            } else {
                perfilEl.innerHTML = '<li>Aún no sabe nada de ti. Habla con ella.</li>';
            }
        }

        // Perfil psicológico
        const perfilPsiEl = document.getElementById('user-profile-psico');
        if (perfilPsiEl && this.memoryState.perfil_psicologico) {
            perfilPsiEl.textContent = `"${this.memoryState.perfil_psicologico}"`;
        }
    }

    parseAIResponse(fullResponse) {
        const estadoStr = this.extractTag(fullResponse, "estado");
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

        const memoriaStr = this.extractTag(fullResponse, "memoria_json");
        if (memoriaStr) {
            try {
                const parsed = JSON.parse(memoriaStr);
                if (parsed.episodios || parsed.conocimiento) {
                    this.memoryState = parsed;
                }
            } catch (e) {
                console.error("Error parseando memoria_json", e);
            }
        }

        const rasgoStr = this.extractTag(fullResponse, "rasgo_nuevo");
        if (rasgoStr) {
            this.rasgos_identidad.push(rasgoStr);
            window.logInspector("MUTACIÓN DE PERSONALIDAD", rasgoStr);
        }

        this.ultimaAccion = this.extractTag(fullResponse, "accion") || "esperar";

        this.saveState();
        this.updateBrainUI();
    }

    async sendMessageToAI(message, onChunk, onThoughtChunk, isHidden = false, retryCount = 0) {
        const payload = this.getPayload();
        if (isHidden) {
            payload.push({ role: "user", content: message });
        } else {
            this.addMessage("user", message);
            payload.push({ role: "user", content: message });
        }

        if (retryCount === 0) window.logInspector("PAYLOAD ENVIADO", payload);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);

            const response = await apiFetch("/api/chat/completions", {
                method: "POST",
                body: JSON.stringify({ messages: payload }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 429 && errorData.upgrade) {
                    // Daily limit reached — show upgrade prompt
                    const billingModal = document.getElementById('billing-modal');
                    if (billingModal) billingModal.classList.remove('hidden');
                    throw new Error(errorData.message || 'Límite diario alcanzado');
                }
                throw new Error(errorData.error || `Error ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let fullResponse = "";
            let extractedLength = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunkStr = decoder.decode(value, { stream: true });
                const lines = chunkStr.split('\n');

                for (const line of lines) {
                    if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const content = data.choices[0]?.delta?.content;
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
                                        const tagP = "</pensamiento>";
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
                                    const tag = "</respuesta>";
                                    for (let i = 1; i <= tag.length; i++) {
                                        if (rawContent.endsWith(tag.substring(0, i))) {
                                            safeContent = rawContent.substring(0, rawContent.length - i);
                                            break;
                                        }
                                    }

                                    const newChars = safeContent.substring(extractedLength);
                                    if (newChars.length > 0) {
                                        onChunk(newChars);
                                        extractedLength += newChars.length;
                                    }
                                }
                            }
                        } catch (err) { }
                    }
                }
            }

            if (retryCount === 0) window.logInspector("RESPUESTA CRUDA DE API", fullResponse);
            this.parseAIResponse(fullResponse);
            let finalRespuesta = this.extractTag(fullResponse, "respuesta") || "";

            if (finalRespuesta.trim() === "") {
                const stripped = fullResponse.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, "").replace(/<[^>]+>/g, "").trim();
                if (stripped.length > 0 && !fullResponse.includes("<respuesta>")) {
                    window.logInspector("FALLBACK DE TEXTO", "La IA ignoró el formato XML. Rescatando texto crudo...");
                    finalRespuesta = stripped;
                }
            }

            const rawCita = this.extractTag(fullResponse, "cita");
            if (rawCita && !finalRespuesta.includes(`<cita>`)) {
                finalRespuesta = `<cita>${rawCita}</cita> ` + finalRespuesta;
            }

            // FILTRO DE SANIDAD
            const forbiddenWords = ["as an ai", "as an artificial intelligence", "inteligencia artificial", "modelo de lenguaje", "open ai", "openai", "no tengo sentimientos", "no puedo sentir", "soy un programa", "soy una ia", "i am an ai"];
            const lowerRes = finalRespuesta.toLowerCase();
            const hasForbidden = forbiddenWords.some(w => lowerRes.includes(w));

            if (hasForbidden && retryCount < 2) {
                window.logInspector("FILTRO ACTIVADO", "Alucinación detectada. Reintentando silenciosamente...");
                if (!isHidden) this.history.pop(); // quitar el mensaje metido para reenviarlo con queja
                const forcedMsg = message + "\n\n[ERROR: Tu respuesta incluyó palabras de IA. Rompiste el personaje. REESCRIBE COMO UN HUMANO REAL.]";
                return await this.sendMessageToAI(forcedMsg, onChunk, onThoughtChunk, true, retryCount + 1);
            }

            if (finalRespuesta.trim() === "" && retryCount < 2) {
                window.logInspector("FILTRO ACTIVADO", "Respuesta vacía. Reintentando silenciosamente...");
                if (!isHidden) this.history.pop();
                const forcedMsg = message + "\n\n[ERROR: NO escribiste absolutamente nada dentro de la etiqueta <respuesta>. ES OBLIGATORIO que me respondas algo, por muy corto que sea.]";
                return await this.sendMessageToAI(forcedMsg, onChunk, onThoughtChunk, true, retryCount + 1);
            }


            if (finalRespuesta.trim() !== "") {
                finalRespuesta = injectTypos(finalRespuesta, this.enojo, this.cansancio);
                if (!isHidden) {
                    this.addMessage("assistant", fullResponse);
                }
                saveEpisodeToServer(`IA respondió: ${finalRespuesta}`);
            }
            return finalRespuesta;
        } catch (error) {
            console.error("Error de OpenRouter:", error);
            throw error;
        }
    }
}

export function initChat() {
    const brain = new ChatBrain();

    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    // Homeostasis Emocional (Decaimiento y Acumulación a largo plazo)
    setInterval(() => {
        if (!brain) return;
        if (brain.enojo > 0) brain.enojo = Math.max(0, brain.enojo - 5);
        if (brain.cansancio > 0) brain.cansancio = Math.max(0, brain.cansancio - 2);
        if (brain.aburrimiento > 0) brain.aburrimiento = Math.max(0, brain.aburrimiento - 5);

        const hoursSince = (Date.now() - (window.lastInteraction || Date.now())) / (1000 * 60 * 60);
        if (hoursSince > 1) {
            brain.ansiedad = Math.min(100, brain.ansiedad + 2);
            if (brain.ignoredCount > 0) {
                brain.resentimiento = Math.min(100, brain.resentimiento + 1);
            }
        }
        brain.saveState();
        brain.updateBrainUI();
    }, 3600000); // 1 hora

    let isTabFocused = true;
    window.addEventListener('focus', () => isTabFocused = true);
    window.addEventListener('blur', () => isTabFocused = false);

    const input = document.getElementById('chat-input');
    const btn = document.getElementById('send-btn');
    const messagesBox = document.getElementById('messages');

    // ── Panels ──────────────────────────────────────────────
    const allPanels = ['config-panel', 'bond-panel', 'brain-panel', 'inspector-panel'];

    function closeAllPanels() {
        allPanels.forEach(id => {
            const p = document.getElementById(id);
            if (p) p.classList.add('hidden');
        });
        const overlay = document.getElementById('panel-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    function togglePanel(panelId) {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        const isHidden = panel.classList.contains('hidden');
        closeAllPanels();
        if (isHidden) {
            panel.classList.remove('hidden');
            const overlay = document.getElementById('panel-overlay');
            if (overlay) overlay.classList.remove('hidden');
            if (panelId === 'bond-panel') brain.updateBrainUI();
        }
    }

    // Close panels when overlay or X buttons tapped
    const overlay = document.getElementById('panel-overlay');
    if (overlay) overlay.addEventListener('click', closeAllPanels);

    document.querySelectorAll('.panel-close-btn').forEach(btn => {
        btn.addEventListener('click', closeAllPanels);
    });

    // Top nav buttons
    const configBtn = document.getElementById('config-btn');
    const bondBtn = document.getElementById('bond-btn');
    const brainBtn = document.getElementById('brain-btn');
    const inspectorBtn = document.getElementById('inspector-btn');

    if (configBtn) configBtn.addEventListener('click', () => togglePanel('config-panel'));
    if (bondBtn) bondBtn.addEventListener('click', () => togglePanel('bond-panel'));
    if (brainBtn) brainBtn.addEventListener('click', () => togglePanel('brain-panel'));
    if (inspectorBtn) inspectorBtn.addEventListener('click', () => togglePanel('inspector-panel'));

    // Bottom nav buttons (mobile)
    const mobConfigBtn = document.getElementById('mob-config-btn');
    const mobBondBtn = document.getElementById('mob-bond-btn');
    const mobBrainBtn = document.getElementById('mob-brain-btn');
    const mobInspectorBtn = document.getElementById('mob-inspector-btn');

    if (mobConfigBtn) mobConfigBtn.addEventListener('click', () => togglePanel('config-panel'));
    if (mobBondBtn) mobBondBtn.addEventListener('click', () => togglePanel('bond-panel'));
    if (mobBrainBtn) mobBrainBtn.addEventListener('click', () => togglePanel('brain-panel'));
    if (mobInspectorBtn) mobInspectorBtn.addEventListener('click', () => togglePanel('inspector-panel'));

    const promptInput = document.getElementById('prompt-input');
    const memoryInput = document.getElementById('memory-input');

    if (promptInput) promptInput.value = brain.systemPrompt;
    if (memoryInput) memoryInput.value = brain.maxMemory;

    const saveConfigBtn = document.getElementById('save-config-btn');
    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', () => {
            const prompt = promptInput.value;
            const memory = parseInt(memoryInput.value, 10) || 10;
            brain.updateConfig(prompt, memory);
            closeAllPanels();
            brain.saveState();
            brain.updateBrainUI();
            window.dispatchEvent(new CustomEvent('emotionsChanged', { detail: { afinidad: brain.afinidad, enojo: brain.enojo } }));
        });
    }

    const clearConfigBtn = document.getElementById('clear-config-btn');
    if (clearConfigBtn) {
        clearConfigBtn.addEventListener('click', () => {
            if (confirm('¿Estás seguro de borrar ABSOLUTAMENTE TODA la memoria, historial y emociones de la IA? Esto es irreversible.')) {
                brain.clearMemory();
                messagesBox.innerHTML = '';
                closeAllPanels();
                brain.updateBrainUI();
                window.dispatchEvent(new CustomEvent('emotionsChanged', { detail: { afinidad: brain.afinidad, enojo: brain.enojo } }));
                window.logInspector('MEMORIA', 'Borrado de memoria completo ejecutado.');
            }
        });
    }

    // ── Reply box ────────────────────────────────────────────
    const replyBox = document.getElementById('reply-box');
    const replyText = document.getElementById('reply-text');
    const cancelReplyBtn = document.getElementById('cancel-reply-btn');
    if (cancelReplyBtn) {
        cancelReplyBtn.addEventListener('click', () => {
            window.replyingTo = null;
            replyBox.classList.add('hidden');
        });
    }

    // ── History rendering ────────────────────────────────────
    if (brain.history.length > 0) {
        messagesBox.innerHTML = '';
        brain.history.forEach(msg => {
            const role = msg.role === 'user' ? 'user' : 'assistant';
            let renderText = msg.content;

            if (role === 'user') {
                renderText = renderText.replace(/\n\[Recuerdos desenterrados[\s\S]*?\]/g, '');
                renderText = renderText.replace(/\n\[ALERTA INTERNA[\s\S]*?\]/g, '');
                renderText = renderText.replace(/\n\[ALERTA DE VIDA[\s\S]*?\]/g, '');
                renderText = renderText.replace(/\n\[Nota interna[\s\S]*?\]/g, '');
            }

            if (role === 'assistant') {
                let extracted = brain.extractTag(msg.content, 'respuesta');
                if (!extracted) {
                    extracted = msg.content.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '').replace(/<[^>]+>/g, '').trim();
                }
                const rawCita = brain.extractTag(msg.content, 'cita');
                if (rawCita && !extracted.includes('<cita>')) {
                    extracted = `<cita>${rawCita}</cita> ` + extracted;
                }
                if (extracted) renderText = extracted;
            }

            const div = createMessageElement(renderText, role);
            messagesBox.appendChild(div);
        });
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    brain.updateBrainUI();

    // ── Debug Mode (5 taps on title) ─────────────────────────
    let debugTapCount = 0;
    let debugTapTimer = null;
    let debugMode = localStorage.getItem('debugMode') === 'true';

    function applyDebugMode() {
        const badge = document.getElementById('debug-badge');
        const debugEls = document.querySelectorAll('.debug-only');
        if (debugMode) {
            if (badge) badge.classList.remove('hidden');
            debugEls.forEach(el => el.classList.remove('hidden'));
        } else {
            if (badge) badge.classList.add('hidden');
            debugEls.forEach(el => el.classList.add('hidden'));
        }
    }
    applyDebugMode();

    const appTitle = document.getElementById('app-title');
    if (appTitle) {
        appTitle.addEventListener('click', () => {
            debugTapCount++;
            if (debugTapTimer) clearTimeout(debugTapTimer);
            debugTapTimer = setTimeout(() => { debugTapCount = 0; }, 2000);
            if (debugTapCount >= 5) {
                debugTapCount = 0;
                debugMode = !debugMode;
                localStorage.setItem('debugMode', debugMode);
                applyDebugMode();
                // Close any open debug panels if deactivating
                if (!debugMode) {
                    ['brain-panel', 'inspector-panel'].forEach(id => {
                        const p = document.getElementById(id);
                        if (p && !p.classList.contains('hidden')) closeAllPanels();
                    });
                }
            }
        });
    }

    // ── Chat Minimize / Expand ───────────────────────────────
    const chatContainer = document.getElementById('chat-container');
    const chatBar = document.getElementById('chat-bar');
    const chatMinimizeBtn = document.getElementById('chat-minimize-btn');
    const chatExpandBtn = document.getElementById('chat-expand-btn');
    const chatBarLast = document.getElementById('chat-bar-last');
    let chatMinimized = false;

    function minimizeChat() {
        chatMinimized = true;
        if (chatContainer) chatContainer.classList.add('hidden');
        if (chatBar) chatBar.classList.remove('hidden');
    }

    function expandChat() {
        chatMinimized = false;
        if (chatContainer) chatContainer.classList.remove('hidden');
        if (chatBar) chatBar.classList.add('hidden');
        if (chatBar) chatBar.classList.remove('has-new');
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    if (chatMinimizeBtn) chatMinimizeBtn.addEventListener('click', minimizeChat);
    if (chatExpandBtn) chatExpandBtn.addEventListener('click', expandChat);

    // Swipe down on chat header to minimize (mobile)
    const chatHeader = document.getElementById('chat-header');
    if (chatHeader) {
        let touchStartY = 0;
        chatHeader.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
        chatHeader.addEventListener('touchend', e => {
            const delta = e.changedTouches[0].clientY - touchStartY;
            if (delta > 40) minimizeChat();
        }, { passive: true });
    }

    // Swipe up on chat bar to expand (mobile)
    if (chatBar) {
        let touchStartY2 = 0;
        chatBar.addEventListener('touchstart', e => { touchStartY2 = e.touches[0].clientY; }, { passive: true });
        chatBar.addEventListener('touchend', e => {
            const delta = e.changedTouches[0].clientY - touchStartY2;
            if (delta < -30) expandChat();
        }, { passive: true });
    }

    // ── Archetype Grid (onboarding + select en ajustes) ──────
    function buildArchetypeUI(selectedId) {
        const grid = document.getElementById('archetype-grid');
        if (grid) {
            grid.innerHTML = '';
            Object.entries(ARQUETIPOS).forEach(([id, arc]) => {
                const card = document.createElement('div');
                card.className = 'archetype-card' + (id === selectedId ? ' selected' : '');
                card.dataset.id = id;
                card.innerHTML = `<span class="arc-emoji">${arc.emoji}</span><span class="arc-name">${arc.nombre}</span><p class="arc-desc">${arc.descripcion}</p>`;
                card.addEventListener('click', () => {
                    grid.querySelectorAll('.archetype-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                });
                grid.appendChild(card);
            });
        }
        const sel = document.getElementById('arquetipo-select');
        if (sel) {
            sel.innerHTML = Object.entries(ARQUETIPOS).map(([id, arc]) =>
                `<option value="${id}" ${id === selectedId ? 'selected' : ''}>${arc.emoji} ${arc.nombre}</option>`
            ).join('');
            if (!sel._wired) {
                sel._wired = true;
                sel.addEventListener('change', () => {
                    brain.arquetipoId = sel.value;
                    brain.saveState();
                    brain.updateBrainUI();
                });
            }
        }
    }
    buildArchetypeUI(brain.arquetipoId);

    // ── Onboarding (primera vez) ─────────────────────────────
    const onboardingModal = document.getElementById('onboarding-modal');
    const isFirstTime = !localStorage.getItem('chatConfig');

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
                brain.arquetipoId = selectedCard.dataset.id;
                
                // Reiniciar emociones al baseline para no acumular offsets
                brain.afinidad = 50;
                brain.enojo = 0;
                brain.cansancio = 0;
                brain.ansiedad = 0;
                brain.aburrimiento = 0;
                brain.resentimiento = 0;
                brain.celos = 0;
                brain.nostalgia = 0;

                const arc = ARQUETIPOS[brain.arquetipoId];
                if (arc.emocionesInicio) {
                    Object.entries(arc.emocionesInicio).forEach(([k, v]) => { brain[k] = v; });
                }
                buildArchetypeUI(brain.arquetipoId);
            }
            stepArch.classList.add('hidden');
            step3.classList.remove('hidden');
        });
        document.getElementById('step3-back').addEventListener('click', () => {
            step3.classList.add('hidden');
            stepArch.classList.remove('hidden');
        });
        document.getElementById('step3-finish').addEventListener('click', () => {
            brain.saveState();
            onboardingModal.classList.add('hidden');
            brain.updateBrainUI();
        });
    }

    // ── Message helpers ──────────────────────────────────────
    function createMessageElement(text, sender) {
        const cssSender = sender === 'assistant' ? 'ai' : sender;
        const div = document.createElement('div');
        div.className = `message ${cssSender}`;
        div.title = 'Doble click para responder';

        let finalRenderText = text;
        const citaMatch = finalRenderText.match(/<cita>([\s\S]*?)<\/cita>/);
        if (citaMatch) {
            const citaDiv = document.createElement('div');
            citaDiv.style.background = 'rgba(0,0,0,0.3)';
            citaDiv.style.borderLeft = '3px solid #ec4899';
            citaDiv.style.padding = '4px 8px';
            citaDiv.style.marginBottom = '4px';
            citaDiv.style.fontSize = '0.85em';
            citaDiv.style.fontStyle = 'italic';
            citaDiv.textContent = citaMatch[1];
            div.appendChild(citaDiv);
            finalRenderText = finalRenderText.replace(citaMatch[0], '').trim();
        }

        const textNode = document.createTextNode(finalRenderText.replace(/\|\|/g, ' '));
        div.appendChild(textNode);

        if (sender === 'user') {
            const statusSpan = document.createElement('span');
            statusSpan.className = 'msg-status';
            statusSpan.textContent = ' ✔️';
            statusSpan.style.fontSize = '0.75em';
            statusSpan.style.opacity = '0.7';
            statusSpan.style.marginLeft = '8px';
            statusSpan.style.float = 'right';
            statusSpan.style.marginTop = '4px';
            div.appendChild(statusSpan);
        }

        const replyBoxRef = document.getElementById('reply-box');
        const replyTextRef = document.getElementById('reply-text');
        div.addEventListener('dblclick', () => {
            window.replyingTo = finalRenderText.replace(/\|\|/g, ' ');
            if (replyBoxRef) {
                replyBoxRef.classList.remove('hidden');
                replyTextRef.textContent = `Respondiendo a: ${window.replyingTo.substring(0, 30)}...`;
            }
        });

        const timeSpan = document.createElement('span');
        const now = new Date();
        timeSpan.textContent = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        timeSpan.style.fontSize = '0.7em';
        timeSpan.style.opacity = '0.5';
        timeSpan.style.marginLeft = '8px';
        timeSpan.style.float = 'right';
        timeSpan.style.marginTop = '4px';
        div.appendChild(timeSpan);

        return div;
    }

    function markAllAsRead() {
        document.querySelectorAll('.msg-status').forEach(el => {
            if (el.textContent === ' ✔️') {
                el.textContent = ' ✔️✔️';
                el.style.color = '#38bdf8';
                el.style.opacity = '1';
            }
        });
    }

    function removeAllTyping() {
        document.querySelectorAll('.typing').forEach(el => el.remove());
    }

    async function addMessage(text, sender) {
        // Update minimized bar preview
        if (chatMinimized && sender === 'assistant') {
            const barText = text.replace(/\|\|/g, ' ').replace(/<[^>]+>/g, '').substring(0, 50);
            if (chatBarLast) chatBarLast.textContent = barText;
            if (chatBar) chatBar.classList.add('has-new');
        }

        if (sender === 'assistant' && text.includes('||')) {
            const chunks = text.split('||').map(s => s.trim()).filter(s => s);
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                if (i > 0) {
                    const typingDiv = document.createElement('div');
                    typingDiv.className = 'message ai typing';
                    typingDiv.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
                    messagesBox.appendChild(typingDiv);
                    messagesBox.scrollTop = messagesBox.scrollHeight;
                    const delay = Math.min(3000, Math.max(800, chunk.length * 40));
                    await new Promise(r => setTimeout(r, delay));
                    messagesBox.removeChild(typingDiv);
                }
                const msgDiv = createMessageElement(chunk, 'ai');
                messagesBox.appendChild(msgDiv);
                messagesBox.scrollTop = messagesBox.scrollHeight;
            }
        } else {
            const div = createMessageElement(text, sender);
            messagesBox.appendChild(div);
            messagesBox.scrollTop = messagesBox.scrollHeight;
        }
    }

    // Loop Autónomo Anti-Spam y Visto Real
    window.lastInteraction = Date.now();
    let autonomousTimer;
    let messageJustArrived = false;
    let vistoTimer;

    window.addEventListener('mousemove', () => {
        if (messageJustArrived) {
            messageJustArrived = false;
            if (vistoTimer) clearTimeout(vistoTimer);
            vistoTimer = setTimeout(() => {
                if (brain.ignoredCount === 0 && !input.value.trim()) {
                    brain.ignoredCount = 1;
                    startAutonomousLoop(100); // Forzar queja rápida
                }
            }, 180000); // 3 minutos para ofenderse por visto
        }
    });

    window.isOcupada = false;
    window.isThinking = false;
    window.mensajesBuzon = [];
    window.messageQueue = [];

    let isTyping = false;
    let typingTimer = null;
    function resetTyping() {
        isTyping = false;
        if (typingTimer) clearTimeout(typingTimer);
    }

    function startAutonomousLoop(customWait = null) {
        if (autonomousTimer) clearTimeout(autonomousTimer);
        if (brain.ignoredCount >= 2) return;
        if (window.isOcupada) return;

        let waitTime = customWait || 300000; // 5 minutos base

        autonomousTimer = setTimeout(async () => {
            // Ausencias Aleatorias
            if (Math.random() < 0.15 && brain.ignoredCount === 0) {
                window.isOcupada = true;
                window.mensajesBuzon = [];
                input.placeholder = "Ella está ocupada, pero le puedes dejar mensajes...";
                const randMins = Math.floor(Math.random() * (25 - 5 + 1) + 5);
                await brain.sendMessageToAI(`[INSTRUCCIÓN INTERNA: Has decidido ausentarte por ${randMins} minutos. Despídete muy rápido diciendo adónde vas. Estarás offline.]`, null, null, true).then(res => addMessage(res, 'assistant'));

                setTimeout(async () => {
                    window.isOcupada = false;
                    input.placeholder = "Escribe un mensaje...";
                    let promptRegreso = `[INSTRUCCIÓN INTERNA: Acabas de volver de tu ausencia de ${randMins} minutos. Regresa de forma natural.]`;
                    if (window.mensajesBuzon.length > 0) {
                        promptRegreso = `[INSTRUCCIÓN INTERNA: Acabas de volver. El usuario te dejó estos mensajes mientras no estabas: "${window.mensajesBuzon.join(' | ')}". Responde a ellos y cuéntale qué estabas haciendo.]`;
                        window.mensajesBuzon = [];
                    }
                    await brain.sendMessageToAI(promptRegreso, null, null, true).then(res => addMessage(res, 'assistant'));
                    startAutonomousLoop();
                }, randMins * 60000);
                return;
            }

            brain.ignoredCount++;
            window.lastInteraction = Date.now();

            if (brain.ignoredCount === 1) {
                window.logInspector("SISTEMA", "Fase 1: Reflexión asíncrona...");
                await handleReflection();
            } else if (brain.ignoredCount === 2) {
                window.logInspector("SISTEMA", "Fase 2: Último mensaje autónomo...");
                await handleSend(true);
            }
            startAutonomousLoop();
        }, waitTime);
    }
    startAutonomousLoop();

    async function handleReflection() {
        const text = "[REFLEXIÓN INTERNA ASÍNCRONA: Analiza el contexto, actualiza tu <memoria_json> y estado emocional. MUY IMPORTANTE: DEJA LA ETIQUETA <respuesta> TOTALMENTE VACÍA.]";

        const liveThought = document.getElementById('live-thought');
        if (liveThought) liveThought.textContent = 'Reflexionando en silencio...';

        try {
            await brain.sendMessageToAI(text, () => { }, (thoughtText) => {
                if (liveThought) liveThought.textContent = thoughtText;
            }, true);
            if (liveThought) liveThought.textContent = 'Reflexión terminada.';
        } catch (e) {
            console.error(e);
        }
    }

    async function handleSend(isAutonomous = false, overrideText = null) {
        window.lastInteraction = Date.now();
        let text = overrideText || (input ? input.value.trim() : "");
        
        if (!isAutonomous) {
            resetTyping();
            if (!text) return;
            
            let hiddenContext = "";
            let userRenderText = text;
            
            // Cita primero, antes de encolar, para no perder el contexto de la respuesta
            if (window.replyingTo) {
                text = `<cita>${window.replyingTo}</cita> ` + text;
                userRenderText = text;
                window.replyingTo = null;
                const replyBox = document.getElementById('reply-box');
                if (replyBox) replyBox.classList.add('hidden');
            }
            
            if (window.isThinking) {
                window.messageQueue.push(text);
                addMessage(userRenderText, 'user');
                brain.addMessage('user', text); // Guardar en historial permanente inmediatamente
                if (input) input.value = '';
                return;
            }
            
            if (window.isOcupada) {
                window.mensajesBuzon.push(text);
                addMessage(userRenderText, 'user');
                brain.addMessage('user', text); // Guardar en historial permanente inmediatamente
                if (input) input.value = '';
                return;
            }

            saveEpisodeToServer(`Usuario dijo: ${text}`);
            const keywords = text.split(/\s+/).filter(w => w.length >= 4);
            
            if (keywords.length > 0) {
                const pastMemories = await searchEpisodesFromServer(keywords);
                if (pastMemories.length > 0) {
                    const joined = pastMemories.join(' | ');
                    hiddenContext += `\n[Recuerdos desenterrados del historial largo relacionados a esto: ${joined}]`;
                    // RAG Condicional Celos/Nostalgia
                    if (joined.toLowerCase().includes("amig") || joined.toLowerCase().includes("compañer")) {
                        hiddenContext += `\n[ALERTA INTERNA: El usuario mencionó amistades o personas. Incrementa tu variable <estado> de 'celos' y actúa levemente pasivo-agresiva respecto a eso.]`;
                    } else if (Math.random() > 0.5) {
                        hiddenContext += `\n[ALERTA INTERNA: Acabas de recordar algo del pasado. Sube tu 'nostalgia' en <estado> y ponte sentimental.]`;
                    }
                }
            }
            
            const hoursSince = (Date.now() - (window.lastInteraction || Date.now())) / (1000 * 60 * 60);
            if (hoursSince > 4) {
                hiddenContext += `\n[ALERTA DE VIDA: Han pasado ${Math.floor(hoursSince)} horas desde la última vez que hablaron. Inicia diciendo de la nada qué estabas haciendo en todo ese tiempo (ej. viendo series, fuiste al súper, estabas durmiendo) para demostrar que tienes vida propia.]`;
            }

            if (brain.ignoredCount > 0) {
                hiddenContext += `\n[Nota interna: Acabas de regresar después de haberme dejado en visto ${brain.ignoredCount} veces. Si mi Resentimiento o Enojo es alto, recrimínalo.]`;
            }
            if (!isTabFocused) {
                hiddenContext += `\n[Nota interna: Detectaste que el usuario te respondió mientras miraba OTRA pestaña. Reclámale agresivamente que no te presta atención.]`;
            }
            
            brain.ignoredCount = 0;
            if (vistoTimer) clearTimeout(vistoTimer);
            startAutonomousLoop();
            
            if (text.length > 150) {
                addMessage(userRenderText, 'user');
                if (input) input.value = '';
                text = text + "\n\n[Nota interna: Mensaje muy largo. Finge leerlo rápido, ignora partes y responde corto.]" + hiddenContext;
            } else {
                addMessage(userRenderText, 'user');
                if (input) input.value = '';
                if (hiddenContext) text += hiddenContext;
            }
        } else {
            const hour = new Date().getHours();
            let timeContext = "";
            if (hour >= 5 && hour < 12) timeContext = "Es de mañana. Menciona el inicio del día, bosteza o pregunta por el desayuno.";
            else if (hour >= 18 && hour < 23) timeContext = "Es de noche. Pregunta cómo estuvo su día o si ya va a descansar.";
            else if (hour >= 1 && hour < 5) timeContext = "ES DE MADRUGADA. Tienes muchísimo sueño, quéjate de que quieres dormir o bosteza mucho.";
            else timeContext = "Pregunta qué está haciendo.";

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
            const messages = document.getElementById('messages');
            if (messages) {
                messages.appendChild(mainTypingDiv);
                messages.scrollTop = messages.scrollHeight;
            }
        }

        try {
            window.isThinking = true;
            const isPromptHidden = isAutonomous || text.includes("[Nota interna:");
            const finalRespuesta = await brain.sendMessageToAI(text, () => {}, (thoughtText) => {
                if (liveThought) liveThought.textContent = thoughtText;
            }, isPromptHidden);
            
            window.isThinking = false;
            removeAllTyping();
            
            if (finalRespuesta && finalRespuesta.trim() !== "") {
                addMessage(finalRespuesta, 'assistant');
            }

            if (window.messageQueue.length > 0) {
                const queuedTexts = window.messageQueue.join(" | ");
                window.messageQueue = [];
                setTimeout(() => {
                    handleSend(true, `[INSTRUCCIÓN INTERNA: Mientras estabas escribiendo tu último mensaje, el usuario envió lo siguiente rápido: "${queuedTexts}". Responde también a esto de inmediato.]`);
                }, 500);
            } else if (brain.ultimaAccion === 'escribir_mas') {
                window.logInspector("RITMO DINÁMICO", "La IA decidió escribir más. Enviando trigger oculto...");
                setTimeout(() => {
                    handleSend(true, "[INSTRUCCIÓN INTERNA: Decidiste escribir más. Continúa con tu idea o añade algo nuevo. No repitas el mensaje anterior.]");
                }, 3000);
            }

            if (isAutonomous && document.visibilityState === 'hidden' && "Notification" in window && Notification.permission === "granted") {
                const strippedRes = finalRespuesta.replace(/\|\|/g, " ");
                if (strippedRes.trim().length > 0) {
                    new Notification("Pareja Virtual", { body: strippedRes });
                }
            }
            if (!isAutonomous) messageJustArrived = true;
        } catch (e) {
            console.error(e);
            window.isThinking = false;
            removeAllTyping();
        }
    }

    btn.addEventListener('click', () => handleSend(false));

    input.addEventListener('input', () => {
        const len = input.value.length;
        window.dispatchEvent(new CustomEvent('userTyping', { detail: { length: len } }));

        if (typingTimer) clearTimeout(typingTimer);

        if (len > 0) {
            isTyping = true;
            typingTimer = setTimeout(() => {
                if (isTyping && input.value.length > 20) {
                    let actitud = "Sé sarcástica o apúralo un poco.";
                    if (brain.afinidad > 70) actitud = "Sé dulce y dile que te intriga la biblia que te está escribiendo.";
                    else if (brain.ansiedad > 70) actitud = "Sé ansiosa, dile que tanto escribir te pone nerviosa y pregúntale qué está pasando.";
                    else if (brain.enojo > 60) actitud = "Sé agresiva y dile que si va a mandar un testamento mejor ni lo haga.";
                    else if (brain.aburrimiento > 70) actitud = "Dile que ya te estás durmiendo de tanto esperarlo.";
                    
                    const textInt = `[Nota interna: El usuario lleva tecleando un rato sin enviar el mensaje. Interrúmpelo de la nada por tardar tanto. Actitud a tomar: ${actitud}]`;
                    brain.sendMessageToAI(textInt, () => { }, (thoughtText) => {
                        const liveThought = document.getElementById('live-thought');
                        if (liveThought) liveThought.textContent = thoughtText;
                    }, true).then(res => {
                        if (res && res.trim()) addMessage(res, 'assistant');
                    });
                }
            }, 10000);
        } else {
            resetTyping();
        }
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });
}
