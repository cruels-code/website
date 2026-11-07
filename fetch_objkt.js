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

function isBurnAddress(address) {
  if (!address) return false;
  const a = address.toLowerCase();
  return (
    a.includes('burn') ||
    a === 'tz1ke2hzw2xnjrvnuddabohgv45q2uicbxkp' || // HEN burn
    a === 'tz1burnburnburnburnburnburnburjayjjx' || // Tezos standard burn
    a === 'tz1deaddeaddeaddeaddeaddeaddead85hj2' ||
    a === 'tz1zerozerozerozerozerozerozero24w1v'
  );
}

function isBurned(token) {
  if (!token) return true;
  const supply = parseInt(token.supply, 10);
  if (isNaN(supply) || supply <= 0) return true;

  if (token.holders && token.holders.length > 0) {
    const activeHolders = token.holders.filter(h => !isBurnAddress(h.holder_address) && parseInt(h.quantity, 10) > 0);
    const activeQty = activeHolders.reduce((sum, h) => sum + parseInt(h.quantity, 10), 0);
    if (activeQty === 0) return true;
  }
  return false;
}

(async () => {
  console.log('Fetching curations and cruel_code collection from Objkt GraphQL...');

  // 1. Fetch galleries / curations with supply and holders to detect burned items
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
          supply
          holders {
            holder_address
            quantity
          }
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
      supply
      holders {
        holder_address
        quantity
      }
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

  // Filter burned tokens from all curations
  galleries.forEach(g => {
    const origCount = g.tokens.length;
    g.tokens = g.tokens.filter(item => item.token && !isBurned(item.token));
    const removed = origCount - g.tokens.length;
    if (removed > 0) {
      console.log(`Filtered out ${removed} burned token(s) from curation "${g.name}"`);
    }
  });

  // Filter burned tokens from collection
  const activeColTokens = colTokens.filter(t => !isBurned(t));
  console.log(`Active tokens in { cruel_c0de } collection: ${activeColTokens.length} (filtered out ${colTokens.length - activeColTokens.length} burned)`);

  // Find or augment the code curation with all active tokens from KT1E9Qo9FTYziBnkkSUoGzJm7ckSQSZG6qjg
  const codeCuration = galleries.find(g => g.name.toLowerCase().includes('code'));
  if (codeCuration) {
    console.log(`Original active tokens in "${codeCuration.name}": ${codeCuration.tokens.length}`);

    // Add any active tokens from collection
    const colTokensFormatted = activeColTokens.map(t => ({ token: t }));
    
    // Sort collection tokens numerically by token_id (0, 2, 3, 4, 5, 7, 8, ...)
    colTokensFormatted.sort((a, b) => {
      const idA = parseInt(a.token.token_id, 10);
      const idB = parseInt(b.token.token_id, 10);
      return idA - idB;
    });

    // Other non-collection tokens from the curation that are active
    const otherTokens = codeCuration.tokens.filter(t => t.token.fa_contract !== 'KT1E9Qo9FTYziBnkkSUoGzJm7ckSQSZG6qjg');

    // Combine: active tokens of { cruel_c0de } first, followed by other curated active code pieces
    codeCuration.tokens = [...colTokensFormatted, ...otherTokens];
    console.log(`Augmented tokens in "${codeCuration.name}": ${codeCuration.tokens.length} (${activeColTokens.length} from { cruel_c0de } + ${otherTokens.length} other curated code pieces)`);
  }

  const output = {
    data: {
      gallery: galleries,
      cruel_code_collection: activeColTokens
    }
  };

  fs.writeFileSync('objkt_data.json', JSON.stringify(output, null, 2));
  console.log('Successfully saved objkt_data.json without burned tokens');
})();
