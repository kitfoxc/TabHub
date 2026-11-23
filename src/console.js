'use strict';

const byId = id => document.getElementById(id);
const hubSelect = byId('hub');
const peers = new Map();
const profiles = new Map(diskConfig.hubs);
const editedProfiles = new Set();
let baseSettings = diskConfig.settings;
let current = profiles.has('main') ? 'main' : profiles.keys().next().value ?? 'main';
let options = profiles.get(current) ?? baseSettings;
profiles.set(current, options);
const chosen = new Set();
const receipts = new Map();
const configResults = new Map();
let delivery = new Map();
const transmit = openHubChannel(onPacket);
const session = transmit && broadcastId();
let discoverTimer;

function selectHub(id) {
    current = id;
    options = profiles.get(id);
    hubSelect.value = id;
    const url = new URL('hub.html', location.href);
    url.searchParams.set('hub', id);
    byId('source-url').value = url.href;
    showConfigStatus();
}
function showConfigStatus() {
    byId('applied').textContent = configResults.get(current) || '';
}
function renderHubs() {
    hubSelect.replaceChildren();
    const choices = byId('recipients');
    choices.replaceChildren();
    for (const id of profiles.keys()) {
        const count = [...peers.values()].filter(peer => peer.hub === id).length;
        const name = id + (count ? ' · 在线 ' + count : ' · 离线');
        hubSelect.add(new Option(name, id));
        const label = document.createElement('label');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = chosen.has(id);
        box.onchange = () => box.checked ? chosen.add(id) : chosen.delete(id);
        label.append(box, name);
        choices.append(label);
    }
    hubSelect.value = current;
    byId('connection').textContent = transmit ? '在线显示端 ' + peers.size : '当前环境无法使用内置广播';
}
function renderDelivery() {
    byId('delivery').textContent = [...delivery].map(([label, result]) => label + ' · ' + result).join('\n');
}
function request(peer, type, payload, report) {
    const id = broadcastId();
    const finish = result => {
        clearTimeout(timer);
        receipts.delete(id);
        writeLog(peer.hub + ' · ' + type + ' · ' + result);
        report(result);
    };
    const timer = setTimeout(() => finish('未收到回执'), 5000);
    receipts.set(id, { peer, finish });
    transmit({ type, id, instance: peer.instance, hub: peer.hub, session, ...payload });
}
function syncPeer(peer) {
    const settings = profiles.get(peer.hub);
    const sequence = ++peer.sequence;
    peer.status = '等待应用';
    const update = () => {
        configResults.set(peer.hub, [...peers.values()].filter(p => p.hub === peer.hub)
            .map(p => p.status).join(' / '));
        showConfigStatus();
    };
    update();
    request(peer, 'configure', { settings }, result => {
        if (sequence !== peer.sequence || peers.get(peer.instance) !== peer) return;
        peer.status = result;
        update();
    });
}
function onPacket(packet) {
    if (!validHubId(packet.hub) || typeof packet.instance !== 'string') return;
    if (packet.type === 'ready') {
        if (discoverTimer !== undefined) transmit({ type: 'discover', session, instance: packet.instance });
        return;
    }
    if (packet.session !== session) return;
    const peer = peers.get(packet.instance);
    if (packet.type === 'present') {
        if (discoverTimer === undefined) return;
        if (peer) { peer.seen = Date.now(); return; }
        const firstForHub = ![...peers.values()].some(p => p.hub === packet.hub);
        let liveSettings;
        try { liveSettings = restoreProfile(packet.settings); }
        catch { return; }
        const added = { hub: packet.hub, instance: packet.instance, seen: Date.now(), sequence: 0, status: '已读取显示端设置' };
        writeLog(packet.hub + ' · 已上线');
        peers.set(packet.instance, added);
        if (firstForHub && !editedProfiles.has(packet.hub)) {
            profiles.set(packet.hub, liveSettings);
            configResults.set(packet.hub, added.status);
            if (current === packet.hub) {
                options = liveSettings;
                fillPanel();
                showConfigStatus();
            }
        }
        renderHubs();
        if (editedProfiles.has(packet.hub)) syncPeer(added);
    } else if (packet.type === 'gone' && peer) {
        forgetPeer(peer);
        renderHubs();
    } else if (packet.type === 'ack') {
        const pending = receipts.get(packet.id);
        if (peer && pending?.peer === peer && typeof packet.result === 'string') pending.finish(packet.result);
    }
}
function forgetPeer(peer) {
    writeLog(peer.hub + ' · 已离线');
    peers.delete(peer.instance);
    if (![...peers.values()].some(p => p.hub === peer.hub)) {
        configResults.set(peer.hub, '离线，下次上线时同步');
        showConfigStatus();
    }
}
function applyOptions(value) {
    validate(value);
    options = value;
    profiles.set(current, value);
    editedProfiles.add(current);
    configResults.set(current, '离线，下次上线时同步');
    showConfigStatus();
    for (const peer of peers.values()) if (peer.hub === current) syncPeer(peer);
    byId('feedback').textContent = '会话配置已修改，保存后可在重启时恢复。';
}
function importConfig(data) {
    const loaded = readConfig(data);
    baseSettings = loaded.settings;
    // Import all named profiles and keep other Hubs in this session.
    for (const [id, value] of loaded.hubs) {
        profiles.set(id, value);
        editedProfiles.add(id);
    }
    renderHubs();
    selectHub(current);
    for (const peer of peers.values()) if (loaded.hubs.has(peer.hub)) syncPeer(peer);
    byId('feedback').textContent = '已合入配置。保存后可在重启时恢复。';
}
function dispatch(type) {
    const scope = byId('scope').value;
    const targets = scope === 'current' ? [current] : scope === 'selected' ? [...chosen] : [...new Set([...peers.values()].map(p => p.hub))];
    const text = byId('message').value;
    delivery = new Map();
    if (!targets.length || (type === 'message' && !text.trim())) {
        byId('delivery').textContent = !targets.length ? '没有选定的接收端。' : '请输入公告。';
        return;
    }
    writeLog(targets.join('、') + ' · ' + (type === 'message' ? '发送公告 · ' + text : type));
    const results = delivery;
    for (const hub of targets) {
        const online = [...peers.values()].filter(peer => peer.hub === hub);
        if (!online.length) { results.set(hub, '离线，未发送'); writeLog(hub + ' · 离线，未发送'); }
        online.forEach((peer, i) => {
            const label = online.length === 1 ? hub : hub + ' #' + (i + 1);
            results.set(label, '等待回执');
            request(peer, type, type === 'message' ? { text } : {}, result => {
                results.set(label, result);
                if (delivery === results) renderDelivery();
            });
        });
    }
    renderDelivery();
}
hubSelect.onchange = () => { selectHub(hubSelect.value); fillPanel(); byId('feedback').textContent = ''; };
byId('add-hub').onsubmit = event => {
    event.preventDefault();
    const id = byId('hub-id').value.trim();
    if (!validHubId(id)) { byId('feedback').textContent = '请输入有效的 Hub ID。'; return; }
    if (!profiles.has(id)) profiles.set(id, { ...baseSettings });
    renderHubs();
    selectHub(id);
    fillPanel();
    byId('hub-id').value = '';
};
byId('scope').onchange = () => { byId('recipients').hidden = byId('scope').value !== 'selected'; };
byId('send').onclick = () => dispatch('message');
for (const button of document.querySelectorAll('[data-command]')) button.onclick = () => dispatch(button.dataset.command);

byId('save-config').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        readPanel();
        const data = { version: 2, settings: baseSettings, hubs: Object.fromEntries(profiles) };
        const script = configPrefix + JSON.stringify(data, null, 2) + ';\n';
        byId('feedback').textContent = await saveScript('config.js', script);
    } catch (error) { byId('feedback').textContent = error.message; writeLog(error.message); }
    finally { button.disabled = false; }
};
renderHubs();
selectHub(current);
byId('feedback').textContent = configNotice;
writeLog(transmit ? '广播频道已打开，等待显示端。' : '当前环境无法打开广播频道。');
if (transmit) {
    function discover() {
        const cutoff = Date.now() - presenceTimeout;
        let changed = false;
        for (const peer of peers.values()) {
            if (peer.seen > cutoff) continue;
            forgetPeer(peer);
            changed = true;
        }
        if (changed) renderHubs();
        transmit({ type: 'discover', session, knownInstances: [...peers.keys()] });
    }
    function stopDiscovery() {
        if (discoverTimer === undefined) return;
        clearInterval(discoverTimer);
        discoverTimer = undefined;
        transmit({ type: 'console-gone', session });
    }
    function syncDiscovery() {
        if (document.hidden) stopDiscovery();
        else if (discoverTimer === undefined) {
            discoverTimer = setInterval(discover, discoveryInterval);
            discover();
        }
    }
    document.addEventListener('visibilitychange', syncDiscovery);
    window.addEventListener('pageshow', syncDiscovery);
    window.addEventListener('pagehide', stopDiscovery);
    syncDiscovery();
}
