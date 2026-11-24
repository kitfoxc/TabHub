'use strict';

const narrow = matchMedia('(max-width:680px)');
const manager = byId('manager');
function preference(key, fallback) {
    try {
        return localStorage.getItem('tabhub.console.' + key) ?? fallback;
    } catch {
        return fallback;
    }
}
function remember(key, value) {
    try {
        localStorage.setItem('tabhub.console.' + key, value);
    } catch {}
}
let collapsed = preference('left-hidden', 'false') === 'true';
function showManager(open) {
    manager.hidden = !open;
    byId('left-toggle').setAttribute('aria-expanded', String(open));
}
function adaptManager() {
    showManager(!narrow.matches && !collapsed);
}
narrow.addEventListener('change', adaptManager);
byId('left-toggle').onclick = () => {
    const open = manager.hidden;
    if (!narrow.matches) {
        collapsed = !open;
        remember('left-hidden', String(collapsed));
    }
    showManager(open);
};
manager.querySelector('.dismiss').onclick = () => showManager(false);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && narrow.matches) showManager(false);
});
byId('scheme').value = preference('scheme', 'auto');
document.documentElement.dataset.scheme = byId('scheme').value;
byId('scheme').onchange = () => {
    document.documentElement.dataset.scheme = byId('scheme').value;
    remember('scheme', byId('scheme').value);
};
byId('copy-url').onclick = async () => {
    try {
        await navigator.clipboard.writeText(byId('source-url').value);
        feedback.textContent = '已复制浏览器源 URL。';
    } catch {
        byId('source-url').select();
        feedback.textContent = '已选中 URL，可手动复制。';
    }
};
function playbackLabel(state) {
    return state ? (state.paused ? '已暂停' : '轮播中') + ' · ' + state.count + ' 个标签' : '等待状态回报';
}
function renderWorkspace() {
    const instances = [...peers.values()].filter((peer) => peer.hub === current);
    byId('settings-hub').textContent = current || '未选择 Hub';
    byId('scope').options[0].text = current ? '当前 Hub · ' + current : '当前 Hub';
    byId('targets').textContent = targetHubs().join('、') || '未选择';
    byId('live-hub').textContent = current ? current + ' · ' + instances.length + ' 个在线实例' : '未选择 Hub';
    byId('remove-hub').disabled = byId('copy-url').disabled = !current;
    byId('instances').replaceChildren(
        ...instances.map((peer) => {
            const row = element('article', '');
            const state = peer.playback;
            const theme = themeCatalog[state?.themeId]?.label;
            row.append(
                element('strong', playbackLabel(state)),
                element('p', state?.text || (state ? '当前无活动公告' : '显示端尚未回报公告内容')),
                element(
                    'small',
                    [
                        theme,
                        '实例 ' + peer.instance.slice(0, 6),
                        'Hub 回报于 ' + new Date(peer.seen).toLocaleTimeString()
                    ]
                        .filter(Boolean)
                        .join(' · ')
                )
            );
            return row;
        })
    );
    if (!instances.length) byId('instances').append(element('p', '暂无在线实例的播出快照。'));
    const cards = byId('hub-list');
    for (const [id, profile] of profiles) {
        let card = byId('hub-card-' + id);
        if (!card) {
            card = element('button', '');
            card.className = 'hub-card';
            card.id = 'hub-card-' + id;
            card.append(element('strong', id), element('small', ''));
            cards.append(card);
            card.onclick = () => {
                hubSelect.value = id;
                hubSelect.onchange();
                if (narrow.matches) showManager(false);
            };
        }
        const group = [...peers.values()].filter((peer) => peer.hub === id);
        const theme = themeCatalog[group[0]?.playback?.themeId ?? profile.themeId]?.label ?? profile.themeId;
        const detail = group.length === 1 ? playbackLabel(group[0].playback) : group.length + ' 个在线实例';
        card.lastChild.textContent = theme + ' · ' + (group.length ? detail : '离线');
        card.setAttribute('aria-pressed', String(id === current));
    }
}
document.addEventListener('hubworkspacechange', renderWorkspace);
adaptManager();
renderWorkspace();
