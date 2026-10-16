import{r as ae,A as ie,T as se,a as oe,b as p,c as A,d as F,e as S,f as re,h as V,i as le,F as $,j,D as ce,I as de,k as r,l as d,_ as v,S as he}from"./frame-Caxs0_Mb.js";const b="neutral";function pe(e){return se[e]}const W=[b,...ie];function ue(e){return W.includes(e)?e:b}function me(e,t){return ae(e,t)??b}function tt(e,t){return oe[e].find(i=>i.id===t)?.swatch??""}const x=new Set;function ge(e){return x.add(e),window.addEventListener("popstate",e),()=>{x.delete(e),window.removeEventListener("popstate",e)}}function we(){return p.useSyncExternalStore(ge,()=>window.location.search)}function E(e){if(e===window.location.search)return;const{pathname:t,hash:n}=window.location;window.history.replaceState(window.history.state,"",`${t}${e}${n}`);for(const i of x)i()}const T="/Adelie/gallery/".replace(/\/$/,"");function nt(e){return/(?:^|\/)gallery\/$/.test(e)?e.slice(0,-8):null}function at(){const e=window.location.pathname,t=T&&e.startsWith(T)?e.slice(T.length):e;return t===""?"/":t.replace(/\/+$/,"")||"/"}function it(e){return`${window.location.origin}${T}${e}`}function fe(e){const t=window.matchMedia("(prefers-color-scheme: dark)");return t.addEventListener("change",e),()=>t.removeEventListener("change",e)}function be(){return p.useSyncExternalStore(fe,()=>window.matchMedia("(prefers-color-scheme: dark)").matches)}function ye(e){const t=[];for(const n of Array.from(e.styleSheets))try{for(const i of Array.from(n.cssRules))t.push(i.cssText)}catch{}return t.join(`
`)}function G(e){const t=document.createElement("iframe");t.setAttribute("aria-hidden","true"),t.tabIndex=-1,t.style.cssText="position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none",document.body.appendChild(t);try{const n=t.contentDocument,i=t.contentWindow;if(!n||!i)throw new Error("token probe: the blank frame has no document");const a=n.createElement("style");return a.textContent=ye(document),n.head.appendChild(a),e(n.documentElement,i)}finally{t.remove()}}function z(e,t){t===b?delete e.dataset.accent:e.dataset.accent=t}function ve(){return G((e,t)=>{const n={};for(const i of A){n[i]={};for(const a of F){S(e,{themeId:i,dark:a==="dark"});const o=t.getComputedStyle(e),s={};for(const l of re)s[l]=o.getPropertyValue(l).trim();n[i][a]=s}}return n})}function ke(){return G((e,t)=>{const n={};for(const i of A){n[i]={};for(const a of F){S(e,{themeId:i,dark:a==="dark"});const o={};for(const s of[b,...pe(i)])z(e,s),o[s]=t.getComputedStyle(e).getPropertyValue("--ui-accent").trim();z(e,b),n[i][a]=o}}return n})}const st=Object.fromEntries(V.map(e=>[e,Number.parseFloat(le[e])])),I={sm:"m",md:"l",lg:"xl"},Me=$.map(e=>e.id),Te=j.map(e=>e.id);function ot(e,t){return e==="theme"?t.theme:e==="system"?t.system:[...$,...j].find(i=>i.id===e)?.label??e}const C=["light","dark","system"],U=["en","zh"],xe=["desktop","phone"],w={theme:de,mode:"light",size:ce,latin:"theme",cjk:"theme",lang:"en",accent:b,view:"desktop"},q=["theme","mode","size","latin","cjk","lang","accent"],K=["theme","size","latin","cjk","accent"],Ae=["zh","en","system"];function g(e,...t){for(const n of t)if(n!=null&&e.includes(n))return n}function Se(e){const t=e.get("size");if(t!==null)return I[t]??t;const n=e.get("tier");return n===null?null:I[n]??null}function R(e,t={}){const n=new URLSearchParams(e);return{theme:g(A,n.get("theme"),t.theme)??w.theme,mode:g(C,n.get("mode"),t.mode)??w.mode,size:g(V,Se(n),t.size)??w.size,latin:g(Me,n.get("latin"),t.latin)??w.latin,cjk:g(Te,n.get("cjk"),t.cjk)??w.cjk,lang:g(U,n.get("lang"),t.lang)??w.lang,accent:g(W,n.get("accent"),t.accent)??w.accent,view:g(xe,n.get("view"))??w.view}}function Ce(e,t){return e!=="system"?e:t?.toLowerCase().startsWith("zh")?"zh":"en"}function He(e,t){const{gallery:n,siteTheme:i,siteLang:a}=e,o={};for(const s of K){const l=n[s];l&&(o[s]=l)}return{...o,mode:i??g(C,n.mode)??"system",lang:Ce(a??g(U,n.lang)??"system",t)}}const M=encodeURIComponent;function D(e,t={}){const n=q.map(i=>`${i}=${M(e[i])}`);for(const[i,a]of Object.entries(t))n.push(`${M(i)}=${M(a)}`);return e.view!==w.view&&n.push(`view=${M(e.view)}`),`?${n.join("&")}`}function Le(e,t){return e==="system"?t?"dark":"light":e}function h({children:e,...t}){return r.jsx("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",...t,children:e})}function rt(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.sun})})}function lt(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.moon})})}function ct(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.monitor})})}function dt(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.check})})}function ht(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.menu})})}function pt(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.cross})})}function ut(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.globe})})}function mt(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.chevronDown})})}function gt(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.copy})})}function wt(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.chainLink})})}function ft(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.externalLink})})}function bt(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.search})})}function yt(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.arrowRightCentered})})}function vt(e){return r.jsx(h,{...e,children:r.jsx("path",{d:d.terminalPrompt})})}const Z="penguin-site.theme",Y="penguin-site.lang",Ee={[Z]:["penguin-landing.theme","penguin-docs.theme"],[Y]:["penguin-landing.lang","penguin-docs.lang"]};function P(e,t){try{for(const n of[e,...Ee[e]??[]]){const i=localStorage.getItem(n);if(i&&t.includes(i))return i}}catch{}return null}function kt(e,t){try{localStorage.setItem(e,t)}catch{}}function Mt(e,t,n){const i=a=>{a.key!==e||a.newValue===null||t.includes(a.newValue)&&n(a.newValue)};return window.addEventListener("storage",i),()=>window.removeEventListener("storage",i)}const ze={sitebar:{siteName:"PenguinHarness",nav:{home:"主页",blog:"博客",download:"下载",docs:"文档",gallery:"画廊",github:"GitHub",openMenu:"打开菜单",closeMenu:"关闭菜单"},theme:{label:"主题",light:"浅色",dark:"深色",system:"跟随系统"},lang:{label:"语言",zh:"中文",en:"English",system:"跟随系统"}},site:{home:"概览",surfaces:"界面",foundations:"基础",fonts:"字体",pages:"页面",search:"搜索界面",searchShortcut:"Ctrl K",noMatches:"没有匹配的界面。",nav:"界面列表",onThisPage:"本页目录",settings:"显示设置",notFound:e=>`没有名为「${e}」的页面。`,allSurfaces:"全部界面",feedbackTitle:"反馈",feedbackBody:"引用预览工具条末尾的路径，或用链接按钮复制这一页的地址。",feedbackExample:"白领 › 对话 · 深色"},surfaceGroups:{conversation:"对话",workbench:"工作台",resources:"资源",measure:"度量",system:"系统"},surfaces:{chat:{title:"对话",description:"一次完成的任务：思考、三次工具调用、一处差异、一段带表格与代码的 Markdown 回答。",how:"侧栏 › 会话列表中的任意一行。"},"chat-running":{title:"对话 · 工具运行中",description:"任务进行中：一条命令正在执行，工具行显示运行状态与计时。",how:"侧栏 › 带运行标记的会话行。"},"chat-thinking":{title:"对话 · 思考中",description:"任务进行中：模型正在思考，思考行显示运行状态，文字仍在增长。",how:"侧栏 › 带运行标记的会话行。"},"chat-streaming":{title:"对话 · 流式输出",description:"任务进行中：回答正在流式到达，按当前主题的方式显现；答完停留片刻后重新开始，循环播放。",how:"侧栏 › 带运行标记的会话行。"},"chat-approval":{title:"对话 · 待审批",description:"任务等待人工：一条命令需要批准，允许或拒绝之后任务继续并结束。",how:"侧栏 › 带审批标记的会话行。"},"chat-harness":{title:"对话 · harness 写入的行",description:"不是人写、也不是模型写的每一种行：交接来源、Skill 与附件、MCP 连接、后台任务完成通知、定时触发、重连、中断、模型报错、压缩与模型切换、目标模式注入的轮次与插话，以及每个任务的统计行和目标横幅。",how:"侧栏 › 会话列表里最早的一行「修复 hooks 文档的引用」。"},"chat-org":{title:"对话 · 组织触发",description:"组织调度器为员工工位开启的会话：首条消息的触发块折叠成一行来源提示。",how:"公司模式 › 员工的工位。"},"chat-rsi":{title:"对话 · 自进化一轮",description:"通用智能体用默认 RSI 工具包优化文档专家：读取 Reference 分数和失分最多的用例的 Trace，给 Agent State 做快照后修改，由并行的评测子智能体逐题评测，新版本分数更高，于是保留。",how:"侧栏 › 通用智能体 › 「在文档问答 v1 上优化文档专家」。从评估中心 › 某个 Benchmark › 使用 › 优化 开始一轮。"},"chat-new":{title:"新对话",description:"草稿页：选择智能体、工作区、审批模式与模型，输入并发送第一条消息。",how:"侧栏 › 新对话。"},agents:{title:"智能体",description:"智能体列表：每个智能体的活动曲线、会话数、工具、Skill 与定时任务计数。",how:"侧栏 › 智能体。"},"agent-settings":{title:"智能体设置",description:"一个智能体的设置页：概览、提示词、记忆、运行时、工具、Skill、钩子、Vault 与定时任务标签页。",how:"智能体 › 任意一个智能体。"},schedules:{title:"定时任务",description:"智能体设置的定时任务标签页：周期、下次触发、绑定的会话与模型。",how:"智能体 › 智能体设置 › 定时任务标签页。"},plugins:{title:"插件市场",description:"插件按分类列出，可换分组、可搜索；点卡片看详情。",how:"侧栏 › 插件市场。"},models:{title:"模型库",description:"按供应商分组的模型表：默认模型、凭据、价格、上下文窗口与用量。",how:"侧栏 › 模型库。"},machines:{title:"机器",description:"本机与远程机器：安装状态、连接、探测结果，以及添加 ssh 主机。",how:"侧栏 › 机器（仅管理员）。"},usage:{title:"成本中心",description:"三十天的用量：Token、花费、请求数与成功率，按日期、智能体、模型或会话分组，附错误面板。",how:"侧栏 › 成本中心。"},benchmark:{title:"评估中心",description:"评估任务列表：已发布与草稿状态、用例数、历次评估的分数走势。",how:"侧栏 › 评估中心。"},"benchmark-detail":{title:"评估详情",description:"一个评估任务：分数曲线、每轮评估的用例得分、用例的题面与评分标准文件。",how:"评估中心 › 任意一个评估任务。"},settings:{title:"设置",description:"设置对话框：个人资料、通用、外观（主题、明暗、强调色、字号、字体）、账户，以及服务器设置。",how:"侧栏底部的账户菜单 › 设置。"},"settings-appearance":{title:"外观设置",description:"设置对话框停在「外观」页：主题、明暗、强调色、五档字号与字体组合——主题切换就在这里。",how:"侧栏底部的账户菜单 › 设置 › 外观。"},login:{title:"登录",description:"登录页：装饰画布上的登录卡片。任意密码即可登录演示账户。",how:"未登录时的任意地址。"}},home:{eyebrow:"界面画廊",title:"Penguin UI",lead:"真实的 Web App，在三套主题、两种明暗、五档字号、可选字体组合与两种语言下运行——数据来自浏览器内的演示接口，可以随意点击。",app:"应用",appLead:"这就是应用本身：侧栏、各个中心、对话与设置都能点开。主题与字号等控件作用于框内的应用；发送消息会得到一段脚本回复。",index:"界面索引",indexLead:"每个界面一页：应用停在该界面上，切换主题、字号与字体即可查看。",library:"组件库",libraryLead:"真实的 Web 组件，按类别各一页，在当前主题、明暗、字号与字体下渲染，可以操作。",fonts:"字体",fontsLead:"每个主题的默认字体、当前选择、字样与许可。"},rail:{theme:"主题",themeNames:{github:"朴素",modern:"白领",geek:"极客"},accent:"强调色",accentTheme:"随主题",size:"字号",sizeNames:{xs:"特小",s:"小",m:"中",l:"大",xl:"特大"},sizeTitle:(e,t)=>`${e} · 根字号 ${t}px`,fontLatin:"英文字体",fontCjk:"中文字体",fontTheme:"随主题",fontSystem:"系统",viewport:"视口",viewports:{desktop:"桌面",phone:"手机"},langNames:{en:"EN",zh:"中文"}},readout:{label:"当前字体",latin:"英文",cjk:"中文",mono:"等宽",system:"系统",pending:"读取中…"},crumb:{modes:{light:"浅色",dark:"深色"},phone:"手机"},intro:{resolving:"正在解析令牌…"},frame:{open:"单独打开",reload:"重新载入",frameOf:e=>`${e} 下的应用`,how:"在应用里的位置",route:"路由",signedOut:"未登录"},section:{copyLink:"复制链接",copyBreadcrumb:"复制路径",unset:"未定义"},foundations:{surfaces:"表面",inks:"文字",lines:"线条",inkWords:["正文","次要","弱化"],accent:"强调色",presetsHint:"主题自带的强调色，与当前主题列出的五个预设；别的主题的预设在这里不生效",themeAccent:"主题",sampleSend:"发送",selectedRow:"选中",sampleLink:"打开文档",linkHover:"悬停",tones:"语义色调",toneWords:{success:"运行中",attention:"等待中",danger:"失败",done:"已完成",neutral:"空闲",info:"同步中"},charts:"图表序列",tokenSeries:"Token 构成",code:"代码与差异",codeLines:{before:"const hits = rank(q).slice(0, ",removed:"3",added:"6",after:");",selected:"return cite(hits);"},typeNote:"每一行都用各自角色的令牌排版；中文列显示主题字体如何排中文与夹在其中的拉丁文字。",scene:{pageTier:"页面",cardTitle:"Docs Expert",cardMeta:"3 个会话 · $0.0231",nested:"内层方框的圆角 = 外层圆角 − 内边距",primary:"保存",secondary:"取消",input:"搜索会话",badge:"运行中",menuTier:"z-[60] 菜单",menuItems:["置顶","重命名","移动到…"],backdropTier:"z-50 对话框",dialogTitle:"删除这个会话？",dialogBody:"对话记录与 Trace 文件会一并删除。",cancel:"取消",confirm:"删除",toastTier:"z-[100] 通知",toast:"已导出 Trace #001"},radius:"圆角",shadows:"阴影层级",spacingPage:{title:"设置",appearance:"外观",theme:"主题",themeOptions:["浅色","深色","跟随系统"],fontSize:"字号",sizeOptions:["特小","小","中","大","特大"],general:"通用",language:"语言",languageOptions:["中文","English"],notifications:"完成时通知"},stack0Note:"stack-0：图标与文字之间的窄条",controlHeights:"控件高度（实测）",iconSizes:"图标尺寸",iconRegistry:(e,t)=>`${e} 个图标，来自 ${t} 个文件`,duplicateNames:"同一路径的多个名字",iconMarks:"组件标记",durations:"时长 × 缓动",reducedNote:"已减弱动效：每个变化直接呈现终态。",liveSignal:"实时信号",loading:"加载中",focusRing:"焦点环",inputFocus:"输入框焦点",selection:"选区",scrollbar:"滚动条",spaceUnit:"间距单位",spaceUnitNote:"所有间距与尺寸工具类都是它的倍数：h-8 即八个单位。",shell:"外壳",shellNote:"经 .ui-shell 的应用窗口：底场、导航列与主列，各主题自行决定它们的关系。",presence:"进出",presenceNote:"菜单自上方、对话框自中心、通知自下方进出，各按当前主题的进出令牌。",reveal:"显现",revealNote:"新的行出现在已稳定的列表里，每一行只在出现时按显现令牌动一次。",layout:"布局",layoutNote:"侧栏在展开与图标栏之间的宽度变化，按布局令牌。",replay:"重放",replayAll:"全部重放",motionSpecimens:{menu:"菜单",dialog:"对话框",toast:"通知",trigger:"更多",sidebarRows:["新对话","智能体","模型库"],revealRows:[{name:"read_file",detail:"package.json"},{name:"grep",detail:"useStreamReveal"},{name:"exec_command",detail:"运行测试"},{name:"apply_patch",detail:"src/app.ts"},{name:"exec_command",detail:"检查格式"}]},hookJobs:{"ui-glass":"磨砂面：盖在内容之上的临时层，白领的插件与技能图块","ui-eyebrow":"为下方一组条目命名的分组标签","ui-display":"页面或主视觉唯一的展示标题","ui-live":"正在进行之物的动效","ui-frame":"带头部、主体、底部与窗格的细线框","ui-underline-nav":"标签栏中选中项的标记","ui-shell":"应用窗口：导航列与主列","ui-icon-decor":"标签已经说明了的图标：主题可以着色或不画","ui-tree":"行会嵌套的列表：文件树、工作组的工具行、子 Agent 调用图","ui-field":"带标签的控件行：表单字段或设置行","ui-activity":"正在工作的思考行或工具行：运行中、已完成或出错","ui-notice":"提示条与弹出通知：按语气（信息、成功、警告、错误、中性）着色","ui-chart":"统计图：网格、坐标轴、折线、面积、柱与数据点","ui-widget":"回复里一眼看懂的读数块：天气、时钟、倒计时与指标","ui-scrim":"对话框、抽屉与面板背后的遮罩层","ui-stream":"正在流式输出的文字（回答、思考、压缩摘要、工具输出）：各主题决定新文字如何出现","ui-glyph":"按主题换画法的图标：朴素为线性画法，白领为线性画法衬淡色块（双色调），极客为像素画"},hookSamples:{menu:["置顶","重命名","删除"],group:"工作区",rows:["claude-code-expert","docs-sync","release-notes"],copy:"复制",tabs:["概览","轨迹","文件"],streaming:"正在写回答",tree:{root:"claude-code-expert",dir:"src",files:["rag.ts","embed.ts"],last:"README.md"},field:{name:"名称",value:"Docs Expert",hint:"在侧栏与消息中显示的名字。",notify:"完成时通知",notifyHint:"Task 结束时弹出系统通知。"}}},fonts:{title:"字体",pages:{defaults:"默认字体",specimens:"字样",licences:"许可"},defaultsTitle:"默认字体",defaultsHint:"每个主题各角色的默认字体：英文（正文与界面）、中文与等宽。「系统字体」指交给平台决定。",system:"系统字体",current:"当前选择",currentHint:"「显示设置」里选定的字体组合；「随主题」即上表中当前主题的一行。实际渲染的字体见下一行。",followsTheme:e=>`随主题（${e}）`,specimensTitle:"字样",licencesTitle:"许可",specimens:"字样",specimensHint:"每个主题的字体族，在五档字号（14 / 15 / 16 / 18 / 20 px）下各排一段中英文。",declared:"已声明的字体",declaredHint:"页面样式表中的 @font-face，按字体族、字重与样式合并；只有文本用到某个分片时浏览器才会下载它。",noFaces:"尚未声明任何字体。",family:"字体族",weight:"字重",slicesColumn:"分片",loadStatus:"加载情况",licences:"许可文本",noLicences:"还没有许可文本。",status:{loaded:"已加载",unloaded:"未使用",loading:"加载中",error:"失败"}},library:{title:"组件库",groups:{components:"组件",foundations:"视觉基础"},topics:{buttons:{title:"按钮",description:"五种变体、五档尺寸与图标按钮，禁用与加载中，以及链接与键盘提示。"},inputs:{title:"输入与表单",description:"文本框、多行文本、密码框、搜索框、复选框与单选框，以及字段脚手架：标签、提示、说明与错误。"},pickers:{title:"选择器",description:"下拉选择、分段控件、开关与开关行、色板、选项菜单、下拉菜单与菜单行。"},toasts:{title:"提示弹窗",description:"完成操作后的弹出提示：成功、信息、注意与错误，按按钮触发。"},notices:{title:"提示条",description:"占据一行的提示：每种语气，带与不带操作；建在其上的三种提示变体与页面待办。"},dialogs:{title:"对话框",description:"模态对话框、确认框、分页对话框、抽屉、底部面板、图片放大与命令面板。"},tooltips:{title:"悬停提示",description:"悬停与聚焦时出现的提示：data-tooltip 属性与 Tooltip 组件。"},tabs:{title:"标签页",description:"下划线式标签切换，可带更新标记。"},badges:{title:"徽标与状态",description:"徽标与计数、状态点、运行状态图标、会话活动标记与更新点，以及统计卡与统计值。"},empty:{title:"空状态",description:"列表或详情为空时的占位文字，可带操作。"},loading:{title:"加载",description:"转圈、骨架屏与进度条。"},streaming:{title:"流式输出",description:"助手回答随流到达时怎样显现：朴素即时显示，白领按词淡入，极客逐字打出。"},charts:{title:"图表",description:"统计图的基础：所有图表共用的绘图原语、当前主题的图表令牌，以及建立在它们之上的每一种图表——环形图、环形仪表、图例、趋势与用量柱、请求与成功率、迷你折线、轨迹时间线。"},avatars:{title:"头像",description:"用户头像与智能体头像的各个尺寸，以及头像组。"},site:{title:"公开站点",description:"落地页与文档站共用的组件：页脚、代码卡片与复制按钮、胶囊、文章目录、文档侧栏、搜索、外链确认与文章排版。"},files:{title:"文件",description:"文件树与只读文件浏览器，文件面板的树栏、预览栏与可拖动的分隔条，路径条、文件菜单、编辑器与拖放反馈。"},content:{title:"内容",description:"标题与文字角色、行内代码、Markdown 正文、代码块与代码面、差异视图，以及 A2UI 组件。"},layout:{title:"布局",description:"页面框架与页头、卡片与卡片头、分节、可折叠分节、实体头部，以及导航列表。"},data:{title:"数据",description:"表格、列表行、键值对与日志。"},machines:{title:"机器",description:"机器管理页的组件：每种状态的状态胶囊、机器卡片与列表、详情工具栏与添加对话框。"},colour:{title:"颜色",description:"表面、文字、线条、强调色、语义色调、图表序列与代码色。"},type:{title:"字体排印",description:"各角色的字号、行高与字重。"},shape:{title:"形状",description:"圆角、阴影层级与嵌套。"},density:{title:"密度",description:"间距单位与控件高度。"},focus:{title:"焦点",description:"焦点环、输入框焦点、选区与滚动条。"},motion:{title:"动效",description:"进出、显现、布局与时长缓动。"},icons:{title:"图标",description:"图标尺寸与 Web App 的图标表。"},hooks:{title:"样式钩子",description:"主题可以重绘的结构钩子，逐个示范。"}},buttons:{variants:"变体",primary:"保存",secondary:"取消",danger:"删除",ghost:"更多",link:"查看详情",sizes:"尺寸",md:"默认尺寸",sm:"小尺寸",xs:"最小尺寸",leading:"新建",icon:"图标按钮",iconHint:"名称必填：它既是无障碍名称，也是悬停提示。",add:"添加",edit:"编辑",states:"状态",disabled:"已禁用",busy:"保存中…",links:"链接",linksHint:"句中的链接始终带下划线，独立的链接悬停时才出现下划线；外部链接在新标签页打开，并带外链标记。",inlineBefore:"本次改动见",inlineLink:"发布说明",inlineAfter:"。",external:"查看全部版本",keys:"键盘提示",shortcuts:[["Ctrl","K"],["Ctrl","`"],["Esc"]]},inputs:{basics:"文本框",name:"名称",namePlaceholder:"Docs Expert",nameHint:"在侧栏与消息中显示的名字。",email:"邮箱",emailValue:"zheng@example",emailError:"邮箱地址不完整。",required:"必填",info:"带说明",infoText:"改动在下一次 Task 开始时生效。",sizes:"尺寸",base:"基础尺寸",small:"表单尺寸",textarea:"多行文本",textareaPlaceholder:"写一段系统提示…",mono:"等宽",monoValue:`temperature: 0.2
max_tokens: 4096`,password:"密码",passwordHint:"至少 12 个字符。",affix:"字段内前后缀",affixContext:"上下文窗口",affixToken:"Token",affixPrice:"输出价格",affixCurrency:"¥",affixUnit:"/M tok",search:"搜索框",searchField:"搜索插件",searchIcon:"搜索会话",searchPanel:"筛选文件",searchMenu:"搜索技能",checkboxes:"复选框",checkboxLabel:"清除已保存的密钥",checkboxHint:"保存时生效。",checkboxAll:"全部插件",checkboxDisabled:"已被管理员锁定",radios:"单选组",radioLabel:"名称已存在时",radioSkip:"跳过",radioSkipHint:"保留原有内容，不会丢失任何东西。",radioOverwrite:"覆盖",radioOverwriteHint:"替换同名的文件。",radioReplace:"全部替换",radioReplaceHint:"删除导入中没有的内容。",radioInline:"单行排列"},pickers:{select:"下拉选择",selectLabel:"模型",options:["DeepSeek V4.1 Flash","Claude Sonnet 4.5","GLM-5.3"],segmented:"分段控件",segments:["浅色","深色","跟随系统"],switches:"开关",switchLabel:"完成时通知",switchHint:"Task 结束时弹出系统通知。",switchOff:"工具短名",toggleRows:"开关行",toggleRowLabel:"显示启动球",toggleRowInfo:"工作台角落的圆形按钮，点开后展开终端、文件与预览。",togglePlainLabel:"为应用请求使用代理",togglePlainHint:"保存后生效。",toggleCardLabel:"开启记忆",swatches:"色板",optionMenu:"选项菜单",optionLabel:"权限",choices:[{value:"r",trigger:"r",label:"只读",description:"只能读取工作区。"},{value:"rw",trigger:"rw",label:"读写",description:"可以修改工作区里的文件。"},{value:"ask",trigger:"ask",label:"逐项审批",description:"每次写入前先询问。"}],dropdown:"下拉菜单",menu:"更多操作",menuPin:"置顶",menuRename:"重命名",menuMove:"移动到…",menuDelete:"删除",menuRows:"菜单行",menuRowsHint:"两种密度：账号与项目菜单用正文字号，行的更多菜单与右键菜单用小字号。",menuSettings:"设置",menuAppInfo:"应用信息",menuVersion:"v0.2.13",menuSignOut:"退出登录",menuGroupBy:"分组方式",menuByWorkspace:"按工作区",menuByAgent:"按 Agent",menuSortBy:"排序方式",menuRecent:"最近活跃",menuManual:"手动排序"},toasts:{fire:"触发一条提示",hint:"提示出现在页面顶部，几秒后自动消失；错误与注意会停留更久。",success:"成功",info:"信息",attention:"注意",error:"错误",successText:"已保存。",infoText:"索引正在后台重建。",attentionText:"已保存，但有 2 个字段被截断。",errorText:"连接失败：无法访问 api.example。"},notices:{plain:"每种语气",dotted:"带前导标记",withActions:"带操作",texts:{info:"新版本 0.3.0 可用。",success:"索引已重建，共 214 个文件。",attention:"有 1 条未预期错误。",danger:"模型返回 401：密钥无效。",neutral:"这个会话已归档。"},action:"查看",dismiss:"忽略",variants:"四种变体",variantNames:{strip:"条带：横贯面板",callout:"提示块：独立成块",inline:"行内：嵌在内容里",banner:"横幅：横贯一栏、居中一行，关闭叉在最右"},bannerText:"当前账号正在使用初始密码，建议尽快修改",bannerAction:"去修改",closable:"可关闭的提示",reopen:"重新显示",closableHint:"关闭叉是平的，取提示自己的墨色；要跨页面记住关闭的，由调用方保存。",closableText:"环境变量里的模型密钥无法同步到这台机器，请先手动配置模型密钥。",retry:"重试",calloutTitle:"模板里缺少记忆占位符",calloutBody:"在提示词模板里插入占位符后，记忆才会注入对话。",todo:"页面待办",todoText:"有 3 个技能可更新",todoAction:"全部更新",todoDismiss:"标为已读"},dialogs:{modal:"模态对话框",openModal:"打开对话框",modalTitle:"重命名会话",modalBody:"新的名字会显示在侧栏与消息里。",save:"保存",cancel:"取消",confirm:"确认框",openConfirm:"删除会话…",confirmTitle:"删除这个会话？",confirmBody:"对话记录与 Trace 文件会一并删除，无法恢复。",confirmLabel:"删除",openSaveConfirm:"保存修改…",saveConfirmTitle:"保存这些修改？",saveConfirmBody:"智能体从下一个任务开始使用新的设置。",paged:"分页对话框",openPaged:"打开设置",pagedTitle:"设置",pagedGroups:{app:"应用",you:"账号"},pages:{general:"通用",appearance:"外观",account:"个人资料"},pageBody:"当前页的设置项放在这里。",appearanceInfo:"主题、强调色与密度只作用于这个浏览器。",drawer:"抽屉",openDrawer:"打开抽屉",drawerTitle:"导航",drawerBody:"手机宽度下的侧栏从边缘滑入。",sheet:"底部面板",openSheet:"打开底部面板",sheetTitle:"文件",sheetBody:"向上拖动展开到整屏，向下拖动关闭。",lightbox:"图片放大",lightboxHint:"点击缩略图放大；按 Esc 或点击图片以外的地方关闭。",lightboxAlt:"企鹅标志",palette:"命令面板",paletteAside:"输入以筛选；每个操作会打开本页的另一个对话框。",openPalette:"打开命令面板",palettePlaceholder:"输入以筛选命令…",paletteEmpty:"没有匹配的命令",paletteHint:"↑↓ 选择 · Enter 执行 · Esc 关闭"},tooltips:{attribute:"data-tooltip 属性",attributeHint:"任何元素加上属性即可；只有图标的按钮同时带 aria-label。",component:"Tooltip 组件",componentHint:"需要包裹时使用：右侧或下方摆放。",truncated:"被截断的文本",truncatedHint:"行里放不下的命令或标题，完整内容放进提示里。",edit:"编辑",copy:"复制",settings:"设置",besideTip:"在触发元素右侧弹出",belowTip:"在触发元素下方弹出",command:"pnpm --filter @prismshadow/penguin-web exec vitest run test/session-activity.test.ts --reporter verbose"},tabs:{basic:"标签切换",badged:"带更新标记",items:["概览","轨迹","文件","设置"],badgeText:"有 3 个技能可更新",body:e=>`「${e}」的内容。`},badges:{pills:"标签胶囊",pillsHint:"一种形状：高度、内边距、圆角、字号与描边都相同，只按语义换语气；只写词，不带图形。",pillRow:{thisServer:"本服务端",running:"运行中",update:"需要更新",caption:"卡片标题行：标签、状态与更新胶囊同一形状"},badges:"徽标",tones:{neutral:"默认",success:"运行中",attention:"已中止",danger:"失败",done:"已完成",info:"免费"},variants:{soft:"浅底",outline:"描边",solid:"实底"},count:"计数",dots:"状态点",dotsHint:"六种语气；只有正在进行的事才跳动",live:"进行中",status:"运行状态",states:{running:"运行中",waiting:"等待审批",done:"已完成",failed:"失败",stopped:"已停止"},activity:"会话活动",activities:{running:"运行中",compacting:"压缩中",completedUnread:"有未读回复"},marks:"其他标记",background:"后台任务",schedule:"定时任务",dot:"更新点",dotAnchor:"插件市场",pill:"更新提示",pillText:"3 个可更新",statTile:"统计卡",spend:"本月花费",spendDetail:"组织预算 $40",alerts:"告警",alertsDetail:"1 人超出预算、1 人已暂停",statChip:"统计值",input:"输入",output:"输出",elapsed:"耗时"},empty:{page:"页面空状态",title:"还没有会话",description:"发送第一条消息后，会话会出现在这里。",action:"新对话",settings:"设置区空状态",settingsText:"还没有添加任何 MCP 服务器。"},loading:{spinner:"转圈",sizes:"三档尺寸",skeleton:"骨架屏",list:"列表",card:"卡片",progress:"进度条",progressHint:"三档高度；不定进度时静止",progressLabel:"下载进度",progressOver:"超出上限",progressIndeterminate:"不定进度"},streaming:{reply:"助手回答",output:"工具输出",receiving:"正在接收…",received:"已全部到达",modes:{instant:"即时：文字一到就显示，不加动效",fade:"淡入：按词显现，最新的一行半从一层轻纱里浮现",typewriter:"打字机：逐字打出，末尾跟着一个实心块状光标"},unset:"按即时处理",rate:e=>`每秒约 ${Math.round(e)} 字`,reduced:"已开启减少动态效果，回答到达即显示"},charts:{parts:{primitives:"绘图原语",primitivesHint:"每个图表都只通过这几个原语落笔：它们读取主题的图表令牌，写出 data-part，是令牌变成 SVG 或 HTML 的唯一地方。",tokens:"当前主题的图表令牌",tokensHint:"从这个框的根元素的计算样式读取；换主题、明暗或强调色后重新读取。",charts:"建立在原语上的图表",chartsHint:"应用里的每一种图表，使用演示数据。"},primitives:{bar:"ChartBar · 柱",barHint:"宽度由 bar-fill 决定，顶角圆角、边框与填充不透明度各按令牌。",line:"ChartLine · 折线",lineHint:"同一组点，按三种连线方式各画一次；线宽按令牌。",curves:{linear:"linear · 直连",smooth:"smooth · 平滑",step:"step · 阶梯"},area:"ChartArea · 面积",areaHint:"折线下方的填充，不透明度按令牌。",point:"ChartPoint · 数据点",pointHint:"半径按令牌；主题决定圆点还是方点。",arc:"ChartArc · 弧",arcHint:"环形图的一段：底环是 grid，各段按 Token 种类色或色槽。",grid:"ChartGrid 与 ChartAxis · 网格与坐标轴",gridHint:"网格线与坐标轴的墨色按令牌，主题决定实线或虚线。",timeline:"TimelineBar · 轨迹条",timelineHint:"轨迹时间线的 HTML 条，五种分段各取一个色槽。",kinds:{thinking:"思考",text:"回复",tool_call:"工具调用",approval:"等待审批",tool:"工具执行"}},palette:"调色板",geometry:"几何",tokenMeaning:{"--ui-chart-1":"色槽 1 · 紫","--ui-chart-2":"色槽 2 · 琥珀","--ui-chart-3":"色槽 3 · 天蓝","--ui-chart-4":"色槽 4 · 玫红","--ui-chart-5":"色槽 5 · 翠绿","--ui-chart-6":"色槽 6 · 品红","--ui-chart-7":"色槽 7 · 备用","--ui-chart-8":"色槽 8 · 备用","--ui-chart-ref":"参考线","--ui-chart-cache-read":"缓存读取","--ui-chart-cache-write":"缓存写入","--ui-chart-output":"输出","--ui-chart-grid":"网格线","--ui-chart-axis":"坐标轴","--ui-chart-bar-fill":"柱宽占带宽的比例（0–1）","--ui-chart-bar-radius":"柱顶圆角","--ui-chart-bar-stroke":"柱边框宽","--ui-chart-bar-stroke-color":"柱边框色（series 即序列色）","--ui-chart-bar-opacity":"柱填充不透明度（0–1）","--ui-chart-line-width":"线宽","--ui-chart-point-radius":"数据点半径","--ui-chart-curve":"连线方式（linear / smooth / step）","--ui-chart-area-opacity":"面积填充不透明度（0–1）"},donut:"Token 环形图",donutHint:"缓存读取、缓存写入与输出的构成，环的余量随接近上限变色。",donutLabels:{usage:"上下文占用",cacheRead:"缓存读取",cacheWrite:"缓存写入",output:"输出"},ring:"环形仪表",ringHint:"一段弧对照预算，按预算状态着色（未超、将超、已超）；未设预算只剩底环；多段弧表示各部分占比。输入框的上下文圆环（ContextRing）在 80% 以内取次要墨色，超过 80% 转为提醒色，超过 95% 转为危险色。",ringSpend:e=>`支出占预算 ${e}%`,ringNoBudget:"未设预算",ringShares:"各部分占比",ringContext:"上下文圆环",ringContextAt:e=>`上下文已用 ${e}%`,legend:"图例",legendHint:"图表下方的一行图例：指向某项时其余各项淡出；说明线形的一项不参与高亮。列表图例在标签后列出数值，点击可固定一行。",legendHitRate:"缓存命中率",legendParts:["系统提示词","工具定义","对话消息","工具结果"],trend:"成本趋势",trendHint:"十四天的成本折线，悬停查看某一天。",tokens:"Token 用量",tokensHint:"按种类堆叠的每日 Token 柱，叠加缓存命中率曲线；悬停图例高亮一种。",requests:"请求与成功率",requestsHint:"按智能体堆叠的每日请求数，与各自的成功率线。",agents:["docs-expert","release-notes"],activity:"活动折线",activityHint:"智能体卡片上的十四天会话数曲线，只看相对起伏。",sparkline:"评分折线",sparklineHint:"一个评估任务的历次得分，最新一次标出；只有一次得分时是单独一个点。",timeline:"轨迹时间线",timelineHint:"一次 Task 的模型分段与工具调用：思考、回复、工具调用、等待审批与执行，各占一道。"},avatars:{user:"用户头像",agent:"智能体头像",stack:"头像组",stackShown:(e,t)=>`共 ${t} 个，显示 ${e} 个`,userNames:["admin","演示管理员"],agents:[{id:"docs-expert",name:"Docs Expert"},{id:"release-notes",name:"Release Notes"},{id:"qa",name:"QA"}]},site:{footer:"页脚",footerHint:"落地页的品牌与链接栏，文档站的一行版权与链接。",tagline:"统一、稳定的 Agent 自进化框架",columns:[{title:"产品",links:["案例","快速开始","博客","下载"]},{title:"资源",links:["GitHub 仓库","文档","画廊"]}],lineLinks:["产品主页","GitHub 仓库","Apache-2.0 License"],copyright:"© 2026 Prism Shadow · 基于 Apache-2.0 协议开源",code:"代码与复制",codeHint:"命令卡片带复制按钮；写入剪贴板后图标换成对勾，按钮文字不变，读屏软件播报「已复制」。",copy:"复制",copiedAnnouncement:"已复制",copyMarkdown:"复制 Markdown",copyLink:"复制页面链接",pills:"胶囊",pillsHint:"博客文章的分类与置顶标记：色调表示类别，不表示状态。",pillTones:{brand:"产品动态","brand-outline":"技术实践",teal:"观点",neutral:"更新日志"},article:"文章",articleHint:"博客文章与文档页共用的排版。标题带锚点，围栏代码块高亮，标签组与提示框是文档的 Markdown 扩展；本页右侧是它的目录。",articleBody:`## 安装

在终端运行一行命令即可安装：

\`\`\`bash
curl -fsSL https://penguin.ooo/install.sh | sh
\`\`\`

### 按平台

\`\`\`bash tab="Linux / macOS"
curl -fsSL https://penguin.ooo/install.sh | sh
\`\`\`

\`\`\`powershell tab="Windows"
irm https://penguin.ooo/install.ps1 | iex
\`\`\`

> [!INFO]- 首次启动被系统拦下
>
> 在系统设置里允许它运行即可。

## 下一步

- 运行 \`penguin web\` 打开 Web App
- 回到[安装](#安装)

| 命令 | 作用 |
| --- | --- |
| \`penguin\` | 在终端里对话 |
| \`penguin web\` | 启动 Web App |`,toc:"本页目录",sidebar:"文档侧栏",sidebarHint:"分节列出页面，子页面缩进在父页面下，当前页以品牌色标出；顶部是搜索入口。",sidebarSections:[{title:"开始",pages:["产品介绍","快速开始","核心概念"],children:["桌面应用","命令行与 Web App"]},{title:"使用指南",pages:["Web App","对话"],children:[]}],search:"搜索",searchHint:"Ctrl/⌘ K 或侧栏顶部的按钮打开；方向键选择，回车打开。",searchLabels:{open:"搜索文档",label:"搜索文档",placeholder:"搜索标题、章节和正文",start:"输入关键词搜索当前语言的全部文档",noResults:"没有找到相关文档",noResultsHint:"请尝试更短或不同的关键词",results:"搜索结果",close:"关闭搜索",keyboardHint:"使用上下方向键选择，按回车打开"},searchResults:[{title:"安装命令行",context:"命令行与 Web App",snippet:"按平台运行安装脚本，安装包自带 Node.js 运行时。"},{title:"离线安装",context:"命令行与 Web App",snippet:"下载对应平台的安装包后解压并运行其中的安装脚本。"},{title:"安装 SDK",context:"SDK",snippet:"在项目目录中运行 npm install @prismshadow/penguin-core。"}],leave:"外部链接",leaveHint:"离开站点的链接先确认，对话框里显示完整地址。",leaveLink:"GitHub 仓库",leaveLabels:{title:"即将打开外部链接",body:"这个链接指向 PenguinHarness 之外的网站，会在新标签页中打开：",cancel:"取消",open:"继续打开"}},files:{tree:"文件树",treeLabel:"工作区",browser:"文件浏览器",header:"docs-expert",emptyPreview:"选择左侧的文件预览。",emptyDir:"空目录",root:".",readme:"# Docs Expert\n\n从 `corpus/` 建立 BM25 索引，回答关于 Claude Code 文档的问题。\n\n- `src/rag.ts` — 检索\n- `test/` — 用例",truncated:"内容过大，预览已截断，请下载查看完整文件",unsupported:"该类型不支持预览，请下载查看",download:"下载",panel:"文件面板",panelHint:"树与预览两栏：可拖动的分隔条、路径条与预览上的操作条",search:"搜索文件",treeWidth:"调整文件树宽度",selectFile:"选择一个文件以预览",wrap:"自动换行",crumbs:"路径条",crumbsHint:"放不下时，开头的几段收进一个「…」，文件名最后让位",menu:"文件菜单",menuFile:"文件",menuFolder:"文件夹",copyPath:"复制相对路径",addToChat:"添加到对话",addSelection:"将选中内容添加到对话",uploadHere:"上传到此文件夹",rename:"重命名 / 移动",delete:"删除",newTextFile:"新建文本文件",newFolder:"新建文件夹",editor:"编辑器",editorLabel:e=>`编辑 ${e}`,drop:"拖放反馈",dropAttach:"松开以添加附件",dropAttachHint:"图片与文件将添加到输入框",dropUpload:e=>`松开即上传到 ${e}`},content:{headings:"标题",headingsHint:"每一级取主题的字阶；展示标题只用于页面的一级标题。",display:"页面展示标题",heading:e=>`${e} 级标题`,text:"文字角色",samples:{body:"正文：消息、说明与设置项的字号。",small:"小字：次要信息与元数据。",caption:"说明：图表或控件下方的注释。",eyebrow:"分组标签",mono:"sess_7f3a · ~/work/penguin",label:"字段标签"},inline:{before:"先运行 ",code:"pnpm install",after:" 安装依赖。"},prose:"Markdown 正文",proseSample:`## 部署检查

发布前确认 **三件事**，再运行 \`pnpm -r build\`。详见[发布说明](https://penguin.ooo)。

- 类型检查通过
- 测试全部通过
- 更新日志已写好

> 数据根被占用时，换一个数据根，不要结束别人的进程。

| 检查 | 命令 |
| --- | --- |
| 类型 | \`pnpm typecheck\` |
| 测试 | \`pnpm test\` |

\`\`\`bash
pnpm -r build && pnpm test
\`\`\`

缓存命中率为 \\(r = h / (h + m)\\)。`,reader:"Markdown 阅读器",readerHint:"插件 README、文件浏览器与手册共用的阅读器：两个及以上标题时附目录（够宽时在右侧，窄时收进标题行的目录按钮），目录与查找按钮放在宿主的标题行，查找按钮或焦点在阅读器内时按 Mod+F 在渲染后的正文里查找。",readerNarrow:"窄宽度：目录收进标题行的按钮",readerSample:["# 发布流程","","本页说明一次版本发布从准备到公告的全过程。每轮触发先读索引，再按需读本页。","","## 发布前检查","","发布分支从 `main` 切出，名称为 `release/<版本号>`。切出前确认三件事：","","- 类型检查与测试全部通过：`pnpm typecheck && pnpm test`","- `changelog/unreleased/` 里的条目中英成对","- 没有待合并的破坏性改动","","### 版本号","","版本号遵循语义化版本。一个版本号打过 tag 就不能再用：发布失败时作废该号，改用下一个。","","### 依赖","","锁文件只在单独的提交里更新，提交信息写明升级了哪些包、为什么升级。","","## 构建与签名","","| 平台 | 产物 | 签名 |","| --- | --- | --- |","| macOS | `.dmg` | 公证后发布 |","| Windows | `.exe` | 代码签名证书 |","| Linux | `.tar.gz` | 附校验和 |","","构建在 CI 上完成，本地只做冒烟检查：","","```bash","pnpm -r build","node packages/cli/dist/index.js --version","```","","## 公告","","### 发布说明","","`changelog/<版本号>/RELEASE.md` 原样成为 GitHub Release 的正文，必须在打 tag 之前提交——发布流程从 tag 的检出里读它。","","### 博客","","博客文章与截图随发布一起准备；截图统一用白领主题、浅色模式、默认字号。","","## 回滚","","发现严重问题时，先在发布公告下置顶说明，再发补丁版本。已发布的 tag 不移动、不删除。","","## 常见问题","","### 安装脚本找不到新版本","","镜像同步有延迟，通常十分钟内完成；超过一小时仍未同步，在运维频道 @值班。","","### 签名失败","","先检查证书是否过期；macOS 公证失败时，查看公证日志里的第一条错误，其余多半是它的连带结果。",""].join(`
`),compact:"紧凑：频道消息",compactSample:"已合并 **#897**，`feat/ui-w2` 可以删了。",code:"代码",surface:"代码面：行号，无外框",diff:"差异",unified:"合并视图",split:"并排视图",patch:"读取补丁",diffLabel:"src/config.ts 的改动",patchLabel:"src/limits.ts 的改动",a2ui:"A2UI 组件",a2uiHint:"模型写进回复的组件：天气、时钟、倒计时和指标小组件，以及选择、表单、步骤、提示框和 Mermaid 图。小组件是模型给出的快照，只有时钟和倒计时会走动；在这里点选或提交，要填入输入框的文字会以提示消息显示。",a2uiReply:[{lead:"北京现在的天气：",spec:{type:"weather",place:"北京",condition:"partly-cloudy",temp:18,unit:"C",summary:"傍晚转阴，夜里可能有小雨",high:22,low:12,feelsLike:17,humidity:62,windSpeed:12,windDirection:"东北",hourly:[{time:"14:00",temp:18,condition:"partly-cloudy",precip:10},{time:"15:00",temp:19,condition:"partly-cloudy",precip:10},{time:"16:00",temp:19,condition:"cloudy",precip:20},{time:"17:00",temp:18,condition:"cloudy",precip:30},{time:"18:00",temp:16,condition:"cloudy",precip:40,night:!0},{time:"19:00",temp:15,condition:"drizzle",precip:60,night:!0}],daily:[{date:"2026-10-04",high:22,low:12,condition:"partly-cloudy",precip:20},{date:"2026-10-05",high:19,low:11,condition:"rain",precip:80},{date:"2026-10-06",high:17,low:9,condition:"cloudy",precip:30},{date:"2026-10-07",high:20,low:10,condition:"clear",precip:0},{date:"2026-10-08",high:23,low:11,condition:"wind",precip:10}],asOf:"2026-10-04T14:05+08:00",source:"Open-Meteo"}},{lead:"团队三地现在的时间：",spec:{type:"clock",title:"团队时区",zones:[{zone:"local"},{zone:"America/New_York",label:"纽约"},{zone:"Europe/London",label:"伦敦"}],style:"both"}},{lead:"离新年还有：",spec:{type:"countdown",to:"2026-12-31T23:59:59+08:00",label:"新年倒计时",doneLabel:"新年快乐"}},{lead:"刚读到的服务状态：",spec:{type:"metrics",title:"服务状态",items:[{label:"CPU",value:37,max:100,unit:"%",gauge:"ring",warn:80,danger:95,history:[22,31,28,45,52,41,37]},{label:"内存",kind:"used",value:15.3,max:16,unit:"GB",decimals:1,gauge:"bar",warn:13.6,danger:15.2,delta:.4,deltaLabel:"较昨天"},{label:"API 额度",kind:"remaining",value:1240,max:5e3,warn:1e3,danger:250,detail:"3 天后重置"},{label:"本月预算",kind:"remaining",value:180,max:1e3,prefix:"¥",warn:300,danger:100},{label:"上传",kind:"progress",value:63,max:100,unit:"%"}],asOf:"2026-10-04T14:05+08:00"}},{lead:"先定下数据库。",spec:{type:"choice",question:"服务用哪种数据库？",options:[{label:"PostgreSQL",description:"关系型，团队已经在运维",recommended:!0},{label:"SQLite",description:"单个文件，放在服务旁边"},{label:"MongoDB",description:"文档型，表结构随时可改"}],allowOther:!0}},{lead:"改动已经通过全部检查。",spec:{type:"choice",question:"现在合并吗？",options:[{label:"现在合并",recommended:!0},{label:"等评审后再合并"},{label:"先不合并"}]}},{lead:"发布前要跑的检查可以多选：",spec:{type:"choice",question:"发布前跑哪些检查？",multiple:!0,options:[{label:"类型检查",description:"几秒钟，挡住大部分低级错误",recommended:!0},{label:"单元测试",description:"大约两分钟"},{label:"端到端测试",description:"大约十五分钟，需要浏览器"}]}},{lead:"部署信息一次填完：",spec:{type:"form",title:"部署信息",fields:[{id:"region",label:"区域",kind:"single",options:[{label:"华东"},{label:"华北"},{label:"华南"}],required:!0},{id:"addons",label:"附加功能",kind:"multiple",options:[{label:"CDN"},{label:"WAF"}]},{id:"replicas",label:"副本数",kind:"number",min:1,max:10,step:1,unit:"个"},{id:"notes",label:"备注",kind:"text",placeholder:"其他要求"}],submitLabel:"填入回答"}},{lead:"按三步轮换密钥：",spec:{type:"steps",title:"轮换 API 密钥",steps:[{text:"打开「设置 › 密钥」。"},{text:"新建一个密钥并复制。",note:"新密钥立即生效。"},{text:"删除旧密钥。",warning:"删除后无法恢复。",caution:"仍在使用旧密钥的任务会失败，重启后恢复。",code:"curl -X DELETE https://api.example.com/keys/old",lang:"bash"}]}},{lead:"最后一点：",spec:{type:"callout",tone:"tip",text:"推送前先运行 `pnpm test`。"}},{lead:"开始之前：",spec:{type:"callout",tone:"warning",title:"止损点",text:"两天内拿不到第一组数据就换方案，不要硬撑。这一步决定后面的投入值不值得，宁可早停也不要拖到最后才放弃。"}}],a2uiDiagramLead:"请求先查缓存：",a2uiDiagram:`flowchart LR
  A[请求] --> B{命中缓存}
  B -->|是| C[直接返回]
  B -->|否| D[回源读取]
  D --> C`,a2uiInvalidLead:"无法显示的块给出原因和源码："},layout:{page:"页面与页头",pageHint:"页头只有一个展示标题，不加眉题；返回在标题上方，操作在标题行末尾。",pageTitle:"智能体",pageInfo:"每个智能体有自己的提示词、工具、技能与记忆。",pageDescription:"当前项目里的 4 个智能体。",pageBody:"页面内容从这里开始。",back:"返回列表",search:"搜索智能体",create:"新建",cards:"卡片",padded:"带内边距：标题行在内容上方",cardTitle:"本月花费",cardInfo:"本月所有智能体的模型花费。",cardAction:"导出",cardValue:"$128.45",cardBody:"比上月少 12%。",flush:"贴边：行铺满卡片，标题是一条分隔带",flushTitle:"最近的会话",flushDescription:"按最后一条消息排序。",flushRows:["整理本周的发布说明","排查定时任务漏跑","给评测集补三个用例"],ruled:"分节",ruledTitle:"收件箱",ruledInfo:"等你处理的工单：待审核的与被退回的。",ruledAction:"全部标为已读",ruledBody:"三张工单等你审核。",collapsible:"可折叠分节",collapsibleHint:"折叠是布局动效：正文的网格行在 1fr 与 0fr 之间变化，由主题决定怎么动。",providerName:"OpenAI",modelCount:e=>`${e} 个模型`,addModel:"添加模型",foldedTitle:"自定义",foldedBody:"这个分组还没有模型。",entity:"实体头部",entityName:"代码审查员",entityDescription:"阅读每个 PR 的改动，只指出会导致错误的问题。",copyId:"复制 ID",entityAction:"打开会话",entityTags:["审查","只读"],nav:"导航列表",navHint:"当前行用实色填充，并标为当前页；图标只是装饰，旁边的标签已经说明了它。对话框的侧栏在手机上横向滚动。",navLabel:"智能体设置",navRail:"侧栏：图标、标签与行尾计数；最后一行暂时无处可去",navDense:"紧凑：用在面板里",navRows:{overview:"概览",models:"模型",schedules:"定时任务",vault:"密钥库",billing:"账单"}},data:{table:"表格",tableHint:"表头只有一种：小号字阶、中等字重、次要墨色与一条分隔线；独立的表格自带边框，表头在次级表面上。",caption:"定时任务",columns:{name:"名称",status:"状态",period:"周期",cost:"花费",employee:"员工"},enabled:"已启用",paused:"已暂停",pause:"暂停",enable:"启用",bare:"卡片里的紧凑表格",spendTitle:"按员工的花费",employees:["研究员","撰稿人","审校"],rows:"列表行",rowsHint:"可点击的行把标志与文字合成一个按钮，行尾的操作留在按钮之外。",skillDescriptions:["读取 PDF 并填写其中的表单。","按设计规范搭建网页。","从会话中总结可复用的经验。"],skillMeta:"2 天前",exportSkill:e=>`导出 ${e}`,clickable:"打开所指内容的行",cases:["登录页的表单校验","空仓库的首次提交","超长文件名的截断"],longRows:"超长文字",longRowsHint:"标题与说明各截成一行，悬停显示全文；日期与操作保持原宽，放不下时换到文字下方，从不被卡片裁掉。",memoryTitle:"用户记忆",memoryCount:e=>`${e} 条`,memoryDescriptions:["本机代理在 127.0.0.1:9090，但 ~/.bashrc 在非交互式 shell 里提前 return，exec_command 拿不到 http_proxy 等环境变量；需要在命令里显式 export 代理，或对本地地址加 --noproxy '*'，否则 curl 访问本地端口会返回 502。",'PenguinHarness v0.2.15 服务器进程内调用任何 Gemini 模型都会失败："Failed to parse URL from [object Request]"。原因是打包后的 fetch 与 Request 实现不一致，升级到 0.2.16 后恢复正常。',"引用专利号或文献前，先用工具核验。"],viewMemory:e=>`查看 ${e}`,editMemory:e=>`编辑 ${e}`,deleteMemory:e=>`删除 ${e}`,keyValue:"键值对",labels:{version:"版本",started:"启动于",root:"数据根",machineId:"机器 ID"},log:"日志",logHint:"仍在运行的任务：最后一行用正文墨色。",logLabel:"更新输出"},machines:{pills:"状态胶囊",pillsHint:"每种状态都是一个词，与本服务端标签同一形状，原因悬停胶囊显示；不带图形，也不用意义不明的彩色圆点。",states:{serving:"运行中",ready:"运行中",queued:"排队中",working:"处理中",reconnecting:"重新连接中",failed:"失败",signInRefused:"登录被拒",installedOnly:"已安装",behind:"有新版本",notConnected:"未连接",unreachable:"连不上",stopped:"已停止",notInstalled:"未安装",unknown:"未检查"},reasons:{failed:"失败于「重启服务」：30 秒内端口 7364 没有响应。",unreachable:"ssh: connect to host 10.0.0.12 port 22: Connection timed out",working:"Downloading penguin-harness 0.2.16…",reconnecting:"第 4 次尝试",behind:"有新版本 0.2.16"},cards:"机器卡片",cardsHint:"本服务端在首，其后每种状态一张；标题行至多两枚胶囊，版本在统计行。",card:{thisServer:"本服务端",undeletable:"本服务端不能删除",local:"本机",checked:"4 分钟",use:"使用",settings:"设置",remove:"删除",sync:"同步配置",update:"需要更新",installing:"安装程序"},waits:{reconnecting:"重新连接中…",stopped:"服务已停止",notConnected:"尚未连接",failed:"上次任务失败",signInRefused:"那台机器拒绝了保存的密码——请在机器的 SSH 设置里重新填写。",notInstalled:"尚未安装",windows:"已安装，这台 Windows 机器需要手动启动服务"},loading:"加载中",toolbar:"详情工具栏",toolbarHint:"暂时不能执行的按钮置灰，下方一句话说明原因。",toolbarLabel:"机器操作",held:"暂时连不上这台机器。",verbs:{update:"更新",stop:"停止服务",restart:"重启服务",configure:"配置 SSH",uninstall:"卸载"},add:"添加机器",addHint:"对话框的正文与页脚：标签页、可勾选的主机行、没能添加的原因，以及缺省勾选的复选框。",addIntro:"本服务端会在一台能经 ssh 登录的机器上安装 PenguinHarness，并连上它。",tabs:{config:"从 ssh 配置选择",manual:"手动填写"},search:"搜索主机",elsewhere:e=>`其他 Project 已安装 ${e}`,addError:"名称「gpu-a100」已被 ssh 配置占用。",installNow:"添加后立即安装并连接",cancel:"取消",submit:"添加",submitCount:e=>`添加 ${e} 台`,exhaustedCaption:"ssh 配置里已没有可添加的主机",noHosts:"ssh 配置里的主机都已在本页。"}}},Ie={sitebar:{siteName:"PenguinHarness",nav:{home:"Home",blog:"Blog",download:"Download",docs:"Docs",gallery:"Gallery",github:"GitHub",openMenu:"Open menu",closeMenu:"Close menu"},theme:{label:"Theme",light:"Light",dark:"Dark",system:"System"},lang:{label:"Language",zh:"ä¸­æ",en:"English",system:"System"}},site:{home:"Overview",surfaces:"Surfaces",foundations:"Foundations",fonts:"Fonts",pages:"Pages",search:"Search surfaces",searchShortcut:"Ctrl K",noMatches:"No surface matches.",nav:"Surfaces",onThisPage:"On this page",settings:"View settings",notFound:e=>`There is no page named â${e}â.`,allSurfaces:"All surfaces",feedbackTitle:"Feedback",feedbackBody:"Quote the breadcrumb at the end of a frame's toolbar, or copy the page's address with the link button.",feedbackExample:"Frost âº Chat Â· dark"},surfaceGroups:{conversation:"Conversation",workbench:"Workbench",resources:"Resources",measure:"Measure",system:"System"},surfaces:{chat:{title:"Chat",description:"A finished Task: thinking, three tool calls, a diff, and a Markdown answer with a table and code.",how:"Sidebar âº any row of the session list."},"chat-running":{title:"Chat Â· tool running",description:"A Task mid-run: a command is executing, and the tool row shows the running state and its timer.",how:"Sidebar âº a session row with the running mark."},"chat-thinking":{title:"Chat Â· thinking",description:"A Task mid-run: the model is thinking; the thinking row shows the running state and the text keeps growing.",how:"Sidebar âº a session row with the running mark."},"chat-streaming":{title:"Chat Â· streaming",description:"A Task mid-run: the answer is streaming in and reveals the way the current theme does it; once done it holds for a moment and streams again, on a loop.",how:"Sidebar âº a session row with the running mark."},"chat-approval":{title:"Chat Â· awaiting approval",description:"A Task waiting on a human: a command needs approval; allow or deny it and the Task carries on and ends.",how:"Sidebar âº a session row with the approval mark."},"chat-harness":{title:"Chat Â· harness rows",description:"Every row neither a person nor the model wrote: a handoff origin, Skills and an attached file, the MCP connect row, background-task notices, a scheduled trigger, a reconnect, an abort, a provider error, a compaction and a model switch, the rounds and steering of a goal run, each Task's stats line and the goal banner.",how:"Sidebar âº âFix the hooks doc citationsâ, the oldest row of the session list."},"chat-org":{title:"Chat Â· organization trigger",description:"A desk Session an organization's scheduler opened: the first message's trigger block folds into a one-line origin notice.",how:"Company mode âº an employee's desk."},"chat-rsi":{title:"Chat Â· self-evolution round",description:"The General Agent improves the docs Agent with the Default RSI Toolkit: it reads the Reference score and the weakest case's Trace, snapshots the Agent State and edits it, evaluates every case through parallel evaluator subagents, and keeps the new version because it scores higher.",how:"Sidebar âº General Agent âº âImprove Docs Expert on Docs QA v1â. A round starts from Evaluation Center âº a Benchmark âº Use âº Optimize."},"chat-new":{title:"New chat",description:"The draft page: pick the Agent, Workspace, approval mode and model, then type and send the first message.",how:"Sidebar âº New chat."},agents:{title:"Agents",description:"The Agent list: each Agent's activity curve and its session, tool, Skill and schedule counts.",how:"Sidebar âº Agents."},"agent-settings":{title:"Agent settings",description:"One Agent's settings page: overview, prompt, memory, runtime, tools, Skills, hooks, Vault and schedule tabs.",how:"Agents âº any Agent."},schedules:{title:"Schedules",description:"The Agent settings' schedule tab: periods, next fire time, the bound Session and model.",how:"Agents âº Agent settings âº the Schedules tab."},plugins:{title:"Plugins",description:"Every plugin by category, to regroup or search; a card opens its details.",how:"Sidebar âº Plugins."},models:{title:"Models",description:"The model table by provider: the default model, credentials, prices, context windows and usage.",how:"Sidebar âº Models."},machines:{title:"Machines",description:"This machine and remote ones: install state, connections, probe results, and adding an ssh host.",how:"Sidebar âº Machines (admins only)."},usage:{title:"Cost center",description:"Thirty days of usage: Tokens, cost, requests and success rate, grouped by date, Agent, model or Session, with the error panel.",how:"Sidebar âº Cost center."},benchmark:{title:"Evaluation center",description:"The Benchmark list: published and draft status, case counts, and the score trend across evaluations.",how:"Sidebar âº Evaluation center."},"benchmark-detail":{title:"Benchmark detail",description:"One Benchmark: the score curve, each evaluation's case scores, and the cases' statement and rubric files.",how:"Evaluation center âº any Benchmark."},settings:{title:"Settings",description:"The settings dialog: profile, general, appearance (theme, mode, accent, text size, fonts), account, and the server settings.",how:"The account menu at the bottom of the sidebar âº Settings."},"settings-appearance":{title:"Appearance settings",description:"The settings dialog on its Appearance page: theme, mode, accent, the five text sizes and the font pairing â where theme switching lives.",how:"The account menu at the bottom of the sidebar âº Settings âº Appearance."},login:{title:"Login",description:"The sign-in page: the login card over the decorative canvas. Any password signs the demo account in.",how:"Any address while signed out."}},home:{eyebrow:"Surface gallery",title:"Penguin UI",lead:"The real Web App, running in three themes, two modes, five text sizes, the font pairings and two languages â on an in-browser demo API, fully clickable.",app:"The app",appLead:"This is the app itself: the sidebar, every center, the chat and the settings all open. The theme and size controls drive the app in the frame; sending a message streams a scripted reply.",index:"Surface index",indexLead:"One page per surface: the app opened on it, under whatever theme, size and fonts you set.",library:"Component library",libraryLead:"The real Web components, one page per kind, rendered under the theme, mode, size and fonts you set â and interactive.",fonts:"Fonts",fontsLead:"Each theme's default faces, the current choice, specimens and licences."},rail:{theme:"Theme",themeNames:{github:"Primer",modern:"Frost",geek:"Console"},accent:"Accent",accentTheme:"Theme's own",size:"Size",sizeNames:{xs:"XS",s:"S",m:"M",l:"L",xl:"XL"},sizeTitle:(e,t)=>`${e} Â· ${t}px root`,fontLatin:"Latin font",fontCjk:"CJK font",fontTheme:"Theme default",fontSystem:"System",viewport:"Viewport",viewports:{desktop:"Desktop",phone:"Phone"},langNames:{en:"EN",zh:"ä¸­æ"}},readout:{label:"Fonts in use",latin:"Latin",cjk:"CJK",mono:"Mono",system:"System",pending:"Readingâ¦"},crumb:{modes:{light:"light",dark:"dark"},phone:"phone"},intro:{resolving:"Resolving tokensâ¦"},frame:{open:"Open standalone",reload:"Reload",frameOf:e=>`The app in ${e}`,how:"Where it is in the app",route:"Route",signedOut:"signed out"},section:{copyLink:"Copy link",copyBreadcrumb:"Copy breadcrumb",unset:"unset"},foundations:{surfaces:"Surfaces",inks:"Inks",lines:"Lines",inkWords:["Text","Muted","Subtle"],accent:"Accent",presetsHint:"The theme's own accent and the five presets this theme lists; another theme's presets paint nothing here",themeAccent:"theme",sampleSend:"Send",selectedRow:"Selected",sampleLink:"Open the docs",linkHover:"hover",tones:"Tones",toneWords:{success:"Running",attention:"Waiting",danger:"Failed",done:"Done",neutral:"Idle",info:"Syncing"},charts:"Chart series",tokenSeries:"Token mix",code:"Code and diff",codeLines:{before:"const hits = rank(q).slice(0, ",removed:"3",added:"6",after:");",selected:"return cite(hits);"},typeNote:"Each row is set in its own role's tokens; the Chinese column shows how the theme's faces set Chinese with Latin runs in it.",scene:{pageTier:"page",cardTitle:"Docs Expert",cardMeta:"3 sessions Â· $0.0231",nested:"Inner radius = outer radius â padding",primary:"Save",secondary:"Cancel",input:"Search sessions",badge:"Running",menuTier:"z-[60] menu",menuItems:["Pin","Rename","Move toâ¦"],backdropTier:"z-50 dialog",dialogTitle:"Delete this session?",dialogBody:"Its transcript and Trace files are deleted with it.",cancel:"Cancel",confirm:"Delete",toastTier:"z-[100] toast",toast:"Exported Trace #001"},radius:"Radius",shadows:"Shadow levels",spacingPage:{title:"Settings",appearance:"Appearance",theme:"Theme",themeOptions:["Light","Dark","System"],fontSize:"Text size",sizeOptions:["XS","S","M","L","XL"],general:"General",language:"Language",languageOptions:["ä¸­æ","English"],notifications:"Notify when done"},stack0Note:"stack-0: the narrow bars between a glyph and its label",controlHeights:"Control heights, measured",iconSizes:"Icon sizes",iconRegistry:(e,t)=>`${e} icons from ${t} files`,duplicateNames:"One path, several names",iconMarks:"Marks drawn as components",durations:"Durations Ã easings",reducedNote:"Reduced motion: every change shows its end state at once.",liveSignal:"Live signals",loading:"Loading",focusRing:"Focus ring",inputFocus:"Input focus",selection:"Selection",scrollbar:"Scrollbar",spaceUnit:"Space unit",spaceUnitNote:"Every spacing and size utility is a multiple of it: h-8 is eight units.",shell:"Shell",shellNote:"The app window through .ui-shell: the field, the navigation column and the main column, related as each theme decides.",presence:"Presence",presenceNote:"A menu from the top, a dialog from the centre, a toast from the bottom â each on the active theme's enter and exit tokens.",reveal:"Reveal",revealNote:"New rows appear inside a settled list; each moves once, on the reveal tokens, as it appears.",layout:"Layout",layoutNote:"The sidebar's width between expanded and rail, on the layout tokens.",replay:"Replay",replayAll:"Replay all",motionSpecimens:{menu:"Menu",dialog:"Dialog",toast:"Toast",trigger:"More",sidebarRows:["New chat","Agents","Models"],revealRows:[{name:"read_file",detail:"package.json"},{name:"grep",detail:"useStreamReveal"},{name:"exec_command",detail:"Run the tests"},{name:"apply_patch",detail:"src/app.ts"},{name:"exec_command",detail:"Check formatting"}]},hookJobs:{"ui-glass":"a frosted surface: a transient layer over content, and Frost's plugin and skill tiles","ui-eyebrow":"a group label naming the items below it","ui-display":"the one display title of a page or hero","ui-live":"motion for something running right now","ui-frame":"a ruled box with a head, a body, a foot and panes","ui-underline-nav":"the selected-tab marker of a tab bar","ui-shell":"the app window: a navigation column beside a main column","ui-icon-decor":"an icon its label already says: a theme may tint it or drop it","ui-tree":"a list whose rows nest: a file tree, a work group's tool rows, the subagent graph","ui-field":"a labelled control row: a form field or a settings row","ui-activity":"a thinking or tool row at work: running, done or in error","ui-notice":"a notice strip or toast, coloured by its tone: info, success, warning, danger or neutral","ui-chart":"a chart: its grid, axes, lines, areas, bars and points","ui-widget":"a reading in a reply taken in at a glance: weather, a clock, a countdown, metrics","ui-scrim":"the dimmed layer behind a dialog, drawer or sheet","ui-stream":"text that is still streaming (a reply, thinking, a summary, a tool's output): each theme decides how new text appears","ui-glyph":"an icon each theme draws its own way: line (Primer), duotone line (Frost) or pixel art (Console)"},hookSamples:{menu:["Pin","Rename","Delete"],group:"Workspaces",rows:["claude-code-expert","docs-sync","release-notes"],copy:"Copy",tabs:["Overview","Traces","Files"],streaming:"Writing the answer",tree:{root:"claude-code-expert",dir:"src",files:["rag.ts","embed.ts"],last:"README.md"},field:{name:"Name",value:"Docs Expert",hint:"Shown in the sidebar and in messages.",notify:"Notify when done",notifyHint:"A system notification when a Task ends."}}},fonts:{title:"Fonts",pages:{defaults:"Defaults",specimens:"Specimens",licences:"Licences"},defaultsTitle:"Default faces",defaultsHint:"Each theme's default face per role: Latin (reading and interface), CJK and mono. âSystemâ leaves the role to the platform.",system:"System",current:"Current choice",currentHint:"The pairing picked in View settings; âtheme defaultâ is the active theme's row above. What actually renders is on the next line.",followsTheme:e=>`Theme default (${e})`,specimensTitle:"Specimens",licencesTitle:"Licences",specimens:"Specimens",specimensHint:"Each theme's families, one en and one zh paragraph at the five text sizes (14 / 15 / 16 / 18 / 20 px).",declared:"Declared faces",declaredHint:"The @font-face rules in the page's stylesheets, merged by family, weight and style; a browser downloads a slice only when text uses it.",noFaces:"No faces declared.",family:"Family",weight:"Weight",slicesColumn:"Slices",loadStatus:"Loaded",licences:"Licence texts",noLicences:"No licence texts yet.",status:{loaded:"loaded",unloaded:"unused",loading:"loading",error:"failed"}},library:{title:"Component library",groups:{components:"Components",foundations:"Foundations"},topics:{buttons:{title:"Buttons",description:"Five variants, five sizes and the icon button; disabled and loading; links and keyboard hints."},inputs:{title:"Inputs and forms",description:"Input, textarea, password, search, checkbox and radio on the field scaffolding: label, hint, info and error."},pickers:{title:"Pickers",description:"Select, segmented control, switch and toggle rows, swatches, option menu, dropdown and menu rows."},toasts:{title:"Toasts",description:"The notice after an action completes: success, info, attention and error, fired from buttons."},notices:{title:"Notice strips",description:"A notice that owns a row: every tone, with and without actions; the three notice variants built on it, and the page to-do."},dialogs:{title:"Dialogs",description:"Modal, confirmation, paged dialog, drawer, bottom sheet, lightbox and command palette."},tooltips:{title:"Tooltips",description:"Hints on hover and focus: the data-tooltip attribute and the Tooltip component."},tabs:{title:"Tabs",description:"The underline tab switcher, with an update badge."},badges:{title:"Badges and status",description:"Badges and counts, state dots, run-state icons, session activity marks, the update dot, and the stat tile and chip."},empty:{title:"Empty states",description:"The placeholder for a list or detail with nothing in it, with an action."},loading:{title:"Loading",description:"The spinner, the skeletons and the progress bar."},streaming:{title:"Streaming",description:"How an assistant reply reveals as it streams in: Primer shows it at once, Frost fades it in word by word, Console types it out."},charts:{title:"Charts",description:"The chart foundation: the primitives every chart draws through, the current theme's chart tokens, and every chart built on them â the donut, the ring gauge, the legend, cost trend and token bars, requests and success rate, the sparkline, the Trace timeline."},avatars:{title:"Avatars",description:"The user and agent avatars at their sizes, and a stack of them."},site:{title:"Public site",description:"What the landing page and the docs share: the footer, the code card and copy button, pills, an article's contents, the docs sidebar, search, the external-link confirmation and article prose."},files:{title:"Files",description:"The file tree and the read-only file browser; the Files panel's tree and preview panes with the draggable split between them, the path strip, the file menu, the editor and the drop feedback."},content:{title:"Content",description:"Headings and text roles, inline code, Markdown prose, code blocks and surfaces, the diff viewer, and A2UI blocks."},layout:{title:"Layout",description:"The page frame and header, cards and their headers, ruled and collapsible sections, the entity header and the navigation list."},data:{title:"Data",description:"Tables, list rows, label/value pairs and the log view."},machines:{title:"Machines",description:"The Machines page's parts: the status pill in every state, the machine card and its list, the dialog toolbar and the add dialog."},colour:{title:"Colour",description:"Surfaces, inks, lines, the accent, the tones, chart series and code colours."},type:{title:"Typography",description:"Size, line height and weight per role."},shape:{title:"Shape",description:"Radii, the shadow tiers and nesting."},density:{title:"Density",description:"The space unit and the control heights."},focus:{title:"Focus",description:"Focus ring, input focus, selection and scrollbars."},motion:{title:"Motion",description:"Presence, reveal, layout, durations and easing."},icons:{title:"Icons",description:"Icon sizes and the Web App's icon registry."},hooks:{title:"Hooks",description:"The structural hooks a theme may redraw, one by one."}},buttons:{variants:"Variants",primary:"Save",secondary:"Cancel",danger:"Delete",ghost:"More",link:"View details",sizes:"Sizes",md:"Default size",sm:"Small",xs:"Extra small",leading:"New",icon:"Icon button",iconHint:"The label is required: it is both the accessible name and the tooltip.",add:"Add",edit:"Edit",states:"States",disabled:"Disabled",busy:"Savingâ¦",links:"Links",linksHint:"A link in a sentence is always underlined; a standalone one shows the underline on hover. An external link opens in a new tab and carries the external mark.",inlineBefore:"See the ",inlineLink:"release notes",inlineAfter:" for what changed.",external:"All releases",keys:"Keyboard hints",shortcuts:[["Ctrl","K"],["Ctrl","`"],["Esc"]]},inputs:{basics:"Inputs",name:"Name",namePlaceholder:"Docs Expert",nameHint:"Shown in the sidebar and in messages.",email:"Email",emailValue:"zheng@example",emailError:"The address is incomplete.",required:"Required",info:"With info",infoText:"Takes effect when the next Task starts.",sizes:"Sizes",base:"Base size",small:"Form size",textarea:"Textarea",textareaPlaceholder:"Write a system promptâ¦",mono:"Monospace",monoValue:`temperature: 0.2
max_tokens: 4096`,password:"Password",passwordHint:"At least 12 characters.",affix:"In-field affixes",affixContext:"Context window",affixToken:"Token",affixPrice:"Output price",affixCurrency:"$",affixUnit:"/M tok",search:"Search boxes",searchField:"Search plugins",searchIcon:"Search sessions",searchPanel:"Filter files",searchMenu:"Search skills",checkboxes:"Checkboxes",checkboxLabel:"Clear the stored key",checkboxHint:"Applied when you save.",checkboxAll:"All plugins",checkboxDisabled:"Locked by the administrator",radios:"Radio groups",radioLabel:"When a name already exists",radioSkip:"Skip it",radioSkipHint:"Keep what is there; nothing is lost.",radioOverwrite:"Overwrite it",radioOverwriteHint:"Replace the files that share a name.",radioReplace:"Replace everything",radioReplaceHint:"Remove what the import does not contain.",radioInline:"On one line"},pickers:{select:"Select",selectLabel:"Model",options:["DeepSeek V4.1 Flash","Claude Sonnet 4.5","GLM-5.3"],segmented:"Segmented",segments:["Light","Dark","System"],switches:"Switch",switchLabel:"Notify when done",switchHint:"A system notification when a Task ends.",switchOff:"Short tool names",toggleRows:"Toggle rows",toggleRowLabel:"Show the launcher",toggleRowInfo:"The round button in the workbench corner that fans out the terminal, files and preview.",togglePlainLabel:"Use the proxy for the app's requests",togglePlainHint:"Takes effect once saved.",toggleCardLabel:"Enable memory",swatches:"Swatches",optionMenu:"Option menu",optionLabel:"Permission",choices:[{value:"r",trigger:"r",label:"Read only",description:"Can only read the workspace."},{value:"rw",trigger:"rw",label:"Read and write",description:"May change files in the workspace."},{value:"ask",trigger:"ask",label:"Ask each time",description:"Asks before every write."}],dropdown:"Dropdown",menu:"More actions",menuPin:"Pin",menuRename:"Rename",menuMove:"Move toâ¦",menuDelete:"Delete",menuRows:"Menu rows",menuRowsHint:"Two densities: the account and project menus on the body size, a row's more and context menus on the small size.",menuSettings:"Settings",menuAppInfo:"About",menuVersion:"v0.2.13",menuSignOut:"Sign out",menuGroupBy:"Group by",menuByWorkspace:"By Workspace",menuByAgent:"By agent",menuSortBy:"Sort by",menuRecent:"Recently active",menuManual:"Manual order"},toasts:{fire:"Fire a toast",hint:"A toast appears at the top of the page and leaves after a few seconds; an error or an advisory stays longer.",success:"Success",info:"Info",attention:"Attention",error:"Error",successText:"Saved.",infoText:"The index is rebuilding in the background.",attentionText:"Saved, but 2 fields were truncated.",errorText:"Connection failed: api.example is unreachable."},notices:{plain:"Every tone",dotted:"With a leading mark",withActions:"With actions",texts:{info:"Version 0.3.0 is available.",success:"Index rebuilt: 214 files.",attention:"1 unexpected error.",danger:"The model returned 401: invalid key.",neutral:"This session is archived."},action:"View",dismiss:"Dismiss",variants:"Four variants",variantNames:{strip:"Strip: across a panel",callout:"Callout: a block of its own",inline:"Inline: inside the content",banner:"Banner: across a column, one centred line, the cross at the far edge"},bannerText:"This account still uses its initial password. Change it soon.",bannerAction:"Change it now",closable:"Closable notices",reopen:"Show again",closableHint:"The cross is flat and takes the notice's own ink; remembering a close across pages is the caller's.",closableText:"Model keys from this server's environment cannot be synced to this machine. Configure the model keys there by hand first.",retry:"Retry",calloutTitle:"The template has no memory placeholder",calloutBody:"Insert the placeholder into the prompt template to inject memory.",todo:"Page to-do",todoText:"3 skills can be updated",todoAction:"Update all",todoDismiss:"Mark as read"},dialogs:{modal:"Modal",openModal:"Open a dialog",modalTitle:"Rename session",modalBody:"The new name shows in the sidebar and in messages.",save:"Save",cancel:"Cancel",confirm:"Confirmation",openConfirm:"Delete sessionâ¦",confirmTitle:"Delete this session?",confirmBody:"The transcript and the Trace files go with it; this cannot be undone.",confirmLabel:"Delete",openSaveConfirm:"Save changesâ¦",saveConfirmTitle:"Save these changes?",saveConfirmBody:"The agent uses the new settings from its next task.",paged:"Paged dialog",openPaged:"Open settings",pagedTitle:"Settings",pagedGroups:{app:"App",you:"Account"},pages:{general:"General",appearance:"Appearance",account:"Profile"},pageBody:"The current page's settings go here.",appearanceInfo:"Theme, accent and density apply to this browser only.",drawer:"Drawer",openDrawer:"Open a drawer",drawerTitle:"Navigation",drawerBody:"The sidebar at phone width slides in from the edge.",sheet:"Bottom sheet",openSheet:"Open a sheet",sheetTitle:"Files",sheetBody:"Drag up for the full screen, down to close.",lightbox:"Lightbox",lightboxHint:"Click the thumbnail to zoom in; Esc or a click outside the image closes it.",lightboxAlt:"The Penguin logo",palette:"Command palette",paletteAside:"Type to filter; each action opens another dialog on this board.",openPalette:"Open the command palette",palettePlaceholder:"Type to filter commandsâ¦",paletteEmpty:"No matching commands",paletteHint:"ââ to select Â· Enter to run Â· Esc to close"},tooltips:{attribute:"The data-tooltip attribute",attributeHint:"Any element takes the attribute; an icon-only button carries an aria-label too.",component:"The Tooltip component",componentHint:"For a trigger that needs the wrapper: beside it, or below it.",truncated:"Truncated text",truncatedHint:"A command or title the row cannot fit goes whole into the hint.",edit:"Edit",copy:"Copy",settings:"Settings",besideTip:"Opens to the right of its trigger",belowTip:"Opens under its trigger",command:"pnpm --filter @prismshadow/penguin-web exec vitest run test/session-activity.test.ts --reporter verbose"},tabs:{basic:"Tab switcher",badged:"With an update badge",items:["Overview","Trace","Files","Settings"],badgeText:"3 skills can be updated",body:e=>`The â${e}â tab's content.`},badges:{pills:"Label pills",pillsHint:"One shape — the same height, padding, radius, type and border — only the tone changes with the meaning; words only, no glyph.",pillRow:{thisServer:"this server",running:"Running",update:"Update needed",caption:"A card's title row: tag, state and update pill in one shape"},badges:"Badges",tones:{neutral:"default",success:"running",attention:"aborted",danger:"failed",done:"done",info:"free"},variants:{soft:"Soft",outline:"Outline",solid:"Solid"},count:"Count",dots:"State dots",dotsHint:"Six tones; only what is live pulses",live:"Live",status:"Run state",states:{running:"Running",waiting:"Waiting for approval",done:"Done",failed:"Failed",stopped:"Stopped"},activity:"Session activity",activities:{running:"Running",compacting:"Compacting",completedUnread:"Unread reply"},marks:"Other marks",background:"Background tasks",schedule:"Scheduled",dot:"Update dot",dotAnchor:"Plugins",pill:"Update pill",pillText:"3 updates",statTile:"Stat tiles",spend:"Spend this month",spendDetail:"Organization budget $40",alerts:"Alerts",alertsDetail:"1 over budget, 1 paused",statChip:"Stat chips",input:"Input",output:"Output",elapsed:"Elapsed"},empty:{page:"Page empty state",title:"No sessions yet",description:"Sessions appear here once you send a first message.",action:"New chat",settings:"Settings empty state",settingsText:"No MCP servers added yet."},loading:{spinner:"Spinner",sizes:"Three sizes",skeleton:"Skeletons",list:"List",card:"Card",progress:"Progress bar",progressHint:"Three heights; still while indeterminate",progressLabel:"Download progress",progressOver:"Over the limit",progressIndeterminate:"Indeterminate"},streaming:{reply:"Assistant reply",output:"Tool output",receiving:"Receivingâ¦",received:"All received",modes:{instant:"shows text the moment it arrives, with no motion",fade:"fades in word by word, the newest line and a half rising out of a soft veil",typewriter:"types out character by character behind a solid block caret"},unset:"treated as instant",rate:e=>`about ${Math.round(e)} characters a second`,reduced:"reduced motion is on, so the reply shows as it arrives"},charts:{parts:{primitives:"Primitives",primitivesHint:"Every chart draws its marks through these alone: they read the theme's chart tokens and write data-part, the one place a token becomes SVG or HTML.",tokens:"The current theme's chart tokens",tokensHint:"Read from this frame root's computed style; read again after a theme, mode or accent change.",charts:"Charts built on them",chartsHint:"Every chart kind in the app, on demo data."},primitives:{bar:"ChartBar",barHint:"Its width from bar-fill; top radius, outline and fill opacity each from a token.",line:"ChartLine",lineHint:"One set of points drawn once per curve; the stroke width from a token.",curves:{linear:"linear",smooth:"smooth",step:"step"},area:"ChartArea",areaHint:"The fill under a line, its opacity from a token.",point:"ChartPoint",pointHint:"Radius from a token; the theme decides round or square.",arc:"ChartArc",arcHint:"One arc of a ring: the track is a grid part, each segment a Token kind or a slot.",grid:"ChartGrid and ChartAxis",gridHint:"Grid and axis inks from tokens; the theme decides solid or dashed.",timeline:"TimelineBar",timelineHint:"The Trace timeline's HTML bar, each of the five kinds on its slot.",kinds:{thinking:"thinking",text:"reply",tool_call:"tool call",approval:"approval wait",tool:"tool run"}},palette:"Palette",geometry:"Geometry",tokenMeaning:{"--ui-chart-1":"slot 1 Â· violet","--ui-chart-2":"slot 2 Â· amber","--ui-chart-3":"slot 3 Â· sky","--ui-chart-4":"slot 4 Â· rose","--ui-chart-5":"slot 5 Â· emerald","--ui-chart-6":"slot 6 Â· fuchsia","--ui-chart-7":"slot 7 Â· spare","--ui-chart-8":"slot 8 Â· spare","--ui-chart-ref":"reference line","--ui-chart-cache-read":"cache read","--ui-chart-cache-write":"cache write","--ui-chart-output":"output","--ui-chart-grid":"grid","--ui-chart-axis":"axis","--ui-chart-bar-fill":"share of its band a bar fills (0â1)","--ui-chart-bar-radius":"bar top radius","--ui-chart-bar-stroke":"bar outline width","--ui-chart-bar-stroke-color":"bar outline colour (series = the series colour)","--ui-chart-bar-opacity":"bar fill opacity (0â1)","--ui-chart-line-width":"line width","--ui-chart-point-radius":"data point radius","--ui-chart-curve":"curve (linear / smooth / step)","--ui-chart-area-opacity":"area fill opacity (0â1)"},donut:"Token donut",donutHint:"Cache reads, cache writes and output; the ring's remainder warns as usage nears the limit.",donutLabels:{usage:"Context usage",cacheRead:"Cache read",cacheWrite:"Cache write",output:"Output"},ring:"Ring gauge",ringHint:"One arc against a budget in the budget's tone (under, near, over); without a budget the track stands alone; several arcs split a whole into shares. The composer's context ring (ContextRing) stays in the muted ink to 80 %, turns to attention past it and to danger past 95 %.",ringSpend:e=>`Spend at ${e}% of the budget`,ringNoBudget:"No budget set",ringShares:"Shares of a whole",ringContext:"Context ring",ringContextAt:e=>`Context ${e}% full`,legend:"Legend",legendHint:"A row under a chart: pointing at one item fades the others, and an item that explains a line's shape stays out of it. A list legend prints each item's figures after its label and pins a row on click.",legendHitRate:"Cache hit rate",legendParts:["System prompt","Tool definitions","Messages","Tool results"],trend:"Cost trend",trendHint:"Fourteen days of cost as a line; hover a day.",tokens:"Token usage",tokensHint:"Daily tokens stacked by kind, with the cache-hit-rate curve over them; hover a legend entry to highlight one.",requests:"Requests and success rate",requestsHint:"Daily requests stacked by agent, each with its success-rate line.",agents:["docs-expert","release-notes"],activity:"Activity sparkline",activityHint:"The agent card's fourteen-day session count curve; relative ups and downs only.",sparkline:"Score sparkline",sparklineHint:"One benchmark's scores over its runs, the newest marked; a single score is a lone point.",timeline:"Trace timeline",timelineHint:"One Task's model segments and tool calls: thinking, reply, tool-call generation, approval wait and execution, each in its lane."},avatars:{user:"User avatar",agent:"Agent avatar",stack:"Avatar stack",stackShown:(e,t)=>`${e} of ${t} shown`,userNames:["admin","Demo admin"],agents:[{id:"docs-expert",name:"Docs Expert"},{id:"release-notes",name:"Release Notes"},{id:"qa",name:"QA"}]},site:{footer:"Footer",footerHint:"The landing page's brand and link columns; the docs' single line of copyright and links.",tagline:"Unified and Stable RSI Framework.",columns:[{title:"Product",links:["Cases","Quick start","Blog","Download"]},{title:"Resources",links:["GitHub repository","Docs","Gallery"]}],lineLinks:["Home","GitHub repository","Apache-2.0 License"],copyright:"© 2026 Prism Shadow · Open source under Apache-2.0",code:"Code and copy",codeHint:"A command card carries a copy button; once the text is on the clipboard its icon turns to a check, the label stays, and a screen reader hears Copied.",copy:"Copy",copiedAnnouncement:"Copied",copyMarkdown:"Copy Markdown",copyLink:"Copy page link",pills:"Pills",pillsHint:"A blog post's category and pinned mark: the tone names a kind, not a state.",pillTones:{brand:"Product news","brand-outline":"Practice",teal:"Perspectives",neutral:"Release notes"},article:"Article",articleHint:"The prose blog posts and doc pages share. Headings carry anchors, fenced code is highlighted, and tab groups and callouts are the docs' Markdown extensions; its contents sit on the right.",articleBody:`## Install

One command in a terminal installs it:

\`\`\`bash
curl -fsSL https://penguin.ooo/install.sh | sh
\`\`\`

### By platform

\`\`\`bash tab="Linux / macOS"
curl -fsSL https://penguin.ooo/install.sh | sh
\`\`\`

\`\`\`powershell tab="Windows"
irm https://penguin.ooo/install.ps1 | iex
\`\`\`

> [!INFO]- Blocked on first launch
>
> Allow it in the system settings.

## Next steps

- Run \`penguin web\` to open the Web App
- Back to [Install](#install)

| Command | What it does |
| --- | --- |
| \`penguin\` | Chat in the terminal |
| \`penguin web\` | Start the Web App |`,toc:"On this page",sidebar:"Docs sidebar",sidebarHint:"Pages by section, sub-pages indented under their parent, the current page in the brand colour; search at the top.",sidebarSections:[{title:"Get started",pages:["Introduction","Quickstart","Key concepts"],children:["Desktop app","CLI and Web App"]},{title:"Guides",pages:["Web App","Chat"],children:[]}],search:"Search",searchHint:"Ctrl/⌘ K or the sidebar's button opens it; arrow keys choose, Enter opens.",searchLabels:{open:"Search docs",label:"Search docs",placeholder:"Search titles, sections and text",start:"Type to search every page in this language",noResults:"No matching pages",noResultsHint:"Try a shorter or different word",results:"Search results",close:"Close search",keyboardHint:"Use the arrow keys to select, then press Enter to open"},searchResults:[{title:"Install the CLI",context:"CLI and Web App",snippet:"Run the installer for your platform; it bundles its own Node.js runtime."},{title:"Offline install",context:"CLI and Web App",snippet:"Download your platform's bundle, extract it and run the installer inside."},{title:"Install the SDK",context:"SDK",snippet:"In your project directory: npm install @prismshadow/penguin-core."}],leave:"External link",leaveHint:"A link that leaves the site asks first, with the full address in the dialog.",leaveLink:"GitHub repository",leaveLabels:{title:"You're about to open an external link",body:"This link goes to a site outside PenguinHarness and opens in a new tab:",cancel:"Cancel",open:"Open link"}},files:{tree:"File tree",treeLabel:"Workspace",browser:"File browser",header:"docs-expert",emptyPreview:"Pick a file on the left to preview it.",emptyDir:"Empty directory",root:".",readme:"# Docs Expert\n\nBuilds a BM25 index over `corpus/` and answers questions about the Claude Code docs.\n\n- `src/rag.ts` â retrieval\n- `test/` â cases",truncated:"File too large; preview truncated, download for the full file",unsupported:"Preview not supported for this type; download instead",download:"Download",panel:"Files panel",panelHint:"The tree beside the preview: the draggable split, the path strip and the actions over the preview",search:"Search files",treeWidth:"Resize the file tree",selectFile:"Select a file to preview",wrap:"Wrap lines",crumbs:"Path strip",crumbsHint:"When the path does not fit, its leading parts fold into one ââ¦â; the file name gives way last",menu:"File menu",menuFile:"File",menuFolder:"Folder",copyPath:"Copy relative path",addToChat:"Add to conversation",addSelection:"Add selection to conversation",uploadHere:"Upload here",rename:"Rename or move",delete:"Delete",newTextFile:"New text file",newFolder:"New folder",editor:"Editor",editorLabel:e=>`Editing ${e}`,drop:"Drop feedback",dropAttach:"Drop files to attach",dropAttachHint:"Images and files are added to the message draft",dropUpload:e=>`Drop to upload into ${e}`},content:{headings:"Headings",headingsHint:"Each level takes the theme's rung; the display title is for a page's h1 only.",display:"Page display title",heading:e=>`Heading ${e}`,text:"Text roles",samples:{body:"Body: the size of messages, notes and settings.",small:"Small: secondary information and metadata.",caption:"Caption: a note under a chart or a control.",eyebrow:"Group label",mono:"sess_7f3a Â· ~/work/penguin",label:"Field label"},inline:{before:"Run ",code:"pnpm install",after:" to install the dependencies."},prose:"Markdown prose",proseSample:`## Release checks

Confirm **three things** before you release, then run \`pnpm -r build\`. See the [release notes](https://penguin.ooo).

- Type checks pass
- Every test passes
- The changelog is written

> When a data root is taken, use another one — never end someone else's process.

| Check | Command |
| --- | --- |
| Types | \`pnpm typecheck\` |
| Tests | \`pnpm test\` |

\`\`\`bash
pnpm -r build && pnpm test
\`\`\`

The cache hit rate is \\(r = h / (h + m)\\).`,reader:"Markdown reader",readerHint:"The reader the plugin README, the file browser and the handbook share: two or more headings add an outline (a rail when there is room, behind a button in the title row when not), and the find button in the host's title row, or Mod+F while the reader has the focus, searches the rendered text.",readerNarrow:"Narrow: the outline folds behind its title-row button",readerSample:["# Release process","","This page walks a release from preparation to announcement. Each trigger reads the index first, then this page when it needs it.","","## Before the release","","The release branch is cut from `main` as `release/<version>`. Before cutting it, confirm three things:","","- Type checks and tests pass: `pnpm typecheck && pnpm test`","- Every entry in `changelog/unreleased/` has its English and Chinese pair","- No breaking change is waiting to merge","","### Version numbers","","Versions follow semantic versioning. A number that was ever tagged is never reused: a failed release burns its number and the next one is used.","","### Dependencies","","The lockfile changes only in a commit of its own, whose message names the packages upgraded and why.","","## Build and signing","","| Platform | Artifact | Signing |","| --- | --- | --- |","| macOS | `.dmg` | Notarized before release |","| Windows | `.exe` | Code-signing certificate |","| Linux | `.tar.gz` | With checksums |","","Builds run on CI; locally, only a smoke check:","","```bash","pnpm -r build","node packages/cli/dist/index.js --version","```","","## Announcement","","### Release notes","","`changelog/<version>/RELEASE.md` becomes the GitHub Release body as written, and must be committed before the tag — the release workflow reads it from the tag's checkout.","","### Blog","","The blog post and its screenshots are prepared with the release; screenshots use the Frost theme, light mode, default text size.","","## Rolling back","","When a serious problem turns up, pin a note under the release announcement first, then ship a patch release. A published tag is never moved or deleted.","","## FAQ","","### The installer cannot find the new version","","Mirrors sync with a delay, usually within ten minutes; if a mirror is still behind after an hour, @ the on-call in the ops channel.","","### Signing failed","","Check whether the certificate expired first; when macOS notarization fails, read the first error in the notarization log — the rest usually follow from it.",""].join(`
`),compact:"Compact: a channel message",compactSample:"Merged **#897** â `feat/ui-w2` can go.",code:"Code",surface:"Code surface: line numbers, no frame",diff:"Diff",unified:"Unified",split:"Side by side",patch:"From a patch",diffLabel:"Changes to src/config.ts",patchLabel:"Changes to src/limits.ts",a2ui:"A2UI blocks",a2uiHint:"Components a model writes into its reply: weather, clock, countdown and metrics widgets, then a choice, a form, steps, a callout and a Mermaid diagram. The widgets are snapshots the model supplies; only the clock and the countdown move. A pick or a submit here shows, as a toast, the text the app would put in the composer.",a2uiReply:[{lead:"Here is the weather in Beijing right now:",spec:{type:"weather",place:"Beijing",condition:"partly-cloudy",temp:18,unit:"C",summary:"Clouding over by evening, light rain likely tonight",high:22,low:12,feelsLike:17,humidity:62,windSpeed:12,windDirection:"NE",hourly:[{time:"14:00",temp:18,condition:"partly-cloudy",precip:10},{time:"15:00",temp:19,condition:"partly-cloudy",precip:10},{time:"16:00",temp:19,condition:"cloudy",precip:20},{time:"17:00",temp:18,condition:"cloudy",precip:30},{time:"18:00",temp:16,condition:"cloudy",precip:40,night:!0},{time:"19:00",temp:15,condition:"drizzle",precip:60,night:!0}],daily:[{date:"2026-10-04",high:22,low:12,condition:"partly-cloudy",precip:20},{date:"2026-10-05",high:19,low:11,condition:"rain",precip:80},{date:"2026-10-06",high:17,low:9,condition:"cloudy",precip:30},{date:"2026-10-07",high:20,low:10,condition:"clear",precip:0},{date:"2026-10-08",high:23,low:11,condition:"wind",precip:10}],asOf:"2026-10-04T14:05+08:00",source:"Open-Meteo"}},{lead:"The time now where the team works:",spec:{type:"clock",title:"Team time zones",zones:[{zone:"local"},{zone:"America/New_York",label:"New York"},{zone:"Europe/London",label:"London"}],style:"both"}},{lead:"Time left until the New Year:",spec:{type:"countdown",to:"2026-12-31T23:59:59+08:00",label:"New Year",doneLabel:"Happy New Year"}},{lead:"The service status, as just read:",spec:{type:"metrics",title:"Service status",items:[{label:"CPU",value:37,max:100,unit:"%",gauge:"ring",warn:80,danger:95,history:[22,31,28,45,52,41,37]},{label:"Memory",kind:"used",value:15.3,max:16,unit:"GB",decimals:1,gauge:"bar",warn:13.6,danger:15.2,delta:.4,deltaLabel:"vs. yesterday"},{label:"API quota",kind:"remaining",value:1240,max:5e3,warn:1e3,danger:250,detail:"resets in 3 days"},{label:"Monthly budget",kind:"remaining",value:180,max:1e3,prefix:"Â¥",warn:300,danger:100},{label:"Upload",kind:"progress",value:63,max:100,unit:"%"}],asOf:"2026-10-04T14:05+08:00"}},{lead:"Pick the database first.",spec:{type:"choice",question:"Which database should the service use?",options:[{label:"PostgreSQL",description:"Relational; the team already runs it",recommended:!0},{label:"SQLite",description:"One file beside the service"},{label:"MongoDB",description:"Documents; the schema can change at any time"}],allowOther:!0}},{lead:"The change passed every check.",spec:{type:"choice",question:"Merge it now?",options:[{label:"Merge now",recommended:!0},{label:"After review"},{label:"Not yet"}]}},{lead:"Pick the checks to run before the release:",spec:{type:"choice",question:"Which checks should run before the release?",multiple:!0,options:[{label:"Type check",description:"A few seconds; catches most slips",recommended:!0},{label:"Unit tests",description:"About two minutes"},{label:"End-to-end tests",description:"About fifteen minutes; needs a browser"}]}},{lead:"Give the deployment details in one go:",spec:{type:"form",title:"Deployment",fields:[{id:"region",label:"Region",kind:"single",options:[{label:"eu-west"},{label:"us-east"},{label:"ap-south"}],required:!0},{id:"addons",label:"Add-ons",kind:"multiple",options:[{label:"CDN"},{label:"WAF"}]},{id:"replicas",label:"Replicas",kind:"number",min:1,max:10,step:1,unit:"pods"},{id:"notes",label:"Notes",kind:"text",placeholder:"Anything else"}],submitLabel:"Fill in answers"}},{lead:"Rotate the key in three steps:",spec:{type:"steps",title:"Rotate the API key",steps:[{text:"Open Settings âº Keys."},{text:"Create a new key and copy it.",note:"The new key works at once."},{text:"Delete the old key.",warning:"A deleted key cannot be restored.",caution:"Jobs that still use the old key fail until they restart.",code:"curl -X DELETE https://api.example.com/keys/old",lang:"bash"}]}},{lead:"One more thing:",spec:{type:"callout",tone:"tip",text:"Run `pnpm test` before you push."}},{lead:"Before you start:",spec:{type:"callout",tone:"warning",title:"Stop point",text:"If you have no first numbers within two days, change the plan. This step decides whether the rest is worth the time; stopping early costs less than giving up at the end."}}],a2uiDiagramLead:"A request checks the cache first:",a2uiDiagram:`flowchart LR
  A[Request] --> B{Cached?}
  B -->|yes| C[Serve it]
  B -->|no| D[Fetch from origin]
  D --> C`,a2uiInvalidLead:"A block that cannot be shown gives its reason and its source:"},layout:{page:"Page and header",pageHint:"A page header has one display title and no eyebrow; the way back sits above the title, the actions at the end of its row.",pageTitle:"Agents",pageInfo:"Each agent has its own prompt, tools, skills and memory.",pageDescription:"4 agents in this project.",pageBody:"The page's content starts here.",back:"Back to the list",search:"Search agents",create:"New",cards:"Cards",padded:"Padded: a title row above the content",cardTitle:"Spend this month",cardInfo:"What every agent spent on models this month.",cardAction:"Export",cardValue:"$128.45",cardBody:"12% less than last month.",flush:"Flush: rows run edge to edge under a ruled strip",flushTitle:"Recent sessions",flushDescription:"By their last message.",flushRows:["Draft this week's release notes","Find the skipped scheduled run","Add three cases to the eval set"],ruled:"Ruled section",ruledTitle:"Inbox",ruledInfo:"Tickets waiting on you: to review, or sent back.",ruledAction:"Mark all read",ruledBody:"Three tickets wait for your review.",collapsible:"Collapsible section",collapsibleHint:"The fold is layout motion: the body's grid row goes between 1fr and 0fr, and the theme decides how it moves.",providerName:"OpenAI",modelCount:e=>e===1?"1 model":`${e} models`,addModel:"Add a model",foldedTitle:"Custom",foldedBody:"This group has no models yet.",entity:"Entity header",entityName:"Code reviewer",entityDescription:"Reads every PR's diff and raises only the problems that would cause a bug.",copyId:"Copy id",entityAction:"Open a session",entityTags:["review","read-only"],nav:"Navigation list",navHint:"The current row takes the solid fill and is the current page; a glyph is decoration beside a label that already says it. A dialog's rail scrolls sideways on a phone.",navLabel:"Agent settings",navRail:"A rail: glyph, label and a trailing count; the last row has nowhere to go yet",navDense:"Dense, inside a panel",navRows:{overview:"Overview",models:"Models",schedules:"Schedules",vault:"Vault",billing:"Billing"}},data:{table:"Table",tableHint:"One header style: the small rung, medium weight, muted ink and a rule; a table on its own is framed, its header on the muted surface.",caption:"Schedules",columns:{name:"Name",status:"Status",period:"Period",cost:"Cost",employee:"Employee"},enabled:"Enabled",paused:"Paused",pause:"Pause",enable:"Enable",bare:"A compact table inside a card",spendTitle:"Spend by employee",employees:["Researcher","Writer","Editor"],rows:"List rows",rowsHint:"A row that opens what it names makes its mark and text one button; its actions stay outside it.",skillDescriptions:["Reads PDFs and fills in their forms.","Builds web pages to a design system.","Distils reusable lessons from sessions."],skillMeta:"2 days ago",exportSkill:e=>`Export ${e}`,clickable:"Rows that open what they name",cases:["Form validation on the sign-in page","First commit in an empty repository","Truncating a very long file name"],longRows:"Long text",longRowsHint:"Title and description truncate to one line each and show whole on hover; the date and the actions keep their width, wrap under the text when they no longer fit, and are never clipped by the card.",memoryTitle:"User memory",memoryCount:e=>`${e} items`,memoryDescriptions:["The local proxy listens on 127.0.0.1:9090, but ~/.bashrc returns early in a non-interactive shell, so exec_command never sees http_proxy and the rest of the proxy variables; export the proxy in the command itself or pass --noproxy '*' for local addresses, or curl answers 502 for a local port.",'Inside the PenguinHarness v0.2.15 server process every Gemini model call fails with "Failed to parse URL from [object Request]": the bundled fetch and Request disagree. Upgrading to 0.2.16 fixes it.',"Verify patent numbers and papers with a tool before citing them."],viewMemory:e=>`View ${e}`,editMemory:e=>`Edit ${e}`,deleteMemory:e=>`Delete ${e}`,keyValue:"Label and value",labels:{version:"Version",started:"Started",root:"Data root",machineId:"Machine id"},log:"Log",logHint:"A job still running: its latest line in the body ink.",logLabel:"Update output"},machines:{pills:"Status pills",pillsHint:"Every state is a word in the shape of the this-server tag, its reason on the pill's hover; no glyph, and never an unexplained coloured dot.",states:{serving:"Running",ready:"Running",queued:"Queued",working:"Working",reconnecting:"Reconnecting",failed:"Failed",signInRefused:"Sign-in refused",installedOnly:"Installed",behind:"Update available",notConnected:"Not connected",unreachable:"Unreachable",stopped:"Stopped",notInstalled:"Not installed",unknown:"Not checked"},reasons:{failed:"Failed at Restart the server: no answer on port 7364 within 30 s.",unreachable:"ssh: connect to host 10.0.0.12 port 22: Connection timed out",working:"Downloading penguin-harness 0.2.16â¦",reconnecting:"Attempt 4",behind:"Version 0.2.16 is available"},cards:"Machine cards",cardsHint:"This server first, then one card per state; at most two capsules on the title row, the version among the stats.",card:{thisServer:"this server",undeletable:"This server cannot be deleted",local:"local",checked:"4 min",use:"Use",settings:"Settings",remove:"Delete",sync:"Sync config",update:"Update needed",installing:"Installing the program"},waits:{reconnecting:"Reconnectingâ¦",stopped:"Its server is stopped",notConnected:"Not connected yet",failed:"The last job failed",signInRefused:"That machine refused the saved password â enter it again in the machine's SSH settings.",notInstalled:"Not installed yet",windows:"Installed; start its server by hand on this Windows machine"},loading:"Loading",toolbar:"Dialog toolbar",toolbarHint:"A verb that cannot run now is greyed, and one sentence under the row says why.",toolbarLabel:"Machine actions",held:"This machine cannot be reached right now.",verbs:{update:"Update",stop:"Stop server",restart:"Restart server",configure:"Configure SSH",uninstall:"Uninstall"},add:"Add machine",addHint:"The dialog's body and footer: the tabs, host rows to tick, why the last Add failed, and the box ticked by default.",addIntro:"This server installs PenguinHarness on a machine it can sign in to over ssh, and connects to it.",tabs:{config:"From the ssh config",manual:"Fill in by hand"},search:"Search hosts",elsewhere:e=>`Installed by another Project ${e}`,addError:"The ssh config already has a host named gpu-a100.",installNow:"Install and connect right after adding",cancel:"Cancel",submit:"Add",submitCount:e=>`Add ${e}`,exhaustedCaption:"Nothing left in the ssh config to add",noHosts:"Every host in the ssh config is on this page already."}}},Q=e=>`penguin-gallery.${e}`;function O(){const e={};try{for(const i of q){const a=window.localStorage.getItem(Q(i));a&&(e[i]=a)}}catch{}const t=P(Z,C),n=P(Y,Ae);return He({gallery:e,siteTheme:t,siteLang:n},navigator.language)}function Re(e){try{for(const t of K)window.localStorage.setItem(Q(t),e[t])}catch{}}const X=p.createContext(null);function Tt(){const e=p.useContext(X);if(!e)throw new Error("useGallery() outside <GalleryProvider>");return e}function De(){const[e,t]=p.useState(null);return p.useEffect(()=>{let n=0;const i=()=>{n=0,t({tokens:ve(),accents:ke()})};i();const a=new MutationObserver(()=>{n&&window.clearTimeout(n),n=window.setTimeout(i,150)});return a.observe(document.head,{childList:!0,subtree:!0,characterData:!0}),()=>{a.disconnect(),n&&window.clearTimeout(n)}},[]),e}function xt({children:e,canonicalizeUrl:t=!1}){const n=we(),[i]=p.useState(O),a=p.useMemo(()=>R(n,i),[n,i]),o=be(),s=Le(a.mode,o),l=me(a.theme,a.accent),u=De(),y=p.useCallback(m=>{const H=R(window.location.search,O()),L=typeof m=="function"?m(H):{...H,...m};Re(L),E(D(L))},[]);p.useEffect(()=>{t&&E(D(a))},[t]),p.useLayoutEffect(()=>{const m=document.documentElement;S(m,{themeId:a.theme,dark:s==="dark",accent:ue(a.accent),textSize:a.size,fontLatin:a.latin,fontCjk:a.cjk}),m.lang=a.lang==="zh"?"zh-CN":"en",m.dataset.view=a.view},[a.theme,s,a.size,a.latin,a.cjk,a.accent,a.lang,a.view]);const k=p.useMemo(()=>({state:a,mode:s,accent:l,S:a.lang==="zh"?ze:Ie,tokens:u?.tokens??null,accents:u?.accents??null,update:y}),[a,s,l,u,y]);return r.jsx(X.Provider,{value:k,children:e})}const Pe=["components","foundations"],Oe=["buttons","inputs","pickers","toasts","notices","dialogs","tooltips","tabs","badges","empty","loading","streaming","charts","avatars","site","files","content","layout","data","machines","colour","type","shape","density","focus","motion","icons","hooks"],c=e=>({id:e,group:"components"}),f=e=>({id:e,group:"foundations"}),J=[c("buttons"),c("inputs"),c("pickers"),c("toasts"),c("notices"),c("dialogs"),c("tooltips"),c("tabs"),c("badges"),c("empty"),c("loading"),c("streaming"),c("charts"),c("avatars"),c("site"),c("files"),c("content"),c("layout"),c("data"),c("machines"),f("colour"),f("type"),f("shape"),f("density"),f("focus"),f("motion"),f("icons"),f("hooks")],Ne="buttons",At=Pe.map(e=>({id:e,topics:J.filter(t=>t.group===e)}));function _e(e){return Oe.includes(e)}function St(e){return J.find(t=>t.id===e)}const N={display:"Agents that cite their sources",heading:"Prompt cache hit 81% across 2 turns",paragraph:"PenguinHarness ran the claude-code-expert Session for 1m12s on DeepSeek V4.1 Flash: 43.8k tokens, $0.0231 and 7 tool calls. The BM25 index covers 214 Markdown files, so even a question asked as “如何配置 hooks？” still cites corpus/claude-code-docs/hooks.md [1].",ui:"Running · 6 steps · 34s — read_file …/src/rag.ts (421ms) · edit_file +3 −1 · $0.0110",caption:"Last synced 2026-09-14 14:02 (UTC+8) · 48.2 KB · Trace #001",code:"// A citation must open a real file (引用必须指向真实文件)\nconst hits = rank(question).slice(0, 6).filter((c) => fs.existsSync(c.source));\nconsole.log(`${hits.length} hits in ${(performance.now() - t0).toFixed(1)}ms`); // 6 hits in 12.4ms",numerals:"0123456789 · 1,048,576 tokens · $0.0231 · 71.8s · 99.95% · 3 × 4 = 12 · v0.2.13"},_={display:"会引用来源的智能体",heading:"两轮对话，提示缓存命中率 81%",paragraph:"PenguinHarness 用 DeepSeek V4.1 Flash 运行 claude-code-expert 会话 1 分 12 秒：共 43.8k tokens、$0.0231、7 次工具调用。BM25 索引覆盖 214 个 Markdown 文件，所以即便问 “How do I configure hooks?”，回答也会引用 corpus/claude-code-docs/hooks.md [1]。",ui:"运行中 · 6 步 · 34s — read_file …/src/rag.ts（421ms）· edit_file +3 −1 · $0.0110",caption:"最近同步 2026-09-14 14:02（UTC+8）· 48.2 KB · Trace #001",code:'// 引用必须指向语料库中真实存在的文件\nconst hits = rank("如何配置 hooks？").slice(0, 6).filter((c) => fs.existsSync(c.source));\nconsole.log(`命中 ${hits.length} 条，用时 ${(performance.now() - t0).toFixed(1)}ms`); // 命中 6 条，用时 12.4ms',numerals:"0123456789 · 1,048,576 tokens · ¥0.1617 · 71.8 秒 · 99.95% · 第 2 轮 · v0.2.13"},Ct={en:{...N,short:N.ui},zh:{..._,short:_.ui}},Be=`/**
 * The line-icon registry: every shared glyph as 24x24 path data, drawn by \`GlyphIcon\` in
 * currentColor at the theme's stroke weight.
 *
 * Keys name the drawing, never the use: \`robot\`, not \`agents\`; \`alarmClock\`, not \`schedule\`. A
 * glyph means different things in different places — the chip is the model library in the nav,
 * the eye is watching a run — and the app's own manifests say which drawing stands for which
 * concept (the nav's entries, the stat chips, the grouping options). So a redraw happens here
 * once and every use follows, and two uses that should look alike cannot end up with two
 * drawings of one thing.
 *
 * Each path is one string because \`GlyphIcon\` draws a single \`<path>\`: a figure made of several
 * strokes is several subpaths in the one string. Every glyph is stroked at the family's weight,
 * whatever weight it was first drawn at — the weight belongs to the set, not to the mark.
 *
 * Every line glyph the apps draw is an entry here: a feature file reads \`ICONS\` and never spells
 * out a path of its own (the web app's icon-registry test holds both packages to that), so a
 * theme that redraws the set reaches every surface.
 *
 * The small marks drawn as components are not entries: the form-control caret and the close
 * cross on their own smaller grids, and the menu check, the create plus and the download and
 * upload trays at stroke weights of their own (\`marks.tsx\`); and the rotating collapse chevron
 * (\`chevron.tsx\`). Their geometry depends on the grid and the weight they are drawn at.
 */

/**
 * The eye's almond outline, shared by the two marks drawn from it — the open eye with its pupil
 * and the same eye struck through — so the pair cannot drift into looking unrelated.
 */
const EYE_OUTLINE = "M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z";

/**
 * lucide's shield outline, shared by the three shields drawn on it (alert, half, check) so they
 * read as one family. lucide draws each as several \`<path>\`s; here they are joined into one
 * string, a relative \`m\` rewritten as the same absolute move, since a joined path would
 * otherwise start it from the previous subpath.
 */
const SHIELD_OUTLINE =
  "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z";

export const ICONS = {
  // --- Objects and places -------------------------------------------------------------------

  /**
   * A robot head with an antenna, two ears, two eyes and a smile — lucide's \`bot\` with the mouth
   * added. It is the agent: the thing in this product a person talks to, and the friendliest mark
   * on the rail should be the one that stands for it.
   */
  robot:
    "M12 8V4H8M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM2 14h2M20 14h2M9 13h.01M15 13h.01M10 16.5s.8 1 2 1 2-1 2-1",
  /**
   * Two robot heads, a large one above-left and a small one below-right: an agent and what it
   * has going on underneath it (its subagents). Reduced to antenna, head and two eye dots,
   * because the ears and the smile \`robot\` carries fall below a pixel at 13px.
   */
  robotPair:
    "M7.3 4.2V2.2M3.8 4.2h7a2.2 2.2 0 0 1 2.2 2.2v5.8a2.2 2.2 0 0 1-2.2 2.2h-7a2.2 2.2 0 0 1-2.2-2.2V6.4a2.2 2.2 0 0 1 2.2-2.2zM4.6 9.2h.01M10 9.2h.01M18.6 14.8v-1.7M16.5 14.8h4.2a1.7 1.7 0 0 1 1.7 1.7v3.8a1.7 1.7 0 0 1-1.7 1.7h-4.2a1.7 1.7 0 0 1-1.7-1.7v-3.8a1.7 1.7 0 0 1 1.7-1.7zM17.3 18.4h.01M20.5 18.4h.01",
  /**
   * \`robot\` shrunk toward the top-left, with a plus in the freed bottom-right corner: a new agent
   * made. The shrink (0.82 about the origin, then one unit up and to the left) is baked into the
   * coordinates, since the renderer has nowhere to put a transform; redraw it with \`robot\`.
   */
  robotPlus:
    "M8.84 5.56V2.28H5.56M3.92 5.56h9.84a1.64 1.64 0 0 1 1.64 1.64v6.56a1.64 1.64 0 0 1-1.64 1.64H3.92a1.64 1.64 0 0 1-1.64-1.64v-6.56a1.64 1.64 0 0 1 1.64-1.64zM.64 10.48h1.64M15.4 10.48h1.64M6.38 9.66h.01M11.3 9.66h.01M7.2 12.53s.66.82 1.64.82 1.64-.82 1.64-.82M18.5 15.5v6M15.5 18.5h6",
  /** A person: head and shoulders (lucide user). The person at the keyboard, beside the agent. */
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  /** A person in the status circle: an account's own identity, apart from the bare \`user\`. */
  userCircle:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.2 18.4a6 6 0 0 1 11.6 0",
  /** A person with a plus beside them (lucide user-plus): somebody added. */
  userPlus:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM19 8v6M22 11h-6",
  /** Two people, one behind the other (lucide users): a group of people. */
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  /**
   * The cerebrum from the side: the lobed outline, then the gyri inside it. The drawing was
   * authored with the whole figure shifted a little down the box; the shift is baked into the
   * coordinates rather than carried as a transform, since the renderer has nowhere to put one.
   */
  brain:
    "M5.1 17.9c-1.4 0 -2.5 -1.05 -2.5 -2.45 -1.1 -1 -.95 -2.75 .25 -3.6 -.5 -1.75 .6 -3.5 2.3 -3.8 .2 -1.85 1.95 -3.15 3.75 -2.7 1.3 -1.3 3.5 -1.45 4.95 -.25 2 -.35 3.8 .8 4.35 2.6 2 .1 3.45 1.9 3.05 3.85 .9 1.2 .5 2.95 -.75 3.7 .2 1.6 -1.1 2.9 -2.7 2.75 -1.15 1.15 -2.85 1.3 -4.15 .5 -1.6 1.55 -4.4 1.4 -5.45 -.8 -.85 .75 -2.1 .85 -3.1 .2ZM5.15 8.05C5.05 9.75 6.4 10.8 8 10.55m5.85 -5.45c-1.1 .65 -1.8 1.9 -1.6 3.25m5.95 -.65c-1.7 -.2 -2.8 1.2 -2.6 2.65M8.2 17.7c-1.2 -1.1 -.85 -3 .55 -3.65 1.7 -.8 3.3 -.45 4.5 -2.1m4.55 6.05c-1.35 -.45 -1.9 -1.65 -1.45 -2.85",
  /** An open eye with its pupil: watching what something actually did. */
  eye: \`\${EYE_OUTLINE}M14.7 12a2.7 2.7 0 1 1-5.4 0 2.7 2.7 0 0 1 5.4 0z\`,
  /**
   * The same eye struck through. The slash runs corner to corner rather than across the eye
   * alone, because the open eye is often drawn nearby and the slash is the only thing telling
   * the two apart.
   */
  eyeOff: \`\${EYE_OUTLINE}M3 3l18 18\`,
  /**
   * A chip: body, die and three pins a side. Three pins rather than six — at 16px six pins a
   * side fuse into a serrated edge. The die is what keeps the mark clear of \`server\`: a bare
   * body with side ticks and a stack of server units both reduce to "a rectangle with lines",
   * while concentric squares ringed with pins reduce to nothing else in this table.
   */
  chip: "M5 5h14v14H5zM9 9h6v6H9zM7.5 5V2.4M12 5V2.4M16.5 5V2.4M7.5 19v2.6M12 19v2.6M16.5 19v2.6M5 7.5H2.4M5 12H2.4M5 16.5H2.4M19 7.5h2.6M19 12h2.6M19 16.5h2.6",
  /** Two stacked server units, each with its own status lamp. */
  server: "M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01",
  /** A display on its stand: a desktop computer's screen. */
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  /** A drive: a slab with its status lamp under a tapering top. */
  hardDrive: "M3 13h18v6H3zM5 13l2-8h10l2 8M17 16h.01",
  /** A keyboard: a rounded plate, two rows of keys and a space bar. */
  keyboard:
    "M3 6h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 12.5h.01M9.5 12.5h.01M13 12.5h.01M16.5 12.5h.01M8.5 15.5h7",
  /** A smaller keyboard raised in the box, a chevron under it pointing down. */
  keyboardChevronDown: "M4 4.5h16v10H4zM7.5 8h.01M12 8h.01M16.5 8h.01M8.5 11.5h7M9 18l3 2.5 3-2.5",
  /** The same keyboard lowered in the box, a chevron above it pointing up. */
  keyboardChevronUp: "M4 9.5h16v10H4zM7.5 13h.01M12 13h.01M16.5 13h.01M8.5 16.5h7M9 6.5 12 4l3 2.5",
  /** A trophy: cup, two handles and a base. */
  trophy: "M7 4h10v5a5 5 0 0 1-10 0V4zM7 5H4v1a3 3 0 0 0 3 3m10-4h3v1a3 3 0 0 1-3 3M12 14v4m-4 0h8",
  /** A \`>_\` prompt in a window frame. */
  terminalWindow: "M3 5h18v14H3zM7 9l3 3-3 3M13 15h4",
  /** A bare \`>_\` prompt, without the window frame \`terminalWindow\` draws round it. */
  terminalPrompt: "M4 6l4 4-4 4M12 18h8",
  /** A tower with wings and windows (lucide building-2). */
  building:
    "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4",
  /** A door standing open in its frame, its knob showing (after lucide door-open). */
  doorOpen: "M13 4h3v16h-3M3 20h11V4L3 6zM10 12h.01",
  /** Two pages meeting at the spine (lucide book-open). */
  bookOpen: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  /** A globe: the 9-radius circle, its equator and one meridian. */
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a13 13 0 0 1 0 18 13 13 0 0 1 0-18z",
  /** A house with its door (lucide house). */
  house:
    "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  /** A puzzle piece (lucide puzzle). */
  puzzle:
    "M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z",
  /** A fishing hook: eye, shank, bend and a barbed tip. */
  fishHook: "M16 4a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM14 6v8a5 5 0 0 1-10 0v-2m0 0l-2 2m2-2l2 2",
  /**
   * A magic wand with two sparkles (after lucide's wand-sparkles, reduced so it still reads at
   * 13px): describing something to the agent instead of configuring it by hand.
   */
  wand: "M21.64 3.64l-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72zM14 7l3 3M5 6v4M3 8h4M19 14v4M17 16h4",
  /** An open hand — doing it by hand, the counterpart of \`wand\`. */
  hand: "M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
  /** The standard gear (lucide settings): full tooth outline and centre circle, crisp at 16px. */
  gear: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  /** A pushpin (lucide pin): head, body and stem. */
  pin: "M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z",
  /**
   * A five-pointed star with softened points (lucide star). Drawn with \`GlyphIcon\`'s \`filled\`
   * mode for its "on" state: the solid star is a favourite, the outline the way to make one.
   */
  star: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
  /** A wrench. */
  wrench: "M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5l-2.5 2.5-2-2 2.5-2.5z",
  /** A plug: two prongs, the body and its cord trailing below. */
  plug: "M9 2v4M15 2v4M6 6h12v4a6 6 0 0 1-12 0V6zM12 16v6",
  /**
   * The same plug lifted clear of its socket: prongs up, a gap, and the empty socket cup below.
   * It differs from \`plug\` in silhouette rather than in detail, because at icon size a detail is
   * invisible.
   */
  plugLifted: "M9 2v3M15 2v3M6 5h12v3a6 6 0 0 1-12 0V5zM7 22h10M7 22v-4M17 22v-4",
  /** A key: a round bow, the shaft and two teeth (feather key). */
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
  /**
   * The same key struck through corner to corner, like \`eyeOff\`. Spelled out rather than composed
   * from \`key\`: a fragment equal to a whole entry would name one path twice. Redraw both together.
   */
  keyOff:
    "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4M2 2l20 20",
  /** The shield with an exclamation mark inside (lucide shield-alert). */
  shieldAlert: \`\${SHIELD_OUTLINE}M12 8v4M12 16h.01\`,
  /** The shield split down the middle (lucide shield-half). */
  shieldHalf: \`\${SHIELD_OUTLINE}M12 22V2\`,
  /** The shield with a check inside (lucide shield-check). */
  shieldCheck: \`\${SHIELD_OUTLINE}M9 12l2 2 4-4\`,
  /**
   * The shield struck through corner to corner, its outline broken where the slash crosses it
   * (lucide shield-off). Spelled out: the break leaves nothing of the shared outline whole.
   */
  shieldOff:
    "M2 2l20 20M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264",
  /** Stacked cylinders: a database. */
  database:
    "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  /** A speedometer: half a ring and its needle. */
  gauge: "M5 18a8 8 0 1 1 14 0M12 12l4-3",
  /** A bullseye: two rings and a centre. */
  target:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0-3a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  /** A bullseye with an arrow lodged at its centre, both rings left open where it flew in. */
  targetArrow: "M21 12A9 9 0 1 1 12 3M17 12A5 5 0 1 1 12 7M12 12L15 9V5L18 2V6H22L19 9H15",
  /** A coin: a circle stamped with a dollar sign. */
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-15v12m2.6-9.3c-.5-.8-1.5-1.2-2.6-1.2-1.5 0-2.7.8-2.7 2 0 2.7 5.4 1.3 5.4 4 0 1.2-1.2 2-2.7 2-1.2 0-2.2-.5-2.7-1.4",
  /** A dollar sign in a circle (lucide circle-dollar-sign). */
  dollarCircle:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6",
  /** A light bulb: the glass, its neck and two lines of the base. */
  lightbulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11v2h6v-2a6 6 0 0 0-3-11z",
  /** A bell and its clapper (lucide bell). */
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  /** A lightning bolt (lucide zap). */
  zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  /** A sun: a disc and eight rays. */
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4l1.4-1.4",
  /** A crescent moon: the dark appearance option. */
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
  /** Half a sun rising over the horizon, its rays out. */
  sunrise: "M12 2v3M4.9 5.9l2.1 2.1M2 13h3M19 13h3M17 8l2.1-2.1M6 18a6 6 0 0 1 12 0M2 22h20",

  // --- Time ---------------------------------------------------------------------------------

  /** A clock face with its hands (lucide clock, drawn as one path). */
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2",
  /**
   * The same clock drawn at the 9-unit radius of the status circles (\`info\`, \`checkCircle\`), so
   * it sits level with the other marks of a stats row.
   */
  clockCompact: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-14v5l3 2",
  /**
   * A clock read backwards (lucide history): the face opens into an arrow turning back. Going
   * back to where the reader was, which a bare clock face — "ordered by time" — does not say.
   */
  history: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2",
  /** A calendar (lucide calendar): two rings, the header rule and the page. */
  calendar:
    "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  /**
   * An alarm clock — domed bells on its shoulders, a dial with hands and two splayed feet.
   * Distinct from the plain \`clock\`, which reads as "most recent". Its smallest use is a 12px
   * row mark, which bounds the detail: bells, feet and the hands' right angle each hold a whole
   * pixel there, while a second dial ring or ticks would not, and the notch between the bells
   * is what keeps them reading as two.
   */
  alarmClock:
    "M12 19.5a6.7 6.7 0 1 0 0-13.4 6.7 6.7 0 0 0 0 13.4zM12 8.9v3.9l2.6 1.8M3.1 7.7A3.5 3.5 0 0 1 7.7 4.3M16.3 4.3a3.5 3.5 0 0 1 4.6 3.4M7.8 18.8 5.4 21.6M16.2 18.8l2.4 2.8",
  /** An hourglass: frame top and bottom, sand funnelling to the waist. */
  hourglass: "M6 3h12M6 21h12M8 3v3.5L12 10l4-3.5V3M8 21v-3.5L12 14l4 3.5V21",

  // --- Files and data -----------------------------------------------------------------------

  /** A page with a folded corner. */
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  /** The same page with a plus: a whole file written. */
  filePlus: "M6 3h8l4 4v14H6zM12 11v6M9 14h6",
  /** A pen over a baseline (lucide pen-line): an edit in place. */
  penLine: "M12 20h9M16.5 3.5a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z",
  /** A pencil (thin line, matching the row-action set). */
  pencil: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3zM14 7l3 3",
  /** A folder outline, closed. */
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z",
  /** The closed folder with a plus: a new folder made. */
  folderPlus:
    "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM12 10v6M9 13h6",
  /** A folder outline, open (lucide folder-open: back panel and a tilted front flap). */
  folderOpen:
    "m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
  /**
   * A tray with an arrow leaving it. The same tray serves \`download\`, so the pair reads as one
   * axis; the arrow's direction is the only difference.
   */
  upload: "M12 15V4m0 0L8 8m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  /** The tray with an arrow landing in it. */
  download: "M12 4v11m0 0 4-4m-4 4-4-4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  /** An arrow rising from a baseline. */
  arrowUpFromLine: "M12 15V5m0 0L8 9m4-4l4 4M4 19h16",
  /** An arrow falling to a baseline. */
  arrowDownToLine: "M12 3v10m0 0l-4-4m4 4l4-4M4 19h16",
  /** Opposed up and down arrows (lucide arrow-up-down). */
  arrowUpDown: "m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16",
  /** Two overlapping sheets. */
  copy: "M9 9h9v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9zM7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1",
  /** A clipboard: the board, and the clip at its top edge. */
  clipboard:
    "M9 4h6v3H9zM9 5.5H6.5A1.5 1.5 0 0 0 5 7v12a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V7a1.5 1.5 0 0 0-1.5-1.5H15",
  /** A paperclip (lucide paperclip). */
  paperclip:
    "M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
  /** A checkmark. */
  check: "M5 13l4 4L19 7",
  /** An archive box with a downward chevron. */
  archive:
    "M3 8h18M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M4 8l1.5-3h13L20 8M9.5 13.5 12 16l2.5-2.5",
  /** The archive box with an arrow rising out of it. */
  archiveRestore:
    "M3 8h18M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M4 8l1.5-3h13L20 8M12 17v-5m-2.5 2L12 11l2.5 3",
  /** A trash can: lid, handle, body and two slats. */
  trash:
    "M4 6h16M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6M6 6v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6M10 10.5v6M14 10.5v6",
  /**
   * Three dots. Hairline-stroke dots vanish at row-glyph size, so this mark is drawn with
   * \`GlyphIcon\`'s \`filled\` mode: the stroke rides on top of the fill.
   */
  ellipsis:
    "M4.5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM19.5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  /** Opening quotation marks: a passage carried in from somewhere else. */
  quote:
    "M9.5 6.5C7 7.5 5.5 9.5 5.5 12.5v4h5v-5h-3c0-1.8.9-3.1 2.6-3.8zM19.5 6.5c-2.5 1-4 3-4 6v4h5v-5h-3c0-1.8.9-3.1 2.6-3.8z",
  /**
   * Soft wrap: three lines of text where the middle one runs past the edge, turns back and
   * returns with an arrow. The turn is the whole mark, so it keeps the full bulge.
   */
  wrapText: "M4 6h16M4 12h12a3 3 0 1 1 0 6h-3m2-2-2 2 2 2M4 18h5",
  /** Three lines of text, each shorter than the one above. */
  textLines: "M4 6h16M4 12h12M4 18h8",
  /** A hash sign (lucide hash). */
  hash: "M4 9h16M4 15h16M10 3L8 21M16 3l-2 18",
  /** A percent sign: a slash between two small rings. */
  percent:
    "M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  /** A C in the status circle (lucide copyright). */
  copyright: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9.5a3.5 3.5 0 1 0 0 5",

  // --- Messages and actions -----------------------------------------------------------------

  /** A speech bubble with a plus: putting something into a conversation rather than sending it. */
  messagePlus: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM12 7v6M9 10h6",
  /** A round speech bubble, open at its upper right, with two lines of text inside. */
  bubbleLines: "M8 10h8M8 14h5M21 12a9 9 0 1 1-4-7.5",
  /** A paper plane. */
  paperPlane: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  /** A pane with an arrow leaving it: this opens outside the app, in a tab of its own. */
  externalLink: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
  /** An arrow entering a doorway (lucide log-in). */
  signIn: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  /** An arrow leaving a doorway (lucide log-out). */
  signOut: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  /** Two links of a chain (lucide link): an address. */
  chainLink:
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  /** A pair of angle brackets facing apart (lucide code). */
  angleBrackets: "M16 18l6-6-6-6M8 6l-6 6 6 6",
  /**
   * Two arcs chasing each other round a circle (lucide refresh-cw): read it again. The arc idiom
   * keeps it in the same family as the other round-trip glyphs.
   */
  refresh:
    "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 21v-5h5",
  /**
   * One arc turning clockwise into an arrowhead (feather rotate-cw) — a single arc where \`refresh\`
   * has two. The head reaches x=23, past the other glyphs' margin, as drawn upstream.
   */
  rotateCw: "M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10",
  /** One arc turning anticlockwise into an arrowhead at its upper left: \`rotateCw\` mirrored. */
  rotateCcw: "M3 12a9 9 0 1 0 2.64-6.36M3 4v5h5",
  /** A plus. \`PlusIcon\` (marks.tsx) draws this path with a stroke weight of its own. */
  plus: "M12 5v14M5 12h14",
  /** A minus: the plus's crossbar alone. */
  minus: "M5 12h14",
  /**
   * An X, two strokes corner to corner, on the 24 grid. The close button's cross is a different
   * mark (\`CloseIcon\`, drawn on its own smaller grid).
   */
  cross: "M18 6 6 18M6 6l12 12",
  /** A play triangle; drawn with \`GlyphIcon\`'s \`filled\` mode where it should read solid. */
  play: "M7 4l13 8-13 8z",
  /** Two upright bars: paused. */
  pause: "M8 4v16M16 4v16",
  /** A magnifier: a lens and its handle. The search box's leading mark and the toggle that opens one. */
  search: "M21 21l-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z",
  /**
   * An arrow that turns back on itself: the head at the left, the shaft looping round beneath it.
   * Bring it back — the undo reading, not the bin's: what it takes back is returned, not thrown
   * away.
   */
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  /** A picture: the rounded frame, and a mountain line across its lower half. */
  image:
    "M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3 15l5-5 4 4 3-3 6 6",
  /** Three sliders set at different heights (feather sliders): how something behaves, adjustable. */
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  /** A four-pointed spark: effort and thought, the dial a model thinks harder on. */
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z",
  /**
   * A larger four-pointed star with two small plus-shaped companions (lucide sparkles): a fuller
   * mark than the single \`sparkle\`.
   */
  sparkles:
    "M12 3l-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275zM5 3v4M19 17v4M3 5h4M17 19h4",

  // --- Direction ----------------------------------------------------------------------------

  /**
   * An arrow pointing left. The head sits left of centre and the shaft runs out to the right
   * edge, as the detail pages' back buttons have always drawn it.
   */
  arrowLeft: "M15 18l-6-6 6-6M9 12h12",
  /**
   * A chevron pointing left: back one level, the previous page. A still mark — the collapse
   * indicator that turns is the \`Chevron\` component, a different drawing.
   */
  chevronLeft: "M15 18l-6-6 6-6",
  /** The same chevron pointing right: the next page. */
  chevronRight: "M9 18l6-6-6-6",
  /**
   * The same chevron pointing down: more below. Not the form-control caret, which is the
   * \`ChevronDown\` mark on a grid of its own.
   */
  chevronDown: "M6 9l6 6 6-6",
  /** The same chevron pointing up: more above, the previous match. */
  chevronUp: "M6 15l6-6 6 6",
  /** Two chevrons closing on each other across the middle (lucide chevrons-down-up). */
  chevronsDownUp: "M7 20l5-5 5 5M7 4l5 5 5-5",
  /**
   * A chevron pointing left at an upright bar on the left edge: fold a column away against that
   * edge — the sidebar collapsing to its rail.
   */
  chevronLeftPipe: "M15 6l-6 6 6 6M4 4v16",
  /** The mirror: a chevron pointing right at a bar on the right edge, unfolding the column. */
  chevronRightPipe: "M9 6l6 6-6 6M20 4v16",
  /**
   * An arrow pointing left, centred in the box: head and shaft span the same width, where
   * \`arrowLeft\`'s head sits left of centre. With its mirror, a pair that steps back and forward
   * along one line.
   */
  arrowLeftCentered: "M19 12H5m6-6-6 6 6 6",
  /** The mirror of \`arrowLeftCentered\`, pointing right. */
  arrowRightCentered: "M5 12h14m-6-6 6 6-6 6",
  /** An arrow pointing straight up, shaft and head centred in the box. */
  arrowUp: "M12 19V5m-6 6 6-6 6 6",
  /** The mirror of \`arrowUp\`, pointing down. */
  arrowDown: "M12 5v14m-6-6 6 6 6-6",
  /** An arrow leaving to the upper right (lucide arrow-up-right). */
  arrowUpRight: "M7 7h10v10M7 17 17 7",
  /** A capital M with an arrow leaving its top-right shoulder. */
  letterMArrow: "M4 17V7l4 4 4-4v10M16 7h4v4m0-4-6 6",

  // --- Layout -------------------------------------------------------------------------------

  /** A window with a bottom pane. */
  panelBottom: "M4 5h16v14H4zM4 14h16",
  /** A window with a right pane. */
  panelRight: "M4 5h16v14H4zM14 5v14",
  /** A window with a left pane: the mirror of \`panelRight\`. */
  panelLeft: "M4 5h16v14H4zM10 5v14",
  /** A rounded window with a left pane, and two lines of text in the space beside it. */
  panelLeftText:
    "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm4 0v16M12 9h5m-5 4h5",
  /** The bare window outline the pane glyphs are drawn on: an empty frame. */
  rectangle: "M4 5h16v14H4z",
  /** The same frame with a check inside it. */
  rectangleCheck: "M4 5h16v14H4zM8 12l3 3 5-6",
  /** An anvil: the Agent Workbench. */
  anvil: "M3 7h5V4h13v5l-4 3v3l3 4v1H6v-1l3-4v-3H8c-3 0-5-2-5-5Z M8 7h13 M9 15h8",
  /** A browser window: the rounded frame, its chrome bar and two dots on the bar. */
  appWindow:
    "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6zM3 9h18M6 6.5h.01M9 6.5h.01",
  /**
   * A pane with an arrow escaping its top-right corner: this moves out into a window of its own.
   * A different drawing from \`externalLink\`, whose arrow leaves from the pane's edge.
   */
  boxArrowOut: "M14 4h6v6M20 4l-8 8M10 6H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5",
  /** Four square tiles of two heights. */
  tiles: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  /** Four rounded tiles of two heights (lucide layout-dashboard). */
  dashboard:
    "M4 3h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM15 3h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM15 12h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM4 16h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z",
  /**
   * Four corner brackets opening outward. Brackets rather than an arrow, because what they
   * announce may open in several directions at once, and a mark with a direction in it would
   * name the wrong one.
   */
  cornersOut: "M9 3H3v6M15 3h6v6M15 21h6v-6M9 21H3v-6",
  /** The same four corner brackets turned inward. */
  cornersIn: "M3 9h6V3M21 9h-6V3M21 15h-6v6M3 15h6v6",
  /** One box over two, joined by a bus (lucide network). */
  network: "M9 3h6v5H9zM2 16h6v5H2zM16 16h6v5h-6zM5 16v-3h14v3M12 13V8",
  /** Three nodes: a trunk, and a branch curving off it to a node of its own (lucide git-branch). */
  gitBranch:
    "M8 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM6 7v8M8 11h4a6 6 0 0 0 6-2",
  /** Three columns of unequal height in a frame (lucide square-kanban). */
  kanban:
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7v7M12 7v4M16 7v9",
  /** Bars of three heights on a baseline. */
  barChart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  /** Three full-width lines (lucide menu): the phone's button that opens the navigation drawer. */
  menu: "M4 6h16M4 12h16M4 18h16",
  /** Three sliders on their tracks (lucide sliders-horizontal): a list's display options. */
  slidersHorizontal: "M21 5h-7M10 5H3M21 12h-9M8 12H3M21 19h-5M12 19H3M14 2v6M8 9v6M16 16v6",

  // --- Status -------------------------------------------------------------------------------

  /** An info circle: the 9-radius status circle with a bar and a dot inside it. */
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5m0-8h.01",
  /** An exclamation mark in the status circle: \`info\` turned over, a fault rather than a note. */
  alertCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v4m0 4h.01",
  /** A question mark in the status circle: the "?" that discloses an explanation (InfoPopover). */
  helpCircle:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.3a2.5 2.5 0 0 1 4.9.8c0 1.7-2.5 2.5-2.5 2.5M12 16.8h.01",
  /** A triangle with an exclamation mark (lucide triangle-alert): a warning worth acting on. */
  triangleAlert:
    "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3zM12 9v4m0 4h.01",
  /** A check in the status circle. */
  checkCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-3.5-9.2 2.4 2.5 4.6-4.8",
  /** A cross in the status circle. */
  xCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6m0-6-6 6",
  /** A square in the status circle: ended on purpose, neither a success nor a fault. */
  stopCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 8.5h7v7h-7z",
  /** A centre bar with a chevron bearing down on it from above and up from below. */
  compress: "M4 12h16M8 7l4 3 4-3M8 17l4-3 4 3",
  /**
   * A flat line with one tall beat in it: work still going on. One continuous stroke with a
   * single beat keeps its shape at a 12px row mark, and it is nobody else's shape among the
   * status marks (the hourglass, \`compress\`, the spinner, the circled check and cross, a dot).
   */
  pulse: "M2 12h4l3 9 6-18 3 9h4",
} as const;

/** A glyph's registry key. */
export type IconName = keyof typeof ICONS;
`,Fe=`/**
 * Icon sizes and icon-to-text gaps, named by the role the mark plays rather than by a number.
 *
 * Every line icon is drawn on a 24x24 grid and rendered through \`GlyphIcon\` at the theme's stroke
 * weight (\`--ui-icon-stroke\`, 1.7 in the default theme), so the only thing a call site chooses is
 * how big the box is — and structurally equivalent places must choose the same. Picking a rung by
 * role is what keeps two list rows, or two menu rows, from drifting a pixel apart.
 *
 * The two exceptions to the 24x24 grid are deliberate and stay: \`ChevronDown\` is drawn on a
 * 12x12 grid at 1.5, and the close cross on 14x14 at 1.5 — both are two-stroke marks whose
 * geometry is legible only when the grid matches the render size. Charts, sparklines, the
 * topology view and the login background draw their own geometry and are outside this scale.
 */

export const ICON_SIZE = {
  /**
   * A trailing status mark on a list row — a session row's activity glyph, background-task
   * mark, pin and relay arrow. One rung below \`inlineGlyph\`: several of these may share the
   * tail of one row behind a title they must not compete with.
   */
  rowMark: 12,
  /** A glyph sitting inline with body or secondary text: stat chips, banner leads, buttons with a label, menu rows. The GlyphIcon default. */
  inlineGlyph: 13,
  /** The leading mark of a list row — a session row's agent avatar, a trace row's. */
  rowLead: 14,
  /** A glyph alone inside a square icon button, where it has no text to sit against and needs the extra weight. */
  iconButton: 15,
  /** A group header's leading glyph (a folder, a new-chat pencil). */
  groupHeaderGlyph: 15,
  /** A group header's trailing action buttons, all of which must optically line up with each other. */
  groupHeaderAction: 16,
  /** Sidebar navigation rows and the collapsed rail: one rung up from a list row, because a nav entry is the row. */
  navRow: 16,
  /**
   * A group header's leading avatar. One rung above \`groupHeaderGlyph\` on purpose: an avatar
   * tile fills its box edge to edge while a line glyph only draws inside it, so matching their
   * numbers would make the avatar read as the smaller of the two.
   */
  groupHeaderAvatar: 18,
  /** A mark that anchors a whole block rather than a line: the mobile top bar, a confirm dialog's tinted disc. */
  sectionMark: 18,
  /**
   * The floating launcher's ball face: a control that floats over the conversation on its own,
   * with nothing beside it to size against, so it sits above every in-flow rung. Its entries
   * take the rung below.
   */
  launcherBall: 22,
  /** A fan entry of the floating launcher: a glyph alone in a round button one rung under the ball. */
  launcherEntry: 19,
  /** The rotating collapse chevron. */
  chevron: 14,
  /** The collapse chevron in a dense row (an 11px folder row, a banner). */
  chevronDense: 12,
  /** The downward caret on a form control's trigger. */
  caret: 12,
  /** The downward caret on a dense trigger — the composer's 8px-tall pill buttons. */
  caretDense: 10,
} as const;

/**
 * Horizontal gap between an icon and the text it leads. The rungs track text size: a denser row
 * needs a tighter gap for the pair to read as one unit.
 */
export const ICON_GAP = {
  /** A glyph welded to a number — stat chips, composer chips, mono readouts. */
  tight: "gap-1",
  /** A list row: a leading mark, then a title that may truncate. */
  row: "gap-1.5",
  /** A menu row, a nav row, a banner: the icon leads, the label is the content. */
  menu: "gap-2",
  /** A card row, where the leading mark is an avatar or an illustration rather than a glyph. */
  card: "gap-3",
} as const;
`,Ve=/^[Mm][\d\s.,eE+\-MmZzLlHhVvCcSsQqTtAa]*$/,$e=String.raw`"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|\x60([^\x60\\]*)\x60`,je=String.raw`([A-Z][A-Z0-9_]*(?:\.[A-Za-z_$][\w$]*)?)`,ee=String.raw`(?:${$e}|${je})`,We=new RegExp(String.raw`\bconst\s+([A-Z][A-Z0-9_]*)\s*(?::[^=;]*)?=\s*(?:${ee})\s*(?:as\s+const\s*)?[;\n]`,"g"),Ge=new RegExp(String.raw`\bconst\s+([A-Z][A-Z0-9_]*)\s*(?::[^=;]*)?=\s*\{`,"g"),Ue=new RegExp(String.raw`(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:\s*(?:${ee})\s*(?=[,}\n]|$)`,"g");function B(e,t){const[n,i,a,o]=[e[t],e[t+1],e[t+2],e[t+3]];return n!==void 0?{kind:"literal",text:n}:i!==void 0?{kind:"literal",text:i}:a!==void 0?{kind:"literal",text:a}:o!==void 0?{kind:"ref",name:o}:null}function te(e,t){let n=0,i=null;for(let a=t;a<e.length;a++){const o=e[a];if(i!==null){o==="\\"?a++:o===i&&(i=null);continue}if(o==='"'||o==="'"||o==="`")i=o;else if(o==="{")n++;else if(o==="}"&&--n===0)return e.slice(t+1,a)}return""}function ne(e){let t="",n=null;for(let i=0;i<e.length;i++){const a=e[i];if(n!==null){t+=a,a==="\\"?t+=e[++i]??"":a===n&&(n=null);continue}if(a==="/"&&e[i+1]==="*"){const o=e.indexOf("*/",i+2);i=o===-1?e.length:o+1;continue}if(a==="/"&&e[i+1]==="/"){const o=e.indexOf(`
`,i);i=o===-1?e.length:o-1;continue}(a==='"'||a==="'"||a==="`")&&(n=a),t+=a}return t}function qe(e,t){const n=ne(t),i=[];for(const a of n.matchAll(We)){const o=B(a,2);a[1]&&o&&i.push({name:a[1],expr:o,source:e})}for(const a of n.matchAll(Ge)){if(!a[1])continue;const o=te(n,(a.index??0)+a[0].length-1);for(const s of o.matchAll(Ue)){const l=B(s,2);s[1]&&l&&i.push({name:`${a[1]}.${s[1]}`,expr:l,source:e})}}return i}function Ke(e){const t=Object.entries(e).flatMap(([s,l])=>qe(s,l)),n=new Map;for(const s of t)n.has(s.name)||n.set(s.name,s);const i=new Set,a=s=>{if(s.kind==="ref"){const y=n.get(s.name);if(!y||i.has(s.name))return null;i.add(s.name);const k=a(y.expr);return i.delete(s.name),k}let l=!1;const u=s.text.replace(/\$\{\s*([A-Z][A-Z0-9_]*(?:\.[A-Za-z_$][\w$]*)?)\s*\}/g,(y,k)=>{const m=a({kind:"ref",name:k});return m===null&&(l=!0),m??""});return l?null:u},o=new Map;for(const s of t){const l=a(s.expr)?.trim();if(!l||!Ve.test(l))continue;const u=o.get(l);u?(u.names.includes(s.name)||u.names.push(s.name),u.sources.includes(s.source)||u.sources.push(s.source)):o.set(l,{d:l,names:[s.name],sources:[s.source]})}return[...o.values()]}function Ze(e){const t=ne(e),n=/\bconst\s+ICON_SIZE\s*(?::[^=;]*)?=\s*\{/.exec(t);return n?[...te(t,n.index+n[0].length-1).matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(\d+(?:\.\d+)?)/g)].map(a=>({name:a[1]??"",px:Number(a[2])})):[]}const Ye=e=>e.replace(/^(\.\.\/)+/,"packages/"),Qe=Object.assign({"../../ui/src/components/icons/icons.ts":Be}),Ht=Ke(Object.fromEntries(Object.entries(Qe).map(([e,t])=>[Ye(e),t]))),Xe=Object.assign({"../../ui/src/icon-scale.ts":Fe}),Lt=Ze(Object.values(Xe)[0]??""),Et=Object.assign({"../../ui/src/fonts/LICENSES/ibm-plex-sans-condensed.txt":()=>v(()=>import("./ibm-plex-sans-condensed-JdjIxdTJ.js"),[]).then(e=>e.default),"../../ui/src/fonts/LICENSES/ibm-plex-sans.txt":()=>v(()=>import("./ibm-plex-sans-5grbgKYS.js"),[]).then(e=>e.default),"../../ui/src/fonts/LICENSES/jetbrains-mono.txt":()=>v(()=>import("./jetbrains-mono-Crkr4Gwl.js"),[]).then(e=>e.default),"../../ui/src/fonts/LICENSES/misans.txt":()=>v(()=>import("./misans-C_dhd0y7.js"),[]).then(e=>e.default),"../../ui/src/fonts/LICENSES/mona-sans.txt":()=>v(()=>import("./mona-sans-BZGbPFvy.js"),[]).then(e=>e.default),"../../ui/src/fonts/LICENSES/noto-sans-sc.txt":()=>v(()=>import("./noto-sans-sc-BABgNtn3.js"),[]).then(e=>e.default)}),Je="/lib.html",zt="penguin-gallery:library-height";function It(e,t,n){const i=new URLSearchParams;i.set("topic",n);for(const a of Object.keys(he))i.set(a,t[a]);return`${e}${Je}?${i.toString()}`}function Rt(e){const t=new URLSearchParams(e),n=t.get("topic")??"";return{topic:_e(n)?n:Ne,lang:t.get("lang")==="zh"?"zh":"en"}}export{zt as A,T as B,mt as C,St as D,it as E,Ne as F,ut as G,J as H,at as I,xt as J,dt as K,Me as L,ht as M,wt as N,gt as O,vt as P,bt as Q,yt as R,rt as S,b as T,ft as U,xe as V,Ht as W,pt as X,Lt as Y,Rt as Z,lt as a,ct as b,At as c,Mt as d,Ie as e,D as f,Ae as g,Y as h,_e as i,Ce as j,Z as k,C as l,ot as m,Te as n,pe as o,tt as p,st as q,P as r,nt as s,Ct as t,Tt as u,Et as v,kt as w,Ye as x,It as y,ze as z};
