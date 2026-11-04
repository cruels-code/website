const https = require('https');
const fs = require('fs');

async function gql(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: 'data.objkt.com',
      path: '/v3/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Mozilla/5.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log('Fetching curations and cruel_code collection from Objkt GraphQL...');

  // 1. Fetch galleries / curations
  const galleryQuery = `{
    gallery(
      where: {
        curators: {
          curator_address: {_eq: "tz1h7sQhBdKfiiAYXvtTFNPocFG92b47K94Y"}
        }
      }
      limit: 50
    ) {
      name
      slug
      tokens(limit: 500) {
        token {
          token_id
          name
          mime
          display_uri
          thumbnail_uri
          artifact_uri
          fa_contract
        }
      }
    }
  }`;

  // 2. Fetch full cruel_code collection (KT1E9Qo9FTYziBnkkSUoGzJm7ckSQSZG6qjg)
  const collectionQuery = `{
    token(
      where: { fa_contract: { _eq: "KT1E9Qo9FTYziBnkkSUoGzJm7ckSQSZG6qjg" } }
      order_by: { token_id: asc }
      limit: 100
    ) {
      token_id
      name
      mime
      display_uri
      thumbnail_uri
      artifact_uri
      fa_contract
    }
  }`;

  const [galleryRes, colRes] = await Promise.all([
    gql(galleryQuery),
    gql(collectionQuery)
  ]);

  if (galleryRes.errors) {
    console.error('Gallery API Error:', galleryRes.errors);
    return;
  }
  if (colRes.errors) {
    console.error('Collection API Error:', colRes.errors);
    return;
  }

  const galleries = galleryRes.data.gallery;
  const colTokens = colRes.data.token;
  console.log(`Curations fetched: ${galleries.length}`);
  console.log(`Tokens fetched from { cruel_c0de } collection: ${colTokens.length}`);

  // Find or augment the code curation with all tokens from KT1E9Qo9FTYziBnkkSUoGzJm7ckSQSZG6qjg
  const codeCuration = galleries.find(g => g.name.toLowerCase().includes('code'));
  if (codeCuration) {
    console.log(`Original tokens in "${codeCuration.name}": ${codeCuration.tokens.length}`);
    // Map of existing tokens by contract + token_id
    const existing = new Set(codeCuration.tokens.map(t => `${t.token.fa_contract}:${t.token.token_id}`));

    // Add any tokens from collection that weren't in the curation
    const colTokensFormatted = colTokens.map(t => ({ token: t }));
    
    // Sort collection tokens numerically by token_id (0, 1, 2, ... 24)
    colTokensFormatted.sort((a, b) => {
      const idA = parseInt(a.token.token_id, 10);
      const idB = parseInt(b.token.token_id, 10);
      return idA - idB;
    });

    // Other non-collection tokens from the curation
    const otherTokens = codeCuration.tokens.filter(t => t.token.fa_contract !== 'KT1E9Qo9FTYziBnkkSUoGzJm7ckSQSZG6qjg');

    // Combine: all 25 tokens of { cruel_c0de } first, followed by other curated code pieces
    codeCuration.tokens = [...colTokensFormatted, ...otherTokens];
    console.log(`Augmented tokens in "${codeCuration.name}": ${codeCuration.tokens.length} (${colTokens.length} from { cruel_c0de } + ${otherTokens.length} other curated code pieces)`);
  }

  const output = {
    data: {
      gallery: galleries,
      cruel_code_collection: colTokens
    }
  };

  fs.writeFileSync('objkt_data.json', JSON.stringify(output, null, 2));
  console.log('Successfully saved objkt_data.json');
})();
