self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method==='POST'&&u.pathname==='/share'){
  e.respondWith((async()=>{
   try{
    const f=await e.request.formData(),url=f.get('url'),text=f.get('text'),t=url||text||f.get('title');
    if(t)await fetch('/api/text',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:(url&&text&&text!==url)?text+'\n'+url:t})});
    for(const file of f.getAll('files'))await fetch('/api/upload',{method:'POST',headers:{'x-filename':encodeURIComponent(file.name),'content-type':file.type||'application/octet-stream'},body:file});
   }catch(_){}
   return Response.redirect('/',303);
  })());
 }
});
