'use strict';

const byId = id => document.getElementById(id);
const hubSelect = byId('hub');
const peers = new Map();
const profiles = new Map(diskConfig.hubs);
const editedProfiles = new Set();
let baseSettings = diskConfig.settings;
if (!profiles.size && configNotice) profiles.set('main', baseSettings);
let current = profiles.has('main') ? 'main' : profiles.keys().next().value;
let options = profiles.get(current) ?? baseSettings;
const chosen = new Set();
const receipts = new Map();
const configResults = new Map();
let latestDispatch;
const removedHubs = new Set();
const transmit = openHubChannel(onPacket);
const session = transmit && broadcastId();
let discoverTimer;
let configRevision = 0;
function markConfigChanged() {
    configRevision++;
    byId('save-config').textContent = '保存全部配置 •';
    byId('save-config').title = '有尚未写入文件的配置';
}

function selectHub(id) {
    current = id;
    options = profiles.get(id) ?? baseSettings;
    hubSelect.value = id;
    const url = new URL('hub.html', location.href);
    url.searchParams.set('hub', id);
    byId('source-url').value = id ? url.href : '';
    showConfigStatus();
    workspaceChanged();
}
function workspaceChanged() {
    document.dispatchEvent(new Event('hubworkspacechange'));
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
        box.onchange = () => { if (box.checked) chosen.add(id); else chosen.delete(id); workspaceChanged(); };
        label.append(box, name);
        choices.append(label);
    }
    hubSelect.value = current;
    byId('connection').textContent = transmit ? '在线显示端 ' + peers.size : '当前环境无法使用内置广播';
    workspaceChanged();
}
function request(peer, type, payload, report) {
    const id = broadcastId();
    const finish = (result, state) => {
        clearTimeout(timer);
        receipts.delete(id);
        report(result, state);
    };
    const timer = setTimeout(() => finish('未收到回执', 'timeout'), 5000);
    receipts.set(id, { peer, finish });
    try {
        transmit({ type, id, instance: peer.instance, hub: peer.hub, session, ...payload });
    } catch {
        finish('广播发送失败', 'failed');
    }
}

function syncPeers(servers) {
    if (!servers.length) return;
    const updateLog = logOperation('应用 Hub 配置', servers.map(peer => ({hub:peer.hub, peer})));
    for (const [index,peer] of servers.entries()) {
        const sequence = ++peer.sequence;
        const update = status => {
            peer.status = status;
            configResults.set(peer.hub, [...peers.values()].filter(p => p.hub === peer.hub)
                .map(p => p.status).join(' / '));
            showConfigStatus();
        };
        update('等待应用');
        request(peer,'configure',{settings:profiles.get(peer.hub)},(result,state) => {
            updateLog(index,state,result);
            if (sequence === peer.sequence && peers.get(peer.instance) === peer) update(result);
        });
    }
}
function onPacket(packet) {
    if (!validHubId(packet.hub) || typeof packet.instance !== 'string') return;
    if (removedHubs.has(packet.hub)) return;
    if (packet.type === 'ready') {
        if (discoverTimer !== undefined) transmit({ type: 'discover', session, instance: packet.instance });
        return;
    }
    if (packet.session !== session) return;
    const peer = peers.get(packet.instance);
    if (packet.type === 'present') {
        if (discoverTimer === undefined) return;
        if (peer) { peer.seen = Date.now(); peer.playback = packet.playback; peer.supportsEntry = packet.supportsEntry === true; workspaceChanged(); return; }
        const firstForHub = ![...peers.values()].some(p => p.hub === packet.hub);
        let liveSettings;
        try { liveSettings = restoreProfile(packet.settings); }
        catch { return; }
        const added = { supportsEntry: packet.supportsEntry === true, playback: packet.playback, hub: packet.hub, instance: packet.instance, seen: Date.now(), sequence: 0, status: '已读取显示端设置' };
        writeLog(packet.hub + ' · 已上线');
        peers.set(packet.instance, added);
        if (firstForHub && !editedProfiles.has(packet.hub)) {
            profiles.set(packet.hub, liveSettings);
            configResults.set(packet.hub, added.status);
            if (!current) selectHub(packet.hub);
            if (current === packet.hub) {
                options = liveSettings;
                fillPanel();
                showConfigStatus();
            }
        }
        renderHubs();
        if (editedProfiles.has(packet.hub)) syncPeers([added]);
    } else if (packet.type === 'gone' && peer) {
        forgetPeer(peer);
        renderHubs();
    } else if (packet.type === 'ack') {
        const pending = receipts.get(packet.id);
        if (peer && pending?.peer === peer && typeof packet.result === 'string') {
            peer.playback = packet.playback;
            peer.seen = Date.now();
            const ok = packet.ok ?? ['已应用','已创建标签','已清空公告','已暂停','已恢复'].includes(packet.result);
            pending.finish(packet.result, ok ? 'success' : 'failed');
            workspaceChanged();
        }
    }
}
function forgetPeer(peer) {
    const removed = removedHubs.has(peer.hub);
    if (!removed) writeLog(peer.hub + ' · 已离线');
    peers.delete(peer.instance);
    for (const pending of receipts.values()) {
        if (pending.peer === peer) pending.finish(removed ? 'Hub 已从控制台移除' : '显示端已离线', 'failed');
    }
    if (![...peers.values()].some(p => p.hub === peer.hub)) {
        configResults.set(peer.hub, '离线，下次上线时同步');
        showConfigStatus();
    }
}
function applyOptions(value) {
    validate(value);
    markConfigChanged();
    options = value;
    profiles.set(current, value);
    editedProfiles.add(current);
    workspaceChanged();
    configResults.set(current, '离线，下次上线时同步');
    showConfigStatus();
    syncPeers([...peers.values()].filter(peer => peer.hub === current));
    byId('feedback').textContent = '会话配置已修改，保存后可在重启时恢复。';
}
function importConfig(data) {
    const loaded = readConfig(data);
    markConfigChanged();
    baseSettings = loaded.settings;
    // Import all named profiles and keep other Hubs in this session.
    for (const [id, value] of loaded.hubs) {
        removedHubs.delete(id);
        profiles.set(id, value);
        editedProfiles.add(id);
    }
    renderHubs();
    selectHub(current || profiles.keys().next().value);
    syncPeers([...peers.values()].filter(peer => loaded.hubs.has(peer.hub)));
    byId('feedback').textContent = '已合入配置。保存后可在重启时恢复。';
}
function targetHubs() {
    const scope = byId('scope').value;
    return scope === 'current' ? (current ? [current] : []) : scope === 'selected' ? [...chosen] : [...new Set([...peers.values()].map(p => p.hub))];
}
const commandTitles = { message:'发送实时公告', entry:'发送轮播公告', toggle:'切换轮播', next:'下一条', clear:'清空公告' };
function dispatch(type, entry) {
    const targets = targetHubs();
    const text = type === 'entry' ? entryText(entry) : byId('message').value;
    const recipients = targets.flatMap(hub => {
        const online = [...peers.values()].filter(peer => peer.hub === hub);
        return online.length ? online.map(peer => ({hub, peer})) : [{hub}];
    });
    const results = [];
    latestDispatch = results;
    if (!recipients.length || (type === 'message' && !text.trim())) {
        byId('delivery').textContent = !recipients.length ? '没有选定的接收端。' : '请输入公告。';
        return;
    }
    const content = type === 'entry' || type === 'message' ? text : '';
    const updateLog = logOperation(commandTitles[type], recipients, content);
    recipients.forEach(({hub, peer}, index) => {
        const update = (result,state) => {
            updateLog(index,state,result);
            results[index] = hub + (peer ? ' · '+peer.instance.slice(0,6) : '') + ' · '+result;
            if (latestDispatch === results) byId('delivery').textContent = results.join('\n');
        };
        if (!peer) { update('离线，未发送','failed'); return; }
        let command = type;
        let payload = {};
        if (type === 'entry' && peer.supportsEntry) payload = {entry};
        else if (type === 'message' || (type === 'entry' && typeof entry === 'string')) {
            command = 'message';
            payload = {text};
        } else if (type === 'entry') {
            update('显示端版本不支持富文本单条发送','failed');
            return;
        }
        update('等待回执','pending');
        request(peer,command,payload,update);
    });
}
hubSelect.onchange = () => {
    if (current !== hubSelect.value) writeLog('切换当前 Hub · '+hubSelect.value);
    selectHub(hubSelect.value);
    fillPanel();
    byId('feedback').textContent = '';
};
byId('add-hub').onsubmit = event => {
    event.preventDefault();
    const id = byId('hub-id').value.trim();
    if (!validHubId(id)) { byId('feedback').textContent = '请输入有效的 Hub ID。'; return; }
    removedHubs.delete(id);
    if (!profiles.has(id)) {
        profiles.set(id, { ...baseSettings });
        markConfigChanged();
    }
    renderHubs();
    selectHub(id);
    fillPanel();
    byId('hub-id').value = '';
};
byId('remove-hub').onclick = () => {
    if (!current || !confirm('从控制台移除 '+current+'？保存全部配置后生效。运行中的显示端将继续轮播。')) return;
    const id = current;
    removedHubs.add(id);
    for (const peer of peers.values()) if (peer.hub === id) forgetPeer(peer);
    profiles.delete(id);
    chosen.delete(id);
    editedProfiles.delete(id);
    configResults.delete(id);
    byId('hub-card-'+id)?.remove();
    markConfigChanged();
    renderHubs();
    selectHub(profiles.keys().next().value);
    fillPanel();
    writeLog('已移除 Hub · '+id);
};
byId('scope').onchange = () => { byId('recipients').hidden = byId('scope').value !== 'selected'; workspaceChanged(); };
byId('send').onclick = () => dispatch('message');
for (const button of document.querySelectorAll('[data-command]')) button.onclick = () => dispatch(button.dataset.command);

byId('save-config').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        readPanel();
        const data = { version: 2, settings: baseSettings, hubs: Object.fromEntries(profiles) };
        const script = configPrefix + JSON.stringify(data, null, 2) + ';\n';
        const revision = configRevision;
        const result = await saveScript('config.js', script);
        byId('feedback').textContent = result;
        if (result.startsWith('已写入') && configRevision === revision) {
            button.textContent = '保存全部配置';
            button.title = '';
        }
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
