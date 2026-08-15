# Parall 只读 Adapter 使用指南

`pinix/parall` 用 Pinix Edge 读取当前浏览器 profile 中已登录 Parall workspace 的数据。
它只提供只读命令，不发送消息、不修改项目或任务、不创建资源，也不处理登录凭证。

## 前置条件

先查看可用 Edge，并显式选择一个在线 Edge：

```bash
PINIX=/tmp/pinixc
EDGE=work-macbook-air       # 替换为 edge list 中当前在线的名称
PROFILE=default             # 替换为已登录 Parall 的 profile

$PINIX edge list --json
$PINIX --edge "$EDGE" browser open https://app.parall.com --profile "$PROFILE"
```

打开页面只用于确认 profile 的 Parall session。profile 选择浏览器会话，但不独立证明当前账号身份。

确认 alias 和命令目录：

```bash
$PINIX site list
$PINIX --edge "$EDGE" site parall --help
$PINIX --edge "$EDGE" site parall projects --help
```

所有 Parall 命令都要显式传 `--profile`。命令之间串行执行；不要在同一 profile/Edge 上并发调用。

## 组织与项目

`me` 和 `orgs` 是全局命令，不需要组织 ID：

```bash
$PINIX --edge "$EDGE" site parall me --profile "$PROFILE" --envelope v1
$PINIX --edge "$EDGE" site parall orgs --profile "$PROFILE" --envelope v1 > /tmp/parall-orgs.json
```

从 `orgs` 结果取得组织 ID 后，组织级命令必须显式传 `--org_id`。Adapter 不会猜测或复用页面当前选中的组织：

```bash
ORG_ID=$(jq -r '.data.orgs[0].id' /tmp/parall-orgs.json)

$PINIX --edge "$EDGE" site parall projects \
  --profile "$PROFILE" --org_id "$ORG_ID" --envelope v1

$PINIX --edge "$EDGE" site parall project-summary \
  --profile "$PROFILE" --org_id "$ORG_ID" --envelope v1

$PINIX --edge "$EDGE" site parall tasks \
  --profile "$PROFILE" --org_id "$ORG_ID" --limit 20 --envelope v1
```

参数名使用下划线形式，例如 `--org_id`、`--assignee_id`、`--parent_id`；不要改成连字符形式。

## 命令目录

| 命令 | 作用 | 必需参数 |
|---|---|---|
| `me` | 当前 session 的用户摘要 | 无 |
| `orgs` | 当前 session 可见的组织 | 无 |
| `projects` | 组织的项目列表 | `org_id` |
| `project-summary` | 组织项目任务汇总 | `org_id` |
| `tasks` | 组织任务列表 | `org_id` |
| `inbox` | 组织通知收件箱 | `org_id` |
| `chats` | 组织聊天/频道列表 | `org_id` |
| `messages` | 某个聊天的消息 | `org_id`, `chat_id` |
| `members` | 组织成员列表 | `org_id` |
| `agents` | 组织 Agent 列表 | `org_id` |
| `agent-sessions` | 指定 Agent 的会话列表 | `org_id`, `agent_id` |

常用可选参数：

- `tasks`：`--assignee_id`、`--parent_id`、`--limit`（上限 100）、`--sort`
- `inbox`：`--limit`（上限 100）、`--cursor`
- `chats`：`--limit`（上限 200）
- `messages`：`--limit`（上限 50）、`--cursor`、`--top_level true|false`
- `agent-sessions`：`--status`、`--limit`（上限 50）、`--cursor`

`messages` 的 `chat_id` 来自 `chats`；`agent-sessions` 的 `agent_id` 来自 `agents`。

## 输出模式

默认输出保持 legacy data，适合已有脚本兼容读取：

```bash
$PINIX --edge "$EDGE" site parall orgs --profile "$PROFILE"
```

需要判断分页、完整性、有效参数和来源时，显式请求 envelope v1：

```bash
$PINIX --edge "$EDGE" site parall orgs --profile "$PROFILE" --envelope v1
```

Envelope 中的关键字段：

| 字段 | 含义 |
|---|---|
| `status` | 当前执行结果状态；`ok` 才表示 Adapter 成功返回数据 |
| `data` | Adapter 的 legacy 数据，Parall 具体对象仍在这里 |
| `completeness` | `complete`、`partial` 或 `empty`，只根据 API 返回的分页/数据证据设置 |
| `reason` | 例如 `complete`、`pagination_available`、`no_results` |
| `command.requested_args` | 调用方请求的参数 |
| `command.effective_args` | Adapter 实际采用的、已规范化的参数 |
| `source` | 对应 Parall API endpoint；已去除 cursor 等敏感查询参数 |
| `pagination` | `limit`、`returned`、`has_more`、`next_cursor` 等分页状态 |
| `auth` | `requirement: required`；`authenticated_as` 保持 `unknown` |
| `warnings` | 私有 workspace、profile 不等于账号身份、分页可用等警告 |
| `runtime` | Pinix 执行层信息，不是 Parall 数据新鲜度 |

`observed_at`/`retrieved_at` 只表示读取时间，不能解释为任务、项目或消息的更新时间。

## 分页与错误

看到 `completeness: partial` 或 `pagination.has_more: true` 时，使用返回的 `next_cursor` 继续读取；不要把当前页条数当成组织全量数据。分页 cursor 不应复制到公开报告中。

以下错误不能当作空结果：

| code | 含义 |
|---|---|
| `AUTH_REQUIRED` | profile 没有可用 Parall session，或 session 已失效 |
| `FORBIDDEN` | 当前账号没有该组织资源权限 |
| `NOT_FOUND` | 组织、聊天或 Agent 不存在 |
| `RATE_LIMITED` | Provider 限流，应降低频率后再试 |
| `NETWORK_ERROR` | API 请求未完成 |
| `EDGE_ERROR` / `EDGE_DISCONNECTED` | Pinix Edge 页面或连接异常 |
| `INVALID_ARGUMENT` | 缺少或格式错误的 ID/参数 |

运行时断开后先检查 `edge list`、profile 和页面状态，再决定是否重试。命令声明了 `max_concurrency: 1`，但这只是 Adapter 元数据；调用方仍应自行串行化。

## 数据与安全边界

- 这是当前登录 workspace 的私有数据，不是公开网页证据。
- profile/cookie 只能说明使用了某个浏览器 session，不能证明 `authenticated_as` 的具体账号。
- 不输出 access token、refresh token、cookie、邮箱等凭证；不要把原始消息、任务描述或成员资料转发到不必要的地方。
- 只支持 GET 读取路径；不包含写操作、WebSocket ticket、发送消息、创建任务、修改项目或登录流程。
- 如果结果是错误、`partial` 或 Edge 断开，不要补猜组织规模、任务总量、账号身份或数据新鲜度。
