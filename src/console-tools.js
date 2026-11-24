'use strict';

const pageButtons = document.querySelectorAll('[data-page]');
for (const button of pageButtons)
    button.onclick = () => {
        for (const tab of pageButtons) {
            document.getElementById(tab.dataset.page).hidden = tab !== button;
            tab.setAttribute('aria-pressed', String(tab === button));
        }
    };

const logList = document.getElementById('log-list');
function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
}
function logRow() {
    const row = document.createElement('li');
    row.append(element('time', new Date().toLocaleTimeString()));
    logList.prepend(row);
    if (logList.children.length > 200) logList.lastElementChild.remove();
    return row;
}
function writeLog(message) {
    logRow().append(element('span', message));
}
const statusLabels = {
    pending: '等待回执',
    success: '成功',
    partial: '部分成功',
    failed: '失败',
    timeout: '超时'
};
function logOperation(title, recipients, content) {
    const row = logRow();
    row.dataset.operation = broadcastId();
    row.dataset.status = 'pending';
    const body = document.createElement('div');
    const summary = element('strong', title);
    const badge = element('span', statusLabels.pending);
    badge.className = 'status';
    body.append(summary, badge);
    if (content) body.append(element('p', content));
    const results = document.createElement('ul');
    body.append(results);
    row.append(body);
    const targets = recipients.map(({ hub, peer }) => {
        const label = peer ? hub + ' · ' + peer.instance.slice(0, 6) : hub;
        const node = element('li', label + '　等待回执');
        results.append(node);
        return { label, node, status: 'pending' };
    });
    function update(index, status, message) {
        const target = targets[index];
        target.status = status;
        target.node.textContent = target.label + '　' + message;
        const states = targets.map((t) => t.status);
        let overall = 'failed';
        if (states.includes('pending')) overall = 'pending';
        else if (states.every((s) => s === 'success')) overall = 'success';
        else if (states.includes('success')) overall = 'partial';
        else if (states.every((s) => s === 'timeout')) overall = 'timeout';
        badge.textContent = statusLabels[overall];
        row.dataset.status = overall;
    }
    return update;
}
document.getElementById('clear-log').onclick = () => logList.replaceChildren();

const handles = new Map();
async function saveScript(filename, contents) {
    let result;
    if (typeof window.showSaveFilePicker === 'function') {
        try {
            const handle = handles.get(filename) ?? (await window.showSaveFilePicker({ suggestedName: filename }));
            const stream = await handle.createWritable();
            await stream.write(contents);
            await stream.close();
            handles.set(filename, handle);
            result = '已写入 ' + handle.name;
        } catch (error) {
            if (error.name === 'AbortError') result = '已取消保存 ' + filename;
            else {
                handles.delete(filename);
                writeLog(filename + ' 写入失败 · ' + error.message);
            }
        }
    }
    if (!result) {
        downloadScript(filename, contents);
        result = '已请求下载，请替换项目根目录的 ' + filename;
    }
    writeLog(result);
    return result;
}

const library = document.getElementById('library');
const catalog = typeof tabHubMessages !== 'undefined' && Array.isArray(tabHubMessages) ? tabHubMessages : [];
document.getElementById('entry-count').textContent = 'messages.js · ' + catalog.length + ' 条';
let catalogRows = [];
function entryText(entry) {
    return (Array.isArray(entry) ? entry : [entry])
        .map((part) => (typeof part === 'string' ? part : part.text))
        .join('');
}
function buildCatalogRow(entry, number, now) {
    const node = document.createElement('li');
    if (!validEntry(entry)) {
        node.textContent = number + ' · 无效公告';
        return { node, search: node.textContent, children: [] };
    }
    const container = entry?.type === 'queue' || entry?.type === 'pack';
    const rich = !container && typeof entry !== 'string';
    const type = container ? (entry.type === 'queue' ? '队列' : '条件包') : rich ? '富文本' : '文本';
    const title = number + ' · ' + type;
    const children = [];
    const line = element('div', '');
    line.className = 'entry-line';
    node.append(line);
    const details = document.createElement('details');
    if (container) {
        node.replaceChildren(details);
        details.append(element('summary', title + ' · ' + entry.content.length + ' 项'));
        const list = element('ol', '');
        if (entry.type === 'pack' && !packAvailable(entry, now)) {
            details.append(element('p', '当前条件未满足'));
        } else {
            entry.content.forEach((child, i) => {
                const row = buildCatalogRow(child, number + '.' + (i + 1), now);
                children.push(row);
                list.append(row.node);
            });
            details.append(list);
        }
    } else {
        const text = entryText(entry);
        if (rich) {
            details.append(element('summary', text || '空公告'), element('pre', JSON.stringify(entry, null, 2)));
            line.append(details);
        } else line.append(element('span', text || '空公告'));
        const send = element('button', '发送此条');
        send.disabled = !text.trim();
        send.onclick = () => dispatch('entry', entry);
        line.append(send);
        node.prepend(element('small', title));
    }
    return {
        node,
        details,
        children,
        search: (title + ' ' + (container ? '' : JSON.stringify(entry))).toLowerCase()
    };
}
function filterCatalog() {
    const q = document.getElementById('search').value.trim().toLowerCase();
    function match(row, parentMatched) {
        const own = parentMatched || row.search.includes(q);
        const childMatch = row.children.map((child) => match(child, own)).some(Boolean);
        if (q && childMatch && row.details) row.details.open = true;
        row.node.hidden = !own && !childMatch;
        return !row.node.hidden;
    }
    const any = catalogRows.map((row) => match(row, false)).some(Boolean);
    const empty = document.getElementById('empty-library');
    empty.hidden = any;
    empty.textContent = catalog.length ? '没有匹配的公告。' : '当前公告库为空。';
}
library.ontoggle = () => {
    if (!library.open) return;
    const now = new Date();
    catalogRows = catalog.map((value, i) => buildCatalogRow(value, String(i + 1), now));
    document.getElementById('entries').replaceChildren(...catalogRows.map((row) => row.node));
    filterCatalog();
};
document.getElementById('search').oninput = filterCatalog;
