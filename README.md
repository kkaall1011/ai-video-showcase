# 🎬 AI灵感视界 — AI 创意短视频展示平台

一个美观的 AI 生成视频展示平台，支持视频上传、分类筛选、点赞分享、缩略图自动生成等功能。前后端一体设计，可快速部署到 VPS。

在线演示：`https://videos.k2000.xyz/`

---

## 📋 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [本地开发](#本地开发)
- [VPS 部署](#vps-部署)
- [API 文档](#api-文档)
- [缩略图系统](#缩略图系统)
- [架构说明](#架构说明)
- [常见问题](#常见问题)
- [开发指南](#开发指南)

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 🎬 视频网格展示 | 响应式瀑布流，支持 Canvas 场景占位图 + 真实视频帧缩略图 |
| 📂 分类筛选 | 风景、科幻、动物、人物、动画、抽象 6 大分类 |
| 🔍 排序 | 按最新 / 最热排序 |
| ▶️ 视频播放器 | 弹窗式播放器，支持全屏、进度条、音量控制 |
| 📤 视频上传 | 拖拽上传，最大 500MB，支持进度条 |
| ❤️ 点赞互动 | 前端 + localStorage 持久化，异步通知后端 |
| 🔗 社交分享 | 微信（复制链接）、微博、QQ 一键分享 |
| 🖼️ 缩略图系统 | 双层策略：Canvas 即时渲染 + ffmpeg 真实帧异步替换 |
| 📱 响应式 | 适配桌面、平板、手机 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| **前端** | 原生 HTML5 + CSS3 + Vanilla JS (ES6+) |
| **后端** | Node.js + Express |
| **数据库** | SQLite（零配置，无需安装） |
| **视频处理** | ffmpeg（缩略图生成） |
| **Web 服务器** | Nginx（反向代理 + 静态资源 + 视频流） |
| **进程管理** | PM2（生产环境守护进程） |
| **字体** | Google Fonts - Noto Sans SC |

---

## 项目结构

```
ai-video-showcase/
├── index.html               # 前端主页面（单页应用）
├── server.js                # Express 后端（API + 视频流 + 缩略图）
├── css/
│   └── style.css            # 全局样式（600+ 行，暗色主题）
├── js/
│   └── main.js              # 前端逻辑（1260+ 行）
├── deploy.sh                # VPS 一键部署（Nginx + 前端文件）
├── vps_fix_all.sh           # VPS 全面修复（ffmpeg + 缩略图批量生成）
├── setup_thumbnails.sh      # 缩略图系统完整部署
├── fix_thumbnails.sh        # 缩略图变形修复
├── .gitignore               # Git 忽略规则
└── README.md                # 本文档
```

### 前端文件职责

**index.html** (222行)
- 导航栏、Hero 区域、分类栏、视频网格、播放器弹窗、分享弹窗、上传弹窗、Toast 提示
- 无框架依赖，纯 HTML 结构

**css/style.css** (615行)
- CSS 变量系统（颜色、圆角、阴影、过渡）
- 暗色科幻主题 (`--bg: #0a0a14`)
- 动画：粒子浮动、淡入、滚动指示器
- 响应式断点：768px / 480px

**js/main.js** (1261行)
- 视频数据管理（API 加载 → 本地映射 → 缓存降级）
- Canvas 场景缩略图生成（6 种主题，每类独立绘制逻辑）
- 服务端缩略图异步加载（淡入淡出过渡）
- 分类筛选 + 排序 + 无限加载
- 视频播放器（弹窗 + 全屏 + 键盘 ESC 关闭）
- 上传功能（拖拽 + XHR 进度 + 错误处理）
- 分享功能（URL 复制 + 社交平台跳转）
- 点赞交互（localStorage 持久化）
- URL 参数检测（`?v=videoId` 分享直达）

### 后端文件职责

**server.js** (166行)
- SQLite 数据库初始化（`videos` 表）
- Multer 文件上传（UUID 命名，500MB 限制）
- **缩略图中间件**（在路由之前注册，拦截 JSON 响应注入 `thumbnail` 字段）
- ffmpeg 缩略图生成函数（`scale=640:-1` 保持比例，15 秒超时）
- API 路由：
  - `GET /api/videos` — 视频列表
  - `POST /api/videos/upload` — 上传视频 + 自动生成缩略图
  - `GET /api/videos/:id` — 视频流（通过 Nginx X-Accel-Redirect）
  - `GET /api/videos/:id/thumbnail` — 缩略图（支持按需生成）
  - `DELETE /api/videos/:id` — 删除视频 + 同步删除缩略图
  - `GET /api/health` — 健康检查

---

## 本地开发

### 环境要求

- **Node.js** >= 14.x
- **npm** >= 6.x
- **ffmpeg**（可选，用于生成真实缩略图）

### 快速启动

```bash
# 1. 克隆仓库
git clone https://github.com/kkaall1011/ai-video-showcase.git
cd ai-video-showcase

# 2. 安装依赖
npm init -y
npm install express sqlite3 multer cors

# 3. 启动后端服务
node server.js
# 服务运行在 http://localhost:3001

# 4. 新开终端，用静态服务器托管前端
# 方式一：使用 Python
python3 -m http.server 8080
# 方式二：使用 npx serve
npx serve .

# 5. 打开浏览器
# http://localhost:8080
```

### 本地开发注意事项

- 前端 `js/main.js` 中 `API_BASE = '/api'`，如果后端在不同端口，需要修改为 `http://localhost:3001/api`
- 或者配置 Nginx 反向代理（见下文），前后端同域开发

---

## VPS 部署

### 环境要求

- **操作系统**: Ubuntu 20.04 / 22.04 或 Debian 11/12
- **Node.js**: 14.x 或更高
- **PM2**: 全局安装 `npm install -g pm2`
- **Nginx**: `apt install nginx`
- **ffmpeg**: `apt install ffmpeg`

### 步骤一：上传项目到 VPS

```bash
# 从本地打包上传
tar -czf project.tar.gz --exclude='node_modules' --exclude='data' .
scp project.tar.gz root@YOUR_VPS_IP:/opt/
ssh root@YOUR_VPS_IP

# 在 VPS 上解压
cd /opt
tar -xzf project.tar.gz
mkdir -p /opt/videoshowcase
mv index.html css/ js/ server.js /opt/videoshowcase/
```

### 步骤二：安装后端依赖并启动

```bash
cd /opt/videoshowcase
npm init -y
npm install express sqlite3 multer cors

# 用 PM2 启动后端
pm2 start server.js --name videoshowcase
pm2 save
pm2 startup  # 设置开机自启
```

### 步骤三：配置 Nginx

```bash
# 运行部署脚本（会自动配置 Nginx）
chmod +x deploy.sh
sudo bash deploy.sh

# 或手动配置 /etc/nginx/sites-available/videoshowcase
```

**Nginx 配置核心逻辑**：

```
location /api/     → proxy_pass http://127.0.0.1:3001  （API 反向代理）
location /videos/  → proxy_pass http://127.0.0.1:3001  （视频流代理）
location /         → try_files $uri $uri/ =404          （静态文件）
```

### 步骤四：生成缩略图（已有视频）

```bash
# 一键修复脚本（安装 ffmpeg + 生成缩略图 + 添加路由）
chmod +x vps_fix_all.sh
sudo bash vps_fix_all.sh
```

### 生产环境目录结构

```
/opt/videoshowcase/
├── server.js              # Express 后端
├── node_modules/          # npm 依赖
├── data/
│   ├── videos.db          # SQLite 数据库
│   ├── videos/            # 上传的视频文件
│   └── thumbnails/        # ffmpeg 生成的缩略图（*.jpg）
├── index.html             # 前端（Nginx 直接托管）
├── css/
└── js/
```

### 验证部署

```bash
# 1. 健康检查
curl http://localhost/api/health
# 应返回: {"status":"ok"}

# 2. 视频列表
curl http://localhost/api/videos
# 应返回 JSON，每个视频包含 thumbnail 字段

# 3. 缩略图
curl -I http://localhost/api/videos/<任意视频ID>/thumbnail
# 应返回 200 OK, Content-Type: image/jpeg

# 4. PM2 状态
pm2 status
```

---

## API 文档

Base URL: `http://YOUR_VPS_IP/api`

### `GET /api/videos`

获取所有视频列表。

**响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4-...",
      "title": "示例视频",
      "description": "视频描述",
      "file_name": "a1b2c3d4-....mp4",
      "file_type": "video/mp4",
      "file_size": 10485760,
      "created_at": "2025-06-20T10:00:00.000Z",
      "thumbnail": "/api/videos/a1b2c3d4-.../thumbnail"
    }
  ]
}
```

### `POST /api/videos/upload`

上传新视频（`multipart/form-data`）。

**参数**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `video` | File | ✅ | 视频文件（最大 500MB） |
| `title` | String | ✅ | 视频标题 |
| `description` | String | ❌ | 视频描述 |
| `category` | String | ❌ | 分类 |
| `aiTool` | String | ❌ | 使用的 AI 工具 |

### `GET /api/videos/:id`

获取视频流文件。支持 Range 请求（断点续传/拖动进度条）。

### `GET /api/videos/:id/thumbnail`

获取视频缩略图。缩略图不存在时自动调用 ffmpeg 生成。

**响应**: `image/jpeg` 二进制流

### `DELETE /api/videos/:id`

删除指定视频及其缩略图。

### `GET /api/health`

健康检查。

---

## 缩略图系统

### 工作原理（双层策略）

```
用户访问页面
    │
    ├── 第一阶段（毫秒级）
    │   Canvas 即时渲染：根据分类生成场景主题占位图
    │   ├── 风景 → 山脉、松树、河流
    │   ├── 科幻 → 未来建筑、全息投影
    │   ├── 动物 → 森林、鹿剪影
    │   ├── 人物 → 人物剪影、粒子
    │   ├── 动画 → 彩色形状、闪光
    │   └── 抽象 → 流动曲线、光球
    │
    └── 第二阶段（异步，100ms 后）
        加载服务端缩略图 API
            ├── 存在 → 渐入替换 Canvas 占位图
            └── 不存在 → 调用 ffmpeg 按需生成
```

### ffmpeg 命令

```bash
ffmpeg -y -ss 1 -i "video.mp4" -vframes 1 -vf "scale=640:-1" -q:v 5 "thumbnail.jpg"
```

- `-ss 1`：截取第 1 秒
- `-vf scale=640:-1`：宽度 640px，高度自动保持原始比例
- `-q:v 5`：JPEG 质量（1-31，越小越清晰）
- CSS `object-fit: cover` 负责在 16:9 容器中居中裁剪

### 批量生成缩略图

```bash
# 为所有已有视频生成缩略图
bash vps_fix_all.sh
# 或
bash setup_thumbnails.sh
```

---

## 架构说明

### 请求流程

```
浏览器
  │
  ├── /index.html, /css/*, /js/*
  │   └── Nginx 直接返回静态文件
  │
  ├── /api/videos
  │   └── Nginx → proxy_pass → Express:3001 → SQLite
  │       └── 缩略图中间件注入 thumbnail 字段 → JSON 响应
  │
  ├── /api/videos/:id (视频流)
  │   └── Nginx → proxy_pass → Express:3001
  │       └── 设置 X-Accel-Redirect 头 → 高效文件传输
  │
  └── /api/videos/:id/thumbnail
      └── Nginx → proxy_pass → Express:3001
          ├── 缩略图存在 → sendFile (Cache-Control: public, max-age=86400)
          └── 不存在 → ffmpeg 生成 → sendFile
```

### 关键设计决策

1. **为什么用 SQLite？** — 零配置，无需安装数据库服务，适合中小规模应用。数据存储在 `data/videos.db` 单个文件中，备份方便。

2. **为什么缩略图中间件在路由之前？** — Express 中间件按注册顺序执行。如果缩略图中间件在路由之后，路由的 `res.json()` 已经发送响应，中间件的包装器永远不会执行。这是本项目中曾遇到的重要 bug。

3. **为什么用 Canvas 占位图？** — 首屏不依赖网络请求，所有视频卡片瞬间渲染。Canvas 生成的场景图与视频分类匹配，视觉上不突兀。之后异步加载真实缩略图替换。

4. **为什么上传 API 是 `/api/videos/upload` 而不是 `/api/upload`？** — 上传路由在缩略图中间件的作用路径 `/api/videos` 下，确保新上传的视频响应也自动包含 `thumbnail` 字段。

---

## 常见问题

### Q: 网页打开后视频卡片没有缩略图？

**原因**: 后端 `server.js` 中缩略图中间件注册顺序错误（在路由之后）。

**解决**: 确保中间件在 `app.use(express.json())` 之后、所有 API 路由之前注册。

### Q: 缩略图显示 404？

**原因**: 可能 VPS 上没有安装 ffmpeg 或者缩略图未生成。

**解决**:
```bash
# 检查 ffmpeg
ffmpeg -version

# 未安装则安装
sudo apt install -y ffmpeg

# 批量生成缩略图
bash vps_fix_all.sh
```

### Q: 上传视频失败？

**可能原因**:
1. 文件超过 500MB — 修改 `server.js` 中 multer 的 `limits.fileSize`
2. Nginx 的 `client_max_body_size` 默认 1MB — 已在 Nginx 配置中设为 500M
3. `data/videos/` 目录权限不足 — `chmod 755 data/videos/`

### Q: 如何备份数据？

```bash
# 备份整个数据目录
tar -czf backup_$(date +%Y%m%d).tar.gz /opt/videoshowcase/data/

# 仅备份数据库
cp /opt/videoshowcase/data/videos.db ./backup_videos.db
```

### Q: 如何修改端口？

修改 `server.js` 第 9 行：
```javascript
const PORT = process.env.PORT || 3001;  // 改为你需要的端口
```
同时更新 Nginx 配置中的 `proxy_pass` 端口。

### Q: 如何添加 HTTPS？

```bash
# 使用 Certbot + Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 开发指南

### 添加新分类

1. **前端** `index.html` — 在分类栏添加按钮：
```html
<button class="category-btn" data-category="新分类">🎯 新分类</button>
```

2. **前端** `js/main.js` — 在 `sceneThemes` 对象添加主题配色，在 `generateThumbnailUrl` 的 `switch` 中添加对应绘制逻辑。

3. **后端** 无需修改（分类信息存储在视频元数据中）。

### 添加新的 Canvas 场景

在 `js/main.js` 的 `generateThumbnailUrl` 函数的 `switch` 语句中添加新的 `case`，参考现有场景的绘制方式：
- 天空渐变 → 星星 → 太阳/月亮 → 山脉 → 地面
- 然后调用场景专属绘制函数
- 最后叠加底部遮罩 + 文本信息

### 修改缩略图尺寸

编辑 `server.js` 中 `generateThumbnail` 函数的 ffmpeg 参数：
```javascript
// 当前: 宽度 640，高度自动
'ffmpeg -y -ss 1 -i "..." -vframes 1 -vf "scale=640:-1" -q:v 5 "...jpg"'

// 改为 720p:
'... -vf "scale=1280:-1" ...'
```

对应的 Canvas 尺寸在 `js/main.js` 的 `generateThumbnailUrl` 函数：
```javascript
canvas.width = 640;   // 修改这里
canvas.height = 360;  // 修改这里
```

### 本地调试技巧

```bash
# 查看后端日志
pm2 logs videoshowcase

# 查看 API 响应
curl -s http://localhost:3001/api/videos | python3 -m json.tool

# 测试缩略图
curl -I http://localhost:3001/api/videos/<video_id>/thumbnail

# 检查 ffmpeg 是否可用
which ffmpeg && ffmpeg -version
```

---

## License

MIT

---

**最后更新**: 2025-06-20
**仓库**: https://github.com/kkaall1011/ai-video-showcase
