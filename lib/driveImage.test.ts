// Run with: node --experimental-strip-types --test lib/driveImage.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveImageUrl, extractDriveFileId } from './driveImage.ts';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz12345';
const THUMB = `https://lh3.googleusercontent.com/d/${ID}=w400`;

test('drive /file/d/<id>/view share link', () => {
  assert.equal(
    resolveImageUrl(`https://drive.google.com/file/d/${ID}/view?usp=sharing`),
    THUMB,
  );
});

test('drive open?id= link', () => {
  assert.equal(resolveImageUrl(`https://drive.google.com/open?id=${ID}`), THUMB);
});

test('drive uc?export=view&id= link', () => {
  assert.equal(
    resolveImageUrl(`https://drive.google.com/uc?export=view&id=${ID}`),
    THUMB,
  );
});

test('bare drive file id', () => {
  assert.equal(resolveImageUrl(ID), THUMB);
  assert.equal(extractDriveFileId(ID), ID);
});

test('=IMAGE("...") sheet formula', () => {
  assert.equal(
    resolveImageUrl(`=IMAGE("https://drive.google.com/file/d/${ID}/view")`),
    THUMB,
  );
});

test('non-drive http(s) URLs pass through', () => {
  assert.equal(resolveImageUrl('https://example.com/img.jpg'), 'https://example.com/img.jpg');
  assert.equal(
    resolveImageUrl('https://lh3.googleusercontent.com/d/abc=w400'),
    'https://lh3.googleusercontent.com/d/abc=w400',
  );
});

test('invalid / empty input returns undefined', () => {
  assert.equal(resolveImageUrl(undefined), undefined);
  assert.equal(resolveImageUrl(null), undefined);
  assert.equal(resolveImageUrl(''), undefined);
  assert.equal(resolveImageUrl('   '), undefined);
  assert.equal(resolveImageUrl('random text'), undefined);
});
