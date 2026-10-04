const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const logoPath = path.join(root, 'public', 'coval-logo.jpg');
const iconPath = path.join(root, 'public', 'icon.svg');

if (fs.existsSync(logoPath)) {
  const buf = fs.readFileSync(logoPath);
  const b64 = buf.toString('base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <image href="data:image/jpeg;base64,${b64}" width="1024" height="1024"/>
</svg>\n`;
  fs.writeFileSync(iconPath, svg, 'utf-8');
  console.log('Successfully generated public/icon.svg embedding the official COVAL logo image.');
} else {
  console.error('Could not find', logoPath);
}
