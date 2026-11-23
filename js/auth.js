import {supabase,configured} from './supabase.js';
export function mountAuth(page){const signup=page==='inscription';return `<section class="auth-layout"><div class="auth-decoration"><a class="brand" href="index.html"><span class="brand-mark">S</span><span>SANGO<span class="brand-light"> YA MBONGO</span><small>VEILLE NUMÉRIQUE · RDC</small></span></a><div class="auth-quote"><span>“</span><h2>Comprendre les signaux.<br><em>Anticiper les changements.</em></h2><p>La veille indépendante dédiée à l’avenir des paiements numériques en RDC.</p></div><div class="auth-foot">KINSHASA · RDC <span>Veille nationale</span></div></div><div class="auth-form-wrap"><a class="auth-back" href="index.html">&#8592; Retour à l’accueil</a><div class="auth-form"><div class="eyebrow">${signup?'REJOINDRE L’OBSERVATOIRE':'VOTRE ESPACE PERSONNEL'}</div><h1>${signup?'Créer un compte':'Bon retour'}</h1><p>${signup?'Enregistrez et retrouvez vos signaux de veille.':'Connectez-vous pour accéder à vos favoris.'}</p>${!configured?'<div class="form-notice">Configurez Supabase dans le fichier .env pour activer l’authentification.</div>':''}<form id="auth-form">${signup?'<label>Nom complet<input name="name" autocomplete="name" required placeholder="Votre nom"></label>':''}<label>Adresse e-mail<input type="email" name="email" autocomplete="email" required placeholder="vous@exemple.com"></label><label>Mot de passe<input type="password" name="password" autocomplete="${signup?'new-password':'current-password'}" minlength="8" required placeholder="8 caractères minimum"></label><button class="button button-dark auth-submit" ${configured?'':'disabled'}>${signup?'Créer mon compte':'Se connecter'} <span>&#8594;</span></button><div id="auth-message" class="auth-message" aria-live="polite"></div></form><div class="auth-switch">${signup?'Déjà inscrit·e ?':'Pas encore de compte ?'} <a href="${signup?'connexion.html':'inscription.html'}">${signup?'Se connecter':'Créer un compte'}</a></div></div></div></section>`}
export function bindAuth(){
  const form=document.querySelector('#auth-form');
  if(!form)return;
  form.onsubmit=async event=>{
    event.preventDefault();
    const message=document.querySelector('#auth-message');
    const submit=form.querySelector('button[type="submit"],button:not([type])');
    const signup=document.body.dataset.page==='inscription';
    if(!supabase){message.textContent='Supabase n\u2019est pas configur\u00e9.';return}
    const values=new FormData(form);
    const email=String(values.get('email')||'').trim();
    const password=String(values.get('password')||'');
    const originalLabel=submit?.textContent||'';
    if(submit){submit.disabled=true;submit.textContent='Patientez?'}
    message.textContent=signup?'Cr\u00e9ation du compte?':'Connexion en cours?';
    message.className='auth-message';
    try{
      const result=signup
        ?await supabase.auth.signUp({email,password,options:{data:{full_name:values.get('name')}}})
        :await supabase.auth.signInWithPassword({email,password});
      if(result.error){
        message.textContent=signup?'Inscription impossible. V\u00e9rifiez les informations et r\u00e9essayez.':'Connexion impossible. V\u00e9rifiez votre adresse e-mail et votre mot de passe.';
        message.className='auth-message error';
        return;
      }
      message.textContent=signup?'Compte cr\u00e9\u00e9. Consultez votre e-mail si une confirmation est requise.':'Connexion r\u00e9ussie.';
      message.className='auth-message success';
      if(!signup)setTimeout(()=>location.href='favoris.html',500);
    }catch{
      message.textContent='Service d\u2019authentification momentan\u00e9ment indisponible. R\u00e9essayez plus tard.';
      message.className='auth-message error';
    }finally{
      if(submit){submit.disabled=!configured;submit.textContent=originalLabel}
    }
  };
}
