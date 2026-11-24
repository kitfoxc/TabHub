'use strict';

let handshakeTimer;
let frame,
    ready = false,
    inspectorMode = 'preview',
    playing = false,
    frozen = false;
const inspector = el('inspector');
function showInspector(wiki) {
    inspectorMode = wiki ? 'wiki' : 'preview';
    el('wikiPanel').hidden = !wiki;
    el('previewPanel').hidden = wiki;
    el('wikiTab').setAttribute('aria-pressed', String(wiki));
    el('previewTab').setAttribute('aria-pressed', String(!wiki));
    if (wiki) renderWiki();
    if (doc) refreshPreview();
}
function post(action, detail = {}) {
    if (ready)
        frame.contentWindow.postMessage(
            { channel: 'tabhub-editor', action, ...detail },
            location.protocol === 'file:' ? '*' : location.origin
        );
}
function renderFrame() {
    if (!ready || !doc) return;
    const all = el('scope').value === 'all';
    const { leaf } = leafState();
    post('render', {
        theme: el('theme').value,
        palette: el('palette').value,
        interval: Math.min(3600, Math.max(0.1, Number(el('seconds').value) || 4)),
        entries: all ? doc.rows.map((r) => r.value) : leaf ? [leaf.value] : [],
        playing: all && playing && !frozen,
        frozen
    });
}
function sizeFrame() {
    if (!frame) return;
    const width = Math.max(100, Math.min(7680, +el('viewWidth').value || 800));
    const height = Math.max(60, Math.min(4320, +el('viewHeight').value || 450));
    const scale = el('zoom').value === 'fit' ? Math.min(1, el('viewport').clientWidth / width) : +el('zoom').value;
    Object.assign(el('frameBox').style, { width: width * scale + 'px', height: height * scale + 'px' });
    Object.assign(frame.style, { width: width + 'px', height: height + 'px', transform: 'scale(' + scale + ')' });
}
function discardFrame() {
    clearTimeout(handshakeTimer);
    frame?.remove();
    frame = undefined;
    ready = false;
}
function refreshPreview() {
    if (!doc || inspectorMode !== 'preview' || inspector.hidden) {
        discardFrame();
        return;
    }
    const { leaf } = leafState();
    const body = el('bodyPreview');
    try {
        body.replaceChildren(leaf ? formatMessage(leaf.value, true) : document.createTextNode('无可预览的正文'));
    } catch (error) {
        body.textContent = '无法预览此片段 · ' + error.message;
        discardFrame();
        return;
    }
    if (!frame) {
        ready = false;
        frame = document.createElement('iframe');
        frame.title = '独立 Hub 预览';
        handshakeTimer = setTimeout(() => {
            if (!ready) {
                status('Hub 预览未就绪，请检查编辑器的资源文件。');
                discardFrame();
            }
        }, 8000);
        frame.src = 'editor/preview.html';
        el('frameBox').append(frame);
        sizeFrame();
    } else renderFrame();
}
window.addEventListener('message', (e) => {
    if (
        !frame ||
        e.source !== frame.contentWindow ||
        (e.origin !== location.origin && !(location.protocol === 'file:' && e.origin === 'null'))
    )
        return;
    if (e.data?.channel === 'tabhub-preview-ready') {
        clearTimeout(handshakeTimer);
        ready = true;
        renderFrame();
    }
    if (e.data?.channel === 'tabhub-preview-error') {
        status('主题预览失败，正文预览仍可用 · ' + e.data.message);
        discardFrame();
    }
});
el('theme').append(...Object.entries(themeCatalog).map(([id, t]) => new Option(t.label, id)));
for (const key of ['theme', 'palette', 'seconds']) el(key).onchange = renderFrame;
for (const key of ['viewWidth', 'viewHeight', 'zoom']) el(key).onchange = sizeFrame;
new ResizeObserver(sizeFrame).observe(el('viewport'));
function playbackUI() {
    el('play').textContent = playing ? '暂停' : '播放';
    el('play').disabled = el('scope').value !== 'all' || frozen;
}
el('scope').onchange = () => {
    playing = false;
    playbackUI();
    renderFrame();
};
el('play').onclick = () => {
    playing = !playing;
    playbackUI();
    post(playing ? 'play' : 'pause');
};
el('freeze').onclick = () => {
    frozen = !frozen;
    el('freeze').textContent = frozen ? '恢复动效' : '冻结动效';
    if (playing) post(frozen ? 'pause' : 'play');
    post('motion', { frozen });
    playbackUI();
};
el('step').onclick = () => post('next');
el('restart').onclick = renderFrame;
playbackUI();

function insertExample(example) {
    const state = leafState();
    if (state.row?.error) {
        status('请先修正当前公告源码');
        return;
    }
    if (!state.leaf) {
        const row = messageRow(example);
        editRows([...doc.rows, row]);
        setActive(row.id);
        return;
    }
    const parts = state.parts.slice();
    const position = partIndex + (parts.length ? 1 : 0);
    parts.splice(position, 0, example);
    partIndex = position;
    replaceParts(state, parts);
}
function renderWiki() {
    const q = el('wikiSearch').value.trim().toLowerCase();
    const articles = formats
        .filter((def) => [def.label, def.key, ...(def.choices || [])].join(' ').toLowerCase().includes(q))
        .map((def) => {
            const article = document.createElement('article'),
                heading = document.createElement('h3'),
                desc = document.createElement('p');
            const example = withFormat('直播公告', def.key, def.value),
                code = JSON.stringify(example, null, 2);
            heading.textContent = def.label + ' · ' + def.key;
            desc.textContent = def.help + (def.choices ? ' 可选值：' + def.choices.join('、') : '');
            const source = document.createElement('pre');
            source.textContent = code;
            const result = document.createElement('div');
            result.className = 'paper';
            result.append(formatMessage(example, false));
            const actions = document.createElement('div');
            actions.className = 'actions';
            actions.append(
                button('复制源码', async () => {
                    try {
                        await navigator.clipboard.writeText(code);
                        status('已复制示例');
                    } catch {
                        el('code').value = code;
                        el('codeDialog').showModal();
                        el('code').select();
                    }
                }),
                button('插入示例', () => insertExample(example))
            );
            article.append(heading, desc, source, result, actions);
            return article;
        });
    el('wiki').replaceChildren(...articles);
}
el('wikiSearch').oninput = renderWiki;
el('wikiTab').onclick = () => showInspector(true);
el('previewTab').onclick = () => showInspector(false);
function preference(key, fallback) {
    try {
        return localStorage.getItem('tabhub.editor.' + key) ?? fallback;
    } catch {
        return fallback;
    }
}
function remember(key, value) {
    try {
        localStorage.setItem('tabhub.editor.' + key, value);
    } catch {}
}
el('scheme').value = preference('scheme', 'auto');
function applyScheme() {
    document.documentElement.dataset.scheme = el('scheme').value;
}
el('scheme').onchange = () => {
    applyScheme();
    remember('scheme', el('scheme').value);
};
applyScheme();
for (const divider of document.querySelectorAll('.divider')) {
    const side = divider.dataset.edge,
        panel = side === 'left' ? el('library') : inspector;
    let width = Math.min(45, Math.max(15, Number(preference(side, side === 'left' ? 24 : 34))));
    function applyWidth() {
        document.documentElement.style.setProperty('--' + side, panel.hidden ? '0px' : width + '%');
    }
    applyWidth();
    divider.onpointerdown = (e) => {
        if (!panel.hidden) divider.setPointerCapture(e.pointerId);
    };
    divider.onpointermove = (e) => {
        if (!divider.hasPointerCapture(e.pointerId)) return;
        width = Math.min(
            45,
            Math.max(15, ((side === 'left' ? e.clientX : innerWidth - e.clientX) * 100) / innerWidth)
        );
        applyWidth();
    };
    divider.onpointerup = () => remember(side, width);
    el(side === 'left' ? 'toggleLeft' : 'toggleRight').onclick = () => {
        panel.hidden = !panel.hidden;
        applyWidth();
        refreshPreview();
    };
}
function restoreDocument(data, copy = false) {
    const d = newDocument(data.name);
    Object.assign(d, data, { id: copy ? d.id : data.id, saved: data.dirty ? null : data.rows });
    return d;
}
el('recover').onclick = async () => {
    if (!database) {
        status('本地草稿不可用');
        return;
    }
    try {
        const drafts = await listDrafts(database);
        const others = drafts.filter((d) => d.key !== workspaceKey);
        el('drafts').replaceChildren(
            ...others.map((saved) => {
                const names = saved.documents.map((d) => d.name).join('、');
                return button(new Date(saved.updated).toLocaleString() + ' · ' + names, () => {
                    const restored = saved.documents.map((d) => restoreDocument(d, true));
                    docs.push(...restored);
                    if (restored.length) switchDocument(restored[0]);
                    el('draftDialog').close();
                });
            })
        );
        if (!others.length) el('drafts').textContent = '没有其他窗口的草稿';
        el('draftDialog').showModal();
    } catch (e) {
        status(e.message);
    }
};
el('dismissDraft').onclick = () => el('draftDialog').close();
async function initializeEditor() {
    document.body.inert = true;
    try {
        database = await openDraftDatabase();
        const saved = await loadWorkspace(database);
        if (saved)
            for (const data of saved.documents) {
                docs.push(restoreDocument(data));
            }
        if (docs.length) {
            switchDocument(docs.find((d) => d.id === saved.activeId) ?? docs[0]);
            status('已恢复本地工作区');
        }
    } catch (e) {
        status('本地草稿不可用 · ' + e.message);
    } finally {
        if (!docs.length) makeDocument('未命名.js', []);
        showInspector(false);
        document.body.inert = false;
    }
}
initializeEditor();
