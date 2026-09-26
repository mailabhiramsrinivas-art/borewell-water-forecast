/* Offline handoff equation rendering, outside the published site.
   npm install mathjax-full sharp; node tools/render_equations.js SOURCE.md OUTPUT_DIR */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),sharp=require('sharp');
const {mathjax}=require('mathjax-full/js/mathjax.js');
const {TeX}=require('mathjax-full/js/input/tex.js');
const {SVG}=require('mathjax-full/js/output/svg.js');
const {liteAdaptor}=require('mathjax-full/js/adaptors/liteAdaptor.js');
const {RegisterHTMLHandler}=require('mathjax-full/js/handlers/html.js');
const {AllPackages}=require('mathjax-full/js/input/tex/AllPackages.js');
const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor);
const doc=mathjax.document('',{InputJax:new TeX({packages:AllPackages}),OutputJax:new SVG({fontCache:'local'})});
async function main(){
 const source=process.argv[2],out=process.argv[3];fs.mkdirSync(out,{recursive:true});const manifest={};
 for(const m of fs.readFileSync(source,'utf8').matchAll(/\$\$([\s\S]*?)\$\$/g)) {
  const tex=m[1].trim().replace(/\s+/g,' '),key=crypto.createHash('sha256').update(tex).digest('hex').slice(0,16);
  const svg=adaptor.outerHTML(doc.convert(tex,{display:true}));
  if(svg.includes('data-mjx-error'))throw Error('Math rendering failed: '+tex);
  const start=svg.indexOf('<svg'),end=svg.lastIndexOf('</svg>')+6;let only=svg.slice(start,end);
  const widthEx=Number(only.match(/width="([\d.]+)ex"/)[1]);
  only=only.replace('currentColor','#222');
  await sharp(Buffer.from(only),{density:600}).png().toFile(path.join(out,key+'.png'));
  manifest[key]={width_inches:Math.min(6.5,widthEx*5/72),tex};
 }
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest));console.log('Rendered',Object.keys(manifest).length,'equations');
}
main().catch(e=>{console.error(e);process.exit(1);});
