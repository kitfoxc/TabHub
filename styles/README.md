# TabHub 富文本样式参考

本文介绍公告富文本的配置格式、全部内置样式及使用限制。富文本由 [message-source.js](../src/message-source.js) 解析，由 [rich-text.css](rich-text.css) 提供共享样式，适用于使用该渲染器的 Hub 主题。

打开[独立编辑器](../messages-editor.html)的「格式 Wiki」，可搜索字段、查看实际渲染并复制或插入示例。

## 1. 消息结构

公告可以是纯文本、单个富文本对象，或由多个字符串及富文本对象组成的数组。数组中的片段属于同一条公告，每个片段可独立设置样式。

在根目录 [messages.js](../messages.js) 中配置，保存后刷新 Hub：

```js
const tabHubMessages = [
    '普通公告',
    { text: '重要通知', style: { bold: true } },
    [
        { text: '【直播通知】', style: { bold: true, color: '#ffcc00', size: 'large' } },
        '欢迎来到直播间！',
        { text: ' ★', class: 'echo-text-rainbow' }
    ]
];
```

在 Messages 编辑器的「原生源码」模式中，可直接输入单条公告，例如：

```json
[
    { "text": "【提醒】", "style": { "bold": true, "color": "#ffcc00" } },
    { "text": "报名即将截止", "style": { "italic": true } }
]
```

上例也符合严格 JSON 语法。保存公告后按项目的加载方式刷新 Hub。

## 2. 基础样式

以下字段位于片段的 `style` 对象中，使用布尔值 `true` 启用。

| 字段 | 效果 |
| --- | --- |
| `bold` | 粗体 |
| `italic` | 斜体 |
| `underline` | 下划线 |
| `strikethrough` | 删除线 |
| `emphasis` | 着重号（文字下方加点） |
| `sub` | 下标（0.75em） |
| `super` | 上标（0.75em） |

多个字段可以组合，但下划线与删除线、上下标等相互冲突的 CSS 声明不保证叠加。

## 3. 字体尺寸（size）

| 值 | 相对尺寸 |
| --- | --- |
| `extra-small` | 0.5em |
| `small` | 0.75em |
| `middle` | 1em |
| `large` | 1.5em |
| `extra-large` | 2em |

## 4. 字重（weight）

| 预设值（同一行的名称等效） | CSS 字重 |
| --- | --- |
| `thin`, `hairline` | 100 |
| `extra-light`, `ultra-light` | 200 |
| `light` | 300 |
| `semi-light`, `demi-light` | 350 |
| `regular`, `normal`, `book`, `plain` | 400 |
| `medium` | 500 |
| `semi-bold`, `demi-bold` | 600 |
| `bold` | 700 |
| `extra-bold`, `ultra-bold` | 800 |
| `black`, `heavy` | 900 |
| `extra-black`, `ultra-black`, `extra-heavy`, `ultra-heavy` | 950 |

字段接受预设字符串，而非数字。实际显示取决于字体支持情况。

## 5. 字宽（stretch）

由窄至宽依次为：

| 值 | 效果 |
| --- | --- |
| `ultra-condensed` | 极窄 |
| `extra-condensed` | 特窄 |
| `condensed` | 窄 |
| `semi-condensed` | 半窄 |
| `normal` | 正常 |
| `semi-expanded` | 半宽 |
| `expanded` | 宽 |
| `extra-expanded` | 特宽 |
| `ultra-expanded` | 极宽 |

使用 CSS font-stretch，实际效果取决于字体是否提供相应字宽。

## 6. 字符间距（letterSpacing）

| 值 | CSS 字符间距 |
| --- | --- |
| `compact` | -0.05em |
| `normal` | normal |
| `four-per-width` | 0.25em |
| `half-width` | 0.5em |
| `full-width` | 1em |

## 7. 颜色与阴影

| 字段 | 用途 |
| --- | --- |
| `color` | 文字颜色，接受 CSS 颜色值 |
| `backgroundColor` | 文字片段背景颜色 |
| `shadow` | 文字阴影对象 |

阴影字段包括 `x`、`y`、`blur`、`color`，默认值分别为 `0`、`0`、`0.25em`、`#000`。非零长度建议使用带单位的字符串。

```json
{
    "text": "发光文字",
    "style": {
        "color": "#ffffff",
        "backgroundColor": "#282828",
        "shadow": { "x": "0", "y": "0", "blur": "0.4em", "color": "#00aaff" }
    }
}
```

## 8. 特殊视觉效果（class）

以下效果通过片段顶层的 `class` 字段启用，不属于独立的 style 布尔字段。

| CSS 类名 | 效果 |
| --- | --- |
| `echo-text-rainbow` | 彩虹渐变文字，2 秒线性循环 |
| `echo-text-rock-y` | 上下摇晃，0.5 秒循环，偏移 ±2px |
| `echo-text-typewrite` | 半透明底色与虚线下边框，不包含逐字打印动画 |

```json
{ "text": "彩虹文字", "class": "echo-text-rainbow" }
```

也可以指定其他已加载的 CSS 类名。多个类名以空格分隔；动画属性冲突时遵循 CSS 层叠规则。

## 9. 自定义 CSS（style.style）

在 style 对象内使用同名的 style 字符串，可追加 CSS 声明。

```json
{
    "text": "自定义文字",
    "style": {
        "style": "font-family: sans-serif; font-size: 1.2em; letter-spacing: 0.1em;"
    }
}
```

自定义声明在预设行内样式之后追加，可能覆盖预设效果。建议优先使用内置字段，以减少主题兼容问题。

## 10. 当前限制与安全注意事项

- 不支持原生 Markdown 解析；Markdown 标记按普通文字处理。
- 不支持直接渲染 HTML；文字通过 textContent 写入 DOM。
- 不支持独立图片、可点击链接或复杂块级排版节点；公告以 span 文本片段为核心。
- 未定义的预设名称不会自动产生对应样式。
- 自定义 CSS 与类名可能影响标签测量、滚动、布局及动画性能。
- formatMessage() 目前未对自定义 CSS 声明实施属性白名单限制。仅应对可信配置使用该能力；若接入不可信外部消息，应增加样式及类名校验。

## 11. 相关文件

- [rich-text.css](rich-text.css)：内置富文本样式及动画。
- [message-source.js](../src/message-source.js)：公告格式校验、时间变量及富文本渲染。
- [messages.js](../messages.js)：公告配置。
- [console-tools.js](../src/console-tools.js)：控制台只读列表和单条公告调度。
- [项目 README](../README.md)：整体使用说明。

富文本样式继承自 [Echo-Live](https://github.com/sheep-realms/Echo-Live) / [Echo-MoJi](https://github.com/sheep-realms/Echo-MoJi)，保留原项目署名及许可。
