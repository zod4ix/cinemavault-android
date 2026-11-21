const { app, BrowserWindow, shell, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Enable unrestricted media playback, HLS streaming, DNS-over-HTTPS & ECH (ISP block bypass)
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch(
  'enable-features',
  'DnsOverHttps,EncryptedClientHello,TLS13EarlyData'
);
app.commandLine.appendSwitch(
  'disable-features',
  'OutOfBlinkCors,BlockInsecurePrivateNetworkRequests,SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,CrossOriginOpenerPolicy,CrossOriginEmbedderPolicy'
);
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');

const CLEAN_USER_AGENT =
  process.platform === 'darwin'
    ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

app.userAgentFallback = CLEAN_USER_AGENT;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m3u8': 'application/vnd.apple.mpegurl',
};

const TRUSTED_EXTERNAL_DOMAINS = [
  'github.com',
  'vinegret.net',
  't.me',
  'telegram.me',
  'telegram.org',
  'themoviedb.org',
  'imdb.com',
  'paypal.com',
  'monobank.ua',
  'buymeacoffee.com',
];

// Network-level AdBlock & Anti-Popunder filter list for streaming balancers & sports embeds
const AD_BLOCK_DOMAINS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'imasdk.googleapis.com',
  'exoclick.com',
  'exosrv.com',
  'propellerads.com',
  'propellerclick.com',
  'popads.net',
  'popcash.net',
  'popmyads.com',
  'adsterra.com',
  'adsterratech.com',
  'highperformanceformat.com',
  'profitablecpmrate.com',
  'hilltopads.net',
  'clickadu.com',
  'juicyads.com',
  'trafficjunky.net',
  'trafficstars.com',
  'adsco.re',
  'acint.net',
  'betweendigital.com',
  'bidgear.com',
  'mgid.com',
  'lentainform.com',
  'an.yandex.ru',
  'mc.yandex.ru',
  'yabs.yandex.ru',
  'adfox.ru',
  'traforet.com',
  'franecki.net',
  'alocdn.com',
  'cdn4ads.com',
  'adtng.com',
  'realsrv.com',
  'tsyndicate.com',
  'onclkds.com',
  'pushame.com',
  '1xbet',
  'mostbet',
  'parimatch',
  'favbet',
  'vavada',
  'pin-up',
  'slotoking',
  'cosmolot',
  'melbet',
  'betwinner',
  'stuins.com',
  'wnouncillorswhowish.com',
  'hola.org',
  'ndcertainlywhen.com',
  'portablica.com',
  'grainergamasidnotioned.forum',
  'realintelligence360.com',
  'distribrey.com',
  'myangular.life',
  'getsdk.online',
  'stiven-king.com',
  'a-stiven-king.com',
];

const AD_BLOCK_URL_REGEX =
  /(\/vast(\.xml|\?|$)|\/load-xml\/|\/preroll|\/midroll|\/popunder|\/clickunder|\/adserver|\/adtag|ima3\.js|gpt\.js|adsbygoogle\.js|subid=backfilter|click\?key=|download-free-real|distribrey|myangular|getsdk)/i;

// Universal Subframe Player Bridge (matches Android MainActivity.java + AdBlock + Error Failover)
const SUBFRAME_PLAYER_BRIDGE_JS = `(function(){
  if(window.__cinemaSubframeBridgeInstalled)return;
  window.__cinemaSubframeBridgeInstalled=true;
  try{window.adsConfig=null;Object.defineProperty(window,'adsConfig',{get:function(){return null;},set:function(){},configurable:true});}catch(e){}
  try{if(window.VenomPlayer){var _vm=window.VenomPlayer.make;window.VenomPlayer.make=function(s,o){if(o&&o.ads)delete o.ads;if(o&&o.preroll)delete o.preroll;return _vm?_vm.apply(this,arguments):null;};}}catch(e){}
  var isSubframe=(window!==window.top);
  var audioCtx=null,gainNode=null,hookedVideo=null;
  var preferredLang='ua',langAutoAttempts=0,langAutoSelected=false;
  var fatalReported=false;
  var VOICE_SELECTORS='.b-translators__item, [data-translator_id], .pljs-menu li, [class*="translator"], [class*="voice"], select.pljs-audio option, select[name*="voice"] option, select[name*="audio"] option, [data-voice], .voice-btn, .audio-track-item, [data-audio]';

  // 1. Block popup / tab-under openers & eliminate ugly scrollbars / error borders inside streaming subframes
  if(isSubframe){
    try{window.open=function(){return null;};}catch(e){}
    try{
      var st=document.createElement('style');
      st.textContent='html,body{overflow:hidden!important;margin:0!important;padding:0!important;width:100%!important;height:100%!important;max-width:100vw!important;max-height:100vh!important;background:#000!important;border:none!important;outline:none!important;scrollbar-width:none!important;-ms-overflow-style:none!important;}*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;}[style*="dashed"]{border:none!important;}[id*="ad_"],[id*="ads_"],[class*="ad-banner"],[class*="ads-banner"],[class*="preroll"],[id*="preroll"],.pljs-ads,.vjs-ima-ad-container,.jw-flag-ads .jw-Overlay,a[href*="1xbet"],a[href*="mostbet"],a[href*="melbet"],a[href*="favbet"],a[href*="vavada"],a[href*="pin-up"],a[href*="casino"],iframe[src*="doubleclick"],iframe[src*="exoclick"],iframe[src*="adsterra"]{display:none!important;pointer-events:none!important;opacity:0!important;width:0!important;height:0!important;}';
      (document.head||document.documentElement).appendChild(st);
    }catch(e){}
  }

  function getActiveVideo(){
    var vids=document.querySelectorAll('video');
    for(var i=0;i<vids.length;i++){if(vids[i].readyState>0||vids[i].src||vids[i].currentSrc)return vids[i];}
    return vids[0]||null;
  }
  function getElementCenter(el){
    try{
      var r=el.getBoundingClientRect();
      if(r&&r.width>0&&r.height>0){return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};}
    }catch(e){}
    return {x:30,y:30};
  }
  function scanVoices(){
    var out=[];
    try{
      var nodes=document.querySelectorAll(VOICE_SELECTORS);
      for(var i=0;i<nodes.length&&out.length<24;i++){
        var el=nodes[i];
        var txt=(el.textContent||el.value||'').trim();
        if(txt&&txt.length>1&&txt.length<55){
          var act=el.classList.contains('active')||el.classList.contains('selected')||el.getAttribute('aria-selected')==='true'||Boolean(el.selected);
          out.push({index:i,label:txt,active:act});
        }
      }
    }catch(e){}
    return out;
  }
  var lastTapTimestamp=0;
  function fireFullTapOnElement(el,cx,cy){
    if(!el)return;
    var now=Date.now();
    if(now-lastTapTimestamp<350)return;
    lastTapTimestamp=now;
    if(typeof cx!=='number'||typeof cy!=='number'||(cx<=15&&cy<=15)){
      var pt=getElementCenter(el);
      cx=pt.x;cy=pt.y;
    }
    try{
      var pDown=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerType:'mouse',isPrimary:true});
      var pUp=new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerType:'mouse',isPrimary:true});
      el.dispatchEvent(pDown);
      el.dispatchEvent(pUp);
      if(typeof el.click==='function'){
        try{el.focus();}catch(ex){}
        el.click();
      }else{
        el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:cx,clientY:cy,button:0}));
      }
      if(el.tagName==='OPTION'&&el.parentElement){
        el.parentElement.value=el.value;
        el.parentElement.dispatchEvent(new Event('change',{bubbles:true}));
        el.parentElement.dispatchEvent(new Event('input',{bubbles:true}));
      }
    }catch(e){}
  }

  // 2. Auto-skip video pre-rolls & remove transparent click-hijack overlays
  function sweepAdsAndPreRolls(){
    if(!isSubframe)return;
    try{
      var skipBtns=document.querySelectorAll('.pljs-skip, .vjs-skip-button, .jw-skipIcon, .jw-skip, [class*="skip-ad"], [id*="skip-ad"], [class*="ad-skip"]');
      for(var i=0;i<skipBtns.length;i++){
        var sb=skipBtns[i];
        if(sb&&sb.offsetParent!==null){try{sb.click();}catch(e){}}
      }
      var allBtns=document.querySelectorAll('button, div, span, a');
      for(var b=0;b<allBtns.length&&b<180;b++){
        var txt=(allBtns[b].textContent||'').trim();
        if(txt.length>=4&&txt.length<=28&&/^(пропустить рекламу|пропустити рекламу|skip ad|skip ads|пропустить|пропустити|закрыть рекламу|закрити рекламу)/i.test(txt)){
          try{allBtns[b].click();}catch(e){}
        }
      }
      // Remove invisible full-screen click-hijack anchors (<a target="_blank"> covering viewport)
      var links=document.querySelectorAll('a[target="_blank"]');
      for(var l=0;l<links.length;l++){
        var r=links[l].getBoundingClientRect();
        if(r.width>window.innerWidth*0.6&&r.height>window.innerHeight*0.6&&!links[l].querySelector('video')){
          links[l].style.display='none';
          links[l].style.pointerEvents='none';
        }
      }
    }catch(e){}
  }

  // 3. Detect fatal player errors (themeLoadFailed, Error Code: 233011, 404, video not found, Violation, YT 152)
  function checkFatalPlayerErrors(){
    if(!isSubframe||fatalReported)return;
    try{
      var v=getActiveVideo();
      if(v&&(v.readyState>=2||v.currentTime>0.5||(v.currentSrc&&v.duration>0)))return;
      var bodyTxt=(document.body&&(document.body.innerText||document.body.textContent)||'').slice(0,2200);
      if(!bodyTxt)return;
      var fatalMatch=bodyTxt.match(/themeLoadFailed|не удалось загрузить тему|themeWrongVersion|Error Code:\s*233011|Error Code:\s*232\d+|Error Code:\s*102630|This video file cannot be played|Video not found|File not found|Відео не знайдено|Видео не найдено|Файл не найден|запрашиваемый контент не найден|контент не найден|приносим свои извинения|недоступно у вашому регіоні|not available in your country|"detail"\s*:\s*"Violation|Код помилки:\s*15\d|Video unavailable|502 Bad Gateway|503 Service Temporarily Unavailable/i);
      if(fatalMatch){
        fatalReported=true;
        window.__cinemaFatalReason=fatalMatch[0];
        try{if(document.body){document.body.style.opacity='0';document.body.style.border='none';}}catch(ex){}
        var msg={
          __cinemaPlayerBridge:true,
          type:'subframeFatalError',
          reason:fatalMatch[0],
          href:window.location.href
        };
        try{window.top.postMessage(msg,'*');}catch(ex){}
        try{if(window.parent&&window.parent!==window.top)window.parent.postMessage(msg,'*');}catch(ex){}
      }
    }catch(e){}
  }

  var autoPlayAttempts=0;
  function tryAutoStartVideo(){
    if(!isSubframe||fatalReported||autoPlayAttempts>=5)return;
    autoPlayAttempts++;
    try{
      var v=getActiveVideo();
      if(v){
        if(!v.paused&&v.currentTime>0.2){autoPlayAttempts=99;return;}
        if(v.paused&&v.currentTime<0.5){
          v.play().catch(function(){});
          var bigPlay=document.querySelector('.vjs-big-play-button, .pljs-play, .jw-icon-display, [class*="big-play"], button[aria-label="Play" i]');
          if(bigPlay&&bigPlay.offsetParent!==null){try{bigPlay.click();}catch(ex){}}
        }
      }
    }catch(e){}
  }

  function getLangRegex(lang){
    if(lang==='en')return /(eng|english|original|оригінал|оригинал|🇬🇧|🇺🇸)/i;
    if(lang==='pl')return /(pol|polski|lektor|napisy|🇵🇱|\bpl\b)/i;
    if(lang==='es')return /(esp|español|espanol|latino|castellano|🇪🇸|\bes\b)/i;
    if(lang==='ru')return /(рус|rus|дубляж|lostfilm|hdrezka|red head|jaskier)/i;
    return /(укр|ukr|ua\b|укра|дубляж|ashdi|дніпро|dnipro|толока|бабай|так треба|постмодерн)/i;
  }

  function tryAutoSelectPreferredVoice(){
    if(!preferredLang||langAutoSelected||langAutoAttempts>12)return;
    langAutoAttempts++;
    try{
      var rx=getLangRegex(preferredLang);
      var vList=scanVoices();
      if(vList&&vList.length>0){
        var activeMatches=vList.some(function(v){return v.active&&rx.test(v.label);});
        if(activeMatches){langAutoSelected=true;return;}
        for(var j=0;j<vList.length;j++){
          if(rx.test(vList[j].label)){
            var allNodes=document.querySelectorAll(VOICE_SELECTORS);
            var targetNode=null;
            for(var k=0;k<allNodes.length;k++){
              if((allNodes[k].textContent||allNodes[k].value||'').trim()===vList[j].label){targetNode=allNodes[k];break;}
            }
            if(!targetNode&&allNodes[vList[j].index])targetNode=allNodes[vList[j].index];
            if(targetNode){
              langAutoSelected=true;
              fireFullTapOnElement(targetNode);
              if(preferredLang==='ua'){
                try{window.top.postMessage({__cinemaPlayerBridge:true,type:'uaVoiceAutoActivated',label:vList[j].label},'*');}catch(e){}
              }
              return;
            }
          }
        }
      }
    }catch(e){}
  }

  function scanQualities(){
    var out=[];
    try{
      var nodes=document.querySelectorAll('[data-quality], .pljs-quality li, [class*="quality"] li, [class*="quality"] div');
      for(var i=0;i<nodes.length&&out.length<8;i++){
        var txt=(nodes[i].textContent||'').trim();
        if(/^(4K|2160p?|1440p?|1080p?|720p?|480p?|360p?)$/i.test(txt)&&out.indexOf(txt)===-1)out.push(txt);
      }
    }catch(e){}
    return out;
  }
  function reportState(){
    if(!isSubframe)return;
    var v=getActiveVideo();
    if(!v)return;
    var bufEnd=0;
    try{if(v.buffered&&v.buffered.length>0)bufEnd=v.buffered.end(v.buffered.length-1);}catch(e){}
    try{
      window.top.postMessage({
        __cinemaPlayerBridge:true,
        type:'videoState',
        currentTime:v.currentTime||0,
        duration:v.duration||0,
        paused:Boolean(v.paused),
        muted:Boolean(v.muted),
        volume:typeof v.volume==='number'?v.volume:1,
        playbackRate:v.playbackRate||1,
        bufferedEnd:bufEnd,
        voices:scanVoices(),
        qualities:scanQualities()
      },'*');
    }catch(e){}
  }
  if(isSubframe){
    setInterval(function(){
      sweepAdsAndPreRolls();
      checkFatalPlayerErrors();
      var v=getActiveVideo();
      if(v&&!v.__cinemaHooked){
        v.__cinemaHooked=true;
        v.addEventListener('timeupdate',reportState);
        v.addEventListener('loadedmetadata',reportState);
        v.addEventListener('play',reportState);
        v.addEventListener('pause',reportState);
      }
      tryAutoStartVideo();
      tryAutoSelectPreferredVoice();
      if(v)reportState();
    },650);
  }
  window.addEventListener('message',function(ev){
    var d=ev.data;
    if(!d||typeof d!=='object'||!d.__cinemaCmd)return;
    var cmd=d.__cinemaCmd;
    var subFrames=document.querySelectorAll('iframe');
    if(cmd!=='clickAt'&&cmd!=='hoverAt'){
      for(var f=0;f<subFrames.length;f++){try{subFrames[f].contentWindow.postMessage(d,'*');}catch(e){}}
    }
    if(cmd==='hoverAt'){
      var hx=Math.round((d.normX||0.5)*window.innerWidth);
      var hy=Math.round((d.normY||0.5)*window.innerHeight);
      var hEl=document.elementFromPoint(hx,hy);
      if(hEl&&hEl.tagName==='IFRAME'){
        var hr=hEl.getBoundingClientRect();
        if(hr.width>0&&hr.height>0){
          try{hEl.contentWindow.postMessage({__cinemaCmd:'hoverAt',normX:(hx-hr.left)/hr.width,normY:(hy-hr.top)/hr.height},'*');}catch(e){}
        }
        return;
      }
      if(hEl){
        hEl.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:hx,clientY:hy}));
        hEl.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:hx,clientY:hy}));
      }
      return;
    }
    if(cmd==='clickAt'){
      var cx=Math.round((d.normX||0.5)*window.innerWidth);
      var cy=Math.round((d.normY||0.5)*window.innerHeight);
      var cEl=document.elementFromPoint(cx,cy);
      if(!cEl)return;
      if(cEl.tagName==='IFRAME'){
        var cr=cEl.getBoundingClientRect();
        if(cr.width>0&&cr.height>0){
          try{cEl.contentWindow.postMessage({__cinemaCmd:'clickAt',normX:(cx-cr.left)/cr.width,normY:(cy-cr.top)/cr.height},'*');}catch(e){}
        }
        return;
      }
      fireFullTapOnElement(cEl,cx,cy);
      return;
    }
    var v=getActiveVideo();
    if(cmd==='togglePlay'){
      if(v){if(v.paused)v.play().catch(function(){});else v.pause();reportState();}
      var toggleBtn=document.querySelector('.vjs-play-control, .pljs-play, [class*="play-pause"], [class*="play_pause"], button[aria-label*="play" i], button[aria-label*="pause" i], .jw-icon-playback');
      if(toggleBtn)try{toggleBtn.click();}catch(e){}
    }
    else if(cmd==='play'){
      if(v){v.play().catch(function(){});reportState();}
      var startBtn=document.querySelector('.vjs-play-control.vjs-paused, .pljs-play, button[aria-label*="play" i], .vjs-big-play-button');
      if(startBtn)try{startBtn.click();}catch(e){}
    }
    else if(cmd==='pause'){
      if(v){v.pause();reportState();}
      var stopBtn=document.querySelector('.vjs-play-control.vjs-playing, .pljs-pause, button[aria-label*="pause" i]');
      if(stopBtn)try{stopBtn.click();}catch(e){}
    }
    else if(cmd==='seekBy'&&v){var dur=v.duration||99999;v.currentTime=Math.max(0,Math.min(dur,(v.currentTime||0)+(Number(d.delta)||0)));reportState();}
    else if(cmd==='seekToPercent'&&v){if(v.duration>0)v.currentTime=Math.max(0,Math.min(v.duration,(Number(d.percent)||0)*v.duration));else if(d.time)v.currentTime=Number(d.time);reportState();}
    else if(cmd==='toggleMute'&&v){v.muted=typeof d.muted==='boolean'?d.muted:!v.muted;reportState();}
    else if(cmd==='setSpeed'&&v){v.playbackRate=Number(d.rate)||1.0;reportState();}
    else if(cmd==='setAspect'&&v){
      var m=d.mode||'contain';
      v.style.objectFit=(m==='cover')?'cover':(m==='fill')?'fill':'contain';
      v.style.transform=(m==='zoom115')?'scale(1.15)':'none';
    }
    else if(cmd==='setAudioBoost'&&v){
      try{
        var g=Number(d.gain)||1.0;
        if(!audioCtx||hookedVideo!==v){
          var AC=window.AudioContext||window.webkitAudioContext;
          if(AC){
            audioCtx=new AC();
            var src=audioCtx.createMediaElementSource(v);
            gainNode=audioCtx.createGain();
            src.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            hookedVideo=v;
          }
        }
        if(gainNode&&audioCtx){if(audioCtx.state==='suspended')audioCtx.resume();gainNode.gain.value=g;}
      }catch(e){}
    }
    else if(cmd==='selectInternalVoice'){
      var vNodes=document.querySelectorAll(VOICE_SELECTORS);
      var target=null;
      var targetLabel=(d.label||'').trim().toLowerCase();
      if(targetLabel){
        for(var vi=0;vi<vNodes.length;vi++){
          var nTxt=(vNodes[vi].textContent||vNodes[vi].value||'').trim().toLowerCase();
          if(nTxt===targetLabel||(targetLabel.length>3&&nTxt.indexOf(targetLabel)!==-1)){
            target=vNodes[vi];break;
          }
        }
      }
      if(!target&&typeof d.index==='number'&&vNodes[d.index]){target=vNodes[d.index];}
      if(target){
        try{target.scrollIntoView({block:'nearest',inline:'nearest'});}catch(e){}
        fireFullTapOnElement(target);
      }
    }
    else if(cmd==='preferLanguage'){
      if(d.lang){
        preferredLang=String(d.lang).toLowerCase();
        langAutoAttempts=0;
        langAutoSelected=false;
        tryAutoSelectPreferredVoice();
      }
    }
    else if(cmd==='selectInternalQuality'){
      var qTarget=String(d.quality||'').toLowerCase();
      var qNodes=document.querySelectorAll('[data-quality], .pljs-quality li, [class*="quality"] li, [class*="quality"] div, li, button, span');
      for(var qi=0;qi<qNodes.length;qi++){
        var qt=(qNodes[qi].textContent||'').trim().toLowerCase();
        if(qt===qTarget||(qTarget==='4k'&&(qt==='2160p'||qt==='4k'||qt==='2160'))||(qTarget==='1080p'&&(qt==='1080p'||qt==='1080'))){
          fireFullTapOnElement(qNodes[qi]);break;
        }
      }
    }
    else if(cmd==='openInternalMenu'){
      var gear=document.querySelector('[class*="setting"], [class*="gear"], [class*="cog"], .pljs-settings, .vjs-subs-caps-button, .jw-icon-settings');
      if(gear)fireFullTapOnElement(gear,10,10);
      else if(v)fireFullTapOnElement(v,window.innerWidth*0.5,window.innerHeight*0.5);
    }
  });
  window.addEventListener('keydown',function(e){
    if(e.key==='Escape'||e.keyCode===27){
      try{window.top.postMessage({type:'cinema-bridge-back'},'*');}catch(ex){}
    }
  },true);
})();`;

let mainWindow = null;
let localServer = null;
let localServerUrl = null;
let pendingDeepLinkUrl = null;

function extractDeepLinkFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (const arg of argv) {
    if (
      typeof arg === 'string' &&
      (arg.startsWith('cinemavault://') ||
        (arg.includes('vinegret.net') &&
          (arg.includes('cv_movie=') || arg.includes('cv_sync='))))
    ) {
      return arg;
    }
  }
  return null;
}

function forwardDeepLinkToRenderer(url) {
  if (!url || typeof url !== 'string') return;
  pendingDeepLinkUrl = url;
  if (mainWindow && !mainWindow.isDestroyed()) {
    const safeUrl = JSON.stringify(url);
    mainWindow.webContents
      .executeJavaScript(
        `window.__cinemaPendingDeepLink = ${safeUrl}; if (typeof window.__cinemaHandleDeepLink === 'function') { window.__cinemaHandleDeepLink(${safeUrl}); }`,
        true
      )
      .catch(() => {});
  }
}

try {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('cinemavault', process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient('cinemavault');
  }
} catch {}

app.on('open-url', (event, url) => {
  event.preventDefault();
  forwardDeepLinkToRenderer(url);
});

/**
 * Starts a local static HTTP server serving ../dist on 127.0.0.1.
 * Ensures YouTube embeds, Kinobox, HDRezka, Ashdi, and root-relative assets
 * (/cinemavault-logo.svg, /kinobox-player.html) always have a valid HTTP origin.
 */
function startLocalStaticServer() {
  return new Promise((resolve) => {
    const distDir = path.join(__dirname, '../dist');
    const server = http.createServer((req, res) => {
      try {
        const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
        let pathname = decodeURIComponent(parsedUrl.pathname);
        if (pathname === '/' || pathname === '') {
          pathname = '/index.html';
        }

        // Prevent directory traversal
        const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
        let filePath = path.join(distDir, safePath);

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const data = fs.readFileSync(filePath);

        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
      }
    });

    const candidatePorts = [45780, 45781, 45782, 0];
    let portIdx = 0;

    function tryListen() {
      if (portIdx >= candidatePorts.length) {
        resolve(null);
        return;
      }
      const port = candidatePorts[portIdx++];
      server.once('error', () => {
        tryListen();
      });
      server.listen(port, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object' && addr.port) {
          localServer = server;
          localServerUrl = `http://127.0.0.1:${addr.port}`;
          resolve(localServerUrl);
        } else {
          resolve(null);
        }
      });
    }

    tryListen();
  });
}

function setupNetworkInterceptors() {
  const ses = session.defaultSession;
  ses.setUserAgent(CLEAN_USER_AGENT);

  const requestOrigins = new Map();

  // 1. Network-level AdBlock & Tracker Shield (blocks popunders, casino banners, VAST pre-rolls)
  ses.webRequest.onBeforeRequest((details, callback) => {
    try {
      const urlLower = (details.url || '').toLowerCase();
      // Never block actual video segments, playlists, subtitles, or localhost
      if (
        urlLower.startsWith('http://127.0.0.1') ||
        urlLower.startsWith('http://localhost') ||
        urlLower.startsWith('file://') ||
        urlLower.startsWith('devtools://') ||
        urlLower.includes('.m3u8') ||
        urlLower.includes('.mp4') ||
        urlLower.includes('.m4s') ||
        urlLower.includes('.ts?') ||
        urlLower.endsWith('.ts') ||
        urlLower.includes('.vtt') ||
        urlLower.includes('.srt')
      ) {
        callback({ cancel: false });
        return;
      }

      const parsed = new URL(details.url);
      const host = parsed.hostname.toLowerCase();

      const isBlockedDomain = AD_BLOCK_DOMAINS.some(
        (domain) => host === domain || host.endsWith(`.${domain}`)
      );
      if (isBlockedDomain || AD_BLOCK_URL_REGEX.test(urlLower)) {
        callback({ cancel: true });
        return;
      }
    } catch (err) {
      // Ignore URL parse errors
    }
    callback({ cancel: false });
  });

  // 2. Clean User-Agent & smart Referer/Origin for streaming CDNs, sports embeds, and YouTube
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    requestHeaders['User-Agent'] = CLEAN_USER_AGENT;

    let incomingOrigin = '';
    for (const k of Object.keys(requestHeaders)) {
      if (k.toLowerCase() === 'origin' && requestHeaders[k]) {
        incomingOrigin = String(requestHeaders[k]);
        break;
      }
    }

    try {
      const targetUrl = new URL(details.url);
      const host = targetUrl.hostname.toLowerCase();
      const isLocal = host === '127.0.0.1' || host === 'localhost';

      if (!isLocal) {
        let existingReferer = '';
        for (const k of Object.keys(requestHeaders)) {
          if (k.toLowerCase() === 'referer') {
            existingReferer = String(requestHeaders[k] || '');
            break;
          }
        }
        const hasLocalOrEmptyReferer =
          !existingReferer ||
          existingReferer.includes('127.0.0.1') ||
          existingReferer.includes('localhost') ||
          existingReferer.startsWith('file:');

        const hasLocalOrigin =
          incomingOrigin.includes('127.0.0.1') ||
          incomingOrigin.includes('localhost') ||
          incomingOrigin.startsWith('file:') ||
          incomingOrigin === 'null';

        if (
          host.includes('youtube.com') ||
          host.includes('youtube-nocookie.com') ||
          host.includes('googlevideo.com')
        ) {
          if (hasLocalOrEmptyReferer) {
            requestHeaders['Referer'] = 'https://vinegret.net/';
          }
          if (hasLocalOrigin) {
            for (const k of Object.keys(requestHeaders)) {
              if (k.toLowerCase() === 'origin') delete requestHeaders[k];
            }
          }
        } else if (host.includes('ashdi')) {
          if (hasLocalOrEmptyReferer) {
            requestHeaders['Referer'] = 'https://uakino.best/';
          }
          if (hasLocalOrigin) {
            requestHeaders['Origin'] = 'https://uakino.best';
          }
        } else if (host.includes('strmfree')) {
          // strmfree.st returns 403 Violation when Referer/Origin is strmfree.st itself; use external embedder referer
          requestHeaders['Referer'] = 'https://vinegret.net/';
          for (const k of Object.keys(requestHeaders)) {
            if (k.toLowerCase() === 'origin') delete requestHeaders[k];
          }
        } else if (
          host.includes('streamed') ||
          host.includes('embedme') ||
          host.includes('embedsports') ||
          host.includes('vipstreams')
        ) {
          if (hasLocalOrEmptyReferer) {
            requestHeaders['Referer'] = 'https://streamed.su/';
          }
          if (hasLocalOrigin) {
            requestHeaders['Origin'] = 'https://streamed.su';
          }
        } else if (
          hasLocalOrEmptyReferer &&
          (host.includes('rezka') ||
            host.includes('rezkify') ||
            host.includes('hdrezka') ||
            host.includes('loadbox') ||
            host.includes('namy') ||
            host.includes('embess') ||
            host.includes('voidboost') ||
            host.includes('kinobox') ||
            host.includes('kodik') ||
            host.includes('alloha') ||
            host.includes('vidsrc') ||
            host.includes('vidlink') ||
            host.includes('videasy') ||
            host.includes('autoembed') ||
            host.includes('multiembed') ||
            host.includes('embed.su') ||
            host.includes('2embed') ||
            host.includes('vidfast'))
        ) {
          requestHeaders['Referer'] = `${targetUrl.protocol}//${targetUrl.host}/`;
          if (hasLocalOrigin) {
            requestHeaders['Origin'] = `${targetUrl.protocol}//${targetUrl.host}`;
          }
        }
      }
    } catch (err) {
      // Ignore malformed URLs
    }

    // Track final outgoing Origin for clean CORS reflection in onHeadersReceived
    for (const k of Object.keys(requestHeaders)) {
      if (k.toLowerCase() === 'origin' && requestHeaders[k]) {
        requestOrigins.set(details.id, String(requestHeaders[k]));
        if (requestOrigins.size > 2000) {
          const firstKey = requestOrigins.keys().next().value;
          requestOrigins.delete(firstKey);
        }
        break;
      }
    }

    callback({ requestHeaders });
  });

  // 3. Strip X-Frame-Options / CSP and deduplicate CORS headers (fixes themeLoadFailed & JWPlayer 233011)
  ses.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...(details.responseHeaders || {}) };
    const reqOrigin = requestOrigins.get(details.id);
    requestOrigins.delete(details.id);

    for (const key of Object.keys(responseHeaders)) {
      const lower = key.toLowerCase();
      if (
        lower === 'x-frame-options' ||
        lower === 'content-security-policy' ||
        lower === 'content-security-policy-report-only' ||
        lower === 'cross-origin-embedder-policy' ||
        lower === 'cross-origin-opener-policy' ||
        lower === 'cross-origin-resource-policy' ||
        lower === 'access-control-allow-origin' ||
        lower === 'access-control-allow-credentials' ||
        lower === 'access-control-allow-methods' ||
        lower === 'access-control-allow-headers' ||
        lower === 'access-control-expose-headers'
      ) {
        delete responseHeaders[key];
      }
    }

    try {
      const targetUrl = new URL(details.url);
      const host = targetUrl.hostname.toLowerCase();
      const isLocal = host === '127.0.0.1' || host === 'localhost';
      if (!isLocal) {
        if (reqOrigin && reqOrigin !== 'null') {
          responseHeaders['access-control-allow-origin'] = [reqOrigin];
          responseHeaders['access-control-allow-credentials'] = ['true'];
        } else {
          responseHeaders['access-control-allow-origin'] = ['*'];
        }
        responseHeaders['access-control-allow-methods'] = [
          'GET, POST, PUT, DELETE, OPTIONS, HEAD',
        ];
        responseHeaders['access-control-allow-headers'] = ['*'];
        responseHeaders['access-control-expose-headers'] = ['*'];
      }
    } catch (err) {
      // Ignore
    }

    callback({ responseHeaders });
  });
}

function setupIpcHandlers() {
  ipcMain.on('cinema-set-fullscreen', (_event, fullscreen) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setFullScreen(Boolean(fullscreen));
    }
  });

  ipcMain.on('cinema-simulate-tap', (_event, normX, normY) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const bounds = mainWindow.getContentBounds();
    const x = Math.round(Math.max(0, Math.min(1, Number(normX) || 0.5)) * bounds.width);
    const y = Math.round(Math.max(0, Math.min(1, Number(normY) || 0.5)) * bounds.height);
    try {
      mainWindow.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
        }
      }, 45);
    } catch (err) {
      // Ignore
    }
  });

  ipcMain.on('cinema-open-external', (_event, url) => {
    if (
      typeof url === 'string' &&
      (url.startsWith('http://') ||
        url.startsWith('https://') ||
        url.startsWith('mailto:') ||
        url.startsWith('viber:'))
    ) {
      shell.openExternal(url).catch(() => {});
    }
  });

  ipcMain.on('cinema-get-device-telemetry', (event) => {
    try {
      event.returnValue = JSON.stringify(getDesktopTelemetryObject());
    } catch {
      event.returnValue = '';
    }
  });

  ipcMain.on('cinema-download-update', (_event, url) => {
    if (typeof url !== 'string' || !url.trim()) return;
    let targetUrl = url.trim();
    // On desktop, map .apk download links to the corresponding desktop installer on GitHub Releases
    if (targetUrl.toLowerCase().endsWith('.apk')) {
      const verMatch = targetUrl.match(/v?(\d+\.\d+\.\d+)/i);
      const ver = verMatch ? verMatch[1] : '3.7.4';
      if (process.platform === 'darwin') {
        targetUrl = `https://github.com/zod4ix/cinemavault-android/releases/download/v${ver}/CinemaVault-PRO-v${ver}-macOS.dmg`;
      } else {
        targetUrl = `https://github.com/zod4ix/cinemavault-android/releases/download/v${ver}/CinemaVault-PRO-v${ver}-Windows.exe`;
      }
    }
    downloadAndInstallDesktopUpdate(targetUrl);
  });
}

let isDownloadingDesktopUpdate = false;

function notifyDesktopUpdateProgress(status, percent, message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const safeMsg = JSON.stringify(String(message || ''));
    mainWindow.webContents
      .executeJavaScript(
        `if(window.__cinemaOnApkDownloadProgress){window.__cinemaOnApkDownloadProgress(${JSON.stringify(status)}, ${Number(percent) || 0}, ${safeMsg});}`,
        true
      )
      .catch(() => {});
  } catch {
    // ignore
  }
}

function downloadAndInstallDesktopUpdate(initialUrl) {
  if (isDownloadingDesktopUpdate) {
    notifyDesktopUpdateProgress('downloading', 50, '⏳ Оновлення вже завантажується...');
    return;
  }
  isDownloadingDesktopUpdate = true;

  const isMac = process.platform === 'darwin';
  const ext = isMac ? '.dmg' : '.exe';
  const destPath = path.join(os.tmpdir(), `CinemaVault-PRO-Update${ext}`);
  try {
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
  } catch {
    // ignore
  }

  notifyDesktopUpdateProgress('downloading', 1, 'Підключення до сервера оновлень GitHub...');

  function followAndDownload(currentUrl, redirectCount) {
    if (redirectCount > 8) {
      isDownloadingDesktopUpdate = false;
      notifyDesktopUpdateProgress('error', 0, 'Забагато перенаправлень. Відкриваю у браузері...');
      shell.openExternal(initialUrl).catch(() => {});
      return;
    }

    const req = https.get(
      currentUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; CinemaVault-PRO-Desktop-Updater)',
          Accept: 'application/octet-stream,*/*',
        },
        timeout: 25000,
      },
      (res) => {
        const code = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, currentUrl).toString();
          followAndDownload(nextUrl, redirectCount + 1);
          return;
        }

        if (code < 200 || code >= 400) {
          res.resume();
          isDownloadingDesktopUpdate = false;
          notifyDesktopUpdateProgress(
            'error',
            0,
            `Помилка сервера (HTTP ${code}). Відкриваю завантаження у браузері...`
          );
          shell.openExternal(initialUrl).catch(() => {});
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10) || 120 * 1024 * 1024;
        let downloaded = 0;
        let lastNotify = 0;
        const fileStream = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          const now = Date.now();
          if (now - lastNotify >= 200) {
            lastNotify = now;
            const pct = Math.max(2, Math.min(99, Math.round((downloaded * 100) / totalBytes)));
            const mbDone = (downloaded / (1024 * 1024)).toFixed(1);
            const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
            notifyDesktopUpdateProgress(
              'downloading',
              pct,
              `Завантаження оновлення ${isMac ? 'macOS' : 'Windows'}: ${pct}% (${mbDone} / ${mbTotal} МБ)`
            );
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            isDownloadingDesktopUpdate = false;
            try {
              const stat = fs.statSync(destPath);
              if (!stat || stat.size < 5 * 1024 * 1024) {
                throw new Error('Incomplete installer binary');
              }

              notifyDesktopUpdateProgress(
                'installing',
                100,
                `Завантаження завершено (100%). Запуск інсталятора оновлення...`
              );

              if (isMac) {
                shell.openPath(destPath).catch(() => {});
                notifyDesktopUpdateProgress('ready', 100, 'Образ оновлення відкрито!');
              } else {
                const child = spawn(destPath, [], {
                  detached: true,
                  stdio: 'ignore',
                });
                child.unref();
                notifyDesktopUpdateProgress(
                  'ready',
                  100,
                  'Інсталятор Windows запущено! Зараз програма закриється для оновлення...'
                );
                setTimeout(() => {
                  app.quit();
                }, 1400);
              }
            } catch (err) {
              notifyDesktopUpdateProgress(
                'error',
                0,
                'Не вдалося запустити інсталятор автоматично. Відкриваю у браузері...'
              );
              shell.openExternal(initialUrl).catch(() => {});
            }
          });
        });

        fileStream.on('error', () => {
          isDownloadingDesktopUpdate = false;
          notifyDesktopUpdateProgress('error', 0, 'Помилка запису файлу оновлення.');
          shell.openExternal(initialUrl).catch(() => {});
        });
      }
    );

    req.on('error', () => {
      isDownloadingDesktopUpdate = false;
      notifyDesktopUpdateProgress(
        'error',
        0,
        'Помилка мережі при завантаженні. Відкриваю у браузері...'
      );
      shell.openExternal(initialUrl).catch(() => {});
    });
  }

  followAndDownload(initialUrl, 0);
}

function getDesktopTelemetryObject() {
  let deviceId = '';
  let installedAt = Date.now();
  let isFirstInstall = false;

  try {
    const stateFile = path.join(app.getPath('userData'), 'device-telemetry.json');
    if (fs.existsSync(stateFile)) {
      const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (saved && saved.deviceId) {
        deviceId = saved.deviceId;
        installedAt = saved.installedAt || installedAt;
      }
    }
    if (!deviceId) {
      isFirstInstall = true;
      const hwSeed = `${os.hostname()}|${os.userInfo().username}|${os.arch()}|${os.platform()}|cinemavault_desktop`;
      const hash = crypto.createHash('sha256').update(hwSeed).digest('hex').slice(0, 16);
      deviceId = `cv-${process.platform === 'darwin' ? 'mac' : 'win'}-${hash}`;
      fs.writeFileSync(
        stateFile,
        JSON.stringify({ deviceId, installedAt, updatedAt: Date.now() }, null, 2),
        'utf8'
      );
    }
  } catch {
    deviceId = `cv-win-fallback`;
  }

  const release = os.release() || ''; // e.g. "10.0.22631" or "10.0.26100"
  const rawVer = typeof os.version === 'function' ? os.version() : ''; // e.g. "Windows 11 Pro"
  const arch = os.arch() || 'x64';
  const cpus = os.cpus() || [];
  const cpuModel = (cpus[0] && cpus[0].model ? cpus[0].model : 'x64 Processor')
    .replace(/\s+/g, ' ')
    .trim();
  const ramGb = Math.max(1, Math.round(os.totalmem() / (1024 * 1024 * 1024)));

  if (process.platform === 'darwin') {
    return {
      deviceId,
      platform: 'macos',
      osName: 'macOS',
      osVersion: `macOS (${release}, ${arch})`,
      osBuild: release,
      deviceType: 'Mac / MacBook',
      manufacturer: 'Apple',
      model: `${cpuModel} (${ramGb} GB RAM)`,
      arch,
      appVersion: '3.7.4',
      isFirstInstall,
      installedAt,
    };
  }

  // Accurate Windows 11 vs Windows 10 vs Windows 8.1/7 detection
  const parts = release.split('.');
  const major = parseInt(parts[0] || '10', 10);
  const minor = parseInt(parts[1] || '0', 10);
  const build = parseInt(parts[2] || '0', 10);

  let osName = 'Windows 10';
  let featureUpdate = '';
  if (major === 10 && build >= 22000) {
    osName = 'Windows 11';
    if (build >= 26100) featureUpdate = '24H2';
    else if (build >= 22631) featureUpdate = '23H2';
    else if (build >= 22621) featureUpdate = '22H2';
    else featureUpdate = '21H2';
  } else if (major === 10) {
    osName = 'Windows 10';
    if (build >= 19045) featureUpdate = '22H2';
    else if (build >= 19044) featureUpdate = '21H2';
    else if (build >= 19041) featureUpdate = '2004+';
  } else if (major === 6 && minor === 3) {
    osName = 'Windows 8.1';
  } else if (major === 6 && minor === 2) {
    osName = 'Windows 8';
  } else if (major === 6 && minor === 1) {
    osName = 'Windows 7';
  }

  const editionClean = rawVer && /Windows/i.test(rawVer) ? rawVer.trim() : osName;
  const osVersion = `${editionClean}${featureUpdate ? ` ${featureUpdate}` : ''} (Build ${build || release}, ${arch})`;
  const cpuBrand = /AMD/i.test(cpuModel)
    ? 'AMD PC'
    : /Intel/i.test(cpuModel)
      ? 'Intel PC'
      : 'Windows PC';

  return {
    deviceId,
    platform: 'windows',
    osName,
    osVersion,
    osBuild: release,
    deviceType: 'ПК / Ноутбук Windows',
    manufacturer: cpuBrand,
    model: `${cpuModel} (${ramGb} GB RAM)`,
    arch,
    appVersion: '3.7.4',
    isFirstInstall,
    installedAt,
  };
}

function isTrustedExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return TRUSTED_EXTERNAL_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch (err) {
    return false;
  }
}

async function createWindow() {
  const isVerifyMode = process.argv.includes('--verify-launch');
  const winIconFile =
    process.platform === 'win32' && fs.existsSync(path.join(__dirname, 'icon.ico'))
      ? 'icon.ico'
      : 'icon.png';

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    show: !isVerifyMode,
    backgroundColor: '#07090e',
    title: 'CinemaVault PRO v3.7.4',
    icon: path.join(__dirname, winIconFile),
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      sandbox: false,
    },
  });

  // Block ad popups from streaming balancers; open legitimate links in OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedExternalUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  // Protect main window from rogue top-frame redirects triggered by third-party embeds
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      const isLocal =
        parsed.protocol === 'file:' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === 'localhost';
      if (!isLocal) {
        event.preventDefault();
        if (isTrustedExternalUrl(url)) {
          shell.openExternal(url).catch(() => {});
        }
      }
    } catch (err) {
      event.preventDefault();
    }
  });

  const reportedFrameErrors = new Set();

  const injectSubframeBridgeAll = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const mainFrame = mainWindow.webContents.mainFrame;
      const allFrames = mainFrame.framesInSubtree;
      for (const frame of allFrames) {
        if (!frame || frame.isDestroyed() || frame === mainFrame) continue;
        const fUrl = frame.url || '';
        if (!fUrl.startsWith('http://') && !fUrl.startsWith('https://')) continue;
        frame.executeJavaScript(SUBFRAME_PLAYER_BRIDGE_JS, true).catch(() => {});
        frame
          .executeJavaScript('window.__cinemaFatalReason || ""', true)
          .then((reason) => {
            if (reason && typeof reason === 'string' && !mainWindow.isDestroyed()) {
              const frameKey = `${frame.routingId}:${fUrl}:${reason}`;
              if (!reportedFrameErrors.has(frameKey)) {
                reportedFrameErrors.add(frameKey);
                const safeReason = JSON.stringify(reason);
                mainFrame
                  .executeJavaScript(
                    `window.postMessage({ __cinemaPlayerBridge: true, type: 'subframeFatalError', reason: ${safeReason} }, '*');`,
                    true
                  )
                  .catch(() => {});
              }
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      // Ignore frame injection errors on destroyed frames
    }
  };

  const bridgeWatchdogInterval = setInterval(injectSubframeBridgeAll, 1100);
  mainWindow.on('closed', () => {
    clearInterval(bridgeWatchdogInterval);
  });

  // Inject Universal Subframe Player Bridge into main frame and all streaming subframes
  mainWindow.webContents.on('dom-ready', injectSubframeBridgeAll);
  mainWindow.webContents.on('did-frame-finish-load', injectSubframeBridgeAll);

  // Auto-failover when a streaming iframe fails to load (timeout, DNS/TLS error, connection refused)
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame || errorCode === -3 || !mainWindow || mainWindow.isDestroyed()) return;
      if (
        typeof validatedURL === 'string' &&
        (validatedURL.startsWith('http://') || validatedURL.startsWith('https://'))
      ) {
        const failKey = `fail:${validatedURL}:${errorCode}`;
        if (!reportedFrameErrors.has(failKey)) {
          reportedFrameErrors.add(failKey);
          const safeReason = JSON.stringify(errorDescription || `ERR_${errorCode}`);
          mainWindow.webContents.mainFrame
            .executeJavaScript(
              `window.postMessage({ __cinemaPlayerBridge: true, type: 'subframeFatalError', reason: ${safeReason} }, '*');`,
              true
            )
            .catch(() => {});
        }
      }
    }
  );

  // Keyboard shortcuts (F11 fullscreen toggle, Ctrl+Shift+I DevTools in debug)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && mainWindow && !mainWindow.isDestroyed()) {
      if (input.key === 'F11') {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        event.preventDefault();
      } else if (input.key === 'Escape' && mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
      }
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    await mainWindow.loadURL('http://localhost:3000');
  } else {
    const serverUrl = localServerUrl || (await startLocalStaticServer());
    if (serverUrl) {
      await mainWindow.loadURL(serverUrl);
    } else {
      await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  }

  const initialDeepLink = pendingDeepLinkUrl || extractDeepLinkFromArgv(process.argv);
  if (initialDeepLink) {
    setTimeout(() => forwardDeepLinkToRenderer(initialDeepLink), 700);
  }

  if (isVerifyMode) {
    setTimeout(async () => {
      try {
        const verifyData = await mainWindow.webContents.executeJavaScript(`
          (function() {
            var root = document.getElementById('root');
            return {
              url: window.location.href,
              title: document.title,
              hasBridge: Boolean(window.AndroidCinemaBridge),
              rootHtmlLength: root ? root.innerHTML.length : 0,
              textSample: document.body ? document.body.innerText.slice(0, 300) : ''
            };
          })()
        `);
        const outPath =
          process.env.CINEMA_VERIFY_OUT ||
          path.join(path.dirname(process.execPath), 'verify-result.json');
        fs.writeFileSync(outPath, JSON.stringify({ ok: true, ...verifyData }, null, 2), 'utf-8');
      } catch (err) {
        const outPath =
          process.env.CINEMA_VERIFY_OUT ||
          path.join(path.dirname(process.execPath), 'verify-result.json');
        fs.writeFileSync(
          outPath,
          JSON.stringify({ ok: false, error: String(err) }, null, 2),
          'utf-8'
        );
      } finally {
        app.quit();
      }
    }, 3500);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock (skip in --verify-launch mode so test runs never collide)
const isVerifyLaunch = process.argv.includes('--verify-launch');
const gotTheLock = isVerifyLaunch ? true : app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const dl = extractDeepLinkFromArgv(commandLine);
    if (dl) {
      forwardDeepLinkToRenderer(dl);
    }
  });

  app.whenReady().then(async () => {
    try {
      app.configureHostResolver({
        enableBuiltInResolver: true,
        secureDnsMode: 'automatic',
        secureDnsServers: [
          'https://cloudflare-dns.com/dns-query',
          'https://dns.google/dns-query',
          'https://dns.quad9.net/dns-query',
        ],
      });
    } catch (err) {
      // Ignore if host resolver options differ on current OS
    }
    setupNetworkInterceptors();
    setupIpcHandlers();
    await startLocalStaticServer();
    await createWindow();
    if (!isVerifyLaunch) {
      setTimeout(() => {
        try {
          const payload = {
            ...getDesktopTelemetryObject(),
            lang: app.getLocale() || 'uk',
            screen: '1920x1080',
            timestamp: Date.now(),
          };
          const body = JSON.stringify(payload);
          const req = https.request(
            'https://vinegret.net/wp-json/cinemavault/v1/telemetry',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'CinemaVault-PRO-Desktop/3.7.4',
              },
              timeout: 7000,
            },
            (res) => res.resume()
          );
          req.on('error', () => {});
          req.write(body);
          req.end();
        } catch {
          // ignore
        }
      }, 2500);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (localServer) {
    try {
      localServer.close();
    } catch (err) {
      // Ignore
    }
  }
  if (process.platform !== 'darwin' || isVerifyLaunch) {
    app.quit();
  }
});
