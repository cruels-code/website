const fs = require('fs');

const data = JSON.parse(fs.readFileSync('objkt_data.json', 'utf8'));

const curations = data.data.gallery.filter(g => g.name !== 'PiotcoTeam Hot Curation of Images');

const getTemplate = (title, itemsHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Curation</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #050505;
            color: #FFFFFF;
            font-family: 'Courier Prime', monospace;
            margin: 0;
            padding: 60px 60px 100px 60px;
        }
        h1 {
            font-size: 2.5rem;
            margin-bottom: 60px;
            text-transform: uppercase;
            letter-spacing: 2px;
            border-bottom: 1px solid #333;
            padding-bottom: 20px;
        }
        .artworks-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 40px;
        }
        .artwork-card {
            border: 1px solid #333;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 15px;
            transition: border-color 0.3s ease;
            text-decoration: none;
            color: #FFFFFF;
        }
        .artwork-card:hover {
            border-color: #FFFFFF;
            background-color: #111;
        }
        .artwork-image {
            width: 100%;
            aspect-ratio: 1;
            object-fit: cover;
            border: 1px solid #222;
        }
        .artwork-title {
            font-size: 1rem;
            font-weight: bold;
            line-height: 1.4;
        }
        .back-link {
            position: fixed;
            bottom: 40px;
            left: 40px;
            color: #FFFFFF;
            text-decoration: none;
            font-size: 24px;
            font-weight: 700;
            z-index: 20;
            background-color: #050505;
            padding: 5px 10px;
            border: 1px solid #333;
        }
        .back-link:hover {
            background-color: #FFFFFF;
            color: #050505;
        }
    </style>
</head>
<body>
    <a href="gallery.html" class="back-link">Back</a>
    <h1>${title}</h1>
    <div class="artworks-grid">
${itemsHtml}
    </div>
</body>
</html>`;

const resolveIpfs = (uri) => {
    if (!uri) return '';
    return uri.replace('ipfs://', 'https://assets.objkt.media/file/assets-003/');
};

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
        let link = 'https://objkt.com/tokens/' + token.fa_contract + '/' + token.token_id;
        
        let imgUrl = resolveIpfs(token.display_uri);
        if (imgUrl.includes('assets-003')) {
           imgUrl = 'https://assets.objkt.media/file/assets-003/' + token.fa_contract + '/' + token.token_id + '/thumb400';
        }

        itemsHtml += '            <a href="' + link + '" class="artwork-card">\n';
        itemsHtml += '                <img src="' + imgUrl + '" alt="' + token.name.replace(/"/g, '&quot;') + '" class="artwork-image">\n';
        itemsHtml += '                <div class="artwork-title">' + token.name + '</div>\n';
        itemsHtml += '            </a>\n';
    });

    fs.writeFileSync(filename, getTemplate(curation.name, itemsHtml));
    console.log('Generated', filename, 'with', curation.tokens.length, 'items');
});
