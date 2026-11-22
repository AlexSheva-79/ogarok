// Собирает файлы игры в папку www — её Capacitor кладёт внутрь APK.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of ['index.html', 'manifest.json', 'src', 'assets', 'vendor']) {
  fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });
}
console.log('Игра скопирована в www/');
