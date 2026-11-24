'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const ctx = vm.createContext({
    crypto: require('node:crypto').webcrypto,
    acorn: require('../editor/vendor/acorn.js')
});
for (const file of ['src/message-source.js', 'editor/model.js', 'editor/formats.js'])
    vm.runInContext(read(file), ctx);
test('real Hub library round trips as data including queues and conditional packs', () => {
    const original = ctx.parseStaticMessages(read('messages.js'));
    const encoded = ctx.serializeMessages(original);
    assert.deepEqual(ctx.parseStaticMessages(encoded), original);
    assert.match(encoded, /date_check/);
});
test('reject dynamic, ambiguous and malformed files before editing', () => {
    for (const file of [
        '',
        'alert(1)',
        'let tabHubMessages=[getValue()]',
        'let tabHubMessages=[{get text(){return ""}}]',
        'let tabHubMessages=[{__proto__: {},text:"a"}]',
        'let tabHubMessages=[{text:"a",text:"b"}]',
        'let tabHubMessages=[,]',
        'let tabHubMessages=[NaN]',
        'let tabHubMessages=[];other()',
        'let tabHubMessages=[{type:"queue",content:[5]}]'
    ])
        assert.throws(() => ctx.parseStaticMessages(file));
});
test('escaped and unknown fields, formatting a selection in a nested queue', () => {
    const [group] = ctx.parseStaticMessages(
        'const tabHubMessages=[{type:"queue",content:[{text:"中\\n😀",future:{n:-5},style:{other:true}}]}]'
    );
    const { path, value } = ctx.messageLeaves(group)[0];
    const parts = ctx.splitSegment(value, 0, 1, (p) => ctx.withFormat(p, 'bold', true));
    const result = ctx.replaceLeaf(group, path, parts);
    assert.equal(result.content[0][0].style.other, true);
    assert.equal(result.content[0][0].future.n, -5);
    assert.equal(ctx.plainText(result), '中\n😀');
    assert.equal(
        JSON.stringify(ctx.parseStaticMessages(ctx.serializeMessages([result]))[0]),
        JSON.stringify(result)
    );
});
test('documents have independent immutable undo points and stable row identities', () => {
    const a = ctx.newDocument('a', ['one']),
        b = ctx.newDocument('b', ['two']);
    const before = a.rows;
    for (const value of ['o', 'on', 'one!']) ctx.updateRows(a, [{ ...a.rows[0], value }], 'typing');
    assert.equal(a.rows[0].id, before[0].id);
    ctx.travel(a, true);
    assert.equal(a.rows, before);
    ctx.travel(a, false);
    assert.equal(a.rows[0].value, 'one!');
    assert.equal(b.rows, b.saved);
});
test('large library can be parsed and serialized', () => {
    const values = Array.from({ length: 10000 }, (_, i) => '公告 ' + i);
    assert.equal(ctx.parseStaticMessages(ctx.serializeMessages(values)).length, values.length);
});
