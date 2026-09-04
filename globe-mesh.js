// <globe-mesh> — rotating dot-network mesh that morphs sphere → torus → cube → helix.
// Self-contained: owns its canvas, DPR sizing (ResizeObserver), and rAF loop.
(function () {
  if (window.customElements && customElements.get('globe-mesh')) return;

  class GlobeMesh extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;

      this.style.display = 'block';
      const cv = document.createElement('canvas');
      cv.style.cssText = 'display:block;width:100%;height:100%';
      this.appendChild(cv);
      this.cv = cv;
      const ctx = cv.getContext('2d');
      this.ctx = ctx;

      const N = 460;
      const gold = Math.PI * (3 - Math.sqrt(5));
      const pts = [];
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const th = gold * i;
        pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
      }
      const sphere = pts.map(function (p) { return p.slice(); });
      const torus = pts.map(function (p, i) {
        const u = (i / N) * Math.PI * 2 * 7, v = gold * i, R0 = 0.72, r0 = 0.3;
        return [(R0 + r0 * Math.cos(v)) * Math.cos(u), r0 * Math.sin(v), (R0 + r0 * Math.cos(v)) * Math.sin(u)];
      });
      const boxShell = pts.map(function (p) {
        const m = Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])) || 1;
        const k = 0.82 / m;
        return [p[0] * k, p[1] * k, p[2] * k];
      });
      const helix = pts.map(function (p, i) {
        const t = i / N, a = t * Math.PI * 2 * 3, rr = 0.28 + 0.5 * t;
        return [Math.cos(a) * rr, (t - 0.5) * 1.5, Math.sin(a) * rr];
      });
      const forms = [sphere, torus, boxShell, helix, sphere];

      const edges = [];
      const LIM = 0.19;
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = sphere[i][0] - sphere[j][0];
          const dy = sphere[i][1] - sphere[j][1];
          const dz = sphere[i][2] - sphere[j][2];
          if (dx * dx + dy * dy + dz * dz < LIM * LIM) edges.push([i, j]);
        }
      }

      const HOLD = 3200, MORPH = 2200, CYCLE = HOLD + MORPH;
      const ease = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
      const line = this.getAttribute('line-color') || '10,110,156';
      const near = this.getAttribute('dot-color') || '27,165,222';
      const far = this.getAttribute('dot-color-far') || '10,110,156';

      let dpr = 1, W = 0, H = 0;
      const proj = [];
      const size = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = cv.clientWidth || this.clientWidth;
        H = cv.clientHeight || this.clientHeight;
        if (!W || !H) return false;
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return true;
      };

      const draw = (t) => {
        if (cv.clientWidth !== W || cv.clientHeight !== H) { if (!size()) return; }
        if (!W || !H) return;
        const idx = Math.floor(t / CYCLE) % (forms.length - 1);
        const local = t % CYCLE;
        const A = forms[idx], B = forms[idx + 1];
        const m = local <= HOLD ? 0 : ease((local - HOLD) / MORPH);

        const ay = t * 0.00016;
        const ax = -0.34 + Math.sin(t * 0.00009) * 0.09;
        const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
        const R = Math.min(W, H) * 0.46, ox = W / 2, oy = H / 2, F = 2.6;

        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < N; i++) {
          const px = A[i][0] + (B[i][0] - A[i][0]) * m;
          const py = A[i][1] + (B[i][1] - A[i][1]) * m;
          const pz = A[i][2] + (B[i][2] - A[i][2]) * m;
          const x = px * cy - pz * sy;
          let z = px * sy + pz * cy;
          const y = py * cx - z * sx;
          z = py * sx + z * cx;
          const k = F / (F - z);
          proj[i] = [ox + x * R * k, oy + y * R * k, z];
        }
        ctx.lineWidth = 1;
        for (let e = 0; e < edges.length; e++) {
          const a = proj[edges[e][0]], b = proj[edges[e][1]];
          const al = 0.05 + Math.max(0, (a[2] + b[2]) / 2 + 1) * 0.085;
          ctx.strokeStyle = 'rgba(' + line + ',' + al.toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        for (let i = 0; i < N; i++) {
          const q = proj[i];
          const front = (q[2] + 1) / 2;
          ctx.fillStyle = front > 0.55
            ? 'rgba(' + near + ',' + (0.35 + front * 0.6).toFixed(3) + ')'
            : 'rgba(' + far + ',' + (0.16 + front * 0.4).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(q[0], q[1], 0.9 + front * 2.1, 0, 6.2832); ctx.fill();
        }
      };

      if (typeof ResizeObserver !== 'undefined') {
        this._ro = new ResizeObserver(() => { size(); });
        this._ro.observe(this);
      }
      window.addEventListener('resize', (this._onWinResize = () => { size(); }));

      const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (still) {
        const once = () => { if (size()) { try { draw(0); } catch (e) { console.error(e); } } else requestAnimationFrame(once); };
        requestAnimationFrame(once);
        return;
      }
      // next frame is requested BEFORE drawing, so a bad frame can never stall the loop
      const loop = (ts) => {
        this._raf = requestAnimationFrame(loop);
        try { draw(ts); } catch (e) { console.error('globe-mesh draw', e); }
      };
      this._raf = requestAnimationFrame(loop);
    }

    disconnectedCallback() {
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      if (this._onWinResize) window.removeEventListener('resize', this._onWinResize);
      this._built = false;
    }
  }

  customElements.define('globe-mesh', GlobeMesh);
})();
