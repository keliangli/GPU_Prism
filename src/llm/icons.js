import { ArrowRight, Boxes, ChevronRight, CodeXml, Compass, Copy, Cpu, FileJson, GitBranch, GitCommitHorizontal, HardDrive, Layers, LocateFixed, Microscope, PanelLeftClose, PanelRightClose, RefreshCw, Rotate3d, ScanLine, Sigma, SlidersHorizontal, Sparkles, Tag } from 'lucide';
const icons={'arrow-right':ArrowRight,'boxes':Boxes,'chevron-right':ChevronRight,'code-2':CodeXml,'compass':Compass,'copy':Copy,'cpu':Cpu,'file-json':FileJson,'git-branch':GitBranch,'git-commit-horizontal':GitCommitHorizontal,'hard-drive':HardDrive,'layers':Layers,'locate-fixed':LocateFixed,'microscope':Microscope,'panel-left-close':PanelLeftClose,'panel-right-close':PanelRightClose,'refresh-cw':RefreshCw,'rotate-3d':Rotate3d,'scan-line':ScanLine,'sigma':Sigma,'sliders':SlidersHorizontal,'sparkles':Sparkles,'tag':Tag};
export function renderLlmIcons(root){
 for(const placeholder of root.querySelectorAll('[data-lucide]')){
  const icon=icons[placeholder.dataset.lucide];if(!icon)continue;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value]of Object.entries({viewBox:'0 0 24 24',width:'24',height:'24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',class:placeholder.className}))svg.setAttribute(key,value);
  for(const [tag,attrs] of icon[2]){const child=document.createElementNS(svg.namespaceURI,tag);for(const [key,value] of Object.entries(attrs))child.setAttribute(key,String(value));svg.append(child);}
  placeholder.replaceWith(svg);
 }
}
