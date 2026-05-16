const fs = require('fs');
const html = fs.readFileSync('curation_ctrlc.html', 'utf8');
const m = html.match(/data-generator="([^"]+)"/);
if (m) {
    console.log('First generator URL:', m[1]);
    if (m[1].includes('&amp;')) console.log('OK: ampersand is HTML-encoded as &amp;');
    else if (m[1].includes('&')) console.log('WARN: raw & in attribute - needs &amp; encoding');
    else console.log('No ampersand found');
}
