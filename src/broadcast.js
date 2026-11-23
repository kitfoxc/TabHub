'use strict';

// Scope copies of TabHub in different installation folders independently.
function openHubChannel(receive) {
    const name = 'tabhub.v1:' + new URL('.', location.href).href;
    let channel;
    try {
        channel = new BroadcastChannel(name);
    } catch {
        return null;
    }
    channel.onmessage = ({ data }) => {
        if (data && data.version === 1 && typeof data.type === 'string') receive(data);
    };
    return packet => channel.postMessage({ ...packet, version: 1 });
}

function broadcastId() {
    return Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
}
