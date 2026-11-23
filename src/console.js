'use strict';

const byId = id => document.getElementById(id);
const hubSelect = byId('hub');
const peers = new Map();
const profiles = new Map(diskConfig.hubs);
let baseSettings = diskConfig.settings;
let current = profiles.has('main') ? 'main' : profiles.keys().next().value ?? 'main';
let options = profiles.get(current) ?? baseSettings;
profiles.set(current, options);
const chosen = new Set();
const receipts = new Map();
const configResults = new Map();
let delivery = new Map();
const transmit = openHubChannel(onPacket);

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
        report(result);
    };
    const timer = setTimeout(() => finish('未收到回执'), 5000);
    receipts.set(id, { peer, finish });
    transmit({ type, id, instance: peer.instance, hub: peer.hub, ...payload });
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
    const peer = peers.get(packet.instance);
    if (packet.type === 'present') {
        if (peer) { peer.seen = Date.now(); return; }
        const added = { hub: packet.hub, instance: packet.instance, seen: Date.now(), sequence: 0 };
        peers.set(packet.instance, added);
        if (!profiles.has(packet.hub)) profiles.set(packet.hub, { ...baseSettings });
        renderHubs();
        syncPeer(added);
    } else if (packet.type === 'gone' && peer) {
        forgetPeer(peer);
        renderHubs();
    } else if (packet.type === 'ack') {
        const pending = receipts.get(packet.id);
        if (peer && pending?.peer === peer && typeof packet.result === 'string') pending.finish(packet.result);
    }
}
function forgetPeer(peer) {
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
    configResults.set(current, '离线，下次上线时同步');
    showConfigStatus();
    for (const peer of peers.values()) if (peer.hub === current) syncPeer(peer);
    byId('feedback').textContent = '会话配置已修改，保存后可在重启时恢复。';
}
function importConfig(data) {
    if (data.version === 2) {
        const loaded = readConfig(data);
        baseSettings = loaded.settings;
        // Import all named profiles and keep other Hubs in this session.
        for (const [id, value] of loaded.hubs) profiles.set(id, value);
        renderHubs();
        selectHub(current);
        for (const peer of peers.values()) syncPeer(peer);
        byId('feedback').textContent = '已合入配置。保存后可在重启时恢复。';
    } else {
        applyOptions(restoreProfile(readProfile(data), true));
    }
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
    const results = delivery;
    for (const hub of targets) {
        const online = [...peers.values()].filter(peer => peer.hub === hub);
        if (!online.length) results.set(hub, '离线，未发送');
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
let saveHandle;
byId('save-config').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        readPanel();
        const data = { version: 2, settings: baseSettings, hubs: Object.fromEntries(profiles) };
        const script = configPrefix + JSON.stringify(data, null, 2) + ';\n';
        if (typeof window.showSaveFilePicker === 'function') {
            try {
                saveHandle ??= await window.showSaveFilePicker({ suggestedName: 'config.js' });
                const stream = await saveHandle.createWritable();
                await stream.write(script);
                await stream.close();
                byId('feedback').textContent = '配置已写入 ' + saveHandle.name + '。';
                return;
            } catch (error) {
                if (error.name === 'AbortError') return;
                saveHandle = undefined;
            }
        }
        downloadScript('config.js', script);
        byId('feedback').textContent = '已请求下载，请用导出的 config.js 覆盖项目根目录中的同名文件。';
    } catch (error) { byId('feedback').textContent = error.message; }
    finally { button.disabled = false; }
};
renderHubs();
selectHub(current);
byId('feedback').textContent = configNotice;
if (transmit) {
    function discover() {
        for (const peer of peers.values()) {
            if (Date.now() - peer.seen > 18000) { forgetPeer(peer); renderHubs(); }
        }
        transmit({ type: 'discover' });
    }
    discover();
    setInterval(discover, 5000);
}
