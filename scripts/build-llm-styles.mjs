import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from 'tailwindcss';

const root=fileURLToPath(new URL('../',import.meta.url));
const result=await postcss([tailwind({
  content:[`${root.replaceAll('\\','/')}src/llm/*.{html,js}`],
  theme:{extend:{fontFamily:{sans:['Inter','system-ui','sans-serif'],mono:['JetBrains Mono','monospace']},colors:{space:'#07090e',panel:'rgba(13,18,30,.78)',borderGlow:'rgba(56,189,248,.22)'}}}
})]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'+await fs.readFile(new URL('../src/llm/original.css',import.meta.url),'utf8'),{from:undefined});
result.root.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&/keyframes$/.test(rule.parent.name))return;
  rule.selector=postcss.list.comma(rule.selector).map(selector=>[':root','html','body',':host'].includes(selector)?'.llm-explorer':`.llm-explorer ${selector}`).join(', ');
});
await fs.writeFile(new URL('../src/llm/utilities.css',import.meta.url),result.root.toString());
