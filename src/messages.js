'use strict';

// Message formats and time variables originate from Sheep-realms/Echo-MoJi.
function passesCondition(rule, date) {
    if (!rule || typeof rule !== 'object') return false;
    const terms = Array.isArray(rule.terms) ? rule.terms : [];
    switch (rule.condition) {
        case 'all_of': return terms.length > 0 && terms.every(term => passesCondition(term, date));
        case 'any_of': return terms.some(term => passesCondition(term, date));
        case 'inverted': return Boolean(rule.term) && !passesCondition(rule.term, date);
        case 'random_chance': return Math.random() < rule.chance;
        case 'date_check': {
            const dayValue = input => {
                if (typeof input === 'string' && /^\d{1,2}[/-]\d{1,2}$/.test(input.trim())) {
                    input = date.getFullYear() + '/' + input.trim().replace('-', '/');
                }
                const day = new Date(input);
                return day.setHours(0, 0, 0, 0);
            };
            const today = dayValue(date);
            if (rule.date && typeof rule.date === 'object') {
                const { start, end } = rule.date;
                return (start == null || dayValue(start) <= today) && (end == null || today <= dayValue(end));
            }
            return today === dayValue(rule.date);
        }
        case 'weekday_check': {
            const day = date.getDay();
            const weekday = n => ((parseInt(n, 10) % 7) + 7) % 7;
            if (rule.weekday && typeof rule.weekday === 'object') {
                const start = weekday(rule.weekday.start), end = weekday(rule.weekday.end);
                return start <= end ? start <= day && day <= end : day >= start || day <= end;
            }
            return weekday(rule.weekday) === day;
        }
        default: return false;
    }
}

function messagePool(entries, date) {
    const pool = [];
    for (const entry of entries) {
        if (entry?.type !== 'pack') { pool.push(entry); continue; }
        const rules = Array.isArray(entry.conditions) ? entry.conditions : [entry.conditions];
        if (entry.conditions == null || (rules.length && rules.every(rule => passesCondition(rule, date)))) {
            pool.push(...messagePool(entry.content, date));
        }
    }
    return pool;
}

class MessageSource {
    constructor() { this.reset(); }
    reset() {
        this.day = null;
        this.queue = [];
        this.last = -1;
    }
    next(settings, date = new Date()) {
        if (this.day !== date.toDateString()) {
            this.day = date.toDateString();
            this.pool = messagePool(settings.messages, date);
            this.weights = this.pool.map(() => settings.weightStart);
            this.last = -1;
        }
        if (this.queue.length) return this.queue.shift();
        if (!this.pool.length) return null;
        const candidates = this.pool.map((_, i) => i).filter(i => i !== this.last || this.pool.length === 1);
        let index;
        if (settings.draw === 'average') {
            index = candidates[Math.floor(Math.random() * candidates.length)];
        } else {
            const highest = candidates.reduce((max, i) => Math.max(max, this.weights[i]), -Infinity);
            if (highest <= 0) this.weights = this.weights.map(w => w + 1 - highest);
            const total = candidates.reduce((sum, i) => sum + Math.max(0, this.weights[i]), 0);
            let draw = Math.random() * total;
            index = candidates.find(i => (draw -= Math.max(0, this.weights[i])) < 0);
            this.weights = this.weights.map(w => w + settings.weightStep);
            this.weights[index] = -Math.max(1, Math.floor(this.pool.length * settings.weightReset));
        }
        this.last = index;
        const entry = this.pool[index];
        if (entry?.type !== 'queue') return entry;
        const flatten = items => messagePool(items, date).flatMap(item => item?.type === 'queue' ? flatten(item.content) : [item]);
        this.queue = flatten(entry.content);
        return this.queue.shift();
    }
}

function expandTime(text, date) {
    if (!text.includes('{{{')) return text;
    const M = date.getMonth() + 1, d = date.getDate(), h = date.getHours();
    const m = date.getMinutes(), s = date.getSeconds(), ms = date.getMilliseconds();
    const h12 = h % 12 || 12, offset = -date.getTimezoneOffset() / 60;
    const pad = (n, length = 2) => String(n).padStart(length, '0');
    const values = { y: date.getFullYear(), M, d, h, h12, m, s, ms, MM: pad(M), dd: pad(d),
        hh: pad(h), hh12: pad(h12), mm: pad(m), ss: pad(s), mms: pad(ms, 3),
        utc: Math.abs(offset), utcs: offset > 0 ? '+' + offset : offset ? String(offset) : '',
        isAM: h < 12, isPM: h >= 12, AMorPM: h < 12 ? 'am' : 'pm' };
    return text.replace(/\{\{\{(.*?)\}\}\}/g, (original, expression) => {
        const [key, fallback] = expression.split('|').map(part => part.trim());
        const name = key.slice(5);
        return key.startsWith('time:') && Object.hasOwn(values, name) ? values[name] : fallback ?? original;
    });
}

function formatMessage(entry, variables, date = new Date()) {
    const container = document.createElement('span');
    for (const part of Array.isArray(entry) ? entry : [entry]) {
        const text = typeof part === 'string' ? part : part.text;
        const span = document.createElement('span');
        span.textContent = variables ? expandTime(text, date) : text;
        if (typeof part.class === 'string') span.className = part.class;
        const style = part.style || {};
        for (const flag of ['bold', 'italic', 'underline', 'strikethrough', 'emphasis', 'sub', 'super']) {
            if (style[flag]) span.classList.add('echo-text-' + flag);
        }
        for (const [key, prefix] of [['size', 'size'], ['weight', 'weight'], ['stretch', 'stretch'], ['letterSpacing', 'letter-spacing']]) {
            if (typeof style[key] === 'string' && /^[\w-]+$/.test(style[key])) span.classList.add('echo-text-' + prefix + '-' + style[key]);
        }
        if (style.color) span.style.color = style.color;
        if (style.backgroundColor) span.style.backgroundColor = style.backgroundColor;
        if (style.shadow) {
            const { x = '0', y = '0', blur = '0.25em', color = '#000' } = style.shadow;
            span.style.textShadow = [x, y, blur, color].join(' ');
        }
        if (typeof style.style === 'string') span.style.cssText += ';' + style.style;
        container.append(span);
    }
    return container;
}
