(function () {
  "use strict";

  const TRAMO_LABEL = {
    natacion: "Natación",
    bici: "Bici",
    carrera: "Carrera",
  };

  const state = {
    data: null,
    filter: "all",
    query: "",
    view: "list",
    selectedId: null,
    highlightName: null,
  };

  const els = {
    viewList: document.getElementById("view-list"),
    viewFicha: document.getElementById("view-ficha"),
    btnBack: document.getElementById("btn-back"),
    search: document.getElementById("search"),
    count: document.getElementById("count"),
    listAthletes: document.getElementById("list-athletes"),
    listEquipos: document.getElementById("list-equipos"),
    equiposBody: document.getElementById("equipos-body"),
    empty: document.getElementById("empty"),
    chips: Array.from(document.querySelectorAll(".chip")),
  };

  function normalize(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function dorsalText(dorsal) {
    if (dorsal === null || dorsal === undefined || dorsal === "") {
      return "Sin dorsal";
    }
    return String(dorsal);
  }

  /** pagado bool OR estado_pago/pago string; missing → pendiente (unpaid). */
  function isPaid(person) {
    if (!person) return false;
    if (typeof person.pagado === "boolean") return person.pagado;
    const raw = person.estado_pago != null ? person.estado_pago : person.pago;
    if (raw === true || raw === 1) return true;
    if (raw === false || raw === 0) return false;
    const s = String(raw == null ? "" : raw)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (!s) return false;
    if (s === "pagado" || s === "pago" || s === "paid" || s === "si" || s === "yes" || s === "true") {
      return true;
    }
    return false;
  }

  function pagoClass(person) {
    return isPaid(person) ? "pago-ok" : "pago-pendiente";
  }

  function byId(id) {
    return state.data.inscritos.find((p) => p.id === id) || null;
  }

  function byName(name) {
    const n = normalize(name);
    return state.data.inscritos.find((p) => normalize(p.nombre_completo) === n) || null;
  }

  function matchesQuery(person, q) {
    if (!q) return true;
    const hay = normalize(
      [person.nombre_completo, person.equipo, person.categoria, person.id, person.dorsal]
        .filter(Boolean)
        .join(" ")
    );
    return hay.includes(q);
  }

  function equipoMatchesQuery(eq, q) {
    if (!q) return true;
    const parts = [eq.equipo]
      .concat(eq.natacion || [])
      .concat(eq.bici || [])
      .concat(eq.carrera || [])
      .concat(eq.integrantes || []);
    return normalize(parts.join(" ")).includes(q);
  }

  function openFicha(id, highlightName) {
    state.view = "ficha";
    state.selectedId = id;
    state.highlightName = highlightName || null;
    history.pushState({ view: "ficha", id }, "", "#ficha/" + encodeURIComponent(id));
    render();
  }

  function openList() {
    state.view = "list";
    state.selectedId = null;
    state.highlightName = null;
    if (location.hash) {
      history.pushState({ view: "list" }, "", location.pathname + location.search);
    }
    render();
  }

  function render() {
    const isFicha = state.view === "ficha";
    els.viewList.classList.toggle("hidden", isFicha);
    els.viewFicha.classList.toggle("hidden", !isFicha);
    els.btnBack.classList.toggle("hidden", !isFicha);

    if (isFicha) {
      renderFicha();
    } else {
      renderList();
    }
  }

  function renderList() {
    const q = normalize(state.query);
    const filter = state.filter;

    els.chips.forEach((chip) => {
      const on = chip.dataset.filter === filter;
      chip.classList.toggle("active", on);
      chip.setAttribute("aria-selected", on ? "true" : "false");
    });

    if (filter === "Relevo") {
      els.listAthletes.hidden = true;
      els.listAthletes.replaceChildren();
      els.listEquipos.hidden = false;
      const equipos = (state.data.equipos || [])
        .slice()
        .sort((a, b) => (a.numero || 0) - (b.numero || 0))
        .filter((eq) => equipoMatchesQuery(eq, q));

      els.count.textContent = equipos.length + " equipo" + (equipos.length === 1 ? "" : "s");
      els.empty.classList.toggle("hidden", equipos.length > 0);
      els.equiposBody.innerHTML = "";

      equipos.forEach((eq) => {
        const tr = document.createElement("tr");
        tr.innerHTML =
          '<td class="team-name">' +
          escapeHtml(eq.equipo) +
          "</td>" +
          cellHtml(eq.natacion) +
          cellHtml(eq.bici) +
          cellHtml(eq.carrera);
        els.equiposBody.appendChild(tr);
      });
      return;
    }

    els.listAthletes.hidden = false;
    els.listEquipos.hidden = true;
    els.equiposBody.replaceChildren();

    let people = state.data.inscritos.slice();
    if (filter === "M" || filter === "F") {
      people = people.filter((p) => p.categoria === filter);
    } else if (filter === "sin_pagar") {
      people = people.filter((p) => !isPaid(p));
    }
    people = people.filter((p) => matchesQuery(p, q));
    people.sort((a, b) =>
      a.nombre_completo.localeCompare(b.nombre_completo, "es", { sensitivity: "base" })
    );

    els.count.textContent =
      people.length + " atleta" + (people.length === 1 ? "" : "s");
    els.empty.classList.toggle("hidden", people.length > 0);
    els.listAthletes.innerHTML = "";

    people.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "athlete-row";
      btn.addEventListener("click", () => openFicha(p.id));

      const badgeClass =
        (p.categoria === "M" ? "m" : p.categoria === "F" ? "f" : "relevo") +
        " " +
        pagoClass(p);
      const meta =
        p.categoria === "Relevo"
          ? "Relevo · " + (p.equipo || "Sin equipo")
          : p.categoria + " · " + dorsalText(p.dorsal);

      btn.innerHTML =
        '<span class="badge ' +
        badgeClass +
        '">' +
        escapeHtml(p.categoria === "Relevo" ? "R" : p.categoria) +
        "</span>" +
        '<span class="athlete-main">' +
        '<div class="athlete-name">' +
        escapeHtml(p.nombre_completo) +
        "</div>" +
        '<div class="athlete-meta">' +
        escapeHtml(meta) +
        "</div>" +
        "</span>";

      els.listAthletes.appendChild(btn);
    });
  }

  function cellHtml(names) {
    const list = Array.isArray(names) ? names : names ? [names] : [];
    if (!list.length) {
      return '<td><span class="cell-empty">—</span></td>';
    }
    const buttons = list
      .map((name) => {
        const person = byName(name);
        const idAttr = person ? ' data-id="' + escapeAttr(person.id) + '"' : "";
        // Per-person payment tint; unknown name → pendiente (red)
        const payCls = " " + pagoClass(person);
        return (
          '<button type="button" class="cell-btn' +
          payCls +
          '" data-name="' +
          escapeAttr(name) +
          '"' +
          idAttr +
          ">" +
          escapeHtml(name) +
          "</button>"
        );
      })
      .join("");
    return "<td>" + buttons + "</td>";
  }

  function renderFicha() {
    const person = byId(state.selectedId);
    const root = els.viewFicha;
    root.innerHTML = "";

    if (!person) {
      root.innerHTML =
        '<div class="ficha"><div class="ficha-card"><p>No se encontró la ficha.</p></div></div>';
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "ficha";

    const card = document.createElement("div");
    card.className = "ficha-card";

    const dorsalVal =
      person.dorsal === null || person.dorsal === undefined || person.dorsal === ""
        ? '<span class="dorsal-null">Sin dorsal</span>'
        : escapeHtml(String(person.dorsal));

    let legsHtml = "";
    if (person.categoria === "Relevo") {
      const legs = (person.tramos_persona || []).map((t) => TRAMO_LABEL[t] || t);
      legsHtml =
        '<div class="field" style="grid-column:1/-1">' +
        "<label>Tramo(s)</label>" +
        '<div class="pill-row">' +
        (legs.length
          ? legs.map((l) => '<span class="pill">' + escapeHtml(l) + "</span>").join("")
          : '<span class="value">Sin tramo</span>') +
        "</div></div>";
    }

    const pagoLabel = isPaid(person) ? "Pagado" : "Sin pagar";
    const pagoValClass = isPaid(person) ? "pago-ok" : "pago-pendiente";

    card.innerHTML =
      '<h2 class="ficha-name">' +
      escapeHtml(person.nombre_completo) +
      "</h2>" +
      '<div class="ficha-grid">' +
      '<div class="field"><label>Categoría</label><div class="value">' +
      escapeHtml(person.categoria) +
      "</div></div>" +
      '<div class="field"><label>Dorsal</label><div class="value">' +
      dorsalVal +
      "</div></div>" +
      '<div class="field"><label>Pago</label><div class="value"><span class="badge ' +
      pagoValClass +
      '">' +
      escapeHtml(pagoLabel) +
      "</span></div></div>" +
      '<div class="field"><label>ID</label><div class="value">' +
      escapeHtml(person.id) +
      "</div></div>" +
      (person.categoria === "Relevo"
        ? '<div class="field"><label>Equipo</label><div class="value">' +
          escapeHtml(person.equipo || "—") +
          "</div></div>"
        : "") +
      legsHtml +
      "</div>";

    wrap.appendChild(card);

    if (person.categoria === "Relevo" && person.tramos_equipo) {
      const teamCard = document.createElement("div");
      teamCard.className = "ficha-card";
      const te = person.tramos_equipo;
      teamCard.innerHTML =
        '<p class="section-title">Equipo completo</p>' +
        '<div class="table-scroll"><table class="relevo-table"><thead><tr>' +
        "<th>Equipo</th><th>Natación</th><th>Bici</th><th>Carrera</th>" +
        "</tr></thead><tbody><tr>" +
        '<td class="team-name">' +
        escapeHtml(person.equipo || "—") +
        "</td>" +
        cellHtml(te.natacion) +
        cellHtml(te.bici) +
        cellHtml(te.carrera) +
        "</tr></tbody></table></div>";
      wrap.appendChild(teamCard);

      // highlight current person cells
      requestAnimationFrame(() => {
        const target = state.highlightName || person.nombre_completo;
        teamCard.querySelectorAll(".cell-btn").forEach((btn) => {
          if (normalize(btn.dataset.name) === normalize(target)) {
            btn.classList.add("active");
          }
        });
      });
    }

    root.appendChild(wrap);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function wire() {
    els.search.addEventListener("input", () => {
      state.query = els.search.value;
      if (state.view === "list") renderList();
    });

    els.chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        state.filter = chip.dataset.filter;
        if (state.view !== "list") openList();
        else renderList();
      });
    });

    els.btnBack.addEventListener("click", () => {
      if (history.state && history.state.view === "ficha") history.back();
      else openList();
    });

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".cell-btn");
      if (!btn) return;
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      if (id) {
        openFicha(id, name);
      } else {
        const person = byName(name);
        if (person) openFicha(person.id, name);
      }
    });

    window.addEventListener("popstate", () => {
      const m = location.hash.match(/^#ficha\/(.+)$/);
      if (m) {
        state.view = "ficha";
        state.selectedId = decodeURIComponent(m[1]);
        render();
      } else {
        state.view = "list";
        state.selectedId = null;
        render();
      }
    });
  }

  // ---------- PIN / cifrado ----------
  const DATA_URL = "data.enc.json";
  const STORE_KEY = "latidos-staff-unlock-v1";
  const PIN_LEN = 6;

  const lock = {
    env: null,
    pin: "",
    busy: false,
    els: {
      view: document.getElementById("view-lock"),
      dots: Array.from(document.querySelectorAll("#pin-dots span")),
      dotsWrap: document.getElementById("pin-dots"),
      status: document.getElementById("pin-status"),
      keypad: document.getElementById("keypad"),
      btnLock: document.getElementById("btn-lock"),
    },
  };

  function b64ToBytes(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  async function deriveKey(pin, env) {
    const base = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(pin),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    // extractable: se guarda la clave derivada (no el PIN) para recordar el dispositivo
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: b64ToBytes(env.salt), iterations: env.iter },
      base,
      { name: "AES-GCM", length: 256 },
      true,
      ["decrypt"]
    );
  }

  async function decryptWith(key, env) {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(env.iv) },
      key,
      b64ToBytes(env.ct)
    );
    return JSON.parse(new TextDecoder().decode(pt));
  }

  function readStored() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  async function saveKey(key, env) {
    try {
      const raw = await crypto.subtle.exportKey("raw", key);
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ salt: env.salt, iter: env.iter, key: bytesToB64(raw) })
      );
    } catch (e) {
      /* modo privado / sin almacenamiento: solo dura esta sesión */
    }
  }

  function clearStored() {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch (e) {
      /* nada */
    }
  }

  async function tryStoredKey(env) {
    const s = readStored();
    if (!s || s.salt !== env.salt || s.iter !== env.iter || !s.key) return null;
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        b64ToBytes(s.key),
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );
      return await decryptWith(key, env);
    } catch (e) {
      clearStored(); // PIN cambió o datos nuevos con otra clave
      return null;
    }
  }

  function renderDots() {
    lock.els.dots.forEach((d, i) => d.classList.toggle("filled", i < lock.pin.length));
  }

  function setStatus(msg, kind) {
    lock.els.status.textContent = msg || "";
    lock.els.status.className = "pin-status" + (kind ? " " + kind : "");
  }

  function setBusy(on) {
    lock.busy = on;
    lock.els.keypad.classList.toggle("busy", on);
  }

  async function submitPin() {
    if (lock.busy || !lock.env) return;
    const pin = lock.pin;
    setBusy(true);
    setStatus("Verificando…");
    try {
      const key = await deriveKey(pin, lock.env);
      const data = await decryptWith(key, lock.env);
      await saveKey(key, lock.env);
      setStatus("");
      unlock(data);
    } catch (e) {
      lock.pin = "";
      renderDots();
      setStatus("PIN incorrecto. Inténtalo de nuevo.", "error");
      lock.els.dotsWrap.classList.remove("shake");
      void lock.els.dotsWrap.offsetWidth; // reinicia la animación
      lock.els.dotsWrap.classList.add("shake");
    } finally {
      setBusy(false);
    }
  }

  function pressKey(k) {
    if (lock.busy) return;
    if (k === "del") {
      lock.pin = lock.pin.slice(0, -1);
    } else if (/^\d$/.test(k) && lock.pin.length < PIN_LEN) {
      lock.pin += k;
      if (lock.els.status.classList.contains("error")) setStatus("");
    }
    renderDots();
    if (lock.pin.length === PIN_LEN) submitPin();
  }

  function wireLock() {
    lock.els.keypad.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-key]");
      if (btn) pressKey(btn.dataset.key);
    });
    document.addEventListener("keydown", (e) => {
      if (lock.els.view.hidden) return;
      if (/^\d$/.test(e.key)) pressKey(e.key);
      else if (e.key === "Backspace") pressKey("del");
    });
    lock.els.btnLock.addEventListener("click", () => {
      clearStored();
      // Recargar limpia los datos descifrados de la memoria
      location.replace(location.pathname + location.search);
    });
  }

  function showLock() {
    lock.els.view.hidden = false;
    els.viewList.hidden = true;
    els.viewFicha.hidden = true;
    els.btnBack.classList.add("hidden");
    lock.els.btnLock.hidden = true;
    lock.pin = "";
    renderDots();
  }

  function unlock(data) {
    state.data = data;
    lock.els.view.hidden = true;
    els.viewList.hidden = false;
    els.viewFicha.hidden = false;
    lock.els.btnLock.hidden = false;
    wire();
    const m = location.hash.match(/^#ficha\/(.+)$/);
    if (m) {
      state.view = "ficha";
      state.selectedId = decodeURIComponent(m[1]);
    }
    render();
  }

  function fatal(title, msg) {
    document.getElementById("app").innerHTML =
      '<div style="padding:24px;font-family:system-ui">' +
      "<h1>" +
      escapeHtml(title) +
      "</h1><p>" +
      escapeHtml(msg) +
      "</p></div>";
  }

  async function boot() {
    if (!window.crypto || !crypto.subtle) {
      fatal("Navegador no compatible", "Abre esta página con https en un navegador actualizado.");
      return;
    }
    wireLock();
    showLock();
    setBusy(true);
    setStatus("Cargando…");
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      lock.env = await res.json();
      const data = await tryStoredKey(lock.env);
      setBusy(false);
      setStatus("");
      if (data) unlock(data);
    } catch (err) {
      setBusy(false);
      fatal(
        "No se pudo cargar",
        String(err && err.message ? err.message : err) + ". Revisa tu conexión e inténtalo de nuevo."
      );
    }
  }

  boot();
})();
