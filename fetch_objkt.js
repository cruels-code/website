const https = require('https');
const fs = require('fs');

const query = `{
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
    tokens(limit: 300) {
      token {
        token_id
        name
        display_uri
        thumbnail_uri
        artifact_uri
        fa_contract
      }
    }
  }
}`;

const body = JSON.stringify({ query });

const options = {
  hostname: 'data.objkt.com',
  path: '/v3/graphql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': 'Mozilla/5.0'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.errors) {
        console.log('API Error:', JSON.stringify(parsed.errors, null, 2));
        return;
      }
      const output = { data: { gallery: parsed.data.gallery } };
      fs.writeFileSync('objkt_data.json', JSON.stringify(output, null, 2));
      console.log('SUCCESS: Wrote objkt_data.json');
      console.log('Curations found:', parsed.data.gallery.length);
      parsed.data.gallery.forEach(g => {
        console.log(` - "${g.name}": ${g.tokens.length} tokens`);
      });
    } catch(e) {
      console.error('Parse error:', e.message);
      console.log('Raw:', data.substring(0, 800));
    }
  });
});

req.on('error', e => console.error('Request error:', e.message));
req.write(body);
req.end();
