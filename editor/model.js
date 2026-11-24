'use strict';

// Only literal data reaches the editor. Never execute imported JavaScript.
function parseStaticMessages(source) {
    const program = acorn.parse(source.replace(/^\uFEFF/, ''), { ecmaVersion: 2022, locations: true });
    function fail(node, message) {
        const { line, column } = node.loc.start;
        throw new Error(`第 ${line} 行，第 ${column + 1} 列 · ${message}`);
    }
    function literal(node, depth = 0) {
        if (depth > 100) fail(node, '嵌套层级过深');
        if (
            node.type === 'Literal' &&
            (node.value === null ||
                ['boolean', 'string'].includes(typeof node.value) ||
                Number.isFinite(node.value))
        )
            return node.value;
        if (node.type === 'UnaryExpression' && node.operator === '-' && Number.isFinite(node.argument.value))
            return -node.argument.value;
        if (node.type === 'ArrayExpression')
            return node.elements.map((child) => {
                if (!child) fail(node, '数组不能有空位');
                return literal(child, depth + 1);
            });
        if (node.type === 'ObjectExpression') {
            const fields = new Map();
            for (const prop of node.properties) {
                if (
                    prop.type !== 'Property' ||
                    prop.computed ||
                    prop.method ||
                    prop.shorthand ||
                    prop.kind !== 'init'
                )
                    fail(prop, '字段必须是静态数据');
                const key = prop.key.name ?? String(prop.key.value);
                if (key === '__proto__' || fields.has(key)) fail(prop, '不支持此字段名或重复字段');
                fields.set(key, literal(prop.value, depth + 1));
            }
            return Object.fromEntries(fields);
        }
        fail(node, '仅支持静态数据');
    }
    const declaration = program.body[0];
    const binding = declaration?.declarations?.[0];
    if (
        program.body.length !== 1 ||
        declaration.type !== 'VariableDeclaration' ||
        declaration.declarations.length !== 1 ||
        binding?.id.name !== 'tabHubMessages' ||
        binding.init?.type !== 'ArrayExpression'
    )
        fail(program, '需要单个 tabHubMessages 数组声明');
    return binding.init.elements.map((node, index) => {
        if (!node) fail(binding.init, '数组不能有空位');
        const entry = literal(node);
        if (!validEntry(entry)) fail(node, `第 ${index + 1} 条公告结构无效`);
        return entry;
    });
}

function serializeMessages(entries) {
    return 'const tabHubMessages = ' + JSON.stringify(entries, null, 2) + ';\n';
}
function editorId() {
    return Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('');
}
function messageRow(value) {
    return { id: editorId(), value };
}
function newDocument(name, values = []) {
    const rows = values.map(messageRow);
    return {
        id: editorId(),
        name,
        rows,
        saved: rows,
        active: rows[0]?.id,
        checked: new Set(),
        past: [],
        future: [],
        search: ''
    };
}
function updateRows(doc, rows, group) {
    // Rows are immutable. Consecutive typing shares one undo point until focus moves.
    if (!group || group !== doc.group) {
        doc.past.push(doc.rows);
        if (doc.past.length > 100) doc.past.shift();
    }
    doc.group = group;
    doc.future.length = 0;
    doc.rows = rows;
}
function travel(doc, backward) {
    const from = backward ? doc.past : doc.future;
    if (!from.length) return;
    (backward ? doc.future : doc.past).push(doc.rows);
    doc.rows = from.pop();
    doc.group = null;
}
function messageLeaves(entry, path = [], list = []) {
    if (entry?.type === 'queue' || entry?.type === 'pack') {
        entry.content.forEach((child, i) => messageLeaves(child, [...path, i], list));
    } else list.push({ path, value: entry });
    return list;
}
function replaceLeaf(entry, path, value) {
    if (!path.length) return value;
    const [index, ...rest] = path;
    const content = entry.content.slice();
    content[index] = replaceLeaf(content[index], rest, value);
    return { ...entry, content };
}
function plainText(entry) {
    if (entry?.content && ['queue', 'pack'].includes(entry.type)) return entry.content.map(plainText).join(' / ');
    if (Array.isArray(entry)) return entry.map(plainText).join('');
    return typeof entry === 'string' ? entry : entry.text;
}
function splitSegment(segment, start, end, change) {
    const text = typeof segment === 'string' ? segment : segment.text;
    const part = (value) => (typeof segment === 'string' ? value : { ...segment, text: value });
    const result = [];
    if (start > 0) result.push(part(text.slice(0, start)));
    result.push(change(part(text.slice(start, end))));
    if (end < text.length) result.push(part(text.slice(end)));
    return result;
}
