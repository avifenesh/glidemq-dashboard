const { copyFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const src = join(__dirname, '..', 'src', 'dashboard-ui.html');
const dest = join(__dirname, '..', 'dist', 'dashboard-ui.html');

mkdirSync(join(__dirname, '..', 'dist'), { recursive: true });
copyFileSync(src, dest);
