const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

// Explicit story playback controls the demonstration, independently of the
// exploration flow switch. Reduced motion affects camera travel, not playback.
export function llmAnimationRunning({storyActive, storyPlaying, flowRunning, hidden = false}) {
  return !hidden && Boolean(storyActive ? storyPlaying : flowRunning);
}

export function storyCameraOffset(offset, progress, reducedMotion = false) {
  if (reducedMotion) return [...offset];
  const p = clamp01(progress), eased = p * p * (3 - 2 * p);
  const angle = (eased - .5) * .16, scale = 1 - .025 * Math.sin(p * Math.PI);
  const [x,y,z] = offset;
  return [(x * Math.cos(angle) + z * Math.sin(angle)) * scale,y * scale,(-x * Math.sin(angle) + z * Math.cos(angle)) * scale];
}

// Stable teaching routes: exact Top-K, model-sized IDs, no captured runtime data.
export function storyExperts(config, step) {
  const total = Math.max(0, Math.floor(config.n_routed_experts || 0));
  const count = Math.min(total, Math.max(0, Math.floor(config.num_experts_per_tok || 0)));
  if (!count) return [];
  const start = ((Math.floor(step || 0) * (count + 1)) % total + total) % total;
  return Array.from({length:count},(_,i)=>(start+i)%total).sort((a,b)=>a-b);
}
