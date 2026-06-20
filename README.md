# AI 视频展示平台

一个美观的 AI 生成视频展示平台，支持视频上传、分类筛选、点赞分享等功能。

## 功能特性

- 🎬 视频网格展示，支持 Canvas 场景缩略图和真实视频帧缩略图
- 📂 分类筛选（风景、科幻、动物、人物、动画、抽象）
- 🔍 排序（最新、最热）
- ▶️ 视频播放器（支持 Nginx X-Accel-Redirect 高效传输）
- 📤 视频上传（支持拖拽，最大 500MB）
- ❤️ 点赞互动
- 🔗 社交分享（微信、微博、QQ）
- 🖼️ ffmpeg 自动生成视频缩略图

## 技术栈

- **前端**: 原生 HTML/CSS/JS
- **后端**: Node.js + Express
- **数据库**: SQLite
- **视频处理**: ffmpeg
- **反向代理**: Nginx + X-Accel-Redirect

## 项目结构

```
├── index.html          # 主页面
├── css/
│   └── style.css       # 样式
├── js/
│   └── main.js         # 前端逻辑
├── server.js           # Express 后端
├── deploy.sh           # VPS 一键部署脚本
├── setup_thumbnails.sh # 缩略图系统部署
├── fix_thumbnails.sh   # 缩略图修复脚本
└── vps_fix_all.sh      # VPS 全面修复（ffmpeg + 缩略图）
```

## 快速部署

```bash
# 在 Ubuntu/Debian VPS 上运行
chmod +x deploy.sh
sudo bash deploy.sh
```

## 缩略图系统

- 视频上传后自动用 ffmpeg 生成缩略图（`scale=640:-1` 保持比例）
- 前端先用 Canvas 生成场景主题占位图，再异步加载真实缩略图
- 图片不存在时支持按需生成
