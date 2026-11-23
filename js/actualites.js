import { supabase } from './supabase.js';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

export function getGuestFavoriteIds() {
  try {
    const value = JSON.parse(localStorage.getItem('sango-favorites') || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function safeUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : '#'; }
  catch { return '#'; }
}

export function renderArticleCard(article, favoriteIds = getGuestFavoriteIds()) {
  const id = article.id || article.url || '';
  const url = article.url || '';
  const saved = favoriteIds.includes(id) || favoriteIds.includes(url);
  const date = article.published_at && !Number.isNaN(Date.parse(article.published_at))
    ? new Date(article.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Date inconnue';
  const description = article.description || 'Aucun résumé fourni par la source.';
  return `<article class="article-card"><div class="article-topline"><span class="article-topic">${escapeHtml(article.topic || 'Non classé')}</span><button class="save-button ${saved ? 'saved' : ''}" data-save="${escapeHtml(id)}" data-url="${escapeHtml(url)}" aria-label="${saved ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${saved ? '&#9829;' : '&#9825;'}</button></div><h3><a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.title)}</a></h3><p>${escapeHtml(description.slice(0, 190))}${description.length > 190 ? '…' : ''}</p><div class="article-meta"><span>${escapeHtml(article.source || 'Source inconnue')}</span><i>·</i><time datetime="${escapeHtml(article.published_at || '')}">${date}</time></div><a class="article-open" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">Lire la publication <span>↗</span></a></article>`;
}

export function filteredArticles(articles, query = '', source = '', topic = '') {
  const q = query.trim().toLocaleLowerCase('fr');
  return articles.filter(article => (!q || `${article.title} ${article.description || ''} ${article.topic || ''}`.toLocaleLowerCase('fr').includes(q)) && (!source || article.source === source) && (!topic || article.topic === topic));
}

export function bindFavoriteButtons({ user = null, onChange = () => {} } = {}) {
  document.querySelectorAll('[data-save]').forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.save;
      const url = button.dataset.url;
      const previous = getGuestFavoriteIds();
      const saved = previous.includes(id) || previous.includes(url);
      const next = saved ? previous.filter(item => item !== id && item !== url) : [...new Set([...previous, id || url].filter(Boolean))];
      button.disabled = true;
      try {
        if (user && id) {
          const request = saved
            ? supabase.from('favorites').delete().eq('user_id', user.id).eq('article_id', id)
            : supabase.from('favorites').upsert({ user_id: user.id, article_id: id }, { onConflict: 'user_id,article_id' });
          const { error } = await request;
          if (error) throw error;
        }
        localStorage.setItem('sango-favorites', JSON.stringify(next));
        onChange(next.length);
        button.classList.toggle('saved', !saved);
        button.innerHTML = saved ? '&#9825;' : '&#9829;';
        button.setAttribute('aria-label', saved ? 'Ajouter aux favoris' : 'Retirer des favoris');
      } catch {
        button.title = 'Impossible de synchroniser ce favori. Réessayez.';
      } finally { button.disabled = false; }
    };
  });
}
