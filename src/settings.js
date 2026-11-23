'use strict';

// Each setting is declared once. These definitions drive the panel, defaults and validation.
const numeric = (label, value, min, max, step = 1) => ({ label, value, min, max, step });
const choice = (label, value, choices) => ({ label, value, choices });
const sides = { left: '左侧', right: '右侧' };
const sections = {
    '界面主题': {
        themeId: choice('主题', 'default', themeChoices),
        colorMode: choice('配色', 'obs', { obs: '跟随 OBS 场景', light: '浅色', dark: '深色', system: '跟随系统' })
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
        fitText: choice('按文本长度自适应', 'on', { on: '开启', off: '关闭' }),
        minWidth: numeric('最小宽度（px）', 62, 62, 1200),
        maxWidth: numeric('固定模式最大宽度（px）', 480, 62, 1600),
        recentCount: numeric('优先保留宽度的最近标签数', 3, 1, 32)
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
    colorMode: '跟随 OBS 场景时，场景名中的 [dark] 或 [light] 决定配色。没有标记时跟随系统。',
    draw: '加权随机会降低刚抽中的公告再次出现的概率。均匀随机让可抽取的公告机会相同。',
    variables: '开启后，将公告里的时间占位符替换为显示时的本地日期和时间。',
    weightStart: '建立公告池时给每条公告分配的初始权重。仅用于加权随机。',
    weightStep: '每次加权抽取增加各条公告的权重。数值越大，冷却中的公告恢复得越快。',
    weightReset: '决定抽中后权重降到多低。比例越大，公告通常越晚重新进入候选池。',
    live: '状态栏左侧的直播状态。留空隐藏。',
    topic: '状态栏中的本场主题。留空隐藏。',
    detail: '状态栏右侧的补充信息。留空隐藏。',
    limit: '同时保留的标签上限。设为 0 时保持空栏。',
    fitText: '开启后按文字长度展开，拥挤时优先压缩旧标签。关闭后所有可见标签使用相同宽度。',
    minWidth: '可见标签的宽度下限。空间不足时减少可见标签数量。',
    maxWidth: '固定模式的统一宽度上限。空间不足时所有可见标签等宽缩小。',
    recentCount: '按打开顺序保留最近几条标签的宽度。旧标签都缩至最小宽度后，这组才按相同百分比缩减各自的文字区域。',
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
const configPrefix = 'const tabHubConfig = ';
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
    if (value.fitText === 'off' && value.minWidth > value.maxWidth) throw new Error('最小宽度须小于或等于最大宽度。');
    if (value.randomMin > value.randomMax) throw new Error('最短等待须小于或等于最长等待。');
}

function restoreProfile(saved, allowEmpty = false) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('配置应为 JSON 对象。');
    const restored = { ...defaults };
    const legacyLayout = ['activeMode', 'otherMode', 'recentMode', 'olderMode'];
    const recognized = [...Object.keys(fields), ...legacyLayout].some(key => Object.hasOwn(saved, key));
    if (!recognized && !(allowEmpty && Object.keys(saved).length === 0)) {
        throw new Error('文件中没有 TabHub 设置。');
    }
    for (const key of Object.keys(fields)) if (Object.hasOwn(saved, key)) restored[key] = saved[key];
    if (!Object.hasOwn(saved, 'fitText')) {
        const recentMode = saved.recentMode ?? saved.activeMode;
        const olderMode = saved.olderMode ?? saved.otherMode;
        if (olderMode === 'compact' && (recentMode === 'compact' || saved.recentCount === 0)) {
            restored.fitText = 'off';
        }
        if (saved.recentCount === 0 || (saved.activeMode && !Object.hasOwn(saved, 'recentCount'))) {
            restored.recentCount = 1;
        }
    }
    if (!Object.hasOwn(themeChoices, restored.themeId)) restored.themeId = 'default';
    validate(restored);
    return restored;
}

function readProfile(profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('配置应为 JSON 对象。');
    if (Object.hasOwn(profile, 'version') && profile.version !== 1) throw new Error('配置版本不受支持。');
    return profile.settings ?? profile;
}

let options = { ...defaults };
let loadNotice = '';
let importedMessages;
try {
    if (typeof tabHubConfig !== 'undefined') options = restoreProfile(readProfile(tabHubConfig), true);
    else loadNotice = '未能读取 config.js，当前使用默认配置。';
} catch (error) {
    loadNotice = 'config.js 无效，当前使用默认配置。' + error.message;
}

function applyOptions(value) {
    validate(value);
    const previous = options;
    options = value;
    feedback.textContent = '已应用到当前页面。导出 config.js 可保存。';
    window.dispatchEvent(new CustomEvent('hub-settings-change', { detail: previous }));
}

function downloadScript(filename, contents) {
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/javascript' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById('save-config').onclick = () => {
    let settings;
    try { settings = readPanel(); }
    catch (error) { feedback.textContent = error.message; return; }
    const data = JSON.stringify({ version: 1, settings }, null, 2);
    downloadScript('config.js', configPrefix + data + ';\n');
    feedback.textContent = '已请求下载。请用导出的 config.js 覆盖项目根目录中的同名文件。';
};

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
            input.autocomplete = 'off';
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
    file.type = 'file';
    file.accept = '.js,.json';
    file.hidden = true;
    const downloadMessages = button('下载导入的旧版公告', () => {
        downloadScript('messages.js', 'const tabHubMessages = ' + JSON.stringify(importedMessages, null, 2) + ';\n');
    });
    downloadMessages.hidden = true;
    file.onchange = async () => {
        try {
            const selected = file.files[0];
            if (!selected) return;
            const contents = (await selected.text()).trim();
            const json = contents.startsWith(configPrefix) ? contents.slice(configPrefix.length).replace(/;$/, '') : contents;
            const profile = JSON.parse(json);
            const saved = readProfile(profile);
            applyOptions(restoreProfile(saved, contents.startsWith(configPrefix)));
            const messages = saved.messages ?? profile.messages;
            if (Array.isArray(messages)) {
                importedMessages = messages;
                downloadMessages.hidden = false;
            }
            fillPanel();
        } catch (error) { feedback.textContent = '导入失败。' + error.message; }
        finally { file.value = ''; }
    };
    transfer.append(button('导入配置', () => file.click()), downloadMessages, file);
    form.append(transfer);
}

function updatePanel() {
    for (const group of form.querySelectorAll('fieldset')) group.hidden = group.dataset.section !== sectionSelect.value;
    document.getElementById('restore').hidden = sectionSelect.value === '配置迁移';
    const adaptive = options.fitText === 'on';
    form.elements.maxWidth.parentElement.hidden = adaptive;
    form.elements.recentCount.parentElement.hidden = !adaptive;
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
function readPanel() {
    const value = { ...options };
    if (sectionSelect.value === '标签布局') {
        value.fitText = form.elements.fitText.value;
        if (options.fitText === 'on' && value.fitText === 'off') {
            const maxWidth = form.elements.maxWidth;
            maxWidth.value = Math.max(options.maxWidth, options.minWidth);
        }
    }
    for (const key of Object.keys(sections[sectionSelect.value] ?? {})) {
        const field = form.elements[key];
        const visible = key === 'maxWidth' ? value.fitText === 'off'
            : key === 'recentCount' ? value.fitText === 'on' : !field.parentElement.hidden;
        if (!visible) continue;
        if (!field.checkValidity()) throw new Error('请检查「' + fields[key].label + '」的取值范围。');
        value[key] = field.type === 'number' ? field.valueAsNumber : field.value;
    }
    validate(value);
    return value;
}
form.oninput = e => {
    if (!e.target.name) return;
    try { applyOptions(readPanel()); updatePanel(); }
    catch (error) { feedback.textContent = error.message; }
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
