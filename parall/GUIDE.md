# Parall 只读 Adapter 使用指南

`pinix/parall@0.2.0` 面向 Parall Web workspace 的只读数据面。命令契约来自 Server source-exact 基线：

- commit: `30c4a38f8fc0b570825f309f5118d83d0a088a53`
- tree: `d4e85bc8cd41072b3c136d4349e160fecd3da158`

这证明请求路径、参数、成功 DTO、分页和错误语义在该源码基线中存在，不证明某个线上环境已经部署同一 commit，也不证明当前账号拥有相应权限。

本版本覆盖 adapter-focused source map 中已确认的 Web workspace GET 路由。它不包含 Clip Registry/managed keys/browser aliases/readiness/grants/executions，不包含任何 POST/PATCH/PUT/DELETE，不包含 Agent-self-only 的 `/agents/me`，也不暴露已弃用的全局 Agent Step 查询。source map 未冻结 DTO 的 Agent runtime/provider/avatar 子路由同样不纳入，避免把存在的路由误写成稳定 Adapter contract。

## 发现与前置条件

先发现在线 Edge 和命令契约，再执行：

```bash
PINIX=/tmp/pinixc
EDGE=work-macbook-air       # 替换成 edge list 当前返回的名称
PROFILE=default             # 替换成用户明确选择的 Parall profile

$PINIX edge list --json
$PINIX site parall --help --json
$PINIX site parall tasks --help --json
```

查看 help 不需要 profile；真正执行命令需要显式 Edge 和 profile：

```bash
$PINIX --edge "$EDGE" site parall orgs --profile "$PROFILE" --envelope v1
```

Adapter 在 `app.parall.com` 页面上下文发起 `credentials=include` 的 GET 请求，API origin 是 Adapter 的显式配置，不由 Pinix 推断。Adapter 不读取 localStorage、cookie 或 JWT，也不把凭证送入 Node VM、connector、日志或结果。

若目标 API 只接受 Bearer，页面 session 请求会返回 `AUTH_REQUIRED` 并停止。当前没有受支持的 Human JWT bridge；不要从浏览器存储提取凭证来绕过这个边界。

## 基本工作流

先取组织，再把 `org_id` 显式传给组织级命令：

```bash
$PINIX --edge "$EDGE" site parall orgs \
  --profile "$PROFILE" --envelope v1 > /tmp/parall-orgs.json

ORG_ID=$(jq -r '.data.orgs[0].id' /tmp/parall-orgs.json)

$PINIX --edge "$EDGE" site parall projects \
  --profile "$PROFILE" --org_id "$ORG_ID" --envelope v1

$PINIX --edge "$EDGE" site parall tasks \
  --profile "$PROFILE" --org_id "$ORG_ID" \
  --project_id prj_xxx --limit 50 --envelope v1
```

参数使用下划线形式，例如 `--org_id`、`--project_id`、`--thread_root_id`。Adapter 不从页面当前选项猜组织或项目。

## 命令目录

### 身份、组织与成员

| 命令 | 读取内容 | 必需参数 |
|---|---|---|
| `me` | 当前 session 用户的非凭证摘要 | 无 |
| `orgs` | 当前 principal 可见组织 | 无 |
| `org` | 单个组织详情 | `org_id` |
| `members` | 当前组织成员 | `org_id` |
| `former-members` | 已移除成员 ID | `org_id` |
| `member-profile` | 成员公开 profile | `org_id`, `user_id` |
| `agent-instructions` | 授权可见的私有 Agent instructions；no-store | `org_id`, `agent_id` |
| `agent-manager` | Agent manager 投影 | `org_id`, `agent_id` |

### 项目

| 命令 | 读取内容 | 必需参数 |
|---|---|---|
| `projects` | 当前 principal 可读项目 | `org_id` |
| `project-summary` | 项目任务状态汇总 | `org_id` |
| `project-library` | 可发现项目 library | `org_id` |
| `project` | 单项目详情 | `org_id`, `project_id` |
| `project-join-requests` | 项目加入申请；需要 manager 权限 | `org_id`, `project_id` |
| `project-members` | 项目 roster | `org_id`, `project_id` |
| `project-readers` | 当前可读用户 ID | `org_id`, `project_id` |

### 任务与 Inbox

| 命令 | 读取内容 | 必需参数 |
|---|---|---|
| `tasks` | 组织任务分页列表 | `org_id` |
| `task` | 单任务详情 | `org_id`, `task_id` |
| `task-subtask-summary` | 子任务计数摘要 | `org_id` |
| `task-subtasks` | 单任务的子任务分页列表 | `org_id`, `task_id` |
| `task-watchers` | 任务 watchers | `org_id`, `task_id` |
| `task-relations` | 任务出发的 relations | `org_id`, `task_id` |
| `target-task-relations` | 指向 target 的 task relations | `org_id`, `target_type`, `target_id` |
| `member-tasks` | 成员的固定 pending-assignee 视图 | `org_id`, `member_id` |
| `agent-tasks` | Agent 的固定 pending-assignee 视图 | `org_id`, `agent_id` |
| `inbox` | 当前用户 Inbox 分页列表 | `org_id` |
| `inbox-unread-count` | 当前用户 Inbox 未读数 | `org_id` |

`tasks` 支持 `q,status,priority,assignee_id,creator_id,parent_id,project_id,label_ids,scope,sort,order,limit,cursor`。`parent_id` 是父任务 ID；项目过滤必须用 `project_id`。默认 `parent_id=null` 只取顶层任务。`limit` 默认 50、上限 200。

`member-tasks` 和 `agent-tasks` 由 Server 固定为 `todo,in_progress` 的待处理视图，不应解释为成员/Agent 的全部任务历史。

### Chat 与 Message

| 命令 | 读取内容 | 必需参数 |
|---|---|---|
| `chats` | 组织 Chat 分页列表 | `org_id` |
| `discoverable-chats` | 可发现 Chat | `org_id` |
| `chat` | 单 Chat 详情 | `org_id`, `chat_id` |
| `chat-members` | Chat 成员 | `org_id`, `chat_id` |
| `member-chats` | 与指定成员共同可见的 Chat | `org_id`, `member_id` |
| `messages` | Chat 消息分页列表 | `org_id`, `chat_id` |
| `message` | 单 Message | `message_id` |
| `message-replies` | Message replies | `message_id` |
| `message-watchers` | Thread watchers | `message_id` |
| `message-watching` | 当前用户是否 watching | `message_id` |

`chats` 支持 `scope=active|archived|all,limit,cursor`。`messages` 支持 `before`（或 legacy `cursor`）、`after`、`thread_root_id`、`since`、`limit`；`before` 和 `after` 互斥。

`message-replies` 的 exact Server handler 会返回 `has_more`，但不返回 `next_cursor`。此时 envelope 为 `partial / pagination_cursor_unavailable`；不要发明 cursor 或自动声称能继续翻页。

### Agent、Session 与 Step

| 命令 | 读取内容 | 必需参数 |
|---|---|---|
| `agents` | 组织 Agent 与运行投影 | `org_id` |
| `agent-activity` | Agent 最近 Message 活动 | `org_id`, `agent_id` |
| `agent-monitor` | Agent runtime monitor 投影 | `org_id`, `agent_id` |
| `agent-sessions` | Agent Session 分页列表 | `org_id`, `agent_id` |
| `agent-session` | 单 Session | `org_id`, `agent_id`, `session_id` |
| `agent-session-steps` | Session Step 分页列表 | `org_id`, `agent_id`, `session_id` |
| `agent-step` | 单 Step | `org_id`, `agent_id`, `session_id`, `step_id` |

Session 枚举只对治理级 principal 开放。具体 Session/Step 也可能通过 Chat/Task anchored context 返回脱敏或摘要投影。Adapter 保留 Server 返回，不把“能读取”升级为“拥有治理权限”，也不把摘要投影当完整 raw Step。

## 输出与分页

默认输出解包为 legacy data，供已有脚本兼容读取：

```bash
$PINIX --edge "$EDGE" site parall orgs --profile "$PROFILE"
```

需要判断有效参数、分页、完整性、来源和权限边界时使用 envelope v1：

```bash
$PINIX --edge "$EDGE" site parall tasks \
  --profile "$PROFILE" --org_id "$ORG_ID" --limit 50 --envelope v1
```

| Envelope 字段 | 诚实解释 |
|---|---|
| `status` | 本次 Adapter 执行状态，不是资源业务状态 |
| `data` | legacy 数据；对象字段来自 endpoint-specific decoder |
| `completeness` | `complete`、`partial` 或 `empty`，只基于当前响应的直接证据 |
| `reason` | `complete`、`no_results`、`pagination_available`、`pagination_cursor_unavailable` 等 |
| `command.requested_args` | 调用方原始参数，经过 Edge 安全处理 |
| `command.effective_args` | Adapter 实际采用的规范化参数 |
| `source` | 已脱敏的 canonical API endpoint；不是部署版本证明 |
| `pagination` | 当前页 `limit/returned/has_more/next_cursor`，若 Server 实际提供 |
| `auth` | 需要认证；`authenticated_as` 保持 `unknown` |
| `warnings` | 私有 workspace、profile 非身份、治理投影和分页限制 |
| `runtime` | Pinix 执行信息，不是 Parall 数据更新时间 |

有 `next_cursor` 时原样传回同一命令，不解析 cursor。`has_more=true` 但缺 cursor 时停止并报告无法继续。`observed_at`/`retrieved_at` 只是读取时刻，不是项目、任务、Message 或 Session 的 provider freshness。

## 错误与重试

| code | 处理 |
|---|---|
| `INVALID_ARGUMENT` | 修正缺失/格式错误参数后再执行 |
| `INVALID_RESPONSE` | Server 成功响应与 source-exact DTO 不符；不能当 empty |
| `AUTH_REQUIRED` | 页面 session 无法授权；不要提取 JWT 或自行补 bridge |
| `FORBIDDEN` | 当前 principal 无资源权限 |
| `NOT_FOUND` | 资源缺失，或 Server 为防枚举隐藏不可读资源 |
| `RATE_LIMITED` | 遵守 `Retry-After` 节奏；它不是通用重试授权 |
| `NETWORK_ERROR` | 页面请求未完成；不是空 workspace |
| `EDGE_ERROR` | 页面/Edge 未 ready 或断连；不是空结果 |

Server canonical error 是 `{error:{code,message,status,action?,resource_uri?,approvable?,details?}}`。Adapter 保留已确认字段并递归脱敏 details；`action` 是尝试的动作，不是恢复提示。Server 不自动处理 401 refresh，Adapter 也不盲目重试。

## 安全与已知限制

- 所有命令是 GET-only、`side_effect=read_only`，并声明 `max_concurrency=1`；元数据不等于运行时自动加锁，调用方仍应串行。
- profile 只选择 browser session，不能证明账号身份；`authenticated_as` 保持 `unknown`。
- 返回数据属于私有 workspace。Adapter 递归屏蔽 token、secret、API key、cookie、authorization、password、JWT 等字段。
- source URL 去除 userinfo、fragment，以及 cursor/before/after/query/credential 类参数。
- Agent instructions 是 no-store 数据；Session/Step 可能是治理级或 context-redacted 投影，应按 warnings 最小化保留和传播。
- 该 source map 不证明 production/staging 的部署 commit、feature flag、用户角色或 grant。
- 当前未提供受支持的 bearer-only Human API session。出现 `AUTH_REQUIRED` 时必须停止并路由安全 credential integration 设计，不能在 Adapter 内读取浏览器 JWT。
