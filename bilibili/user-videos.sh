#!/usr/bin/env bash
# bilibili/user-videos - 获取指定用户的视频列表（支持按收藏/播放/最新排序）
#
# 用法:
#   bb-user-videos <mid> [--order stow|click|pubdate] [--count N]
#
# 示例:
#   bb-user-videos 1532165                          # papi酱, 默认按最新
#   bb-user-videos 1532165 --order stow             # 按收藏排序
#   bb-user-videos 1532165 --order stow --count 10  # 前10个
#   bb-user-videos 1532165 --order click --count 3   # 播放最多的3个

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")")" && pwd)"
MID=""
ORDER="pubdate"
COUNT=5

while [[ $# -gt 0 ]]; do
  case "$1" in
    --order) ORDER="$2"; shift 2 ;;
    --count) COUNT="$2"; shift 2 ;;
    --help|-h)
      echo "用法: bb-user-videos <mid> [--order stow|click|pubdate] [--count N]"
      echo ""
      echo "排序:"
      echo "  pubdate  最新发布 (默认)"
      echo "  click    最多播放"
      echo "  stow     最多收藏"
      exit 0
      ;;
    *) MID="$1"; shift ;;
  esac
done

if [[ -z "$MID" ]]; then
  echo "错误: 缺少 mid 参数" >&2
  echo "用法: bb-user-videos <mid> [--order stow|click|pubdate] [--count N]" >&2
  exit 1
fi

ORDER_LABEL=""
case "$ORDER" in
  pubdate) ORDER_LABEL="最新发布" ;;
  click)   ORDER_LABEL="最多播放" ;;
  stow)    ORDER_LABEL="最多收藏" ;;
  *)       echo "错误: 未知排序 '$ORDER'，可选: pubdate, click, stow" >&2; exit 1 ;;
esac

# 1. 导航到用户空间
bb-browser open "https://space.bilibili.com/${MID}/video" --tab current > /dev/null 2>&1
sleep 3

# 2. 点击排序按钮
bb-browser eval "document.querySelectorAll('*').forEach(e=>{if(e.children.length===0&&e.textContent.trim()==='${ORDER_LABEL}')e.click()})" > /dev/null 2>&1
sleep 2

# 3. 从 snapshot 提取视频列表
bb-browser snapshot --compact --depth 5 2>&1 | python3 "${SCRIPT_DIR}/_parse_user_videos.py" "$MID" "$ORDER" "$COUNT"
