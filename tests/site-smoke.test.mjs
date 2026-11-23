import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pages = new Map([
  ['index.html', 'accueil'], ['actualites.html', 'actualites'], ['analyses.html', 'analyses'],
  ['favoris.html', 'favoris'], ['sources.html', 'sources'], ['connexion.html', 'connexion'],
  ['inscription.html', 'inscription']
]);

test('all seven pages declare French, a responsive viewport and the expected app entry', async () => {
  for (const [file, page] of pages) {
    const html = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /<html\s+lang="fr"/i, file);
    assert.match(html, /name="viewport"/i, file);
    assert.match(html, new RegExp(`data-page="${page}"`), file);
    assert.match(html, /src="\/js\/app\.js"/, file);
  }
});

test('frontend source does not refer to server-only credentials', async () => {
  const files = [...pages.keys()].map(file => new URL(`../${file}`, import.meta.url));
  files.push(...['app.js', 'supabase.js', 'auth.js', 'favoris.js', 'actualites.js', 'analyses.js']
    .map(file => new URL(`../js/${file}`, import.meta.url)));
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|NEWSDATA_API_KEY|COLLECT_NEWS_CRON_SECRET/);
  }
});

test('responsive stylesheet includes tablet, mobile and reduced-motion rules', async () => {
  const css = await readFile(new URL('../css/responsive.css', import.meta.url), 'utf8');
  assert.match(css, /max-width:\s*1100px/);
  assert.match(css, /max-width:\s*760px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
