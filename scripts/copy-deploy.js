const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const deployDir = path.join(rootDir, 'deploy');

console.log('📦 [Deploy] Đang chuền bị gói thư mục deploy...');

if (!fs.existsSync(deployDir)) {
  fs.mkdirSync(deployDir, { recursive: true });
}

function copyFolder(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  try {
    fs.cpSync(src, dest, { recursive: true, force: true });
    console.log(`  ✓ Đã copy thư mục: ${path.relative(rootDir, src)} -> ${path.relative(rootDir, dest)}`);
  } catch (err) {
    if (err && (err.code === 'EBUSY' || err.code === 'EPERM')) {
      console.log(`  - Cảnh báo: File trong ${path.relative(rootDir, dest)} đang được chạy, đã ghi đè các file không khóa.`);
    } else {
      throw err;
    }
  }
}

function copyFile(src, dest, overwrite = true) {
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dest) && !overwrite) {
    console.log(`  - Bỏ qua (đã tồn tại): ${path.relative(rootDir, dest)}`);
    return;
  }
  try {
    fs.copyFileSync(src, dest);
    console.log(`  ✓ Đã copy file: ${path.relative(rootDir, src)} -> ${path.relative(rootDir, dest)}`);
  } catch (err) {
    if (err && err.code === 'EBUSY') {
      console.log(`  - Bỏ qua (file đang được chạy/khóa): ${path.relative(rootDir, dest)}`);
    } else {
      throw err;
    }
  }
}

// 1. Copy backend/dist
copyFolder(path.join(rootDir, 'backend', 'dist'), path.join(deployDir, 'dist'));

// 2. Copy backend/public
copyFolder(path.join(rootDir, 'backend', 'public'), path.join(deployDir, 'public'));

// 3. Copy package.json & package-lock.json
copyFile(path.join(rootDir, 'backend', 'package.json'), path.join(deployDir, 'package.json'));
copyFile(path.join(rootDir, 'backend', 'package-lock.json'), path.join(deployDir, 'package-lock.json'));

// 4. Copy template cấu hình mẫu (không copy cookies.json thật của dev)
copyFile(path.join(rootDir, 'backend', 'cookies.json.example'), path.join(deployDir, 'cookies.json.example'), true);
copyFile(path.join(rootDir, 'backend', 'violation_rules.json'), path.join(deployDir, 'violation_rules.json'), false);

// 5. Giữ nguyên toàn bộ dữ liệu riêng của deploy (không copy đè database, json data, cookies, avatars)
console.log('  ℹ️ [Data] Bỏ qua copy data (deploy giữ nguyên database.sqlite, videos_data.json, profiles_data.json, cookies.json)');

// 5.1 Đảm bảo thư mục deploy/avatars tồn tại nhưng KHÔNG ghi đè/xóa avatars của deploy
const deployAvatarsDir = path.join(deployDir, 'avatars');
if (!fs.existsSync(deployAvatarsDir)) {
  fs.mkdirSync(deployAvatarsDir, { recursive: true });
  console.log('  ✓ Đã khởi tạo thư mục: deploy/avatars');
}

// 6. Copy ngrok.exe
if (fs.existsSync(path.join(rootDir, 'ngrok.exe'))) {
  copyFile(path.join(rootDir, 'ngrok.exe'), path.join(deployDir, 'ngrok.exe'), false);
}

// 7. Tạo start.bat
const bat = [
  '@echo off',
  'title Video Tracker Realtime - Server',
  'chcp 65001 >nul',
  'cls',
  'set PORT=3333',
  'echo ======================================================',
  'echo    HE THONG THEO DOI VIDEO REALTIME (DEPLOY PACK)',
  'echo ======================================================',
  'echo.',
  'if not exist node_modules (',
  '  echo [*] Phat hien lan chay dau tien, dang cai dat dependencies...',
  '  call npm install --omit=dev',
  '  echo [*] Cai dat trinh duyet Chromium cho Playwright...',
  '  call npx playwright install chromium',
  ')',
  'if exist ngrok.exe (',
  '  echo [*] Khoi dong ngrok voi domain co dinh...',
  '  start cmd /k "title Ngrok Tunnel && ngrok.exe http --domain=fiber-decree-amuser.ngrok-free.dev 3333"',
  ')',
  'echo [*] Dang khoi dong Backend NestJS tai cong 3333...',
  'echo 👉 Truy cap web tai: http://localhost:3333 hoac qua ngrok domain.',
  'echo.',
  'node dist/main.js',
  'pause',
  ''
].join('\r\n');
fs.writeFileSync(path.join(deployDir, 'start.bat'), bat, 'utf8');
console.log('  ✓ Đã tạo file: deploy/start.bat');

// 8. Tạo README.md
const md = [
  '# Video Tracker Realtime - Deploy Package',
  '',
  'Gói triển khai chạy độc lập đã được biên dịch hoàn chỉnh cả Frontend và Backend.',
  '',
  '## Cách chạy:',
  '1. Nhấp đúp vào file `start.bat` (trên Windows).',
  '2. Lần đầu chạy sẽ tự động cài đặt thư viện (`npm install --omit=dev`) và Playwright Chromium.',
  '3. Truy cập: `http://localhost:3333` hoặc domain ngrok: `https://fiber-decree-amuser.ngrok-free.dev`.',
  ''
].join('\n');
fs.writeFileSync(path.join(deployDir, 'README.md'), md, 'utf8');
console.log('  ✓ Đã tạo file: deploy/README.md');

console.log('\n🎉 [Deploy] Gói deploy đã hoàn tất tại thư mục: deploy/');
