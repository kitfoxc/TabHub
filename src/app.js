'use strict';

const hubId = new URLSearchParams(location.search).get('hub') || 'main';
let options = diskConfig.hubs.get(hubId) ?? diskConfig.settings;
const pauseButton = document.getElementById('pause');
const messageStyle = document.documentElement.style;
const source = new MessageSource(typeof tabHubMessages === 'undefined' ? [] : tabHubMessages);
const strip = createTabStrip(refresh);
let paused = false;
let timer;
let nextOpenAt = 0;
let nextCloseAt = Infinity;
let messageOpenedAt = null;
let suspendedAt = null;
let suspendedDuration = 0;
let hiddenAt = null;
let hiddenDuration = 0;

function updateStatus() {
    for (const id of ['live', 'topic', 'detail']) document.getElementById(id).textContent = options[id];
}
function applyMessageStyle() {
    messageStyle.setProperty('--message-font-family', options.messageFont.trim());
    messageStyle.setProperty('--message-font-size', options.messageSize ? options.messageSize + 'px' : '');
    messageStyle.setProperty('--message-align', options.messageAlign);
}
function showNext(manual = false) {
    if (!options.limit) return;
    const entry = source.next(options);
    return entry != null && appendAnnouncement(formatMessage(entry, options.variables === 'on'), manual);
}
function appendAnnouncement(content, manual) {
    const created = strip.append(content, manual);
    if (created) messageOpenedAt = now();
    return created;
}
// Deadlines are measured in visible, unpaused time.
function now() {
    return (suspendedAt ?? performance.now()) - suspendedDuration;
}

function closingNow() {
    return (hiddenAt ?? performance.now()) - hiddenDuration;
}

function openDelay() {
    if (options.openTiming === 'random') {
        return 1000 * (options.randomMin + Math.random() * (options.randomMax - options.randomMin));
    }
    return options.openInterval * 1000;
}

function openingDeadline() {
    if (options.openTiming !== 'message' || messageOpenedAt === null) return nextOpenAt;
    const characterInterval = strip.activeCharacterCount * options.messageCharInterval;
    return messageOpenedAt + 1000 * Math.max(options.messageBaseInterval, characterInterval);
}

function armTimer() {
    clearTimeout(timer);
    if (!strip.size || !options.closeInterval) nextCloseAt = Infinity;
    else if (nextCloseAt === Infinity) nextCloseAt = closingNow() + options.closeInterval * 1000;
    if (hiddenAt !== null) return;
    const openRemaining = paused || !options.limit ? Infinity : openingDeadline() - now();
    const remaining = Math.min(openRemaining, nextCloseAt - closingNow());
    if (!Number.isFinite(remaining)) return;
    timer = setTimeout(tick, Math.min(2_147_483_647, Math.ceil(Math.max(0, remaining))));
}

function tick() {
    const time = now();
    // Commit near-simultaneous events in one layout rather than resizing twice in one frame.
    const openDue = !paused && options.limit && openingDeadline() <= time + 8;
    const closeDue = nextCloseAt <= closingNow() + 8;

    if (closeDue) {
        strip.closeNext();
        nextCloseAt = Infinity;
    }
    if (openDue) {
        nextOpenAt = time + openDelay();
        messageOpenedAt = time;
        showNext();
    }
    refresh();
}

function syncPlayback() {
    const time = performance.now();
    if (document.hidden) hiddenAt ??= time;
    else if (hiddenAt !== null) {
        hiddenDuration += time - hiddenAt;
        hiddenAt = null;
    }
    if (paused || document.hidden) suspendedAt ??= time;
    else if (suspendedAt !== null) {
        suspendedDuration += time - suspendedAt;
        suspendedAt = null;
    }
    refresh();
}

function refresh() {
    strip.layout();
    armTimer();
}

function clearAnnouncements() {
    strip.clear();
    refresh();
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
    applyMessageStyle();
    if (before.colorMode !== options.colorMode) applyPalette(options.colorMode);
    if (before.weightStart !== options.weightStart ||
        before.weightStep !== options.weightStep || before.weightReset !== options.weightReset || before.draw !== options.draw) source.reset();
    updateStatus();
    const mode = options.openTiming;
    if (before.openTiming !== mode || !before.limit ||
        (mode === 'fixed' && before.openInterval !== options.openInterval) ||
        (mode === 'random' && (before.randomMin !== options.randomMin || before.randomMax !== options.randomMax))) {
        nextOpenAt = now() + openDelay();
        messageOpenedAt = mode === 'message' ? now() : null;
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
applyMessageStyle();
nextOpenAt = now() + (options.openTiming === 'random' ? openDelay() : 0);
syncPlayback();
document.fonts.ready.then(refresh);
