const fs = require('fs');

const data = JSON.parse(fs.readFileSync('objkt_data.json', 'utf8'));
const curations = data.data.gallery.filter(g => g.name !== 'PiotcoTeam Hot Curation of Images');

const galleryHtml = fs.readFileSync('gallery.html', 'utf8');

const fragMatch = galleryHtml.match(/<script id="fragmentShader" type="x-shader\/x-fragment">([\s\S]*?)<\/script>/);
const fragmentShaderSrc = fragMatch[1];

const vertMatch = galleryHtml.match(/<script id="vertexShader" type="x-shader\/x-vertex">([\s\S]*?)<\/script>/);
const vertexShaderSrc = vertMatch[1];


const resolveImage = (token) => {
    // We proxy everything through wsrv.nl to add CORS headers (critical for WebGL texImage2D).
    
    // For Bootloader tokens, use their HTTP thumbnail directly.
    if (token.thumbnail_uri && token.thumbnail_uri.includes('bootloader.art')) {
        return 'https://wsrv.nl/?url=' + encodeURIComponent(token.thumbnail_uri) + '&output=webp&q=85';
    }
    
    // For all other tokens (mostly IPFS), use the Objkt thumbnail CDN, which is very reliable, 
    // and proxy it through wsrv.nl to bypass Objkt's hotlink blocking (403 Forbidden).
    const objktCdnUrl = `https://assets.objkt.media/file/assets-003/${token.fa_contract}/${token.token_id}/thumb400`;
    return 'https://wsrv.nl/?url=' + encodeURIComponent(objktCdnUrl) + '&output=webp&q=85';
};

// Resolves generative art iframe URL from token data
// For Bootloader tokens, uses their direct IPFS sketch if available, or generic-web endpoint.
// For SVG data URI tokens (cyber_derps), uses the data URI directly.
// For IPFS code tokens (code, fxhash, HEN/Teia interactive directories), uses Teia cache (HEN) or Filebase gateway.
const resolveGenerator = (token) => {
    // 1. Cyber derps inline SVG data URI apps
    if (token.artifact_uri && token.artifact_uri.startsWith('data:image/svg+xml')) {
        return token.artifact_uri;
    }

    // 2. IPFS code / interactive sketch tokens
    const isCodeArt = (
        token.mime === 'application/x-directory' ||
        token.mime === 'text/html' ||
        (token.artifact_uri && token.artifact_uri.includes('?'))
    );
    if (isCodeArt && token.artifact_uri && token.artifact_uri.startsWith('ipfs://')) {
        const withoutProto = token.artifact_uri.replace('ipfs://', '');
        const isHen = (token.fa_contract === 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton');
        const gateway = isHen ? 'https://cache.teia.rocks/ipfs/' : 'https://magic.decentralized-content.com/ipfs/';
        if (withoutProto.includes('?')) {
            const qIdx = withoutProto.indexOf('?');
            const cid = withoutProto.substring(0, qIdx);
            const query = withoutProto.substring(qIdx + 1);
            return `${gateway}${cid}/?${query}`;
        } else {
            const cleanCid = withoutProto.replace(/\/+$/, '');
            return `${gateway}${cleanCid}/`;
        }
    }

    // 3. Fallback for Bootloader tokens without direct IPFS sketch
    if (token.thumbnail_uri && token.thumbnail_uri.includes('bootloader.art')) {
        return `https://media.bootloader.art/generic-web/v1/artifact/${token.token_id}?v=1`;
    }

    return '';
};

// Resolves animation URL and type (video or gif) for animated artworks
const resolveAnimation = (token) => {
    // MP4 video animation
    if (token.mime === 'video/mp4' && token.artifact_uri && token.artifact_uri.startsWith('ipfs://')) {
        const cid = token.artifact_uri.replace('ipfs://', '').split('?')[0].replace(/\/+$/, '');
        const isHen = (token.fa_contract === 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton');
        const gateway = isHen ? 'https://cache.teia.rocks/ipfs/' : 'https://magic.decentralized-content.com/ipfs/';
        return {
            type: 'video',
            url: `${gateway}${cid}`
        };
    }
    // Animated GIF
    if (token.mime === 'image/gif') {
        const uri = (token.artifact_uri && token.artifact_uri.startsWith('ipfs://'))
            ? token.artifact_uri
            : (token.display_uri && token.display_uri.startsWith('ipfs://') ? token.display_uri : '');
        if (uri) {
            const cid = uri.replace('ipfs://', '').split('?')[0].replace(/\/+$/, '');
            const isHen = (token.fa_contract === 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton');
            if (isHen) {
                return {
                    type: 'gif',
                    url: `https://cache.teia.rocks/ipfs/${cid}`
                };
            }
            return {
                type: 'gif',
                url: `https://wsrv.nl/?url=${encodeURIComponent('https://magic.decentralized-content.com/ipfs/' + cid)}&n=-1`
            };
        }
    }
    return null;
};

const getTemplate = (title, itemsHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer">
    <title>${title} - Curation</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@100&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #050505;
            color: #FFFFFF;
            font-family: 'Roboto Condensed', sans-serif;
            font-weight: 100;
            margin: 0;
            padding: 60px 60px 100px 60px;
        }
        canvas#webgl {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            display: block;
            z-index: 1;
            pointer-events: none;
        }
        #photosensitive-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10;
            background: transparent;
            border: none;
            color: transparent;
            font-family: 'Roboto Condensed', sans-serif;
            font-size: 24px;
            cursor: pointer;
            padding: 20px;
            pointer-events: auto;
        }
        h1 {
            font-size: 2.5rem;
            margin-bottom: 60px;
            text-transform: uppercase;
            letter-spacing: 2px;
            border-bottom: 1px solid #333;
            padding-bottom: 20px;
            color: transparent;
            position: relative;
            z-index: 10;
        }
        .artworks-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 40px;
            position: relative;
            z-index: 10;
        }
        .artwork-card {
            border: 1px solid #333;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 15px;
            transition: border-color 0.3s ease, background-color 0.3s ease;
            text-decoration: none;
            color: transparent;
            pointer-events: auto;
            position: relative;
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            user-select: none;
            touch-action: pan-y;
        }
        .artwork-card:hover {
            border-color: #FFFFFF;
            background-color: rgba(17, 17, 17, 0.8);
        }
        .artwork-preview {
            position: relative;
            width: 100%;
            aspect-ratio: 1;
            border: 1px solid #222;
            overflow: hidden;
            background: #000;
        }
        .artwork-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border: none;
            filter: grayscale(100%) brightness(0.45);
            transition: filter 0.4s ease, opacity 0.3s ease;
            display: block;
            -webkit-user-drag: none;
            user-select: none;
            pointer-events: none;
        }
        .artwork-card:hover .artwork-image {
            filter: none;
        }
        .artwork-preview-media {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
            background: transparent;
            object-fit: cover;
            display: block;
            z-index: 2;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.25s ease;
        }
        .artwork-preview-media.loaded {
            opacity: 1;
        }
        .artwork-title {
            font-size: 1rem;
            font-weight: 100;
            line-height: 1.4;
            color: transparent;
            transition: color 0.3s ease;
            word-wrap: break-word;
            word-break: break-word;
        }
        .artwork-card:hover .artwork-title {
            color: #FFFFFF;
        }
        .back-link {
            position: fixed;
            bottom: 20px;
            left: 20px;
            color: transparent;
            text-decoration: none;
            font-size: 24px;
            font-weight: 100;
            z-index: 20;
            padding: 20px;
            pointer-events: auto;
        }

        @media screen and (max-width: 768px) {
            body {
                padding: 18px;
                padding-bottom: 90px;
            }
            h1 {
                font-size: 1.8rem;
                margin-bottom: 24px;
                letter-spacing: 2px;
            }
            .artworks-grid {
                grid-template-columns: 1fr;
                gap: 28px;
            }
            .artwork-title {
                font-size: 1.25rem;
                line-height: 1.4;
            }
            .back-link {
                bottom: 12px;
                left: 12px;
                padding: 14px 18px;
                font-size: 24px;
            }
            #photosensitive-toggle {
                top: 12px;
                right: 12px;
                padding: 14px;
                font-size: 24px;
            }
        }
    </style>
</head>
<body>
    <button id="photosensitive-toggle" title="Toggle Photosensitive Mode">⚡</button>
    <a href="gallery.html" class="back-link">Back</a>
    <h1>${title}</h1>
    <div class="artworks-grid">
${itemsHtml}
    </div>
    
    <canvas id="webgl"></canvas>

    <!-- Fullscreen interactive generative art runner modal -->
    <div id="runner-modal" style="display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;background:#050505;">
        <div id="runner-header" style="position:absolute;top:0;left:0;right:0;height:48px;background:rgba(10,10,10,0.95);border-bottom:1px solid #333;display:flex;align-items:center;justify-content:space-between;padding:0 20px;z-index:10000;box-sizing:border-box;">
            <div id="runner-title" style="color:#FFF;font-size:16px;font-weight:100;letter-spacing:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:12px;"></div>
            <div style="display:flex;gap:12px;align-items:center;flex-shrink:0;">
                <a id="runner-newtab" href="#" target="_blank" rel="noopener noreferrer" style="color:#FFF;text-decoration:none;font-size:14px;border:1px solid #444;padding:4px 10px;font-family:'Roboto Condensed',sans-serif;">Open Tab ↗</a>
                <a id="runner-objkt" href="#" target="_blank" rel="noopener noreferrer" style="color:#FFF;text-decoration:none;font-size:14px;border:1px solid #444;padding:4px 10px;font-family:'Roboto Condensed',sans-serif;">Objkt ↗</a>
                <button id="runner-close" style="background:transparent;border:none;color:#FFF;font-size:24px;cursor:pointer;padding:0 8px;line-height:1;font-family:'Roboto Condensed',sans-serif;" title="Close runner">✕</button>
            </div>
        </div>
        <iframe id="runner-iframe" style="position:absolute;top:48px;left:0;width:100vw;height:calc(100vh - 48px);border:none;background:#000;" allow="accelerometer; autoplay; encrypted-media; gyroscope" src="about:blank" title="Interactive generative art"></iframe>
    </div>
    
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>

    <script id="vertexShader" type="x-shader/x-vertex">
${vertexShaderSrc}
    </script>

    <script id="fragmentShader" type="x-shader/x-fragment">
${fragmentShaderSrc}
    </script>

    <script>
        const canvas = document.getElementById('webgl');
        const textCanvas = document.createElement('canvas');
        textCanvas.width = window.innerWidth;
        textCanvas.height = window.innerHeight; 
        const tCtx = textCanvas.getContext('2d');

        let renderer, scene, camera, plane;
        let textTexture, shaderMaterial;
        let rtA, rtB; 
        
        let effectTimer = 0;
        const EFFECT_SWITCH_INTERVAL = 150; 
        const TOTAL_EFFECTS = 36;
        
        let activeEffects = [0, 0, 0];
        let effectSeeds = [0.5, 0.5, 0.5];
        let isPhotosensitiveMode = false;
        let targetWordRect = { x: 0, y: 0, w: 1, h: 1 };

        function init() {
            if (typeof THREE === 'undefined') {
                setTimeout(init, 100);
                return;
            }

            scene = new THREE.Scene();
            const aspect = window.innerWidth / window.innerHeight;
            
            camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            
            renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
            renderer.setPixelRatio(window.devicePixelRatio); 
            renderer.setSize(window.innerWidth, window.innerHeight);

            rtA = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
            rtB = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

            textTexture = new THREE.CanvasTexture(textCanvas);
            textTexture.minFilter = THREE.LinearFilter;
            textTexture.magFilter = THREE.LinearFilter;

            shaderMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    tDiffuse: { value: textTexture },
                    time: { value: 0 },
                    aspect: { value: aspect },
                    u_active_effect: { value: 0 },
                    u_effect_seed: { value: 0.5 },
                    u_intensity: { value: 0.8 },
                    u_apply_crt: { value: false },
                    u_safe_mode: { value: false },
                    u_phos_color: { value: new THREE.Vector3(0.9, 0.9, 0.9) }, 
                    u_v_offset: { value: 0.0 },
                    u_glitch_region: { value: new THREE.Vector4(0.0, 0.0, 1.0, 1.0) }
                },
                vertexShader: document.getElementById('vertexShader').textContent,
                fragmentShader: document.getElementById('fragmentShader').textContent
            });

            plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMaterial);
            scene.add(plane);

            requestAnimationFrame(animate);
        }

        function updateTextLogic(timeSeconds) {
            tCtx.fillStyle = isPhotosensitiveMode ? 'rgba(0, 0, 0, 1)' : 'rgba(0, 0, 0, 0.15)'; 
            tCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);

            let offsetX = 0;
            if (!isPhotosensitiveMode && Math.random() > 0.9) {
                offsetX = (Math.random() - 0.5) * 5; 
            }

            // Draw images and their titles
            const cards = document.querySelectorAll('.artwork-card');
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                // Check if card is in viewport
                if (rect.bottom > 0 && rect.top < window.innerHeight) {
                    if (!card.matches(':hover')) {
                        const img = card.querySelector('.artwork-image');
                        const title = card.querySelector('.artwork-title');
                        
                        if (img && img.complete && img.naturalWidth !== 0) {
                            const imgRect = img.getBoundingClientRect();
                            tCtx.drawImage(img, imgRect.left + offsetX, imgRect.top, imgRect.width, imgRect.height);
                        }
                        
                        if (title) {
                            const titleRect = title.getBoundingClientRect();
                            tCtx.font = '100 1rem "Roboto Condensed"';
                            tCtx.fillStyle = Math.random() > 0.8 ? '#AAAAAA' : '#FFFFFF';
                            tCtx.textAlign = 'left';
                            tCtx.textBaseline = 'top';
                            
                            const words = title.textContent.split(' ');
                            let line = '';
                            let yPos = titleRect.top;
                            const lineHeight = 22; // ~1.4 * 16px
                            const maxWidth = rect.width;

                            for (let n = 0; n < words.length; n++) {
                                // If a single word is insanely long, it will still render on one line, 
                                // but standard long titles will wrap properly.
                                const testLine = line + words[n] + ' ';
                                const metrics = tCtx.measureText(testLine);
                                const testWidth = metrics.width;
                                if (testWidth > maxWidth && n > 0) {
                                    tCtx.fillText(line, titleRect.left + offsetX, yPos);
                                    if (!isPhotosensitiveMode && Math.random() > 0.85) {
                                        tCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                                        tCtx.fillText(line, titleRect.left - (offsetX * 2), yPos);
                                        tCtx.fillStyle = Math.random() > 0.8 ? '#AAAAAA' : '#FFFFFF';
                                    }
                                    line = words[n] + ' ';
                                    yPos += lineHeight;
                                } else {
                                    line = testLine;
                                }
                            }
                            tCtx.fillText(line, titleRect.left + offsetX, yPos);
                            if (!isPhotosensitiveMode && Math.random() > 0.85) {
                                tCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                                tCtx.fillText(line, titleRect.left - (offsetX * 2), yPos);
                            }
                        }
                    }
                }
            });

            // Draw persistent UI
            const title = document.querySelector('h1');
            const backLink = document.querySelector('.back-link');
            const toggleBtn = document.getElementById('photosensitive-toggle');
            
            [title, backLink, toggleBtn].forEach(el => {
                if(!el) return;
                const rect = el.getBoundingClientRect();
                if (rect.bottom < 0 || rect.top > window.innerHeight) return;

                let textColor = Math.random() > 0.8 ? '#AAAAAA' : '#FFFFFF';
                if (el.id === 'photosensitive-toggle' && isPhotosensitiveMode) {
                    textColor = '#888888';
                }
                
                let fontSize = '24px';
                if (el.tagName === 'H1') fontSize = '2.5rem';
                
                tCtx.font = \`300 \${fontSize} "Roboto Condensed"\`;
                tCtx.fillStyle = textColor;
                tCtx.textAlign = 'center';
                tCtx.textBaseline = 'middle';
                
                let text = el.textContent;
                
                const centerX = rect.left + rect.width / 2 + offsetX;
                const centerY = rect.top + rect.height / 2;
                
                tCtx.fillText(text, centerX, centerY);

                if (!isPhotosensitiveMode && Math.random() > 0.85) {
                    tCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    tCtx.fillText(text, centerX - (offsetX * 2), centerY);
                }
            });

            // --- Per-artwork torus ring loaders drawn on canvas (glitch shader affects them) ---
            if (!window._imgTracked) {
                window._imgTracked = true;
                document.querySelectorAll('.artwork-image').forEach(img => {
                    img._loadStart = performance.now();
                    img._loaded = img.complete && img.naturalWidth > 0;
                    if (!img._loaded) {
                        img.addEventListener('load',  () => { img._loaded = true; });
                        img.addEventListener('error', () => { img._loaded = true; });
                    }
                });
            }
            document.querySelectorAll('.artwork-image').forEach(img => {
                if (img._loaded) return;
                const rect = img.getBoundingClientRect();
                if (rect.width === 0) return;
                const cx = rect.left + rect.width  / 2;
                const cy = rect.top  + rect.height / 2;
                const outer = rect.width * 0.12;
                const inner = outer * 0.65;
                const elapsed = performance.now() - (img._loadStart || performance.now());
                // Ease to ~90% over 4s; never reaches 100% until load event fires
                const p = 0.9 * (1 - Math.exp(-3 * elapsed / 4000));
                // Background track (dim hollow ring)
                tCtx.globalAlpha = 0.22;
                tCtx.beginPath();
                tCtx.arc(cx, cy, outer, 0, Math.PI * 2);
                tCtx.arc(cx, cy, inner, 0, Math.PI * 2, true);
                tCtx.fillStyle = '#FFFFFF';
                tCtx.fill('evenodd');
                // Progress fill clockwise from 12 o'clock
                if (p > 0.005) {
                    tCtx.globalAlpha = 0.92;
                    const a0 = -Math.PI / 2;
                    const a1 = a0 + Math.PI * 2 * p;
                    tCtx.beginPath();
                    tCtx.arc(cx, cy, outer, a0, a1);
                    tCtx.arc(cx, cy, inner, a1, a0, true);
                    tCtx.closePath();
                    tCtx.fillStyle = '#FFFFFF';
                    tCtx.fill();
                }
                tCtx.globalAlpha = 1;
            });
            textTexture.needsUpdate = true;
        }

        function animate(t) {
            const timeSeconds = t * 0.001;
            updateTextLogic(timeSeconds);
            shaderMaterial.uniforms.time.value = timeSeconds;

            effectTimer++;
            if (effectTimer > EFFECT_SWITCH_INTERVAL) {
                effectTimer = 0;

                const cards = Array.from(document.querySelectorAll('.artwork-card'));
                const title = document.querySelector('h1');
                const possibleTargets = [...cards, title];
                
                const visibleTargets = possibleTargets.filter(el => {
                    if(!el) return false;
                    const rect = el.getBoundingClientRect();
                    return rect.bottom > 0 && rect.top < window.innerHeight;
                });
                
                if (visibleTargets.length > 0) {
                    const target = visibleTargets[Math.floor(Math.random() * visibleTargets.length)];
                    const rect = target.getBoundingClientRect();
                    
                    const paddingX = 40; 
                    const paddingY = 20; 
                    
                    const nx = (rect.left - paddingX) / window.innerWidth;
                    const nw = (rect.width + paddingX * 2) / window.innerWidth;
                    
                    const ny = 1.0 - ((rect.top + rect.height + paddingY) / window.innerHeight);
                    const nh = (rect.height + paddingY * 2) / window.innerHeight;
                    
                    targetWordRect = { x: nx, y: ny, w: nw, h: nh };
                }

                if (Math.random() > 0.2) {
                    let nextEffect = Math.floor(Math.random() * TOTAL_EFFECTS) + 1;
                    activeEffects.unshift(nextEffect);
                    effectSeeds.unshift(Math.random());
                } else {
                    activeEffects.unshift(0); 
                    effectSeeds.unshift(Math.random());
                }
                activeEffects.length = 3; 
                effectSeeds.length = 3;
            }

            shaderMaterial.uniforms.u_glitch_region.value.set(targetWordRect.x, targetWordRect.y, targetWordRect.w, targetWordRect.h);
            
            // Pass 1
            shaderMaterial.uniforms.tDiffuse.value = textTexture;
            shaderMaterial.uniforms.u_active_effect.value = activeEffects[0];
            shaderMaterial.uniforms.u_effect_seed.value = effectSeeds[0];
            shaderMaterial.uniforms.u_apply_crt.value = false;
            renderer.setRenderTarget(rtA);
            renderer.render(scene, camera);

            // Pass 2
            shaderMaterial.uniforms.tDiffuse.value = rtA.texture;
            shaderMaterial.uniforms.u_active_effect.value = activeEffects[1];
            shaderMaterial.uniforms.u_effect_seed.value = effectSeeds[1];
            shaderMaterial.uniforms.u_apply_crt.value = false;
            renderer.setRenderTarget(rtB);
            renderer.render(scene, camera);

            // Pass 3 (Final)
            shaderMaterial.uniforms.tDiffuse.value = rtB.texture;
            shaderMaterial.uniforms.u_active_effect.value = activeEffects[2];
            shaderMaterial.uniforms.u_effect_seed.value = effectSeeds[2];
            shaderMaterial.uniforms.u_apply_crt.value = true;
            renderer.setRenderTarget(null);
            renderer.render(scene, camera);

            requestAnimationFrame(animate);
        }

        window.onresize = () => {
            if (renderer && camera && shaderMaterial) {
                const width = window.innerWidth;
                const height = window.innerHeight;
                const aspect = width / height;
                renderer.setSize(width, height);
                rtA.setSize(width, height);
                rtB.setSize(width, height);
                
                textCanvas.width = width;
                textCanvas.height = height;
                
                camera.updateProjectionMatrix();
                shaderMaterial.uniforms.aspect.value = aspect;
            }
        };

        document.getElementById('photosensitive-toggle').addEventListener('click', (e) => {
            isPhotosensitiveMode = !isPhotosensitiveMode;
            shaderMaterial.uniforms.u_safe_mode.value = isPhotosensitiveMode;
        });

        // --- PREVIEW WINDOW ACTIVATION ON MOUSE OVER / TOUCH ---
        // All art activates on mouse over: code runs in preview, animations play
        let activePreviewCard = null;
        let previewHoverTimer = null;

        function clearActivePreview() {
            clearTimeout(previewHoverTimer);
            if (!activePreviewCard) return;
            const container = activePreviewCard.querySelector('.artwork-preview');
            if (container) {
                const mediaEls = container.querySelectorAll('.artwork-preview-media');
                mediaEls.forEach(el => {
                    if (el.tagName === 'IFRAME') el.src = 'about:blank';
                    if (el.tagName === 'VIDEO') {
                        try {
                            el.pause();
                            el.removeAttribute('src');
                            el.load();
                        } catch(e) {}
                    }
                    el.remove();
                });
            }
            activePreviewCard = null;
        }

        function activatePreview(card) {
            if (activePreviewCard === card) return;
            clearActivePreview();

            const container = card.querySelector('.artwork-preview');
            if (!container) return;

            activePreviewCard = card;

            // 1. Interactive code art (runs live in preview)
            if (card.dataset.generator) {
                const iframe = document.createElement('iframe');
                iframe.className = 'artwork-preview-media';
                iframe.setAttribute('allow', 'accelerometer; autoplay; encrypted-media; gyroscope');
                const showIframe = () => iframe.classList.add('loaded');
                iframe.onload = showIframe;
                iframe.onerror = () => {
                    iframe.remove();
                };
                iframe.src = card.dataset.generator;
                container.appendChild(iframe);
                setTimeout(showIframe, 500);
                return;
            }

            // 2. Video animation (plays looping video)
            if (card.dataset.animation && card.dataset.animationType === 'video') {
                const video = document.createElement('video');
                video.className = 'artwork-preview-media';
                video.muted = true;
                video.defaultMuted = true;
                video.setAttribute('muted', '');
                video.setAttribute('playsinline', '');
                video.setAttribute('webkit-playsinline', '');
                video.setAttribute('autoplay', '');
                video.setAttribute('loop', '');
                video.setAttribute('preload', 'auto');
                video.preload = 'auto';

                const showVideo = () => {
                    video.classList.add('loaded');
                };

                if (video.readyState >= 2) {
                    showVideo();
                }
                video.addEventListener('loadeddata', showVideo, { once: true });
                video.addEventListener('canplay', showVideo, { once: true });
                video.addEventListener('playing', showVideo, { once: true });
                video.addEventListener('timeupdate', () => {
                    if (video.currentTime > 0) showVideo();
                });

                video.onerror = () => {
                    const curSrc = video.src;
                    if (curSrc.includes('cache.teia.rocks')) {
                        video.src = curSrc.replace('https://cache.teia.rocks/ipfs/', 'https://magic.decentralized-content.com/ipfs/');
                        video.load();
                        video.play().catch(() => {});
                        return;
                    }
                    if (curSrc.includes('magic.decentralized-content.com')) {
                        video.src = curSrc.replace('https://magic.decentralized-content.com/ipfs/', 'https://cache.teia.rocks/ipfs/');
                        video.load();
                        video.play().catch(() => {});
                        return;
                    }
                    video.remove();
                };

                video.src = card.dataset.animation;
                container.appendChild(video);

                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        showVideo();
                    }).catch(err => {
                        video.muted = true;
                        video.play().then(showVideo).catch(() => {});
                    });
                }
                return;
            }

            // 3. GIF animation (plays animated GIF)
            if (card.dataset.animation && card.dataset.animationType === 'gif') {
                const gif = document.createElement('img');
                gif.className = 'artwork-preview-media';
                gif.crossOrigin = 'anonymous';
                gif.alt = card.querySelector('.artwork-image')?.alt || '';
                const showGif = () => gif.classList.add('loaded');
                gif.onload = showGif;
                if (gif.complete && gif.naturalWidth > 0) showGif();
                gif.onerror = () => {
                    gif.remove();
                };
                gif.src = card.dataset.animation;
                container.appendChild(gif);
                return;
            }
        }

        // --- FULLSCREEN GENERATIVE ART RUNNER MODAL ---
        const runnerModal = document.getElementById('runner-modal');
        const runnerIframe = document.getElementById('runner-iframe');
        const runnerTitle = document.getElementById('runner-title');
        const runnerNewtab = document.getElementById('runner-newtab');
        const runnerObjkt = document.getElementById('runner-objkt');
        const runnerClose = document.getElementById('runner-close');

        function openRunner(card) {
            if (!card.dataset.generator || !runnerModal) return;
            clearActivePreview();
            const titleEl = card.querySelector('.artwork-title');
            if (runnerTitle) runnerTitle.textContent = titleEl ? titleEl.textContent : '';
            if (runnerIframe) runnerIframe.src = card.dataset.generator;
            if (runnerNewtab) runnerNewtab.href = card.dataset.generator;
            if (runnerObjkt) runnerObjkt.href = card.href;
            runnerModal.style.display = 'block';
        }

        function closeRunner() {
            if (!runnerModal) return;
            runnerModal.style.display = 'none';
            if (runnerIframe) runnerIframe.src = 'about:blank';
        }

        if (runnerClose) runnerClose.addEventListener('click', closeRunner);
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && runnerModal && runnerModal.style.display === 'block') {
                closeRunner();
            }
        });

        // Bind hover and click events across all cards
        document.querySelectorAll('.artwork-card').forEach(card => {
            card.addEventListener('mouseenter', () => {
                clearTimeout(previewHoverTimer);
                previewHoverTimer = setTimeout(() => {
                    activatePreview(card);
                }, 20);
            });

            card.addEventListener('mouseleave', () => {
                clearTimeout(previewHoverTimer);
                if (activePreviewCard === card) {
                    clearActivePreview();
                }
            });

            // Touch / mobile activation
            card.addEventListener('touchstart', () => {
                if (card.dataset.generator || card.dataset.animation) {
                    if (activePreviewCard !== card) {
                        activatePreview(card);
                    }
                }
            }, { passive: true });

            card.addEventListener('click', (e) => {
                if (card.dataset.generator) {
                    e.preventDefault();
                    openRunner(card);
                }
            });
        });

        window.addEventListener('scroll', () => {
            if (activePreviewCard) {
                const rect = activePreviewCard.getBoundingClientRect();
                if (rect.bottom < 0 || rect.top > window.innerHeight) {
                    clearActivePreview();
                }
            }
        }, { passive: true });

        // --- IMAGE ERROR FALLBACK ---
        // If display_uri fails to load, try thumbnail, then hide gracefully
        document.querySelectorAll('.artwork-image').forEach(img => {
            if (img.complete && img.naturalWidth === 0) {
                if (img.dataset.thumbnail) img.src = img.dataset.thumbnail;
                else img.style.visibility = 'hidden';
            }
            img.addEventListener('error', function() {
                if (this.dataset.thumbnail && this.src !== this.dataset.thumbnail) {
                    this.src = this.dataset.thumbnail;
                } else {
                    this.style.visibility = 'hidden';
                }
            });
        });

        window.onload = init;
    </script>
<script>
        // Allow mouse back/forward buttons to navigate
        window.addEventListener('mouseup', (e) => {
            if (e.button === 3) window.history.back();
            if (e.button === 4) window.history.forward();
        });
    </script>
</body>
</html>`;

curations.forEach(curation => {
    let filename = curation.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (curation.name.toLowerCase().includes('scenes')) filename = 'scenes';
    if (curation.name.toLowerCase().includes('code')) filename = 'code';
    if (curation.name.toLowerCase().includes('concerned')) filename = 'concerned';
    if (curation.name.toLowerCase().includes('artifacts')) filename = 'artifacts';
    if (curation.name.toLowerCase().includes('yojijukugo')) filename = 'yojijukugo';
    if (curation.name.toLowerCase().includes('glitchart')) filename = 'glitchart';
    if (curation.name.toLowerCase().includes('geometries')) filename = 'geometries';
    if (curation.name.toLowerCase().includes('clouds')) filename = 'clouds';
    if (curation.name.toLowerCase().includes('other mind')) filename = 'othermind';
    if (curation.name.toLowerCase().includes('mondrian')) filename = 'mondriansstatic';
    if (curation.name.toLowerCase().includes('ctrl')) filename = 'ctrlc';
    if (curation.name.toLowerCase().includes('cyber')) filename = 'cyberderps';
    if (curation.name.toLowerCase().includes('procedural')) filename = 'proceduralparadise';
    if (curation.name.toLowerCase().includes('cloud chamber')) filename = 'cloudchamber';
    if (curation.name.toLowerCase().includes('emergence')) filename = 'emergence';

    filename = filename + '.html';

    let itemsHtml = '';
    curation.tokens.forEach(({ token }) => {
        const link = 'https://objkt.com/tokens/' + token.fa_contract + '/' + token.token_id;
        const imgUrl = resolveImage(token);
        const genUrl = resolveGenerator(token);
        const anim = resolveAnimation(token);

        itemsHtml += '            <a href="' + link + '" class="artwork-card" target="_blank"'
            + (genUrl ? ' data-generator="' + genUrl + '"' : '')
            + (anim ? ' data-animation="' + anim.url + '" data-animation-type="' + anim.type + '"' : '')
            + '>\n';
        itemsHtml += '                <div class="artwork-preview">\n';
        itemsHtml += '                    <img src="' + imgUrl + '"'
            + ' crossorigin="anonymous" alt="' + token.name.replace(/"/g, '&quot;') + '" class="artwork-image">\n';
        itemsHtml += '                </div>\n';
        itemsHtml += '                <div class="artwork-title">' + token.name + '</div>\n';
        itemsHtml += '            </a>\n';
    });

    const generatedHtml = getTemplate(curation.name, itemsHtml);
    fs.writeFileSync(filename, generatedHtml);
    console.log('Generated WebGL-enabled', filename);

    if (filename === 'emergence.html') {
        fs.writeFileSync('emergent.html', generatedHtml);
        console.log('Generated alias emergent.html');
    }
    if (filename === 'proceduralparadise.html') {
        fs.writeFileSync('procedural-paradise.html', generatedHtml);
        fs.writeFileSync('procedural_paradise.html', generatedHtml);
        console.log('Generated aliases procedural-paradise.html and procedural_paradise.html');
    }
});
