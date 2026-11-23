'use strict';

const hubId = new URLSearchParams(location.search).get('hub') || 'main';
let options = diskConfig.hubs.get(hubId) ?? diskConfig.settings;
const pauseButton = document.getElementById('pause');
const source = new MessageSource(typeof tabHubMessages === 'undefined' ? [] : tabHubMessages);
const strip = createTabStrip(refresh);
let paused = false;
let timer;
let nextOpenAt = 0;
let nextCloseAt = Infinity;
let readableAt = 0;
let suspendedAt = null;
let suspendedDuration = 0;

function updateStatus() {
    for (const id of ['live', 'topic', 'detail']) document.getElementById(id).textContent = options[id];
}
function showNext(manual = false) {
    if (!options.limit) return;
    const entry = source.next(options);
    return entry != null && strip.append(formatMessage(entry, options.variables === 'on'), manual);
}
// Deadlines are measured in visible, unpaused time.
function now() {
    return (suspendedAt ?? performance.now()) - suspendedDuration;
}

function openDelay() {
    if (options.openTiming === 'random') {
        return 1000 * (options.randomMin + Math.random() * (options.randomMax - options.randomMin));
    }
    return options.openInterval * 1000;
}

function openingDeadline() {
    return options.openTiming === 'message' ? Math.max(nextOpenAt, readableAt) : nextOpenAt;
}

function armTimer() {
    clearTimeout(timer);
    if (!strip.size || !options.closeInterval) nextCloseAt = Infinity;
    else if (nextCloseAt === Infinity) nextCloseAt = now() + options.closeInterval * 1000;
    if (suspendedAt !== null || !options.limit) return;
    timer = setTimeout(tick, Math.ceil(Math.max(0, Math.min(openingDeadline(), nextCloseAt) - now())));
}

function tick() {
    const time = now();
    // Commit near-simultaneous events in one layout rather than resizing twice in one frame.
    const openDue = openingDeadline() <= time + 8;
    const closeDue = nextCloseAt <= time + 8;

    if (closeDue) {
        strip.closeNext();
        nextCloseAt = Infinity;
    }
    if (openDue) {
        nextOpenAt = time + openDelay();
        showNext();
    }
    refresh();
}

function syncPlayback() {
    const time = performance.now();
    if (paused || document.hidden) suspendedAt ??= time;
    else if (suspendedAt !== null) {
        suspendedDuration += time - suspendedAt;
        suspendedAt = null;
    }
    refresh();
}

function refresh() {
    readableAt = now() + strip.layout();
    armTimer();
}

function nextTab() {
    const created = showNext(true);
    refresh();
    return created;
}
document.getElementById('new-tab').onclick = nextTab;
pauseButton.onclick = () => setPaused(!paused);
function setPaused(value) {
    paused = value;
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.title = paused ? '继续轮播' : '暂停轮播';
    pauseButton.setAttribute('aria-label', pauseButton.title);
    syncPlayback();
}
function updateControls() {
    document.getElementById('new-tab').disabled = !options.limit;
}
async function applyHubSettings(value) {
    validate(value);
    if (!await switchTheme(value.themeId)) return false;
    const before = options;
    options = value;
    if (before.colorMode !== options.colorMode) applyPalette(options.colorMode);
    if (before.weightStart !== options.weightStart ||
        before.weightStep !== options.weightStep || before.weightReset !== options.weightReset || before.draw !== options.draw) source.reset();
    updateStatus();
    const mode = options.openTiming;
    if (before.openTiming !== mode || !before.limit ||
        (mode !== 'random' && before.openInterval !== options.openInterval) ||
        (mode === 'random' && (before.randomMin !== options.randomMin || before.randomMax !== options.randomMax))) {
        nextOpenAt = now() + openDelay();
    }
    if (before.closeInterval !== options.closeInterval) nextCloseAt = Infinity;
    strip.trimHistory();
    updateControls();
    refresh();
    return true;
}
window.addEventListener('resize', refresh);
document.addEventListener('visibilitychange', syncPlayback);
followObsScene();
applyPalette(options.colorMode);
switchTheme(options.themeId).then(refresh).catch(() => {
    options = { ...options, themeId: activeTheme };
    console.warn('TabHub 启动主题加载失败，当前使用', activeTheme);
});
updateStatus();
updateControls();
nextOpenAt = now() + (options.openTiming === 'random' ? openDelay() : 0);
syncPlayback();
document.fonts.ready.then(refresh);
