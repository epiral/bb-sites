#!/usr/bin/env python3
"""Parse bb-browser snapshot output to extract video list."""
import sys, re, json

def main():
    mid = sys.argv[1]
    order = sys.argv[2]
    count = int(sys.argv[3])

    lines = sys.stdin.read()
    all_lines = lines.split('\n')

    url_re = re.compile(r'/url: //www\.bilibili\.com/video/(BV\w+)')
    # Bilibili uses private-use Unicode chars as icon fonts: \ue015=play, \ue017=danmaku
    # Pattern: TITLE \ue015 PLAY \ue017 DANMAKU DURATION
    stat_re = re.compile(r'(.+?)\s*\ue015\s*([\d.]+万?)\s*\ue017\s*([\d.]+万?)\s+(\d+:\d+)')

    videos = []
    seen_bvids = set()

    for i, line in enumerate(all_lines):
        if len(videos) >= count:
            break
        if 'link ' not in line or 'ref=' not in line:
            continue
        stat_m = stat_re.search(line)
        if not stat_m:
            continue
        bvid = None
        for j in range(i + 1, min(i + 3, len(all_lines))):
            url_m = url_re.search(all_lines[j])
            if url_m:
                bvid = url_m.group(1)
                break
        if bvid and bvid not in seen_bvids:
            seen_bvids.add(bvid)
            title_raw = stat_m.group(1)
            title_clean = re.sub(r'^.*?link\s+"', '', title_raw).strip()
            if not title_clean:
                title_clean = title_raw.strip()
            videos.append({
                'bvid': bvid,
                'title': title_clean,
                'play': stat_m.group(2),
                'danmaku': stat_m.group(3),
                'duration': stat_m.group(4),
                'url': 'https://www.bilibili.com/video/' + bvid
            })

    title_match = re.search(r'rootWebArea "(.+?)投稿视频', lines)
    user_name = title_match.group(1) if title_match else mid

    print(json.dumps({
        'user': user_name, 'mid': mid, 'order': order,
        'count': len(videos), 'videos': videos
    }, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
