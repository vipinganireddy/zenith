// Self-check for the Citation Generator's formatting.
//   node --test src/utils/citation.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

const { parseAuthors, initials, formatCitation, citationHtml, citationPlain } = await import('./citation.ts');
type C = Parameters<typeof formatCitation>[0];
const base: C = { id: 'x', style: 'apa', type: 'book', authors: '', year: '2020', title: '' };
const f = (c: Partial<C>) => formatCitation({ ...base, ...c });

test('author input forms', () => {
  const want = [{ family: 'Smith', given: 'John A.' }, { family: 'Doe', given: 'Jane' }];
  assert.deepEqual(parseAuthors('Smith, John A.; Doe, Jane'), want);
  assert.deepEqual(parseAuthors('John A. Smith and Jane Doe'), want);
  assert.deepEqual(parseAuthors('John A. Smith, Jane Doe'), want);
  assert.deepEqual(parseAuthors('Smith, John A., Doe, Jane'), want);
  assert.deepEqual(parseAuthors('Ludwig van Beethoven'), [{ family: 'van Beethoven', given: 'Ludwig' }]);
  assert.deepEqual(parseAuthors('World Health Organization'.replace(/ /g, ' ')).length, 1);
  assert.equal(initials('Jean-Paul'), 'J.-P.');
  assert.equal(initials('J.A.'), 'J. A.');
});

test('APA 7 journal article with DOI', () => {
  assert.equal(f({ type: 'journal', authors: 'Smith, John A.; Doe, Jane', year: '2019', title: 'Sleep and memory', journal: 'Nature Neuroscience', volume: '22', issue: '3', pages: '100-115', doi: 'https://doi.org/10.1000/xyz' }),
    'Smith, J. A., & Doe, J. (2019). Sleep and memory. *Nature Neuroscience*, *22*(3), 100–115. https://doi.org/10.1000/xyz');
});

test('APA 7 book: no city, edition in parentheses, no double full stop after initials', () => {
  assert.equal(f({ authors: 'Jane Austen; John Q. Public; Mary Major', title: 'Pride and prejudice', edition: '2nd', publisher: 'Penguin', city: 'London' }),
    'Austen, J., Public, J. Q., & Major, M. (2020). *Pride and prejudice* (2nd ed.). Penguin.');
});

test('APA newspaper date and no-author website', () => {
  assert.equal(f({ type: 'newspaper', authors: 'Lee, Ann', title: 'Rates rise', newspaper: 'The Times', accessDate: 'May 23, 2024' }),
    'Lee, A. (2024, May 23). Rates rise. *The Times*.');
  assert.equal(f({ type: 'website', title: 'Flu season', website: 'CDC', url: 'https://cdc.gov/flu' }),
    '*Flu season*. (2020). CDC. https://cdc.gov/flu');
});

test('MLA 9', () => {
  assert.equal(f({ style: 'mla', authors: 'John Smith and Jane Doe', title: 'The Book', publisher: 'Penguin' }),
    'Smith, John, and Jane Doe. *The Book*. Penguin, 2020.');
  assert.equal(f({ style: 'mla', type: 'journal', authors: 'A B; C D; E F', title: 'On Things', journal: 'Mind', volume: '5', issue: '2', pages: '1-9' }),
    'B, A, et al. "On Things." *Mind*, vol. 5, no. 2, 2020, pp. 1–9.');
});

test('Chicago 17 bibliography', () => {
  assert.equal(f({ style: 'chicago', authors: 'Smith, John', title: 'The Book', city: 'Chicago', publisher: 'UCP' }),
    'Smith, John. *The Book*. Chicago: UCP, 2020.');
  assert.equal(f({ style: 'chicago', type: 'journal', authors: 'Smith, John; Doe, Jane; Roe, Rick', title: 'A Study', journal: 'JAMA', volume: '7', issue: '1', pages: '3-4' }),
    'Smith, John, Jane Doe, and Rick Roe. "A Study." *JAMA* 7, no. 1 (2020): 3–4.');
});

test('italics render as HTML and are stripped for plain text', () => {
  assert.equal(citationHtml('A <b> *Title* x'), 'A &lt;b&gt; <i>Title</i> x');
  assert.equal(citationPlain('A. *Title*. B'), 'A. Title. B');
});
