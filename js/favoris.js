import { supabase } from './supabase.js';
import { renderArticleCard, getGuestFavoriteIds, bindFavoriteButtons } from './actualites.js';

export async function mountFavorites(state) {
  const el = document.querySelector('#favorites-list');
  if (!el) return;
  let articles = [];
  if (state.user && supabase) {
    el.innerHTML = '<div class="loading-state">Chargement de vos favoris…</div>';
    const { data, error } = await supabase.from('favorites')
      .select('article_id, articles(*)').eq('user_id', state.user.id).order('created_at', { ascending: false });
    if (error) {
      el.innerHTML = '<div class="source-alert">Les favoris de votre compte sont momentanément indisponibles.</div>';
      return;
    }
    articles = (data || []).map(row => row.articles).filter(Boolean);
  } else {
    const ids = getGuestFavoriteIds();
    articles = state.articles.filter(article => ids.includes(article.id) || ids.includes(article.url));
  }
  el.innerHTML = articles.length
    ? articles.map(article => renderArticleCard(article, articles.map(item => item.id))).join('')
    : '<div class="empty-state"><span>♡</span><h3>Votre sélection est vide</h3><p>Enregistrez un article avec le cœur pour le retrouver ici.</p><a class="text-link" href="actualites.html">Parcourir les actualités →</a></div>';
  bindFavoriteButtons({ user: state.user, onChange: () => mountFavorites(state) });
}
