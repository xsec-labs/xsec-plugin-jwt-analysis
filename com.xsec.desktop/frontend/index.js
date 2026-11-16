// JWT 分析插件前端。界面按 XSEC Desktop 的设计 token 绘制：宿主经 --xsec-* 变量推送当前主题，
// 这里只定义没有收到变量时的兜底值（亮、暗各一套），所以明暗主题和强调色都跟着 Desktop 走。

const TEST_STATUS = {
  vulnerable: { label: "确认风险", tone: "danger" },
  candidate: { label: "候选", tone: "warning" },
  not_vulnerable: { label: "未发现", tone: "success" },
  not_applicable: { label: "不适用", tone: "neutral" },
  not_run: { label: "未运行", tone: "neutral" },
  blocked: { label: "已阻断", tone: "warning" },
  error: { label: "错误", tone: "danger" },
};
const JOB_STATUS = {
  queued: { label: "排队中", tone: "warning" },
  running: { label: "运行中", tone: "info" },
  completed: { label: "已完成", tone: "success" },
  error: { label: "出错", tone: "danger" },
  cancelled: { label: "已取消", tone: "neutral" },
};
const SEVERITY = {
  critical: { label: "严重", tone: "critical" },
  high: { label: "高", tone: "danger" },
  medium: { label: "中", tone: "warning" },
  low: { label: "低", tone: "info" },
  informational: { label: "信息", tone: "neutral" },
};
const SEVERITY_ORDER = ["critical", "high", "medium", "low", "informational"];
const SUMMARY_STATUSES = ["vulnerable", "candidate", "not_vulnerable", "not_run", "blocked", "error"];
const PROFILE = { full: "完整测试", passive: "被动分析" };
const CONFIDENCE = { confirmed: "已确认", high: "高", medium: "中", low: "低" };
const DOWNLOAD_URL_REVOKE_DELAY_MS = 1000;
const POLL_INTERVAL_MS = 2500;
const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
  close: "M6 6l12 12M18 6L6 18",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "jwt-icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name]);
  svg.append(path);
  return svg;
}
function button(label, variant, iconName) {
  const node = element("button", undefined, `jwt-button ${variant || ""}`.trim());
  node.type = "button";
  if (iconName) node.append(icon(iconName));
  node.append(element("span", label));
  return node;
}
function iconButton(label, iconName) {
  const node = element("button", undefined, "jwt-button ghost icon-only");
  node.type = "button";
  node.title = label;
  node.setAttribute("aria-label", label);
  node.append(icon(iconName));
  return node;
}
function badge(text, tone) {
  return element("span", text, `jwt-badge ${tone || "neutral"}`);
}
function statusBadge(table, value) {
  const style = table[value];
  return style ? badge(style.label, style.tone) : badge(value || "未知", "neutral");
}
function severityBadge(value) {
  return statusBadge(SEVERITY, value);
}
function card(title, subtitle) {
  const section = element("section", undefined, "jwt-card");
  const head = element("header", undefined, "jwt-card-head");
  const titles = element("div", undefined, "jwt-card-titles");
  titles.append(element("h2", title));
  if (subtitle) titles.append(element("p", subtitle, "jwt-card-subtitle"));
  const actions = element("div", undefined, "jwt-card-actions");
  head.append(titles, actions);
  section.append(head);
  return { section, actions };
}
function formatTime(value) {
  const time = new Date(value);
  if (typeof value !== "string" || Number.isNaN(time.getTime())) return value || "—";
  const pad = (number) => String(number).padStart(2, "0");
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
}
function statusCounts(tests) {
  return tests.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
}

// JSON 着色：键、字符串、数字和字面量各一种语义色，和 Desktop 的代码块一致。
function jsonBlock(value) {
  const pre = element("pre", undefined, "jwt-code");
  const text = JSON.stringify(value, null, 2) ?? "null";
  const pattern = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) pre.append(text.slice(last, match.index));
    if (match[1] !== undefined && match[2] !== undefined) {
      pre.append(element("span", match[1], "key"), match[2]);
    } else if (match[1] !== undefined) {
      pre.append(element("span", match[1], "string"));
    } else if (match[3] !== undefined) {
      pre.append(element("span", match[3], "number"));
    } else {
      pre.append(element("span", match[4], "literal"));
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) pre.append(text.slice(last));
  return pre;
}

// 报告预览：把 Markdown 的标题、列表、代码块、强调和行内代码画成文档。只创建文本节点，不解析 HTML。
function appendInline(parent, text) {
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parent.append(text.slice(last, match.index));
    parent.append(match[1] !== undefined ? element("code", match[1]) : element("strong", match[2]));
    last = match.index + match[0].length;
  }
  if (last < text.length) parent.append(text.slice(last));
}
function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}
function markdownTable(rows) {
  const wrap = element("div", undefined, "jwt-md-table-wrap");
  const table = element("table", undefined, "jwt-md-table");
  const isRule = (cells) => cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
  const hasHead = rows.length > 1 && isRule(rows[1]);
  const fill = (section, cells, tag) => {
    const row = element("tr");
    for (const cell of cells) {
      const node = element(tag);
      appendInline(node, cell);
      row.append(node);
    }
    section.append(row);
  };
  if (hasHead) {
    const head = element("thead");
    fill(head, rows[0], "th");
    table.append(head);
  }
  const body = element("tbody");
  for (const cells of rows.slice(hasHead ? 2 : 0)) if (!isRule(cells)) fill(body, cells, "td");
  table.append(body);
  wrap.append(table);
  return wrap;
}
function markdownBlock(source) {
  const root = element("div", undefined, "jwt-markdown");
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let list = null;
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      const node = element("p");
      paragraph.forEach((text, position) => {
        if (position) node.append(document.createElement("br"));
        appendInline(node, text);
      });
      root.append(node);
      paragraph = [];
    }
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("```")) {
      flush(); list = null;
      const code = [];
      for (index += 1; index < lines.length && !lines[index].startsWith("```"); index += 1) code.push(lines[index]);
      root.append(element("pre", code.join("\n"), "jwt-code"));
      continue;
    }
    if (line.trim().startsWith("|")) {
      flush(); list = null;
      const rows = [];
      for (; index < lines.length && lines[index].trim().startsWith("|"); index += 1) rows.push(tableCells(lines[index]));
      index -= 1;
      root.append(markdownTable(rows));
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const item = /^\s*(?:[-*]|(\d+)\.)\s+(.*)$/.exec(line);
    if (heading) {
      flush(); list = null;
      const node = element(`h${Math.min(heading[1].length + 2, 5)}`);
      appendInline(node, heading[2]);
      root.append(node);
    } else if (item) {
      flush();
      const tag = item[1] === undefined ? "ul" : "ol";
      if (!list || list.localName !== tag) { list = element(tag); root.append(list); }
      const node = element("li");
      appendInline(node, item[2]);
      list.append(node);
    } else if (!line.trim()) {
      flush(); list = null;
    } else {
      list = null;
      paragraph.push(line.trim());
    }
  }
  flush();
  return root;
}

function ensureStyles() {
  if (document.getElementById("jwt-analysis-style")) return;
  const style = document.createElement("style");
  style.id = "jwt-analysis-style";
  style.textContent = `
    :root{--jwt-fb-surface:#ffffff;--jwt-fb-subtle:#f0f0f2;--jwt-fb-hover:#eaeaed;--jwt-fb-text:#18181b;--jwt-fb-muted:#62626b;--jwt-fb-border:#dcdce1;--jwt-fb-danger:#b42318;--jwt-fb-success:#187344;--jwt-fb-warning:#8a5700;color-scheme:light dark}
    @media(prefers-color-scheme:dark){:root{--jwt-fb-surface:#19191c;--jwt-fb-subtle:#232327;--jwt-fb-hover:#2d2d33;--jwt-fb-text:#f4f4f5;--jwt-fb-muted:#a1a1aa;--jwt-fb-border:#35353c;--jwt-fb-danger:#ff938a;--jwt-fb-success:#7ad6a0;--jwt-fb-warning:#e9bd70}}
    .jwt-root,.jwt-settings{--surface:var(--xsec-content-surface,var(--jwt-fb-surface));--subtle:var(--xsec-bg-subtle,var(--jwt-fb-subtle));--hover:var(--xsec-bg-hover,var(--jwt-fb-hover));--text:var(--xsec-text-primary,var(--jwt-fb-text));--muted:var(--xsec-text-secondary,var(--jwt-fb-muted));--border:var(--xsec-border-default,var(--jwt-fb-border));--accent:var(--xsec-text-accent,var(--jwt-fb-text));--info:color-mix(in srgb,#0169cc 68%,var(--text));--danger:var(--xsec-status-error,var(--jwt-fb-danger));--success:var(--xsec-status-success,var(--jwt-fb-success));--warning:var(--xsec-status-warning,var(--jwt-fb-warning));
      --hairline:color-mix(in srgb,var(--text) 10%,transparent);--field:color-mix(in srgb,var(--text) 5.5%,transparent);--field-hover:color-mix(in srgb,var(--text) 8%,transparent);--on-accent:var(--surface);--radius:var(--xsec-radius-md,8px);--radius-panel:var(--xsec-radius-lg,12px);
      box-sizing:border-box;min-height:100%;padding:16px;background:var(--surface);color:var(--text);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
    html,body{margin:0;background:var(--xsec-content-surface,var(--jwt-fb-surface))}
    .jwt-root *,.jwt-settings *{box-sizing:border-box}.jwt-root{display:flex;flex-direction:column;gap:16px}.jwt-root>div:empty,.jwt-root [hidden],.jwt-settings [hidden]{display:none}
    .jwt-root h1,.jwt-settings h1{margin:0;font-size:20px;line-height:28px;font-weight:650;letter-spacing:-.01em}.jwt-root h2,.jwt-settings h2{margin:0;font-size:14px;line-height:32px;font-weight:650}
    .jwt-muted{color:var(--muted)}.jwt-small{font-size:12px}.jwt-mono{font-family:ui-monospace,"SF Mono","Cascadia Mono",Consolas,"Liberation Mono",monospace}
    .jwt-header{display:flex;align-items:flex-start;gap:12px}.jwt-header>div:first-child{flex:1;min-width:0}.jwt-header p{margin:0;color:var(--muted);font-size:13px}.jwt-header-actions{display:flex;gap:8px;align-items:center}
    .jwt-runtime{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.jwt-tag{padding:1px 8px;border:1px solid var(--hairline);border-radius:6px;font-size:12px;line-height:18px;color:var(--text)}
    .jwt-icon{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
    .jwt-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border:0;border-radius:var(--radius);background:var(--field);color:var(--text);font:inherit;font-weight:500;cursor:pointer;white-space:nowrap;transition:background-color .12s}
    .jwt-button:hover{background:var(--field-hover)}.jwt-button:focus-visible,.jwt-root select:focus-visible,.jwt-root input:focus-visible,.jwt-settings :is(input,select,textarea):focus-visible{outline:2px solid var(--info);outline-offset:1px}
    .jwt-button.primary{background:var(--accent);color:var(--on-accent);color:oklch(from var(--accent) clamp(0,(.65 - l)*1000,1) 0 0)}.jwt-button.primary:hover{background:color-mix(in srgb,var(--accent) 88%,var(--surface))}.jwt-button.ghost{background:transparent}.jwt-button.ghost:hover{background:var(--field)}
    .jwt-button.outline{background:transparent;box-shadow:inset 0 0 0 1px var(--border)}.jwt-button.outline:hover{background:var(--field)}.jwt-button.compact{height:26px;padding:0 8px;font-size:12px}.jwt-button.icon-only{width:32px;padding:0}.jwt-button.compact.icon-only{width:26px}
    .jwt-button:disabled{opacity:.5;cursor:default}.jwt-button.spinning .jwt-icon{animation:jwt-spin .8s linear infinite}@keyframes jwt-spin{to{transform:rotate(360deg)}}
    .jwt-root select,.jwt-root input[type=search],.jwt-settings :is(input[type=number],select,textarea){height:32px;padding:0 10px;border:0;border-radius:var(--radius);background:var(--field);color:var(--text);font:inherit;min-width:0}
    .jwt-root select:hover,.jwt-root input[type=search]:hover,.jwt-settings :is(input[type=number],select,textarea):hover{background:var(--field-hover)}.jwt-job-select{width:100%}.jwt-root select,.jwt-settings select{appearance:none;-webkit-appearance:none;padding-right:28px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238a8a93' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;background-size:16px;cursor:pointer}
    .jwt-card{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--hairline);border-radius:var(--radius-panel);background:var(--surface);min-width:0}.jwt-card.focus{border-color:color-mix(in srgb,var(--info) 55%,transparent)}
    .jwt-card-head{display:flex;align-items:flex-start;gap:12px}.jwt-card-titles{flex:1;min-width:0}.jwt-card-subtitle{margin:-4px 0 0;color:var(--muted);font-size:12px}.jwt-card-actions{display:flex;gap:8px;align-items:center;min-height:32px}
    .jwt-badge{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;font-size:12px;line-height:18px;font-weight:600;white-space:nowrap;background:var(--subtle);color:var(--muted)}
    .jwt-badge.success{color:var(--success);background:color-mix(in srgb,var(--success) 12%,var(--surface))}.jwt-badge.warning{color:var(--warning);background:color-mix(in srgb,var(--warning) 14%,var(--surface))}.jwt-badge.danger{color:var(--danger);background:color-mix(in srgb,var(--danger) 12%,var(--surface))}
    .jwt-badge.info{color:var(--info);background:color-mix(in srgb,var(--info) 12%,var(--surface))}.jwt-badge.critical{color:var(--surface);background:var(--danger)}
    .jwt-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px}.jwt-metric{padding:10px 12px;border-radius:var(--radius);background:var(--subtle)}.jwt-metric b{display:block;font-size:20px;line-height:26px;font-weight:650;font-variant-numeric:tabular-nums}.jwt-metric span{font-size:12px;color:var(--muted)}
    .jwt-metric.zero b{color:var(--muted)}.jwt-metric.danger b{color:var(--danger)}.jwt-metric.warning b{color:var(--warning)}.jwt-metric.success b{color:var(--success)}
    .jwt-severity{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:12px}.jwt-severity>span{display:inline-flex;gap:4px;align-items:center}.jwt-severity b{font-variant-numeric:tabular-nums}.jwt-severity .zero{color:var(--muted)}
    .jwt-token{display:flex;flex-direction:column;gap:8px}.jwt-token+.jwt-token{padding-top:12px;border-top:1px solid var(--hairline)}.jwt-token-id{display:flex;gap:8px;align-items:center;min-width:0}.jwt-token-id .jwt-mono{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .jwt-token-parts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.jwt-caption{margin:0 0 4px;font-size:12px;font-weight:600;color:var(--muted)}
    .jwt-code{margin:0;padding:10px 12px;max-height:280px;overflow:auto;border:1px solid var(--hairline);border-radius:var(--radius);background:var(--subtle);font:12px/1.5 ui-monospace,"SF Mono","Cascadia Mono",Consolas,"Liberation Mono",monospace;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}
    .jwt-code .key{font-weight:600}.jwt-code .string{color:var(--success)}.jwt-code .number{color:var(--warning)}.jwt-code .literal{font-weight:600}
    .jwt-kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 16px;margin:0;font-size:13px}.jwt-kv dt{color:var(--muted)}.jwt-kv dd{margin:0;overflow-wrap:anywhere;user-select:text}
    .jwt-rows{display:flex;flex-direction:column}.jwt-row{display:flex;gap:8px;align-items:center;min-height:40px;padding:6px 0}.jwt-row+.jwt-row{border-top:1px solid var(--hairline)}.jwt-row-main{flex:1;min-width:0}.jwt-row-main b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .jwt-row-slot{display:flex;justify-content:flex-end;width:56px;flex:none}.jwt-grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .jwt-filters{display:flex;gap:8px;flex-wrap:wrap}.jwt-filters select{width:150px}.jwt-filters input{width:180px}
    .jwt-table-wrap{overflow:auto;max-height:420px}.jwt-tests{width:100%;border-collapse:collapse;font-size:13px}.jwt-tests th{position:sticky;top:0;background:var(--surface);text-align:left;padding:6px 8px;font-size:12px;font-weight:600;color:var(--muted);border-bottom:1px solid var(--hairline);white-space:nowrap}
    .jwt-tests td{padding:6px 8px;border-bottom:1px solid var(--hairline);vertical-align:middle}.jwt-tests tbody tr:last-child td{border-bottom:0}.jwt-tests tbody tr:hover td{background:color-mix(in srgb,var(--text) 3%,transparent)}.jwt-tests td:first-child{font-weight:600}.jwt-tests td.reason{color:var(--muted)}
    .jwt-events{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;max-height:220px;overflow:auto}.jwt-events li{display:flex;gap:8px;align-items:center;font-size:13px}.jwt-events time{margin-left:auto;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
    .jwt-dot{width:8px;height:8px;border-radius:50%;background:var(--muted);flex:none}.jwt-dot.success{background:var(--success)}.jwt-dot.warning{background:var(--warning)}.jwt-dot.danger{background:var(--danger)}.jwt-dot.info{background:var(--info)}
    .jwt-notice{display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:var(--radius);font-size:13px;color:var(--danger);background:color-mix(in srgb,var(--danger) 10%,var(--surface))}
    .jwt-empty{display:flex;flex-direction:column;align-items:center;gap:4px;padding:48px 16px;text-align:center;color:var(--muted)}.jwt-empty b{color:var(--text);font-weight:600}
    .jwt-markdown{padding:12px 16px;max-height:480px;overflow:auto;border-radius:var(--radius);background:var(--subtle);user-select:text}.jwt-markdown :is(h3,h4,h5){margin:12px 0 4px;font-weight:650}.jwt-markdown h3{font-size:16px}.jwt-markdown h4{font-size:14px}.jwt-markdown h5{font-size:13px}
    .jwt-markdown>:first-child{margin-top:0}.jwt-markdown p{margin:6px 0}.jwt-markdown :is(ul,ol){margin:6px 0;padding-left:20px}.jwt-md-table-wrap{margin:8px 0;overflow-x:auto}.jwt-md-table{border-collapse:collapse;font-size:13px}.jwt-md-table :is(th,td){padding:5px 12px 5px 0;border-bottom:1px solid var(--hairline);text-align:left;vertical-align:top}.jwt-md-table th{color:var(--muted);font-size:12px;font-weight:600;white-space:nowrap}.jwt-markdown code{padding:1px 4px;border-radius:4px;background:var(--field);font:12px ui-monospace,"SF Mono","Cascadia Mono",Consolas,"Liberation Mono",monospace}.jwt-markdown .jwt-code{background:var(--surface)}
    .jwt-settings{display:flex;flex-direction:column;gap:16px;max-width:760px;padding:24px}.jwt-settings header p{margin:2px 0 0;color:var(--muted);font-size:13px}.jwt-settings .jwt-card{gap:14px}
    .jwt-field{display:grid;gap:6px;font-size:13px;font-weight:500}.jwt-field :is(input,select,textarea){font-weight:400}.jwt-field textarea{height:auto;padding:8px 12px;resize:vertical;font:12px/1.5 ui-monospace,"SF Mono","Cascadia Mono",Consolas,"Liberation Mono",monospace}.jwt-field small{font-weight:400;color:var(--muted)}.jwt-field small.error{color:var(--danger)}
    .jwt-field.invalid :is(input,textarea){box-shadow:inset 0 0 0 1px var(--danger)}.jwt-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .jwt-check{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:400;cursor:pointer}.jwt-check input{width:16px;height:16px;margin:0;accent-color:var(--accent)}
    .jwt-form-actions{display:flex;justify-content:flex-end;align-items:center;gap:12px;padding-top:12px;border-top:1px solid var(--hairline)}.jwt-saved{display:inline-flex;gap:4px;align-items:center;color:var(--success);font-size:13px}
    @media(max-width:560px){.jwt-token-parts,.jwt-field-grid{grid-template-columns:1fr}.jwt-tests .optional{display:none}}
    @media(prefers-reduced-motion:reduce){.jwt-button{transition:none}.jwt-button.spinning .jwt-icon{animation:none}}
  `;
  document.head.append(style);
}

function renderSummary(root, job) {
  const tests = job.tests || [];
  const { section, actions } = card("任务概览", `创建于 ${formatTime(job.created_at)} · ${PROFILE[job.profile] || job.profile}`);
  actions.append(statusBadge(JOB_STATUS, job.status));
  const counts = statusCounts(tests);
  const metrics = element("div", undefined, "jwt-metrics");
  for (const key of SUMMARY_STATUSES) {
    const count = counts[key] || 0;
    const metric = element("div", undefined, `jwt-metric ${count ? TEST_STATUS[key].tone : "zero"}`);
    metric.append(element("b", String(count)), element("span", TEST_STATUS[key].label));
    metrics.append(metric);
  }
  const severity = element("div", undefined, "jwt-severity");
  severity.append(element("span", "确认风险", "jwt-muted"));
  for (const level of SEVERITY_ORDER) {
    const count = tests.filter((test) => test.status === "vulnerable" && test.severity === level).length;
    const item = element("span");
    item.append(severityBadge(level), element("b", String(count), count ? "" : "zero"));
    severity.append(item);
  }
  section.append(metrics, severity);
  root.append(section);
}
function renderTokens(root, tokens) {
  const { section } = card("JWT 解析", `${tokens.length} 个令牌`);
  for (const token of tokens) {
    const block = element("div", undefined, "jwt-token");
    const identity = element("div", undefined, "jwt-token-id");
    identity.append(token.algorithm ? badge(token.algorithm, "info") : badge("无算法", "neutral"), element("span", token.token_fingerprint, "jwt-mono"));
    if (token.key_id) identity.append(element("span", `kid ${token.key_id}`, "jwt-tag"));
    const parts = element("div", undefined, "jwt-token-parts");
    for (const [title, value] of [["头部", token.header], ["载荷", token.payload]]) {
      const part = element("div");
      part.append(element("p", title, "jwt-caption"), jsonBlock(value ?? null));
      parts.append(part);
    }
    const signature = element("dl", undefined, "jwt-kv");
    signature.append(element("dt", "签名"), element("dd", token.signature || "—", "jwt-mono"));
    block.append(identity, parts, signature);
    section.append(block);
  }
  if (!tokens.length) section.append(element("p", "没有解析到 JWT", "jwt-muted"));
  root.append(section);
}
function renderWeakSecrets(root, job) {
  const { section } = card("弱密钥 / 空密钥");
  const findings = (job.tests || []).filter((item) => item.test_id === "weak-secret");
  const rows = element("div", undefined, "jwt-rows");
  for (const item of findings) {
    const row = element("div", undefined, "jwt-row");
    row.append(statusBadge(TEST_STATUS, item.status), severityBadge(item.severity), element("span", item.details?.reason || "—", "jwt-grow"),
      element("span", item.token_fingerprint || "", "jwt-mono jwt-small jwt-muted"));
    rows.append(row);
  }
  if (findings.length) section.append(rows);
  else section.append(element("p", "没有弱密钥测试结果", "jwt-muted"));
  const runs = job.wordlist_runs || [];
  if (runs.length) {
    const list = element("div", undefined, "jwt-rows");
    for (const run of runs) {
      const row = element("div", undefined, "jwt-row");
      const skipped = run.invalid_utf8 ? ` · 跳过 ${run.invalid_utf8} 个非 UTF-8 行` : "";
      row.append(element("span", run.wordlist_id, "jwt-mono"), element("span", `尝试 ${run.candidates} 个候选${skipped}`, "jwt-grow jwt-small jwt-muted"),
        element("span", run.token_fingerprint || "", "jwt-mono jwt-small jwt-muted"), run.matched ? badge("命中", "danger") : badge("未命中", "neutral"));
      list.append(row);
    }
    const wrap = element("div");
    wrap.append(element("p", "字典", "jwt-caption"), list);
    section.append(wrap);
  }
  root.append(section);
}
function renderCandidates(root, tests, openEvidence, signal) {
  const { section } = card("候选发现", "先复核请求差异和 canary 证据；确认后再由 Agent 调用核心 xsec_finding_upsert");
  const candidates = tests.filter((item) => ["candidate", "vulnerable"].includes(item.status));
  const rows = element("div", undefined, "jwt-rows");
  for (const item of candidates) {
    const row = element("div", undefined, "jwt-row");
    const main = element("div", undefined, "jwt-row-main");
    const confidence = `置信度 ${CONFIDENCE[item.confidence] || item.confidence || "—"}`;
    main.append(element("b", item.test_id), element("span", item.cve ? `${item.cve} · ${confidence}` : confidence, "jwt-small jwt-muted"));
    const slot = element("div", undefined, "jwt-row-slot");
    if (item.evidence_id) {
      const view = button("证据", "outline compact");
      view.addEventListener("click", () => void openEvidence(item.evidence_id), { signal });
      slot.append(view);
    }
    row.append(main, statusBadge(TEST_STATUS, item.status), severityBadge(item.severity), slot);
    rows.append(row);
  }
  if (candidates.length) section.append(rows);
  else section.append(element("p", "没有需要复核的结果", "jwt-muted"));
  root.append(section);
}
function matchesTest(test, filters, byToken) {
  return (filters.status === "all" || filters.status === test.status) && (filters.severity === "all" || filters.severity === test.severity) &&
    (filters.algorithm === "all" || filters.algorithm === byToken.get(test.token_fingerprint)) &&
    (!filters.cve || (test.cve || "").toLowerCase().includes(filters.cve.toLowerCase()));
}
function filterSelect(label, value, options) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", label);
  for (const [key, title] of options) {
    const option = element("option", title);
    option.value = key;
    select.append(option);
  }
  select.value = value;
  if (select.value !== value) select.value = "all";
  return select;
}
// 筛选条件存在 filters 里，由调用方持有：定时刷新重画矩阵时条件不丢。
function renderTests(root, tests, tokens, filters, openEvidence, signal) {
  const algorithms = [...new Set(tokens.map((token) => token.algorithm).filter(Boolean))].map((value) => [value, value]);
  if (filters.algorithm !== "all" && !algorithms.some(([value]) => value === filters.algorithm)) filters.algorithm = "all";
  const { section } = card("安全测试矩阵", `${tests.length} 项测试`);
  const status = filterSelect("状态", filters.status, [["all", "全部状态"], ...Object.entries(TEST_STATUS).map(([key, style]) => [key, style.label])]);
  const severity = filterSelect("严重性", filters.severity, [["all", "全部级别"], ...SEVERITY_ORDER.map((key) => [key, SEVERITY[key].label])]);
  const algorithm = filterSelect("算法", filters.algorithm, [["all", "全部算法"], ...algorithms]);
  const cve = document.createElement("input");
  Object.assign(cve, { type: "search", placeholder: "CVE", value: filters.cve });
  cve.setAttribute("aria-label", "CVE");
  const filterBar = element("div", undefined, "jwt-filters");
  filterBar.append(status, severity, algorithm, cve);
  const table = element("table", undefined, "jwt-tests"), head = element("thead"), header = element("tr"), rows = element("tbody");
  [["测试", ""], ["CVE", "optional"], ["状态", ""], ["级别", ""], ["说明", "optional"], ["证据", ""]].forEach(([label, className]) => header.append(element("th", label, className)));
  head.append(header); table.append(head, rows);
  const empty = element("p", "没有匹配的测试", "jwt-muted");
  const byToken = new Map(tokens.map((token) => [token.token_fingerprint, token.algorithm]));
  const render = () => {
    Object.assign(filters, { status: status.value, severity: severity.value, algorithm: algorithm.value, cve: cve.value });
    rows.replaceChildren();
    const shown = tests.filter((test) => matchesTest(test, filters, byToken));
    shown.forEach((test) => rows.append(testRow(test, openEvidence, signal)));
    empty.hidden = shown.length > 0;
  };
  [status, severity, algorithm].forEach((filter) => filter.addEventListener("change", render, { signal }));
  cve.addEventListener("input", render, { signal });
  render();
  const wrap = element("div", undefined, "jwt-table-wrap");
  wrap.append(table);
  section.append(filterBar, wrap, empty); root.append(section);
}
function testRow(test, openEvidence, signal) {
  const row = element("tr");
  const cells = [element("td", test.test_id), element("td", test.cve || "—", `optional jwt-mono jwt-small${test.cve ? "" : " jwt-muted"}`), element("td"), element("td"),
    element("td", test.details?.reason || "—", "optional reason"), element("td")];
  cells[2].append(statusBadge(TEST_STATUS, test.status));
  cells[3].append(severityBadge(test.severity));
  if (test.evidence_id) {
    const view = button("查看", "ghost compact");
    view.addEventListener("click", () => void openEvidence(test.evidence_id), { signal });
    cells[5].append(view);
  } else {
    cells[5].textContent = "—";
    cells[5].className = "jwt-muted";
  }
  row.append(...cells);
  return row;
}
function renderEvents(root, events) {
  const { section } = card("任务阶段");
  const list = element("ol", undefined, "jwt-events");
  for (const item of events) {
    const style = JOB_STATUS[item.status] || { label: item.status, tone: "neutral" };
    const row = element("li");
    row.append(element("span", undefined, `jwt-dot ${style.tone}`), element("b", item.stage), element("span", style.label, "jwt-small jwt-muted"), element("time", formatTime(item.created_at)));
    list.append(row);
  }
  if (events.length) section.append(list);
  else section.append(element("p", "暂无阶段记录", "jwt-muted"));
  root.append(section);
}
async function showReport(host, root, jobId, signal) {
  if (!jobId) return;
  const value = await host.request("xsec.jwt-analysis.report", { job_id: jobId, format: "markdown" });
  if (signal.aborted) return;
  const { section, actions } = card("JWT 分析报告", jobId);
  const link = element("a", undefined, "jwt-button compact");
  link.append(icon("download"), element("span", "下载 Markdown"));
  const url = URL.createObjectURL(new Blob([value.report], { type: "text/markdown;charset=utf-8" }));
  signal.addEventListener("abort", () => URL.revokeObjectURL(url), { once: true });
  Object.assign(link, { href: url, download: `jwt-analysis-${jobId}.md` });
  link.style.textDecoration = "none";
  link.addEventListener("click", () => setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_DELAY_MS), { once: true });
  const close = iconButton("关闭报告", "close");
  close.classList.add("compact");
  close.addEventListener("click", () => root.replaceChildren(), { signal });
  actions.append(link, close);
  section.append(markdownBlock(value.report)); root.replaceChildren(section);
  section.scrollIntoView({ block: "nearest" });
}

async function renderWorkspace(host, root, context, signal) {
  let selected = new URLSearchParams(location.search).get("job") || "";
  let refreshRevision = 0;
  let timer;
  let rendered = "";
  const filters = { status: "all", severity: "all", algorithm: "all", cve: "" };
  signal.addEventListener("abort", () => window.clearTimeout(timer), { once: true });
  const body = element("div", undefined, "jwt-root");
  const diagnostics = await host.request("xsec.jwt-analysis.diagnostics", {});
  if (signal.aborted) return;
  const header = element("header", undefined, "jwt-header"), titles = element("div"), headerActions = element("div", undefined, "jwt-header-actions");
  titles.append(element("h1", "JWT 分析"), element("p", `项目任务 · ${context?.project?.projectId || "当前项目"}`));
  const reportButton = button("报告", "", "file"), refreshButton = button("刷新", "ghost", "refresh");
  reportButton.title = "报告预览 / 下载";
  headerActions.append(reportButton, refreshButton);
  header.append(titles, headerActions);
  const runtime = element("div", undefined, "jwt-runtime");
  runtime.append(element("span", `Sidecar ${diagnostics.sidecar}`, "jwt-tag"), element("span", `jwt_tool ${diagnostics.jwt_tool_version}`, "jwt-tag"),
    diagnostics.rockyou_available ? badge("RockYou 已就绪", "success") : badge("RockYou 缺失", "warning"));
  const jobSelect = element("select", undefined, "jwt-job-select");
  jobSelect.setAttribute("aria-label", "分析任务");
  const notice = element("div"), evidenceView = element("div"), content = element("div", undefined, "jwt-root"), reportView = element("div");
  content.style.padding = "0";
  body.append(header, runtime, jobSelect, notice, evidenceView, content, reportView); root.replaceChildren(body);
  const openEvidence = async (evidenceId) => {
    const evidence = await host.request("xsec.jwt-analysis.evidence.get", { evidence_id: evidenceId });
    if (signal.aborted) return;
    const { section, actions } = card("脱敏证据", evidenceId);
    section.classList.add("focus");
    const close = iconButton("关闭证据", "close");
    close.classList.add("compact");
    close.addEventListener("click", () => evidenceView.replaceChildren(), { signal });
    actions.append(close);
    section.append(jsonBlock(evidence)); evidenceView.replaceChildren(section);
    section.scrollIntoView({ block: "nearest" });
  };
  const refresh = async (revision) => {
    if (signal.aborted) return;
    const current = () => !signal.aborted && revision === refreshRevision;
    const result = await host.request("xsec.jwt-analysis.jobs.list", { limit: 100 });
    if (!current()) return;
    const jobs = result.items || [];
    const previous = selected;
    jobSelect.replaceChildren();
    for (const job of jobs) {
      const option = element("option", `${job.job_id} · ${JOB_STATUS[job.status]?.label || job.status}`);
      option.value = job.job_id;
      jobSelect.append(option);
    }
    if (!selected && jobs.length) selected = jobs[0].job_id;
    jobSelect.value = selected || previous;
    jobSelect.disabled = !jobs.length;
    reportButton.disabled = !selected;
    if (!selected) {
      rendered = "";
      const empty = element("div", undefined, "jwt-empty");
      empty.append(element("b", "当前项目还没有 JWT 分析任务"), element("span", "将 JWT、抓包引用或项目文件交给 Agent 创建任务。"));
      content.replaceChildren(empty);
      return;
    }
    const job = await host.request("xsec.jwt-analysis.jobs.get", { job_id: selected });
    if (!current()) return;
    const events = await host.request("xsec.jwt-analysis.jobs.events", { job_id: selected, cursor: 0 });
    if (!current()) return;
    // 内容没变就不重画：定时刷新不打断正在看的滚动位置和选中的文字。
    const snapshot = JSON.stringify([job, events]);
    if (snapshot === rendered) return;
    rendered = snapshot;
    content.replaceChildren();
    renderSummary(content, job);
    renderTokens(content, job.tokens || []);
    renderWeakSecrets(content, job);
    renderCandidates(content, job.tests || [], openEvidence, signal);
    renderTests(content, job.tests || [], job.tokens || [], filters, openEvidence, signal);
    renderEvents(content, events.items || []);
  };
  // Poll only after a successful refresh; an error reaches the Host boundary
  // and leaves the next refresh to an explicit user action.
  const refreshAndSchedule = async () => {
    window.clearTimeout(timer);
    const revision = ++refreshRevision;
    refreshButton.classList.add("spinning");
    notice.replaceChildren();
    try {
      await refresh(revision);
    } catch (error) {
      if (!signal.aborted && revision === refreshRevision) {
        notice.replaceChildren(element("div", `读取 JWT 分析任务失败：${error?.message || error}`, "jwt-notice"));
      }
      throw error;
    } finally {
      if (revision === refreshRevision) refreshButton.classList.remove("spinning");
    }
    if (!signal.aborted && revision === refreshRevision) {
      timer = window.setTimeout(() => void refreshAndSchedule(), POLL_INTERVAL_MS);
    }
  };
  jobSelect.addEventListener("change", () => {
    selected = jobSelect.value; rendered = "";
    reportView.replaceChildren(); evidenceView.replaceChildren();
    void refreshAndSchedule();
  }, { signal });
  refreshButton.addEventListener("click", () => void refreshAndSchedule(), { signal });
  reportButton.addEventListener("click", () => void showReport(host, reportView, selected, signal), { signal });
  await refreshAndSchedule();
}

async function renderSettings(host, root, signal) {
  const current = await host.request("xsec.plugin.config.get", { key: "analysis" });
  if (signal.aborted) return;
  const settings = current?.value || {};
  const form = element("form", undefined, "jwt-settings");
  form.noValidate = true;
  const header = element("header");
  header.append(element("h1", "JWT 分析设置"), element("p", "设置保存在当前账号。运行状态在项目的 JWT 分析面板里看。"));
  const common = checkbox("启用 jwt-common 字典", settings.wordlists?.includes("jwt-common") ?? true);
  const rockyou = checkbox("启用 RockYou 字典", settings.rockyou_enabled ?? true);
  const customPaths = input("自定义字典路径，每行一个", "textarea", (settings.custom_wordlists || []).join("\n"), "本机可读的 UTF-8 文本文件");
  const rate = input("主动请求速率（每分钟）", "number", settings.rate_limit ?? 10);
  const timeout = input("请求超时（秒）", "number", settings.request_timeout_seconds ?? 10);
  const concurrency = input("最大并发任务", "number", settings.max_concurrent_jobs ?? 2);
  const requestCount = input("每任务主动请求上限", "number", settings.max_requests_per_job ?? 100);
  const redirect = selectField("重定向策略", settings.redirect_policy || "disabled", [
    ["disabled", "不跟随（默认）"], ["same-origin", "仅跟随同源，最多 3 次"],
  ]);
  const tls = checkbox("验证 TLS 证书", settings.tls_verify ?? true);
  const redaction = selectField("证据脱敏", settings.evidence_redaction || "standard", [["strict", "严格"], ["standard", "标准"], ["none", "关闭"]]);
  const publicKey = input("RS/HS 混淆测试公钥（PEM，可选）", "textarea", settings.public_key || "");
  const group = (title, ...children) => {
    const { section } = card(title);
    section.append(...children);
    return section;
  };
  const grid = (...fields) => {
    const node = element("div", undefined, "jwt-field-grid");
    node.append(...fields.map((field) => field.label));
    return node;
  };
  const save = button("保存设置", "primary");
  save.type = "submit";
  const saved = element("span", undefined, "jwt-saved");
  saved.append(icon("check"), element("span", "已保存"));
  saved.hidden = true;
  const actions = element("div", undefined, "jwt-form-actions");
  actions.append(saved, save);
  form.append(header,
    group("字典", common.label, rockyou.label, customPaths.label),
    group("主动请求", grid(rate, timeout), grid(concurrency, requestCount), redirect.label, tls.label),
    group("证据与密钥", redaction.label, publicKey.label),
    actions);
  form.addEventListener("input", () => { saved.hidden = true; }, { signal });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const wordlists = [common.input.checked ? "jwt-common" : null,
                       rockyou.input.checked ? "rockyou" : null,
                       customPaths.input.value.trim() ? "custom" : null].filter(Boolean);
    const numbers = [boundedInput(rate, 1, 60), boundedInput(timeout, 1, 60), boundedInput(concurrency, 1, 8), boundedInput(requestCount, 1, 100)];
    if (numbers.includes(null)) return;
    const value = {
      ...settings, wordlists, rockyou_enabled: rockyou.input.checked,
      custom_wordlists: customPaths.input.value.split("\n").map((path) => path.trim()).filter(Boolean),
      rate_limit: numbers[0],
      request_timeout_seconds: numbers[1],
      max_concurrent_jobs: numbers[2],
      max_requests_per_job: numbers[3],
      tls_verify: tls.input.checked, redirect_policy: redirect.input.value, evidence_redaction: redaction.input.value,
      public_key: publicKey.input.value,
      retention: "permanent",
      listener_enabled: false,
    };
    save.disabled = true;
    try {
      await host.request("xsec.plugin.config.set", { key: "analysis", value });
    } finally {
      save.disabled = false;
    }
    if (signal.aborted) return;
    console.info("settings.saved", { wordlistCount: value.wordlists.length, rateLimit: value.rate_limit });
    saved.hidden = false;
  }, { signal });
  root.replaceChildren(form);
}
function checkbox(labelText, checked) {
  const label = element("label", undefined, "jwt-check");
  const inputNode = document.createElement("input");
  inputNode.type = "checkbox";
  inputNode.checked = checked;
  label.append(inputNode, element("span", labelText));
  return { label, input: inputNode };
}
function input(labelText, type, value, help) {
  const label = element("label", undefined, "jwt-field");
  label.append(element("span", labelText));
  const inputNode = document.createElement(type === "textarea" ? "textarea" : "input");
  if (type === "textarea") inputNode.rows = 4;
  else inputNode.type = type;
  inputNode.value = value;
  const note = element("small", help || "");
  note.hidden = !help;
  label.append(inputNode, note);
  return { label, input: inputNode, note, help: help || "" };
}
function selectField(labelText, value, options) {
  const label = element("label", undefined, "jwt-field");
  label.append(element("span", labelText));
  const select = document.createElement("select");
  for (const [key, title] of options) {
    const option = element("option", title);
    option.value = key;
    select.append(option);
  }
  select.value = value;
  label.append(select);
  return { label, input: select };
}
// 越界或不是整数时在字段下面说明并返回 null，这次保存不提交。
function boundedInput(field, min, max) {
  const value = Number(field.input.value);
  const valid = field.input.value.trim() !== "" && Number.isInteger(value) && value >= min && value <= max;
  field.label.classList.toggle("invalid", !valid);
  field.note.classList.toggle("error", !valid);
  field.note.textContent = valid ? field.help : `请输入 ${min} 到 ${max} 的整数`;
  field.note.hidden = valid && !field.help;
  return valid ? value : null;
}

export async function activate(host) {
  ensureStyles();
  console.debug("frontend.activate", { apiVersion: host.apiVersion });
  let mountedRoot;
  let view;
  let disposed = false;
  const render = async (context) => {
    if (disposed) throw new Error("JWT frontend has been disposed");
    if (!mountedRoot) throw new Error("JWT frontend must be mounted before updating context");
    view?.abort();
    const current = new AbortController();
    view = current;
    const content = element("div");
    mountedRoot.replaceChildren(content);
    if (context?.kind === "settings-page" || context?.settings?.page === "settings") {
      await renderSettings(host, content, current.signal);
    } else {
      await renderWorkspace(host, content, context, current.signal);
    }
  };
  return {
    async mount(root, context) {
      if (disposed) throw new Error("JWT frontend has been disposed");
      if (mountedRoot) throw new Error("JWT frontend is already mounted");
      mountedRoot = root;
      console.info("workspace.mount", { projectId: context?.project?.projectId });
      await render(context);
    },
    async update(context) {
      console.debug("workspace.update", { projectId: context?.project?.projectId });
      await render(context);
    },
    dispose() {
      disposed = true;
      view?.abort();
      mountedRoot?.replaceChildren();
      mountedRoot = undefined;
      console.debug("frontend.dispose");
    },
  };
}
