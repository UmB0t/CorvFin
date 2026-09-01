const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

async function debugTests() {
  console.log('Testing 23 and 28 assertions...');

  // Test 28 checks:
  try {
    const mongoStorageJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'services', 'mongoStorage.js'), 'utf8');
    const jsonStorageJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'services', 'jsonStorage.js'), 'utf8');
    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
    const adminJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
    const uiShellJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'uiShell.js'), 'utf8');
    const routerJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'router.js'), 'utf8');
    const authJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'auth.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const componentsCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'components.css'), 'utf8');

    console.log('28.1:', mongoStorageJs.includes("dashboard: { maintenance: false, name: 'Dashboard' }"));
    console.log('28.2:', jsonStorageJs.includes("dashboard: { maintenance: false, name: 'Dashboard' }"));
    console.log('28.3:', mongoStorageJs.includes("dashboard: true"));
    console.log('28.4:', jsonStorageJs.includes("dashboard: true"));
    console.log('28.5:', mongoStorageJs.includes("dashboard: permissions.dashboard !== false"));
    console.log('28.6:', serverJs.includes("dashboard: permissions.dashboard !== false"));
    console.log('28.7:', serverJs.includes("'dashboard'") && serverJs.includes("ALLOWED_MODULES"));
    console.log('28.8:', serverJs.includes("dashboard: true") && serverJs.includes("/api/admin/users"));
    console.log('28.9:', indexHtml.includes('id="default-perm-dashboard"') && indexHtml.includes('data-default-module="dashboard"'));
    console.log('28.10:', adminJs.includes("ALL_MODULES_CONFIG"));
    console.log('28.11:', adminJs.includes('data-manage-modules'));
    console.log('28.12:', adminJs.includes('Admin — Acesso Total'));
    console.log('28.13:', adminJs.includes('function openManageModulesModal'));
    console.log('28.14:', adminJs.includes('adminManageModulesDialog'));
    console.log('28.15:', adminJs.includes('btnSaveManageModules') && adminJs.includes('updatePermissions'));
    console.log('28.16:', adminJs.includes('adminCreatePerm_dashboard'));
    console.log('28.17:', uiShellJs.includes("'tab-dashboard': 'dashboard'"));
    console.log('28.18:', uiShellJs.includes('function hasTabPermission'));
    console.log('28.19:', uiShellJs.includes('function getFirstAllowedTab'));
    console.log('28.20:', uiShellJs.includes('getFirstAllowedRouteForUser'));
    console.log('28.21:', routerJs.includes("'tab-dashboard'") && routerJs.includes("permission: 'dashboard'"));
    console.log('28.22:', authJs.includes('getFirstAllowedRouteForUser'));
  } catch (err) {
    console.error('Error in 28 test:', err);
  }
}

debugTests();
