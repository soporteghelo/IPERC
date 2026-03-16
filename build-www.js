/**
 * build-www.js — Copia los archivos web a la carpeta www/ para Capacitor
 * Uso: node build-www.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const DEST = path.join(__dirname, 'www');

const FILES = [
  'index.html',
  'app.js',
  'styles.css',
  'sw.js',
  'manifest.json',
  'config.local.json',
  'Logo.png',
  'Logo.ico',
];

if (!fs.existsSync(DEST)) {
  fs.mkdirSync(DEST, { recursive: true });
  console.log('Creada carpeta www/');
}

let copied = 0;
FILES.forEach((file) => {
  const src = path.join(SRC, file);
  const dest = path.join(DEST, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  ✓ ${file}`);
    copied++;
  } else {
    console.warn(`  ⚠ no encontrado: ${file}`);
  }
});

console.log(`\nwww/ listo — ${copied} archivos copiados.`);
