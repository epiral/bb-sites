# B站吃瓜日报分析流程

从黄泉路人俊的吃瓜日报中获取涨粉榜 UP 主，查询其收藏最高的视频。

## 环境准备

### 1. 安装 bb-browser

```bash
npm install -g bb-browser
```

需要 Node.js 环境。安装后运行 `bb-browser --version` 验证。

### 2. 安装 Chrome 扩展

bb-browser 通过 Chrome 扩展与浏览器通信。首次运行 `bb-browser status` 会提示安装方式。安装扩展后确保已启用。

### 3. 安装 bb-sites adapter 库

```bash
# 从 fork 安装（包含本文档所需的全部脚本）
git clone -b feat/bilibili-opus https://github.com/shing19/bb-sites.git ~/.bb-browser/bb-sites

# 或者从上游安装（PR 合并后可用）
# git clone https://github.com/epiral/bb-sites.git ~/.bb-browser/bb-sites
```

### 4. 安装 bb-user-videos 快捷命令

```bash
mkdir -p ~/bin
chmod +x ~/.bb-browser/bb-sites/bilibili/user-videos.sh
ln -sf ~/.bb-browser/bb-sites/bilibili/user-videos.sh ~/bin/bb-user-videos

# 确保 ~/bin 在 PATH 中
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 5. 登录 B站

在 Chrome 浏览器中打开 [bilibili.com](https://www.bilibili.com) 并登录账号。所有 API 调用依赖浏览器 Cookie，未登录会导致大部分接口失败。

### 6. 启动 bb-browser

```bash
bb-browser status   # 检查是否运行
bb-browser start    # 如未运行则启动（前台模式）
```

## 执行流程

### Step 1: 获取吃瓜日报最新文章

```bash
bb-browser site bilibili/user-opus 582046218
```

返回 JSON 列表。找到第一条（最新）的 `id`，如 `1179671385624018945`。

### Step 2: 读取文章正文

```bash
bb-browser site bilibili/opus 1179671385624018945
```

返回 `article.content` 字段包含完整正文。涨粉榜部分格式如下：

```
3月13日涨粉榜(排除官方与抽奖涨粉，总粉丝数为专栏截稿时的粉丝数)
第一名拉挖稀的空间 (+3.09万 总粉:178.73万) 知识 生活up
第二名荒蛋记录员的空间 (+2.42万 总粉:15.90万) ai 动物圈up
...
```

### Step 3: 通过搜索反查 UP 主 mid

文章正文是纯文本，不包含 mid，需要搜索获取：

```bash
bb-browser site bilibili/search "拉挖稀" --count 1
```

从返回的 `videos[0].author_mid` 获取 mid。**逐个查询，不要并行，避免触发限流。**

### Step 4: 获取收藏最高的视频

```bash
bb-user-videos 3546756077848946 --order stow --count 3
```

参数说明：
- `--order stow` 按收藏排序，`click` 按播放排序，`pubdate` 按最新排序
- `--count N` 返回前 N 个视频

返回示例：
```json
{
  "user": "拉挖稀",
  "mid": "3546756077848946",
  "order": "stow",
  "count": 3,
  "videos": [
    {
      "bvid": "BV15NBcBpE3a",
      "title": "失去了才会懂得珍惜，最后绽放一次",
      "play": "485.0万",
      "danmaku": "5.6万",
      "duration": "00:36",
      "url": "https://www.bilibili.com/video/BV15NBcBpE3a"
    }
  ]
}
```

## 新增文件说明

| 文件 | 类型 | 说明 |
|------|------|------|
| `bilibili/opus.js` | site adapter | 读取单篇 opus/图文/专栏完整内容（含文章正文 HTML→文本转换） |
| `bilibili/user-opus.js` | site adapter | 列出指定用户的图文动态列表（按时间倒序，自动过滤非图文类型） |
| `bilibili/user-videos.sh` | shell 脚本 | 获取用户视频列表，支持按收藏/播放/最新排序 |
| `bilibili/_parse_user_videos.py` | 辅助脚本 | 解析 `bb-browser snapshot` 输出，提取视频标题、播放量、BV号 |

## 注意事项

### 为什么 user-videos 是 shell 脚本而不是 site adapter

B站用户空间视频列表 API (`x/space/wbi/arc/search`) 需要 wbi 签名。site adapter 通过 `fetch()` 直接调用会被拒绝（返回"请求过于频繁"）。只有让页面自己的 JS 发起请求才能带上正确签名。

因此 `user-videos` 采用三步走：
1. `bb-browser open` — 导航到用户空间页面
2. `bb-browser eval` — 点击"最多收藏"排序按钮，触发页面自带签名的 API 请求
3. `bb-browser snapshot` — 从渲染后的 DOM 提取视频数据

这个流程无法在单次 eval 中完成（导航会销毁 eval 上下文），所以封装成 shell 脚本。

### 其他踩坑记录

- **排序按钮无法通过 snapshot ref 点击**：页面上"最新发布/最多播放/最多收藏"渲染为纯文本节点，没有 ref。解决方法是 `bb-browser eval` 遍历 DOM 按文本内容匹配并 `.click()`。
- **URL 参数 `?order=stow` 无效**：B站用户空间页面忽略 URL 中的排序参数，实际 API 请求始终用默认排序。必须通过点击按钮触发。
- **snapshot 中播放/弹幕图标是 Unicode 私有字符**：`\ue015` 代表播放图标，`\ue017` 代表弹幕图标。解析时需用这两个字符作为分隔符，不能用空格。
- **文章正文中 UP 主名称没有 mid 链接**：涨粉榜文本只有"拉挖稀的空间"这样的纯文本，不含 `space.bilibili.com/<mid>` 链接，需通过搜索接口反查。
- **`~/.bb-browser/bb-sites` 必须是 git 仓库**：如果手动 `cp` 文件进去，`bb-browser site update` 会失败。始终通过 `git clone` 安装。
- **shell 脚本通过符号链接执行时路径解析问题**：`$0` 指向符号链接而非源文件，同目录的 Python 辅助脚本找不到。需用 `readlink -f` 解析真实路径。
