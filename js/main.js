// ========================================
// AI灵感视界 - 视频展示平台
// ========================================

// ===== API 配置 =====
const API_BASE = '/api';

// ===== 视频数据 =====
let videos = [];
let videosLoaded = false;

// 从后端 API 加载视频列表
async function fetchVideos() {
    try {
        const resp = await fetch(`${API_BASE}/videos`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        // 兼容两种格式：数组直接返回，或 { videos: [...] }
        const list = Array.isArray(data) ? data : (data.videos || data.data || []);
        videos = list.map(mapApiVideo);
        videosLoaded = true;
        console.log(`✅ 从服务器加载了 ${videos.length} 个视频`);
        return videos;
    } catch (err) {
        console.warn('⚠️ API 加载失败，使用本地缓存:', err.message);
        // 降级到 localStorage
        const cached = JSON.parse(localStorage.getItem('aiVideosCache') || '[]');
        videos = cached;
        videosLoaded = cached.length > 0;
        return videos;
    }
}

// 将 API 返回的视频数据映射为前端格式
function mapApiVideo(v, index) {
    // 兼容多种 API 字段命名
    const fileName = v.file_name || v.filename || v.fileName || '';
    const rawId = v.id || v._id || ('v' + index);
    // 视频通过 API 路由 /api/videos/:id 提供
    const videoSrc = `/api/videos/${rawId}`;
    // 从文件名或标题推断分类
    const title = v.title || v.name || '未命名视频';
    const category = v.category || v.cat || inferCategory(title);
    // 服务端缩略图 URL（如果后端提供了 thumbnail 字段）
    const thumbSrc = v.thumbnail || `/api/videos/${rawId}/thumbnail`;

    return {
        id: String(rawId),
        title: title,
        description: v.description || v.desc || '',
        category: category,
        aiTool: v.ai_tool || v.aiTool || v.tool || '',
        duration: v.duration || formatDuration(v.duration_seconds) || '0:00',
        views: parseInt(v.views) || 0,
        likes: parseInt(v.likes) || 0,
        date: (v.created_at || v.date || v.createdAt || '').toString().substring(0, 10),
        src: videoSrc,
        filename: fileName,
        thumbnail: thumbSrc
    };
}

// 从标题推断视频分类
function inferCategory(title) {
    const t = title.toLowerCase();
    if (/猫|狗|动物|熊|熊猫|仓鼠|鸟|鱼|虎|狮/.test(t)) return '动物';
    if (/城市|赛博|科幻|未来|太空|宇宙|机甲|机器人/.test(t)) return '科幻';
    if (/风景|山|水|海|日落|日出|森林|花/.test(t)) return '风景';
    if (/女孩|人物|男孩|女人|男人|舞/.test(t)) return '人物';
    if (/动画|卡通|二次元|漫画/.test(t)) return '动画';
    if (/抽象|艺术|几何|色彩/.test(t)) return '抽象';
    return '其他';
}

// 保存到本地缓存（API 不可用时的降级方案）
function saveVideosCache() {
    try {
        localStorage.setItem('aiVideosCache', JSON.stringify(videos));
    } catch (e) { /* localStorage 满了，忽略 */ }
}

// ===== 当前状态 =====
let currentCategory = 'all';
let currentSort = 'latest';
let currentVideo = null;
let visibleCount = 6;

// ===== DOM 元素 =====
const videoGrid = document.getElementById('videoGrid');
const playerOverlay = document.getElementById('playerOverlay');
const videoPlayer = document.getElementById('videoPlayer');
const playerTitle = document.getElementById('playerTitle');
const playerDesc = document.getElementById('playerDesc');
const playerViews = document.getElementById('playerViews');
const playerDate = document.getElementById('playerDate');
const playerCategory = document.getElementById('playerCategory');
const likeCount = document.getElementById('likeCount');
const btnLike = document.getElementById('btnLike');
const shareOverlay = document.getElementById('shareOverlay');
const shareUrl = document.getElementById('shareUrl');
const uploadOverlay = document.getElementById('uploadOverlay');
const toast = document.getElementById('toast');
const loadMoreBtn = document.getElementById('btnLoadMore');

// ===== 渲染视频网格 =====
function getFilteredVideos() {
    let filtered = currentCategory === 'all'
        ? [...videos]
        : videos.filter(v => v.category === currentCategory);

    if (currentSort === 'popular') {
        filtered.sort((a, b) => b.views - a.views);
    } else {
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    return filtered;
}

function renderVideos(append = false) {
    const filtered = getFilteredVideos();
    const toShow = append ? filtered.slice(0, visibleCount) : filtered.slice(0, visibleCount);

    if (!append) {
        videoGrid.innerHTML = '';
    }

    if (toShow.length === 0) {
        videoGrid.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <polygon points="23 7 16 12 23 17 23 7"/>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                <h3>暂无视频</h3>
                <p>成为第一个上传AI短视频的人吧！</p>
            </div>
        `;
        loadMoreBtn.style.display = 'none';
        return;
    }

    const fragment = document.createDocumentFragment();

    toShow.forEach(video => {
        const card = createVideoCard(video);
        fragment.appendChild(card);
    });

    videoGrid.appendChild(fragment);

    // 显示/隐藏加载更多
    if (visibleCount >= filtered.length) {
        loadMoreBtn.style.display = 'none';
    } else {
        loadMoreBtn.style.display = 'block';
    }
}

// ===== 缩略图生成系统 =====
const thumbnailCache = {};

// 场景类型分类颜色主题
const sceneThemes = {
    '风景': { sky: ['#1e3a5f','#4a90d9','#87CEEB'], earth: ['#2d5a1e','#1e3a12'], accent: '#7ec8e3', mountain: ['#1a3a2e','#3a5a3e'], sun: '#FFD700' },
    '科幻': { sky: ['#0a0a2e','#1a1050','#2a1a6e'], earth: ['#1a1a3e','#0d0d2b'], accent: '#9b59b6', mountain: ['#1a1a3e','#2d1a5c'], sun: '#8B5CF6' },
    '动物': { sky: ['#1a3a2e','#3a6a4e','#5a8a3e'], earth: ['#2d5a1e','#1a3a12'], accent: '#2ecc71', mountain: ['#1a3a1e','#3a6a2e'], sun: '#F39C12' },
    '抽象': { sky: ['#1a0a3e','#3a1a5e','#5a2a7e'], earth: ['#2d1a4e','#1a0a2e'], accent: '#e056a0', mountain: ['#2a1a3e','#4a2a5e'], sun: '#F472B6' },
    '人物': { sky: ['#2a1a0d','#4e2a1a','#6e3a2a'], earth: ['#3a2a1a','#1a0d0a'], accent: '#f5a623', mountain: ['#2a1a0a','#4a2a1a'], sun: '#F59E0B' },
    '动画': { sky: ['#1a0d2b','#3a1a5e','#6a2a8e'], earth: ['#2d1a4e','#1a0a2e'], accent: '#ff6b9d', mountain: ['#2a1a3e','#5a2a6e'], sun: '#EC4899' }
};

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function generateThumbnailUrl(video) {
    const cacheKey = `${video.category}-${video.title}`;
    if (thumbnailCache[cacheKey]) return thumbnailCache[cacheKey];

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    const w = 640, h = 360;
    const seed = hashCode(video.title + video.category);
    const theme = sceneThemes[video.category] || sceneThemes['抽象'];

    // === 1. 天空渐变 ===
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.68);
    skyGrad.addColorStop(0, theme.sky[0]);
    skyGrad.addColorStop(0.4, theme.sky[1]);
    skyGrad.addColorStop(0.85, theme.sky[2]);
    skyGrad.addColorStop(1, mixColor(theme.sky[2], theme.earth[0], 0.5));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.68);

    // === 2. 星星（所有场景通用） ===
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 40; i++) {
        const sx = ((seed * (i + 7) * 73 + i * 311) % w);
        const sy = ((seed * (i + 13) * 47 + i * 257) % (h * 0.38));
        const sr = 0.4 + (seed * (i + 3)) % 1.6;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
    }

    // === 3. 太阳/月亮 ===
    const sunX = w * 0.72 + (seed % 50);
    const sunY = h * 0.18 + (seed % 22);
    const sunR = 24 + (seed % 12);
    const glowGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3.5);
    glowGrad.addColorStop(0, theme.sun + 'EE');
    glowGrad.addColorStop(0.2, theme.sun + '66');
    glowGrad.addColorStop(0.5, theme.sun + '11');
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();

    // === 4. 远景山脉（3层，每层不同颜色/大小） ===
    for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        ctx.moveTo(-10, h * 0.75);
        const baseY = h * (0.58 - layer * 0.06);
        const peaks = 6 + layer * 2;
        const peakHeight = 35 + layer * 30;
        for (let i = 0; i <= peaks; i++) {
            const px = (w / peaks) * i;
            const jitter = ((seed * (i + layer * 7) * 137 + i * layer * 89) % 25) - 12;
            const py = baseY - Math.sin(i * 0.7 + layer * 0.5) * peakHeight - jitter * 0.6;
            ctx.lineTo(px, py);
        }
        ctx.lineTo(w + 10, h * 0.75);
        ctx.closePath();
        const darken = 0.35 + layer * 0.22;
        ctx.fillStyle = `rgba(${20+layer*18},${25+layer*14},${32+layer*16},${Math.min(1, darken)})`;
        ctx.fill();
    }

    // === 5. 地面 ===
    const groundGrad = ctx.createLinearGradient(0, h * 0.64, 0, h);
    groundGrad.addColorStop(0, theme.earth[0]);
    groundGrad.addColorStop(1, theme.earth[1]);
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, h * 0.64, w, h * 0.36);

    // 地面纹理斑驳
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 25; i++) {
        const gx = ((seed * (i + 3) * 89 + i * 167) % w);
        const gy = h * 0.64 + ((seed * (i + 5) * 53) % (h * 0.32));
        ctx.fillStyle = theme.accent;
        ctx.beginPath();
        ctx.arc(gx, gy, 3 + (seed * i) % 6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // === 6. 场景专属元素 ===
    switch (video.category) {
        case '风景':
            drawPineTrees(ctx, seed, w, h);
            drawRiver(ctx, seed, w, h, theme);
            break;
        case '科幻':
            drawFuturisticBuildings(ctx, seed, w, h, theme.accent);
            drawHolograms(ctx, seed, w, h, theme.accent);
            break;
        case '动物':
            drawForestBg(ctx, seed, w, h);
            drawAnimalShapes(ctx, seed, w, h);
            break;
        case '人物':
            drawHumanSilhouette(ctx, seed, w, h);
            drawParticles(ctx, seed, w, h, theme.accent);
            break;
        case '动画':
            drawColorfulShapes(ctx, seed, w, h, theme);
            drawSparkles(ctx, seed, w, h, theme.accent);
            break;
        case '抽象':
            drawFlowingCurves(ctx, seed, w, h, theme);
            drawGlowOrbs(ctx, seed, w, h, theme.accent);
            break;
    }

    // === 7. 底部遮罩 + 文本信息 ===
    const maskGrad = ctx.createLinearGradient(0, h - 60, 0, h);
    maskGrad.addColorStop(0, 'rgba(0,0,0,0)');
    maskGrad.addColorStop(0.4, 'rgba(0,0,0,0.6)');
    maskGrad.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = maskGrad;
    ctx.fillRect(0, h - 60, w, 60);

    // 标题
    ctx.fillStyle = '#fff';
    ctx.font = '600 15px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const maxTitleW = w - 120;
    const titleText = truncateText(ctx, video.title, maxTitleW);
    ctx.fillText(titleText, 16, h - 32);

    // 时长
    const durText = video.duration || '0:00';
    ctx.font = '12px monospace';
    const durW = ctx.measureText(durText).width + 20;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRect(ctx, w - durW - 14, h - 50, durW, 25, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '600 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(durText, w - 14 - durW / 2, h - 32);

    // 分类 + AI工具
    ctx.textAlign = 'left';
    ctx.font = '11px sans-serif';
    ctx.fillStyle = theme.accent;
    const toolInfo = getCategoryEmoji(video.category) + ' ' + video.category + (video.aiTool ? ' · ' + video.aiTool : '');
    ctx.fillText(toolInfo, 16, h - 8);

    const url = canvas.toDataURL('image/jpeg', 0.9);
    thumbnailCache[cacheKey] = url;
    return url;
}

// ===== Canvas 场景绘制辅助函数 =====

function mixColor(c1, c2, ratio) {
    const r1 = parseInt(c1.slice(1,3), 16), g1 = parseInt(c1.slice(3,5), 16), b1 = parseInt(c1.slice(5,7), 16);
    const r2 = parseInt(c2.slice(1,3), 16), g2 = parseInt(c2.slice(3,5), 16), b2 = parseInt(c2.slice(5,7), 16);
    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function truncateText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ---- 风景：松树 + 河流 ----
function drawPineTrees(ctx, seed, w, h) {
    for (let i = 0; i < 7; i++) {
        const tx = 40 + i * 90 + (seed * i * 7) % 35;
        const th = 40 + (seed * i) % 50;
        const ty = h * 0.64 - th;
        ctx.fillStyle = '#0a1a0d';
        ctx.fillRect(tx - 3, ty + th * 0.5, 6, th * 0.5);
        ctx.beginPath();
        ctx.moveTo(tx - 18, ty + th * 0.55);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx + 18, ty + th * 0.55);
        ctx.fillStyle = '#0e2e12';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tx - 13, ty + th * 0.65);
        ctx.lineTo(tx, ty + th * 0.12);
        ctx.lineTo(tx + 13, ty + th * 0.65);
        ctx.fillStyle = '#0d2510';
        ctx.fill();
    }
}

function drawRiver(ctx, seed, w, h, theme) {
    ctx.beginPath();
    ctx.moveTo(w * 0.25, h);
    ctx.quadraticCurveTo(w * 0.3, h * 0.82, w * 0.35, h * 0.72);
    ctx.quadraticCurveTo(w * 0.4, h * 0.62, w * 0.55, h * 0.64);
    ctx.lineTo(w * 0.6, h * 0.66);
    ctx.quadraticCurveTo(w * 0.5, h * 0.74, w * 0.4, h * 0.85);
    ctx.quadraticCurveTo(w * 0.32, h * 0.92, w * 0.28, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(30,120,180,0.3)';
    ctx.fill();
    // 波光
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
        const lx = w * 0.28 + i * 15;
        const ly = h * 0.85 + Math.sin(i + seed * 0.01) * 4;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + 6 + (seed * i) % 8, ly);
        ctx.stroke();
    }
}

// ---- 科幻：未来建筑 + 全息投影 ----
function drawFuturisticBuildings(ctx, seed, w, h, accent) {
    const bldCount = 10;
    for (let i = 0; i < bldCount; i++) {
        const bx = i * (w / bldCount);
        const bw = w / bldCount * 0.75;
        const bh = 35 + (seed * i * 101) % 130;
        const by = h * 0.64 - bh;
        ctx.fillStyle = 'rgba(15,12,30,0.85)';
        ctx.fillRect(bx, by, bw, bh);
        // 建筑顶部发光
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(bx, by, bw, 3);
        ctx.globalAlpha = 1;
        // 窗户
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.4 + (seed * i) % 0.3;
        for (let wy = by + 10; wy < h * 0.62; wy += 14) {
            for (let wx = bx + 4; wx < bx + bw - 6; wx += 10) {
                if ((seed * i * wx * wy) % 3 !== 0) {
                    ctx.fillRect(wx, wy, 4, 5);
                }
            }
        }
        ctx.globalAlpha = 1;
    }
}

function drawHolograms(ctx, seed, w, h, accent) {
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 3; i++) {
        const hx = w * 0.5 + (i - 1) * 80 + (seed * i * 7) % 30;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(hx, h * 0.54, 20 + i * 10, 0, Math.PI, false);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

// ---- 动物：森林 + 动物剪影 ----
function drawForestBg(ctx, seed, w, h) {
    for (let i = 0; i < 10; i++) {
        const fx = i * 65 + (seed * i) % 20;
        const fh = 50 + (seed * (i + 3)) % 70;
        ctx.fillStyle = `rgba(${10+(i%5)*3},${25+(i%4)*4},${10+(i%3)*5},0.8)`;
        ctx.beginPath();
        ctx.moveTo(fx - 14, h * 0.64);
        ctx.lineTo(fx, h * 0.64 - fh);
        ctx.lineTo(fx + 14, h * 0.64);
        ctx.fill();
    }
}

function drawAnimalShapes(ctx, seed, w, h) {
    // 鹿的剪影
    const ax = w * 0.4;
    const ay = h * 0.64;
    ctx.fillStyle = 'rgba(8,20,10,0.8)';
    // 身体
    ctx.beginPath();
    ctx.ellipse(ax + 15, ay - 22, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // 头
    ctx.beginPath();
    ctx.arc(ax - 8, ay - 38, 8, 0, Math.PI * 2);
    ctx.fill();
    // 角
    ctx.strokeStyle = 'rgba(8,20,10,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax - 6, ay - 44);
    ctx.lineTo(ax - 16, ay - 62);
    ctx.moveTo(ax - 8, ay - 44);
    ctx.lineTo(ax - 2, ay - 60);
    ctx.stroke();
    // 腿
    ctx.fillStyle = 'rgba(8,20,10,0.7)';
    for (let l = 0; l < 4; l++) {
        ctx.fillRect(ax + (l - 1.2) * 8, ay - 10, 3, 16);
    }
}

// ---- 人物：人物剪影 ----
function drawHumanSilhouette(ctx, seed, w, h) {
    const cx = w * 0.35;
    const baseY = h * 0.64;
    ctx.fillStyle = 'rgba(15,10,8,0.7)';
    // 身体
    ctx.beginPath();
    ctx.moveTo(cx - 8, baseY);
    ctx.lineTo(cx - 5, baseY - 50);
    ctx.lineTo(cx + 5, baseY - 50);
    ctx.lineTo(cx + 8, baseY);
    ctx.closePath();
    ctx.fill();
    // 头
    ctx.beginPath();
    ctx.arc(cx, baseY - 60, 12, 0, Math.PI * 2);
    ctx.fill();
    // 手臂
    ctx.beginPath();
    ctx.moveTo(cx - 5, baseY - 40);
    ctx.quadraticCurveTo(cx - 25, baseY - 45, cx - 20, baseY - 25);
    ctx.lineTo(cx - 8, baseY - 30);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 5, baseY - 40);
    ctx.lineTo(cx + 25, baseY - 55);
    ctx.lineTo(cx + 12, baseY - 32);
    ctx.closePath();
    ctx.fill();
}

function drawParticles(ctx, seed, w, h, accent) {
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 20; i++) {
        const px = ((seed * (i + 9) * 47 + i * 231) % w);
        const py = ((seed * (i + 11) * 31 + i * 137) % (h * 0.6));
        ctx.beginPath();
        ctx.arc(px, py, 1 + (seed * i) % 3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// ---- 动画：彩色形状 + 闪光 ----
function drawColorfulShapes(ctx, seed, w, h, theme) {
    const colors = ['#ff6b9d','#c44dff','#4dc9f6','#f6d365','#a8e6cf','#ff8a5c'];
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 6; i++) {
        const sx = ((seed * (i + 17) * 53 + i * 103) % w);
        const sy = h * 0.3 + ((seed * (i + 23) * 41 + i * 61) % (h * 0.35));
        const sr = 10 + (seed * i * 31) % 30;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function drawSparkles(ctx, seed, w, h, accent) {
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 15; i++) {
        const sx = ((seed * (i + 29) * 79 + i * 199) % w);
        const sy = ((seed * (i + 31) * 67 + i * 151) % (h * 0.5));
        drawStar(ctx, sx, sy, 3 + (seed * i) % 5, 0.6);
    }
    ctx.globalAlpha = 1;
}

function drawStar(ctx, cx, cy, r, inset) {
    const spikes = 4;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? r : r * inset;
        const angle = (Math.PI / spikes) * i - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}

// ---- 抽象：流动曲线 + 光球 ----
function drawFlowingCurves(ctx, seed, w, h, theme) {
    ctx.globalAlpha = 0.2;
    for (let c = 0; c < 4; c++) {
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1.5 + c * 0.5;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 5) {
            const y = h * 0.35 + Math.sin(x * 0.01 + c * 1.5 + seed * 0.001) * 40 + Math.cos(x * 0.03 + c) * 20;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawGlowOrbs(ctx, seed, w, h, accent) {
    for (let i = 0; i < 5; i++) {
        const ox = ((seed * (i + 41) * 103 + i * 83) % w);
        const oy = h * 0.25 + ((seed * (i + 43) * 71 + i * 53) % (h * 0.42));
        const or = 8 + (seed * i * 17) % 22;
        const glowGrad = ctx.createRadialGradient(ox, oy, or * 0.1, ox, oy, or);
        glowGrad.addColorStop(0, accent + 'AA');
        glowGrad.addColorStop(0.5, accent + '33');
        glowGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(ox, oy, or, 0, Math.PI * 2);
        ctx.fill();
    }
}

function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.setAttribute('data-id', video.id);
    card.setAttribute('data-category', video.category);

    // 优先使用 Canvas 场景缩略图作为即时兜底
    const canvasThumb = generateThumbnailUrl(video);
    // 服务端缩略图 URL（真实视频帧）
    const serverThumb = video.thumbnail || null;

    card.innerHTML = `
        <div class="video-thumb">
            <img class="video-thumb-img" src="${canvasThumb}" alt="${escapeHtml(video.title)}" loading="lazy" data-video-id="${video.id}" data-server-thumb="${serverThumb || ''}">
            <div class="play-icon">
                <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="12" fill="rgba(124,58,237,0.8)"/>
                    <polygon points="10,8 10,16 17,12" fill="white"/>
                </svg>
            </div>
            <span class="video-duration">${video.duration}</span>
        </div>
        <div class="video-body">
            <h3>${escapeHtml(video.title)}</h3>
            <p>${escapeHtml(video.description)}</p>
            <div class="video-meta">
                <div class="video-meta-left">
                    <span class="video-tag">${getCategoryEmoji(video.category)} ${video.category}</span>
                    ${video.aiTool ? `<span class="video-tool">🤖 ${escapeHtml(video.aiTool)}</span>` : ''}
                </div>
                <span>👁 ${formatNumber(video.views)}</span>
            </div>
        </div>
    `;

    card.addEventListener('click', () => openPlayer(video));

    // 尝试加载服务端真实缩略图
    if (serverThumb) {
        loadServerThumbnail(card, serverThumb);
    }

    return card;
}

// 从服务端加载真实缩略图，异步替换 Canvas 占位图
const serverThumbCache = {};
function loadServerThumbnail(card, thumbUrl) {
    if (serverThumbCache[thumbUrl]) {
        updateCardThumb(card, serverThumbCache[thumbUrl]);
        return;
    }

    const img = new Image();
    img.onload = () => {
        const url = img.src;
        serverThumbCache[thumbUrl] = url;
        updateCardThumb(card, url);
    };
    img.onerror = () => {
        // 服务端缩略图不可用，保留 Canvas 占位图
    };
    // 添加小延迟让 Canvas 先渲染
    setTimeout(() => { img.src = thumbUrl; }, 100);
}

function updateCardThumb(card, url) {
    const img = card.querySelector('.video-thumb-img');
    if (img && img.src !== url) {
        // 先淡出再替换再淡入，保证平滑过渡
        img.style.opacity = '0';
        setTimeout(() => {
            img.src = url;
            img.onload = () => { img.style.opacity = '1'; };
            // 如果1秒后还未加载完成，也显示
            setTimeout(() => {
                if (img.style.opacity === '0') img.style.opacity = '1';
            }, 1000);
        }, 200);
    }
}

function getCategoryEmoji(category) {
    const map = { '风景': '🏞️', '科幻': '🚀', '动物': '🐾', '抽象': '🎨', '人物': '👤', '动画': '✨' };
    return map[category] || '🎬';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNumber(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
}

// ===== 视频播放器 =====
function openPlayer(video) {
    currentVideo = video;
    playerTitle.textContent = video.title;
    playerDesc.textContent = video.description;
    playerViews.textContent = `👁 ${formatNumber(video.views)} 次观看`;
    playerDate.textContent = `📅 ${video.date}`;
    playerCategory.textContent = `${getCategoryEmoji(video.category)} ${video.category}`;
    likeCount.textContent = video.likes || 0;

    // 更新点赞按钮状态
    const likedVideos = JSON.parse(localStorage.getItem('likedVideos') || '[]');
    if (likedVideos.includes(video.id)) {
        btnLike.classList.add('liked');
    } else {
        btnLike.classList.remove('liked');
    }

    // 如果有视频源则加载，否则显示占位
    if (video.src) {
        videoPlayer.src = video.src;
        videoPlayer.style.display = 'block';
    } else {
        videoPlayer.removeAttribute('src');
        videoPlayer.style.display = 'block';
        // 创建占位canvas
        showVideoPlaceholder(video);
    }

    // 增加观看次数
    video.views = (video.views || 0) + 1;
    saveVideosCache();
    playerViews.textContent = `👁 ${formatNumber(video.views)} 次观看`;
    // 异步通知后端
    fetch(`${API_BASE}/videos/${video.id}/view`, { method: 'POST' }).catch(() => {});

    playerOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // 尝试自动播放
    videoPlayer.play().catch(() => {});
}

function showVideoPlaceholder(video) {
    // 使用和 generateThumbnailUrl 相同的场景绘制逻辑
    // 直接复用 generateThumbnailUrl 生成的缩略图作为poster
    const posterUrl = generateThumbnailUrl(video);
    videoPlayer.poster = posterUrl;
}

function closePlayer() {
    playerOverlay.classList.remove('active');
    document.body.style.overflow = '';
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.removeAttribute('poster');
    currentVideo = null;
}

// 点赞
if (btnLike) btnLike.addEventListener('click', async () => {
    if (!currentVideo) return;
    const likedVideos = JSON.parse(localStorage.getItem('likedVideos') || '[]');
    const index = likedVideos.indexOf(String(currentVideo.id));

    if (index > -1) {
        likedVideos.splice(index, 1);
        currentVideo.likes = Math.max(0, (currentVideo.likes || 1) - 1);
        btnLike.classList.remove('liked');
    } else {
        likedVideos.push(String(currentVideo.id));
        currentVideo.likes = (currentVideo.likes || 0) + 1;
        btnLike.classList.add('liked');
    }

    localStorage.setItem('likedVideos', JSON.stringify(likedVideos));
    likeCount.textContent = currentVideo.likes;
    saveVideosCache();
    renderVideos();

    // 异步通知后端
    const method = index > -1 ? 'DELETE' : 'POST';
    fetch(`${API_BASE}/videos/${currentVideo.id}/like`, { method }).catch(() => {});
});

// 下载按钮
const btnDownload = document.getElementById('btnDownload');
if (btnDownload) btnDownload.addEventListener('click', () => {
    if (!currentVideo) return;
    if (currentVideo.src) {
        const a = document.createElement('a');
        a.href = currentVideo.src;
        a.download = `${currentVideo.title}.mp4`;
        a.click();
    } else {
        showToast('演示模式：请上传真实视频后下载', '');
    }
});

// 关闭播放器
const playerCloseBtn = document.getElementById('playerClose');
if (playerCloseBtn) playerCloseBtn.addEventListener('click', closePlayer);
if (playerOverlay) playerOverlay.addEventListener('click', (e) => {
    if (e.target === playerOverlay) closePlayer();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && playerOverlay.classList.contains('active')) {
        closePlayer();
    }
});

// ===== 分享功能 =====
const btnShare = document.getElementById('btnShare');
const shareCloseBtn = document.getElementById('shareClose');
if (btnShare) btnShare.addEventListener('click', openShare);
if (shareCloseBtn) shareCloseBtn.addEventListener('click', closeShare);
if (shareOverlay) shareOverlay.addEventListener('click', (e) => {
    if (e.target === shareOverlay) closeShare();
});

function openShare() {
    if (!currentVideo) return;
    const url = `${window.location.origin}${window.location.pathname}?v=${currentVideo.id}`;
    shareUrl.value = url;
    shareOverlay.classList.add('active');
}

function closeShare() {
    shareOverlay.classList.remove('active');
}

// 复制链接
const btnCopyLink = document.getElementById('btnCopyLink');
if (btnCopyLink) btnCopyLink.addEventListener('click', () => {
    shareUrl.select();
    document.execCommand('copy');
    navigator.clipboard.writeText(shareUrl.value).catch(() => {});
    showToast('✅ 链接已复制到剪贴板', 'success');
    setTimeout(closeShare, 800);
});

// 社交分享按钮
document.querySelectorAll('.share-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const platform = btn.dataset.platform;
        const url = encodeURIComponent(shareUrl.value);
        const title = encodeURIComponent(currentVideo?.title || 'AI灵感视界');
        const desc = encodeURIComponent(currentVideo?.description || '');

        const shareInput = document.getElementById('shareUrl');
        switch (platform) {
            case 'wechat':
                shareInput.value;
                shareInput.select();
                document.execCommand('copy');
                navigator.clipboard.writeText(shareInput.value).catch(() => {});
                showToast('✅ 链接已复制，可粘贴到微信分享', 'success');
                setTimeout(closeShare, 800);
                return;
            case 'weibo':
                window.open(`https://service.weibo.com/share/share.php?url=${url}&title=${title}`, '_blank');
                break;
            case 'qq':
                window.open(`https://connect.qq.com/widget/shareqq/index.html?url=${url}&title=${title}&desc=${desc}`, '_blank');
                break;
            case 'link':
                shareInput.value;
                shareInput.select();
                document.execCommand('copy');
                navigator.clipboard.writeText(shareInput.value).catch(() => {});
                showToast('✅ 链接已复制到剪贴板', 'success');
                setTimeout(closeShare, 800);
                return;
        }
        closeShare();
    });
});

// ===== 分类筛选 =====
document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.category;
        visibleCount = 6;
        renderVideos();
    });
});

// ===== 排序 =====
document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSort = btn.dataset.sort;
        visibleCount = 6;
        renderVideos();
    });
});

// ===== 加载更多 =====
if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
        visibleCount += 6;
        renderVideos();
    });
}

// ===== 上传功能 =====
const btnUploadNav = document.getElementById('btnUploadNav');
const btnHeroUpload = document.getElementById('btnHeroUpload');
const uploadClose = document.getElementById('uploadClose');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const previewVideo = document.getElementById('previewVideo');
const previewRemove = document.getElementById('previewRemove');
const uploadForm = document.getElementById('uploadForm');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const dropzoneContent = dropZone ? dropZone.querySelector('.dropzone-content') : null;

let selectedFile = null;

function openUpload() {
    console.log('[上传] openUpload 触发');
    if (!uploadOverlay) {
        console.error('[上传] uploadOverlay 元素未找到');
        return;
    }
    uploadOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    resetUploadForm();
}

function closeUpload() {
    if (uploadOverlay) uploadOverlay.classList.remove('active');
    document.body.style.overflow = '';
    resetUploadForm();
}

if (btnUploadNav) btnUploadNav.addEventListener('click', openUpload);
if (btnHeroUpload) btnHeroUpload.addEventListener('click', openUpload);
if (uploadClose) uploadClose.addEventListener('click', closeUpload);
if (uploadOverlay) uploadOverlay.addEventListener('click', (e) => {
    if (e.target === uploadOverlay) closeUpload();
});

function resetUploadForm() {
    if (uploadForm) uploadForm.reset();
    selectedFile = null;
    if (previewContainer) previewContainer.style.display = 'none';
    const dc = document.querySelector('#dropZone .dropzone-content');
    if (dc) dc.style.display = '';
    const upProgress = document.getElementById('uploadProgress');
    if (upProgress) upProgress.style.display = 'none';
    const prevVid = document.getElementById('previewVideo');
    if (prevVid) prevVid.removeAttribute('src');
    const btnSubmit = document.getElementById('btnSubmit');
    if (btnSubmit) btnSubmit.disabled = false;
}

// 点击上传
if (dropZone) dropZone.addEventListener('click', () => fileInput && fileInput.click());

// 拖拽上传
if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    });
}

if (fileInput) fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) handleFileSelect(file);
});

function handleFileSelect(file) {
    if (!file.type.startsWith('video/')) {
        showToast('❌ 请选择视频文件', 'error');
        return;
    }
    if (file.size > 100 * 1024 * 1024) {
        showToast('❌ 视频文件不能超过100MB', 'error');
        return;
    }

    selectedFile = file;

    const dc = document.querySelector('#dropZone .dropzone-content');
    if (dc) dc.style.display = 'none';
    if (previewContainer) previewContainer.style.display = 'block';

    const url = URL.createObjectURL(file);
    const prevVid = document.getElementById('previewVideo');
    if (prevVid) prevVid.src = url;
    console.log('[上传] 文件已选择:', file.name, file.size);
}

if (previewRemove) previewRemove.addEventListener('click', () => {
    selectedFile = null;
    if (fileInput) fileInput.value = '';
    if (previewContainer) previewContainer.style.display = 'none';
    const dc = document.querySelector('#dropZone .dropzone-content');
    if (dc) dc.style.display = '';
    const prevVid = document.getElementById('previewVideo');
    if (prevVid) prevVid.removeAttribute('src');
});

// 提交上传
if (uploadForm) {
    uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();

        console.log('[上传] 表单提交触发');

        if (!selectedFile) {
            showToast('❌ 请先选择视频文件', 'error');
            console.log('[上传] 未选择文件');
            return;
        }

        const titleInput = document.getElementById('videoTitle');
        const title = titleInput ? titleInput.value.trim() : '';
        if (!title) {
            showToast('❌ 请输入视频标题', 'error');
            console.log('[上传] 标题为空');
            return;
        }

        console.log('[上传] 开始真实上传, 标题:', title);
        try {
            performUpload(title);
        } catch (err) {
            console.error('[上传] performUpload 出错:', err);
            showToast('❌ 发布失败，请重试', 'error');
        }
    });
} else {
    console.warn('[上传] 未找到 uploadForm 元素');
}

async function performUpload(title) {
    console.log('[上传] performUpload 开始');

    const btnSubmit = document.getElementById('btnSubmit');
    const upProgress = document.getElementById('uploadProgress');
    const pFill = document.getElementById('progressFill');
    const pText = document.getElementById('progressText');

    if (!selectedFile) {
        showToast('❌ 请先选择视频文件', 'error');
        return;
    }

    if (upProgress) upProgress.style.display = 'block';
    if (pText) pText.textContent = '上传中 0%';
    if (btnSubmit) btnSubmit.disabled = true;

    try {
        const descInput = document.getElementById('videoDesc');
        const catSelect = document.getElementById('videoCategory');
        const toolInput = document.getElementById('aiTool');

        const formData = new FormData();
        formData.append('video', selectedFile);
        formData.append('title', title);
        formData.append('description', descInput ? descInput.value.trim() : '');
        formData.append('category', catSelect ? catSelect.value : '其他');
        formData.append('aiTool', toolInput ? toolInput.value.trim() : '');

        // 使用 XMLHttpRequest 以支持上传进度
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/upload`);

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                if (pFill) pFill.style.width = pct + '%';
                if (pText) pText.textContent = `上传中 ${pct}%`;
            }
        });

        const result = await new Promise((resolve, reject) => {
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { resolve(JSON.parse(xhr.responseText)); }
                    catch { resolve({ success: true }); }
                } else {
                    try { reject(new Error(JSON.parse(xhr.responseText).error || '上传失败')); }
                    catch { reject(new Error(`上传失败 (${xhr.status})`)); }
                }
            });
            xhr.addEventListener('error', () => reject(new Error('网络错误，上传失败')));
            xhr.addEventListener('abort', () => reject(new Error('上传已取消')));
            xhr.send(formData);
        });

        if (pFill) pFill.style.width = '100%';
        if (pText) pText.textContent = '处理完成！';

        console.log('[上传] 服务器响应:', result);

        // 添加新视频到列表（如果 API 返回了视频数据则用它）
        let newVideo;
        if (result.video || result.id) {
            const raw = result.video || result;
            newVideo = mapApiVideo(raw, videos.length);
        } else {
            // 降级：手动构建
            newVideo = {
                id: 'v' + Date.now(),
                title: title,
                description: descInput ? descInput.value.trim() : '',
                category: catSelect ? catSelect.value : '其他',
                aiTool: toolInput ? toolInput.value.trim() : '',
                duration: result.duration || '0:00',
                views: 0,
                likes: 0,
                date: new Date().toISOString().split('T')[0],
                src: result.url || result.src || '',
                filename: result.filename || ''
            };
        }

        // 清除缩略图缓存
        const cacheKey = `${newVideo.category}-${newVideo.title}`;
        delete thumbnailCache[cacheKey];

        videos.unshift(newVideo);
        saveVideosCache();
        currentCategory = 'all';
        visibleCount = 6;
        renderVideos();
        closeUpload();
        showToast('🎉 视频发布成功！', 'success');

        const videoWall = document.getElementById('videoWall');
        if (videoWall) videoWall.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        console.error('[上传] 失败:', err);
        showToast('❌ ' + (err.message || '发布失败，请重试'), 'error');
        if (btnSubmit) btnSubmit.disabled = false;
        if (upProgress) upProgress.style.display = 'none';
    }
}

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ===== Toast 通知 =====
function showToast(message, type = '') {
    if (!toast) {
        console.warn('[Toast] toast 元素未找到, 消息:', message);
        return;
    }
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// ===== URL参数检测 - 支持分享链接直达 =====
function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get('v');
    if (videoId) {
        const video = videos.find(v => v.id === videoId);
        if (video) {
            setTimeout(() => openPlayer(video), 500);
        }
    }
}

// ===== 键盘快捷键 =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (shareOverlay && shareOverlay.classList.contains('active')) closeShare();
        if (uploadOverlay && uploadOverlay.classList.contains('active')) closeUpload();
    }
});

// ===== 初始化 =====
async function init() {
    // 显示加载中状态
    videoGrid.innerHTML = `
        <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <h3>加载视频中...</h3>
            <p>正在从服务器获取视频列表</p>
        </div>`;

    await fetchVideos();
    renderVideos();
    checkUrlParams();

    // 滚动导航效果
    window.addEventListener('scroll', () => {
        const navbar = document.getElementById('navbar');
        if (window.pageYOffset > 50) {
            navbar.style.boxShadow = '0 2px 20px rgba(0,0,0,0.5)';
        } else {
            navbar.style.boxShadow = 'none';
        }
    });
}

document.addEventListener('DOMContentLoaded', init);

console.log('🎬 AI灵感视界 - 视频展示平台已就绪！');
console.log('   ✅ 视频展示墙');
console.log('   ✅ 视频播放器');
console.log('   ✅ 上传功能');
console.log('   ✅ 分享功能');
console.log('   ✅ 分类筛选');
console.log('   ✅ 点赞互动');
