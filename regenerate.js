const fs = require('fs');

const data = JSON.parse(fs.readFileSync('objkt_data.json', 'utf8'));
const curations = data.data.gallery.filter(g => g.name !== 'PiotcoTeam Hot Curation of Images');

const galleryHtml = fs.readFileSync('gallery.html', 'utf8');

const fragMatch = galleryHtml.match(/<script id="fragmentShader" type="x-shader\/x-fragment">([\s\S]*?)<\/script>/);
const fragmentShaderSrc = fragMatch[1];

const vertMatch = galleryHtml.match(/<script id="vertexShader" type="x-shader\/x-vertex">([\s\S]*?)<\/script>/);
const vertexShaderSrc = vertMatch[1];

const resolveIpfs = (rawUri) => {
    if (!rawUri) return '';
    if (rawUri.startsWith('data:')) return rawUri;
    if (rawUri.startsWith('ipfs://')) {
        const cid = rawUri.replace('ipfs://', '').split('?')[0];
        // nftstorage.link is confirmed working (returns 302 to content)
        return 'https://nftstorage.link/ipfs/' + cid;
    }
    // Already an HTTP URL - return directly (no proxy needed)
    return rawUri;
};

const resolveImage = (token) => {
    // Pick best URI: display > thumbnail > artifact
    const rawUri = token.display_uri || token.thumbnail_uri || token.artifact_uri;
    if (!rawUri) return '';
    const url = resolveIpfs(rawUri);
    // Only route IPFS through wsrv.nl (for CORS + WebP). Direct HTTP URLs serve fine without proxy.
    if (rawUri.startsWith('ipfs://')) {
        return 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&output=webp&q=85';
    }
    return url;
};

// Resolves artifact URI to a proxy URL that preserves animation (no format conversion)
const resolveArtifact = (token) => {
    const rawUri = token.artifact_uri;
    if (!rawUri) return '';
    if (rawUri.startsWith('data:')) return '';
    if (rawUri.includes('?')) return ''; // generative art (HTML), not an image
    const url = resolveIpfs(rawUri);
    if (rawUri.startsWith('ipfs://')) {
        // No output= so GIFs stay animated
        return 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&q=85';
    }
    return url;
};

// Resolves thumbnail URI as fallback
const resolveThumbnail = (token) => {
    const rawUri = token.thumbnail_uri;
    if (!rawUri || rawUri.startsWith('data:')) return '';
    const url = resolveIpfs(rawUri);
    if (rawUri.startsWith('ipfs://')) {
        return 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&output=webp&q=75';
    }
    return url;
};

// Resolves generative art iframe URL from artifact_uri ipfs://CID?s=SEED
// Uses subdomain-style IPFS routing (CID.ipfs.dweb.link) which preserves query params
const resolveGenerator = (token) => {
    const rawUri = token.artifact_uri;
    if (!rawUri || !rawUri.startsWith('ipfs://') || !rawUri.includes('?s=')) return '';
    const withoutProto = rawUri.replace('ipfs://', '');
    const qIdx = withoutProto.indexOf('?');
    const cid = withoutProto.substring(0, qIdx);
    const query = withoutProto.substring(qIdx + 1); // e.g. s=abc123
    return `https://${cid}.ipfs.dweb.link/?${query}`;
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
            transition: border-color 0.3s ease;
            text-decoration: none;
            color: transparent;
            pointer-events: auto;
        }
        .artwork-card:hover {
            border-color: #FFFFFF;
            background-color: rgba(17, 17, 17, 0.8);
        }
        .artwork-image {
            width: 100%;
            aspect-ratio: 1;
            object-fit: cover;
            border: 1px solid #222;
            filter: grayscale(100%) brightness(0.45);
            transition: filter 0.4s ease, opacity 0.3s ease;
        }
        .artwork-card:hover .artwork-image {
            filter: none;
        }
        .artwork-title {
            font-size: 1rem;
            font-weight: 100;
            line-height: 1.4;
            color: transparent;
            transition: color 0.3s ease;
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
                padding: 20px;
                padding-bottom: 80px;
            }
            h1 {
                font-size: 1.5rem;
                margin-bottom: 30px;
            }
            .artworks-grid {
                grid-template-columns: 1fr;
                gap: 20px;
            }
            .artwork-title {
                font-size: 0.9rem;
            }
            .back-link {
                bottom: 10px;
                left: 10px;
                padding: 10px;
                font-size: 20px;
            }
            #photosensitive-toggle {
                top: 10px;
                right: 10px;
                padding: 10px;
                font-size: 20px;
            }
        }
        /* Generative art preview iframe */
        #art-preview {
            image-rendering: pixelated;
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

    <!-- Shared generative art preview iframe - only activated on hover for cards with data-generator -->
    <iframe id="art-preview"
        sandbox="allow-scripts"
        style="position:fixed;display:none;border:none;z-index:50;background:#000;pointer-events:none;"
        src="about:blank"
        title="Generative art preview">
    </iframe>
    
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
                            tCtx.fillText(title.textContent, titleRect.left + offsetX, titleRect.top);
                            
                            if (!isPhotosensitiveMode && Math.random() > 0.85) {
                                tCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                                tCtx.fillText(title.textContent, titleRect.left - (offsetX * 2), titleRect.top);
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

        // --- IMAGE HOVER ANIMATION ---
        // On mouseenter: swap to artifact (GIF/original) if available
        // On mouseleave: restore display image
        document.querySelectorAll('.artwork-card').forEach(card => {
            const img = card.querySelector('.artwork-image');
            if (!img) return;
            const displaySrc = img.src;
            const artifactSrc = img.dataset.artifact;

            card.addEventListener('mouseenter', () => {
                if (artifactSrc) {
                    const probe = new Image();
                    probe.crossOrigin = 'anonymous';
                    probe.onload = () => { img.src = probe.src; };
                    probe.onerror = () => {}; // stay on display image
                    probe.src = artifactSrc;
                }
            });
            card.addEventListener('mouseleave', () => {
                img.src = displaySrc;
            });
        });

        // --- IMAGE ERROR FALLBACK ---
        // If display_uri fails to load, try thumbnail, then hide gracefully
        document.querySelectorAll('.artwork-image').forEach(img => {
            if (img.complete && img.naturalWidth === 0) {
                // Already broken on load
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

        // --- GENERATIVE ART PREVIEW IFRAME ---
        // Cards with data-generator (e.g. Ctrl-C) show a live iframe on hover
        const artPreview = document.getElementById('art-preview');
        if (artPreview) {
            let previewTimeout = null;

            document.querySelectorAll('.artwork-card[data-generator]').forEach(card => {
                card.addEventListener('mouseenter', () => {
                    clearTimeout(previewTimeout);
                    const img = card.querySelector('.artwork-image');
                    if (!img) return;
                    const rect = img.getBoundingClientRect();
                    artPreview.style.left   = rect.left   + 'px';
                    artPreview.style.top    = rect.top    + 'px';
                    artPreview.style.width  = rect.width  + 'px';
                    artPreview.style.height = rect.height + 'px';
                    artPreview.src = card.dataset.generator;
                    artPreview.style.display = 'block';
                });
                card.addEventListener('mouseleave', () => {
                    previewTimeout = setTimeout(() => {
                        artPreview.style.display = 'none';
                        artPreview.src = 'about:blank';
                    }, 80);
                });
            });
        }

        window.onload = init;
    </script>
</body>
</html>`;

curations.forEach(curation => {
    let filename = curation.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (curation.name.includes('scenes')) filename = 'scenes';
    if (curation.name.includes('code')) filename = 'code';
    if (curation.name.includes('concerned')) filename = 'concerned';
    if (curation.name.includes('artifacts')) filename = 'artifacts';
    if (curation.name.includes('yojijukugo')) filename = 'yojijukugo';
    if (curation.name.includes('glitchart')) filename = 'glitchart';
    if (curation.name.includes('geometries')) filename = 'geometries';
    if (curation.name.includes('clouds')) filename = 'clouds';
    if (curation.name.includes('other mind')) filename = 'othermind';

    filename = 'curation_' + filename + '.html';

    let itemsHtml = '';
    curation.tokens.forEach(({ token }) => {
        const link = 'https://objkt.com/tokens/' + token.fa_contract + '/' + token.token_id;
        const imgUrl = resolveImage(token);

        itemsHtml += '            <a href="' + link + '" class="artwork-card" target="_blank"'
            + (resolveGenerator(token) ? ' data-generator="' + resolveGenerator(token) + '"' : '')
            + '>\n';
        itemsHtml += '                <img src="' + imgUrl + '"'
            + (resolveArtifact(token) ? ' data-artifact="' + resolveArtifact(token) + '"' : '')
            + (resolveThumbnail(token) ? ' data-thumbnail="' + resolveThumbnail(token) + '"' : '')
            + ' crossorigin="anonymous" alt="' + token.name.replace(/"/g, '&quot;') + '" class="artwork-image">\n';
        itemsHtml += '                <div class="artwork-title">' + token.name + '</div>\n';
        itemsHtml += '            </a>\n';
    });

    fs.writeFileSync(filename, getTemplate(curation.name, itemsHtml));
    console.log('Generated WebGL-enabled', filename);
});
