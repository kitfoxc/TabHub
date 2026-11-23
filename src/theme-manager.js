'use strict';

const baseTheme = { sheets: [...document.querySelectorAll('[data-theme-sheet]')], direction: 'horizontal' };
const themeResources = new Map([['default', Promise.resolve(baseTheme)]]);
let mountedView;
let viewScope;

function unmountThemeView() {
    viewScope?.abort();
    viewScope = undefined;
    try { mountedView?.unmount?.(); }
    catch (error) { console.warn('主题卸载失败', error); }
    mountedView = undefined;
}

function callThemeHook(name, state) {
    if (!mountedView?.[name]) return;
    try { return mountedView[name](state); }
    catch (error) {
        console.warn('主题布局脚本已停止', error);
        unmountThemeView();
    }
}

// Classic scripts also work when OBS opens the installation via file://.
function registerTabHubView(definition) {
    document.currentScript.tabHubView = definition;
}

function loadViewScript(folder) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = folder + 'view.js';
        script.onload = () => {
            script.remove();
            if (script.tabHubView) resolve(script.tabHubView);
            else reject(new Error('主题脚本未注册'));
        };
        script.onerror = () => { script.remove(); reject(new Error('主题脚本加载失败')); };
        document.head.append(script);
    });
}

function buildTabTemplate(markup) {
    if (markup === undefined) return;
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.innerHTML = markup;
    for (const selector of ['.select', '.close', '.label']) {
        if (tab.querySelectorAll(selector).length !== 1) throw new Error('标签模板必须包含唯一的 ' + selector);
    }
    const select = tab.querySelector('button.select');
    const close = tab.querySelector('button.close');
    const label = tab.querySelector('.label');
    if (!select?.contains(label) || select === label || !close || select.contains(close) || close.contains(select)) {
        throw new Error('标签模板需要独立的选择和关闭按钮，文字位于选择按钮内');
    }
    if (label.childNodes.length || tab.querySelector('.tab')) {
        throw new Error('文字容器必须留空，.tab 外层由 Hub 创建');
    }
    return tab;
}

const systemDark = matchMedia('(prefers-color-scheme: dark)');
let activeTheme = 'default';
let themeRequest = 0;

let scenePalette;

function applyPalette(mode) {
    const systemPalette = systemDark.matches ? 'dark' : 'light';
    document.documentElement.dataset.color = mode === 'obs' ? scenePalette ?? systemPalette
        : mode === 'system' ? systemPalette : mode;
}
systemDark.addEventListener('change', () => applyPalette(options.colorMode));

function followObsScene() {
    const obs = window.obsstudio;
    if (!obs) return;

    function updateScene(scene) {
        if (typeof scene?.name !== 'string') return;
        scenePalette = scene.name.match(/\[(dark|light)\]/i)?.[1].toLowerCase();
        applyPalette(options.colorMode);
    }

    let sceneChanged = false;
    window.addEventListener('obsSceneChanged', event => {
        if (typeof event.detail?.name !== 'string') return;
        sceneChanged = true;
        updateScene(event.detail);
    });
    obs.getCurrentScene?.(scene => {
        if (!sceneChanged) updateScene(scene);
    });
}

function loadTheme(id) {
    if (themeResources.has(id)) return themeResources.get(id);
    const config = themeCatalog[id];
    const direction = config.layout ?? 'horizontal';
    if (!Object.hasOwn(tabLayouts, direction)) throw new Error('无效的主题布局方向');
    const folder = 'themes/' + id + '/';
    const links = [];
    const styles = ['theme.css', 'motion.css'].map(file => new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.media = 'not all';
        link.onload = resolve;
        link.onerror = reject;
        link.href = folder + file;
        links.push(link);
        document.head.append(link);
    }));
    const ready = Promise.all([Promise.all(styles), config.view ? loadViewScript(folder) : {}])
        .then(([, view]) => ({
            sheets: links, direction, tab: buildTabTemplate(view.template ?? config.template), mount: view.mount
        })).catch(error => {
        links.forEach(link => link.remove());
        themeResources.delete(id);
        throw error;
    });
    themeResources.set(id, ready);
    return ready;
}

async function switchTheme(id) {
    const request = ++themeRequest;
    if (id === activeTheme) return true;
    let next;
    try {
        next = await loadTheme(id);
    } catch (error) {
        if (request !== themeRequest) return false;
        throw error;
    }
    const previous = await loadTheme(activeTheme);
    if (request !== themeRequest) return false;
    unmountThemeView();
    strip.finishThemeMotion();
    // Update the loaded sheets synchronously so the first layout sees the new theme metrics.
    previous.sheets.forEach(link => { link.sheet.media.mediaText = 'not all'; });
    next.sheets.forEach(link => { link.sheet.media.mediaText = 'all'; });
    strip.setView(next.direction, next.tab);
    activeTheme = id;
    if (next.mount) {
        viewScope = new AbortController();
        try {
            mountedView = next.mount({ root: document.getElementById('tabs'), signal: viewScope.signal });
        } catch (error) {
            console.warn('主题脚本初始化失败', error);
            unmountThemeView();
        }
    }
    return true;
}
