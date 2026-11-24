'use strict';

const instance = broadcastId();
const handled = new Set();
let operations = Promise.resolve();
const sendPacket = validHubId(hubId) && openHubChannel(receivePacket);
let consoleSession;
let presenceTimer;
let pageActive = true;

function sleepBroadcast() {
    clearTimeout(presenceTimer);
    presenceTimer = undefined;
    consoleSession = undefined;
    handled.clear();
}

function announce(type, data = {}) {
    // Piggyback on existing discovery and command receipts, including after a console wakes.
    const playback = type === 'present' || type === 'ack' ? {
        paused, count: strip.size, themeId: options.themeId,
        text: (document.querySelector('#tabs > .active .label')?.textContent ?? '').slice(0, 512)
    } : undefined;
    sendPacket({ type, playback, supportsEntry: true, hub: hubId, instance, session: consoleSession, ...data });
}

function receivePacket(packet) {
    if (!pageActive) return;
    if (packet.type === 'discover') {
        if (typeof packet.session !== 'string' || (packet.instance && packet.instance !== instance)) return;
        if (consoleSession !== packet.session) handled.clear();
        consoleSession = packet.session;
        clearTimeout(presenceTimer);
        presenceTimer = setTimeout(sleepBroadcast, presenceTimeout);
        if (Array.isArray(packet.knownInstances) && packet.knownInstances.includes(instance)) {
            announce('present');
            return;
        }
        // Read the last applied settings once any accepted commands have finished.
        operations.then(() => {
            if (consoleSession === packet.session) announce('present', { settings: options });
        });
        return;
    }
    if (!consoleSession || packet.session !== consoleSession) return;
    if (packet.type === 'console-gone') {
        sleepBroadcast();
        return;
    }
    if (packet.instance !== instance || packet.hub !== hubId || typeof packet.id !== 'string') return;
    if (handled.has(packet.id)) return;
    handled.add(packet.id);
    if (handled.size > 256) handled.delete(handled.values().next().value);
    // A command sent immediately after a theme change must see the new settings.
    operations = operations.then(() => executePacket(packet));
}

async function executePacket(packet) {
    let result;
    let ok = true;
    try {
        switch (packet.type) {
            case 'configure':
                ok = await applyHubSettings(packet.settings);
                result = ok ? '已应用' : '已由更新的配置取代';
                break;
            case 'message': {
                if (typeof packet.text !== 'string' || !packet.text.trim()) throw new Error('公告为空');
                const label = document.createElement('span');
                label.textContent = packet.text;
                if (!appendAnnouncement(label, true)) throw new Error('标签数量上限为 0');
                refresh();
                result = '已创建标签';
                break;
            }
            case 'entry': {
                const entry = packet.entry;
                if (entry?.type === 'queue' || entry?.type === 'pack' || !validEntry(entry)) throw new Error('无效的公告条目');
                const content = formatMessage(entry, options.variables === 'on');
                if (!content.textContent.trim()) throw new Error('公告为空');
                if (!appendAnnouncement(content, true)) throw new Error('标签数量上限为 0');
                refresh();
                result = '已创建标签';
                break;
            }
            case 'toggle':
                setPaused(!paused);
                result = paused ? '已暂停' : '已恢复';
                break;
            case 'clear':
                clearAnnouncements();
                result = '已清空公告';
                break;
            case 'pause':
            case 'resume':
                setPaused(packet.type === 'pause');
                result = paused ? '已暂停' : '已恢复';
                break;
            case 'next':
                ok = Boolean(nextTab());
                result = ok ? '已创建标签' : '没有可创建的标签';
                break;
            default: return;
        }
    } catch (error) {
        ok = false;
        result = packet.type === 'configure' ? '配置应用失败，请检查字段和主题资源' : error.message;
    }
    if (consoleSession === packet.session) announce('ack', { id: packet.id, result, ok });
}

if (sendPacket) {
    announce('ready');
    window.addEventListener('pageshow', () => {
        if (pageActive) return;
        pageActive = true;
        announce('ready');
    });
    window.addEventListener('pagehide', () => {
        if (consoleSession) announce('gone');
        pageActive = false;
        sleepBroadcast();
    });
}
