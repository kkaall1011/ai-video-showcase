#!/bin/bash
# ===================================================
# VPS 缩略图全面修复
# 1. 安装 ffmpeg  2. 添加 API 路由  3. 生成缩略图  4. 重启
# ===================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SERVER_JS="/opt/videoshowcase/server.js"
THUMB_DIR="/opt/videoshowcase/data/thumbnails"
VIDEO_DIR="/opt/videoshowcase/data/videos"

echo -e "${YELLOW}========================================="
echo "   VPS 缩略图全面修复"
echo -e "=========================================${NC}"

# ====== 1. Install ffmpeg ======
echo -e "\n${YELLOW}[1/5] 安装 ffmpeg...${NC}"
if command -v ffmpeg &>/dev/null; then
    echo -e "  ${GREEN}ffmpeg 已安装: $(ffmpeg -version 2>&1 | head -1)${NC}"
else
    apt-get update -qq
    apt-get install -y -qq ffmpeg
    echo -e "  ${GREEN}ffmpeg 安装完成: $(ffmpeg -version 2>&1 | head -1)${NC}"
fi

# ====== 2. Create thumbnail dir ======
echo -e "\n${YELLOW}[2/5] 创建缩略图目录...${NC}"
mkdir -p "$THUMB_DIR"
echo -e "  ${GREEN}目录: $THUMB_DIR${NC}"

# ====== 3. Patch server.js ======
echo -e "\n${YELLOW}[3/5] 添加缩略图 API 到 server.js...${NC}"

if grep -q '/api/videos/:id/thumbnail' "$SERVER_JS" 2>/dev/null; then
    echo -e "  ${GREEN}server.js 已有缩略图路由，跳过${NC}"
else
    # Backup
    cp "$SERVER_JS" "${SERVER_JS}.bak_$(date +%Y%m%d_%H%M%S)"
    
    # Find the insertion point (before app.listen)
    LISTEN_LINE=$(grep -n 'app.listen' "$SERVER_JS" | head -1 | cut -d: -f1)
    
    if [ -n "$LISTEN_LINE" ]; then
        INSERT_LINE=$((LISTEN_LINE - 1))
        
        # Create the thumbnail route code
        cat > /tmp/thumb_insert.txt << 'THUMBEOF'

// ===== THUMBNAIL SUPPORT =====
const THUMB_DIR = path.join(DATA_DIR, 'thumbnails');
if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });

// Generate thumbnail using ffmpeg (scale=640:-1 keeps aspect ratio)
function generateThumbnail(videoPath, videoId) {
    const thumbFile = videoId + '.jpg';
    const thumbPath = path.join(THUMB_DIR, thumbFile);
    if (fs.existsSync(thumbPath)) return thumbPath;
    try {
        require('child_process').execSync(
            'ffmpeg -y -ss 1 -i "' + videoPath + '" -vframes 1 -vf "scale=640:-1" -q:v 5 "' + thumbPath + '" 2>/dev/null',
            { timeout: 15000 }
        );
    } catch(e) { /* skip on error */ }
    return fs.existsSync(thumbPath) ? thumbPath : null;
}

// Serve thumbnail images
app.get('/api/videos/:id/thumbnail', (req, res) => {
    const videoId = req.params.id;
    const thumbPath = path.join(THUMB_DIR, videoId + '.jpg');
    
    if (fs.existsSync(thumbPath)) {
        return res.sendFile(path.resolve(thumbPath));
    }
    
    // Generate on-demand
    db.get('SELECT file_path FROM videos WHERE id = ?', [videoId], (err, row) => {
        if (err || !row || !fs.existsSync(row.file_path)) {
            return res.status(404).json({ error: 'Thumbnail not available' });
        }
        const generated = generateThumbnail(row.file_path, videoId);
        if (generated && fs.existsSync(generated)) {
            return res.sendFile(path.resolve(generated));
        }
        res.status(404).json({ error: 'Could not generate thumbnail' });
    });
});

// Add thumbnail field to video list API responses
app.use('/api/videos', (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function(data) {
        if (Array.isArray(data)) {
            data = data.map(v => ({
                ...v,
                thumbnail: '/api/videos/' + (v.id || v._id) + '/thumbnail'
            }));
        } else if (data && data.id) {
            data.thumbnail = '/api/videos/' + data.id + '/thumbnail';
        }
        return originalJson(data);
    };
    next();
});
// ===== END THUMBNAIL =====
THUMBEOF

        sed -i "${INSERT_LINE}r /tmp/thumb_insert.txt" "$SERVER_JS"
        echo -e "  ${GREEN}server.js 已添加缩略图路由 (line $INSERT_LINE)${NC}"
    else
        echo -e "  ${RED}找不到 app.listen 行，追加到文件末尾${NC}"
        cat /tmp/thumb_insert.txt >> "$SERVER_JS"
    fi
fi

# ====== 4. Generate all thumbnails ======
echo -e "\n${YELLOW}[4/5] 生成缩略图 (scale=640:-1 保持原比例)...${NC}"

OK=0
FAIL=0
for f in "$VIDEO_DIR"/*.mp4; do
    [ -f "$f" ] || continue
    VID=$(basename "$f" .mp4)
    THUMB="$THUMB_DIR/${VID}.jpg"
    
    ffmpeg -y -ss 1 -i "$f" -vframes 1 -vf "scale=640:-1" -q:v 5 "$THUMB" 2>/dev/null
    
    if [ -f "$THUMB" ]; then
        OK=$((OK + 1))
    else
        FAIL=$((FAIL + 1))
        echo -e "  ${RED}FAIL: $VID${NC}"
    fi
done

echo -e "  ${GREEN}完成: $OK 成功, $FAIL 失败${NC}"

# ====== 5. Restart ======
echo -e "\n${YELLOW}[5/5] 重启服务...${NC}"
pm2 restart videoshowcase
sleep 2
pm2 status | head -12

# ====== Verify ======
THUMB_COUNT=$(ls "$THUMB_DIR"/*.jpg 2>/dev/null | wc -l)
echo -e "\n${GREEN}========================================="
echo "  修复完成!"
echo "  缩略图数量: $THUMB_COUNT"
echo "  生成参数: scale=640:-1 (保持原比例)"
echo "  CSS: object-fit: cover (16:9 容器裁剪)"
echo -e "=========================================${NC}"
