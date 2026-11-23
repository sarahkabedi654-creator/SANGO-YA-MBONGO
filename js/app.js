import { supabase,configured } from './supabase.js';
import { renderArticleCard,filteredArticles,bindFavoriteButtons,escapeHtml } from './actualites.js';
import { mountAnalysis,updateAnalysis,updateWorldBankIndicators,drawTrend } from './analyses.js';
import { mountAuth,bindAuth } from './auth.js';
import { mountFavorites } from './favoris.js';
const page=document.body.dataset.page||'accueil';const app=document.querySelector('#app');
const links=[['Accueil','index.html','accueil'],['ActualitÃ©s','actualites.html','actualites'],['Analyses','analyses.html','analyses'],['Favoris','favoris.html','favoris'],['Sources','sources.html','sources']];
const icon={accueil:'&#8962;',actualites:'&#9638;',analyses:'&#9671;',favoris:'&#9825;',sources:'&#9673;'};
function layout(content){app.innerHTML=`<aside class="sidebar"><a class="brand" href="index.html"><span class="brand-mark">S</span><span>SANGO<span class="brand-light"> YA MBONGO</span><small>VEILLE NUMÃ‰RIQUE Â· RDC</small></span></a><div class="side-label">ESPACE DE VEILLE</div><nav>${links.map(([label,url,id])=>`<a class="nav-link ${page===id?'active':''}" href="${url}"><span class="nav-icon">${icon[id]}</span>${label}${id==='favoris'?'<span id="fav-count" class="nav-count"></span>':''}</a>`).join('')}</nav><div class="sidebar-bottom"><div class="connection"><span class="connection-dot ${configured?'':'offline'}"></span><span>${configured?'Base de donnÃ©es prÃªte':'Mode aperÃ§u'}</span></div><a class="account-link" href="connexion.html"><span class="avatar">SY</span><span id="account-label">Mon espace<small>Connexion / inscription</small></span><span class="account-arrow">&#8594;</span></a></div></aside><main class="main"><header class="topbar"><button class="mobile-menu" aria-label="Ouvrir le menu">&#9776;</button><div class="breadcrumb">RDC <span>/</span> <b>${page==='accueil'?'Vue dâ€™ensemble':page.charAt(0).toUpperCase()+page.slice(1)}</b></div><div class="top-right"><span class="live-status"><i></i> VEILLE ACTIVE</span><button class="icon-button" id="refresh" title="Actualiser">&#8635;</button><a class="top-avatar" href="connexion.html">SY</a></div></header><div class="content">${content}<footer>Â© ${new Date().getFullYear()} Sango ya Mbongo <span>Une veille indÃ©pendante sur les paiements numÃ©riques en RDC.</span></footer></div></main>`;document.querySelector('.mobile-menu').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');document.querySelector('#refresh').onclick=()=>loadArticles(true);}
const home=()=>`<section class="welcome"><div><div class="eyebrow"><span class="eyebrow-dot"></span> OBSERVATOIRE DES PAIEMENTS NUMÃ‰RIQUES</div><h1>La veille qui fait<br><em>avancer lâ€™Ã©cosystÃ¨me.</em></h1><p>Les signaux clÃ©s du mobile money, des fintechs et des paiements numÃ©riques en RÃ©publique dÃ©mocratique du Congo.</p><a class="button button-dark" href="actualites.html">Explorer les actualitÃ©s <span>?</span></a></div><div class="hero-art"><div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div><div class="hero-core">$<span>FC</span></div><div class="float-tag tag-top">MOBILE MONEY <b>&#8599;</b></div><div class="float-tag tag-bottom"><span>?</span> RDC Â· paiements numÃ©riques</div><div class="hero-spark">&#10022;</div></div><div class="hero-note">01 <span>Le paysage Ã©volue.<br>Restez en avance.</span></div></section><section class="section-head"><div><div class="eyebrow">EN UN COUP Dâ€™Å’IL</div><h2>Le tableau de bord</h2></div><span class="updated" id="last-updated">DonnÃ©es rÃ©elles Â· chargementâ€¦</span></section><section class="metrics"><article class="metric-card metric-main"><div class="metric-label">ARTICLES COLLECTÃ‰S <span>?</span></div><strong id="metric-articles">â€”</strong><div class="metric-foot"><span class="metric-indicator"></span> Articles issus des sources connectÃ©es</div></article><article class="metric-card"><div class="metric-label">SOURCES ACTIVES</div><strong id="metric-sources">â€”</strong><div class="metric-foot" id="source-sub">GDELT Â· NewsData.io Â· TechCabal</div></article><article class="metric-card"><div class="metric-label">THÃˆME LE PLUS COUVERT</div><strong class="metric-word" id="metric-topic">â€”</strong><div class="metric-foot">Sur les articles collectÃ©s</div></article></section><section class="dashboard-grid"><div class="panel trend-panel"><div class="panel-heading"><div><div class="eyebrow">VOLUME Ã‰DITORIAL</div><h3>ActivitÃ© des actualitÃ©s</h3></div><span class="period-pill">30 derniers jours</span></div><div class="chart-wrap"><canvas id="trend-chart" aria-label="Volume dâ€™articles par date"></canvas><div class="chart-empty" id="chart-empty">Les tendances sâ€™afficheront dÃ¨s que des articles seront collectÃ©s.</div></div></div><aside class="panel topics-panel"><div class="panel-heading"><div><div class="eyebrow">CE QUI FAIT Lâ€™ACTUALITÃ‰</div><h3>Par thÃ©matique</h3></div><span class="topic-glyph">&#10022;</span></div><div id="topic-list" class="topic-list"><div class="empty-small">En attente de donnÃ©es vÃ©rifiÃ©es.</div></div><a class="text-link" href="analyses.html">Voir les analyses <span>&#8594;</span></a></aside></section><section class="section-head latest-head"><div><div class="eyebrow">Ã€ SUIVRE</div><h2>Derniers signaux</h2></div><a class="text-link" href="actualites.html">Toutes les actualitÃ©s <span>?</span></a></section><div id="latest-articles" class="article-grid"><div class="loading-state">RÃ©cupÃ©ration des actualitÃ©s depuis les sourcesâ€¦</div></div>`;
function pageTemplate(){if(page==='accueil')return home();if(page==='actualites')return `<section class="page-title"><div class="eyebrow">FLUX DE VEILLE</div><h1>ActualitÃ©s</h1><p>Les derniÃ¨res publications sur les paiements numÃ©riques en RDC et en Afrique.</p></section><section class="filter-bar"><label class="searchbox"><span>&#9906;</span><input id="search" placeholder="Rechercher un sujet, un mot-clÃ©â€¦"></label><select id="source-filter"><option value="">Toutes les sources</option><option>GDELT</option><option>NewsData.io</option><option>TechCabal</option></select><select id="topic-filter"><option value="">Toutes les thÃ©matiques</option><option>Mobile money</option><option>Fintech</option><option>Paiements</option><option>RÃ©glementation</option><option>Innovation</option><option>Fraude et sÃ©curitÃ©</option><option>Inclusion financiÃ¨re</option><option>InteropÃ©rabilitÃ©</option></select><span id="article-count" class="result-count">â€”</span></section><div class="source-alert" id="source-alert" hidden></div><div id="all-articles" class="article-grid"></div>`;if(page==='analyses')return `<section class="page-title"><div class="eyebrow">LECTURE DES SIGNAUX</div><h1>Analyses</h1><p>Une lecture factuelle du flux collectÃ©. Les graphiques reposent sur les articles disponibles, sans projection inventÃ©e.</p></section>${mountAnalysis()}`;if(page==='favoris')return `<section class="page-title"><div class="eyebrow">VOTRE SÃ‰LECTION</div><h1>Articles sauvegardÃ©s</h1><p>Retrouvez les signaux que vous souhaitez suivre de prÃ¨s.</p></section><div id="favorites-list" class="article-grid"></div>`;if(page==='sources')return `<section class="page-title"><div class="eyebrow">TRANSPARENCE Ã‰DITORIALE</div><h1>Sources & collecte</h1><p>Trois sources sont interrogÃ©es Ã  la demande. Une source indisponible ne bloque pas les autres.</p></section><div class="source-grid" id="source-grid"></div><div class="panel source-method"><div class="eyebrow">MÃ‰THODE</div><h3>Des signaux, pas des statistiques fabriquÃ©es.</h3><p>Les publications sont dÃ©dupliquÃ©es par URL, horodatÃ©es Ã  partir de la source et catÃ©gorisÃ©es par mots-clÃ©s. Les chiffres affichÃ©s correspondent uniquement aux articles rÃ©ellement collectÃ©s. La couverture gÃ©ographique varie selon chaque fournisseur. Une session utilisateur est requise pour lancer une collecte manuelle.</p><button class="button button-dark" id="source-refresh">Lancer une collecte <span>&#8594;</span></button></div>`;return mountAuth(page);}
layout(pageTemplate());
if(page==='connexion'||page==='inscription')bindAuth();
const state={articles:[],sources:{},user:null,lastCollectedAt:null,analytics:null,totalArticles:null,loadingMore:false,indicators:[],indicatorError:null};
export function updateSourceStatus(){
  const grid=document.querySelector('#source-grid');
  if(!grid)return;
  grid.innerHTML=['GDELT','NewsData.io','TechCabal'].map(name=>{
    const s=state.sources[name],checked=s?.last_checked_at?formatCollectionTime(s.last_checked_at):'Aucune collecte enregistree';
    const pending=!s||s.status==='unknown';
    const stateClass=s?.available?'ok':pending?'pending':'down';
    const stateText=s?.available?`Disponible - ${s.count??0} article(s)`:pending?'En attente de la premiere collecte':`Indisponible - ${s?.error||'erreur de collecte'}`;
    return `<article class="source-card"><div class="source-brand">${name==='GDELT'?'GD':name==='NewsData.io'?'ND':'TC'}</div><div><h3>${name}</h3><p>${name==='GDELT'?'Agregateur mondial de publications indexees.':name==='NewsData.io'?'API d actualites internationales; necessite une cle cote serveur.':'Flux RSS du media technologique panafricain.'}</p><span class="source-state ${stateClass}">${escapeHtml(stateText)}</span><small class="source-checked">${escapeHtml(checked)}</small></div><span class="source-arrow">&#8599;</span></article>`;
  }).join('');
}
function formatCollectionTime(value){
  if(!value)return 'Aucune collecte enregistree';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'Date de collecte indisponible';
  return `Derni\u00e8re collecte : ${new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lubumbashi'}).format(date)}`;
}
async function loadAnalytics(){if(!supabase)return;try{const{data,error}=await supabase.rpc('get_dashboard_analytics',{p_days:30});if(!error&&data)state.analytics=data}catch{state.analytics=null}}
async function loadPersistedSourceStatus(){
  if(!supabase)return;
  try{
    const{data,error}=await supabase.from('sources').select('code,status,last_checked_at,last_success_at,last_error,last_article_count');
    if(error||!data)return;
    state.sources=Object.fromEntries(data.map(row=>[row.code,{status:row.status,available:row.status==='available',count:row.last_article_count,error:row.last_error,last_checked_at:row.last_checked_at,last_success_at:row.last_success_at}]));
    state.lastCollectedAt=data.map(row=>row.last_checked_at).filter(Boolean).sort().at(-1)||null;
  }catch{}
}async function init(){if(supabase){const{data}=await supabase.auth.getSession();state.user=data.session?.user||null;supabase.auth.onAuthStateChange((_event,session)=>{state.user=session?.user||null;setAccount();if(page==='favoris')mountFavorites(state);if(page==='analyses')bindWorldBankCollection()});}setAccount();await loadArticles();if(page==='actualites')bindFilters();if(page==='favoris')await mountFavorites(state);if(page==='accueil')renderDashboard();if(page==='analyses'){updateAnalysis(state);await loadWorldBankIndicators();bindWorldBankCollection()}if(page==='sources'){updateSourceStatus();const refreshButton=document.querySelector('#source-refresh');refreshButton.disabled=!state.user;refreshButton.title=state.user?'':'Connectez-vous pour lancer une collecte';refreshButton.onclick=()=>loadArticles(true)} }
function setAccount(){const label=document.querySelector('#account-label');if(label&&state.user)label.innerHTML=`${escapeHtml(state.user.email)}<small><button id="signout">Se dÃ©connecter</button></small>`;document.querySelector('#signout')?.addEventListener('click',async()=>{await supabase?.auth.signOut();location.reload()})}
async function loadArticles(refresh=false){
  const fallback=async()=>{
    if(!supabase)return [];
    const{data,error,count}=await supabase.from('articles').select('*',{count:'exact'}).order('published_at',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).range(0,199);
    if(error)throw error;
    state.totalArticles=count??data?.length??0;
    return data||[];
  };
  const collect=async()=>{
    if(!supabase)return null;
    const{data}=await supabase.auth.getSession();
    const accessToken=data.session?.access_token;
    if(!accessToken)return null;
    const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collect-news`,{method:'POST',headers:{
      'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization:`Bearer ${accessToken}`
    }});
    if(!response.ok)throw Error(`Collecte impossible (HTTP ${response.status})`);
    return response.json();
  };
  let collectedThisCall=false;
  try{
    if(refresh||!supabase){
      const result=await collect();
      if(result&&!result.skipped){collectedThisCall=true;state.articles=result.articles||[];state.sources=result.sources||{};state.lastCollectedAt=result.fetched_at||null;}
      else state.articles=await fallback();
    }else{
      state.articles=await fallback();
      if(!state.articles.length){
        const result=await collect();
        if(result&&!result.skipped){collectedThisCall=true;state.articles=result.articles||[];state.sources=result.sources||{};state.lastCollectedAt=result.fetched_at||null;}
      }
    }
  }catch(error){
    try{state.articles=await fallback();}catch{}
    state.sources={GDELT:{available:false,error:error.message},'NewsData.io':{available:false,error:error.message},TechCabal:{available:false,error:error.message}};
  }
  if(supabase&&!collectedThisCall)await loadPersistedSourceStatus();
  if(supabase&&collectedThisCall){try{state.articles=await fallback()}catch{}}
  if(supabase)await loadAnalytics();
  updateCounts();
  if(page==='accueil')renderDashboard();
  if(page==='actualites')renderNews();
  if(page==='favoris')mountFavorites(state);
  if(page==='analyses')updateAnalysis(state);
  if(page==='sources')updateSourceStatus();
  return state.articles;
}function updateCounts(){const count=document.querySelector('#fav-count');if(count)count.textContent=getFavoriteIds().length||'';}
function getFavoriteIds(){try{return JSON.parse(localStorage.getItem('sango-favorites')||'[]')}catch{return []}}
function renderDashboard(){const el=document.querySelector('#metric-articles');if(!el)return;const analytics=state.analytics;el.textContent=analytics?Number(analytics.total_articles||0).toLocaleString('fr-FR'):state.articles.length.toLocaleString('fr-FR');el.title=analytics?'Total complet agr\u00e9g\u00e9 en base de donn\u00e9es':'Nombre d\u0027articles charg\u00e9s (\u00e9chantillon disponible)';const active=Object.values(state.sources).filter(s=>s.available).length;document.querySelector('#metric-sources').textContent=`${active} / 3`;const entries=analytics?.topics||[];document.querySelector('#metric-topic').textContent=entries[0]?.name||'\u2014';document.querySelector('#last-updated').textContent=formatCollectionTime(state.lastCollectedAt||Object.values(state.sources).map(x=>x.last_checked_at).filter(Boolean).sort().at(-1));const topics=document.querySelector('#topic-list');topics.innerHTML=entries.length?entries.slice(0,5).map(item=>`<div class="topic-row"><span>${escapeHtml(item.name)}</span><div class="topic-track"><i style="width:${Math.round(item.count/entries[0].count*100)}%"></i></div><b>${item.count}</b></div>`).join(''):'<div class="empty-small">Aucun article disponible pour le moment.</div>';document.querySelector('#latest-articles').innerHTML=state.articles.length?state.articles.slice(0,3).map(renderArticleCard).join(''):'<div class="empty-state"><span>&#8709;</span><h3>Aucun article \u00e0 afficher</h3><p>Les publications collect\u00e9es apparaitront ici.</p><a class="text-link" href="sources.html">Voir les sources</a></div>';const byDate={};for(const item of (analytics?.daily||[])){const date=new Date(item.date+'T00:00:00');byDate[date.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})]=item.count}if(Object.keys(byDate).length){drawTrend('trend-chart',byDate);document.querySelector('#chart-empty').hidden=true}else{const empty=document.querySelector('#chart-empty');empty.hidden=false;empty.textContent=analytics?'Aucune observation quotidienne disponible.':'Graphique indisponible : v?rifiez l\u0027installation de la migration get_dashboard_analytics.'}}
function bindFilters(){for(const id of ['search','source-filter','topic-filter'])document.querySelector(`#${id}`).addEventListener(id==='search'?'input':'change',renderNews)}
async function loadMoreArticles(){if(!supabase||state.loadingMore)return;state.loadingMore=true;renderNews();try{const start=state.articles.length;const{data,error}=await supabase.from('articles').select('*').order('published_at',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).range(start,start+199);if(error)throw error;state.articles.push(...(data||[]));}catch{state.loadMoreError=true}finally{state.loadingMore=false;renderNews()}}
function renderNews(){const list=filteredArticles(state.articles,document.querySelector('#search')?.value,document.querySelector('#source-filter')?.value,document.querySelector('#topic-filter')?.value);document.querySelector('#article-count').textContent=`${list.length} resultat${list.length>1?'s':''} parmi les ${state.articles.length} articles charg\u00e9s`;document.querySelector('#all-articles').innerHTML=list.length?list.map(renderArticleCard).join(''):'<div class="empty-state"><span>?</span><h3>Aucun article trouv\u00e9</h3><p>Modifiez les filtres ou v\u00e9rifiez la disponibilit\u00e9 des sources.</p></div>';const alert=document.querySelector('#source-alert');const failures=Object.entries(state.sources).filter(([,s])=>!s.available);if(failures.length){alert.hidden=false;alert.innerHTML=`<b>Collecte partielle :</b> ${failures.map(([source,detail])=>`${escapeHtml(source)} - ${escapeHtml(detail.error||'Source indisponible')}`).join(' | ')}`}else alert.hidden=true;const more=document.querySelector('#load-more-articles');if(more)more.remove();if(state.articles.length<(state.totalArticles??state.articles.length)){const button=document.createElement('button');button.id='load-more-articles';button.className='button button-dark';button.type='button';button.textContent=state.loadingMore?'Chargement...':'Charger plus d\u0027articles';button.disabled=state.loadingMore;button.addEventListener('click',loadMoreArticles);document.querySelector('#all-articles').after(button)}bindFavoriteButtons({user:state.user,onChange:updateCounts})}
async function loadWorldBankIndicators(){
  const panel=document.querySelector('#indicator-grid');
  if(!panel)return;
  if(!supabase){state.indicators=[];state.indicatorError=null;updateWorldBankIndicators([]);return}
  panel.innerHTML='<div class="loading-state">Chargement des observations World Bankâ€¦</div>';
  const{data,error}=await supabase.from('indicator_data')
    .select('indicator_code,indicator_name,country_code,period,value,unit,source_url,fetched_at')
    .eq('country_code','COD').order('period',{ascending:false}).limit(100);
  state.indicators=data||[];state.indicatorError=error||null;
  updateWorldBankIndicators(state.indicators,state.indicatorError);
}
function bindWorldBankCollection(){
  const button=document.querySelector('#collect-indicators');
  if(!button)return;
  button.disabled=!state.user;
  button.title=state.user?'':'Connectez-vous pour actualiser les indicateurs';
  button.onclick=async()=>{
    const feedback=document.querySelector('#indicator-feedback');
    if(!supabase||!state.user){if(feedback)feedback.textContent='Connectez-vous pour lancer une collecte manuelle.';return}
    button.disabled=true;button.textContent='Collecte en coursâ€¦';
    if(feedback)feedback.textContent='Interrogation des sÃ©ries officielles World Bankâ€¦';
    try{
      const{data}=await supabase.auth.getSession();const token=data.session?.access_token;
      if(!token)throw new Error('Session expirÃ©e');
      const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collect-world-bank`,{method:'POST',headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});
      const result=await response.json().catch(()=>({}));
      if(response.status===202){if(feedback)feedback.textContent='Une collecte World Bank est dÃ©jÃ  en cours.';return}
      if(!response.ok)throw new Error(`Collecte indisponible (HTTP ${response.status})`);
      await loadWorldBankIndicators();
      if(feedback)feedback.textContent=`Collecte terminÃ©e : ${Number(result.observations_upserted||0).toLocaleString('fr-FR')} observation(s) enregistrÃ©e(s), ${Number(result.indicators_succeeded||0)} sÃ©rie(s) disponible(s).${result.status==='partial'?' Certaines sÃ©ries sont indisponibles.':''}`;
    }catch(error){if(feedback)feedback.textContent=error.message||'La collecte World Bank a Ã©chouÃ©.'}
    finally{button.disabled=!state.user;button.textContent='Actualiser les indicateurs'}
  };
}
export {state,getFavoriteIds,updateCounts,init};
init();


