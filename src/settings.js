'use strict';

const themeCatalog = {
    default: { label: '默认' },
    photoshop: { label: 'Photoshop' }
};
const themeChoices = Object.fromEntries(Object.entries(themeCatalog).map(([id, theme]) => [id, theme.label]));

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
const defaults = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
const configPrefix = 'const tabHubConfig = ';
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

function restoreProfile(saved) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('配置应为 JSON 对象。');
    const restored = { ...defaults };
    for (const key of Object.keys(fields)) if (Object.hasOwn(saved, key)) restored[key] = saved[key];
    if (!Object.hasOwn(themeChoices, restored.themeId)) restored.themeId = 'default';
    validate(restored);
    return restored;
}

function validHubId(id) {
    return typeof id === 'string' && id !== '__proto__' && /^[a-zA-Z0-9_-]{1,48}$/.test(id);
}

function readConfig(data) {
    if (data?.version !== 2) {
        throw new Error('仅支持 version 2 配置。');
    }
    if (!data.hubs || typeof data.hubs !== 'object' || Array.isArray(data.hubs)) {
        throw new Error('缺少 Hub 配置列表。');
    }
    const hubs = new Map();
    for (const [id, profile] of Object.entries(data.hubs)) {
        if (!validHubId(id)) throw new Error('Hub ID 无效。');
        hubs.set(id, restoreProfile(profile));
    }
    return { settings: restoreProfile(data.settings ?? {}), hubs };
}

let configNotice = '';
let diskConfig;
try {
    diskConfig = readConfig(tabHubConfig);
} catch (error) {
    configNotice = '无法读取 config.js，已采用默认值。' + error.message;
    diskConfig = { settings: { ...defaults }, hubs: new Map() };
}
