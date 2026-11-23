# TabHub

用于 OBS 的透明直播外框。顶部以浏览器标签的形式轮播公告，底部显示直播状态、主题和补充信息。

## 在 OBS 中使用

下载并解压仓库，在场景里添加「浏览器」源，勾选「本地文件」并选择 `hub.html`。将源放在直播内容上方，宽高设为画布尺寸。1920×1080 显示整个外框，1920×80 只显示顶栏。所有脚本和样式随项目提供，可离线运行。

右键浏览器源选择「交互」，点击左上角下拉按钮打开设置。叠页按钮暂停或恢复轮播，加号打开下一条公告。点标签标题切换活动标签，点叉号关闭。右侧窗口图标仅用于展示。

## 设置入口

| 分组 | 用途 |
| --- | --- |
| 公告内容 | 普通文案每行一条，点击「应用公告列表」后生效。支持均匀随机、加权随机、连续队列、条件包、时间变量和富文本 |
| 状态栏 | 修改直播状态、本场主题和右侧信息，留空隐藏对应字段 |
| 标签布局 | 数量、宽度、最近几条和更早标签的显示方式。将数量上限设为 0 可保持空栏 |
| 弹出与关闭 | 选择左右方向、阅读完毕后轮播、固定或随机等待及独立关闭间隔。关闭间隔为 0 时停用定时关闭 |
| 动画与滚动 | 标签开合速度与缓动，溢出文字的范围、速度、停留时间和循环方式 |
| 配置迁移 | 导出、导入一份包含公告、底栏和显示设置的 JSON 文件 |

完整模式按文字宽度展开；压缩模式优先为完整标签让出空间。最小宽度默认 62 px。按打开时间划分最近标签，点击历史标签不会改变分组。达到数量上限时优先从所选关闭侧移除非活动标签。弹出与关闭同时到期时只进行一次布局更新。暂停或隐藏页面会冻结两个倒计时。

### 公告示例

下列每行都是一条可直接粘贴到「公告列表」的内容。队列被抽中后按顺序逐条展示。条件包按本地日期筛选，随机条件在消息池重建时计算。

```text
欢迎来到直播间
现在是 {{{time:hh}}}:{{{time:mm}}}
[{"text":"提醒 ","style":{"bold":true}},{"text":"报名即将截止","style":{"color":"#c24836"}}]
{"type":"queue","content":["第一轮即将开始","请提前准备"]}
{"type":"pack","conditions":[{"condition":"weekday_check","weekday":6}],"content":["周六特别场"]}
```

支持的条件为 `all_of`、`any_of`、`inverted`、`date_check`、`weekday_check` 和 `random_chance`。以左方括号、左花括号或双引号开头的普通文字可写成 JSON 字符串。

### 从旧 Hub 搬迁

页面会在当前浏览器存储中查找旧 Hub 的显示设置。移动本地文件或换用另一个 OBS 配置时，浏览器可能分配不同的存储空间。已有 TabHub 配置可直接通过「配置迁移」转移。

要一起带入旧版的自定义公告、底栏和消息抽取设置，可在**原版 `hub.html` 的浏览器开发者控制台**运行以下代码，下载后在新 Hub 的「配置迁移」中导入。请使用保存过设置的浏览器环境；普通浏览器与 OBS 的本地设置可能不同。

```js
const messageConfig = config.echomoji.message;
const settings = {
    ...options, ...hubStatus, messages: db_message,
    openInterval: options.openTiming === 'message' ? messageConfig.duration / 1000 : options.openInterval,
    draw: messageConfig.random_method, variables: messageConfig.allow_variable ? 'on' : 'off',
    weightStart: messageConfig.random_weight_init, weightStep: messageConfig.random_weight_step,
    weightReset: messageConfig.random_weight_reset_negative_rate
};
const url = URL.createObjectURL(new Blob([JSON.stringify({version: 1, settings}, null, 2)], {type: 'application/json'}));
const link = document.createElement('a');
link.href = url;
link.download = 'tabhub.json';
link.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

## 运行链路

1. `src/settings.js` 集中定义字段、默认值与校验规则，生成设置面板，读写同一份配置。通过校验的修改通知控制器。
2. `src/messages.js` 按当前配置筛选消息池、抽取公告、消费队列，展开时间变量并将文本与样式写入 DOM 节点。该层不持有轮播计时器。
3. `src/app.js` 管理可见性、暂停状态和下一次开关标签的时间。手动和自动弹出共用取消息入口。状态栏文字独立更新。
4. `src/tabs.js` 持有标签与动画状态，处理近期分组、宽度分配、退场和滚动，并向调度器返回活动公告读完一遍所需的剩余时间。

## 来源

本项目从 kitfoxc/Echo-MoJi 的 Hub 分支独立迁移，基线为 `fbc2289`。保留 Sheep-realms 和 Echo-MoJi、Echo-Live 贡献者对原始消息格式、抽取逻辑与富文本样式的署名。项目沿用 GPL-3.0-or-later。参见 [许可证](LICENSE)、[迁移基线](https://github.com/kitfoxc/Echo-MoJi/commit/fbc22890291ee024d53263f406d530dd21e367a3)、[Echo-MoJi](https://github.com/sheep-realms/Echo-MoJi) 和 [Echo-Live](https://github.com/sheep-realms/Echo-Live)。
