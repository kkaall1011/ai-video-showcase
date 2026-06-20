const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = path.join(DATA_DIR, 'videos.db');
const VIDEOS_DIR = path.join(DATA_DIR, 'videos');
const THUMB_DIR = path.join(DATA_DIR, 'thumbnails');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });
if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });

app.use(cors());
app.use(express.json());

// ===== THUMBNAIL MIDDLEWARE - MUST be before all routes =====
// Intercepts JSON responses to inject thumbnail URL into video objects
app.use('/api/videos', (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function(data) {
        if (Array.isArray(data)) {
            data = data.map(v => ({
                ...v,
                thumbnail: '/api/videos/' + (v.id || v._id) + '/thumbnail'
            }));
        } else if (data && Array.isArray(data.data)) {
            // Handle {success: true, data: [...]} format
            data.data = data.data.map(v => ({
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
// ===== END THUMBNAIL SETUP =====

const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
    file_name TEXT NOT NULL, file_type TEXT NOT NULL, file_size INTEGER NOT NULL,
    file_path TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, VIDEOS_DIR),
  filename: (req, file, cb) => {
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    cb(null, id + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

app.get('/api/videos', (req, res) => {
  db.all('SELECT id, title, description, file_name, file_type, file_size, created_at FROM videos ORDER BY created_at DESC', [],
    (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json({ success: true, data: rows }));
});

app.post('/api/videos/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const { title, description } = req.body;
  const id = path.basename(req.file.filename, path.extname(req.file.filename));
  db.run('INSERT INTO videos (id, title, description, file_name, file_type, file_size, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, title || req.file.originalname, description || '', req.file.originalname, req.file.mimetype, req.file.size, req.file.filename],
    function(err) {
      if (err) {
        fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: err.message });
      }
      // Generate thumbnail after upload
      const videoPath = path.join(VIDEOS_DIR, req.file.filename);
      if (fs.existsSync(videoPath)) {
        generateThumbnail(videoPath, id);
      }
      res.json({ success: true, data: { id, title: title || req.file.originalname, description: description || '', fileName: req.file.originalname, fileSize: req.file.size, createdAt: new Date().toISOString() }});
    });
});

app.get('/api/videos/:id', (req, res) => {
  db.get('SELECT * FROM videos WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Not found' });
    const videoPath = path.join(VIDEOS_DIR, row.file_path);
    if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'File not found' });
    const stat = fs.statSync(videoPath);
    res.setHeader('Content-Type', row.file_type);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Accel-Redirect', '/video-files/' + row.file_path);
    res.end();
  });
});

// Serve thumbnail images
app.get('/api/videos/:id/thumbnail', (req, res) => {
    const videoId = req.params.id;
    const thumbPath = path.join(THUMB_DIR, videoId + '.jpg');
    
    if (fs.existsSync(thumbPath)) {
        return res.sendFile(path.resolve(thumbPath));
    }
    
    // Generate on-demand
    db.get('SELECT file_path FROM videos WHERE id = ?', [videoId], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ error: 'Thumbnail not available' });
        }
        const fullPath = path.join(VIDEOS_DIR, row.file_path);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'Video file not found' });
        }
        const generated = generateThumbnail(fullPath, videoId);
        if (generated && fs.existsSync(generated)) {
            return res.sendFile(path.resolve(generated));
        }
        res.status(404).json({ error: 'Could not generate thumbnail' });
    });
});

app.delete('/api/videos/:id', (req, res) => {
  db.get('SELECT * FROM videos WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Not found' });
    db.run('DELETE FROM videos WHERE id = ?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      const videoPath = path.join(VIDEOS_DIR, row.file_path);
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      // Also delete thumbnail
      const thumbPath = path.join(THUMB_DIR, req.params.id + '.jpg');
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
      res.json({ success: true });
    });
  });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
