// index.html + css + js 를 하나의 HTML 조각으로 합칩니다 (claude.ai Artifact 게시용).
// 실행: node tools/build-artifact.js  →  dist/cube-study-lab.html
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, p) =>
  `<style>\n${fs.readFileSync(path.join(root, p), 'utf8')}\n</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, p) =>
  `<script>\n${fs.readFileSync(path.join(root, p), 'utf8')}\n</script>`);
// Artifact 게시 시 문서 골격이 자동으로 붙으므로 제거
html = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'cube-study-lab.html');
fs.writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(1) + ' KB');
