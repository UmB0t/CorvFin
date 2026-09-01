const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

function runFullTest38() {
  const manifestPath = path.join(process.cwd(), 'public', 'manifest.webmanifest');
  assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest deve existir na pasta public');

  const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.strictEqual(manifestContent.name, 'OmniFin', 'Nome no manifest deve ser OmniFin');
  assert.strictEqual(manifestContent.short_name, 'OmniFin', 'Nome curto no manifest deve ser OmniFin');
  assert.strictEqual(manifestContent.display, 'standalone', 'display no manifest deve ser standalone');
  assert.strictEqual(manifestContent.start_url, './dashboard', 'start_url deve ser relativo (./dashboard) para suportar tanto subpath (/omnifin) quanto raiz (/)');
  assert.strictEqual(manifestContent.scope, './', 'scope deve ser relativo (./) para suportar subpath (/omnifin) e raiz (/)');
  assert.strictEqual(manifestContent.theme_color, '#1F7A5C', 'theme_color deve ser o verde oficial OmniFin');
  assert.ok(Array.isArray(manifestContent.icons) && manifestContent.icons.length >= 3, 'Manifest deve conter array de ícones');

  const icon192 = manifestContent.icons.find(i => i.sizes === '192x192');
  const icon512 = manifestContent.icons.find(i => i.sizes === '512x512');
  assert.ok(icon192, 'Manifest deve referenciar ícone 192x192');
  assert.ok(icon512, 'Manifest deve referenciar ícone 512x512');
  assert.ok(!icon192.src.startsWith('/'), 'Ícone 192 deve usar caminho relativo no manifest');
  assert.ok(!icon512.src.startsWith('/'), 'Ícone 512 deve usar caminho relativo no manifest');

  // Validação também de manifest.json (espelho)
  const manifestJsonPath = path.join(process.cwd(), 'public', 'manifest.json');
  assert.ok(fs.existsSync(manifestJsonPath), 'manifest.json deve existir na pasta public');
  const manifestJsonContent = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf-8'));
  assert.strictEqual(manifestJsonContent.start_url, './dashboard', 'start_url em manifest.json deve ser relativo');
  assert.strictEqual(manifestJsonContent.scope, './', 'scope em manifest.json deve ser relativo');

  // 2. Existência e Integridade dos Arquivos de Ícones Oficiais
  const iconsDir = path.join(process.cwd(), 'public', 'icons');
  assert.ok(fs.existsSync(iconsDir), 'Pasta public/icons deve existir');

  const expectedIcons = [
    'icon.svg',
    'icon-192x192.png',
    'icon-512x512.png',
    'apple-touch-icon.png',
    'apple-touch-icon-180x180.png',
    'apple-touch-icon-152x152.png',
    'apple-touch-icon-120x120.png'
  ];

  for (const iconFile of expectedIcons) {
    const iconPath = path.join(iconsDir, iconFile);
    assert.ok(fs.existsSync(iconPath), `Arquivo ${iconFile} deve existir em public/icons`);
    const stat = fs.statSync(iconPath);
    assert.ok(stat.size > 100, `Arquivo ${iconFile} deve ter tamanho válido (> 100 bytes)`);
  }

  // 3. Meta Tags iOS e Apple Touch Icons no index.html e login.html (caminhos relativos e BASE_PATH safe)
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf-8');
  const loginHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'login.html'), 'utf-8');

  for (const [name, html] of [['index.html', indexHtml], ['login.html', loginHtml]]) {
    assert.ok(html.includes('href="manifest.webmanifest"'), `${name} deve referenciar o webmanifest de forma relativa`);
    assert.ok(html.includes('rel="apple-touch-icon" href="icons/apple-touch-icon.png"'), `${name} deve referenciar apple-touch-icon relativo`);
    assert.ok(html.includes('name="apple-mobile-web-app-capable" content="yes"'), `${name} deve conter apple-mobile-web-app-capable`);
    assert.ok(html.includes('name="apple-mobile-web-app-status-bar-style"'), `${name} deve conter apple-mobile-web-app-status-bar-style`);
    assert.ok(html.includes('name="apple-mobile-web-app-title" content="OmniFin"'), `${name} deve conter apple-mobile-web-app-title`);
    assert.ok(html.includes('name="theme-color" content="#1F7A5C"'), `${name} deve conter theme-color #1F7A5C`);
  }

  // 4. Service Worker (sw.js) & Isolamento de Segurança Financeira
  const swPath = path.join(process.cwd(), 'public', 'sw.js');
  assert.ok(fs.existsSync(swPath), 'public/sw.js deve existir');

  const swContent = fs.readFileSync(swPath, 'utf-8');
  assert.ok(swContent.includes('CACHE_VERSION') || swContent.includes('CACHE_NAME') || swContent.includes('omnifin-static-'), 'Service Worker deve possuir cache versionado');
  assert.ok(swContent.includes('/api/'), 'Service Worker deve inspecionar rotas /api/');
  assert.ok(swContent.includes('fetch(req)') || swContent.includes('fetch(event.request)'), 'Service Worker deve utilizar estratégia network-only para APIs');

  // 5. Garantia de que rotas financeiras e IA não são cacheadas em storage estático
  assert.ok(!swContent.includes('cache.put(req, networkResponse)') || swContent.includes('!url.pathname.startsWith(\'/api/\')') || swContent.includes('url.pathname.startsWith(\'/api/\')'), 'Service Worker deve isolar o cache de requisições financeiras');

  // 6. Proteção de Navegação iOS Standalone e Registro de SW compatível com BASE_PATH
  const uiShellJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'uiShell.js'), 'utf-8');
  assert.ok(uiShellJs.includes('navigator.standalone') || uiShellJs.includes('serviceWorker'), 'uiShell.js deve conter suporte a PWA e proteção iOS standalone');
  assert.ok(uiShellJs.includes('API.resolveUrl'), 'uiShell.js deve utilizar API.resolveUrl para registro do Service Worker');

  // 7. Ausência de target="_blank" em links internos
  assert.ok(!indexHtml.includes('href="/dashboard" target="_blank"'), 'Links internos não devem conter target="_blank"');
  assert.ok(!indexHtml.includes('href="/expenses" target="_blank"'), 'Links internos não devem conter target="_blank"');
  console.log('All Test 38 assertions passed!');
}

runFullTest38();
