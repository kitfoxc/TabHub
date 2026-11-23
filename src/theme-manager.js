'use strict';

const themeSheets = new Map([['default', Promise.resolve([...document.querySelectorAll('[data-theme-sheet]')])]]);
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
    if (themeSheets.has(id)) return themeSheets.get(id);
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
    const ready = Promise.all(styles).then(() => links).catch(error => {
        links.forEach(link => link.remove());
        themeSheets.delete(id);
        throw error;
    });
    themeSheets.set(id, ready);
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
    strip.finishThemeMotion();
    previous.forEach(link => { link.media = 'not all'; });
    next.forEach(link => { link.media = 'all'; });
    activeTheme = id;
    return true;
}
