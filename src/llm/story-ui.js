import './story.css';

const formatTime = value => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** The controller owns playback; this view only emits navigation intentions. */
export function mountStoryUi(root, callbacks = {}) {
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'llm-story-launcher';
  launcher.setAttribute('aria-pressed', 'false');
  launcher.innerHTML = '<span class="llm-story-launch-icon" aria-hidden="true">▷</span><span>故事讲解</span><span class="llm-story-launch-sub">跟随一个 Token</span>';
  (root.querySelector('.llm-topbar') || root).append(launcher);

  const panel = document.createElement('section');
  panel.className = 'llm-story-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', '模型架构故事讲解');
  panel.innerHTML = `
    <div class="llm-story-heading">
      <div class="llm-story-eyebrow"><span aria-hidden="true"></span>ARCHITECTURE STORY</div>
      <button type="button" class="llm-story-exit" data-story-action="exit" aria-label="退出故事，返回自由探索" title="返回自由探索">退出 <span aria-hidden="true">↗</span></button>
    </div>
    <div class="llm-story-model"></div>
    <p class="llm-story-title"></p>
    <nav class="llm-story-chapters" aria-label="故事章节"></nav>
    <div class="llm-story-current" aria-live="polite" aria-atomic="true">
      <div class="llm-story-chapter-meta"><span class="llm-story-chapter-number"></span><span class="llm-story-chapter-title"></span></div>
      <h2 class="llm-story-question"></h2>
      <p class="llm-story-body"></p>
      <p class="llm-story-metric"></p>
    </div>
    <div class="llm-story-transport">
      <div class="llm-story-progress" role="progressbar" aria-label="故事总进度" aria-valuemin="0" aria-valuemax="100"><span></span></div>
      <div class="llm-story-time"><span class="llm-story-state"></span><span class="llm-story-time-value"></span></div>
      <div class="llm-story-buttons">
        <button type="button" data-story-action="prev" aria-label="上一章"><span aria-hidden="true">←</span> 上一章</button>
        <button type="button" class="llm-story-play" data-story-action="play" aria-label="暂停故事"><span aria-hidden="true">Ⅱ</span><span>暂停</span></button>
        <button type="button" data-story-action="next" aria-label="下一章">下一章 <span aria-hidden="true">→</span></button>
      </div>
    </div>
    <p class="llm-story-disclaimer">机制示意 · 非实际推理记录<br><span>拖动画面可暂停讲解，自由查看细节。</span></p>
  `;
  root.append(panel);
  const find = selector => panel.querySelector(selector);
  const nav = find('.llm-story-chapters');
  const progress = find('.llm-story-progress');
  const progressFill = progress.firstElementChild;
  const stateEl = find('.llm-story-state');
  const timeEl = find('.llm-story-time-value');
  const playButton = find('[data-story-action="play"]');
  const prevButton = find('[data-story-action="prev"]');
  const nextButton = find('[data-story-action="next"]');
  let disposed = false, chaptersKey = '', narrationKey = '', previousActive = false;
  let timeKey = '', transportKey = '', buttons = [];
  const onLaunch = () => callbacks.onStart?.();
  const onPanelClick = event => {
    const chapterButton = event.target.closest('[data-story-index]');
    if (chapterButton && panel.contains(chapterButton)) {
      callbacks.onSeek?.(Number(chapterButton.dataset.storyIndex));
      return;
    }
    const button = event.target.closest('[data-story-action]');
    if (!button || !panel.contains(button) || button.disabled) return;
    ({ prev: callbacks.onPrev, next: callbacks.onNext, play: callbacks.onTogglePlay, exit: callbacks.onExit })[button.dataset.storyAction]?.();
  };
  launcher.addEventListener('click', onLaunch);
  panel.addEventListener('click', onPanelClick);

  function update(view = {}) {
    if (disposed) return;
    const chapters = view.chapters || [];
    const active = Boolean(view.active), available = view.available !== false && chapters.length > 0;
    const index = Math.max(0, Math.min(chapters.length - 1, Number(view.index) || 0));
    const chapter = chapters[index] || {};
    const total = chapters.reduce((sum, item) => sum + Math.max(0, Number(item.duration) || 0), 0);
    const elapsed = Math.max(0, Math.min(total, Number(view.elapsed) || 0));
    const chapterElapsed = Math.max(0, Number(view.chapterElapsed) || 0);
    launcher.disabled = !available;
    launcher.querySelector('.llm-story-launch-sub').textContent = available ? '跟随一个 Token' : '内部架构未披露';
    launcher.setAttribute('aria-label', available ? '故事讲解：跟随一个 Token 探索模型' : '故事讲解不可用：当前模型内部架构未披露');
    launcher.title = available ? '跟随章节探索当前模型的计算机制' : '该模型尚未公开内部架构，暂不提供故事讲解';
    launcher.setAttribute('aria-pressed', String(active));
    panel.hidden = !active;
    root.classList.toggle('llm-story-active', active);

    const nextChaptersKey = JSON.stringify([view.modelName, view.title, chapters.map(item => [item.id, item.title, item.duration])]);
    if (nextChaptersKey !== chaptersKey) {
      chaptersKey = nextChaptersKey;
      buttons = chapters.map((item, chapterIndex) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.storyIndex = String(chapterIndex);
        button.title = `${chapterIndex + 1}. ${item.question || item.title || ''}`;
        const number = document.createElement('span');
        number.className = 'llm-story-step-number';
        number.textContent = String(chapterIndex + 1).padStart(2, '0');
        const label = document.createElement('span');
        label.textContent = item.title || `第 ${chapterIndex + 1} 章`;
        button.append(number, label);
        return button;
      });
      nav.replaceChildren(...buttons);
      find('.llm-story-model').textContent = view.modelName || '模型架构';
      find('.llm-story-title').textContent = view.title || '跟随一个 Token，理解模型如何计算';
      narrationKey = '';
    }

    const nextNarrationKey = JSON.stringify([nextChaptersKey, index, chapter.question, chapter.body, chapter.metric]);
    if (nextNarrationKey !== narrationKey) {
      narrationKey = nextNarrationKey;
      find('.llm-story-chapter-number').textContent = `${String(index + 1).padStart(2, '0')} / ${String(chapters.length).padStart(2, '0')}`;
      find('.llm-story-chapter-title').textContent = chapter.title || '';
      find('.llm-story-question').textContent = chapter.question || chapter.title || '';
      find('.llm-story-body').textContent = chapter.body || '';
      const metric = find('.llm-story-metric');
      metric.textContent = chapter.metric || '';
      metric.hidden = !chapter.metric;
      buttons.forEach((button, buttonIndex) => {
        if (buttonIndex === index) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
        button.classList.toggle('llm-story-step-done', buttonIndex < index);
      });
    }

    const nextTransportKey = `${view.playing}:${view.completed}:${index}:${chapters.length}:${view.status || ''}`;
    if (nextTransportKey !== transportKey) {
      transportKey = nextTransportKey;
      const label = view.completed ? '重新播放' : view.playing ? '暂停' : '继续';
      playButton.children[0].textContent = view.completed ? '↺' : view.playing ? 'Ⅱ' : '▷';
      playButton.children[1].textContent = label;
      playButton.setAttribute('aria-label', `${label}故事`);
      prevButton.disabled = index <= 0;
      nextButton.disabled = index >= chapters.length - 1;
      stateEl.textContent = view.status || (view.completed ? '讲解完成 · 可返回任意章节' : view.playing ? '正在讲解' : '已暂停 · 可拖动探索');
      stateEl.dataset.playing = String(Boolean(view.playing));
    }

    // Keep the live narration and chapter DOM untouched while the clock advances.
    const nextTimeKey = `${Math.floor(elapsed)}:${Math.floor(total)}`;
    if (nextTimeKey !== timeKey) {
      timeKey = nextTimeKey;
      timeEl.textContent = `${formatTime(elapsed)} / ${formatTime(total)}`;
      progress.setAttribute('aria-valuenow', String(total ? Math.round(elapsed / total * 100) : 0));
      progress.setAttribute('aria-valuetext', `${formatTime(elapsed)}，共 ${formatTime(total)}`);
    }
    progressFill.style.transform = `scaleX(${total ? elapsed / total : 0})`;
    if (buttons[index]) buttons[index].style.setProperty('--chapter-progress', `${Math.min(1, chapterElapsed / (Number(chapter.duration) || 1)) * 100}%`);
    if (active && !previousActive) narrationKey = '';
    previousActive = active;
  }

  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      launcher.removeEventListener('click', onLaunch);
      panel.removeEventListener('click', onPanelClick);
      launcher.remove();
      panel.remove();
      root.classList.remove('llm-story-active');
    }
  };
}
