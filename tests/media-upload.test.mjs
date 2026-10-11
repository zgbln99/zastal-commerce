import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require = createRequire(new URL('../storefront/package.json', import.meta.url));
const ts = require('typescript');
const {outputText} = ts.transpileModule(readFileSync(new URL('../storefront/lib/media-upload.ts', import.meta.url), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
});

// Browser codecs are supplied at the DOM boundary; the actual preparation and
// upload functions run unchanged. A real browser codec check accompanies these.
function browser({width = 4000, height = 3000, webp = true, bytesPerPixel = 1.4, missingBlob = false} = {}) {
  const state = {closed: false, draws: [], encoded: [], sent: []};
  const picture = {width, height, close() { state.closed = true; }};
  const canvas = {
    width: 0, height: 0,
    getContext() { return {drawImage(_picture, _x, _y, w, h) { state.draws.push([w, h]); }}; },
    toBlob(callback, type, quality) {
      const actualType = type === 'image/webp' && !webp ? 'image/png' : type;
      const size = Math.ceil(this.width * this.height * (actualType === 'image/png' ? 3.2 : bytesPerPixel * quality));
      const blob = {size, type: actualType, quality, width: this.width, height: this.height};
      state.encoded.push(blob);
      callback(missingBlob ? null : blob);
    },
  };
  class FileReader {
    readAsDataURL(blob) { state.result = blob; this.result = `data:${blob.type};base64,encoded`; this.onload(); }
  }
  const exports = {};
  vm.runInNewContext(outputText, {exports, createImageBitmap: async () => picture, document: {createElement: () => canvas}, FileReader});
  return {state, ...exports};
}
const file = (type = 'image/jpeg', size = 15_000_000) => ({name: 'L03 Shots_ Phantom Purple-2.jpg', type, size});

test('a detailed large photo is reduced automatically until it fits the upload budget', async () => {
  const {prepareMedia, state} = browser();
  const image = await prepareMedia(file());
  assert.match(image, /^data:image\/webp;base64,/);
  assert.ok(state.result.size <= 1_200_000);
  assert.ok(state.draws.length > 1);
  for (const [width, height] of state.draws) {
    assert.ok(width <= 2200 && height <= 1700);
    assert.ok(width >= 300 && height >= 200);
    assert.ok(Math.abs(width / height - 4 / 3) < 0.005);
  }
  assert.equal(state.closed, true);
});
test('an already suitable photo keeps its original dimensions', async () => {
  const {prepareMedia, state} = browser({width: 900, height: 600, bytesPerPixel: 0.4});
  await prepareMedia(file());
  assert.deepEqual(state.draws, [[900, 600]]);
  assert.ok(state.result.size <= 1_200_000);
  assert.equal(state.closed, true);
});
test('JPEG input uses a supported JPEG encoder when WebP silently falls back to PNG', async () => {
  const {prepareMedia, state} = browser({webp: false});
  const image = await prepareMedia(file());
  assert.match(image, /^data:image\/jpeg;base64,/);
  assert.ok(state.result.size <= 1_200_000);
  assert.equal(state.closed, true);
});
test('PNG input retains its transparent-capable encoding without WebP support', async () => {
  const {prepareMedia, state} = browser({width: 3000, height: 2000, webp: false});
  const image = await prepareMedia(file('image/png'));
  assert.match(image, /^data:image\/png;base64,/);
  assert.ok(state.result.size <= 1_200_000);
  assert.ok(state.draws.length > 1);
  assert.equal(state.encoded.some(blob => blob.type === 'image/jpeg'), false);
  assert.equal(state.closed, true);
});
test('portrait resizing preserves the complete photograph and server minimum dimensions', async () => {
  const {prepareMedia, state} = browser({width: 4000, height: 6000, bytesPerPixel: 3});
  await prepareMedia(file());
  assert.ok(state.result.size <= 1_200_000);
  assert.ok(state.result.width >= 300 && state.result.height >= 200);
  assert.ok(Math.abs(state.result.width / state.result.height - 2 / 3) < 0.005);
  assert.equal(state.closed, true);
});
test('the original input size and format guards remain enforced', async () => {
  for (const input of [file('image/jpeg', 25_000_001), file('image/svg+xml')]) {
    const {prepareMedia, state} = browser();
    await assert.rejects(prepareMedia(input));
    assert.deepEqual(state.draws, []);
  }
});
test('decoder resources are released when an image is too small or encoding fails', async () => {
  for (const options of [{width: 200, height: 100}, {missingBlob: true}]) {
    const {prepareMedia, state} = browser(options);
    await assert.rejects(prepareMedia(file()));
    assert.equal(state.closed, true);
    assert.ok(state.encoded.length < 50);
  }
});
test('upload sends only the optimized image through the existing authenticated request', async () => {
  const {uploadMedia, state} = browser();
  const url = await uploadMedia(file(), async (path, options) => {
    state.sent.push({path, options});
    assert.ok(state.result.size <= 1_200_000);
    return {url: '/api/store/media/0123456789abcdef0123456789abcdef.webp'};
  });
  assert.equal(url, '/api/store/media/0123456789abcdef0123456789abcdef.webp');
  assert.equal(state.sent.length, 1);
  assert.equal(state.sent[0].path, '/api/admin/home/media');
  assert.equal(state.sent[0].options.method, 'POST');
  assert.equal(JSON.parse(state.sent[0].options.body).name, file().name);
});
