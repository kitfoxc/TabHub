'use strict';

const root = document.querySelector('main');
const narrow = matchMedia('(max-width:680px)');
const medium = matchMedia('(max-width:1020px)');
const storagePrefix = 'tabhub.console.';
function preference(key, fallback) {
    try {
        return localStorage.getItem(storagePrefix + key) ?? fallback;
    } catch {
        return fallback;
    }
}
function remember(key, value) {
    try {
        localStorage.setItem(storagePrefix + key, value);
    } catch {}
}
const panels = [
    { side: 'left', node: byId('manager'), breakpoint: narrow, width: 22 },
    { side: 'right', node: byId('inspector'), breakpoint: medium, width: 32 }
];
let drawer,
    view = 'live',
    frame,
    previewReady = false,
    previewTimer,
    lastPreview = '';
function panelLayout() {
    for (const panel of panels) {
        const overlay = panel.breakpoint.matches;
        const hidden = overlay ? drawer !== panel.side : panel.collapsed;
        panel.node.hidden = hidden;
        const divider = document.querySelector('[data-side="' + panel.side + '"]');
        divider.hidden = hidden || overlay;
        root.style.setProperty('--' + panel.side, hidden || overlay ? '0px' : panel.width + '%');
        root.style.setProperty('--' + panel.side + '-gap', divider.hidden ? '0px' : '5px');
        byId(panel.side + '-toggle').setAttribute('aria-pressed', String(!hidden));
    }
    queuePreview();
}
function openPanel(panel, open) {
    if (panel.breakpoint.matches) drawer = open ? panel.side : undefined;
    else {
        panel.collapsed = !open;
        remember(panel.side + '-hidden', String(panel.collapsed));
    }
    panelLayout();
}
for (const panel of panels) {
    panel.collapsed = preference(panel.side + '-hidden', 'false') === 'true';
    const saved = Number(preference(panel.side + '-width', panel.width));
    if (Number.isFinite(saved)) panel.width = Math.min(39, Math.max(16, saved));
    byId(panel.side + '-toggle').onclick = () => openPanel(panel, panel.node.hidden);
    panel.node.querySelector('.dismiss').onclick = () => openPanel(panel, false);
    const divider = document.querySelector('[data-side="' + panel.side + '"]');
    divider.onpointerdown = (e) => divider.setPointerCapture(e.pointerId);
    divider.onpointermove = (e) => {
        if (!divider.hasPointerCapture(e.pointerId)) return;
        panel.width = Math.min(
            39,
            Math.max(16, (100 * (panel.side === 'left' ? e.clientX : innerWidth - e.clientX)) / innerWidth)
        );
        panelLayout();
    };
    divider.onpointerup = () => remember(panel.side + '-width', panel.width);
    panel.breakpoint.addEventListener('change', () => {
        drawer = undefined;
        panelLayout();
    });
}
byId('manage').onclick = () => {
    openPanel(panels[0], true);
    byId('hub-tools').open = true;
    byId('hub-id').focus();
};
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        drawer = undefined;
        panelLayout();
        if (medium.matches) document.querySelector('.tools').open = false;
    }
});
document.querySelector('.tools').addEventListener('click', (e) => {
    if (e.target.closest('button') && medium.matches) document.querySelector('.tools').open = false;
});
const toolsMenu = document.querySelector('.tools');
function toolbarLayout() {
    toolsMenu.open = !medium.matches;
}
medium.addEventListener('change', toolbarLayout);
toolbarLayout();
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
function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
}
function playbackLabel(state) {
    return state ? (state.paused ? '已暂停' : '轮播中') + ' · ' + state.count + ' 条' : '等待状态回报';
}
function renderWorkspace() {
    const instances = [...peers.values()].filter((p) => p.hub === current);
    byId('settings-hub').textContent = current;
    byId('targets').textContent = targetHubs().join('、') || '未选择';
    byId('live-hub').textContent = current + ' · ' + (instances.length ? '在线 ' + instances.length : '离线');
    byId('instances').replaceChildren(
        ...instances.map((peer) => {
            const row = element('div', '');
            row.className = 'instance';
            row.append(
                element('strong', '实例 ' + peer.instance.slice(0, 6) + ' · ' + playbackLabel(peer.playback)),
                element(
                    'p',
                    peer.playback?.text || (peer.playback ? '当前无活动公告' : '此显示端尚未回报公告内容')
                )
            );
            return row;
        })
    );
    const cards = byId('hub-list');
    for (const [id, profile] of profiles) {
        let card = document.getElementById('hub-card-' + id);
        if (!card) {
            card = element('button', '');
            card.className = 'hub-card';
            card.id = 'hub-card-' + id;
            card.append(element('strong', id), element('small', ''));
            cards.append(card);
            card.onclick = () => {
                hubSelect.value = id;
                hubSelect.onchange();
                if (narrow.matches) openPanel(panels[0], false);
            };
        }
        const group = [...peers.values()].filter((peer) => peer.hub === id);
        const theme = themeCatalog[group[0]?.playback?.themeId ?? profile.themeId]?.label ?? profile.themeId;
        const detail = group.length === 1 ? playbackLabel(group[0].playback) : group.length + ' 个在线实例';
        card.lastChild.textContent = theme + ' · ' + (group.length ? detail : '离线');
        card.setAttribute('aria-pressed', String(id === current));
    }
    byId('preview-label').textContent = current + ' · 草稿模拟';
    queuePreview();
}
function queuePreview() {
    clearTimeout(previewTimer);
    if (view !== 'draft' || byId('inspector').hidden || document.hidden) {
        frame?.remove();
        frame = undefined;
        previewReady = false;
        lastPreview = '';
        return;
    }
    previewTimer = setTimeout(renderPreview, 100);
}
function scalePreview() {
    if (!frame) return;
    const width = Math.max(100, Math.min(7680, Number(byId('width').value) || 800));
    const height = Math.max(60, Math.min(4320, Number(byId('height').value) || 450));
    const scale = byId('viewport').clientWidth / width;
    Object.assign(frame.style, { width: width + 'px', height: height + 'px', transform: 'scale(' + scale + ')' });
    byId('viewport').style.height = height * scale + 'px';
}
function renderPreview() {
    if (!frame) {
        frame = document.createElement('iframe');
        frame.src = 'editor/preview.html';
        frame.title = '待发送公告模拟';
        byId('preview-error').textContent = '';
        byId('viewport').append(frame);
        scalePreview();
        return;
    }
    if (!previewReady) return;
    const payload = {
        channel: 'tabhub-editor',
        action: 'render',
        theme: options.themeId,
        palette: options.colorMode,
        interval: 10,
        settings: { ...options, variables: 'off', closeInterval: 0 },
        entries: [byId('message').value]
    };
    const signature = JSON.stringify(payload);
    if (signature === lastPreview) return;
    lastPreview = signature;
    frame.contentWindow.postMessage(payload, location.protocol === 'file:' ? '*' : location.origin);
}
window.addEventListener('message', (e) => {
    if (
        !frame ||
        e.source !== frame.contentWindow ||
        (e.origin !== location.origin && !(location.protocol === 'file:' && e.origin === 'null'))
    )
        return;
    if (e.data?.channel === 'tabhub-preview-ready') {
        previewReady = true;
        renderPreview();
    }
    if (e.data?.channel === 'tabhub-preview-error') byId('preview-error').textContent = e.data.message;
});
new ResizeObserver(scalePreview).observe(byId('viewport'));
for (const id of ['width', 'height']) byId(id).oninput = scalePreview;
byId('message').oninput = queuePreview;
for (const tab of document.querySelectorAll('[data-view]'))
    tab.onclick = () => {
        view = tab.dataset.view;
        for (const item of document.querySelectorAll('[data-view]')) {
            item.setAttribute('aria-pressed', String(item === tab));
            byId(item.dataset.view).hidden = item !== tab;
        }
        queuePreview();
    };
function renderWiki() {
    const q = byId('wiki-search').value.toLowerCase();
    byId('formats').replaceChildren(
        ...formats
            .filter((f) => (f.label + f.key).toLowerCase().includes(q))
            .map((f) => {
                const article = element('article', '');
                article.append(
                    element('strong', f.label + ' · ' + f.key),
                    element('p', f.help),
                    formatMessage(withFormat('公告示例', f.key, f.value), false)
                );
                return article;
            })
    );
}
byId('wiki-search').oninput = renderWiki;
renderWiki();
document.addEventListener('visibilitychange', queuePreview);
document.addEventListener('hubworkspacechange', renderWorkspace);
panelLayout();
renderWorkspace();
