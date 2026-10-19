(() => {
  const CSI = window.CSI;
  if (!CSI) {
    console.error("[CSI] supabaseClient.js não inicializou.");
    return;
  }

  const charts = {};
  const chartColors = {
    blue: "#1e3a8a",
    blueBright: "#2563eb",
    red: "#dc2626",
    slate: "#334155",
    green: "#22c55e",
    amber: "#eab308",
    muted: "#94a3b8",
  };

  const STATUS_STORE = { online: "online", busy: "busy", offline: "offline" };
  const ADMIN_SESSION = "csi_admin_ok";
  const PIN_PATTERN = /^[A-Za-z0-9]{6}$/;

  const money = (value) =>
    Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const statusLabel = (status) =>
    ({
      pending: "Pendente",
      submitted: "Em triagem",
      approved: "Aprovado",
      aprovado: "Aprovado",
      rejected: "Reprovado",
      rejeitado: "Reprovado",
      assigned: "Atribuído",
      in_progress: "Em andamento",
      completed: "Concluído",
      cancelled: "Cancelado",
      em_analise_contrato: "Aguardando Validação do Gestor",
      agendado_liberado: "Aprovado e confirmado",
      available: "Online",
      online: "Online",
      on_mission: "Busy",
      busy: "Busy",
      offline: "Offline",
      pendente: "Pendente",
    }[status] || status);

  const serviceLabel = (id) => CSI.services[id]?.label || id;
  const vehicleLabel = (id) => CSI.vehicles[id]?.label || id;
  const attireLabel = (id) => CSI.attire[id]?.label || id || "—";
  const securityLabel = (id) => CSI.security[id]?.label || id || "—";
  const protocolOf = (id) => String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
  const onlyDigits = (value) => String(value || "").replace(/\D/g, "");
  const isValidPin = (pin) => PIN_PATTERN.test(String(pin || ""));
  const isValidCpf = (cpf) => onlyDigits(cpf).length === 11;
  const formatCpf = (cpf) => {
    const d = onlyDigits(cpf).slice(0, 11);
    if (d.length !== 11) return cpf || "—";
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  };
  const formatCpfMask = (value) => {
    const d = onlyDigits(value).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  };
  const formatPhoneMask = (value) => {
    const d = onlyDigits(value).slice(0, 11);
    if (!d) return "";
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const authErrorMessage = (error) =>
    CSI.friendlyAuthError?.(error) || error?.message || "E-mail já registado ou credenciais incorretas.";

  function bindInputMask(root, name, formatter) {
    const el = root?.elements?.[name] || root?.querySelector?.(`[name="${name}"]`);
    if (!el || el.dataset.maskBound === "1") return;
    el.dataset.maskBound = "1";
    el.addEventListener("input", () => {
      const next = formatter(el.value);
      if (el.value !== next) el.value = next;
    });
    if (el.value) el.value = formatter(el.value);
  }

  function bindIdentityMasks(root) {
    bindInputMask(root, "cpf", formatCpfMask);
    bindInputMask(root, "phone", formatPhoneMask);
  }

  function createFaceCamera({ video, canvas, startBtn, captureBtn, placeholder, guide, statusEl, onCapture }) {
    let stream = null;
    const setStatus = (text) => {
      if (statusEl) statusEl.textContent = text;
    };
    const setCaptureEnabled = (on) => {
      if (!captureBtn) return;
      captureBtn.disabled = !on;
    };
    setCaptureEnabled(false);
    async function start() {
      if (!video) return;
      if (stream) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        video.srcObject = stream;
        video.classList.remove("hidden");
        placeholder?.classList.add("hidden");
        guide?.classList.remove("hidden");
        await video.play();
        setCaptureEnabled(true);
        setStatus("Câmera ativa. Enquadre o rosto e capture a foto.");
      } catch {
        stream = null;
        setCaptureEnabled(false);
        setStatus("Permissão da câmera negada. Autorize o acesso no navegador e clique em Iniciar Câmera.");
        showToast("Não foi possível iniciar a câmera. Autorize o acesso e tente novamente.", "error");
      }
    }
    function stop() {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      if (video) {
        video.srcObject = null;
        video.classList.add("hidden");
      }
      placeholder?.classList.remove("hidden");
      guide?.classList.add("hidden");
      setCaptureEnabled(false);
    }
    startBtn?.addEventListener("click", start);
    captureBtn?.addEventListener("click", () => {
      if (!stream) {
        showToast("Inicie a câmera antes de capturar a face.", "error");
        return;
      }
      const photo = captureFaceData(video, canvas);
      if (!photo) {
        showToast("Não foi possível capturar o frame. Tente novamente.", "error");
        return;
      }
      onCapture?.(photo);
    });
    return { start, stop, isLive: () => Boolean(stream) };
  }
  const isApproved = (profile) =>
    profile?.approval_status === "approved" ||
    profile?.approval_status === "aprovado" ||
    profile?.status_aprovacao === "aprovado";

  function showToast(message, type = "ok") {
    let toast = document.getElementById("csi-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "csi-toast";
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove("toast--ok", "toast--error", "is-visible");
    toast.classList.add(type === "error" ? "toast--error" : "toast--ok", "is-visible");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => toast.classList.remove("is-visible"), 4500);
  }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function bindChrome() {
    const banner = document.getElementById("supabase-banner");
    if (banner && !CSI.isConfigured) {
      banner.textContent = "Supabase não configurado. Verifique supabaseClient.js e execute schema.sql.";
      banner.classList.remove("hidden");
    }
  }

  function showSchemaHelp(error) {
    const banner = document.getElementById("supabase-banner");
    if (banner) {
      banner.textContent = error?.message || "Falha ao gravar no Supabase. Execute schema.sql.";
      banner.classList.remove("hidden");
    }
    showToast(error?.message || "Falha ao gravar no Supabase. Execute schema.sql.", "error");
  }

  function hideSchemaHelp() {
    document.getElementById("supabase-banner")?.classList.add("hidden");
  }

  function toggleHidden(id, hidden) {
    document.getElementById(id)?.classList.toggle("hidden", hidden);
  }

  function syncCards(name) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.closest("label")?.querySelector(".csi-card")?.classList.toggle("csi-card--selected", input.checked);
    });
  }

  function upsertChart(id, type, labels, data, colors) {
    const canvas = document.getElementById(id);
    if (!canvas || typeof window.Chart !== "function") return;
    const payload = {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderWidth: 0,
          borderRadius: type === "bar" ? 6 : 0,
        },
      ],
    };
    if (charts[id]) {
      charts[id].data = payload;
      charts[id].update();
      return;
    }
    charts[id] = new window.Chart(canvas, {
      type,
      data: payload,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: chartColors.muted, boxWidth: 10, font: { size: 11 } },
          },
        },
        scales:
          type === "bar"
            ? {
                x: { ticks: { color: chartColors.muted }, grid: { color: "rgba(148,163,184,0.08)" } },
                y: { ticks: { color: chartColors.muted }, grid: { color: "rgba(148,163,184,0.08)" }, beginAtZero: true },
              }
            : {},
      },
    });
  }

  function isOnline(status) {
    return status === "available" || status === "online";
  }

  function isBusy(status) {
    return status === "on_mission" || status === "busy";
  }

  function computeScores(drivers = [], requests = []) {
    const totalDrivers = Math.max(drivers.length, 1);
    const available = drivers.filter((item) => isOnline(item.status)).length;
    const onMission = drivers.filter((item) => isBusy(item.status)).length;
    const offline = drivers.filter((item) => item.status === "offline").length;
    const alerts = drivers.filter((item) => item.panic_active || item.duress_mode).length;
    const pending = requests.filter((item) => item.status === "pending").length;
    const prices = requests.map((item) => Number(item.estimated_price) || 0).filter(Boolean);
    const ticket = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : 0;
    const rated = requests.filter((item) => Number(item.rating) > 0);
    const avgRating = rated.length ? rated.reduce((sum, item) => sum + Number(item.rating), 0) / rated.length : 0;
    const mix = {
      executive_transport: requests.filter((item) => item.service_type === "executive_transport").length,
      vip_escort: requests.filter((item) => item.service_type === "vip_escort").length,
      event_coverage: requests.filter((item) => item.service_type === "event_coverage").length,
    };
    return {
      available,
      onMission,
      offline,
      alerts,
      pending,
      ticket,
      avgRating,
      ratedCount: rated.length,
      availabilityPct: (available / totalDrivers) * 100,
      missionPct: (onMission / totalDrivers) * 100,
      alertPct: (alerts / totalDrivers) * 100,
      mix,
      fleet: [available, onMission, offline],
      teamScore: [
        Math.round((available / totalDrivers) * 100),
        Math.round((onMission / totalDrivers) * 100),
        Math.round(((avgRating || 0) / 5) * 100),
      ],
    };
  }

  async function refreshLiveOps() {
    const [{ data: requests }, { data: drivers }] = await Promise.all([
      CSI.serviceRequests.list(),
      CSI.driverStatus.listAll(),
    ]);
    const stats = computeScores(drivers || [], requests || []);
    const mixLabels = ["Deslocamento", "Escolta VIP", "Eventos"];
    const mixData = [stats.mix.executive_transport, stats.mix.vip_escort, stats.mix.event_coverage];
    const mixColors = [chartColors.blue, chartColors.red, chartColors.blueBright];
    upsertChart("chart-admin-mix", "doughnut", mixLabels, mixData, mixColors);
    upsertChart(
      "chart-admin-fleet",
      "doughnut",
      ["Online", "Busy", "Offline"],
      stats.fleet,
      [chartColors.green, chartColors.blueBright, chartColors.slate]
    );
    upsertChart(
      "chart-admin-score",
      "bar",
      ["Online", "Busy", "Avaliação"],
      stats.teamScore,
      [chartColors.green, chartColors.blueBright, chartColors.blue]
    );
    return { requests: requests || [], drivers: drivers || [], stats };
  }

  function formValue(form, name) {
    const field = form?.elements?.[name];
    if (!field) return "";
    if (field instanceof RadioNodeList) {
      return form.querySelector(`input[name="${name}"]:checked`)?.value || "";
    }
    return field.value;
  }

  function captureFaceData(video, canvas) {
    if (!video || !canvas) return "";
    const width = video.videoWidth || 320;
    const height = video.videoHeight || 240;
    if (!width || !height) return "";
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const tmp = document.createElement("canvas");
    const maxW = 320;
    const scale = Math.min(1, maxW / width);
    tmp.width = Math.round(width * scale);
    tmp.height = Math.round(height * scale);
    tmp.getContext("2d").drawImage(canvas, 0, 0, tmp.width, tmp.height);
    return tmp.toDataURL("image/jpeg", 0.72);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
      reader.readAsDataURL(file);
    });
  }

  async function imageFileToDataUrl(file, maxW = 720, quality = 0.72) {
    if (!file) return "";
    const raw = await readFileAsDataUrl(file);
    if (!String(file.type || "").startsWith("image/")) return raw;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(raw);
      img.src = raw;
    });
  }

  function storageFilePath(folder, kind, file) {
    const safe = String(file?.name || kind)
      .replace(/[^\w.\-]+/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 80) || kind;
    return `${folder}/${kind}-${Date.now()}-${safe}`;
  }

  function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || "").trim());
  }

  async function uploadToContracts(file, folder, kind) {
    const storage = CSI.supabase?.storage;
    if (!storage) throw new Error("Storage do Supabase indisponível.");
    const filePath = storageFilePath(folder, kind, file);
    const { error } = await storage.from("contracts").upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    const { data } = storage.from("contracts").getPublicUrl(filePath);
    const url = data?.publicUrl;
    if (!url) throw new Error("Não foi possível obter a URL pública do ficheiro.");
    return url;
  }

  function whatsappReleaseMessage(item) {
    const when = formatScheduled(item?.scheduled_at);
    return `Olá ${item?.requester_name || "Cliente"}! Passando para informar que o seu contrato assinado e o comprovativo de pagamento do sinal foram validados com sucesso pela nossa equipe. O seu serviço de escolta VIP (Protocolo: ${protocolOf(item?.id)}) está oficialmente aprovado e confirmado para o dia ${when.date} às ${when.time}. Operador responsável: ${item?.assigned_driver_name || "A definir"}. Agradecemos a preferência pela CSI Mobility!`;
  }

  async function copyText(text) {
    const value = String(text || "");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }

  function bindCopyWhatsapp(root) {
    root?.querySelectorAll("[data-copy-whatsapp]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.copyWhatsapp;
        const box = (id && root.querySelector(`[data-whatsapp-box="${id}"]`)) || btn.closest("div")?.querySelector("textarea");
        try {
          await copyText(box?.value || "");
          const previous = btn.textContent;
          btn.textContent = "Copiado!";
          window.setTimeout(() => {
            btn.textContent = previous;
          }, 2000);
          showToast("Copiado!");
        } catch {
          showToast("Não foi possível copiar a mensagem.", "error");
        }
      });
    });
  }

  async function qrDataUrl(payload) {
    if (!payload || typeof window.QRCode?.toDataURL !== "function") return "";
    try {
      return await window.QRCode.toDataURL(payload, { width: 220, margin: 1, color: { dark: "#0b0f19", light: "#ffffff" } });
    } catch {
      return "";
    }
  }

  function formatScheduled(iso) {
    if (!iso) return { date: "—", time: "—" };
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return { date: "—", time: "—" };
    return {
      date: dt.toLocaleDateString("pt-BR"),
      time: dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };
  }

  function starsHtml(score, { jobId = "", interactive = false } = {}) {
    const n = Number(score) || 0;
    return [1, 2, 3, 4, 5]
      .map((value) => {
        const on = value <= n ? "is-on" : "";
        const extra = interactive ? `data-star="${value}" data-rate-job="${jobId}"` : "disabled";
        return `<button type="button" class="star-btn ${on}" ${extra} aria-label="${value} estrela">★</button>`;
      })
      .join("");
  }

  function searchMatch(query, values) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    return values.some((value) => String(value || "").toLowerCase().includes(q));
  }

  function approvalBucket(profile) {
    if (isApproved(profile)) return "approved";
    if (profile?.approval_status === "rejected" || profile?.status_aprovacao === "rejeitado") return "rejected";
    return "pending";
  }

  function regionLabel(state, city) {
    if (!state && !city) return "—";
    return [city, state].filter(Boolean).join(" / ");
  }

  function placeLabel(state, city, address) {
    const region = regionLabel(state, city);
    return [region !== "—" ? region : "", address].filter(Boolean).join(" · ") || "—";
  }

  function ownVehicleLabel(job) {
    const own = job?.client_own_vehicle === true || job?.client_own_vehicle === "yes" || job?.vehicle_type === "own";
    return own ? "Veículo próprio do cliente" : "Veículo do operador CSI";
  }

  function fillCitySelect(select, state, selected = "") {
    if (!select) return;
    const cities = CSI.regions?.[state]?.cities || [];
    select.innerHTML = `<option value="">Cidade / região</option>${cities
      .map((city) => `<option value="${city}" ${city === selected ? "selected" : ""}>${escapeHtml(city)}</option>`)
      .join("")}`;
    if (selected && !cities.includes(selected)) {
      const extra = document.createElement("option");
      extra.value = selected;
      extra.selected = true;
      extra.textContent = selected;
      select.appendChild(extra);
    }
  }

  function bindRegionPair(stateName, cityName, root = document) {
    const form = root.elements ? root : null;
    const stateEl = form?.elements?.[stateName] || root.querySelector?.(`[name="${stateName}"]`);
    const cityEl = form?.elements?.[cityName] || root.querySelector?.(`[name="${cityName}"]`);
    if (!stateEl || !cityEl || stateEl.dataset.regionBound === "1") return;
    stateEl.dataset.regionBound = "1";
    const apply = () => fillCitySelect(cityEl, stateEl.value, cityEl.value);
    stateEl.addEventListener("change", apply);
    apply();
  }

  function faceMini(photo, alt) {
    return photo
      ? `<img src="${photo}" alt="${escapeHtml(alt || "Foto")}" class="face-mini" />`
      : `<div class="face-mini dossier-face--empty">—</div>`;
  }

  function crudButtons(kind, id) {
    return `
      <div class="flex flex-wrap gap-1">
        <button type="button" class="rounded-md border border-white/15 px-2 py-1 text-[11px]" data-edit="${escapeHtml(kind)}" data-id="${escapeHtml(id)}">Editar</button>
        <button type="button" class="rounded-md border border-csi-red/40 px-2 py-1 text-[11px] text-red-200" data-delete="${escapeHtml(kind)}" data-id="${escapeHtml(id)}">Excluir</button>
      </div>`;
  }

  function bindCrudActions(root, { onEdit, onDelete }) {
    root?.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => onEdit(btn.dataset.edit, btn.dataset.id));
    });
    root?.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => onDelete(btn.dataset.delete, btn.dataset.id));
    });
  }

  function dossierHtml(item, extraRows = "") {
    const photo = item.face_photo
      ? `<img src="${item.face_photo}" alt="Reconhecimento facial" class="dossier-face" />`
      : `<div class="dossier-face dossier-face--empty">Sem foto</div>`;
    const doc = item.document_photo
      ? `<a href="${item.document_photo}" target="_blank" rel="noopener" class="text-xs text-blue-300 underline">Ver documento</a>`
      : `<span class="text-xs text-slate-500">${escapeHtml(item.document_name || "Documento não anexado")}</span>`;
    return `
      <div class="flex gap-3">
        ${photo}
        <div class="min-w-0 flex-1">
          <p class="font-medium text-white">${escapeHtml(item.full_name || "—")}</p>
          <p class="mt-1 text-xs text-slate-400">${escapeHtml(item.email || "—")} · ${escapeHtml(item.phone || "—")}</p>
          <p class="mt-1 text-xs text-red-200">CPF ${escapeHtml(formatCpf(item.cpf || item.document_id))}</p>
          <p class="mt-1 text-xs text-slate-500">${escapeHtml(item.company || item.address || "—")}</p>
          ${item.base_state || item.base_city ? `<p class="mt-1 text-xs text-blue-200">Praça ${escapeHtml(regionLabel(item.base_state, item.base_city))}</p>` : ""}
          <p class="mt-1 text-xs text-slate-500">${escapeHtml(item.document_type || "doc")} ${escapeHtml(item.document_id || "")} · Face ${item.face_verified ? "capturada" : "pendente"}</p>
          <div class="mt-1">${doc}</div>
          ${extraRows}
        </div>
      </div>`;
  }

  async function downloadContractFile(job, extras = {}) {
    const payload = {
      valorTotal: Number(job.estimated_price) || 0,
      protocolo: protocolOf(job.id),
      nomeCliente: job.requester_name,
      cpfCliente: extras.cpfCliente,
      endereco: extras.endereco,
      servico: serviceLabel(job.service_type),
      origem: job.pickup_location,
      destino: job.dropoff_location,
      origemCompleta: placeLabel(job.origin_state, job.origin_city, job.pickup_location),
      destinoCompleto: placeLabel(job.dest_state, job.dest_city, job.dropoff_location),
      data: formatScheduled(job.scheduled_at).date,
      horario: formatScheduled(job.scheduled_at).time,
      perfilSeguridad: securityLabel(job.security_profile),
      vestuario: attireLabel(job.attire),
      veiculo: extras.veiculo || job.assigned_driver_vehicle || ownVehicleLabel(job),
      placa: extras.placa || job.assigned_driver_plate || "—",
      operador: extras.operador || job.assigned_driver_name || "A definir",
      cpfOperador: extras.cpfOperador || job.assigned_driver_cpf || "—",
      pracaOperador: extras.pracaOperador || job.assigned_driver_praca || "—",
      pixKey: extras.pixKey,
      pixPayload: job.pix_payload,
      qrDataUrl: extras.qrDataUrl || (await qrDataUrl(job.pix_payload)),
    };
    if (typeof window.gerarContratoPdf === "function") {
      try {
        await window.gerarContratoPdf(payload);
        return;
      } catch (error) {
        console.warn("[CSI] PDF falhou, usando texto.", error);
      }
    }
    const text = typeof window.gerarTextoContrato === "function" ? window.gerarTextoContrato(payload) : job.contract_text || "";
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contrato-csi-${payload.protocolo}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------------- Cliente ---------------- */
  function initClient() {
    const state = {
      step: 1,
      documentFile: null,
      faceVerified: false,
      facePhoto: "",
      profile: null,
      settings: CSI.settings.defaults,
      unsub: [],
    };
    const kycForm = document.getElementById("kyc-form");
    const loginForm = document.getElementById("client-login");
    const missionForm = document.getElementById("mission-form");
    const camera = createFaceCamera({
      video: document.getElementById("kyc-video"),
      canvas: document.getElementById("kyc-canvas"),
      startBtn: document.getElementById("kyc-start-camera"),
      captureBtn: document.getElementById("kyc-capture"),
      placeholder: document.getElementById("kyc-camera-placeholder"),
      guide: document.getElementById("kyc-camera-guide"),
      statusEl: document.getElementById("kyc-face-status"),
      onCapture(photo) {
        state.facePhoto = photo;
        state.faceVerified = true;
        document.getElementById("kyc-face-status").textContent = "Identidade facial capturada para triagem.";
        showToast("Reconhecimento facial registrado.");
      },
    });

    function setKycStep(step) {
      state.step = step;
      document.querySelectorAll("[data-kyc-step]").forEach((panel) => {
        panel.classList.toggle("hidden", Number(panel.dataset.kycStep) !== step);
      });
      document.querySelectorAll("[data-kyc-dot]").forEach((dot) => {
        const n = Number(dot.dataset.kycDot);
        dot.classList.toggle("is-active", n === step);
        dot.classList.toggle("is-done", n < step);
      });
      if (step !== 3) camera.stop();
    }

    function showClientView(view) {
      toggleHidden("client-welcome", view !== "welcome");
      toggleHidden("kyc-gate", view !== "kyc");
      toggleHidden("client-pending", view !== "pending");
      toggleHidden("client-app", view !== "app");
      const logout = document.getElementById("client-logout");
      const label = document.getElementById("client-session-label");
      const signed = Boolean(state.profile);
      logout?.classList.toggle("hidden", !signed);
      if (label) {
        label.classList.toggle("hidden", !signed);
        label.textContent = state.profile?.email || "";
      }
    }

    function setLoginMsg(message) {
      const box = document.getElementById("client-login-msg");
      if (!box) return;
      box.textContent = message || "";
      box.classList.toggle("hidden", !message);
    }

    function resetMissionForm() {
      if (!missionForm) return;
      missionForm.reset();
      const dateInput = missionForm.elements.mission_date;
      const timeInput = missionForm.elements.mission_time;
      const kmInput = missionForm.elements.distance_km;
      const hoursInput = missionForm.elements.duration_hours;
      if (dateInput) {
        const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
        dateInput.value = start.toISOString().slice(0, 10);
      }
      if (timeInput) timeInput.value = "09:00";
      if (kmInput) {
        kmInput.value = "18";
        delete kmInput.dataset.touched;
      }
      if (hoursInput) {
        hoursInput.value = "2";
        delete hoursInput.dataset.touched;
      }
      ["service_type", "attire", "security_profile", "client_own_vehicle"].forEach(syncCards);
      fillCitySelect(missionForm.elements.origin_city, formValue(missionForm, "origin_state"));
      fillCitySelect(missionForm.elements.dest_city, formValue(missionForm, "dest_state"));
      refreshBudget();
    }

    function jobCardHtml(job, { history = false } = {}) {
      const protocol = protocolOf(job.id);
      const canContract = Boolean(job.contract_text || job.pix_payload);
      const canUpload = job.status === "approved";
      const canRate = history && ["em_analise_contrato", "agendado_liberado", "completed"].includes(job.status);
      const rated = Number(job.rating) > 0;
      return `
            <article class="rounded-lg border border-white/10 p-3" data-job="${job.id}">
              <p class="text-white">${escapeHtml(serviceLabel(job.service_type))}</p>
              <p class="mt-1 text-xs text-slate-400">${escapeHtml(placeLabel(job.origin_state, job.origin_city, job.pickup_location))} → ${escapeHtml(placeLabel(job.dest_state, job.dest_city, job.dropoff_location))}</p>
              <p class="mt-1 text-[11px] uppercase tracking-widest ${job.status === "agendado_liberado" ? "text-emerald-300" : "text-red-300"}">${escapeHtml(statusLabel(job.status))} · ${money(job.estimated_price)} · ${protocol}</p>
              ${job.assigned_driver_name ? `<p class="mt-1 text-xs text-slate-300">Operador: ${escapeHtml(job.assigned_driver_name)} · ${escapeHtml(job.assigned_driver_plate || "")}</p>` : ""}
              <p class="mt-1 text-xs text-slate-500">${escapeHtml(ownVehicleLabel(job))}</p>
              ${job.status === "agendado_liberado" ? `<p class="mt-2 text-xs text-emerald-300">Serviço aprovado e confirmado pelo comando. Os detalhes da escolta seguem via WhatsApp.</p>` : ""}
              ${job.status === "em_analise_contrato" ? `<p class="mt-2 text-xs text-amber-300">Aguardando Validação do Gestor.</p>` : ""}
              ${canContract ? `
                <div class="mt-3 space-y-2">
                  ${job.pix_payload && canUpload ? `<img data-qr="${job.id}" alt="QR Pix" class="hidden h-28 w-28 rounded bg-white p-1" />` : ""}
                  ${job.pix_payload && history ? `<img data-qr="${job.id}" alt="QR Pix" class="hidden h-28 w-28 rounded bg-white p-1" />` : ""}
                  <button type="button" class="rounded-md border border-white/15 px-3 py-1.5 text-xs" data-download-contract="${job.id}">Descarregar contrato PDF</button>
                  ${canUpload ? `
                  <label class="block text-[11px] text-slate-400">Comprovativo Pix
                    <input type="file" accept="image/*,.pdf" data-pix-file="${job.id}" class="mt-1 w-full text-xs" />
                  </label>
                  <label class="block text-[11px] text-slate-400">Contrato assinado Gov.br
                    <input type="file" accept="image/*,.pdf" data-gov-file="${job.id}" class="mt-1 w-full text-xs" />
                  </label>
                  <button type="button" class="csi-cta w-full rounded-md px-3 py-1.5 text-xs font-semibold" data-upload-docs="${job.id}">Enviar comprovativo e Gov.br</button>` : ""}
                </div>` : ""}
              ${canRate ? `
                <div class="mt-3 rounded-lg border border-white/10 p-2">
                  <p class="text-[11px] uppercase tracking-widest text-slate-500">Avaliação da missão</p>
                  <div class="star-row mt-1" data-star-row="${job.id}">${starsHtml(job.rating, { jobId: job.id, interactive: !rated })}</div>
                  ${rated ? `<p class="mt-1 text-xs text-slate-400">${escapeHtml(job.rating_feedback || "Avaliação enviada.")}</p>` : `
                  <textarea data-rate-feedback="${job.id}" rows="2" placeholder="Feedback opcional" class="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs"></textarea>
                  <button type="button" class="mt-2 rounded-md border border-white/15 px-3 py-1.5 text-xs" data-submit-rate="${job.id}">Enviar avaliação</button>`}
                </div>` : ""}
            </article>`;
    }

    function bindJobBox(box, jobs) {
      if (!box) return;
      box.querySelectorAll("[data-download-contract]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const job = jobs.find((item) => item.id === btn.dataset.downloadContract);
          if (job) await downloadContractFile(job);
        });
      });
      box.querySelectorAll("[data-upload-docs]").forEach((btn) => {
        btn.addEventListener("click", () => uploadMissionDocs(btn.dataset.uploadDocs, box));
      });
      box.querySelectorAll("[data-star]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const jobId = btn.dataset.rateJob;
          const value = Number(btn.dataset.star);
          box.querySelectorAll(`[data-rate-job="${jobId}"]`).forEach((star) => {
            star.classList.toggle("is-on", Number(star.dataset.star) <= value);
            star.dataset.selected = String(value);
          });
        });
      });
      box.querySelectorAll("[data-submit-rate]").forEach((btn) => {
        btn.addEventListener("click", () => submitRating(btn.dataset.submitRate, box));
      });
    }

    async function paintQr(box, jobs) {
      for (const job of jobs || []) {
        if (!job.pix_payload) continue;
        const img = box?.querySelector(`[data-qr="${job.id}"]`);
        if (!img) continue;
        const qr = await qrDataUrl(job.pix_payload);
        if (qr) {
          img.src = qr;
          img.classList.remove("hidden");
        }
      }
    }

    async function loadJobs() {
      const activeBox = document.getElementById("client-jobs-active");
      const historyBox = document.getElementById("client-jobs-history") || document.getElementById("client-jobs");
      const { data: jobs, error } = await CSI.serviceRequests.listMine();
      if (error) {
        const msg = `<p class="text-red-200">${escapeHtml(error.message || "Não foi possível carregar o histórico.")}</p>`;
        if (activeBox) activeBox.innerHTML = msg;
        if (historyBox) historyBox.innerHTML = msg;
        return;
      }
      const active = (jobs || []).filter((job) => ["pending", "approved"].includes(job.status));
      const history = (jobs || []).filter((job) => !["pending", "approved"].includes(job.status));
      if (activeBox) {
        activeBox.innerHTML = active.length
          ? active.map((job) => jobCardHtml(job, { history: false })).join("")
          : `<p class="text-slate-500">Nenhuma ação pendente.</p>`;
        bindJobBox(activeBox, active);
        await paintQr(activeBox, active);
      }
      if (historyBox) {
        historyBox.innerHTML = history.length
          ? history.map((job) => jobCardHtml(job, { history: true })).join("")
          : `<p class="text-slate-500">Nenhuma missão no histórico.</p>`;
        bindJobBox(historyBox, history);
        await paintQr(historyBox, history);
      }
    }

    async function submitRating(jobId, root) {
      const selected = root.querySelector(`[data-rate-job="${jobId}"].is-on:last-of-type`) || root.querySelector(`[data-rate-job="${jobId}"][data-selected]`);
      const row = root.querySelector(`[data-star-row="${jobId}"]`);
      const score = Number(row?.querySelector(".star-btn.is-on:last-of-type")?.dataset.star || selected?.dataset.selected || selected?.dataset.star || 0);
      const onStars = [...(row?.querySelectorAll(".star-btn.is-on") || [])];
      const rating = onStars.length || score;
      if (!rating) {
        showToast("Escolha de 1 a 5 estrelas.", "error");
        return;
      }
      const feedback = root.querySelector(`[data-rate-feedback="${jobId}"]`)?.value.trim() || null;
      const { error } = await CSI.serviceRequests.update(jobId, { rating, rating_feedback: feedback });
      if (error) {
        if (CSI.isSchemaError(error)) showSchemaHelp(error);
        else showToast(error.message, "error");
        return;
      }
      showToast("Avaliação registrada. Obrigado.");
      await loadJobs();
    }

    async function uploadMissionDocs(jobId, root) {
      const pixInput = root.querySelector(`[data-pix-file="${jobId}"]`);
      const govInput = root.querySelector(`[data-gov-file="${jobId}"]`);
      const pixFile = pixInput?.files?.[0];
      const govFile = govInput?.files?.[0];
      if (!pixFile || !govFile) {
        showToast("Anexe o comprovativo de Pix e o contrato assinado via Gov.br.", "error");
        return;
      }
      const submit = root.querySelector(`[data-upload-docs="${jobId}"]`);
      if (submit) submit.disabled = true;
      try {
        const pixUrl = await uploadToContracts(pixFile, jobId, "pix");
        const govUrl = await uploadToContracts(govFile, jobId, "govbr");
        const { error } = await CSI.serviceRequests.update(jobId, {
          pix_receipt: pixUrl,
          pix_receipt_name: pixFile.name,
          signed_contract: govUrl,
          signed_contract_name: govFile.name,
          status: "em_analise_contrato",
        });
        if (error) {
          if (CSI.isSchemaError(error)) showSchemaHelp(error);
          else showToast(error.message, "error");
          return;
        }
        const success =
          "Documentos enviados com sucesso! A confirmação do serviço e os detalhes da escolta serão enviados em breve através do nosso WhatsApp.";
        window.alert(success);
        showToast(success);
        await loadJobs();
      } catch (error) {
        showToast(error?.message || "Falha ao enviar os documentos para o Storage.", "error");
      } finally {
        if (submit) submit.disabled = false;
      }
    }

    function refreshBudget() {
      if (!missionForm) return null;
      const origin = `${formValue(missionForm, "origin_city")}|${formValue(missionForm, "pickup")}`;
      const destination = `${formValue(missionForm, "dest_city")}|${formValue(missionForm, "dropoff")}`;
      const kmInput = missionForm.elements.distance_km;
      const hoursInput = missionForm.elements.duration_hours;
      if (kmInput && !kmInput.dataset.touched) kmInput.value = CSI.estimateKm(origin, destination);
      if (hoursInput && !hoursInput.dataset.touched) hoursInput.value = CSI.estimateHours(kmInput?.value);
      const quote = CSI.quoteBudget({
        serviceType: formValue(missionForm, "service_type"),
        clientOwnVehicle: formValue(missionForm, "client_own_vehicle"),
        distanceKm: kmInput?.value,
        hours: hoursInput?.value,
        attire: formValue(missionForm, "attire"),
        securityProfile: formValue(missionForm, "security_profile"),
        settings: state.settings,
      });
      const total = document.getElementById("quote-total");
      if (total) total.textContent = money(quote.total);
      const list = document.getElementById("quote-breakdown");
      if (list) {
        list.innerHTML = quote.breakdown
          .map((row) => {
            const value = typeof row.value === "number" ? money(row.value) : row.value;
            return `<li class="flex justify-between gap-3"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(String(value))}</span></li>`;
          })
          .join("");
      }
      const deposit = document.getElementById("quote-deposit");
      if (deposit) deposit.textContent = `Sinal de 50%: ${money(quote.total * 0.5)}`;
      return quote;
    }

    async function unlockIfApproved(profile) {
      state.profile = profile;
      if (profile) CSI.rememberProfile(profile);
      if (!isApproved(profile)) {
        showClientView("pending");
        return false;
      }
      showClientView("app");
      await Promise.all([loadJobs(), CSI.settings.getAll().then(({ data }) => {
        state.settings = data || CSI.settings.defaults;
      })]);
      refreshBudget();
      return true;
    }

    async function restore({ initial = false } = {}) {
      const session = await CSI.auth.session();
      const user = session?.user;
      if (!user?.id) {
        if (initial) showClientView("welcome");
        return;
      }
      let { data } = await CSI.profiles.get(user.id);
      if (!data || data.role !== "client") {
        const byEmail = await CSI.profiles.getByEmail(user.email, "client");
        data = byEmail.data;
      }
      if (!data || data.role !== "client") {
        showClientView("welcome");
        return;
      }
      const sessionEmail = CSI.normalizeEmail(user.email);
      const profileEmail = CSI.normalizeEmail(data.email);
      if (profileEmail && sessionEmail && profileEmail !== sessionEmail) {
        await CSI.auth.signOut();
        showClientView("welcome");
        return;
      }
      await unlockIfApproved(data);
    }

    document.getElementById("start-kyc")?.addEventListener("click", () => {
      showClientView("kyc");
      setKycStep(1);
    });
    document.getElementById("kyc-back-welcome")?.addEventListener("click", () => {
      camera.stop();
      showClientView("welcome");
    });
    document.getElementById("client-logout")?.addEventListener("click", async () => {
      camera.stop();
      await CSI.auth.signOut();
      state.profile = null;
      showClientView("welcome");
      showToast("Sessão encerrada.");
    });

    kycForm?.querySelector('[name="document_file"]')?.addEventListener("change", (event) => {
      state.documentFile = event.target.files?.[0] || null;
    });

    document.querySelectorAll("[data-kyc-next]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = Number(btn.dataset.kycNext);
        if (next === 2) {
          const name = formValue(kycForm, "full_name").trim();
          const email = formValue(kycForm, "email").trim();
          const password = formValue(kycForm, "password");
          const confirm = formValue(kycForm, "password_confirm");
          const phone = formValue(kycForm, "phone").trim();
          const cpf = formValue(kycForm, "cpf");
          if (!name || !email || !phone) {
            showToast("Preencha nome, e-mail e telefone.", "error");
            return;
          }
          if (!isValidCpf(cpf)) {
            showToast("Informe um CPF válido com 11 dígitos.", "error");
            return;
          }
          if (!isValidPin(password) || password !== confirm) {
            showToast("O PIN deve ter exatamente 6 dígitos e as duas caixas precisam coincidir.", "error");
            return;
          }
        }
        if (state.step === 2 && next === 3 && !state.documentFile) {
          showToast("Envie a imagem do documento para o KYC.", "error");
          return;
        }
        setKycStep(next);
      });
    });

    kycForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fullName = formValue(kycForm, "full_name").trim();
      const email = formValue(kycForm, "email").trim();
      const password = formValue(kycForm, "password");
      const confirm = formValue(kycForm, "password_confirm");
      const phone = formValue(kycForm, "phone").trim();
      const cpf = onlyDigits(formValue(kycForm, "cpf"));
      const documentId = formValue(kycForm, "document_id").trim();
      if (!fullName || !email || !phone || !isValidCpf(cpf)) {
        showToast("Preencha os dados pessoais e um CPF válido.", "error");
        setKycStep(1);
        return;
      }
      if (!isValidPin(password) || password !== confirm) {
        showToast("Confirme o PIN de 6 dígitos.", "error");
        setKycStep(1);
        return;
      }
      if (!documentId || !state.documentFile) {
        showToast("Envie o documento para concluir o KYC.", "error");
        setKycStep(2);
        return;
      }
      if (!state.faceVerified || !state.facePhoto) {
        showToast("Capture a foto facial antes de enviar o cadastro.", "error");
        return;
      }
      const submit = kycForm.querySelector('button[type="submit"]');
      const originalLabel = submit.textContent;
      submit.disabled = true;
      submit.textContent = "Enviando…";
      const documentPhoto = await imageFileToDataUrl(state.documentFile);
      const payload = {
        full_name: fullName,
        email,
        phone,
        cpf,
        address: formValue(kycForm, "address").trim() || null,
        company: formValue(kycForm, "company").trim(),
        document_type: formValue(kycForm, "document_type"),
        document_id: documentId,
        document_name: `${documentId}${state.documentFile?.name ? ` · ${state.documentFile.name}` : ""}`,
        document_photo: documentPhoto,
        face_photo: state.facePhoto || null,
        role: "client",
        kyc_status: "submitted",
        approval_status: "pending",
        status_aprovacao: "pendente",
        face_verified: true,
        pin_set: true,
      };
      const authResult = await CSI.auth.signUpOrIn(payload.email, password);
      if (authResult.user?.id) payload.id = authResult.user.id;
      if (!payload.id) {
        submit.disabled = false;
        submit.textContent = originalLabel;
        showToast(authErrorMessage(authResult.error), "error");
        return;
      }
      const { data, error } = await CSI.profiles.upsert(payload);
      submit.disabled = false;
      submit.textContent = originalLabel;
      if (error || !data?.id) {
        if (error && CSI.isSchemaError(error)) showSchemaHelp(error);
        else showToast(error?.message || authResult.error?.message || "Não foi possível gravar o KYC no Supabase.", "error");
        return;
      }
      hideSchemaHelp();
      camera.stop();
      state.profile = data;
      CSI.rememberProfile(data);
      showClientView("pending");
      showToast("Cadastro em triagem pelo comando. Aguarde aprovação.");
    });

    loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = formValue(loginForm, "email").trim();
      const pin = formValue(loginForm, "pin");
      if (!isValidPin(pin)) {
        setLoginMsg("O PIN deve ter exatamente 6 dígitos.");
        return;
      }
      const authResult = await CSI.auth.signIn(email, pin);
      if (authResult.error || !authResult.user) {
        setLoginMsg(authErrorMessage(authResult.error));
        return;
      }
      let { data } = await CSI.profiles.get(authResult.user.id);
      if (!data || data.role !== "client") {
        const byEmail = await CSI.profiles.getByEmail(email, "client");
        data = byEmail.data;
      }
      if (!data || data.role !== "client") {
        setLoginMsg("Perfil de cliente não encontrado para este e-mail.");
        return;
      }
      if (CSI.normalizeEmail(data.email) && CSI.normalizeEmail(data.email) !== CSI.normalizeEmail(email)) {
        setLoginMsg("O e-mail da sessão não corresponde ao cadastro.");
        await CSI.auth.signOut();
        return;
      }
      setLoginMsg("");
      await unlockIfApproved(data);
      if (!isApproved(data)) showToast("Cadastro em triagem pelo comando. Aguarde aprovação.");
    });

    missionForm?.addEventListener("input", refreshBudget);
    missionForm?.addEventListener("change", (event) => {
      if (event.target.name === "distance_km") event.target.dataset.touched = "1";
      if (event.target.name === "duration_hours") event.target.dataset.touched = "1";
      syncCards(event.target.name);
      refreshBudget();
    });

    missionForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const session = await CSI.auth.session();
      const user = session?.user;
      if (!user?.id || !state.profile?.id || state.profile.id !== user.id || !isApproved(state.profile)) {
        showToast("Cadastro em triagem pelo comando. Aguarde aprovação.", "error");
        showClientView(state.profile && !isApproved(state.profile) ? "pending" : "welcome");
        return;
      }
      const pickup = formValue(missionForm, "pickup").trim();
      const dropoff = formValue(missionForm, "dropoff").trim();
      const originState = formValue(missionForm, "origin_state");
      const originCity = formValue(missionForm, "origin_city");
      const destState = formValue(missionForm, "dest_state");
      const destCity = formValue(missionForm, "dest_city");
      if (!pickup || !dropoff || !originState || !originCity || !destState || !destCity) {
        showToast("Informe estado, cidade e local de origem e destino.", "error");
        return;
      }
      const date = formValue(missionForm, "mission_date");
      const time = formValue(missionForm, "mission_time");
      const scheduledAt = new Date(`${date}T${time || "09:00"}`);
      if (Number.isNaN(scheduledAt.getTime())) {
        showToast("Informe data e horário do agendamento.", "error");
        return;
      }
      const quote = refreshBudget();
      const first = !(await CSI.serviceRequests.hasPrevious(user.id));
      const submit = missionForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      const { error } = await CSI.serviceRequests.create({
        client_id: user.id,
        requester_name: state.profile.full_name,
        phone: state.profile.phone,
        email: user.email || state.profile.email,
        company: state.profile.company,
        service_type: formValue(missionForm, "service_type"),
        pickup_location: pickup,
        dropoff_location: dropoff,
        origin_state: originState,
        origin_city: originCity,
        dest_state: destState,
        dest_city: destCity,
        client_own_vehicle: formValue(missionForm, "client_own_vehicle") === "yes",
        vehicle_type: formValue(missionForm, "client_own_vehicle") === "yes" ? "own" : "operator",
        attire: formValue(missionForm, "attire"),
        security_profile: formValue(missionForm, "security_profile"),
        scheduled_at: scheduledAt.toISOString(),
        passengers: Number(formValue(missionForm, "passengers") || 1),
        notes: formValue(missionForm, "notes").trim() || null,
        distance_km: Number(formValue(missionForm, "distance_km")),
        duration_hours: Number(formValue(missionForm, "duration_hours")),
        estimated_price: quote.total,
        preferred_driver_name: formValue(missionForm, "preferred_driver_name").trim() || null,
        status: "pending",
        is_first_request: first,
      });
      submit.disabled = false;
      if (error) {
        if (CSI.isSchemaError(error)) showSchemaHelp(error);
        else showToast(error.message, "error");
        return;
      }
      hideSchemaHelp();
      window.alert("Serviço solicitado com sucesso! A confirmação e os detalhes serão enviados via WhatsApp.");
      showToast("Serviço solicitado com sucesso! A confirmação e os detalhes serão enviados via WhatsApp.");
      resetMissionForm();
      await CSI.auth.signOut();
      state.profile = null;
      showClientView("welcome");
    });

    setKycStep(1);
    bindIdentityMasks(kycForm);
    bindRegionPair("origin_state", "origin_city", missionForm || document);
    bindRegionPair("dest_state", "dest_city", missionForm || document);
    ["service_type", "attire", "security_profile", "client_own_vehicle"].forEach(syncCards);
    resetMissionForm();
    CSI.settings.getAll().then(({ data }) => {
      state.settings = data || CSI.settings.defaults;
      refreshBudget();
    });
    restore({ initial: true });
    state.unsub.push(CSI.subscribeRealtime("system_settings", async () => {
      const { data } = await CSI.settings.getAll();
      state.settings = data || CSI.settings.defaults;
      refreshBudget();
    }));
    state.unsub.push(CSI.subscribeRealtime("service_requests", () => {
      if (state.profile && isApproved(state.profile)) loadJobs();
    }));
    state.unsub.push(CSI.subscribeRealtime("profiles", () => restore()));
  }

  /* ---------------- Motorista ---------------- */
  function initDriver() {
    const state = { profile: null, status: null, faceVerified: false, facePhoto: "" };
    const camera = createFaceCamera({
      video: document.getElementById("driver-kyc-video"),
      canvas: document.getElementById("driver-kyc-canvas"),
      startBtn: document.getElementById("driver-start-camera"),
      captureBtn: document.getElementById("driver-kyc-capture"),
      placeholder: document.getElementById("driver-camera-placeholder"),
      guide: document.getElementById("driver-camera-guide"),
      statusEl: document.getElementById("driver-face-status"),
      onCapture(photo) {
        state.facePhoto = photo;
        state.faceVerified = true;
        document.getElementById("driver-face-status").textContent = "Identidade facial capturada para triagem.";
        showToast("Reconhecimento facial registrado.");
      },
    });

    function showDriverView(view) {
      toggleHidden("driver-auth", view !== "auth");
      toggleHidden("driver-pending", view !== "pending");
      toggleHidden("driver-panel", view !== "panel");
      document.getElementById("driver-logout")?.classList.toggle("hidden", view === "auth");
      if (view !== "auth") camera.stop();
    }

    function setAuthMsg(message) {
      const box = document.getElementById("driver-auth-msg");
      if (!box) return;
      box.textContent = message;
      box.classList.toggle("hidden", !message);
    }

    async function afterLogin(profile) {
      state.profile = profile;
      CSI.rememberProfile(profile);
      if (!isApproved(profile)) {
        showDriverView("pending");
        return;
      }
      showDriverView("panel");
      document.getElementById("driver-name").textContent = profile.full_name;
      const pracaEl = document.getElementById("driver-praca");
      if (pracaEl) pracaEl.textContent = regionLabel(profile.base_state, profile.base_city);
      const existing = await CSI.driverStatus.getByDriver(profile.id);
      if (!existing.data) {
        const { error } = await CSI.driverStatus.upsert(profile.id, {
          status: STATUS_STORE.offline,
          vehicle_type: profile.vehicle_type,
          vehicle_plate: profile.vehicle_plate,
          panic_active: false,
          duress_mode: false,
        });
        if (error && CSI.isSchemaError(error)) showSchemaHelp(error);
      }
      await refresh();
    }

    async function refresh() {
      if (!state.profile) return;
      const { data } = await CSI.driverStatus.getByDriver(state.profile.id);
      state.status = data;
      const current = data?.status || "offline";
      document.querySelectorAll("[data-status]").forEach((btn) => {
        btn.classList.toggle("ring-2", btn.dataset.status === current);
        btn.classList.toggle("ring-white", btn.dataset.status === current);
      });
      const gps = document.getElementById("driver-gps");
      if (gps) {
        gps.textContent =
          data?.current_lat && data?.current_lng
            ? `${Number(data.current_lat).toFixed(5)}, ${Number(data.current_lng).toFixed(5)}`
            : "Aguardando localização…";
      }
      const { data: jobs } = await CSI.serviceRequests.list({ driverId: state.profile.id });
      const box = document.getElementById("driver-jobs");
      if (box) {
        box.innerHTML = jobs?.length
          ? jobs
              .map(
                (job) => `
            <article class="rounded-xl border border-white/10 p-4">
              <p class="font-medium text-white">${escapeHtml(serviceLabel(job.service_type))}</p>
              <p class="mt-1 text-xs text-slate-400">${escapeHtml(job.pickup_location || "—")} → ${escapeHtml(job.dropoff_location || "")}</p>
              <p class="mt-2 text-[11px] uppercase tracking-widest text-red-300">${escapeHtml(statusLabel(job.status))}</p>
            </article>`
              )
              .join("")
          : `<p class="text-slate-400">Nenhuma missão atribuída.</p>`;
      }
    }

    document.getElementById("driver-register")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const password = formValue(form, "password");
      const confirm = formValue(form, "password_confirm");
      const cpf = onlyDigits(formValue(form, "cpf"));
      if (!isValidCpf(cpf)) {
        showToast("Informe um CPF válido com 11 dígitos.", "error");
        return;
      }
      if (!isValidPin(password) || password !== confirm) {
        showToast("O PIN deve ter exatamente 6 dígitos e as duas caixas precisam coincidir.", "error");
        return;
      }
      if (!state.faceVerified || !state.facePhoto) {
        showToast("Capture a foto facial antes de enviar o cadastro.", "error");
        return;
      }
      if (!formValue(form, "base_state") || !formValue(form, "base_city")) {
        showToast("Informe o estado e a cidade/região de atuação.", "error");
        return;
      }
      const payload = {
        full_name: formValue(form, "full_name").trim(),
        email: formValue(form, "email").trim(),
        phone: formValue(form, "phone").trim(),
        cpf,
        role: "driver",
        vehicle_type: formValue(form, "vehicle_type").trim() || null,
        vehicle_plate: formValue(form, "vehicle_plate").trim() || null,
        base_state: formValue(form, "base_state"),
        base_city: formValue(form, "base_city"),
        panic_pin: "9110",
        duress_pin: "0000",
        kyc_status: "submitted",
        approval_status: "pending",
        status_aprovacao: "pendente",
        face_verified: true,
        face_photo: state.facePhoto || null,
        pin_set: true,
      };
      const authResult = await CSI.auth.signUpOrIn(payload.email, password);
      if (authResult.error && !authResult.user) {
        showToast(authErrorMessage(authResult.error), "error");
        return;
      }
      if (authResult.user?.id) payload.id = authResult.user.id;
      const { data, error } = await CSI.profiles.upsert(payload);
      if (error) {
        if (CSI.isSchemaError(error)) showSchemaHelp(error);
        else showToast(error.message, "error");
        return;
      }
      hideSchemaHelp();
      camera.stop();
      state.profile = data;
      CSI.rememberProfile(data);
      showDriverView("pending");
      showToast("Cadastro em triagem pelo comando. Aguarde aprovação.");
    });

    document.getElementById("driver-login")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const email = formValue(form, "email").trim();
      const password = formValue(form, "password");
      if (!isValidPin(password)) {
        setAuthMsg("O PIN deve ter exatamente 6 dígitos.");
        return;
      }
      const authResult = await CSI.auth.signIn(email, password);
      if (authResult.error && !authResult.user) {
        const message = authErrorMessage(authResult.error);
        setAuthMsg(message);
        showToast(message, "error");
        return;
      }
      const profileId = authResult.user?.id;
      let { data } = await CSI.profiles.get(profileId);
      if (!data || data.role !== "driver") {
        const byEmail = await CSI.profiles.getByEmail(email, "driver");
        data = byEmail.data;
      }
      if (!data || data.role !== "driver") {
        setAuthMsg("Perfil de motorista não encontrado.");
        return;
      }
      if (!isApproved(data)) {
        setAuthMsg("Cadastro em triagem pelo comando. Aguarde aprovação.");
        showDriverView("pending");
        return;
      }
      setAuthMsg("");
      await afterLogin(data);
    });

    document.getElementById("driver-logout")?.addEventListener("click", async () => {
      await CSI.auth.signOut();
      state.profile = null;
      showDriverView("auth");
      showToast("Sessão encerrada.");
    });

    document.querySelectorAll("[data-status]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!state.profile) return;
        const { error } = await CSI.driverStatus.upsert(state.profile.id, {
          status: btn.dataset.status,
          panic_active: false,
          duress_mode: false,
          vehicle_type: state.profile.vehicle_type,
          vehicle_plate: state.profile.vehicle_plate,
        });
        if (error) {
          if (CSI.isSchemaError(error)) showSchemaHelp(error);
          else showToast(error.message, "error");
          return;
        }
        await refresh();
        showToast(`Status atualizado: ${statusLabel(btn.dataset.status)}`);
      });
    });

    document.getElementById("driver-gps-btn")?.addEventListener("click", () => {
      if (!state.profile) return;
      if (!navigator.geolocation) {
        showToast("Geolocalização indisponível neste navegador.", "error");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { error } = await CSI.driverStatus.upsert(state.profile.id, {
            current_lat: pos.coords.latitude,
            current_lng: pos.coords.longitude,
            last_checkin_at: new Date().toISOString(),
            status: state.status?.status || STATUS_STORE.online,
            vehicle_type: state.profile.vehicle_type,
            vehicle_plate: state.profile.vehicle_plate,
          });
          if (error) {
            if (CSI.isSchemaError(error)) showSchemaHelp(error);
            else showToast(error.message, "error");
            return;
          }
          await refresh();
          showToast("GPS enviado ao centro de comando.");
        },
        () => showToast("Permita o acesso à localização.", "error"),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    document.getElementById("panic-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const pin = formValue(event.currentTarget, "pin").trim();
      const panicPin = state.profile?.panic_pin || "9110";
      const duressPin = state.profile?.duress_pin || "0000";
      const msg = document.getElementById("panic-msg");
      if (pin === duressPin) {
        await CSI.driverStatus.upsert(state.profile.id, {
          status: STATUS_STORE.offline,
          panic_active: false,
          duress_mode: true,
        });
        await refresh();
        if (msg) {
          msg.classList.remove("hidden");
          msg.textContent = "Coação silenciosa enviada. Status aparece Offline.";
        }
        showToast("Alerta de coação enviado.", "error");
        return;
      }
      if (pin === panicPin) {
        await CSI.driverStatus.upsert(state.profile.id, {
          status: STATUS_STORE.busy,
          panic_active: true,
          duress_mode: false,
        });
        await refresh();
        if (msg) {
          msg.classList.remove("hidden");
          msg.textContent = "PÂNICO enviado à central CSI.";
        }
        showToast("PÂNICO enviado à central CSI.", "error");
        return;
      }
      showToast("Senha de coação inválida.", "error");
    });

    bindIdentityMasks(document.getElementById("driver-register"));
    bindRegionPair("base_state", "base_city", document.getElementById("driver-register") || document);

    CSI.auth.session().then(async (session) => {
      if (!session?.user?.id) {
        showDriverView("auth");
        return;
      }
      const { data } = await CSI.profiles.get(session.user.id);
      if (data?.role === "driver") afterLogin(data);
      else showDriverView("auth");
    });
  }

  /* ---------------- Admin ---------------- */
  function initAdmin() {
    const state = {
      ready: false,
      unsub: [],
      tab: "overview",
      filtersBound: false,
      assignments: {},
      edit: null,
      cache: { clients: [], drivers: [], requests: [] },
      filters: {
        clients: "",
        clientsStatus: "all",
        drivers: "",
        driversStatus: "all",
        missions: "",
        missionsStatus: "all",
      },
    };

    function setTab(tab) {
      state.tab = tab;
      document.querySelectorAll("[data-admin-tab]").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.adminTab === tab);
      });
      document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
        panel.classList.toggle("hidden", panel.dataset.adminPanel !== tab);
      });
    }

    function unlock() {
      sessionStorage.setItem(ADMIN_SESSION, "1");
      toggleHidden("admin-gate", true);
      toggleHidden("admin-panel", false);
      state.ready = true;
      loadTariffs();
      bindFilters();
      render();
      state.unsub.push(CSI.subscribeRealtime("driver_status", render));
      state.unsub.push(CSI.subscribeRealtime("service_requests", render));
      state.unsub.push(CSI.subscribeRealtime("profiles", render));
    }

    function bindFilters() {
      if (state.filtersBound) return;
      state.filtersBound = true;
      const map = [
        ["client-search", "clients"],
        ["client-filter", "clientsStatus"],
        ["driver-search", "drivers"],
        ["driver-filter", "driversStatus"],
        ["mission-search", "missions"],
        ["mission-filter", "missionsStatus"],
      ];
      map.forEach(([id, key]) => {
        document.getElementById(id)?.addEventListener("input", (event) => {
          state.filters[key] = event.target.value;
          render();
        });
        document.getElementById(id)?.addEventListener("change", (event) => {
          state.filters[key] = event.target.value;
          render();
        });
      });
    }

    async function loadTariffs() {
      const { data } = await CSI.settings.getAll();
      const form = document.getElementById("tariff-form");
      if (!form || !data) return;
      if (form.elements.hourly_unarmed) form.elements.hourly_unarmed.value = data.hourly_unarmed;
      if (form.elements.hourly_armed) form.elements.hourly_armed.value = data.hourly_armed;
      if (form.elements.pix_key) form.elements.pix_key.value = data.pix_key;
      if (form.elements.pix_name) form.elements.pix_name.value = data.pix_name;
      if (form.elements.pix_city) form.elements.pix_city.value = data.pix_city;
    }

    function attachmentLink(url, label, name) {
      if (!url) return `<p class="text-xs text-slate-500">${label}: não enviado</p>`;
      const href = String(url);
      const isImg = href.startsWith("data:image") || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(href);
      return `
        <div class="mt-2">
          <p class="text-[11px] uppercase tracking-widest text-slate-500">${escapeHtml(label)}</p>
          ${isImg ? `<img src="${escapeHtml(href)}" alt="${escapeHtml(label)}" class="mt-1 h-24 rounded border border-white/10 object-cover" />` : ""}
          <a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="mt-1 inline-block text-xs text-blue-300 underline">Abrir ${escapeHtml(name || label)}</a>
        </div>`;
    }

    async function render() {
      const { requests, drivers, stats } = await refreshLiveOps();
      const [{ data: clients }, { data: pendingClients }, { data: pendingDrivers }, { data: allDrivers }] = await Promise.all([
        CSI.profiles.listByRole("client"),
        CSI.profiles.listPending(),
        CSI.profiles.listPendingDrivers(),
        CSI.profiles.listByRole("driver"),
      ]);
      const profilesById = Object.fromEntries([...(clients || []), ...(allDrivers || [])].map((item) => [item.id, item]));
      state.cache.clients = clients || [];
      state.cache.drivers = allDrivers || [];
      state.cache.requests = requests || [];
      const pendingMissions = requests.filter((item) => item.status === "pending");
      const onlineDrivers = (drivers || [])
        .filter((item) => isOnline(item.status))
        .map((live) => {
          const profile = profilesById[live.driver_id] || {};
          return {
            id: live.driver_id,
            name: profile.full_name || live.vehicle_plate || "Operador",
            cpf: profile.cpf || profile.document_id || "",
            vehicle: profile.vehicle_type || live.vehicle_type || "",
            plate: profile.vehicle_plate || live.vehicle_plate || "",
            state: profile.base_state || "",
            city: profile.base_city || "",
            praca: regionLabel(profile.base_state, profile.base_city),
          };
        });
      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      setText("stat-missions", String(requests.length));
      setText("stat-clients", String((clients || []).length));
      setText("stat-online", String(stats.available));
      setText(
        "stat-pending",
        String((pendingClients || []).length + (pendingDrivers || []).length + pendingMissions.length)
      );
      setText("stat-rating", stats.ratedCount ? `${stats.avgRating.toFixed(1)} ★` : "—");

      const inbox = document.getElementById("overview-inbox");
      if (inbox) {
        const items = [
          ...(pendingClients || []).map((item) => ({
            tab: "clients",
            kind: "Cadastro de cliente",
            title: item.full_name || "Cliente",
            meta: item.email || "",
          })),
          ...(pendingDrivers || []).map((item) => ({
            tab: "drivers",
            kind: "Cadastro de motorista",
            title: item.full_name || "Operador",
            meta: regionLabel(item.base_state, item.base_city),
          })),
          ...pendingMissions.map((item) => ({
            tab: "missions",
            kind: "Nova missão",
            title: item.requester_name || "Solicitação",
            meta: placeLabel(item.origin_state, item.origin_city, item.pickup_location),
          })),
        ];
        inbox.innerHTML = items.length
          ? items
              .map(
                (item) => `
                <button type="button" data-jump-tab="${item.tab}" class="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 text-left hover:border-csi-red/40">
                  <span>
                    <span class="block text-[10px] uppercase tracking-widest text-red-300">${escapeHtml(item.kind)}</span>
                    <span class="block text-sm text-white">${escapeHtml(item.title)}</span>
                    <span class="block text-[11px] text-slate-500">${escapeHtml(item.meta || "")}</span>
                  </span>
                  <span class="text-[11px] uppercase tracking-widest text-slate-400">Abrir</span>
                </button>`
              )
              .join("")
          : `<p class="text-slate-400">Nenhuma pendência nova no momento.</p>`;
        inbox.querySelectorAll("[data-jump-tab]").forEach((btn) => {
          btn.addEventListener("click", () => setTab(btn.dataset.jumpTab));
        });
      }

      const clientTriage = document.getElementById("client-triage");
      if (clientTriage) {
        clientTriage.innerHTML = pendingClients?.length
          ? pendingClients
              .map(
                (item) => `
                <article class="rounded-xl border border-white/10 p-4">
                  ${dossierHtml(item)}
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button class="csi-cta rounded-md px-3 py-2 text-xs font-semibold" data-approve-client="${item.id}">Aprovar</button>
                    <button class="rounded-md border border-csi-red/40 px-3 py-2 text-xs text-red-200" data-reject-client="${item.id}">Recusar</button>
                    ${crudButtons("client", item.id)}
                  </div>
                </article>`
              )
              .join("")
          : `<p class="text-slate-400">Nenhum cliente pendente.</p>`;
        clientTriage.querySelectorAll("[data-approve-client]").forEach((btn) => {
          btn.addEventListener("click", () => decideProfile(btn.dataset.approveClient, "approved"));
        });
        clientTriage.querySelectorAll("[data-reject-client]").forEach((btn) => {
          btn.addEventListener("click", () => decideProfile(btn.dataset.rejectClient, "rejected"));
        });
        bindCrudActions(clientTriage, { onEdit: openEdit, onDelete: deleteRecord });
      }

      const driverTriage = document.getElementById("driver-triage");
      if (driverTriage) {
        driverTriage.innerHTML = pendingDrivers?.length
          ? pendingDrivers
              .map(
                (item) => `
                <article class="rounded-xl border border-white/10 p-4">
                  ${dossierHtml(item, `<p class="mt-1 text-xs text-slate-500">${escapeHtml(item.vehicle_type || "—")} · ${escapeHtml(item.vehicle_plate || "")}</p>`)}
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button class="csi-cta rounded-md px-3 py-2 text-xs font-semibold" data-approve-driver="${item.id}">Credenciar</button>
                    <button class="rounded-md border border-csi-red/40 px-3 py-2 text-xs text-red-200" data-reject-driver="${item.id}">Recusar</button>
                    ${crudButtons("driver", item.id)}
                  </div>
                </article>`
              )
              .join("")
          : `<p class="text-slate-400">Nenhum motorista aguardando credenciamento.</p>`;
        driverTriage.querySelectorAll("[data-approve-driver]").forEach((btn) => {
          btn.addEventListener("click", () => decideProfile(btn.dataset.approveDriver, "approved"));
        });
        driverTriage.querySelectorAll("[data-reject-driver]").forEach((btn) => {
          btn.addEventListener("click", () => decideProfile(btn.dataset.rejectDriver, "rejected"));
        });
        bindCrudActions(driverTriage, { onEdit: openEdit, onDelete: deleteRecord });
      }

      const clientBody = document.getElementById("client-table-body");
      if (clientBody) {
        const filtered = (clients || []).filter((item) => {
          const bucket = approvalBucket(item);
          if (state.filters.clientsStatus !== "all" && bucket !== state.filters.clientsStatus) return false;
          return searchMatch(state.filters.clients, [item.full_name, item.email, item.cpf, item.document_id, item.company, item.phone]);
        });
        clientBody.innerHTML = filtered.length
          ? filtered
              .map(
                (item) => `
                <tr>
                  <td>${faceMini(item.face_photo, item.full_name)}</td>
                  <td>
                    <p class="text-white">${escapeHtml(item.full_name || "—")}</p>
                    <p class="text-[11px] text-slate-500">${escapeHtml(item.document_type || "")} ${escapeHtml(item.document_id || "")}</p>
                  </td>
                  <td>${escapeHtml(formatCpf(item.cpf || item.document_id))}</td>
                  <td>${escapeHtml(item.email || "—")}<br><span class="text-[11px] text-slate-500">${escapeHtml(item.phone || "")}</span></td>
                  <td>${escapeHtml(item.company || "—")}</td>
                  <td class="${isApproved(item) ? "text-emerald-400" : "text-amber-300"}">${escapeHtml(statusLabel(item.status_aprovacao || item.approval_status))}</td>
                  <td>${crudButtons("client", item.id)}</td>
                </tr>`
              )
              .join("")
          : `<tr><td colspan="7" class="text-slate-400">Nenhum cliente encontrado.</td></tr>`;
        bindCrudActions(clientBody, { onEdit: openEdit, onDelete: deleteRecord });
      }

      const seenDrivers = new Set();
      const driverRows = (allDrivers || []).map((profile) => {
        seenDrivers.add(profile.id);
        return { profile, live: drivers.find((item) => item.driver_id === profile.id) };
      });
      (drivers || []).forEach((live) => {
        if (seenDrivers.has(live.driver_id)) return;
        driverRows.push({
          profile: {
            id: live.driver_id,
            full_name: live.vehicle_plate || "Operador",
            vehicle_type: live.vehicle_type,
            vehicle_plate: live.vehicle_plate,
            approval_status: "approved",
            status_aprovacao: "aprovado",
          },
          live,
        });
      });

      const driverBody = document.getElementById("driver-table-body");
      if (driverBody) {
        const filtered = driverRows.filter(({ profile, live }) => {
          const liveStatus = live?.status || "offline";
          const bucket = approvalBucket(profile) === "pending" ? "pending" : liveStatus;
          if (state.filters.driversStatus !== "all" && bucket !== state.filters.driversStatus && !(state.filters.driversStatus === "online" && isOnline(liveStatus))) {
            return false;
          }
          return searchMatch(state.filters.drivers, [profile.full_name, profile.email, profile.cpf, profile.vehicle_plate, live?.vehicle_plate, profile.phone, profile.base_state, profile.base_city]);
        });
        driverBody.innerHTML = filtered.length
          ? filtered
              .map(({ profile, live }) => {
                const flag = live?.duress_mode ? "COAÇÃO" : live?.panic_active ? "PÂNICO" : statusLabel(live?.status || "offline");
                const tone = live?.panic_active || live?.duress_mode ? "text-red-300" : isOnline(live?.status) ? "text-emerald-400" : "text-slate-400";
                return `
                <tr>
                  <td>${faceMini(profile.face_photo, profile.full_name)}</td>
                  <td>
                    <p class="text-white">${escapeHtml(profile.full_name || "—")}</p>
                    <p class="text-[11px] text-slate-500">${escapeHtml(profile.email || "")}</p>
                  </td>
                  <td>${escapeHtml(formatCpf(profile.cpf || profile.document_id))}</td>
                  <td>${escapeHtml(regionLabel(profile.base_state, profile.base_city))}</td>
                  <td>${escapeHtml(vehicleLabel(profile.vehicle_type || live?.vehicle_type) || profile.vehicle_type || "—")} · ${escapeHtml(profile.vehicle_plate || live?.vehicle_plate || "")}</td>
                  <td class="${tone}">${flag}</td>
                  <td class="${isApproved(profile) ? "text-emerald-400" : "text-amber-300"}">${escapeHtml(statusLabel(profile.status_aprovacao || profile.approval_status))}</td>
                  <td>${crudButtons("driver", profile.id)}</td>
                </tr>`;
              })
              .join("")
          : `<tr><td colspan="8" class="text-slate-400">Nenhum motorista encontrado.</td></tr>`;
        bindCrudActions(driverBody, { onEdit: openEdit, onDelete: deleteRecord });
      }

      const requestTriage = document.getElementById("request-triage");
      if (requestTriage) {
        requestTriage.innerHTML = pendingMissions.length
          ? pendingMissions
              .map((item) => {
                const client = profilesById[item.client_id] || {};
                const when = formatScheduled(item.scheduled_at);
                const preferred = String(item.preferred_driver_name || "").trim().toLowerCase();
                const preselected =
                  state.assignments[item.id] ||
                  onlineDrivers.find((driver) => preferred && driver.name.toLowerCase().includes(preferred))?.id ||
                  "";
                if (preselected) state.assignments[item.id] = preselected;
                const options = onlineDrivers.length
                  ? `<option value="">Selecione o operador online</option>${onlineDrivers
                      .map(
                        (driver) =>
                          `<option value="${driver.id}" ${driver.id === preselected ? "selected" : ""}>${escapeHtml(driver.name)} · ${escapeHtml(driver.praca || "sem praça")} · ${escapeHtml(driver.plate || driver.vehicle || "sem placa")}</option>`
                      )
                      .join("")}`
                  : `<option value="">Nenhum motorista online no momento</option>`;
                return `
                <article class="rounded-xl border border-white/10 p-4">
                  ${dossierHtml(client, `<p class="mt-1 text-xs text-slate-500">Rota: ${escapeHtml(placeLabel(item.origin_state, item.origin_city, item.pickup_location))} → ${escapeHtml(placeLabel(item.dest_state, item.dest_city, item.dropoff_location))}</p>`)}
                  <p class="mt-2 text-xs text-slate-400">${escapeHtml(serviceLabel(item.service_type))} · ${escapeHtml(ownVehicleLabel(item))} · ${when.date} ${when.time}</p>
                  <p class="mt-1 text-xs text-slate-500">Preferência do cliente: ${escapeHtml(item.preferred_driver_name || "sem preferência")}</p>
                  <p class="mt-2 text-sm text-red-200">${money(item.estimated_price)} · sinal ${money((Number(item.estimated_price) || 0) * 0.5)}</p>
                  <label class="mt-3 block text-xs text-slate-300">Alocar motorista online
                    <select data-assign-driver="${item.id}" class="exec-filter mt-1 w-full">${options}</select>
                  </label>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button class="csi-cta rounded-md px-3 py-2 text-xs font-semibold" data-approve="${item.id}">Aprovar e gerar contrato</button>
                    <button class="rounded-md border border-csi-red/40 px-3 py-2 text-xs text-red-200" data-reject="${item.id}">Recusar</button>
                    ${crudButtons("mission", item.id)}
                  </div>
                </article>`;
              })
              .join("")
          : `<p class="text-slate-400">Fila limpa. Nenhuma solicitação pendente.</p>`;
        requestTriage.querySelectorAll("[data-assign-driver]").forEach((select) => {
          select.addEventListener("change", () => {
            state.assignments[select.dataset.assignDriver] = select.value;
          });
        });
        requestTriage.querySelectorAll("[data-approve]").forEach((btn) => {
          btn.addEventListener("click", () => decideMission(btn.dataset.approve, "approved"));
        });
        requestTriage.querySelectorAll("[data-reject]").forEach((btn) => {
          btn.addEventListener("click", () => decideMission(btn.dataset.reject, "rejected"));
        });
        bindCrudActions(requestTriage, { onEdit: openEdit, onDelete: deleteRecord });
      }

      const missionBody = document.getElementById("mission-table-body");
      if (missionBody) {
        const filtered = requests.filter((item) => {
          if (state.filters.missionsStatus !== "all" && item.status !== state.filters.missionsStatus) return false;
          return searchMatch(state.filters.missions, [
            item.requester_name,
            item.pickup_location,
            item.dropoff_location,
            item.origin_city,
            item.dest_city,
            item.assigned_driver_name,
            item.preferred_driver_name,
            protocolOf(item.id),
            item.email,
          ]);
        });
        missionBody.innerHTML = filtered.length
          ? filtered
              .map((item) => {
                const canRelease =
                  item.status === "em_analise_contrato" ||
                  (item.status === "approved" && (item.signed_contract || item.pix_receipt));
                const showWhatsapp = canRelease || item.status === "agendado_liberado";
                const pixUrl = isHttpUrl(item.pix_receipt) ? item.pix_receipt : "";
                const govUrl = isHttpUrl(item.signed_contract) ? item.signed_contract : "";
                const actions = [
                  item.contract_text ? `<button class="rounded-md border border-white/15 px-2 py-1 text-[11px]" data-admin-contract="${item.id}">Contrato</button>` : "",
                  pixUrl
                    ? `<a href="${escapeHtml(pixUrl)}" target="_blank" rel="noopener" class="inline-block rounded-md border border-white/15 px-2 py-1 text-[11px]">Ver Comprovativo Pix</a>`
                    : "",
                  govUrl
                    ? `<a href="${escapeHtml(govUrl)}" target="_blank" rel="noopener" class="inline-block rounded-md border border-white/15 px-2 py-1 text-[11px]">Ver Contrato Assinado</a>`
                    : "",
                  canRelease ? `<button class="csi-cta rounded-md px-2 py-1 text-[11px]" data-release="${item.id}">Liberar</button>` : "",
                  item.status === "agendado_liberado"
                    ? `<button class="rounded-md border border-white/15 px-2 py-1 text-[11px]" data-complete="${item.id}">Concluir</button>`
                    : "",
                  crudButtons("mission", item.id),
                ]
                  .filter(Boolean)
                  .join(" ");
                return `
                <tr>
                  <td class="font-mono text-[11px] text-red-200">${protocolOf(item.id)}</td>
                  <td>
                    <p class="text-white">${escapeHtml(item.requester_name || "—")}</p>
                    <p class="text-[11px] text-slate-500">${escapeHtml(placeLabel(item.origin_state, item.origin_city, item.pickup_location))} → ${escapeHtml(placeLabel(item.dest_state, item.dest_city, item.dropoff_location))}</p>
                    ${pixUrl || govUrl ? `<p class="text-[11px] text-emerald-300">Anexos no Storage</p>` : ""}
                  </td>
                  <td>${escapeHtml(item.assigned_driver_name || item.preferred_driver_name || "—")}</td>
                  <td>${money(item.estimated_price)}</td>
                  <td>${escapeHtml(statusLabel(item.status))}</td>
                  <td>${Number(item.rating) > 0 ? `${starsHtml(item.rating)} <span class="text-[11px] text-slate-400">${escapeHtml(item.rating_feedback || "")}</span>` : "—"}</td>
                  <td class="space-y-1">${actions || "—"}</td>
                </tr>
                ${
                  showWhatsapp
                    ? `<tr>
                  <td colspan="7">
                    <div class="mb-3 rounded-lg border border-white/10 bg-black/20 p-3">
                      <p class="text-[11px] uppercase tracking-widest text-slate-500">Mensagem WhatsApp</p>
                      <textarea readonly rows="4" data-whatsapp-box="${item.id}" class="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200">${escapeHtml(whatsappReleaseMessage(item))}</textarea>
                      <button type="button" data-copy-whatsapp="${item.id}" class="mt-2 rounded-md border border-white/15 px-3 py-1.5 text-[11px]">Copiar Mensagem WhatsApp</button>
                    </div>
                  </td>
                </tr>`
                    : ""
                }`;
              })
              .join("")
          : `<tr><td colspan="7" class="text-slate-400">Nenhuma missão encontrada.</td></tr>`;
        missionBody.querySelectorAll("[data-release]").forEach((btn) => {
          btn.addEventListener("click", () => releaseMission(btn.dataset.release));
        });
        missionBody.querySelectorAll("[data-complete]").forEach((btn) => {
          btn.addEventListener("click", () => completeMission(btn.dataset.complete));
        });
        missionBody.querySelectorAll("[data-admin-contract]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const job = requests.find((item) => item.id === btn.dataset.adminContract);
            if (job) await downloadContractFile(job);
          });
        });
        bindCopyWhatsapp(missionBody);
        bindCrudActions(missionBody, { onEdit: openEdit, onDelete: deleteRecord });
      }
    }

    function fieldInput(name, label, value = "", attrs = "") {
      return `<label class="block text-sm">${escapeHtml(label)}<input name="${name}" value="${escapeHtml(value ?? "")}" ${attrs} class="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2" /></label>`;
    }

    function fieldText(name, label, value = "") {
      return `<label class="block text-sm">${escapeHtml(label)}<textarea name="${name}" rows="2" class="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2">${escapeHtml(value ?? "")}</textarea></label>`;
    }

    function fieldState(name, value = "") {
      return `<label class="block text-sm">Estado
        <select name="${name}" class="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2">
          <option value="">Selecione</option>
          <option value="GO" ${value === "GO" ? "selected" : ""}>Goiás - GO</option>
          <option value="DF" ${value === "DF" ? "selected" : ""}>Distrito Federal - DF</option>
        </select>
      </label>`;
    }

    function fieldCity(name, stateCode, value = "") {
      const cities = CSI.regions?.[stateCode]?.cities || [];
      return `<label class="block text-sm">Cidade / região
        <select name="${name}" class="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2">
          <option value="">Cidade / região</option>
          ${cities.map((city) => `<option value="${escapeHtml(city)}" ${city === value ? "selected" : ""}>${escapeHtml(city)}</option>`).join("")}
        </select>
      </label>`;
    }

    function closeEdit() {
      state.edit = null;
      document.getElementById("admin-edit-modal")?.classList.remove("is-open");
    }

    function openEdit(kind, id) {
      const modal = document.getElementById("admin-edit-modal");
      const form = document.getElementById("admin-edit-form");
      const title = document.getElementById("admin-edit-title");
      if (!modal || !form) return;
      state.edit = { kind, id };
      let html = "";
      if (kind === "client" || kind === "driver") {
        const item = (kind === "client" ? state.cache.clients : state.cache.drivers).find((row) => row.id === id) || {};
        title.textContent = kind === "client" ? "Editar cliente" : "Editar motorista";
        html = [
          fieldInput("full_name", "Nome completo", item.full_name),
          fieldInput("email", "E-mail", item.email, 'type="email"'),
          fieldInput("phone", "Telefone", item.phone, 'inputmode="numeric" maxlength="15" placeholder="(00) 00000-0000"'),
          fieldInput("cpf", "CPF", item.cpf || item.document_id, 'inputmode="numeric" maxlength="14" placeholder="000.000.000-00"'),
        ];
        if (kind === "client") {
          html.push(fieldInput("company", "Empresa", item.company), fieldInput("address", "Endereço", item.address));
        } else {
          html.push(
            fieldInput("vehicle_type", "Veículo", item.vehicle_type),
            fieldInput("vehicle_plate", "Placa", item.vehicle_plate),
            fieldState("base_state", item.base_state),
            fieldCity("base_city", item.base_state, item.base_city)
          );
        }
      } else {
        const item = state.cache.requests.find((row) => row.id === id) || {};
        title.textContent = "Editar missão";
        html = [
          fieldInput("requester_name", "Cliente", item.requester_name),
          fieldState("origin_state", item.origin_state),
          fieldCity("origin_city", item.origin_state, item.origin_city),
          fieldInput("pickup_location", "Local de origem", item.pickup_location),
          fieldState("dest_state", item.dest_state),
          fieldCity("dest_city", item.dest_state, item.dest_city),
          fieldInput("dropoff_location", "Local de destino", item.dropoff_location),
          fieldInput("estimated_price", "Valor", item.estimated_price, 'type="number" min="0" step="10"'),
          `<label class="block text-sm">Status
            <select name="status" class="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              ${["pending", "approved", "em_analise_contrato", "agendado_liberado", "completed", "rejected"]
                .map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${escapeHtml(statusLabel(status))}</option>`)
                .join("")}
            </select>
          </label>`,
          fieldInput("preferred_driver_name", "Preferência de operador", item.preferred_driver_name),
          fieldText("notes", "Observações", item.notes),
          isHttpUrl(item.pix_receipt)
            ? `<a href="${escapeHtml(item.pix_receipt)}" target="_blank" rel="noopener" class="inline-block rounded-md border border-white/15 px-3 py-2 text-xs">Ver Comprovativo Pix</a>`
            : "",
          isHttpUrl(item.signed_contract)
            ? `<a href="${escapeHtml(item.signed_contract)}" target="_blank" rel="noopener" class="inline-block rounded-md border border-white/15 px-3 py-2 text-xs">Ver Contrato Assinado</a>`
            : "",
          `<div class="rounded-lg border border-white/10 p-3">
            <p class="text-[11px] uppercase tracking-widest text-slate-500">Mensagem WhatsApp</p>
            <textarea readonly rows="5" data-whatsapp-box="${item.id}" class="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs">${escapeHtml(whatsappReleaseMessage(item))}</textarea>
            <button type="button" data-copy-whatsapp="${item.id}" class="mt-2 rounded-md border border-white/15 px-3 py-1.5 text-xs">Copiar Mensagem WhatsApp</button>
          </div>`,
        ];
      }
      form.innerHTML = html.join("");
      bindIdentityMasks(form);
      bindRegionPair("base_state", "base_city", form);
      bindRegionPair("origin_state", "origin_city", form);
      bindRegionPair("dest_state", "dest_city", form);
      bindCopyWhatsapp(form);
      modal.classList.add("is-open");
    }

    async function saveEdit(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const { kind, id } = state.edit || {};
      if (!kind || !id) return;
      let error;
      if (kind === "client" || kind === "driver") {
        const patch = {
          full_name: formValue(form, "full_name").trim(),
          email: formValue(form, "email").trim(),
          phone: formValue(form, "phone").trim(),
          cpf: formValue(form, "cpf").trim(),
        };
        if (kind === "client") {
          patch.company = formValue(form, "company").trim();
          patch.address = formValue(form, "address").trim();
        } else {
          patch.vehicle_type = formValue(form, "vehicle_type").trim();
          patch.vehicle_plate = formValue(form, "vehicle_plate").trim();
          patch.base_state = formValue(form, "base_state");
          patch.base_city = formValue(form, "base_city");
        }
        ({ error } = await CSI.profiles.update(id, patch));
      } else {
        ({ error } = await CSI.serviceRequests.update(id, {
          requester_name: formValue(form, "requester_name").trim(),
          pickup_location: formValue(form, "pickup_location").trim(),
          dropoff_location: formValue(form, "dropoff_location").trim(),
          origin_state: formValue(form, "origin_state"),
          origin_city: formValue(form, "origin_city"),
          dest_state: formValue(form, "dest_state"),
          dest_city: formValue(form, "dest_city"),
          estimated_price: Number(formValue(form, "estimated_price") || 0),
          status: formValue(form, "status"),
          preferred_driver_name: formValue(form, "preferred_driver_name").trim() || null,
          notes: formValue(form, "notes").trim() || null,
        }));
      }
      if (error) {
        if (CSI.isSchemaError(error)) showSchemaHelp(error);
        else showToast(error.message, "error");
        return;
      }
      closeEdit();
      showToast("Registro atualizado.");
      render();
    }

    async function deleteRecord(kind, id) {
      const labels = { client: "este cliente", driver: "este motorista", mission: "esta missão" };
      if (!window.confirm(`Excluir ${labels[kind] || "este registro"} de forma permanente?`)) return;
      const result = kind === "mission" ? await CSI.serviceRequests.remove(id) : await CSI.profiles.remove(id);
      if (result.error) {
        if (CSI.isSchemaError(result.error)) showSchemaHelp(result.error);
        else showToast(result.error.message, "error");
        return;
      }
      showToast("Registro e dependências excluídos.");
      render();
    }

    async function decideProfile(id, decision) {
      const { error } = await CSI.profiles.setApproval(id, decision);
      if (error) {
        if (CSI.isSchemaError(error)) showSchemaHelp(error);
        else showToast(error.message, "error");
        return;
      }
      showToast(decision === "approved" ? "Perfil credenciado." : "Perfil recusado.");
      render();
    }

    async function decideMission(requestId, decision) {
      if (decision !== "approved") {
        const { error } = await CSI.serviceRequests.update(requestId, { status: "rejected" });
        if (error) {
          if (CSI.isSchemaError(error)) showSchemaHelp(error);
          else showToast(error.message, "error");
          return;
        }
        delete state.assignments[requestId];
        showToast("Missão recusada.");
        render();
        return;
      }
      const selectedId =
        state.assignments[requestId] || document.querySelector(`[data-assign-driver="${requestId}"]`)?.value || "";
      if (!selectedId) {
        showToast("Selecione um motorista online no card da missão antes de aprovar.", "error");
        return;
      }
      const { data: request, error: loadError } = await CSI.serviceRequests.get(requestId);
      if (loadError || !request) {
        showToast(loadError?.message || "Não foi possível carregar a missão.", "error");
        return;
      }
      const [{ data: client }, { data: driver }, { data: live }, { data: cfg }] = await Promise.all([
        CSI.profiles.get(request.client_id),
        CSI.profiles.get(selectedId),
        CSI.driverStatus.getByDriver(selectedId),
        CSI.settings.getAll(),
      ]);
      const valorTotal = Number(request.estimated_price) || 0;
      const protocol = protocolOf(request.id);
      const when = formatScheduled(request.scheduled_at);
      const assignedName = driver?.full_name || live?.vehicle_plate || "Operador";
      const assignedCpf = formatCpf(driver?.cpf || driver?.document_id || "");
      const assignedVehicle = request.client_own_vehicle ? "Veículo próprio do cliente" : vehicleLabel(driver?.vehicle_type || live?.vehicle_type) || driver?.vehicle_type || live?.vehicle_type || "—";
      const assignedPlate = driver?.vehicle_plate || live?.vehicle_plate || "—";
      const assignedPraca = regionLabel(driver?.base_state, driver?.base_city);
      const origemCompleta = placeLabel(request.origin_state, request.origin_city, request.pickup_location);
      const destinoCompleto = placeLabel(request.dest_state, request.dest_city, request.dropoff_location);
      const pixPayload = CSI.buildPixPayload({
        key: cfg.pix_key,
        name: cfg.pix_name,
        city: cfg.pix_city,
        amount: valorTotal * 0.5,
        txid: protocol,
      });
      const contractData = {
        valorTotal,
        protocolo: protocol,
        nomeCliente: request.requester_name || client?.full_name,
        cpfCliente: formatCpf(client?.cpf || client?.document_id || ""),
        endereco: client?.address || client?.company || "—",
        servico: serviceLabel(request.service_type),
        origem: request.pickup_location,
        destino: request.dropoff_location,
        origemCompleta,
        destinoCompleto,
        data: when.date,
        horario: when.time,
        perfilSeguridad: securityLabel(request.security_profile),
        vestuario: attireLabel(request.attire),
        veiculo: assignedVehicle,
        placa: assignedPlate,
        operador: assignedName,
        cpfOperador: assignedCpf,
        pracaOperador: assignedPraca,
        pixKey: cfg.pix_key,
        pixPayload,
        qrDataUrl: await qrDataUrl(pixPayload),
      };
      const contract = typeof window.gerarTextoContrato === "function" ? window.gerarTextoContrato(contractData) : "";
      let { error } = await CSI.serviceRequests.update(requestId, {
        status: "approved",
        driver_id: selectedId,
        assigned_driver_name: assignedName,
        assigned_driver_cpf: assignedCpf,
        assigned_driver_vehicle: assignedVehicle,
        assigned_driver_plate: assignedPlate,
        assigned_driver_praca: assignedPraca,
        contract_text: contract,
        deposit_amount: Number((valorTotal * 0.5).toFixed(2)),
        pix_payload: pixPayload,
      });
      if (error && CSI.isSchemaError(error)) {
        const retry = await CSI.serviceRequests.update(requestId, {
          status: "approved",
          driver_id: selectedId,
          contract_text: contract,
          pix_payload: pixPayload,
        });
        error = retry.error;
      }
      if (error) {
        if (CSI.isSchemaError(error)) showSchemaHelp(error);
        else showToast(error.message, "error");
        return;
      }
      delete state.assignments[requestId];
      try {
        if (typeof window.gerarContratoPdf === "function") await window.gerarContratoPdf(contractData);
      } catch (pdfError) {
        console.warn("[CSI] PDF na aprovação falhou.", pdfError);
      }
      showToast("Missão aprovada. Motorista alocado e contrato PDF gerado.");
      render();
    }

    async function completeMission(requestId) {
      const { error } = await CSI.serviceRequests.update(requestId, { status: "completed" });
      if (error) {
        if (CSI.isSchemaError(error)) showSchemaHelp(error);
        else showToast(error.message, "error");
        return;
      }
      showToast("Serviço marcado como concluído. O cliente pode avaliar.");
      render();
    }

    async function releaseMission(requestId) {
      const { error } = await CSI.serviceRequests.update(requestId, { status: "agendado_liberado" });
      if (error) {
        if (CSI.isSchemaError(error)) showSchemaHelp(error);
        else showToast(error.message, "error");
        return;
      }
      showToast("Missão liberada. O cliente já vê o status Aprovado e confirmado.");
      render();
    }

    document.getElementById("admin-edit-cancel")?.addEventListener("click", closeEdit);
    document.getElementById("admin-edit-form")?.addEventListener("submit", saveEdit);
    document.getElementById("admin-edit-modal")?.addEventListener("click", (event) => {
      if (event.target.id === "admin-edit-modal") closeEdit();
    });

    document.getElementById("admin-tabs")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-admin-tab]");
      if (btn) setTab(btn.dataset.adminTab);
    });

    document.getElementById("tariff-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const { error } = await CSI.settings.setMany({
        hourly_unarmed: formValue(form, "hourly_unarmed"),
        hourly_armed: formValue(form, "hourly_armed"),
        pix_key: formValue(form, "pix_key").trim(),
        pix_name: formValue(form, "pix_name").trim(),
        pix_city: formValue(form, "pix_city").trim(),
      });
      if (error) {
        if (CSI.isSchemaError(error)) showSchemaHelp(error);
        else showToast(error.message, "error");
        return;
      }
      hideSchemaHelp();
      showToast("Tarifas gravadas em system_settings.");
    });

    document.getElementById("admin-login")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const pin = formValue(event.currentTarget, "pin").trim();
      if (pin !== CSI.adminPin) {
        document.getElementById("admin-login-error")?.classList.remove("hidden");
        showToast("Senha inválida.", "error");
        return;
      }
      unlock();
    });

    if (sessionStorage.getItem(ADMIN_SESSION) === "1") unlock();
  }

  ready(() => {
    bindChrome();
    const page = document.body.dataset.page;
    if (page === "client") initClient();
    if (page === "driver") initDriver();
    if (page === "admin") initAdmin();
  });
})();
