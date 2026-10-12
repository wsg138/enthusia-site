const preview=document.documentElement.hasAttribute('data-preview-root');
async function start(){
  if(!preview){
    try{
      const response=await fetch('/api/gallery?category=COMMUNITY_BUILDS');if(!response.ok)throw new Error();const data=await response.json();
      const frame=document.querySelector('[data-slide="gallery"]')?.parentElement;
      for(const item of data.submissions??[]){
        if(!frame||!item.imageUrl)continue;const image=document.createElement('img');image.className='gimg';image.src=item.imageUrl;image.alt=item.title;image.dataset.slide='gallery';image.dataset.label=item.title;image.loading='lazy';frame.append(image);
      }
    }catch{/* The authored historical gallery remains available when the community API is unavailable. */}
  }
  const script=document.createElement('script');script.src=new URL('./enthusia.js',import.meta.url).href;document.body.append(script);
}
start();
