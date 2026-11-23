'use strict';

const form = document.getElementById('options');
const sectionSelect = document.getElementById('section');
const feedback = document.getElementById('feedback');


const settingHelp = {
    themeId: '即时更换直播外框和标签动画。已打开的标签会保留。',
    colorMode: '跟随 OBS 场景时，场景名中的 [dark] 或 [light] 决定配色。没有标记时跟随系统。',
    draw: '加权随机会降低刚抽中的公告再次出现的概率。均匀随机让可抽取的公告机会相同。',
    variables: '开启后，将公告里的时间占位符替换为显示时的本地日期和时间。',
    weightStart: '建立公告池时给每条公告分配的初始权重。仅用于加权随机。',
    weightStep: '每次加权抽取增加各条公告的权重。数值越大，冷却中的公告恢复得越快。',
    weightReset: '决定抽中后权重降到多低。比例越大，公告通常越晚重新进入候选池。',
    messageFont: '留空使用主题字体。可输入本机字体，或用逗号分隔多个备用字体。',
    messageSize: '使用主题布局的标称像素，并随显示页的缩放比例变化。0 使用主题字号。',
    messageAlign: '设置完整文字在标签内的对齐。文字溢出时从开头显示，以便阅读和滚动。',
    live: '状态栏左侧的直播状态。留空隐藏。',
    topic: '状态栏中的本场主题。留空隐藏。',
    detail: '状态栏右侧的补充信息。留空隐藏。',
    limit: '同时保留的标签上限。设为 0 时保持空栏。',
    fitText: '开启后按文字长度展开，拥挤时优先压缩旧标签。关闭后所有可见标签使用相同宽度。',
    minWidth: '可见标签的宽度下限。空间不足时减少可见标签数量。',
    maxWidth: '固定模式的统一宽度上限。空间不足时所有可见标签等宽缩小。',
    recentCount: '按打开顺序保留最近几条标签的宽度。旧标签都缩至最小宽度后，这组才按相同百分比缩减各自的文字区域。',
    openTiming: '可按活动公告字数计算间隔、使用固定间隔或随机等待。',
    messageBaseInterval: '按字数轮播时，每轮至少等待的时间。',
    messageCharInterval: '字数乘以每字间隔，再与保底间隔取较大值。填 0 只使用保底间隔。',
    openInterval: '固定模式每隔指定秒数弹出一条。',
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
function downloadScript(filename, contents) {
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/javascript' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
            input.autocomplete = 'off';
            label.title = settingHelp[key];
            label.append(input);
            grid.append(label);
            if (field.choices) {
                for (const [value, text] of Object.entries(field.choices)) input.add(new Option(text, value));
            } else if (field.min !== undefined) {
                Object.assign(input, { type: 'number', min: field.min, max: field.max, step: field.step, required: true });
            } else if (field.maxLength !== undefined) {
                input.maxLength = field.maxLength;
                input.placeholder = '跟随主题';
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
    file.onchange = async () => {
        try {
            const selected = file.files[0];
            if (!selected) return;
            const contents = (await selected.text()).trim();
            const json = contents.startsWith(configPrefix) ? contents.slice(configPrefix.length).replace(/;$/, '') : contents;
            const profile = JSON.parse(json);
            importConfig(profile);
            fillPanel();
        } catch (error) { feedback.textContent = '导入失败。' + error.message; }
        finally { file.value = ''; }
    };
    transfer.append(button('导入配置', () => file.click()), file);
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
    form.elements.openInterval.parentElement.hidden = options.openTiming !== 'fixed';
    for (const key of ['messageBaseInterval', 'messageCharInterval']) form.elements[key].parentElement.hidden = options.openTiming !== 'message';
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
fillPanel();
