#!/bin/bash
# ============================================
# 视频缩略图生成系统 - VPS 部署脚本
# 用法: 在 VPS 上以 root 运行
#   chmod +x setup_thumbnails.sh
#   bash setup_thumbnails.sh
# ============================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SERVER_JS="/home/videoshowcase/server.js"
UPLOAD_DIR="/home/videoshowcase/uploads"
THUMB_DIR="/home/videoshowcase/thumbnails"

echo -e "${CYAN}========================================"
echo "  视频缩略图系统 - 部署脚本"
echo -e "========================================${NC}"

# === 0. 预检 ===
echo -e "${YELLOW}[预检] 检查环境...${NC}"

if [ ! -f "$SERVER_JS" ]; then
    echo -e "${RED}错误: 找不到 server.js ($SERVER_JS)${NC}"
    exit 1
fi
echo "  server.js: ✓"

if [ ! -d "$UPLOAD_DIR" ]; then
    echo -e "${RED}错误: uploads 目录不存在 ($UPLOAD_DIR)${NC}"
    exit 1
fi
VIDEO_COUNT=$(ls "$UPLOAD_DIR"/*.{mp4,webm,mov,avi,mkv} 2>/dev/null | wc -l)
echo "  视频文件: ${VIDEO_COUNT} 个"

# === 1. 安装 ffmpeg ===
echo -e "${YELLOW}[1/6] 安装 ffmpeg...${NC}"
if command -v ffmpeg &>/dev/null; then
    FFVER=$(ffmpeg -version 2>&1 | head -1)
    echo -e "  ${GREEN}已安装: $FFVER ✓${NC}"
else
    echo "  正在安装 ffmpeg..."
    apt-get update -qq 2>/dev/null
    apt-get install -y -qq ffmpeg 2>/dev/null
    if command -v ffmpeg &>/dev/null; then
        echo -e "  ${GREEN}ffmpeg 安装成功 ✓${NC}"
    else
        echo -e "  ${RED}ffmpeg 安装失败，请手动安装${NC}"
        exit 1
    fi
fi

# === 2. 创建缩略图目录 ===
echo -e "${YELLOW}[2/6] 创建缩略图目录...${NC}"
mkdir -p "$THUMB_DIR"
chmod 755 "$THUMB_DIR"
echo -e "  ${GREEN}$THUMB_DIR ✓${NC}"

# === 3. 备份 server.js ===
echo -e "${YELLOW}[3/6] 备份 server.js...${NC}"
BACKUP="${SERVER_JS}.backup_thumb_$(date +%Y%m%d_%H%M%S)"
cp "$SERVER_JS" "$BACKUP"
echo -e "  ${GREEN}备份: $BACKUP ✓${NC}"

# === 4. 修改 server.js ===
echo -e "${YELLOW}[4/6] 修改 server.js 添加缩略图功能...${NC}"

# 在文件开头（'use strict' / require 之后）注入缩略图模块
FIRST_CODE=$(grep -n "^const\|^var\|^let\|^import\|^require\|^'use strict'\|^\"/use strict\"\|^#!/" "$SERVER_JS" | tail -1 | cut -d: -f1)
INSERT_AT=$((FIRST_CODE + 1))

# 缩略图工具模块
THUMB_MODULE=$(cat <<'ENDMOD'
// ===== 缩略图生成模块 (自动注入) =====
const THUMB_DIR = '/home/videoshowcase/thumbnails';
(function ensureThumbDir() { try { require('fs').mkdirSync(THUMB_DIR, { recursive: true }); } catch (e) {} })();

const crypto = require('crypto');
function getThumbFilename(videoFilename) {
    return crypto.createHash('md5').update(String(videoFilename)).digest('hex') + '.jpg';
}

function generateThumbnailSync(videoPath, thumbFilename) {
    const thumbPath = require('path').join(THUMB_DIR, thumbFilename);
    const fs = require('fs');
    if (fs.existsSync(thumbPath)) return thumbPath;
    try {
        require('child_process').execSync(
            'ffmpeg -y -ss 1 -i "' + videoPath + '" -vframes 1 -vf "scale=640:-1" -q:v 5 "' + thumbPath + '" 2>/dev/null',
            { timeout: 20000 }
        );
        return fs.existsSync(thumbPath) ? thumbPath : null;
    } catch (e) { return null; }
}

function generateThumbnailAsync(videoPath, thumbFilename) {
    const { spawn } = require('child_process');
    const thumbPath = require('path').join(THUMB_DIR, thumbFilename);
    const fs = require('fs');
    return new Promise((resolve, reject) => {
        if (fs.existsSync(thumbPath)) return resolve(thumbPath);
        const ff = spawn('ffmpeg', [
            '-y', '-ss', '1', '-i', videoPath,
            '-vframes', '1', '-vf', 'scale=640:-1',
            '-q:v', '5', thumbPath
        ], { timeout: 15000 });
        ff.on('close', (code) => {
            if (code === 0 && fs.existsSync(thumbPath)) resolve(thumbPath);
            else resolve(null);
        });
        ff.on('error', () => resolve(null));
        ff.stderr.on('data', () => {});
    });
}
// ===== 缩略图模块 END =====
ENDMOD
)

if grep -q "THUMB_DIR = '/home/videoshowcase/thumbnails'" "$SERVER_JS" 2>/dev/null; then
    echo -e "  ${GREEN}缩略图模块已存在，跳过 ✓${NC}"
else
    # sed 在指定行后插入
    sed -i "${INSERT_AT}a\\${THUMB_MODULE//$'\n'/\\n}" "$SERVER_JS" 2>/dev/null || {
        # sed 多行插入可能失败，用 python 替代
        python3 -c "
content = open('$SERVER_JS').read()
lines = content.split('\n')
insert_at = $INSERT_AT
module_code = '''$THUMB_MODULE'''
lines.insert(insert_at, module_code)
open('$SERVER_JS', 'w').write('\n'.join(lines))
print('OK')
"
    }
    echo -e "  ${GREEN}缩略图模块已注入 ✓${NC}"
fi

# 4b. 在视频列表 API 中添加 thumbnail 字段
echo "  检查视频列表API..."
if grep -q "thumbnail.*getThumbFilename\|item\.thumbnail\|videos\[i\]\.thumbnail" "$SERVER_JS" 2>/dev/null; then
    echo -e "  ${GREEN}视频列表已包含 thumbnail ✓${NC}"
else
    # 找到 /api/videos 或类似的路由响应处理，在构建返回对象时注入 thumbnail
    # 查找 res.json 或 res.send 附近的视频数组构建
    THUMB_FIELD_PATCH=$(cat <<'ENDPATCH'
    // 为每个视频添加缩略图URL
    const resultList = (Array.isArray(result) ? result : (result.videos || result.data || [])).map(v => {
        const fn = v.file_name || v.filename || v.fileName || '';
        if (fn) {
            v.thumbnail = '/api/videos/' + (v.id || v._id) + '/thumbnail';
        }
        return v;
    });
    // 保持原始响应格式
    let finalResult;
    if (Array.isArray(result)) finalResult = resultList;
    else if (result.videos) { result.videos = resultList; finalResult = result; }
    else if (result.data) { result.data = resultList; finalResult = result; }
    else finalResult = resultList;
    res.json(finalResult);
ENDPATCH
)

    # 尝试在 res.json 之前注入
    # 找到 /api/videos 路由中 res.json 的位置
    VIDEO_API_LINE=$(grep -n "res\.\(json\|send\).*videos\|/api/videos" "$SERVER_JS" | head -5)
    echo -e "  ${YELLOW}需要手动在视频 API 响应中添加 thumbnail 字段${NC}"
    echo -e "  ${CYAN}参考补丁 (已保存到 /tmp/thumb_field_patch.js):${NC}"
    echo "$THUMB_FIELD_PATCH" > /tmp/thumb_field_patch.js
    echo -e "  ${YELLOW}请在 server.js 中修改 /api/videos 路由的响应，为每个视频对象添加:${NC}"
    echo '        item.thumbnail = `/api/videos/${item.id}/thumbnail`;'
fi

# 4c. 添加缩略图 API 路由
echo "  检查缩略图 API..."
if grep -q "/api/videos/:id/thumbnail\|/api/.*thumbnail" "$SERVER_JS" 2>/dev/null; then
    echo -e "  ${GREEN}缩略图 API 已存在 ✓${NC}"
else
    # 在 module.exports 或 app.listen 之前插入路由
    ROUTE_INSERT=$(grep -n "module\.exports\|app\.listen\|server\.listen\|http\.createServer" "$SERVER_JS" | head -1 | cut -d: -f1)
    if [ -z "$ROUTE_INSERT" ]; then
        ROUTE_INSERT=$(wc -l < "$SERVER_JS")
    fi
    ROUTE_INSERT=$((ROUTE_INSERT - 1))

    THUMB_ROUTES_CODE=$(cat <<'ENDROUTES'

// ===== 缩略图 API 路由 (自动注入) =====
// GET /api/videos/:id/thumbnail
app.get('/api/videos/:id/thumbnail', async (req, res) => {
    try {
        const videoId = req.params.id;
        // 查找视频（兼容多种查询方式）
        let video = null;
        // 尝试通过 ID 查找（适配不同数据库结构）
        if (typeof findVideoById === 'function') video = findVideoById(videoId);
        if (!video && typeof Video === 'function') {
            try { video = await Video.findOne({ _id: videoId }); } catch(e) {}
            if (!video) try { video = await Video.findOne({ id: videoId }); } catch(e) {}
        }
        if (!video) return res.status(404).json({ error: '视频不存在' });

        const fileName = video.file_name || video.filename || video.fileName || '';
        if (!fileName) return res.status(404).json({ error: '无文件名' });

        const videoPath = require('path').join(uploadDir || UPLOAD_DIR || '/home/videoshowcase/uploads', fileName);
        const fs = require('fs');
        if (!fs.existsSync(videoPath)) return res.status(404).json({ error: '视频文件不存在' });

        const thumbFile = getThumbFilename(fileName);
        const thumbPath = require('path').join(THUMB_DIR, thumbFile);

        if (!fs.existsSync(thumbPath)) {
            generateThumbnailSync(videoPath, thumbFile);
        }

        if (fs.existsSync(thumbPath)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('Content-Type', 'image/jpeg');
            res.sendFile(thumbPath);
        } else {
            res.status(404).json({ error: '缩略图生成中，请稍后刷新' });
        }
    } catch (e) {
        console.error('Thumbnail error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/thumbnails/generate-all - 批量生成所有缩略图
app.post('/api/thumbnails/generate-all', async (req, res) => {
    const uploadDir = '/home/videoshowcase/uploads';
    const fs = require('fs');
    const path = require('path');
    const files = fs.readdirSync(uploadDir).filter(f =>
        ['.mp4','.webm','.mov','.avi','.mkv'].includes(path.extname(f).toLowerCase())
    );

    const results = [];
    for (const file of files) {
        const vp = path.join(uploadDir, file);
        const tf = getThumbFilename(file);
        const tp = await generateThumbnailAsync(vp, tf);
        results.push({ file, ok: !!tp });
    }
    res.json({ success: true, total: files.length, generated: results.filter(r=>r.ok).length, results });
});
// ===== 缩略图 API END =====
ENDROUTES
)

    python3 -c "
content = open('$SERVER_JS').read()
lines = content.split('\n')
insert_at = $ROUTE_INSERT
routes = '''$THUMB_ROUTES_CODE'''
lines.insert(insert_at, routes)
open('$SERVER_JS', 'w').write('\n'.join(lines))
print('OK')
"
    echo -e "  ${GREEN}缩略图 API 路由已添加 ✓${NC}"
fi

# === 5. 重启服务 ===
echo -e "${YELLOW}[5/6] 重启 Express...${NC}"
if command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "videoshowcase"; then
    pm2 restart videoshowcase
    echo -e "  ${GREEN}pm2 重启成功 ✓${NC}"
elif command -v pm2 &>/dev/null; then
    pm2 restart all
    echo -e "  ${GREEN}pm2 全部重启 ✓${NC}"
elif systemctl is-active --quiet videoshowcase 2>/dev/null; then
    systemctl restart videoshowcase
    echo -e "  ${GREEN}systemctl 重启成功 ✓${NC}"
else
    echo -e "  ${YELLOW}未找到进程管理器，请手动重启 Express${NC}"
fi

sleep 2

# === 6. 批量生成缩略图 ===
echo -e "${YELLOW}[6/6] 批量生成已有视频缩略图...${NC}"
echo "  (后台运行，可能需要几分钟...)"

# 启动后台批量生成
nohup bash -c '
UPLOAD_DIR="/home/videoshowcase/uploads"
THUMB_DIR="/home/videoshowcase/thumbnails"
TOTAL=0
DONE=0
for f in "$UPLOAD_DIR"/*; do
    ext="${f##*.}"
    ext=$(echo "$ext" | tr "[:upper:]" "[:lower:]")
    [[ "$ext" =~ ^(mp4|webm|mov|avi|mkv)$ ]] || continue
    TOTAL=$((TOTAL + 1))
done

echo "共 $TOTAL 个视频待处理"

for f in "$UPLOAD_DIR"/*; do
    ext="${f##*.}"
    ext=$(echo "$ext" | tr "[:upper:]" "[:lower:]")
    [[ "$ext" =~ ^(mp4|webm|mov|avi|mkv)$ ]] || continue
    DONE=$((DONE + 1))
    FNAME=$(basename "$f")
    THUMB_FILE=$(echo -n "$FNAME" | md5sum | cut -d" " -f1).jpg
    THUMB_PATH="$THUMB_DIR/$THUMB_FILE"
    if [ ! -f "$THUMB_PATH" ]; then
        ffmpeg -y -ss 1 -i "$f" -vframes 1 -vf "scale=640:-1" -q:v 5 "$THUMB_PATH" 2>/dev/null
        if [ -f "$THUMB_PATH" ]; then
            echo "[$DONE/$TOTAL] ✓ $FNAME"
        else
            echo "[$DONE/$TOTAL] ✗ $FNAME (失败)"
        fi
    else
        echo "[$DONE/$TOTAL] - $FNAME (已存在)"
    fi
done
echo "=== 缩略图生成完成: $TOTAL 个 ==="
' > /tmp/thumb_gen.log 2>&1 &

echo ""
echo -e "${CYAN}========================================"
echo "  缩略图系统部署完成！"
echo -e "========================================${NC}"
echo ""
echo "  📂 缩略图目录: $THUMB_DIR"
echo "  📝 生成日志:   tail -f /tmp/thumb_gen.log"
echo "  🔍 查看进度:   ls $THUMB_DIR | wc -l"
echo ""
echo "  验证方法:"
echo "    curl http://localhost/api/videos  # 检查 thumbnail 字段"
echo "    (等待批量生成完成后) 刷新网页即可看到真实缩略图"
echo ""
echo "  注意: 视频列表 API 中可能需要手动添加 thumbnail 字段，"
echo "        参考补丁文件: /tmp/thumb_field_patch.js"
echo ""
