/* ============================================================
   SENSORIAL — motion.js
   Camada de movimento da landing (site-10k / motion module)
   Stack: GSAP 3.12.5 + ScrollTrigger + Lenis 1.0.42 (CDN)
   Auto-inicializável (DOMContentLoaded), tolerante a seletor
   ausente, rAF único pra rede neural, IO pra ligar/desligar.
   ============================================================ */
(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOBILE = window.matchMedia('(max-width: 768px)').matches;
  var HAS_GSAP = typeof window.gsap !== 'undefined';
  var HAS_ST = typeof window.ScrollTrigger !== 'undefined';
  var HAS_LENIS = typeof window.Lenis !== 'undefined';

  if (HAS_GSAP && HAS_ST) gsap.registerPlugin(ScrollTrigger);

  var lenis = null;

  /* ----------------------------------------------------------
     12. SETUP — Lenis + ScrollTrigger + anchors
     ---------------------------------------------------------- */
  function initLenis() {
    if (!HAS_LENIS || REDUCED) return;
    lenis = new Lenis({
      duration: 1.0,
      lerp: 0.1,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true
    });
    if (HAS_ST) lenis.on('scroll', ScrollTrigger.update);
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);

    // Anchor links suaves
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href === '#') return;
      a.addEventListener('click', function (e) {
        var target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: 0, duration: 1.2 });
      });
    });
  }

  /* ----------------------------------------------------------
     1. REDE NEURAL DO HERO (#neural-canvas)
     SVG gerado via JS, seed fixa, rAF único, pausa fora de
     cena (IO) e em document.hidden.
     ---------------------------------------------------------- */
  function initNeural() {
    var host = document.getElementById('neural-canvas');
    if (!host) return;

    var VW = 1440, VH = 900;
    var NODE_COUNT = MOBILE ? 16 : 32;
    var NS = 'http://www.w3.org/2000/svg';

    // RNG com seed fixa (mulberry32) — layout idêntico a cada load
    function mulberry32(seed) {
      return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    var rng = mulberry32(20260612);

    // Nós: rejection sampling — mais densos nas bordas,
    // centro (zona do headline) mais livre
    var nodes = [];
    var guard = 0;
    while (nodes.length < NODE_COUNT && guard < 4000) {
      guard++;
      var x = 60 + rng() * (VW - 120);
      var y = 60 + rng() * (VH - 120);
      var cx = Math.abs(x - VW / 2) / (VW / 2); // 0 centro, 1 borda
      var cy = Math.abs(y - VH / 2) / (VH / 2);
      var edgeness = Math.max(cx, cy);
      if (rng() > 0.18 + 0.82 * edgeness * edgeness) continue;
      nodes.push({ x: x, y: y, r: 1.8 + rng() * 1.8, phase: rng() * Math.PI * 2, speed: 0.4 + rng() * 0.5 });
    }

    // Arestas: cada nó conecta aos 2 vizinhos mais próximos (até 300px)
    var edges = [];
    var seen = {};
    nodes.forEach(function (n, i) {
      var dists = nodes.map(function (m, j) {
        if (i === j) return null;
        var dx = m.x - n.x, dy = m.y - n.y;
        return { j: j, d: Math.hypot(dx, dy) };
      }).filter(Boolean).sort(function (a, b) { return a.d - b.d; });
      dists.slice(0, 2).forEach(function (c) {
        if (c.d > 300) return;
        var key = Math.min(i, c.j) + '-' + Math.max(i, c.j);
        if (seen[key]) return;
        seen[key] = true;
        edges.push({ a: i, b: c.j, len: c.d, op: 0.14 + rng() * 0.11 });
      });
    });

    // Monta o SVG
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.setAttribute('aria-hidden', 'true');
    var layer = document.createElementNS(NS, 'g');
    layer.setAttribute('class', 'neural-layer');
    svg.appendChild(layer);

    var edgeEls = edges.map(function (e) {
      var n1 = nodes[e.a], n2 = nodes[e.b];
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('class', 'neural-edge');
      p.setAttribute('d', 'M' + n1.x.toFixed(1) + ' ' + n1.y.toFixed(1) +
        ' L' + n2.x.toFixed(1) + ' ' + n2.y.toFixed(1));
      p.setAttribute('stroke-opacity', e.op.toFixed(2));
      layer.appendChild(p);
      return p;
    });

    var nodeEls = nodes.map(function (n) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', 'neural-node');
      c.setAttribute('cx', n.x.toFixed(1));
      c.setAttribute('cy', n.y.toFixed(1));
      c.setAttribute('r', n.r.toFixed(1));
      c.setAttribute('opacity', '0.5');
      layer.appendChild(c);
      return c;
    });

    host.appendChild(svg);

    // (a) Draw-in das arestas no load (stagger ~1.2s total)
    if (!REDUCED) {
      edgeEls.forEach(function (p, i) {
        var len = p.getTotalLength();
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len;
        if (HAS_GSAP) {
          gsap.to(p, {
            strokeDashoffset: 0,
            duration: 0.7,
            delay: (i / edgeEls.length) * 1.2,
            ease: 'power2.out',
            clearProps: 'strokeDasharray,strokeDashoffset'
          });
        } else {
          p.style.transition = 'stroke-dashoffset 0.7s ' + ((i / edgeEls.length) * 1.2) + 's cubic-bezier(0.2,0.8,0.3,1)';
          requestAnimationFrame(function () { p.style.strokeDashoffset = '0'; });
        }
      });
    } else {
      // reduced motion: rede aparece pronta, sem loop
      return;
    }

    // (b) Pulsos sinápticos + (d) opacity dos nós — rAF ÚNICO
    var MAX_PULSES = MOBILE ? 2 : 4;
    var pulses = [];
    function spawnPulse(now) {
      if (!edges.length) return;
      var e = edges[Math.floor(Math.random() * edges.length)];
      var el = document.createElementNS(NS, 'circle');
      el.setAttribute('class', 'neural-pulse');
      el.setAttribute('r', '2.4');
      layer.appendChild(el);
      pulses.push({
        el: el, edge: e, t0: now,
        dur: 1800 + Math.random() * 1600,
        flip: Math.random() < 0.5
      });
    }

    var running = false, inView = false, rafId = null;
    var mx = 0, my = 0, tx = 0, ty = 0; // parallax targets / atuais
    var nextSpawn = 0;

    function tick(now) {
      if (!running) return;
      rafId = requestAnimationFrame(tick);

      // pulsos: 2-4 simultâneos, respawn randomizado
      if (pulses.length < MAX_PULSES && now > nextSpawn) {
        spawnPulse(now);
        nextSpawn = now + 400 + Math.random() * 900;
      }
      for (var i = pulses.length - 1; i >= 0; i--) {
        var p = pulses[i];
        var t = (now - p.t0) / p.dur;
        if (t >= 1) {
          p.el.remove();
          pulses.splice(i, 1);
          continue;
        }
        var n1 = nodes[p.flip ? p.edge.b : p.edge.a];
        var n2 = nodes[p.flip ? p.edge.a : p.edge.b];
        var px = n1.x + (n2.x - n1.x) * t;
        var py = n1.y + (n2.y - n1.y) * t;
        p.el.setAttribute('cx', px.toFixed(1));
        p.el.setAttribute('cy', py.toFixed(1));
        // fade in/out nas pontas
        var fade = Math.min(1, Math.min(t, 1 - t) * 5);
        p.el.setAttribute('opacity', (0.9 * fade).toFixed(2));
      }

      // nós pulsando opacity (suave, dessincronizado)
      var ts = now / 1000;
      for (var k = 0; k < nodes.length; k++) {
        var n = nodes[k];
        nodeEls[k].setAttribute('opacity',
          (0.45 + 0.25 * Math.sin(ts * n.speed + n.phase)).toFixed(2));
      }

      // (c) parallax do mouse — lerp 0.06, máx 14px
      if (!MOBILE) {
        tx += (mx - tx) * 0.06;
        ty += (my - ty) * 0.06;
        layer.setAttribute('transform',
          'translate(' + tx.toFixed(2) + ' ' + ty.toFixed(2) + ')');
      }
    }

    function start() {
      if (running || !inView || document.hidden) return;
      running = true;
      rafId = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    }

    // pausa fora do viewport
    var io = new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView) start(); else stop();
    }, { threshold: 0 });
    io.observe(host);

    // pausa em aba oculta
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    }, { passive: true });

    // mouse parallax (só desktop)
    if (!MOBILE) {
      window.addEventListener('mousemove', function (e) {
        mx = (e.clientX / window.innerWidth - 0.5) * 28;  // ±14px
        my = (e.clientY / window.innerHeight - 0.5) * 28;
      }, { passive: true });
    }
  }

  /* ----------------------------------------------------------
     2. ENTRADA DO HERO — coreografia
     Ordem: kicker → headline (linhas) → sub → bullets → CTA
     ---------------------------------------------------------- */
  function initHeroEntrance() {
    var hero = document.querySelector('[data-hero]');
    if (!hero) return;

    var kicker = hero.querySelector('[data-hero-kicker]');
    var lines = hero.querySelectorAll('.hero-line .line-inner');
    var sub = hero.querySelector('[data-hero-sub]');
    var bullets = hero.querySelectorAll('[data-hero-bullet]');
    var cta = hero.querySelectorAll('[data-hero-cta]');

    if (REDUCED || !HAS_GSAP) {
      // CSS do reduced-motion já mostra tudo; garante via inline
      if (!HAS_GSAP) {
        [kicker, sub].concat(Array.prototype.slice.call(bullets), Array.prototype.slice.call(cta))
          .forEach(function (el) { if (el) { el.style.opacity = '1'; el.style.transform = 'none'; } });
        lines.forEach(function (l) { l.style.transform = 'none'; });
      }
      cta.forEach(function (c) { c.classList.add('is-lit'); });
      return;
    }

    var tl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 0.15 });

    if (kicker) tl.to(kicker, { opacity: 1, duration: 0.7 }, 0);
    if (lines.length) {
      // estado inicial vem do CSS (translateY(110%)); GSAP assume e anima pra 0
      gsap.set(lines, { yPercent: 110, y: 0 });
      tl.to(lines, {
        yPercent: 0,
        duration: 1.0,
        stagger: 0.09,
        onStart: function () {
          lines.forEach(function (l) { l.style.willChange = 'transform'; });
        },
        onComplete: function () {
          lines.forEach(function (l) { l.style.willChange = ''; });
        }
      }, 0.25);
    }
    if (sub) {
      gsap.set(sub, { y: 18 });
      tl.to(sub, { opacity: 1, y: 0, duration: 0.8 }, '-=0.55');
    }
    if (bullets.length) {
      gsap.set(bullets, { y: 14 });
      tl.to(bullets, { opacity: 1, y: 0, duration: 0.6, stagger: 0.09 }, '-=0.45');
    }
    if (cta.length) {
      tl.to(cta, {
        opacity: 1, scale: 1, duration: 0.7, ease: 'back.out(1.4)',
        onComplete: function () {
          cta.forEach(function (c) { c.classList.add('is-lit'); });
        }
      }, '-=0.3');
    }

    // FAILSAFE — o hero NUNCA pode ficar invisivel. Se o rAF estiver travado
    // (aba em segundo plano / throttle), o GSAP nao anima e o texto some.
    // setTimeout dispara mesmo com rAF parado: depois do tempo da animacao,
    // forca o estado final. Se a animacao ja rodou, isso e um no-op visual.
    function forceHeroVisible() {
      try { tl.progress(1); } catch (e) {}
      if (kicker) kicker.style.opacity = '1';
      if (sub) { sub.style.opacity = '1'; sub.style.transform = 'none'; }
      bullets.forEach(function (b) { b.style.opacity = '1'; b.style.transform = 'none'; });
      cta.forEach(function (c) { c.style.opacity = '1'; c.style.transform = 'none'; c.classList.add('is-lit'); });
      lines.forEach(function (l) { l.style.transform = 'none'; l.style.willChange = ''; });
    }
    setTimeout(forceHeroVisible, 1800);
    window.addEventListener('load', function () { setTimeout(forceHeroVisible, 1800); }, { passive: true });
  }

  /* ----------------------------------------------------------
     3. REVEAL CINEMATOGRÁFICO [data-reveal]
        + 6. compare lateral [data-compare-left/right]
        (mesmo observer, batch com stagger 80ms p/ cards)
     ---------------------------------------------------------- */
  function initReveals() {
    var els = document.querySelectorAll('[data-reveal], [data-compare-left], [data-compare-right]');
    if (!els.length) return;

    if (REDUCED) {
      els.forEach(function (el) { el.classList.add('is-revealed'); });
      return;
    }

    // delay opcional via atributo (ms)
    els.forEach(function (el) {
      var d = el.getAttribute('data-reveal-delay');
      if (d) el.style.setProperty('--reveal-delay', (parseInt(d, 10) || 0) + 'ms');
    });

    function reveal(el, stagger) {
      if (el.classList.contains('is-revealed')) return;
      var base = parseInt(el.getAttribute('data-reveal-delay') || '0', 10) || 0;
      el.style.setProperty('--reveal-delay', (base + (stagger || 0)) + 'ms');
      el.classList.add('is-animating', 'is-revealed');
      el.addEventListener('transitionend', function onEnd(ev) {
        if (ev.propertyName !== 'transform') return;
        el.classList.remove('is-animating');
        el.style.removeProperty('--reveal-delay');
        el.removeEventListener('transitionend', onEnd);
      });
    }

    // Sem IntersectionObserver (browser antigo): mostra tudo, sem risco de branco.
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach(function (el) { el.classList.add('is-revealed'); });
      return;
    }

    // Revela DIRETO no callback do IO (sem rAF/flush — rAF travado nao pode
    // mais deixar conteudo invisivel). Stagger por indice do batch via CSS delay.
    var io = new IntersectionObserver(function (entries) {
      var i = 0;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        reveal(entry.target, (i++) * 80); // stagger natural de cards irmaos
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });

    els.forEach(function (el) { io.observe(el); });

    // FAILSAFE — conteudo nunca pode ficar em branco.
    // Qualquer coisa no/acima do viewport (load em scroll, IO lento) revela ja.
    function revealVisible() {
      els.forEach(function (el) {
        if (el.classList.contains('is-revealed')) return;
        if (el.getBoundingClientRect().top < window.innerHeight * 0.95) {
          io.unobserve(el);
          el.classList.add('is-revealed');
        }
      });
    }
    revealVisible();
    window.addEventListener('load', revealVisible, { passive: true });
    setTimeout(revealVisible, 700);
  }

  /* ----------------------------------------------------------
     4. COUNT-UP [data-counter]
     <span data-counter data-target="80" data-prefix="+" data-suffix=" mil">
     ---------------------------------------------------------- */
  function initCounters() {
    var counters = document.querySelectorAll('[data-counter]');
    if (!counters.length) return;

    function render(el, val) {
      var prefix = el.getAttribute('data-prefix') || '';
      var suffix = el.getAttribute('data-suffix') || '';
      el.textContent = prefix + Math.floor(val).toLocaleString('pt-BR') + suffix;
    }

    counters.forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-target') || '0');
      if (REDUCED || !HAS_GSAP) { render(el, target); return; }
      render(el, 0);
    });

    if (REDUCED || !HAS_GSAP) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        var target = parseFloat(el.getAttribute('data-target') || '0');
        var obj = { val: 0 };
        gsap.to(obj, {
          val: target,
          duration: 2.0,
          ease: 'power2.out',
          onUpdate: function () { render(el, obj.val); },
          onComplete: function () { render(el, target); }
        });
        // failsafe por counter: se o count-up nao progrediu (rAF travado),
        // snap pro valor final. setTimeout roda mesmo com rAF parado.
        setTimeout(function () {
          if ((parseFloat((el.textContent || '').replace(/\D/g, '')) || 0) < target) render(el, target);
        }, 2400);
      });
    }, { threshold: 0.4 });

    counters.forEach(function (el) { io.observe(el); });

    // FAILSAFE — numero de credibilidade nunca pode ficar travado em "0".
    // Se o rAF estiver parado, o count-up nao roda; depois de um tempo,
    // qualquer counter ainda zerado e visivel recebe o valor final.
    function settleCounters() {
      counters.forEach(function (el) {
        var target = parseFloat(el.getAttribute('data-target') || '0');
        var cur = parseFloat((el.textContent || '').replace(/\D/g, '')) || 0;
        if (cur < target && el.getBoundingClientRect().top < window.innerHeight) {
          io.unobserve(el);
          render(el, target);
        }
      });
    }
    window.addEventListener('load', function () { setTimeout(settleCounters, 2600); }, { passive: true });
    setTimeout(settleCounters, 2600);
  }

  /* ----------------------------------------------------------
     5 + 11. MARQUEES — duplica conteúdo pro loop seamless
     (animação roda em CSS; translateX -50% emenda exato)
     ---------------------------------------------------------- */
  function initMarquees() {
    ['#client-marquee .marquee-track', '#type-marquee .type-track'].forEach(function (sel) {
      var track = document.querySelector(sel);
      if (!track) return;
      var original = track.innerHTML;
      // garante largura >= 2x o container, sempre em nº PAR de cópias
      var container = track.parentElement;
      var copies = 1;
      while (track.scrollWidth < container.clientWidth * 2 && copies < 8) {
        track.innerHTML += original;
        copies++;
      }
      if (copies % 2 !== 0) track.innerHTML += original;
      track.setAttribute('aria-hidden', 'false');
    });
  }

  /* ----------------------------------------------------------
     6. LINHA CONECTORA do compare (#compare-line)
     stroke-dashoffset scrubado no scroll
     ---------------------------------------------------------- */
  function initCompareLine() {
    var svg = document.getElementById('compare-line');
    if (!svg) return;
    var path = svg.querySelector('.compare-path');
    if (!path) return;

    var len = path.getTotalLength();
    path.style.strokeDasharray = len;

    if (REDUCED || !HAS_GSAP || !HAS_ST) {
      path.style.strokeDashoffset = 0;
      return;
    }

    path.style.strokeDashoffset = len;
    gsap.to(path, {
      strokeDashoffset: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: svg,
        start: 'top 80%',
        end: 'bottom 35%',
        scrub: 1
      }
    });
  }

  /* ----------------------------------------------------------
     9. PROGRESS BAR (#progress)
     ---------------------------------------------------------- */
  function initProgress() {
    var bar = document.getElementById('progress');
    if (!bar) return;

    if (HAS_GSAP && HAS_ST && !REDUCED) {
      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: function (self) {
          bar.style.transform = 'scaleX(' + self.progress + ')';
        }
      });
    } else {
      // fallback rAF-throttled
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          var max = document.documentElement.scrollHeight - window.innerHeight;
          bar.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
          ticking = false;
        });
      }, { passive: true });
    }
  }

  /* ----------------------------------------------------------
     10. NAV (#site-nav) — .is-scrolled após 40px
     ---------------------------------------------------------- */
  function initNav() {
    var nav = document.getElementById('site-nav');
    if (!nav) return;
    var ticking = false;
    function update() {
      nav.classList.toggle('is-scrolled', window.scrollY > 40);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  /* ----------------------------------------------------------
     BOOT
     ---------------------------------------------------------- */
  function boot() {
    document.documentElement.classList.add('js');
    try { initLenis(); } catch (e) { console.warn('[motion] lenis:', e); }
    try { initNeural(); } catch (e) { console.warn('[motion] neural:', e); }
    try { initHeroEntrance(); } catch (e) { console.warn('[motion] hero:', e); }
    try { initReveals(); } catch (e) { console.warn('[motion] reveals:', e); }
    try { initCounters(); } catch (e) { console.warn('[motion] counters:', e); }
    try { initMarquees(); } catch (e) { console.warn('[motion] marquees:', e); }
    try { initCompareLine(); } catch (e) { console.warn('[motion] compare:', e); }
    try { initProgress(); } catch (e) { console.warn('[motion] progress:', e); }
    try { initNav(); } catch (e) { console.warn('[motion] nav:', e); }
    if (HAS_ST) ScrollTrigger.refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
