import { attachNewsMenu } from './news-article-menu.js';
import { renderMarkup, notice } from './exact-markup.js?v=news-images-20261103';

const article = document.querySelector('.release');
const body = article.querySelector('.release-body');
if (body) {
  attachNewsMenu(article);
  renderMarkup(body, body.textContent);
  const dialog = document.querySelector('.release-lightbox');
  const enlarged = dialog.querySelector('img');
  for (const image of article.querySelectorAll('.release-cover img,.news-inline-image')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'release-zoom';
    button.setAttribute('aria-label','Enlarge '+(image.alt || 'image'));
    image.replaceWith(button);
    button.append(image);
    button.addEventListener('click',()=>{
      enlarged.src = image.currentSrc || image.src;
      enlarged.alt = image.alt;
      dialog.showModal();
    });
  }
  dialog.querySelector('button').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>enlarged.removeAttribute('src'));
  article.querySelector('[data-copy-article]').addEventListener('click',async()=>{
    try { await navigator.clipboard.writeText(location.origin+location.pathname); notice('Post link copied.'); }
    catch { notice('Copy the address from your browser.'); }
  });
}
