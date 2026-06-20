#!/bin/bash
# ============================================
# 修复缩略图变形 - VPS 执行脚本
# 改为 scale=640:-1 (保持原比例不填充)
# CSS object-fit:cover 负责裁剪到 16:9
# ============================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

UPLOAD_DIR="/home/videoshowcase/uploads"
THUMB_DIR="/home/videoshowcase/thumbnails"
SERVER_JS="/home/videoshowcase/server.js"

echo -e "${CYAN}========================================"
echo "  缩略图变形修复"
echo -e "========================================${NC}"

# 1. 备份并删除旧缩略图
echo -e "${YELLOW}[1/3] 清理旧缩略图...${NC}"
OLD_COUNT=$(ls "$THUMB_DIR"/*.jpg 2>/dev/null | wc -l)
if [ "$OLD_COUNT" -gt 0 ]; then
    echo "  发现 ${OLD_COUNT} 个旧缩略图，删除中..."
    rm -f "$THUMB_DIR"/*.jpg
    echo -e "  ${GREEN}已清理 ✓${NC}"
else
    echo "  无需清理"
fi

# 2. 更新 server.js 中的 ffmpeg 命令
echo -e "${YELLOW}[2/3] 更新 ffmpeg 参数...${NC}"
if grep -q "force_original_aspect_ratio=decrease" "$SERVER_JS" 2>/dev/null; then
    cp "$SERVER_JS" "${SERVER_JS}.backup_$(date +%Y%m%d_%H%M%S)"
    # 替换所有旧的 ffmpeg 缩放滤镜
    sed -i 's/scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)\/2:(oh-ih)\/2/scale=640:-1/g' "$SERVER_JS"
    echo -e "  ${GREEN}server.js 已更新 ✓${NC}"
else
    echo -e "  ${GREEN}server.js 无需更新 (命令已是新版) ✓${NC}"
fi

# 3. 重新生成所有缩略图（新版命令：scale=640:-1）
echo -e "${YELLOW}[3/3] 重新生成缩略图...${NC}"

COUNT=0
TOTAL=0
for f in "$UPLOAD_DIR"/*; do
    ext="${f##*.}"
    ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
    [[ "$ext" =~ ^(mp4|webm|mov|avi|mkv)$ ]] || continue
    TOTAL=$((TOTAL + 1))
done

echo "  共 ${TOTAL} 个视频待处理"

for f in "$UPLOAD_DIR"/*; do
    ext="${f##*.}"
    ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
    [[ "$ext" =~ ^(mp4|webm|mov|avi|mkv)$ ]] || continue
    COUNT=$((COUNT + 1))
    FNAME=$(basename "$f")
    THUMB_FILE=$(echo -n "$FNAME" | md5sum | cut -d' ' -f1).jpg
    THUMB_PATH="$THUMB_DIR/$THUMB_FILE"

    # 新命令：缩放宽度为640，高度自动保持比例，不填充
    ffmpeg -y -ss 1 -i "$f" -vframes 1 -vf "scale=640:-1" -q:v 5 "$THUMB_PATH" 2>/dev/null
    if [ -f "$THUMB_PATH" ]; then
        SIZE=$(stat -c%s "$THUMB_PATH" 2>/dev/null || echo "?")
        echo "  [$COUNT/$TOTAL] ✓ $FNAME ($SIZE bytes)"
    else
        echo -e "  ${RED}[$COUNT/$TOTAL] ✗ $FNAME 失败${NC}"
    fi
done

echo ""
echo -e "${GREEN}========================================"
echo "  修复完成！"
echo -e "========================================${NC}"
echo ""
echo "  新缩略图: scale=640:-1 (保持原比例)"
echo "  CSS: object-fit: cover (裁剪到16:9容器)"
echo ""
echo "  重启 Express 使 server.js 生效:"
echo "    pm2 restart videoshowcase"
echo ""
