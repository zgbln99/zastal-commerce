import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

// Render the real component tree with Next's route contexts. No browser effects,
// API requests, authentication changes or production data are involved.
const require = createRequire(new URL('../storefront/package.json', import.meta.url));
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const ts = require('typescript');
const {PathnameContext} = require('next/dist/shared/lib/hooks-client-context.shared-runtime.js');
const {AppRouterContext} = require('next/dist/shared/lib/app-router-context.shared-runtime.js');
const previous = new Map(['.ts', '.tsx', '.css'].map(extension => [extension, require.extensions[extension]]));
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const {outputText} = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
    });
    module._compile(outputText, filename);
  };
}
require.extensions['.css'] = () => {};
after(() => {
  for (const [extension, loader] of previous) {
    if (loader) require.extensions[extension] = loader;
    else delete require.extensions[extension];
  }
});
const CommerceRoot = require('./components/CommerceRoot.tsx').default;
const Products = require('./app/admin/Products.tsx').default;
const {default: ProductGalleryEditor, emptyGallery} = require('./app/admin/ProductGalleryEditor.tsx');
const HomeEditor = require('./app/admin/HomeEditor.tsx').default;
const HomeCanvas = require('./components/HomeCanvas.tsx').default;
const {DEFAULT_HOME} = require('./lib/home-layout.ts');
const {useStore} = require('./components/StoreProvider.tsx');
const {useAuth} = require('./components/AuthProvider.tsx');
const h = React.createElement;
const router = {back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}};
function render(pathname, child) {
  return renderToStaticMarkup(h(AppRouterContext.Provider, {value: router},
    h(PathnameContext.Provider, {value: pathname}, h(CommerceRoot, null, child))));
}

test('administrator product list can render with its gallery integration', () => {
  const html = render('/admin', h(Products, {inventory: [], onRefresh: async () => true}));
  assert.match(html, /Dodaj produkt/);
  assert.match(html, /Szukaj produktu w panelu/);
  assert.doesNotMatch(html, /Otwórz koszyk/);
});
test('administrator product gallery can render when opening a product', () => {
  const html = render('/admin', h(ProductGalleryEditor, {productId: 8, name: 'Worek', value: emptyGallery(), onChange() {}, onSaved: async () => {}, onBusy() {}}));
  assert.match(html, /Galeria zdjęć produktu/);
  assert.match(html, /Dodaj wiele zdjęć/);
});
test('homepage editor can render inside the administrator route', () => {
  const html = render('/admin', h(HomeEditor));
  assert.match(html, /Edytor strony głównej/);
});
test('private homepage preview receives the same catalogue context', () => {
  const html = render('/admin/podglad', h(HomeCanvas, {config: DEFAULT_HOME}));
  assert.match(html, /Sklep Zastalu Zielona Góra/);
  assert.match(html, /Kolekcje/);
  assert.doesNotMatch(html, /Otwórz koszyk/);
});
test('public routes keep their storefront shell and catalogue context', () => {
  function Catalogue() { return h('p', null, useStore().products[0].name); }
  const html = render('/sklep', h(Catalogue));
  assert.match(html, /Bluza Zastal Logo/);
  assert.match(html, /Otwórz koszyk/);
});
test('sharing the catalogue context keeps the authentication provider', () => {
  function Identity() { return h('p', null, useAuth().user?.role || 'anonymous'); }
  assert.match(render('/admin', h(Identity)), /anonymous/);
});
