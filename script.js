/* Delta Site — shared interactions + real tokenizer loader */
const screens=[...document.querySelectorAll('.screen')];

function show(id){screens.forEach(s=>s.classList.toggle('active',s.id===id));window.scrollTo(0,0);document.body.classList.remove('menu-open');if(id==='lab')tokenize()}
function fake(){toast('Mockup: ação concluída ✦')}
function toast(t){let x=document.getElementById('toast');if(!x){x=document.createElement('div');x.id='toast';document.body.appendChild(x)}x.textContent=t;x.className='toast';setTimeout(()=>x.className='',2200)}
function newChat(){const m=document.getElementById('messages');if(m)m.innerHTML='<div class="welcome"><strong>δ</strong><h2>What can I help you build?</h2><p>Ask Delta anything.</p></div>';toast('New conversation created')}
function promptDelta(t){const i=document.getElementById('input');if(i){i.value=t;send()}}
function key(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}
function send(){const i=document.getElementById('input'),t=i?.value.trim();if(!t)return;const m=document.getElementById('messages');if(m.querySelector('.welcome'))m.innerHTML='';m.innerHTML+=`<div class="msg user"><span>You</span><p>${escapeHtml(t)}</p></div>`;i.value='';setTimeout(()=>{m.innerHTML+=`<div class="msg ai"><b>δ</b><p>That’s a great direction. I’m Delta — this demo interface is ready for the real model connection. For now, I can simulate the conversation flow and showcase the product experience.</p></div>`;m.scrollTop=m.scrollHeight},500)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}

function setText(t){const el=document.getElementById('text');if(el){el.value=t;tokenize()}}

/*
 * Tokenizer loader
 * 1. Try the deployed site's /tokenizer.json.
 * 2. If that fails, try the public GitHub raw file directly.
 * This makes the Lab work even while Netlify is waiting for a deploy.
 */
let deltaTokenizer=null;
let tokenizerPromise=null;
const TOKENIZER_SOURCES=[
  new URL('tokenizer.json',window.location.href).href,
  'https://raw.githubusercontent.com/PyraLabss/Delta_Site/main/tokenizer.json'
];

async function loadTokenizer(){
  if(deltaTokenizer)return deltaTokenizer;
  if(tokenizerPromise)return tokenizerPromise;
  tokenizerPromise=(async()=>{
    let lastError=null;
    for(const source of TOKENIZER_SOURCES){
      try{
        const response=await fetch(`${source}${source.includes('?')?'&':'?'}v=${Date.now()}`,{
          cache:'no-store',
          headers:{'Accept':'application/json'}
        });
        if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
        const json=await response.json();
        if(!json?.model?.vocab && !json?.vocab)throw new Error('JSON sem vocabulary/model.vocab');
        deltaTokenizer=json;
        updateTokenizerStatus(true,source);
        return json;
      }catch(error){lastError=error;console.warn('[Delta Tokenizer] Falha ao carregar',source,error)}
    }
    updateTokenizerStatus(false,lastError);
    throw lastError||new Error('Não foi possível carregar tokenizer.json');
  })().finally(()=>{tokenizerPromise=null});
  return tokenizerPromise;
}

function updateTokenizerStatus(ok,detail){
  const el=document.getElementById('tokenizerStatus');
  if(!el)return;
  if(ok){
    el.className='tokenizer-status ready';
    el.innerHTML='● <b>Delta tokenizer loaded</b><span> tokenizer.json · BPE vocabulary</span>';
    el.title=typeof detail==='string'?detail:'';
  }else{
    el.className='tokenizer-status error';
    el.innerHTML='! <b>Could not load tokenizer.json</b><span> Check that the file is in the repository root.</span>';
  }
}

function getVocab(j){return j?.model?.vocab||j?.vocab||{}}
function getMerges(j){return j?.model?.merges||j?.merges||[]}

/* A browser-side BPE implementation for tokenizer.json files using the
   standard Hugging Face BPE structure. Handles merge strings and pair arrays. */
function normalizeMerge(m){
  if(Array.isArray(m))return m.length>=2?[String(m[0]),String(m[1])]:null;
  if(typeof m==='string'){
    const parts=m.split(' ');
    return parts.length>=2?[parts[0],parts.slice(1).join(' ')]:null;
  }
  return null;
}

function bpeWord(word,vocab,merges,cache){
  if(cache.has(word))return cache.get(word);
  if(vocab[word]!==undefined){const result=[{text:word,id:vocab[word]}];cache.set(word,result);return result}

  let pieces=[...word];
  const rank=new Map();
  merges.forEach((m,index)=>{const pair=normalizeMerge(m);if(pair)rank.set(pair.join('\u0000'),index)});

  while(pieces.length>1){
    let bestIndex=-1,bestRank=Infinity;
    for(let i=0;i<pieces.length-1;i++){
      const r=rank.get(pieces[i]+'\u0000'+pieces[i+1]);
      if(r!==undefined&&r<bestRank){bestRank=r;bestIndex=i}
    }
    if(bestIndex<0)break;
    pieces.splice(bestIndex,2,pieces[bestIndex]+pieces[bestIndex+1]);
  }

  const result=pieces.map(piece=>({text:piece,id:vocab[piece]??null}));
  cache.set(word,result);
  return result;
}

function encodeWithDeltaTokenizer(text,j){
  const vocab=getVocab(j);
  const merges=getMerges(j);
  const cache=new Map();
  const result=[];

  /* Preserve whitespace as visible pieces. For byte-level BPE, the vocab may
     contain the tokenizer's actual whitespace/byte representation; direct
     vocab matches are preferred before falling back to characters. */
  const chunks=text.match(/\s+|[^\s]+/gu)||[];
  for(const chunk of chunks){
    if(/^\s+$/.test(chunk)){
      if(vocab[chunk]!==undefined){result.push({text:chunk,id:vocab[chunk]});continue}
      for(const ch of [...chunk])result.push({text:ch,id:vocab[ch]??null});
      continue;
    }
    result.push(...bpeWord(chunk,vocab,merges,cache));
  }
  return result;
}

async function tokenize(){
  const el=document.getElementById('text'),box=document.getElementById('tokens');
  if(!el||!box)return;
  const text=el.value;
  const chars=document.getElementById('chars'),sc=document.getElementById('sc');
  if(chars)chars.textContent=`${text.length} characters`;
  if(sc)sc.textContent=text.length;

  try{
    const tokenizer=await loadTokenizer();
    const result=encodeWithDeltaTokenizer(text,tokenizer);
    box.innerHTML=result.map(x=>`<span class="token" title="Token ID: ${x.id??'unknown'}">${escapeHtml(x.text)}</span>`).join('');
    const n=result.length;
    const count=document.getElementById('count'),st=document.getElementById('st'),sr=document.getElementById('sr');
    if(count)count.textContent=`${n} tokens`;
    if(st)st.textContent=n;
    if(sr)sr.textContent=text.length?(n/text.length).toFixed(2):'0.00';
  }catch(error){
    box.innerHTML='<span style="color:#f59e0b">tokenizer.json não pôde ser carregado. Verifique se o arquivo está na raiz do repositório e contém model.vocab.</span>';
    const count=document.getElementById('count'),st=document.getElementById('st'),sr=document.getElementById('sr');
    if(count)count.textContent='Tokenizer unavailable';
    if(st)st.textContent='—';
    if(sr)sr.textContent='—';
  }
}

tokenize();
