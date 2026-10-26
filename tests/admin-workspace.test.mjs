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

const authModule=require('./components/AuthProvider.tsx');
const storeModule=require('./components/StoreProvider.tsx');
authModule.useAuth=()=>({loading:false,error:'',user:{id:1,name:'Menedżer',identifier:'admin',role:'admin',capabilities:['orders','products','inventory','pos','fulfillment','production','returns','transfers','labels','players','customers','settings','cms','pages','email','launch','staff','audit']},request:async()=>[],logout:async()=>{},refresh:async()=>{}});
storeModule.useStore=()=>({sales:{checkoutEnabled:false},products:[],players:[],refresh:async()=>{}});
const Admin=require('./app/admin/page.tsx').default;
const h=React.createElement;
const router={back(){},forward(){},refresh(){},push(){},replace(){},prefetch(){}};
function render(path){return renderToStaticMarkup(h(AppRouterContext.Provider,{value:router},h(PathnameContext.Provider,{value:path},h(Admin))));}
test('admin has direct section links, function search and collapsible secondary tools',()=>{
 const html=render('/admin');
 assert.match(html,/href="\/admin\/zamowienia"/);
 assert.match(html,/Znajdź funkcję w panelu/);
 assert.match(html,/<details class="admin-nav-section"/);
 assert.match(html,/Do obsłużenia/);
 assert.doesNotMatch(html,/Zastal Store \/ panel operacyjny/);
});
test('order route opens the order workspace with clear work queues',()=>{
 const html=render('/admin/zamowienia');
 assert.match(html,/aria-label="Widok zamówień"/);
 assert.match(html,/Do realizacji/);
 assert.match(html,/Zakończone/);
 assert.match(html,/aria-current="page"[^>]*href="\/admin\/zamowienia"|href="\/admin\/zamowienia"[^>]*aria-current="page"/);
});
