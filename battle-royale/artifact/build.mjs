import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('.');
const r = await build({
  entryPoints: ['artifact/entry.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020',
  define: { 'process.env.DEBUG_TP': 'undefined' },
  plugins: [{ name: 'abs', setup(b) { b.onResolve({ filter: /^\/shared\// }, (a) => ({ path: path.join(root, a.path) })); } }],
});
let js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
let html = fs.readFileSync('public/index.html', 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
let body = html.match(/<body>([\s\S]*?)<script type="module"/)[1];
body = body.replace('compartilhe o endereço desta página para amigos entrarem na mesma sala.', 'esta é a versão de teste: roda tudo no seu navegador, sozinho contra bots. O multiplayer online usa o servidor Node do repositório.');
const out = `<title>Fort Fort Battle Royale</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{color-scheme:dark}
${css}
html,body{background:#0b0b1a;color:#fff}
body{padding-left:0;padding-right:0}
</style>
${body}
<script>${js}</script>
`;
fs.writeFileSync('artifact/index.html', out);
console.log('size', (out.length / 1e6).toFixed(2), 'MB');
