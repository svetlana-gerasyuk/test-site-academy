// Карусели кейса Orbita: вкладки, бесконечная автопрокрутка, стрелки и крупный просмотр
(function () {
  const tabs = [...document.querySelectorAll('.tabs__tab')];
  const panels = [...document.querySelectorAll('.gallery')];
  const box = document.querySelector('.lightbox');
  if (!tabs.length || !box) return;

  const AUTOPLAY_MS = 4500;   // пауза между слайдами
  const SLIDE_MS = 900;       // длительность плавного сдвига
  const IDLE_AFTER_USER = 6000;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => motionQuery.matches;

  const boxImg = box.querySelector('.lightbox__img');
  const boxCaption = box.querySelector('.lightbox__caption');
  const boxPrev = box.querySelector('.lightbox__prev');
  const boxNext = box.querySelector('.lightbox__next');

  const activePanel = () => panels.find((p) => !p.hidden);

  /* ---- Подготовка лент: [копии 7] [оригиналы 7] [копии 7] для бесконечного круга ---- */
  panels.forEach((panel) => {
    const track = panel.querySelector('.gallery__track');
    const real = [...track.querySelectorAll('.gallery__slide')];
    const n = real.length;
    const makeClones = () => real.map((slide, i) => {
      const clone = slide.cloneNode(true);
      clone.dataset.clone = String(i);
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelector('button').tabIndex = -1;
      return clone;
    });
    track.prepend(...makeClones());
    track.append(...makeClones());

    panel._track = track;
    panel._real = real;
    panel._n = n;
    panel._state = {
      anim: null,          // текущая анимация
      timer: null,         // автопрокрутка
      hover: false,
      focus: false,
      paused: false,       // остановлено кнопкой
      lastUser: 0,
      settle: null,
    };
  });

  const pitchOf = (panel) => {
    const s = panel._track.children;
    return s[1].offsetLeft - s[0].offsetLeft;
  };
  const indexOf = (panel) => Math.round(panel._track.scrollLeft / pitchOf(panel));
  const realIndex = (panel) => (((indexOf(panel) - panel._n) % panel._n) + panel._n) % panel._n;

  function jump(panel, left) {
    const track = panel._track;
    track.style.scrollSnapType = 'none';
    track.scrollLeft = left;
    void track.offsetWidth;
    track.style.scrollSnapType = '';
  }

  // держим позицию в средней (настоящей) группе слайдов
  function normalize(panel) {
    if (panel.hidden || panel._state.anim) return;
    const p = pitchOf(panel);
    if (!p) return;
    const idx = indexOf(panel);
    if (idx < panel._n) jump(panel, panel._track.scrollLeft + panel._n * p);
    else if (idx >= panel._n * 2) jump(panel, panel._track.scrollLeft - panel._n * p);
  }

  function toReal(panel, r) {
    jump(panel, (panel._n + r) * pitchOf(panel));
  }

  function updateCount(panel) {
    if (panel.hidden) return;
    panel.querySelector('[data-current]').textContent = realIndex(panel) + 1;
  }

  /* ---- Плавное движение ---- */
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function cancelAnim(panel) {
    const st = panel._state;
    if (!st.anim) return;
    cancelAnimationFrame(st.anim);
    st.anim = null;
    panel._track.style.scrollSnapType = '';
  }

  function slideBy(panel, count) {
    const track = panel._track;
    const st = panel._state;
    cancelAnim(panel);
    normalize(panel);
    const from = track.scrollLeft;
    const p = pitchOf(panel);
    const to = Math.round(from / p + count) * p;
    if (reducedMotion()) {
      jump(panel, to);
      normalize(panel);
      updateCount(panel);
      return;
    }
    track.style.scrollSnapType = 'none';
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / SLIDE_MS);
      track.scrollLeft = from + (to - from) * ease(t);
      if (t < 1) {
        st.anim = requestAnimationFrame(step);
      } else {
        st.anim = null;
        track.style.scrollSnapType = '';
        normalize(panel);
        updateCount(panel);
      }
    };
    st.anim = requestAnimationFrame(step);
  }

  const perView = (panel) => {
    const track = panel._track;
    return Math.max(1, Math.round(track.clientWidth / pitchOf(panel)));
  };

  /* ---- Автопрокрутка ---- */
  function shouldRun(panel) {
    const st = panel._state;
    return !panel.hidden && !st.paused && !st.hover && !st.focus && !box.open &&
      !reducedMotion() && !document.hidden && Date.now() - st.lastUser > IDLE_AFTER_USER;
  }

  function startAutoplay(panel) {
    const st = panel._state;
    clearInterval(st.timer);
    st.timer = setInterval(() => {
      if (shouldRun(panel) && !st.anim) slideBy(panel, 1);
    }, AUTOPLAY_MS);
  }

  function touchUser(panel) {
    panel._state.lastUser = Date.now();
    cancelAnim(panel);
  }

  /* ---- Вкладки ---- */
  function selectTab(index, focus) {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', on);
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    const panel = panels[index];
    if (!panel._ready) {
      toReal(panel, 0);
      panel._ready = true;
    }
    if (focus) tabs[index].focus();
    panel._state.lastUser = 0;
    updateCount(panel);
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(i));
    tab.addEventListener('keydown', (e) => {
      const last = tabs.length - 1;
      let next = null;
      if (e.key === 'ArrowRight') next = i === last ? 0 : i + 1;
      if (e.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = last;
      if (next !== null) {
        e.preventDefault();
        selectTab(next, true);
      }
    });
  });

  /* ---- Каждая лента ---- */
  panels.forEach((panel) => {
    const track = panel._track;
    const st = panel._state;

    track.addEventListener('scroll', () => {
      updateCount(panel);
      if (st.anim) return;
      clearTimeout(st.settle);
      st.settle = setTimeout(() => normalize(panel), 140);
    }, { passive: true });

    // ручное управление сбивает автопрокрутку на несколько секунд
    ['pointerdown', 'touchstart', 'wheel'].forEach((ev) =>
      track.addEventListener(ev, () => touchUser(panel), { passive: true }));

    // наведение мыши и фокус внутри — пауза
    const zone = panel;
    const canHover = window.matchMedia('(hover: hover)');
    zone.addEventListener('mouseenter', () => { st.hover = canHover.matches; });
    zone.addEventListener('mouseleave', () => { st.hover = false; });
    zone.addEventListener('focusin', (e) => { st.focus = e.target.matches(':focus-visible'); });
    zone.addEventListener('focusout', () => { st.focus = false; });

    panel.querySelectorAll('.gallery__nav [data-dir]').forEach((btn) => {
      btn.addEventListener('click', () => {
        st.lastUser = Date.now();
        slideBy(panel, Number(btn.dataset.dir) * perView(panel));
      });
    });

    const pause = panel.querySelector('.gallery__pause');
    if (pause) {
      pause.addEventListener('click', () => {
        st.paused = !st.paused;
        pause.setAttribute('aria-pressed', st.paused);
        pause.setAttribute('aria-label', st.paused ? 'Включить автопрокрутку' : 'Остановить автопрокрутку');
      });
    }

    panel.querySelectorAll('.gallery__slide').forEach((slide) => {
      const r = slide.dataset.clone !== undefined ? Number(slide.dataset.clone) : panel._real.indexOf(slide);
      slide.querySelector('.gallery__open').addEventListener('click', () => openBox(panel, r));
    });

    startAutoplay(panel);
  });

  // первая лента — сразу в начальное положение
  const first = activePanel();
  toReal(first, 0);
  first._ready = true;
  updateCount(first);

  window.addEventListener('resize', () => {
    const panel = activePanel();
    if (!panel) return;
    cancelAnim(panel);
    toReal(panel, realIndex(panel));
  });

  motionQuery.addEventListener('change', () => panels.forEach(cancelAnim));

  /* ---- Крупный просмотр ---- */
  let boxPanel = null;
  let boxIndex = 0;

  function showInBox() {
    const img = boxPanel._real[boxIndex].querySelector('img');
    boxImg.src = img.currentSrc || img.src;
    boxImg.alt = img.alt;
    boxCaption.textContent = 'Карусель ' + (panels.indexOf(boxPanel) + 1) +
      ', слайд ' + (boxIndex + 1) + ' из ' + boxPanel._n;
    boxPrev.disabled = boxIndex === 0;
    boxNext.disabled = boxIndex === boxPanel._n - 1;
  }

  function openBox(panel, index) {
    boxPanel = panel;
    boxIndex = index;
    cancelAnim(panel);
    showInBox();
    box.showModal();
  }

  function stepBox(dir) {
    const n = boxIndex + dir;
    if (n < 0 || n >= boxPanel._n) return;
    boxIndex = n;
    showInBox();
  }

  box.addEventListener('close', () => {
    if (!boxPanel) return;
    boxPanel._state.lastUser = Date.now();
    toReal(boxPanel, boxIndex);
    updateCount(boxPanel);
    boxPanel._real[boxIndex].querySelector('.gallery__open').focus({ preventScroll: true });
  });

  boxPrev.addEventListener('click', () => stepBox(-1));
  boxNext.addEventListener('click', () => stepBox(1));
  box.querySelector('.lightbox__close').addEventListener('click', () => box.close());

  box.addEventListener('click', (e) => {
    if (e.target === box || e.target === box.querySelector('.lightbox__figure')) box.close();
  });

  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') stepBox(-1);
    if (e.key === 'ArrowRight') stepBox(1);
  });

  // свайп в крупном просмотре
  let startX = null;
  box.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) stepBox(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
