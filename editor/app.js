'use strict';

const el = (id) => document.getElementById(id);
const docs = [];
let doc,
    database,
    draftTimer,
    previewTimer,
    pageSize = 100;
let mode = 'visual',
    leafIndex = 0,
    partIndex = 0,
    dragged;
const selected = () => doc?.rows.find((row) => row.id === doc.active);
const status = (text) => {
    el('status').textContent = text;
};
function button(text, action) {
    const b = document.createElement('button');
    b.textContent = text;
    b.onclick = action;
    return b;
}
function flushDraft() {
    clearTimeout(draftTimer);
    if (database && doc)
        storeWorkspace(database, docs, doc.id).catch((e) => status('草稿无法保存 · ' + e.message));
}
function queueDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(flushDraft, 350);
}
function ensureActive() {
    if (!selected()) doc.active = doc.rows[0]?.id;
    const ids = new Set(doc.rows.map((r) => r.id));
    doc.checked.forEach((id) => {
        if (!ids.has(id)) doc.checked.delete(id);
    });
}
function switchDocument(next) {
    if (doc) doc.group = null;
    doc = next;
    doc.group = null;
    leafIndex = partIndex = 0;
    pageSize = 100;
    el('search').value = doc.search;
    refreshEditor();
    queueDraft();
}
function makeDocument(name, entries) {
    const next = newDocument(name, entries);
    docs.push(next);
    switchDocument(next);
    return next;
}
function editRows(rows, group) {
    updateRows(doc, rows, group);
    queueDraft();
}
function editRow(row, group) {
    editRows(
        doc.rows.map((old) => (old.id === row.id ? row : old)),
        group
    );
}
function setActive(id) {
    doc.active = id;
    leafIndex = partIndex = 0;
    doc.group = null;
    refreshEditor();
    queueDraft();
}
function renderBar() {
    el('documents').replaceChildren(
        ...docs.map((d) => {
            const b = button(d.name + (d.rows !== d.saved ? ' •' : ''), () => switchDocument(d));
            b.setAttribute('aria-pressed', String(d === doc));
            return b;
        })
    );
    el('undo').disabled = !doc.past.length;
    el('redo').disabled = !doc.future.length;
    el('stats').textContent =
        (doc.rows !== doc.saved ? '有未保存修改' : '文件无修改') + ' · ' + doc.rows.length + ' 条';
}
const searchText = new WeakMap();
function titleOf(row) {
    if (!searchText.has(row)) searchText.set(row, plainText(row.value));
    return searchText.get(row);
}
function filtered() {
    const q = doc.search.trim().toLowerCase();
    return q ? doc.rows.filter((row) => titleOf(row).toLowerCase().includes(q)) : doc.rows;
}
function list() {
    const rows = filtered();
    el('count').textContent = rows.length;
    el('checkAll').checked = !!rows.length && rows.every((r) => doc.checked.has(r.id));
    const nodes = rows.slice(0, pageSize).map((row) => {
        const line = document.createElement('div');
        line.className = 'row' + (row.id === doc.active ? ' active' : '');
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = doc.checked.has(row.id);
        check.setAttribute('aria-label', '选择消息');
        check.onchange = () => {
            if (check.checked) doc.checked.add(row.id);
            else doc.checked.delete(row.id);
            list();
        };
        const title = titleOf(row).slice(0, 120) || '空消息';
        line.append(
            check,
            button((row.error ? '⚠ ' : '') + title, () => setActive(row.id))
        );
        line.draggable = true;
        line.ondragstart = (e) => {
            dragged = row.id;
            e.dataTransfer.setData('text/plain', row.id);
        };
        line.ondragend = () => {
            dragged = null;
        };
        line.ondragover = (e) => {
            if (dragged) e.preventDefault();
        };
        line.ondrop = (e) => {
            if (!dragged || dragged === row.id) return;
            e.preventDefault();
            const moving = doc.rows.find((r) => r.id === dragged);
            const next = doc.rows.filter((r) => r !== moving);
            next.splice(next.indexOf(row), 0, moving);
            editRows(next);
            refreshEditor();
        };
        return line;
    });
    if (rows.length > pageSize)
        nodes.push(
            button('显示更多', () => {
                pageSize += 100;
                list();
            })
        );
    el('rows').replaceChildren(...nodes);
}
function leafState() {
    const row = selected();
    const leaves = row ? messageLeaves(row.value) : [];
    leafIndex = Math.max(0, Math.min(leafIndex, leaves.length - 1));
    const leaf = leaves[leafIndex];
    const parts = leaf ? (Array.isArray(leaf.value) ? leaf.value : [leaf.value]) : [];
    partIndex = Math.max(0, Math.min(partIndex, parts.length - 1));
    return { row, leaves, leaf, parts, part: parts[partIndex] };
}
function renderInputs(keep) {
    const { row, leaves, leaf, parts, part } = leafState();
    el('empty').hidden = !!row;
    el('sourcePanel').hidden = !row || (mode === 'visual' && !!leaf && !row.error);
    el('visual').hidden = !leaf || mode === 'source' || !!row?.error;
    document
        .querySelectorAll('[data-mode]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    if (keep !== 'raw') el('raw').value = row ? (row.raw ?? JSON.stringify(row.value, null, 2)) : '';
    if (keep !== 'text') el('text').value = typeof part === 'string' ? part : (part?.text ?? '');
    el('leaf').replaceChildren(
        ...leaves.map(
            ({ path }, i) => new Option(path.length ? '子消息 ' + path.map((n) => n + 1).join('.') : '当前消息', i)
        )
    );
    el('leaf').selectedIndex = leafIndex;
    el('segment').replaceChildren(...parts.map((p, i) => new Option('片段 ' + (i + 1), i)));
    el('segment').selectedIndex = partIndex;
    el('text').disabled = part === undefined;
    el('validation').textContent = row?.error || (row ? formatWarnings(row.value).join('\n') : '');
    el('validation').classList.toggle('error', !!row?.error);
}
function refreshEditor(keep) {
    ensureActive();
    renderBar();
    list();
    renderInputs(keep);
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 140);
}
function replaceParts(state, parts, group, keep) {
    const value = !Array.isArray(state.leaf.value) && parts.length === 1 ? parts[0] : parts;
    editRow({ id: state.row.id, value: replaceLeaf(state.row.value, state.leaf.path, value) }, group);
    refreshEditor(keep);
}
function changeText() {
    const state = leafState();
    if (state.part === undefined) return;
    const parts = state.parts.slice(),
        text = el('text').value;
    parts[partIndex] = typeof state.part === 'string' ? text : { ...state.part, text };
    replaceParts(state, parts, 'text:' + state.row.id + ':' + leafIndex + ':' + partIndex, 'text');
}
function changeSource() {
    if (mode === 'visual') mode = 'source';
    const row = selected(),
        raw = el('raw').value;
    try {
        const values = parseStaticMessages('const tabHubMessages = [\n' + raw + '\n]');
        if (values.length !== 1) throw new Error('请输入一条消息');
        editRow({ id: row.id, value: values[0], raw }, 'raw:' + row.id);
    } catch (error) {
        editRow({ ...row, raw, error: error.message }, 'raw:' + row.id);
    }
    refreshEditor('raw');
}
function bindTyping(id, commit) {
    const field = el(id);
    field.addEventListener('input', (e) => {
        if (!e.isComposing) commit();
    });
    field.addEventListener('compositionend', commit);
    field.addEventListener('blur', () => {
        doc.group = null;
    });
}
bindTyping('text', changeText);
bindTyping('raw', changeSource);
el('modes').onclick = (e) => {
    if (e.target.dataset.mode) {
        mode = e.target.dataset.mode;
        renderInputs();
    }
};
el('leaf').onchange = () => {
    leafIndex = el('leaf').selectedIndex;
    partIndex = 0;
    refreshEditor();
};
el('segment').onchange = () => {
    partIndex = el('segment').selectedIndex;
    renderInputs();
};
el('addPart').onclick = () => {
    const s = leafState();
    partIndex = s.parts.length;
    replaceParts(s, [...s.parts, '']);
};
el('delPart').onclick = () => {
    const s = leafState();
    replaceParts(
        s,
        s.parts.filter((_, i) => i !== partIndex)
    );
};
el('format').replaceChildren(...formats.map((f) => new Option(f.label, f.key)));
function parameter() {
    const def = formats[el('format').selectedIndex];
    const input = document.createElement(def.choices ? 'select' : 'input');
    if (def.choices) input.append(...def.choices.map((v) => new Option(v, v)));
    input.setAttribute('aria-label', '格式参数');
    input.value = typeof def.value === 'object' ? JSON.stringify(def.value) : String(def.value);
    input.hidden = def.value === true;
    el('param').replaceChildren(input);
}
parameter();
el('format').onchange = parameter;
function applyFormat(clear) {
    const state = leafState();
    if (state.part === undefined) return;
    const def = formats[el('format').selectedIndex];
    let value = el('param').firstChild.value;
    if (!clear && def.key === 'shadow') {
        try {
            value = JSON.parse(value);
            if (!value || Array.isArray(value) || typeof value !== 'object') throw Error();
        } catch {
            status('阴影需要 JSON 对象');
            return;
        }
    }
    if (!clear && ['color', 'backgroundColor'].includes(def.key) && !CSS.supports('color', value)) {
        status('请输入有效 CSS 颜色');
        return;
    }
    if (def.value === true) value = true;
    const input = el('text');
    let start = input.selectionStart,
        end = input.selectionEnd;
    if (start === end) {
        start = 0;
        end = input.value.length;
    }
    const replacements = splitSegment(state.part, start, end, (part) => {
        if (!clear) return withFormat(part, def.key, value);
        if (typeof part === 'string') return part;
        const { class: classes, style, ...rest } = part;
        return rest;
    });
    const parts = state.parts.slice();
    parts.splice(partIndex, 1, ...replacements);
    if (start > 0) partIndex++;
    replaceParts(state, parts);
}
el('applyFormat').onclick = () => applyFormat(false);
el('clearFormat').onclick = () => applyFormat(true);
function addRow(before) {
    const row = messageRow('');
    const next = doc.rows.slice();
    next.splice(before && selected() ? next.indexOf(selected()) : next.length, 0, row);
    editRows(next);
    setActive(row.id);
    el('text').focus();
}
el('add').onclick = () => addRow(false);
el('insert').onclick = () => addRow(true);
el('duplicate').onclick = () => {
    const row = selected();
    if (!row) return;
    const next = doc.rows.slice(),
        copy = { ...row, id: editorId() };
    next.splice(next.indexOf(row) + 1, 0, copy);
    editRows(next);
    setActive(copy.id);
};
el('remove').onclick = () => {
    const ids = doc.checked.size ? doc.checked : new Set([doc.active]);
    editRows(doc.rows.filter((row) => !ids.has(row.id)));
    refreshEditor();
};
function move(offset) {
    const i = doc.rows.indexOf(selected()),
        j = i + offset;
    if (i < 0 || j < 0 || j >= doc.rows.length) return;
    const next = doc.rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    editRows(next);
    refreshEditor();
}
el('up').onclick = () => move(-1);
el('down').onclick = () => move(1);
el('checkAll').onchange = () => {
    for (const r of filtered()) {
        if (el('checkAll').checked) doc.checked.add(r.id);
        else doc.checked.delete(r.id);
    }
    list();
};
el('search').oninput = () => {
    doc.search = el('search').value;
    pageSize = 100;
    list();
};
function historyMove(back) {
    travel(doc, back);
    refreshEditor();
    queueDraft();
}
el('undo').onclick = () => historyMove(true);
el('redo').onclick = () => historyMove(false);
el('newDoc').onclick = () => {
    let suffix = 1,
        name = 'messages.js';
    while (docs.some((d) => d.name === name)) name = 'messages-' + ++suffix + '.js';
    makeDocument(name, []);
};
el('closeDoc').onclick = () => {
    if (doc.writing || (doc.saved !== doc.rows && !confirm('关闭此文档并丢弃未保存的修改？'))) return;
    docs.splice(docs.indexOf(doc), 1);
    if (docs.length) switchDocument(docs.at(-1));
    else makeDocument('messages.js', []);
};
async function importFiles(files, mergeTarget) {
    try {
        const results = await Promise.all(
            files.map(async (item) => ({ ...(await readMessageFile(item.file)), handle: item.handle }))
        );
        if (mergeTarget) {
            if (!docs.includes(mergeTarget)) return;
            const rows = results.flatMap((r) => r.entries.map(messageRow));
            updateRows(mergeTarget, [...mergeTarget.rows, ...rows]);
            switchDocument(mergeTarget);
        } else
            for (const r of results) {
                const d = makeDocument(r.name, r.entries);
                Object.assign(d, { handle: r.name.endsWith('.js') ? r.handle : undefined, original: r.original });
            }
        status('已导入 ' + results.map((r) => r.name).join('、'));
    } catch (error) {
        status('导入失败 · ' + error.message);
    }
}
let mergeTarget;
async function pick(merge) {
    mergeTarget = merge ? doc : null;
    if (window.showOpenFilePicker) {
        try {
            const handles = await window.showOpenFilePicker({ multiple: true });
            await importFiles(
                await Promise.all(handles.map(async (handle) => ({ handle, file: await handle.getFile() }))),
                mergeTarget
            );
            return;
        } catch (error) {
            if (error.name === 'AbortError') return;
            if (error.name !== 'SecurityError') {
                status(error.message);
                return;
            }
        }
    }
    el('files').value = '';
    el('files').click();
}
el('files').onchange = () =>
    importFiles(
        [...el('files').files].map((file) => ({ file })),
        mergeTarget
    );
el('open').onclick = () => pick(false);
el('merge').onclick = () => pick(true);
window.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
});
window.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) {
        e.preventDefault();
        importFiles(
            [...e.dataTransfer.files].map((file) => ({ file })),
            null
        );
    }
});
async function save(as) {
    try {
        status((await writeDocument(doc, as)) || '保存中');
        renderBar();
        queueDraft();
    } catch (error) {
        status(error.message);
    }
}
el('save').onclick = () => save(false);
el('saveAs').onclick = () => save(true);
function fullText() {
    if (doc.rows.some((r) => r.error)) {
        status('请先修正公告源码中的错误');
        return;
    }
    return serializeMessages(doc.rows.map((r) => r.value));
}
el('download').onclick = () => {
    const text = fullText();
    if (text) {
        downloadText(outputName(doc), text);
        status('已导出下载');
    }
};
el('fullSource').onclick = () => {
    const text = fullText();
    if (text) {
        el('code').value = text;
        el('codeDialog').showModal();
    }
};
el('dismiss').onclick = () => el('codeDialog').close();
window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.isComposing || !doc) return;
    const key = e.key.toLowerCase();
    if (key === 's') {
        e.preventDefault();
        save(e.shiftKey);
    }
    if (key === 'z' || key === 'y') {
        e.preventDefault();
        historyMove(key === 'z' && !e.shiftKey);
    }
});
window.addEventListener('beforeunload', (e) => {
    if (docs.some((d) => d.saved !== d.rows)) {
        flushDraft();
        e.preventDefault();
        e.returnValue = '';
    }
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushDraft();
});
window.addEventListener('pagehide', flushDraft);
