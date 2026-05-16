const fs = require('fs');

async function fetchCurations() {
    try {
        const query = `
        query GetCurations {
          gallery(where: {curators: {curator_address: {_eq: "tz1h7sQhBdKfiiAYXvtTFNPocFG92b47K94Y"}}}) {
            name
            slug
            tokens {
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
        
        const response = await fetch('https://data.objkt.com/v3/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        
        const data = await response.json();
        fs.writeFileSync('objkt_data.json', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

fetchCurations();
