const AUTH_TOKEN_STORAGE_KEY = 'authToken';
const backToAdminButton = document.getElementById('backToAdmin');
const openForgeButton = document.getElementById('openForge');
const openAssetsButton = document.getElementById('openAssets');
const statusText = document.getElementById('statusText');
const archetypeSelect = document.getElementById('archetypeSelect');
const resetBuildButton = document.getElementById('resetBuild');
const randomizeBuildButton = document.getElementById('randomizeBuild');
const exportDirectoryInput = document.getElementById('exportDirectory');
const exportFileNameInput = document.getElementById('exportFileName');
const overwriteToggle = document.getElementById('overwriteToggle');
const exportSpriteButton = document.getElementById('exportSprite');
const controlsHost = document.getElementById('controlsHost');
const basePreview = document.getElementById('basePreview');
const generatedPreview = document.getElementById('generatedPreview');
const builderSummary = document.getElementById('builderSummary');
const builderMeta = document.getElementById('builderMeta');
const controlCount = document.getElementById('controlCount');
const exportInfo = document.getElementById('exportInfo');

const SCHEMAS = {
    operator: {
        label: 'Operator',
        defaults: {
            bodyShape: 'rounded',
            helmetStyle: 'classic',
            visorStyle: 'wide',
            shoulderStyle: 'pads',
            legStyle: 'standard',
            antennaStyle: 'none',
            weaponStyle: 'rifle',
            accentStyle: 'belt',
            primary: '#61b8ff',
            secondary: '#2a78d6',
            accent: '#ffd166',
            visor: '#c6f4ff',
            dark: '#18293c',
            glow: '#ff7657'
        },
        fields: [
            { key: 'bodyShape', label: 'Body Shape', type: 'select', options: ['rounded', 'heavy', 'slim'] },
            { key: 'helmetStyle', label: 'Helmet', type: 'select', options: ['classic', 'scout', 'sentinel'] },
            { key: 'visorStyle', label: 'Visor', type: 'select', options: ['wide', 'slit', 'tri'] },
            { key: 'shoulderStyle', label: 'Shoulders', type: 'select', options: ['none', 'pads', 'mantle'] },
            { key: 'legStyle', label: 'Legs', type: 'select', options: ['standard', 'tank', 'agile'] },
            { key: 'antennaStyle', label: 'Antenna', type: 'select', options: ['none', 'single', 'twin'] },
            { key: 'weaponStyle', label: 'Weapon Silhouette', type: 'select', options: ['none', 'rifle', 'cannon', 'blade'] },
            { key: 'accentStyle', label: 'Accent', type: 'select', options: ['belt', 'core', 'chevrons'] },
            { key: 'primary', label: 'Primary Armor', type: 'color' },
            { key: 'secondary', label: 'Secondary Armor', type: 'color' },
            { key: 'accent', label: 'Trim', type: 'color' },
            { key: 'visor', label: 'Visor', type: 'color' },
            { key: 'dark', label: 'Undersuit', type: 'color' },
            { key: 'glow', label: 'Signal Light', type: 'color' }
        ]
    },
    enemy: {
        label: 'Enemy',
        defaults: {
            bodyShape: 'diamond',
            hornStyle: 'crown',
            eyeStyle: 'duo',
            mouthStyle: 'fangs',
            legStyle: 'stalks',
            auraStyle: 'glow',
            shell: '#ff6f61',
            shellDeep: '#9a201d',
            core: '#2a0909',
            glow: '#ff3131',
            teeth: '#fff4ef',
            shadow: '#150404'
        },
        fields: [
            { key: 'bodyShape', label: 'Body Shape', type: 'select', options: ['diamond', 'brute', 'skull'] },
            { key: 'hornStyle', label: 'Horn Style', type: 'select', options: ['none', 'crown', 'tusks'] },
            { key: 'eyeStyle', label: 'Eyes', type: 'select', options: ['mono', 'duo', 'tri'] },
            { key: 'mouthStyle', label: 'Mouth', type: 'select', options: ['fangs', 'grill', 'runes'] },
            { key: 'legStyle', label: 'Legs', type: 'select', options: ['stalks', 'heavy', 'tendrils'] },
            { key: 'auraStyle', label: 'Aura', type: 'select', options: ['none', 'glow', 'runes'] },
            { key: 'shell', label: 'Shell Main', type: 'color' },
            { key: 'shellDeep', label: 'Shell Deep', type: 'color' },
            { key: 'core', label: 'Core Shadow', type: 'color' },
            { key: 'glow', label: 'Eye Glow', type: 'color' },
            { key: 'teeth', label: 'Teeth/Runes', type: 'color' },
            { key: 'shadow', label: 'Drop Shadow', type: 'color' }
        ]
    },
    drone: {
        label: 'Drone',
        defaults: {
            coreShape: 'orb',
            wingStyle: 'dual',
            eyeStyle: 'scan',
            thrusterStyle: 'down',
            antennaStyle: 'top',
            shell: '#7bd9ff',
            plate: '#294a68',
            accent: '#7bf1c8',
            eye: '#ffd166',
            thruster: '#ff8a65',
            shadow: '#09131d'
        },
        fields: [
            { key: 'coreShape', label: 'Core Shape', type: 'select', options: ['orb', 'hex', 'prism'] },
            { key: 'wingStyle', label: 'Wing Style', type: 'select', options: ['dual', 'tri', 'ring'] },
            { key: 'eyeStyle', label: 'Sensor', type: 'select', options: ['mono', 'scan', 'triple'] },
            { key: 'thrusterStyle', label: 'Thrusters', type: 'select', options: ['none', 'down', 'omni'] },
            { key: 'antennaStyle', label: 'Antenna', type: 'select', options: ['none', 'top', 'side'] },
            { key: 'shell', label: 'Shell', type: 'color' },
            { key: 'plate', label: 'Plate', type: 'color' },
            { key: 'accent', label: 'Accent', type: 'color' },
            { key: 'eye', label: 'Sensor Glow', type: 'color' },
            { key: 'thruster', label: 'Thruster', type: 'color' },
            { key: 'shadow', label: 'Shadow', type: 'color' }
        ]
    }
};

let state = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function setStatus(message, isError = false) {
    statusText.textContent = message;
    statusText.className = isError ? 'status error' : 'status muted';
}

function getAuthToken() {
    try {
        return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
    } catch (error) {
        return '';
    }
}

function redirectToMain(reason = 'required') {
    window.location.href = `/?admin=${encodeURIComponent(reason)}`;
}

function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function adminRequest(url, options = {}) {
    const response = await fetch(url, {
        headers: getHeaders(),
        cache: 'no-store',
        credentials: 'same-origin',
        ...options
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!response.ok) {
        if (response.status === 401) {
            redirectToMain('required');
            throw new Error('Sign in with an admin account to access Sprite Builder.');
        }
        if (response.status === 403) {
            redirectToMain('forbidden');
            throw new Error('This account does not have admin access.');
        }
        throw new Error(payload?.message || payload?.error || `Request failed (${response.status}).`);
    }
    return payload;
}

function toDataUrl(svgText) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

function normalizeHexColor(value) {
    const trimmed = String(value || '').trim();
    if (!/^#[0-9a-f]{3,8}$/i.test(trimmed)) return null;
    if (trimmed.length === 4) return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
    return trimmed.toLowerCase();
}

function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return `#${[f(0), f(8), f(4)].map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('')}`;
}

function randomColor() {
    return hslToHex(Math.floor(Math.random() * 360), 55 + Math.floor(Math.random() * 35), 35 + Math.floor(Math.random() * 35));
}

function shadeColor(hex, amount) {
    const normalized = normalizeHexColor(hex) || '#000000';
    const clamp = (value) => Math.max(0, Math.min(255, value));
    const parts = [0, 2, 4].map((index) => parseInt(normalized.slice(1 + index, 3 + index), 16));
    return `#${parts.map((part) => clamp(part + amount).toString(16).padStart(2, '0')).join('')}`;
}

function gradient(id, fromColor, toColor) {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${fromColor}"/><stop offset="1" stop-color="${toColor}"/></linearGradient>`;
}

function getSchema(archetype) {
    return SCHEMAS[archetype];
}

function resetState(archetype = archetypeSelect.value) {
    const schema = getSchema(archetype);
    state = { archetype, ...schema.defaults };
    exportDirectoryInput.value = 'sprites';
    exportFileNameInput.value = `${archetype}-generated.svg`;
}

function randomizeState() {
    const schema = getSchema(state.archetype);
    state = schema.fields.reduce((next, field) => {
        if (field.type === 'select') {
            next[field.key] = field.options[Math.floor(Math.random() * field.options.length)];
        } else {
            next[field.key] = randomColor();
        }
        return next;
    }, { archetype: state.archetype });
}

function buildOperatorSprite(config) {
    const shoulderMap = {
        none: '',
        pads: `<path d="M28 48 Q38 34 50 42 L46 58 Q34 60 28 48 Z" fill="${config.secondary}"/><path d="M100 48 Q90 34 78 42 L82 58 Q94 60 100 48 Z" fill="${config.secondary}"/>`,
        mantle: `<path d="M26 50 Q46 30 64 34 Q82 30 102 50 L94 62 Q80 54 64 54 Q48 54 34 62 Z" fill="${shadeColor(config.secondary, -18)}" opacity="0.95"/>`
    };
    const legMap = {
        standard: `<rect x="48" y="86" width="12" height="24" rx="6" fill="${config.dark}"/><rect x="68" y="86" width="12" height="24" rx="6" fill="${config.dark}"/>`,
        tank: `<rect x="44" y="84" width="16" height="26" rx="6" fill="${config.dark}"/><rect x="68" y="84" width="16" height="26" rx="6" fill="${config.dark}"/><rect x="44" y="106" width="16" height="5" rx="2.5" fill="${shadeColor(config.dark, 24)}"/><rect x="68" y="106" width="16" height="5" rx="2.5" fill="${shadeColor(config.dark, 24)}"/>`,
        agile: `<path d="M50 86 Q54 96 50 110" fill="none" stroke="${config.dark}" stroke-width="10" stroke-linecap="round"/><path d="M78 86 Q74 96 78 110" fill="none" stroke="${config.dark}" stroke-width="10" stroke-linecap="round"/>`
    };
    const antennaMap = {
        none: '',
        single: `<path d="M64 6 L64 16" stroke="${config.accent}" stroke-width="4" stroke-linecap="round"/><circle cx="64" cy="5" r="3" fill="${config.glow}"/>`,
        twin: `<path d="M56 8 L52 18" stroke="${config.accent}" stroke-width="3" stroke-linecap="round"/><path d="M72 8 L76 18" stroke="${config.accent}" stroke-width="3" stroke-linecap="round"/><circle cx="52" cy="18" r="2.5" fill="${config.glow}"/><circle cx="76" cy="18" r="2.5" fill="${config.glow}"/>`
    };
    const weaponMap = {
        none: '',
        rifle: `<path d="M88 58 L114 48 L116 54 L90 64 Z" fill="${shadeColor(config.dark, 8)}"/><rect x="102" y="46" width="16" height="4" rx="2" fill="${config.accent}"/>`,
        cannon: `<rect x="88" y="50" width="28" height="14" rx="6" fill="${shadeColor(config.dark, 8)}"/><rect x="108" y="54" width="18" height="6" rx="3" fill="${config.accent}"/>`,
        blade: `<path d="M92 48 L118 34 L110 62 Z" fill="${config.accent}"/><rect x="84" y="54" width="12" height="6" rx="3" fill="${shadeColor(config.dark, 8)}"/>`
    };
    const visorMap = {
        wide: `<rect x="44" y="18" width="40" height="14" rx="7" fill="url(#operatorVisorGradient)"/>`,
        slit: `<rect x="46" y="22" width="36" height="8" rx="4" fill="url(#operatorVisorGradient)"/>`,
        tri: `<path d="M46 22 L64 14 L82 22 L76 30 L52 30 Z" fill="url(#operatorVisorGradient)"/>`
    };
    const accentMap = {
        belt: `<rect x="42" y="66" width="44" height="6" rx="3" fill="${config.accent}"/>`,
        core: `<circle cx="64" cy="60" r="8" fill="${config.accent}"/><circle cx="64" cy="60" r="4" fill="${config.glow}"/>`,
        chevrons: `<path d="M48 58 L64 68 L80 58" fill="none" stroke="${config.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
    };
    const bodyMap = {
        rounded: `<rect x="36" y="34" width="56" height="56" rx="16" fill="${shadeColor(config.dark, -8)}"/><rect x="40" y="30" width="48" height="56" rx="14" fill="url(#operatorPrimaryGradient)"/>`,
        heavy: `<rect x="30" y="34" width="68" height="58" rx="18" fill="${shadeColor(config.dark, -8)}"/><rect x="36" y="30" width="56" height="58" rx="16" fill="url(#operatorPrimaryGradient)"/>`,
        slim: `<rect x="40" y="36" width="48" height="52" rx="14" fill="${shadeColor(config.dark, -8)}"/><rect x="44" y="30" width="40" height="54" rx="12" fill="url(#operatorPrimaryGradient)"/>`
    };
    const helmetMap = {
        classic: `<circle cx="64" cy="28" r="22" fill="${shadeColor(config.dark, -4)}"/><circle cx="64" cy="24" r="20" fill="${config.secondary}"/>`,
        scout: `<path d="M42 30 Q50 8 64 8 Q78 8 86 30 L78 42 Q64 34 50 42 Z" fill="${config.secondary}"/><path d="M48 24 Q56 14 64 14 Q72 14 80 24" fill="none" stroke="${shadeColor(config.dark, 18)}" stroke-width="5" stroke-linecap="round"/>`,
        sentinel: `<path d="M40 30 Q44 8 64 6 Q84 8 88 30 L80 40 Q64 34 48 40 Z" fill="${config.secondary}"/><path d="M52 10 L64 2 L76 10" fill="none" stroke="${config.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs>${gradient('operatorPrimaryGradient', shadeColor(config.primary, 18), shadeColor(config.secondary, -8))}${gradient('operatorVisorGradient', '#ffffff', config.visor)}</defs><ellipse cx="64" cy="108" rx="28" ry="10" fill="#000" opacity=".18"/>${antennaMap[config.antennaStyle]}${shoulderMap[config.shoulderStyle]}${bodyMap[config.bodyShape]}<rect x="48" y="40" width="10" height="36" rx="5" fill="#fff" opacity=".16"/>${helmetMap[config.helmetStyle]}${visorMap[config.visorStyle]}<circle cx="56" cy="24" r="2.5" fill="${config.glow}"/><circle cx="72" cy="24" r="2.5" fill="${config.glow}"/>${accentMap[config.accentStyle]}<rect x="38" y="74" width="10" height="18" rx="5" fill="${config.secondary}"/><rect x="80" y="74" width="10" height="18" rx="5" fill="${config.secondary}"/>${legMap[config.legStyle]}${weaponMap[config.weaponStyle]}</svg>`;
}

function buildEnemySprite(config) {
    const bodyMap = {
        diamond: `<path d="M32 44 L64 16 L96 44 L90 86 L38 90 Z" fill="${config.core}"/><path d="M36 40 L64 18 L92 40 L86 82 L42 86 Z" fill="url(#enemyShellGradient)"/>`,
        brute: `<path d="M28 40 Q40 14 64 14 Q88 14 100 40 L92 88 Q64 100 36 88 Z" fill="${config.core}"/><path d="M34 36 Q44 18 64 18 Q84 18 94 36 L86 82 Q64 92 42 82 Z" fill="url(#enemyShellGradient)"/>`,
        skull: `<path d="M34 40 Q40 16 64 16 Q88 16 94 40 L90 72 Q86 86 74 90 L74 102 L54 102 L54 90 Q42 86 38 72 Z" fill="${config.core}"/><path d="M40 38 Q44 20 64 20 Q84 20 88 38 L84 70 Q80 82 70 84 L70 98 L58 98 L58 84 Q48 82 44 70 Z" fill="url(#enemyShellGradient)"/>`
    };
    const hornMap = {
        none: '',
        crown: `<path d="M48 28 L58 10 L64 24 L70 10 L80 28" fill="none" stroke="${shadeColor(config.shellDeep, -12)}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
        tusks: `<path d="M38 38 Q24 42 28 60" fill="none" stroke="${shadeColor(config.shellDeep, -12)}" stroke-width="7" stroke-linecap="round"/><path d="M90 38 Q104 42 100 60" fill="none" stroke="${shadeColor(config.shellDeep, -12)}" stroke-width="7" stroke-linecap="round"/>`
    };
    const eyeMap = {
        mono: `<circle cx="64" cy="48" r="7" fill="${config.glow}"/><circle cx="64" cy="48" r="12" fill="${config.glow}" opacity=".18"/>`,
        duo: `<circle cx="54" cy="48" r="5" fill="${config.glow}"/><circle cx="74" cy="48" r="5" fill="${config.glow}"/><circle cx="54" cy="48" r="9" fill="${config.glow}" opacity=".18"/><circle cx="74" cy="48" r="9" fill="${config.glow}" opacity=".18"/>`,
        tri: `<circle cx="48" cy="48" r="4.5" fill="${config.glow}"/><circle cx="64" cy="42" r="5" fill="${config.glow}"/><circle cx="80" cy="48" r="4.5" fill="${config.glow}"/>`
    };
    const mouthMap = {
        fangs: `<path d="M50 66 L58 78 L64 66 L70 78 L78 66" fill="none" stroke="${config.teeth}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
        grill: `<rect x="46" y="64" width="36" height="12" rx="6" fill="${shadeColor(config.core, 10)}"/><path d="M52 66 L52 74 M60 66 L60 74 M68 66 L68 74 M76 66 L76 74" stroke="${config.teeth}" stroke-width="3" stroke-linecap="round"/>`,
        runes: `<path d="M48 64 L58 76 L64 64 L70 76 L80 64" fill="none" stroke="${config.teeth}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="64" cy="71" r="2.5" fill="${config.glow}"/>`
    };
    const legMap = {
        stalks: `<rect x="46" y="88" width="12" height="20" rx="5" fill="${config.core}"/><rect x="70" y="88" width="12" height="20" rx="5" fill="${config.core}"/>`,
        heavy: `<rect x="42" y="86" width="16" height="22" rx="5" fill="${config.core}"/><rect x="70" y="86" width="16" height="22" rx="5" fill="${config.core}"/><rect x="40" y="104" width="18" height="5" rx="2.5" fill="${shadeColor(config.core, 20)}"/><rect x="70" y="104" width="18" height="5" rx="2.5" fill="${shadeColor(config.core, 20)}"/>`,
        tendrils: `<path d="M50 86 Q44 100 46 110" fill="none" stroke="${config.core}" stroke-width="8" stroke-linecap="round"/><path d="M78 86 Q84 100 82 110" fill="none" stroke="${config.core}" stroke-width="8" stroke-linecap="round"/>`
    };
    const auraMap = {
        none: '',
        glow: `<path d="M36 40 Q64 6 92 40" fill="none" stroke="${config.glow}" stroke-width="3" opacity=".35"/><circle cx="54" cy="48" r="13" fill="${config.glow}" opacity=".08"/><circle cx="74" cy="48" r="13" fill="${config.glow}" opacity=".08"/>`,
        runes: `<circle cx="38" cy="66" r="4" fill="none" stroke="${config.teeth}" stroke-width="2" opacity=".5"/><circle cx="90" cy="64" r="4" fill="none" stroke="${config.teeth}" stroke-width="2" opacity=".5"/><path d="M28 54 L34 50 L38 56" fill="none" stroke="${config.glow}" stroke-width="2" stroke-linecap="round"/>`
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs>${gradient('enemyShellGradient', shadeColor(config.shell, 8), shadeColor(config.shellDeep, -8))}</defs><ellipse cx="64" cy="108" rx="25" ry="10" fill="${config.shadow}" opacity=".35"/>${auraMap[config.auraStyle]}${bodyMap[config.bodyShape]}${hornMap[config.hornStyle]}<path d="M42 54 L86 46 L82 80 L46 82 Z" fill="${shadeColor(config.shellDeep, 8)}" opacity=".28"/>${eyeMap[config.eyeStyle]}${mouthMap[config.mouthStyle]}${legMap[config.legStyle]}</svg>`;
}

function buildDroneSprite(config) {
    const coreMap = {
        orb: `<circle cx="64" cy="52" r="22" fill="url(#droneCoreGradient)"/><circle cx="64" cy="52" r="12" fill="${config.plate}" opacity=".9"/>`,
        hex: `<path d="M44 36 L64 26 L84 36 L84 58 L64 70 L44 58 Z" fill="url(#droneCoreGradient)"/><path d="M50 40 L64 33 L78 40 L78 54 L64 62 L50 54 Z" fill="${config.plate}" opacity=".92"/>`,
        prism: `<path d="M46 34 L82 34 L92 52 L82 70 L46 70 L36 52 Z" fill="url(#droneCoreGradient)"/><rect x="48" y="40" width="32" height="24" rx="10" fill="${config.plate}" opacity=".92"/>`
    };
    const wingMap = {
        dual: `<path d="M26 48 L42 40 L46 52 L30 60 Z" fill="${config.accent}"/><path d="M102 48 L86 40 L82 52 L98 60 Z" fill="${config.accent}"/>`,
        tri: `<path d="M24 50 L42 38 L46 50 L28 60 Z" fill="${config.accent}"/><path d="M104 50 L86 38 L82 50 L100 60 Z" fill="${config.accent}"/><path d="M64 22 L56 36 L72 36 Z" fill="${shadeColor(config.accent, -12)}"/>`,
        ring: `<circle cx="64" cy="52" r="34" fill="none" stroke="${config.accent}" stroke-width="8" opacity=".9"/>`
    };
    const eyeMap = {
        mono: `<circle cx="64" cy="52" r="7" fill="${config.eye}"/><circle cx="64" cy="52" r="13" fill="${config.eye}" opacity=".18"/>`,
        scan: `<rect x="48" y="48" width="32" height="8" rx="4" fill="${config.eye}"/><rect x="54" y="44" width="20" height="16" rx="8" fill="${config.eye}" opacity=".16"/>`,
        triple: `<circle cx="54" cy="52" r="4.5" fill="${config.eye}"/><circle cx="64" cy="48" r="5" fill="${config.eye}"/><circle cx="74" cy="52" r="4.5" fill="${config.eye}"/>`
    };
    const thrusterMap = {
        none: '',
        down: `<path d="M48 76 L56 92 L64 76 Z" fill="${config.thruster}" opacity=".85"/><path d="M64 76 L72 92 L80 76 Z" fill="${config.thruster}" opacity=".85"/>`,
        omni: `<path d="M36 52 L22 56 L36 62 Z" fill="${config.thruster}" opacity=".8"/><path d="M92 52 L106 56 L92 62 Z" fill="${config.thruster}" opacity=".8"/><path d="M48 76 L56 92 L64 76 Z" fill="${config.thruster}" opacity=".75"/><path d="M64 76 L72 92 L80 76 Z" fill="${config.thruster}" opacity=".75"/>`
    };
    const antennaMap = {
        none: '',
        top: `<path d="M64 18 L64 30" stroke="${config.accent}" stroke-width="3" stroke-linecap="round"/><circle cx="64" cy="16" r="3" fill="${config.eye}"/>`,
        side: `<path d="M38 40 L24 34" stroke="${config.accent}" stroke-width="3" stroke-linecap="round"/><path d="M90 40 L104 34" stroke="${config.accent}" stroke-width="3" stroke-linecap="round"/>`
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs>${gradient('droneCoreGradient', shadeColor(config.shell, 18), shadeColor(config.shell, -12))}</defs><ellipse cx="64" cy="108" rx="22" ry="8" fill="${config.shadow}" opacity=".32"/>${wingMap[config.wingStyle]}${antennaMap[config.antennaStyle]}${coreMap[config.coreShape]}${eyeMap[config.eyeStyle]}<circle cx="64" cy="52" r="3" fill="${config.accent}"/>${thrusterMap[config.thrusterStyle]}</svg>`;
}

function buildSvg(config) {
    if (config.archetype === 'enemy') return buildEnemySprite(config);
    if (config.archetype === 'drone') return buildDroneSprite(config);
    return buildOperatorSprite(config);
}

function renderControls() {
    const schema = getSchema(state.archetype);
    controlsHost.innerHTML = schema.fields.map((field) => {
        if (field.type === 'select') {
            return `
                <div class="control-row">
                    <div class="label">
                        <strong>${escapeHtml(field.label)}</strong>
                        <span class="muted">Choose a silhouette variant.</span>
                    </div>
                    <select data-field="${field.key}">
                        ${field.options.map((option) => `<option value="${escapeHtml(option)}" ${state[field.key] === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
                    </select>
                </div>
            `;
        }
        return `
            <div class="control-row">
                <div class="label">
                    <strong>${escapeHtml(field.label)}</strong>
                    <span class="muted mono">${escapeHtml(state[field.key])}</span>
                </div>
                <input type="color" data-field="${field.key}" value="${state[field.key]}">
            </div>
        `;
    }).join('');
    controlCount.textContent = `${schema.fields.length} build controls`;
}

function renderPreview() {
    const schema = getSchema(state.archetype);
    const baseSvg = buildSvg({ archetype: state.archetype, ...schema.defaults });
    const generatedSvg = buildSvg(state);
    basePreview.innerHTML = `<img alt="Base ${escapeHtml(schema.label)}" src="${toDataUrl(baseSvg)}">`;
    generatedPreview.innerHTML = `<img alt="Generated ${escapeHtml(schema.label)}" src="${toDataUrl(generatedSvg)}">`;
    builderSummary.textContent = `${schema.label} Builder`;
    builderMeta.textContent = 'Procedural mode builds a fresh SVG from shape presets and colors.';
}

function renderAll() {
    renderControls();
    renderPreview();
}

function updateField(field, value) {
    state[field] = value;
    renderAll();
}

async function exportSprite() {
    const svg = buildSvg(state);
    const exportDirectory = exportDirectoryInput.value.trim();
    const exportFileName = exportFileNameInput.value.trim();
    if (!exportFileName || !/\.svg$/i.test(exportFileName)) {
        setStatus('Export file name must end in .svg', true);
        return;
    }

    try {
        const contentBase64 = btoa(unescape(encodeURIComponent(svg)));
        const payload = await adminRequest('/api/admin/assets/upload', {
            method: 'POST',
            body: JSON.stringify({
                dir: exportDirectory,
                fileName: exportFileName,
                contentBase64,
                overwrite: overwriteToggle.checked
            })
        });
        exportInfo.innerHTML = `Exported <strong>${escapeHtml(payload.uploaded)}</strong>${payload.overwritten ? ' (overwrite enabled)' : ''}.`;
        setStatus(`Exported ${payload.uploaded}.`);
    } catch (error) {
        setStatus(error.message, true);
    }
}

backToAdminButton.addEventListener('click', () => {
    window.location.href = '/admin.html';
});

openForgeButton.addEventListener('click', () => {
    window.location.href = '/sprite-forge.html';
});

openAssetsButton.addEventListener('click', () => {
    window.location.href = '/asset-admin.html';
});

archetypeSelect.addEventListener('change', (event) => {
    resetState(event.target.value);
    renderAll();
});

resetBuildButton.addEventListener('click', () => {
    resetState(archetypeSelect.value);
    renderAll();
});

randomizeBuildButton.addEventListener('click', () => {
    randomizeState();
    renderAll();
});

exportSpriteButton.addEventListener('click', exportSprite);

controlsHost.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const field = target.dataset.field;
    if (!field) return;
    updateField(field, target.value);
});

controlsHost.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const field = target.dataset.field;
    if (!field) return;
    updateField(field, target.value);
});

resetState(archetypeSelect.value);
renderAll();
