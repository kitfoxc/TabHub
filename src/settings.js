'use strict';

// Each setting is declared once. These definitions drive the panel, defaults and validation.
const numeric = (label, value, min, max, step = 1) => ({ label, value, min, max, step });
const choice = (label, value, choices) => ({ label, value, choices });
const modes = { full: '完整显示', compact: '压缩显示' };
const sides = { left: '左侧', right: '右侧' };
const sections = {
    '界面主题': {
        themeId: choice('主题', 'default', themeChoices),
        colorMode: choice('配色', 'light', { light: '浅色', dark: '深色', system: '跟随系统' })
    },
    '公告抽取': {
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
        easing: choice('标签缓动', 'theme', { theme: '跟随主题', browser: '浏览器风格', 'ease-out': '缓出', 'ease-in-out': '缓入缓出', linear: '线性' }),
        scrollScope: choice('溢出文字滚动', 'all', { off: '关闭', active: '仅主标签', all: '所有可见标签' }),
        scrollRepeat: choice('滚动方式', 'once', { once: '一次', loop: '循环' }),
        scrollSpeed: numeric('文字速度（px/s）', 55, 5, 500),
        scrollHold: numeric('首尾停留（ms）', 1200, 0, 10000)
    }
};
const fields = Object.assign({}, ...Object.values(sections));
const settingHelp = {
    themeId: '即时更换直播外框和标签动画。已打开的标签会保留。',
    colorMode: '直播可固定使用深色或浅色。跟随系统使用 OBS 浏览器源报告的配色偏好。',
    draw: '加权随机会降低刚抽中的公告再次出现的概率。均匀随机让可抽取的公告机会相同。',
    variables: '开启后，将公告里的时间占位符替换为显示时的本地日期和时间。',
    weightStart: '建立公告池时给每条公告分配的初始权重。仅用于加权随机。',
    weightStep: '每次加权抽取增加各条公告的权重。数值越大，冷却中的公告恢复得越快。',
    weightReset: '决定抽中后权重降到多低。比例越大，公告通常越晚重新进入候选池。',
    live: '状态栏左侧的直播状态。留空隐藏。',
    topic: '状态栏中的本场主题。留空隐藏。',
    detail: '状态栏右侧的补充信息。留空隐藏。',
    limit: '同时保留的标签上限。设为 0 时保持空栏。',
    minWidth: '空间紧张时每个标签预留的宽度。视口过窄时，单个标签仍可继续收窄。',
    maxWidth: '压缩模式在空间充足时采用的宽度。完整模式按文字长度展开。',
    recentCount: '按弹出顺序计算最近几条公告。设为 0 时全部使用更早标签的模式。',
    recentMode: '决定最近几条公告按文字长度展开，还是遵循压缩宽度。',
    olderMode: '决定其余公告按文字长度展开，还是遵循压缩宽度。',
    openTiming: '可等当前公告读完、按固定间隔弹出，或在指定范围内随机等待。',
    openInterval: '固定模式每隔指定秒数弹出一条。等待读完模式也以此为最短间隔。',
    randomMin: '随机模式每次弹出前至少等待的秒数。',
    randomMax: '随机模式每次弹出前至多等待的秒数。',
    closeInterval: '每隔指定秒数自动关闭一个标签，可以关到空栏。填 0 停用。',
    openSide: '新公告从标签栏的哪一端出现。',
    closeSide: '退场动画的方向，也决定自动关闭优先从哪一端选择标签。',
    speed: '控制标签开合速度。1 为原速，2 为两倍速。',
    easing: '控制标签开合时的加减速曲线。线性表示全程匀速。',
    scrollScope: '决定放不下的文字是否滚动，以及哪些可见标签可以滚动。',
    scrollRepeat: '滚到末尾后停止，或回到开头继续循环。',
    scrollSpeed: '文字每秒移动的像素数，独立于标签开合速度。',
    scrollHold: '文字在滚动开始和结束时各停留多久。1000 毫秒等于 1 秒。'
};
const defaults = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
const storageKey = 'tabhub.settings.v1';
const messageBackupKey = 'tabhub.messages.backup.v1';
const legacyKey = 'echo-moji.hub.settings.v1';
const form = document.getElementById('options');
const dialog = document.getElementById('settings');
const sectionSelect = document.getElementById('section');
const feedback = document.getElementById('feedback');

function validate(value) {
    for (const [key, field] of Object.entries(fields)) {
        const v = value[key];
        let valid;
        if (field.choices) valid = typeof v === 'string' && Object.hasOwn(field.choices, v);
        else if (field.min !== undefined) {
            valid = Number.isFinite(v) && v >= field.min && v <= field.max && (field.step !== 1 || Number.isInteger(v));
        } else valid = typeof v === 'string';
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
    if (!Object.hasOwn(themeChoices, restored.themeId)) restored.themeId = 'default';
    validate(restored);
    return restored;
}

let options = { ...defaults };
let loadNotice = '';
try {
    const raw = localStorage.getItem(storageKey) ?? localStorage.getItem(legacyKey);
    if (raw) {
        const saved = JSON.parse(raw);
        options = restoreProfile(saved);
        backupMessages(saved);
    }
} catch { loadNotice = '未能载入已保存设置，当前使用默认配置。'; }

function backupMessages(profile) {
    if (Array.isArray(profile?.messages)) localStorage.setItem(messageBackupKey, JSON.stringify(profile.messages));
}

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
            const tag = field.choices ? 'select' : 'input';
            const input = document.createElement(tag);
            input.name = key;
            label.title = settingHelp[key];
            label.append(input);
            grid.append(label);
            if (field.choices) {
                for (const [value, text] of Object.entries(field.choices)) input.add(new Option(text, value));
            } else if (field.min !== undefined) {
                Object.assign(input, { type: 'number', min: field.min, max: field.max, step: field.step, required: true });

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
            const saved = profile.settings ?? profile;
            const restored = restoreProfile(saved);
            backupMessages(saved);
            applyOptions(restored);
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
    transfer.append(button('下载旧版公告备份', () => {
        try {
            const saved = localStorage.getItem(messageBackupKey);
            if (!saved) { feedback.textContent = '当前浏览器没有旧版公告备份。'; return; }
            const fileUrl = URL.createObjectURL(new Blob(['const tabHubMessages = ' + saved + ';\n'], { type: 'text/javascript' }));
            const link = document.createElement('a');
            link.href = fileUrl;
            link.download = 'messages.js';
            link.click();
            setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
        } catch { feedback.textContent = '无法读取旧版公告备份。'; }
    }));
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
    for (const key of Object.keys(fields)) form.elements[key].value = options[key];
    updatePanel();
}
buildPanel();
form.onsubmit = e => e.preventDefault();
form.oninput = e => {
    const input = e.target;
    if (!input.name) return;
    const group = sections[sectionSelect.value];
    if (!group) return;
    const value = { ...options };
    for (const key of Object.keys(group)) {
        const field = form.elements[key];
        if (field.parentElement.hidden) continue;
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
    applyOptions(value); fillPanel();
};
document.getElementById('settings-button').onclick = () => {
    fillPanel(); feedback.textContent = loadNotice; dialog.showModal();
};
document.getElementById('dismiss').onclick = () => dialog.close();
