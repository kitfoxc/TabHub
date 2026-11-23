'use strict';

const initialMessages = [
    '我对普通的人类没有兴趣！',
    '在虚构的故事当中寻求真实感的人脑袋一定有问题！',
    '保存用、鉴赏用、传教用。',
    '我们所经历的每个平凡的日常，也许就是连续发生的奇迹。',
    '可怜即可爱！',
    '现在是 {{{time:y}}} 年 {{{time:M}}} 月 {{{time:d}}} 日 {{{time:hh}}}:{{{time:mm}}}:{{{time:ss}}} UTC{{{time:utcs}}}',
    {
        type: 'queue',
        content: [
            '这是一段连续的消息队列',
            '抽取到此消息队列时',
            '会依次展示队列中的消息',
            '直到队列结束',
        ]
    },
    {
        type: 'pack',
        conditions: [
            {
                condition: 'date_check',
                date: '6/1'
            }
        ],
        content: [
            '这是一条只会在儿童节出现的消息'
        ]
    },
];

// Each setting is declared once. These definitions drive the panel, defaults and validation.
const numeric = (label, value, min, max, step = 1) => ({ label, value, min, max, step });
const choice = (label, value, choices) => ({ label, value, choices });
const modes = { full: '完整显示', compact: '压缩显示' };
const sides = { left: '左侧', right: '右侧' };
const sections = {
    '公告内容': {
        messages: { label: '公告列表', value: initialMessages },
        draw: choice('抽取方式', 'weighted', { weighted: '加权随机', average: '均匀随机' }),
        variables: choice('时间变量', 'on', { on: '启用', off: '关闭' }),
        weightStart: numeric('初始权重', 1, 1, 1000),
        weightStep: numeric('每轮增加权重', 1, 1, 1000),
        weightReset: numeric('抽中后冷却比例', .35, 0, 1, .01)
    },
    '状态栏': {
        live: { label: '直播状态', value: '直播中' },
        topic: { label: '本场主题', value: '自由交流' },
        detail: { label: '右侧信息', value: '欢迎来到直播间' }
    },
    '标签布局': {
        limit: numeric('最多显示标签', 12, 0, 32),
        minWidth: numeric('最小宽度（px）', 62, 62, 1200),
        maxWidth: numeric('压缩模式最大宽度（px）', 480, 62, 1600),
        recentCount: numeric('最近标签数量', 3, 0, 32),
        recentMode: choice('最近标签', 'full', modes), olderMode: choice('更早的标签', 'compact', modes)
    },
    '弹出与关闭': {
        openTiming: choice('弹出时机', 'message', { message: '等当前公告读完', fixed: '固定间隔', random: '随机间隔' }),
        openInterval: numeric('弹出间隔（秒）', 10, .1, 86400, .1),
        randomMin: numeric('最短等待（秒）', 5, .1, 86400, .1),
        randomMax: numeric('最长等待（秒）', 15, .1, 86400, .1),
        closeInterval: numeric('关闭间隔（秒，0 为停用）', 0, 0, 86400, .1),
        openSide: choice('弹出侧', 'right', sides), closeSide: choice('关闭侧', 'left', sides)
    },
    '动画与滚动': {
        speed: numeric('标签动画速度倍率', 1, .25, 4, .05),
        easing: choice('标签缓动', 'browser', { browser: '浏览器风格', 'ease-out': '缓出', 'ease-in-out': '缓入缓出', linear: '线性' }),
        scrollScope: choice('溢出文字滚动', 'all', { off: '关闭', active: '仅主标签', all: '所有可见标签' }),
        scrollRepeat: choice('滚动方式', 'once', { once: '一次', loop: '循环' }),
        scrollSpeed: numeric('文字速度（px/s）', 55, 5, 500),
        scrollHold: numeric('首尾停留（ms）', 1200, 0, 10000)
    }
};
const fields = Object.assign({}, ...Object.values(sections));
const defaults = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
const storageKey = 'tabhub.settings.v1';
const legacyKey = 'echo-moji.hub.settings.v1';
const form = document.getElementById('options');
const dialog = document.getElementById('settings');
const sectionSelect = document.getElementById('section');
const feedback = document.getElementById('feedback');

function validEntry(entry, depth = 0) {
    if (depth > 32) return false;
    if (typeof entry === 'string') return true;
    const segment = part => typeof part === 'string' || typeof part?.text === 'string';
    if (Array.isArray(entry)) return entry.every(segment);
    if (entry?.type === 'queue' || entry?.type === 'pack') {
        return Array.isArray(entry.content) && entry.content.every(part => validEntry(part, depth + 1));
    }
    return segment(entry);
}

function validate(value) {
    for (const [key, field] of Object.entries(fields)) {
        const v = value[key];
        let valid;
        if (field.choices) valid = typeof v === 'string' && Object.hasOwn(field.choices, v);
        else if (field.min !== undefined) {
            valid = Number.isFinite(v) && v >= field.min && v <= field.max && (field.step !== 1 || Number.isInteger(v));
        } else if (key === 'messages') valid = Array.isArray(v) && v.every(entry => validEntry(entry));
        else valid = typeof v === 'string';
        if (!valid) throw new Error('请检查「' + field.label + '」。');
    }
    if (value.minWidth > value.maxWidth) throw new Error('最小宽度须小于或等于最大宽度。');
    if (value.randomMin > value.randomMax) throw new Error('最短等待须小于或等于最长等待。');
}

function restoreProfile(saved) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('配置应为 JSON 对象。');
    const restored = { ...defaults };
    if (!Object.keys(fields).some(key => Object.hasOwn(saved, key))) throw new Error('文件中没有 TabHub 设置。');
    for (const key of Object.keys(fields)) if (Object.hasOwn(saved, key)) restored[key] = saved[key];
    if (saved.activeMode && saved.otherMode && !Object.hasOwn(saved, 'recentCount')) {
        Object.assign(restored, { recentCount: 1, recentMode: saved.activeMode, olderMode: saved.otherMode });
    }
    validate(restored);
    return restored;
}

let options = { ...defaults };
let loadNotice = '';
try {
    const raw = localStorage.getItem(storageKey) ?? localStorage.getItem(legacyKey);
    if (raw) options = restoreProfile(JSON.parse(raw));
} catch { loadNotice = '未能载入已保存设置，当前使用默认配置。'; }

function applyOptions(value) {
    validate(value);
    const previous = options;
    options = value;
    feedback.textContent = '';
    try { localStorage.setItem(storageKey, JSON.stringify(value)); }
    catch { feedback.textContent = '已在本次显示中生效。请导出配置以保存。'; }
    window.dispatchEvent(new CustomEvent('hub-settings-change', { detail: previous }));
}

function button(text, action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'config-action';
    btn.textContent = text;
    btn.onclick = action;
    return btn;
}

function messageLines(entries) {
    return entries.map(entry => {
        if (typeof entry !== 'string' || !entry || entry.trim() !== entry ||
            ['[', '{', '"'].includes(entry[0]) || /[\r\n]/.test(entry)) return JSON.stringify(entry);
        return entry;
    }).join('\n');
}
function parseLines(text) {
    return text.split(/\r?\n/).flatMap((line, i) => {
        if (!line.trim()) return [];
        let entry = line;
        try {
            if (['[', '{', '"'].includes(line.trimStart()[0])) entry = JSON.parse(line);
            if (!validEntry(entry)) throw new Error();
        } catch { throw new Error('第 ' + (i + 1) + ' 行公告格式有误。'); }
        return [entry];
    });
}

function buildPanel() {
    for (const [name, group] of Object.entries(sections)) {
        sectionSelect.add(new Option(name));
        const panel = document.createElement('fieldset');
        panel.dataset.section = name;
        const grid = document.createElement('div');
        grid.className = 'fields';
        panel.append(grid);
        for (const [key, field] of Object.entries(group)) {
            const label = document.createElement('label');
            label.textContent = field.label;
            const tag = key === 'messages' ? 'textarea' : field.choices ? 'select' : 'input';
            const input = document.createElement(tag);
            input.name = key;
            label.append(input);
            grid.append(label);
            if (field.choices) {
                for (const [value, text] of Object.entries(field.choices)) input.add(new Option(text, value));
            } else if (field.min !== undefined) {
                Object.assign(input, { type: 'number', min: field.min, max: field.max, step: field.step, required: true });
            } else if (key === 'messages') {
                label.className = 'wide';
                const note = document.createElement('small');
                note.className = 'settings-note';
                note.textContent = '每行一条公告。富文本、队列和条件包可写成单行 JSON。';
                label.append(note);
                grid.append(button('应用公告列表', () => {
                    try { applyOptions({ ...options, messages: parseLines(input.value) }); }
                    catch (e) { feedback.textContent = e.message; }
                }));
            }
        }
        form.append(panel);
    }
    sectionSelect.add(new Option('配置迁移'));
    const transfer = document.createElement('fieldset');
    transfer.dataset.section = '配置迁移';
    const file = document.createElement('input');
    file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
    file.onchange = async () => {
        try {
            const selected = file.files[0];
            if (!selected) return;
            const profile = JSON.parse(await selected.text());
            if (Object.hasOwn(profile, 'version') && profile.version !== 1) throw new Error('配置版本不受支持。');
            applyOptions(restoreProfile(profile.settings ?? profile));
            fillPanel();
        } catch (e) { feedback.textContent = '导入失败。' + e.message; }
        finally { file.value = ''; }
    };
    transfer.append(button('导出当前配置', () => {
        const data = JSON.stringify({ version: 1, settings: options }, null, 2);
        const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'tabhub.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }), button('导入配置', () => file.click()), file);
    form.append(transfer);
}

function updatePanel() {
    for (const group of form.querySelectorAll('fieldset')) group.hidden = group.dataset.section !== sectionSelect.value;
    document.getElementById('restore').hidden = sectionSelect.value === '配置迁移';
    const random = options.openTiming === 'random';
    for (const key of ['randomMin', 'randomMax']) form.elements[key].parentElement.hidden = !random;
    form.elements.openInterval.parentElement.hidden = random;
    for (const key of ['weightStart', 'weightStep', 'weightReset']) form.elements[key].parentElement.hidden = options.draw !== 'weighted';
}
function fillPanel() {
    for (const key of Object.keys(fields)) form.elements[key].value = key === 'messages' ? messageLines(options.messages) : options[key];
    updatePanel();
}
buildPanel();
form.onsubmit = e => e.preventDefault();
form.oninput = e => {
    const input = e.target;
    if (!input.name || input.name === 'messages') return;
    const group = sections[sectionSelect.value];
    if (!group) return;
    const value = { ...options };
    for (const key of Object.keys(group)) {
        const field = form.elements[key];
        if (key === 'messages' || field.parentElement.hidden) continue;
        if (!field.checkValidity()) { feedback.textContent = '请检查「' + fields[key].label + '」的取值范围。'; return; }
        value[key] = field.type === 'number' ? field.valueAsNumber : field.value;
    }
    try { applyOptions(value); updatePanel(); }
    catch (err) { feedback.textContent = err.message; }
};
sectionSelect.onchange = () => { updatePanel(); feedback.textContent = ''; };
document.getElementById('restore').onclick = () => {
    const value = { ...options };
    for (const key of Object.keys(sections[sectionSelect.value])) value[key] = defaults[key];
    if (sectionSelect.value === '公告内容' && !confirm('用默认公告和抽取设置替换当前内容？')) return;
    applyOptions(value); fillPanel();
};
document.getElementById('settings-button').onclick = () => {
    fillPanel(); feedback.textContent = loadNotice; dialog.showModal();
};
document.getElementById('dismiss').onclick = () => dialog.close();
