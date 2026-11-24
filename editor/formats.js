'use strict';

const formats = [
    ...Object.entries({
        bold: '粗体',
        italic: '斜体',
        underline: '下划线',
        strikethrough: '删除线',
        emphasis: '着重号',
        sub: '下标',
        super: '上标'
    }).map(([key, label]) => ({ key, label, value: true, help: '布尔值 true 启用，可与其他片段样式组合。' })),
    ...[
        ['size', '字号', 'extra-small small middle large extra-large', '相对于主题字号缩放。'],
        [
            'weight',
            '字重',
            'thin hairline extra-light ultra-light light semi-light demi-light regular normal book plain medium semi-bold demi-bold bold extra-bold ultra-bold black heavy extra-black ultra-black extra-heavy ultra-heavy',
            '实际粗细取决于当前字体。'
        ],
        [
            'stretch',
            '字宽',
            'ultra-condensed extra-condensed condensed semi-condensed normal semi-expanded expanded extra-expanded ultra-expanded',
            '字体需要提供对应字宽。'
        ],
        ['letterSpacing', '字距', 'compact normal four-per-width half-width full-width', '调整字符之间的间隔。'],
        [
            'class',
            '效果类',
            'echo-text-rainbow echo-text-rock-y echo-text-typewrite',
            '多个类可用空格分隔，动画可能覆盖。'
        ]
    ].map(([key, label, values, help]) => ({
        key,
        label,
        choices: values.split(' '),
        value: values.split(' ').at(-1),
        help
    })),
    { key: 'color', label: '文字颜色', value: '#b34a26', help: '填写有效 CSS 颜色。' },
    { key: 'backgroundColor', label: '文字底色', value: '#f5c984', help: '仅应用于此文字片段。' },
    {
        key: 'shadow',
        label: '阴影',
        value: { x: '1px', y: '2px', blur: '3px', color: '#888' },
        help: '填写含 x、y、blur、color 的 JSON 对象，非零长度需单位。'
    },
    {
        key: 'style',
        label: '自定义 CSS',
        value: 'font-variant: small-caps;',
        help: '填写 CSS 声明，可覆盖预设。离线预览限制外部资源。'
    }
];
function withFormat(segment, key, value) {
    const part = typeof segment === 'string' ? { text: segment } : { ...segment };
    if (key === 'class')
        part.class = [
            ...new Set([...(typeof part.class === 'string' ? part.class : '').split(/\s+/).filter(Boolean), value])
        ].join(' ');
    else part.style = { ...part.style, [key]: value };
    return part;
}
function formatWarnings(entry) {
    const warnings = new Set();
    for (const { value } of messageLeaves(entry)) {
        for (const part of Array.isArray(value) ? value : [value]) {
            for (const [key, v] of Object.entries(part?.style || {})) {
                const def = formats.find((f) => f.key === key && key !== 'class');
                if (!def || (def.choices && !def.choices.includes(v)))
                    warnings.add('未识别的样式：' + key + '（保留原值）');
            }
            for (const name of typeof part.class === 'string' ? part.class.split(/\s+/) : []) {
                if (name && !formats.find((f) => f.key === 'class').choices.includes(name))
                    warnings.add('自定义类：' + name + '（取决于主题）');
            }
        }
    }
    return [...warnings];
}
