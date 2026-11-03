import { api,el } from './community-dom.js';
import { renderMarkup,formattedDate,notice,newsImageSource } from './exact-markup.js?v=news-images-20261103';
import { orderNewsPosts } from './news-order.js';
const page=document.body.dataset.exactPage;
const one=selector=>document.querySelector(selector);
const text=(selector,value)=>{const node=one(selector);if(node)node.textContent=value??'';};
const tags=new Map([['Announcement','tag-red'],['Changelog','tag-dark'],['Event','tag-gold']]);
function clearBindings(node){for(const child of [node,...node.querySelectorAll('*')])for(const attr of [...child.attributes])if(attr.name.startsWith('data-b-')||attr.name.startsWith('data-on-'))child.removeAttribute(attr.name);return node;}
function author(record){const image=document.querySelector('[data-author-name]')?.parentElement?.querySelector('img');if(image&&!document.documentElement.hasAttribute('data-preview-root')){image.hidden=!record.authorName;if(record.authorName)image.src='https://minotar.net/helm/'+encodeURIComponent(record.authorName)+'/40';}text('[data-author-name]',record.authorName??'Staff');text('[data-author-rank]',record.authorRank??'Staff');}
function setCover(url){const image=one('[data-news-cover]');if(!image)return;image.hidden=!url;if(url)image.src=newsImageSource(url);else image.removeAttribute('src');}
async function reader(){
  const template=one('#news-row-template'),panel=one('article.panel.swap'),list=template.parentElement.firstElementChild;let posts=[],selected=null,category='All',order='newest';
  const feedback=el('p',{class:'exact-status',role:'status',text:'Loading posts...'});list.append(feedback);panel.hidden=true;
  function choose(post){
    selected=post;panel.hidden=false;
    text('[data-b-text="postTitle"]',post.title);text('[data-b-text="postCat"]',post.category);text('[data-b-text="postDate"]',formattedDate(post.date));
    const tag=one('[data-b-class="tag {{postTag}}"]');tag.className='tag '+(tags.get(post.category)??'tag-dark');
    author(post);setCover(post.image);renderMarkup(one('[data-b-blocks="blocks"]'),post.body);
    for(const row of list.querySelectorAll('.postbtn'))row.setAttribute('aria-pressed',String(row.dataset.slug===post.slug));
    history.replaceState(null,'','#'+encodeURIComponent(post.slug));
  }
  function draw(){
    const items=orderNewsPosts(posts.filter(post=>category==='All'||post.category===category),order);
    list.replaceChildren(...items.map(post=>{
      const row=clearBindings(template.content.firstElementChild.cloneNode(true));row.className='postbtn';row.dataset.slug=post.slug;row.setAttribute('aria-pressed',String(selected?.slug===post.slug));
      row.children[0].className='tag '+(tags.get(post.category)??'tag-dark');row.children[0].textContent=post.category;row.children[1].textContent=post.title;row.children[2].textContent=formattedDate(post.date)+' - '+(post.authorName??'Staff');
      row.addEventListener('click',()=>choose(post));return row;
    }));
    if(!items.length){list.append(el('p',{class:'exact-status',text:'No published posts in this category.'}));panel.hidden=true;}
    else if(!items.some(post=>post.slug===selected?.slug))choose(items[0]);
  }
  for(const node of document.querySelectorAll('[data-on-click^="pickK"]'))node.addEventListener('click',()=>{category=node.dataset.onClick.slice(5);for(const button of node.parentElement.children)button.setAttribute('aria-pressed',String(button===node));draw();});
  for(const button of document.querySelectorAll('[data-news-order]'))button.addEventListener('click',()=>{order=button.dataset.newsOrder;for(const peer of document.querySelectorAll('[data-news-order]'))peer.setAttribute('aria-pressed',String(peer===button));draw();});
  one('[data-on-click="pickKAll"]').setAttribute('aria-pressed','true');
  const copy=[...panel.querySelectorAll('button')].find(node=>node.textContent.includes('Copy link'));copy?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(new URL('#'+encodeURIComponent(selected.slug),location.href).href);notice('Post link copied.');}catch{notice('Copy the address from your browser.');}});
  try{posts=(await api('news')).items;selected=posts.find(post=>post.slug===decodeURIComponent(location.hash.slice(1)))??null;draw();if(selected)choose(selected);}catch(error){feedback.textContent=error.message;}
}
async function editor(){
  const title=one('[data-on-change="setTitle"]'),body=one('[data-on-change="setDraft"]'),preview=one('[data-b-blocks="blocks"]'),pin=one('[data-on-change="togPin"]'),ping=one('[data-on-change="togPing"]');
  let category='Announcement',slug='',revision=0,cover='',uploading=0;const message=one('[data-b-class="swap {{sentShow}}"]');message.hidden=true;
  function draw(){text('[data-b-text="title"]',title.value);text('[data-b-text="cat"]',category);text('[data-b-text="charCount"]',body.value.length+' characters - Discord would cut a message off at 2,000');setCover(cover);one('[data-news-remove-cover]').hidden=!cover;renderMarkup(preview,body.value);one('[data-b-class="tag {{postTag}}"]')?.setAttribute('class','tag '+tags.get(category));one('[data-b-class="tag tag-gold {{pinShow}}"]')?.toggleAttribute('hidden',!pin.checked);}
  for(const node of document.querySelectorAll('[data-on-click^="pickC"]'))node.addEventListener('click',()=>{category=node.dataset.onClick.slice(5);for(const option of node.parentElement.children)option.setAttribute('aria-pressed',String(option===node));draw();});
  one('[data-on-click="pickCAnnouncement"]').setAttribute('aria-pressed','true');title.addEventListener('input',draw);body.addEventListener('input',draw);pin.addEventListener('change',draw);
  const wraps=new Map([['wrapB','**'],['wrapI','*'],['wrapU','__'],['wrapS','~~'],['wrapC','`'],['wrapSp','||']]),prefixes=new Map([['lineH','# '],['lineL','- '],['lineQ','> '],['lineSub','-# ']]);
  for(const node of document.querySelectorAll('[data-on-click]')){
    const action=node.dataset.onClick;
    if(wraps.has(action))node.addEventListener('click',()=>{const token=wraps.get(action),a=body.selectionStart,b=body.selectionEnd;body.setRangeText(token+body.value.slice(a,b)+token,a,b,'select');body.focus();draw();});
    if(prefixes.has(action))node.addEventListener('click',()=>{const at=body.value.lastIndexOf('\n',body.selectionStart-1)+1;body.setRangeText(prefixes.get(action),at,at,'end');body.focus();draw();});
  }
  const mediaStatus=one('[data-news-media-status]'),dialog=one('[data-news-preview-dialog]');
  one('[data-news-full-preview]').addEventListener('click',()=>{
    const panel=preview.closest('article').cloneNode(true);panel.querySelector('p')?.remove();
    panel.querySelector('[data-b-class="tag tag-gold {{pinShow}}"]')?.remove();
    const categoryTag=panel.querySelector('[data-b-text="cat"]')?.parentElement;
    categoryTag?.parentElement?.append(el('span',{text:formattedDate(new Date().toISOString()),style:'color:var(--muted)'}));
    one('[data-news-preview-content]').replaceChildren(panel);dialog.showModal();
  });
  one('[data-news-preview-close]').addEventListener('click',()=>dialog.close());
  one('[data-news-remove-cover]').addEventListener('click',()=>{cover='';draw();});
  async function prepareImage(file){
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>16*1024*1024)throw new Error('Choose a PNG or JPEG under 16 MB.');
    const objectUrl=URL.createObjectURL(file);try{
      const image=new Image();image.src=objectUrl;await image.decode();
      if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40*1000*1000)throw new Error('Image dimensions are too large.');
      const scale=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,file.type,.9));if(!blob||blob.size>8*1024*1024)throw new Error('Image is too large to upload.');return blob;
    }finally{URL.revokeObjectURL(objectUrl);}
  }
  for(const [buttonSelector,inputSelector,isCover] of [['[data-news-add-image]','[data-news-image-file]',false],['[data-news-add-cover]','[data-news-cover-file]',true]]){
    const button=one(buttonSelector),input=one(inputSelector);button.addEventListener('click',()=>input.click());
    input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file)return;uploading+=1;button.disabled=true;mediaStatus.textContent='Uploading image…';try{
      const image=await prepareImage(file),response=await fetch('/api/community/admin/news-media',{method:'POST',headers:{'Content-Type':image.type},body:image});const result=await response.json();if(!response.ok)throw new Error(result.error||'Image upload failed.');
      if(isCover)cover=result.url;else{const alt=file.name.replace(/\.[^.]+$/,'').replace(/[\][\n\r]/g,' ').slice(0,160);const insertion='\n!['+alt+']('+result.url+')\n';body.setRangeText(insertion,body.selectionStart,body.selectionEnd,'end');}mediaStatus.textContent='Image added.';draw();
    }catch(error){mediaStatus.textContent=error.message||'Image upload failed.';}finally{uploading-=1;button.disabled=false;input.value='';}});
  }
  async function save(state){
    if(uploading){mediaStatus.textContent='Wait for the image upload to finish.';return;}
    const controls=[...document.querySelectorAll('main button')],disabled=controls.map(node=>node.disabled);controls.forEach(node=>node.disabled=true);
    try{
      const safeSlug=slug||title.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'post-'+Date.now();
      const record=await api('admin/news',{method:'POST',body:JSON.stringify({kind:'news',slug:safeSlug,title:title.value,body:body.value,image:cover,category,status:state,revision,date:new Date().toISOString(),pinned:pin.checked})});
      slug=record.slug;revision=record.revision;message.hidden=false;message.textContent=state==='published'?'Published to News.':'Draft saved.';
      if(ping.checked)message.textContent+=' Discord announcement delivery is not configured.';
      history.replaceState(null,'','?slug='+encodeURIComponent(slug));
    }catch(error){message.hidden=false;message.textContent=error.message;}finally{controls.forEach((node,index)=>node.disabled=disabled[index]);}
  }
  one('[data-on-click="publish"]').addEventListener('click',()=>save('published'));
  const draft=[...document.querySelectorAll('main button')].find(node=>node.textContent==='Save draft');draft?.addEventListener('click',()=>save('draft'));
  try{
    const session=await api('admin/session');author({authorName:session.name,authorRank:session.rank});
    const records=await api('admin/news'),requested=new URLSearchParams(location.search).get('slug');
    const record=records.items.find(item=>item.slug===requested)??(document.documentElement.hasAttribute('data-preview-root')?records.items[0]:null);
    if(record){title.value=record.title;body.value=document.documentElement.hasAttribute('data-preview-root')&&!requested?records.editorDraft??record.body:record.body;category=record.category;slug=record.slug;revision=record.revision;cover=record.image??'';pin.checked=document.documentElement.hasAttribute('data-preview-root')&&!requested||record.pinned===true;ping.checked=document.documentElement.hasAttribute('data-preview-root');for(const option of document.querySelectorAll('[data-on-click^="pickC"]'))option.setAttribute('aria-pressed',String(option.dataset.onClick==='pickC'+category));}
    one('[data-news-add-image]').disabled=false;one('[data-news-add-cover]').disabled=false;
  }catch(error){message.hidden=false;message.textContent='Publishing requires an authorized staff account. '+error.message;mediaStatus.textContent='Sign in with an authorized staff account to upload images.';one('[data-on-click="publish"]').disabled=true;if(draft)draft.disabled=true;}
  draw();
}
(page==='news'?reader():editor()).catch(error=>notice(error.message));
