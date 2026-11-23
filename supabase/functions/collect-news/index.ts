const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-cron-secret","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const safeError=error=>{let message=String(error?.message||error||"Source unavailable")
  .replace(/\b(Bearer\s+)[^\s,;]+/gi,"$1[redacted]")
  .replace(/\b(authorization|x-cron-secret|newsdata_api_key|api[_-]?key|token|secret|password)\b\s*[:=]\s*[^\s,;]+/gi,"$1=[redacted]")
  .replace(/\b(?:sb_publishable|sb_secret)_[A-Za-z0-9_-]+/gi,"[credential]")
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,"[token]")
  .replace(/\b[A-Za-z0-9_-]{40,}\b/g,"[long value redacted]")
  .replace(/https?:\/\/[^\s"'<>]+/gi,"[URL masked]")
  .replace(/[\r\n\t]+/g," ").slice(0,260);
  for(const name of ["NEWSDATA_API_KEY","COLLECT_NEWS_CRON_SECRET","SUPABASE_SERVICE_ROLE_KEY"]){const value=Deno.env.get(name);if(value)message=message.split(value).join("[secret redacted]")}
  return message;
}
function errorCode(error){
  const explicit=typeof error?.code==="string"?error.code:"";
  if(/^[A-Za-z0-9_]{1,40}$/.test(explicit))return explicit;
  const status=String(error?.message||"").match(/^HTTP\s+(\d{3})/i);
  return status?`HTTP_${status[1]}`:"SOURCE_ERROR";
}
function errorDiagnostic(error,operation){
  const code=errorCode(error);
  return {code,message:`${operation} (${code}): ${safeError(error)}`.slice(0,300)};
}
async function responseDiagnostic(response,operation){
  let code=`HTTP_${response.status}`,detail=`HTTP ${response.status}`;
  try{
    const payload=await response.clone().json();
    if(typeof payload?.code==="string"&&/^[A-Za-z0-9_]{1,40}$/.test(payload.code))code=payload.code;
    if(typeof payload?.message==="string")detail=safeError(payload.message);
  }catch{}
  return {code,message:`${operation} (${code}): ${detail}`.slice(0,300)};
}
function secretMatches(candidate,expected){if(!candidate||!expected||candidate.length!==expected.length)return false;let mismatch=0;for(let i=0;i<candidate.length;i++)mismatch|=candidate.charCodeAt(i)^expected.charCodeAt(i);return mismatch===0;}
async function validateCaller(req){
  if(secretMatches(req.headers.get("x-cron-secret"),Deno.env.get("COLLECT_NEWS_CRON_SECRET")))return true;
  const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const projectUrl=Deno.env.get("SUPABASE_URL");
  let publicKey=Deno.env.get("SUPABASE_ANON_KEY");
  if(!publicKey){try{publicKey=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default;}catch{}}
  if(!projectUrl||!publicKey)return "unconfigured";
  if(!token)return false;
  const response=await fetch(`${projectUrl}/auth/v1/user`,{headers:{apikey:publicKey,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
  return response.ok;
}
const clean=(value)=>typeof value==="string"?value.replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g," ").trim():"";
const xml=(entry,tag)=>clean(entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,'i'))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,""));
function safeIsoDate(value){if(!value)return null;const timestamp=Date.parse(value);return Number.isFinite(timestamp)?new Date(timestamp).toISOString():null}
function topicOf(text){const s=text.toLowerCase();if(/fraud|fraude|scam|arnaque|cyber.?security|cybers[e\u00e9]curit[e\u00e9]|security|s[e\u00e9]curit[e\u00e9]|phishing/.test(s))return "Fraude et s\u00e9curit\u00e9";if(/r.glement|regulat|banque centrale|central bank|\bbcc\b/.test(s))return "R\u00e9glementation";if(/mobile money|mobile wallet|m-pesa|mpesa|airtel money|orange money|afrimoney|mukuru/.test(s))return "Mobile money";if(/inclusion financi[e\u00e9]re|financial inclusion/.test(s))return "Inclusion financi\u00e8re";if(/interop[e\u00e9]rabilit[e\u00e9]|interoperability/.test(s))return "Interop\u00e9rabilit\u00e9";if(/fintech|fintechs|startup|banque|bank/.test(s))return "Fintech";if(/paiement|payment|carte|transfert/.test(s))return "Paiements";return "Innovation"}
async function gdelt(){const q='("mobile money" OR "mobile wallet" OR "Airtel Money" OR "M-Pesa" OR "Orange Money" OR Afrimoney OR fintech OR "digital payments" OR payment OR paiement OR fraud OR fraude OR cybersecurity OR "Central Bank of the DRC" OR "Banque Centrale du Congo" OR BCC) ("DR Congo" OR DRC OR "Congo-Kinshasa" OR "Democratic Republic of the Congo" OR RDC OR Kinshasa OR Lubumbashi OR Goma OR Kisangani OR Kolwezi OR Bukavu)';const u=`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=ArtList&format=json&maxrecords=50&sort=DateDesc`;const r=await fetch(u,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(`HTTP ${r.status}`);const d=await r.json();return(d.articles||[]).map(a=>({source:"GDELT",title:clean(a.title),description:"",url:a.url,image_url:a.socialimage||null,author:a.domain,published_at:a.seendate?safeIsoDate(`${a.seendate.slice(0,4)}-${a.seendate.slice(4,6)}-${a.seendate.slice(6,8)}T${a.seendate.slice(8,10)}:${a.seendate.slice(10,12)}:${a.seendate.slice(12,14)}Z`):null,topic:topicOf(a.title),language:a.language,country:"CD"}))}
async function newsdata(){const key=Deno.env.get("NEWSDATA_API_KEY");if(!key)throw Error("NEWSDATA_API_KEY absente");const query='("mobile money" OR "mobile wallet" OR "Airtel Money" OR "M-Pesa" OR "Orange Money" OR Afrimoney OR fintech OR "digital payments" OR payment OR paiement OR "financial inclusion" OR interoperability OR fraud OR fraude OR cybersecurity OR "Central Bank of Congo" OR BCC) AND ("DR Congo" OR DRC OR "Congo-Kinshasa" OR RDC OR Kinshasa OR Lubumbashi OR Goma OR Kisangani OR Kolwezi OR Bukavu)';const u=`https://newsdata.io/api/1/latest?q=${encodeURIComponent(query)}&country=cd&language=en,fr`;const r=await fetch(u,{signal:AbortSignal.timeout(12000),headers:{"X-ACCESS-KEY":key}});if(!r.ok)throw Error(`HTTP ${r.status}`);const d=await r.json();if(d.status==="error")throw Error(d.results?.message||"Erreur NewsData.io");return(d.results||[]).map(a=>({source:"NewsData.io",title:clean(a.title),description:clean(a.description||a.content),url:a.link,image_url:a.image_url||null,author:a.source_name,published_at:a.pubDate?safeIsoDate(a.pubDate):null,topic:topicOf(`${a.title} ${a.description||""}`),language:a.language,country:"CD"}))}
async function techcabal(){const r=await fetch("https://techcabal.com/feed/",{signal:AbortSignal.timeout(12000),headers:{"User-Agent":"SangoYaMbongo/1.0 news monitor"}});if(!r.ok)throw Error(`HTTP ${r.status}`);const text=await r.text();return[...text.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(([,item])=>({source:"TechCabal",title:xml(item,"title"),description:xml(item,"description"),url:xml(item,"link"),image_url:null,author:xml(item,"dc:creator"),published_at:xml(item,"pubDate")?safeIsoDate(xml(item,"pubDate")):null,topic:topicOf(`${xml(item,"title")} ${xml(item,"description")}`),language:"en",country:null})).filter(a=>/mobile money|fintech|payments?|wallet|m-pesa|mpesa|airtel money|orange money|afrimoney|fraud|fraude|security|s[eé]curit[eé]|central bank|banque centrale/i.test(`${a.title} ${a.description}`))}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Methode non autorisee"},405);
  let callerValid;
  try{callerValid=await validateCaller(req);}catch{return json({error:"Verification de session indisponible"},503);}
  if(callerValid==="unconfigured")return json({error:"Configuration Supabase serveur incomplete"},503);
  if(!callerValid)return json({error:"Une session utilisateur valide est requise"},401);
  const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!supabaseUrl||!serviceKey)return json({error:"Configuration de stockage serveur indisponible"},503);
  const runId=crypto.randomUUID(),startedAt=new Date().toISOString();
  const serviceHeaders={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"};
  try{
    const lockResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/acquire_collector_lock`,{
      method:"POST",headers:serviceHeaders,
      body:JSON.stringify({p_lock_name:"news-sources",p_lock_token:runId,p_lease_seconds:1800}),
      signal:AbortSignal.timeout(8000)
    });
    if(!lockResponse.ok)throw new Error(`Lock acquisition HTTP ${lockResponse.status}`);
    if(!(await lockResponse.json()))return json({skipped:true,reason:"Une collecte d actualites est deja en cours",run_id:runId});
  }catch(error){return json({error:"Verrou de collecte indisponible",detail:safeError(error)},503)}
  const names=["GDELT","NewsData.io","TechCabal"];
  const settled=await Promise.allSettled([gdelt(),newsdata(),techcabal()]);
  const sources={},articles=[];
  settled.forEach((r,i)=>{
    const name=names[i];
    if(r.status==="fulfilled"){
      sources[name]={available:true,count:r.value.length};
      articles.push(...r.value.filter(a=>a.title&&a.url));
    }else sources[name]={available:false,error:safeError(r.reason),count:0};
  });
  const unique=[...new Map(articles.map(a=>[a.url,a])).values()]
    .sort((a,b)=>new Date(b.published_at||0)-new Date(a.published_at||0));
  let saved=0;
  const storage={configured:Boolean(supabaseUrl&&serviceKey),articles_ok:true,source_status_ok:true,logs_ok:true};
  if(supabaseUrl&&serviceKey){
    const headers=serviceHeaders;
    const persisted=await Promise.all(names.map(async name=>{
      const result=sources[name];
      const sourceArticles=unique.filter(article=>article.source===name);
      let articleError=null,sourceStatusError=null,savedForSource=0;

      if(result.available&&sourceArticles.length){
        try{
          const response=await fetch(`${supabaseUrl}/rest/v1/articles?on_conflict=url`,{
            method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates,return=minimal"},
            body:JSON.stringify(sourceArticles.map(article=>({...article,fetched_at:startedAt})))
          });
          if(response.ok){savedForSource=sourceArticles.length;saved+=savedForSource;}
          else {articleError=await responseDiagnostic(response,"Upsert articles");storage.articles_ok=false;}
        }catch(error){articleError=errorDiagnostic(error,"Upsert articles");storage.articles_ok=false;}
      }

      const sourceRow={code:name,status:result.available?"available":"unavailable",last_checked_at:startedAt,
        ...(result.available?{last_success_at:startedAt,last_error:null}:{last_error:result.error}),
        last_article_count:result.count,updated_at:startedAt};
      try{
        const response=await fetch(`${supabaseUrl}/rest/v1/sources?on_conflict=code`,{
          method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates,return=minimal"},
          body:JSON.stringify(sourceRow)
        });
        if(!response.ok){sourceStatusError=await responseDiagnostic(response,"Upsert sources");storage.source_status_ok=false;}
      }catch(error){sourceStatusError=errorDiagnostic(error,"Upsert sources");storage.source_status_ok=false;}

      const collectionError=!result.available?errorDiagnostic(new Error(result.error),"Collecte source"):articleError;
      const logRow={run_id:runId,source_code:name,status:collectionError?"failed":"succeeded",
        articles_found:result.count,articles_saved:savedForSource,error_code:collectionError?.code||null,
        error_message:collectionError?.message||null,warning_message:sourceStatusError?.message||null,
        started_at:startedAt,completed_at:new Date().toISOString()};
      let logError=null;
      try{
        const response=await fetch(`${supabaseUrl}/rest/v1/collection_logs?on_conflict=run_id,source_code`,{
          method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(logRow)
        });
        if(!response.ok){logError=await responseDiagnostic(response,"Upsert collection_logs");storage.logs_ok=false;}
      }catch(error){logError=errorDiagnostic(error,"Upsert collection_logs");storage.logs_ok=false;}

      if(sourceStatusError)console.error(JSON.stringify({event:"source_status_upsert_failed",run_id:runId,source:name,error_code:sourceStatusError.code,error_message:sourceStatusError.message}));
      if(logError)console.error(JSON.stringify({event:"collection_log_upsert_failed",run_id:runId,source:name,error_code:logError.code,error_message:logError.message}));
      return {name,saved:savedForSource,collectionError,sourceStatusError,logError};
    }));
    for(const item of persisted){
      sources[item.name]={...sources[item.name],last_checked_at:startedAt,saved:item.saved,
        collection_status:item.collectionError?"failed":"succeeded",
        ...(item.collectionError?{collection_error:item.collectionError.message}:{}),
        source_status_updated:!item.sourceStatusError,
        ...(item.sourceStatusError?{source_status_warning:item.sourceStatusError.message}:{}),
        log_recorded:!item.logError};
    }
    if(!storage.articles_ok||!storage.source_status_ok||!storage.logs_ok)sources.storage={available:false,...storage};
  }else{
    storage.configured=false;
    storage.articles_ok=false;storage.source_status_ok=false;storage.logs_ok=false;
    sources.storage={available:false,error:"Configuration du stockage serveur indisponible",...storage};
  }
  try{
    const releaseResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/release_collector_lock`,{
      method:"POST",headers:serviceHeaders,body:JSON.stringify({p_lock_name:"news-sources",p_lock_token:runId}),
      signal:AbortSignal.timeout(8000)
    });
    if(!releaseResponse.ok)throw new Error(`Lock release HTTP ${releaseResponse.status}`);
  }catch(error){console.error(JSON.stringify({event:"news_collector_lock_release_failed",run_id:runId,error_message:safeError(error)}))}
  return json({articles:unique,sources,storage,fetched_at:new Date().toISOString(),saved,run_id:runId});
});
