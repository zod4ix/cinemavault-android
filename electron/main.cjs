const { app, BrowserWindow, shell, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Enable unrestricted media playback, HLS streaming & cross-origin API access
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch(
  'disable-features',
  'OutOfBlinkCors,BlockInsecurePrivateNetworkRequests,SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,CrossOriginOpenerPolicy'
);
app.commandLine.appendSwitch('ignore-certificate-errors');

const CLEAN_USER_AGENT =
  process.platform === 'darwin'
    ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

// Universal Subframe Player Bridge (matches Android MainActivity.java)
const SUBFRAME_PLAYER_BRIDGE_JS = `(function(){
  if(window.__cinemaSubframeBridgeInstalled)return;
  window.__cinemaSubframeBridgeInstalled=true;
  var isSubframe=(window!==window.top);
  var audioCtx=null,gainNode=null,hookedVideo=null;
  var preferUa=true,uaAutoAttempts=0,uaAutoSelected=false;
  var VOICE_SELECTORS='.b-translators__item, [data-translator_id], .pljs-menu li, [class*="translator"], [class*="voice"], select.pljs-audio option, select[name*="voice"] option, select[name*="audio"] option, [data-voice], .voice-btn, .audio-track-item, [data-audio]';
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
      for(var i=0;i<nodes.length&&out.length<20;i++){
        var el=nodes[i];
        var txt=(el.textContent||el.value||'').trim();
        if(txt&&txt.length>1&&txt.length<50){
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
    if(now-lastTapTimestamp<400)return;
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
  function tryAutoSelectUaVoice(){
    if(!preferUa||uaAutoSelected||uaAutoAttempts>12)return;
    uaAutoAttempts++;
    try{
      var vList=scanVoices();
      if(vList&&vList.length>0){
        var activeIsUa=vList.some(function(v){return v.active&&/(укр|ukr|ua\\b|укра|дубляж)/i.test(v.label);});
        if(activeIsUa){uaAutoSelected=true;return;}
        for(var j=0;j<vList.length;j++){
          if(/(укр|ukr|ua\\b|укра|дубляж)/i.test(vList[j].label)){
            var allNodes=document.querySelectorAll(VOICE_SELECTORS);
            var targetNode=null;
            for(var k=0;k<allNodes.length;k++){
              if((allNodes[k].textContent||allNodes[k].value||'').trim()===vList[j].label){targetNode=allNodes[k];break;}
            }
            if(!targetNode&&allNodes[vList[j].index])targetNode=allNodes[vList[j].index];
            if(targetNode){
              uaAutoSelected=true;
              fireFullTapOnElement(targetNode);
              try{window.top.postMessage({__cinemaPlayerBridge:true,type:'uaVoiceAutoActivated',label:vList[j].label},'*');}catch(e){}
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
      var v=getActiveVideo();
      if(v&&!v.__cinemaHooked){
        v.__cinemaHooked=true;
        v.addEventListener('timeupdate',reportState);
        v.addEventListener('loadedmetadata',reportState);
        v.addEventListener('play',reportState);
        v.addEventListener('pause',reportState);
      }
      tryAutoSelectUaVoice();
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
      if(d.lang==='ua'){preferUa=true;uaAutoAttempts=0;tryAutoSelectUaVoice();}
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

  // Clean User-Agent & smart Referer for streaming CDNs and YouTube embeds
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    requestHeaders['User-Agent'] = CLEAN_USER_AGENT;

    try {
      const targetUrl = new URL(details.url);
      const host = targetUrl.hostname.toLowerCase();
      const isLocal = host === '127.0.0.1' || host === 'localhost';

      if (!isLocal) {
        if (host.includes('youtube.com') || host.includes('youtube-nocookie.com') || host.includes('googlevideo.com')) {
          requestHeaders['Referer'] = 'https://www.youtube.com/';
          requestHeaders['Origin'] = 'https://www.youtube.com';
        } else if (
          host.includes('rezka') ||
          host.includes('rezkify') ||
          host.includes('hdrezka') ||
          host.includes('ashdi') ||
          host.includes('voidboost') ||
          host.includes('kinobox')
        ) {
          requestHeaders['Referer'] = `${targetUrl.protocol}//${targetUrl.host}/`;
          requestHeaders['Origin'] = `${targetUrl.protocol}//${targetUrl.host}`;
        }
      }
    } catch (err) {
      // Ignore malformed URLs
    }

    callback({ requestHeaders });
  });

  // Strip X-Frame-Options / frame-ancestors CSP and inject permissive CORS headers
  ses.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...(details.responseHeaders || {}) };

    for (const key of Object.keys(responseHeaders)) {
      const lower = key.toLowerCase();
      if (
        lower === 'x-frame-options' ||
        lower === 'content-security-policy' ||
        lower === 'content-security-policy-report-only' ||
        lower === 'cross-origin-embedder-policy' ||
        lower === 'cross-origin-opener-policy' ||
        lower === 'cross-origin-resource-policy'
      ) {
        delete responseHeaders[key];
      }
    }

    try {
      const targetUrl = new URL(details.url);
      const host = targetUrl.hostname.toLowerCase();
      const isLocal = host === '127.0.0.1' || host === 'localhost';
      if (!isLocal) {
        responseHeaders['Access-Control-Allow-Origin'] = ['*'];
        responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS, HEAD'];
        responseHeaders['Access-Control-Allow-Headers'] = ['*'];
        responseHeaders['Access-Control-Expose-Headers'] = ['*'];
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
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url).catch(() => {});
    }
  });

  ipcMain.on('cinema-download-update', (_event, url) => {
    if (typeof url !== 'string' || !url.trim()) return;
    let targetUrl = url.trim();
    // On desktop, map .apk download links to the corresponding desktop installer on GitHub Releases
    if (targetUrl.toLowerCase().endsWith('.apk')) {
      if (process.platform === 'darwin') {
        targetUrl =
          'https://github.com/zod4ix/cinemavault-android/releases/download/v3.7.0/CinemaVault-PRO-v3.7.0-macOS.dmg';
      } else {
        targetUrl =
          'https://github.com/zod4ix/cinemavault-android/releases/download/v3.7.0/CinemaVault-PRO-v3.7.0-Windows.exe';
      }
    }
    shell.openExternal(targetUrl).catch(() => {});
  });
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

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    show: !isVerifyMode,
    backgroundColor: '#07090e',
    title: 'CinemaVault PRO v3.7.0',
    icon: path.join(__dirname, 'icon.png'),
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

  // Inject Universal Subframe Player Bridge into main frame and all streaming subframes
  mainWindow.webContents.on('did-frame-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const allFrames = mainWindow.webContents.mainFrame.framesInSubtree;
      for (const frame of allFrames) {
        if (frame && !frame.isDestroyed()) {
          frame.executeJavaScript(SUBFRAME_PLAYER_BRIDGE_JS, true).catch(() => {});
        }
      }
    } catch (err) {
      // Ignore frame injection errors on destroyed frames
    }
  });

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
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupNetworkInterceptors();
    setupIpcHandlers();
    await startLocalStaticServer();
    await createWindow();

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
