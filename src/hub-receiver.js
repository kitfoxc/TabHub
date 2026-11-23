'use strict';

const instance = broadcastId();
const handled = new Set();
let operations = Promise.resolve();
const sendPacket = validHubId(hubId) && openHubChannel(receivePacket);

function announce(type) {
    sendPacket?.({ type, hub: hubId, instance });
}

function receivePacket(packet) {
    if (packet.type === 'discover') {
        announce('present');
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
    try {
        switch (packet.type) {
            case 'configure':
                result = await applyHubSettings(packet.settings) ? '已应用' : '已由更新的配置取代';
                break;
            case 'message': {
                if (typeof packet.text !== 'string' || !packet.text.trim()) throw new Error('公告为空');
                const label = document.createElement('span');
                label.textContent = packet.text;
                if (!strip.append(label, true)) throw new Error('标签数量上限为 0');
                refresh();
                result = '已创建标签';
                break;
            }
            case 'pause':
            case 'resume':
                setPaused(packet.type === 'pause');
                result = paused ? '已暂停' : '已恢复';
                break;
            case 'next':
                result = nextTab() ? '已创建标签' : '没有可创建的标签';
                break;
            default: return;
        }
    } catch (error) {
        result = packet.type === 'configure' ? '配置应用失败，请检查字段和主题资源' : error.message;
    }
    sendPacket({ type: 'ack', id: packet.id, hub: hubId, instance, result });
}

if (sendPacket) {
    announce('present');
    window.addEventListener('pageshow', () => announce('present'));
    window.addEventListener('pagehide', () => announce('gone'));
}
