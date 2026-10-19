/**
 * CSI Mobility — cliente Supabase compartilhado
 * Tabelas: profiles, driver_status, service_requests, system_settings
 */

const SUPABASE_URL = "https://mgapgvrufgasezfmmzet.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Wj4axgB4Ux9gE3jhPbwykQ_seIMd5Zt";

const TABLES = {
  profiles: "profiles",
  driverStatus: "driver_status",
  serviceRequests: "service_requests",
  settings: "system_settings",
};

const SERVICES = {
  executive_transport: {
    id: "executive_transport",
    label: "Deslocamento Executivo",
    summary: "Motorista discreto para agenda corporativa, transfers e rotina VIP.",
    base: 280,
    perKm: 8,
  },
  vip_escort: {
    id: "vip_escort",
    label: "Escolta VIP",
    summary: "Proteção embarcada e protocolo de escolta para autoridades e executivos.",
    base: 850,
    perKm: 15,
  },
  event_coverage: {
    id: "event_coverage",
    label: "Cobertura de Eventos",
    summary: "Cortejo, timing de palco e cobertura de evento com janela mínima de 4h.",
    base: 2200,
    perKm: 6,
  },
};

const VEHICLES = {
  operator: { id: "operator", label: "Veículo do operador CSI", multiplier: 1 },
  own: { id: "own", label: "Veículo próprio do cliente", multiplier: 1 },
  sedan: { id: "sedan", label: "Sedan executivo", multiplier: 1 },
  suv: { id: "suv", label: "SUV", multiplier: 1 },
  armored: { id: "armored", label: "Blindado", multiplier: 1 },
  blindado: { id: "blindado", label: "Blindado", multiplier: 1 },
  van: { id: "van", label: "Van protocolo", multiplier: 1 },
};

const REGIONS = {
  GO: {
    code: "GO",
    label: "Goiás - GO",
    cities: [
      "Goiânia",
      "Aparecida de Goiânia",
      "Anápolis",
      "Rio Verde",
      "Luziânia",
      "Águas Lindas de Goiás",
      "Valparaíso de Goiás",
      "Trindade",
      "Formosa",
      "Novo Gama",
      "Senador Canedo",
      "Itumbiara",
      "Catalão",
      "Jataí",
      "Caldas Novas",
    ],
  },
  DF: {
    code: "DF",
    label: "Distrito Federal - DF",
    cities: [
      "Plano Piloto/Brasília",
      "Asa Norte",
      "Asa Sul",
      "Lago Sul",
      "Lago Norte",
      "Sudoeste/Octogonal",
      "Cruzeiro",
      "Guará",
      "Águas Claras",
      "Taguatinga",
      "Ceilândia",
      "Samambaia",
      "Sobradinho",
      "Planaltina",
      "Gama",
      "Santa Maria",
      "São Sebastião",
      "Recanto das Emas",
      "Riacho Fundo",
      "Núcleo Bandeirante",
      "Candangolândia",
      "Brazlândia",
      "Park Way",
      "SIA",
      "SCIA/Estrutural",
      "Varjão",
    ],
  },
};

const ATTIRE = {
  terno_completo: { id: "terno_completo", label: "Terno Completo", extra: 90 },
  esporte_fino: { id: "esporte_fino", label: "Esporte Fino", extra: 45 },
  paisana: { id: "paisana", label: "À Paisana", extra: 0 },
};

const SECURITY = {
  unarmed: { id: "unarmed", label: "Motorista Desarmado", extra: 0 },
  armed_tactical: { id: "armed_tactical", label: "Porte de Armas / Escolta Tática", extra: 0 },
};

const DEFAULT_SETTINGS = {
  hourly_unarmed: 180,
  hourly_armed: 350,
  pix_key: "00.000.000/0001-00",
  pix_name: "CSI MOBILITY",
  pix_city: "GOIANIA",
};

const ADMIN_PIN = "1234";
const ADMIN_CODE = "CSI-ADMIN";
const STORAGE_KEYS = {
  profileId: "csi_profile_id",
  role: "csi_role",
  email: "csi_profile_email",
};

function patchedFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("apikey", SUPABASE_ANON_KEY);
  const auth = headers.get("Authorization");
  if (auth && auth.includes("sb_publishable_")) {
    headers.delete("Authorization");
  }
  return fetch(url, { ...options, headers });
}

function createSupabaseClient() {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("[CSI] supabase-js não carregou.");
    return null;
  }

  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { fetch: patchedFetch },
  });
}

const db = createSupabaseClient();

function isConfigured() {
  return Boolean(db);
}

function notConfigured() {
  return { message: "Cliente Supabase indisponível." };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function estimateKm(origin, destination) {
  const source = `${origin || ""}|${destination || ""}`.trim();
  if (!source || source === "|") return 12;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 33 + source.charCodeAt(i)) >>> 0;
  }
  return 8 + (hash % 48);
}

function estimateHours(distanceKm) {
  const km = Math.max(1, Number(distanceKm) || 12);
  const raw = km / 35;
  return Math.max(1, Math.round(raw * 2) / 2);
}

function quoteBudget({
  serviceType,
  vehicleType,
  clientOwnVehicle,
  distanceKm,
  attire,
  securityProfile,
  hours,
  settings: rates,
} = {}) {
  const service = SERVICES[serviceType] || SERVICES.executive_transport;
  const own = clientOwnVehicle === true || clientOwnVehicle === "yes" || vehicleType === "own";
  const vehicle = own ? VEHICLES.own : VEHICLES.operator;
  const dress = ATTIRE[attire] || ATTIRE.terno_completo;
  const security = SECURITY[securityProfile] || SECURITY.unarmed;
  const cfg = { ...DEFAULT_SETTINGS, ...(rates || currentSettings) };
  const km = Math.max(1, Number(distanceKm) || 12);
  const duration = Math.max(1, Number(hours) || estimateHours(km));
  const hourly =
    securityProfile === "armed_tactical"
      ? Number(cfg.hourly_armed || DEFAULT_SETTINGS.hourly_armed)
      : Number(cfg.hourly_unarmed || DEFAULT_SETTINGS.hourly_unarmed);
  const labor = hourly * duration;
  const total = Math.round((labor + Number(dress.extra || 0)) / 10) * 10;
  return {
    total,
    km,
    hours: duration,
    hourly,
    service,
    vehicle,
    attire: dress,
    security,
    breakdown: [
      {
        label: `${security.label} · ${duration} h × ${Number(hourly).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}`,
        value: labor,
      },
      { label: dress.label, value: dress.extra },
      { label: vehicle.label, value: own ? "Sim" : "Não" },
      { label: `${km} km estimados`, value: `${duration} h` },
    ],
  };
}

function rememberProfile(profile) {
  if (!profile?.id) return;
  localStorage.setItem(STORAGE_KEYS.profileId, profile.id);
  if (profile.role) localStorage.setItem(STORAGE_KEYS.role, profile.role);
  if (profile.email) localStorage.setItem(STORAGE_KEYS.email, normalizeEmail(profile.email));
}

function rememberedProfileId() {
  return localStorage.getItem(STORAGE_KEYS.profileId);
}

function rememberedEmail() {
  return localStorage.getItem(STORAGE_KEYS.email);
}

function clearRememberedProfile() {
  localStorage.removeItem(STORAGE_KEYS.profileId);
  localStorage.removeItem(STORAGE_KEYS.role);
  localStorage.removeItem(STORAGE_KEYS.email);
}

function isSchemaError(error) {
  const text = `${error?.message || ""} ${error?.code || ""}`.toLowerCase();
  return (
    text.includes("row-level security") ||
    text.includes("column") ||
    text.includes("schema cache") ||
    text.includes("42501") ||
    text.includes("42703") ||
    text.includes("pgrst")
  );
}

function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function emv(id, value) {
  const v = String(value);
  return `${id}${String(v.length).padStart(2, "0")}${v}`;
}

function sanitizePixKey(key) {
  const raw = String(key || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 14 || digits.length === 11) return digits;
  return raw;
}

function buildPixPayload({ key, name, city, amount, txid } = {}) {
  const pixKey = sanitizePixKey(key || DEFAULT_SETTINGS.pix_key);
  const gui = emv("00", "br.gov.bcb.pix") + emv("01", pixKey);
  const additional = emv("62", emv("05", String(txid || "CSIMOBILITY").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "CSIMOBILITY"));
  const body =
    emv("00", "01") +
    emv("01", "12") +
    emv("26", gui) +
    emv("52", "0000") +
    emv("53", "986") +
    (amount ? emv("54", Number(amount).toFixed(2)) : "") +
    emv("58", "BR") +
    emv("59", String(name || DEFAULT_SETTINGS.pix_name).slice(0, 25)) +
    emv("60", String(city || DEFAULT_SETTINGS.pix_city).slice(0, 15)) +
    additional +
    "6304";
  return body + crc16(body);
}

let currentSettings = { ...DEFAULT_SETTINGS };

const auth = {
  async session() {
    if (!db) return null;
    const { data } = await db.auth.getSession();
    return data?.session || null;
  },

  async currentUser() {
    const session = await this.session();
    return session?.user || null;
  },

  async signIn(email, password) {
    if (!db) return { user: null, session: null, error: notConfigured() };
    const result = await db.auth.signInWithPassword({ email, password });
    return {
      user: result.data?.user || null,
      session: result.data?.session || null,
      error: result.error,
    };
  },

  async signUp(email, password) {
    if (!db) return { user: null, session: null, error: notConfigured() };
    const result = await db.auth.signUp({ email, password });
    return {
      user: result.data?.user || null,
      session: result.data?.session || null,
      error: result.error,
    };
  },

  async signUpOrIn(email, password) {
    const signUp = await this.signUp(email, password);
    if (!signUp.error) {
      if (signUp.session || !signUp.user) return signUp;
      const follow = await this.signIn(email, password);
      return follow.error ? signUp : follow;
    }
    const already = /already registered|user already|already exists|already been registered|email address is already/i.test(
      signUp.error?.message || ""
    );
    if (!already) {
      return { user: null, session: null, error: { message: friendlyAuthError(signUp.error) } };
    }
    const signIn = await this.signIn(email, password);
    if (!signIn.error && signIn.user) return signIn;
    return {
      user: null,
      session: null,
      error: { message: "E-mail já registado ou credenciais incorretas." },
    };
  },

  async signOut() {
    clearRememberedProfile();
    if (!db) return;
    await db.auth.signOut();
  },
};

function ownsRow(row, user) {
  if (!row || !user) return false;
  if (row.client_id && row.client_id === user.id) {
    const rowEmail = normalizeEmail(row.email);
    const userEmail = normalizeEmail(user.email);
    if (!rowEmail || !userEmail) return true;
    return rowEmail === userEmail;
  }
  return normalizeEmail(row.email) === normalizeEmail(user.email);
}

const profiles = {
  async get(id) {
    if (!db) return { data: null, error: notConfigured() };
    if (!id) return { data: null, error: { message: "Perfil inválido." } };
    return db.from(TABLES.profiles).select("*").eq("id", id).maybeSingle();
  },

  async getByEmail(email, role) {
    if (!db) return { data: null, error: notConfigured() };
    const normalized = normalizeEmail(email);
    if (!normalized) return { data: null, error: { message: "E-mail inválido." } };
    let query = db.from(TABLES.profiles).select("*").ilike("email", normalized);
    if (role) query = query.eq("role", role);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(1);
    return { data: data?.[0] || null, error };
  },

  async listPending() {
    if (!db) return { data: [], error: notConfigured() };
    return db
      .from(TABLES.profiles)
      .select("*")
      .eq("role", "client")
      .in("approval_status", ["pending", "submitted", "pendente"])
      .order("created_at", { ascending: false });
  },

  async listPendingDrivers() {
    if (!db) return { data: [], error: notConfigured() };
    return db
      .from(TABLES.profiles)
      .select("*")
      .eq("role", "driver")
      .in("approval_status", ["pending", "submitted", "pendente"])
      .order("created_at", { ascending: false });
  },

  async listByRole(role) {
    if (!db) return { data: [], error: notConfigured() };
    return db.from(TABLES.profiles).select("*").eq("role", role).order("full_name");
  },

  async upsert(payload) {
    if (!db) return { data: null, error: notConfigured() };
    const session = await auth.session();
    const id = payload.id || session?.user?.id || crypto.randomUUID();
    const approval = payload.approval_status || payload.status_aprovacao || "pending";
    const statusPt =
      payload.status_aprovacao ||
      (approval === "approved" || approval === "aprovado"
        ? "aprovado"
        : approval === "rejected" || approval === "rejeitado"
          ? "rejeitado"
          : "pendente");
    const record = {
      kyc_status: "submitted",
      approval_status: approval === "aprovado" ? "approved" : approval === "rejeitado" ? "rejected" : approval,
      status_aprovacao: statusPt,
      face_verified: false,
      pin_set: true,
      ...payload,
      id,
    };
    const result = await db.from(TABLES.profiles).upsert(record).select().maybeSingle();
    if (!result.error && result.data) rememberProfile(result.data);
    if (!result.error && !result.data) {
      const saved = { ...record, id };
      rememberProfile(saved);
      return { data: saved, error: null };
    }
    if (result.error && isSchemaError(result.error)) {
      const attempts = [
        {
          id,
          full_name: record.full_name,
          email: record.email || null,
          phone: record.phone || null,
          company: record.company || null,
          cpf: record.cpf || null,
          address: record.address || null,
          role: record.role || "client",
          document_type: record.document_type || null,
          document_id: record.document_id || record.cpf || null,
          document_name: record.document_name || record.document_id || null,
          document_photo: record.document_photo || null,
          face_photo: record.face_photo || null,
          kyc_status: record.kyc_status || "submitted",
          approval_status: record.approval_status || "pending",
          status_aprovacao: record.status_aprovacao || "pendente",
          face_verified: Boolean(record.face_verified),
          vehicle_type: record.vehicle_type || null,
          vehicle_plate: record.vehicle_plate || null,
          base_state: record.base_state || null,
          base_city: record.base_city || null,
          pin_set: true,
        },
        {
          id,
          full_name: record.full_name,
          email: record.email || null,
          phone: record.phone || null,
          cpf: record.cpf || null,
          role: record.role || "client",
          approval_status: record.approval_status || "pending",
          face_verified: Boolean(record.face_verified),
        },
        {
          id,
          full_name: record.full_name,
          role: record.role || "client",
          phone: record.phone || null,
        },
      ];
      let last = result;
      for (const attempt of attempts) {
        const retry = await db.from(TABLES.profiles).upsert(attempt).select().maybeSingle();
        last = retry;
        if (!retry.error && retry.data) {
          rememberProfile(retry.data);
          return retry;
        }
      }
      return last;
    }
    return result;
  },

  async update(id, patch) {
    if (!db) return { data: null, error: notConfigured() };
    return db.from(TABLES.profiles).update(patch).eq("id", id).select().maybeSingle();
  },

  async remove(id) {
    if (!db) return { data: null, error: notConfigured() };
    await db.from(TABLES.driverStatus).delete().eq("driver_id", id);
    await db.from(TABLES.serviceRequests).delete().eq("client_id", id);
    await db
      .from(TABLES.serviceRequests)
      .update({
        driver_id: null,
        assigned_driver_name: null,
        assigned_driver_cpf: null,
        assigned_driver_vehicle: null,
        assigned_driver_plate: null,
        assigned_driver_praca: null,
      })
      .eq("driver_id", id);
    await db.from(TABLES.serviceRequests).update({ preferred_driver_id: null }).eq("preferred_driver_id", id);
    return db.from(TABLES.profiles).delete().eq("id", id);
  },

  async setApproval(id, approvalStatus) {
    if (!db) return { data: null, error: notConfigured() };
    const approved = approvalStatus === "approved" || approvalStatus === "aprovado";
    const rejected = approvalStatus === "rejected" || approvalStatus === "rejeitado";
    return db
      .from(TABLES.profiles)
      .update({
        approval_status: approved ? "approved" : rejected ? "rejected" : approvalStatus,
        status_aprovacao: approved ? "aprovado" : rejected ? "rejeitado" : "pendente",
        kyc_status: approved ? "approved" : approvalStatus,
      })
      .eq("id", id)
      .select()
      .maybeSingle();
  },
};

const driverStatus = {
  async getByDriver(driverId) {
    if (!db) return { data: null, error: notConfigured() };
    return db.from(TABLES.driverStatus).select("*").eq("driver_id", driverId).maybeSingle();
  },

  async listAll() {
    if (!db) return { data: [], error: notConfigured() };
    return db.from(TABLES.driverStatus).select("*").order("updated_at", { ascending: false });
  },

  async listAvailable() {
    if (!db) return { data: [], error: notConfigured() };
    return db.from(TABLES.driverStatus).select("*").in("status", ["online", "available"]).order("updated_at", { ascending: false });
  },

  async upsert(driverId, patch) {
    if (!db) return { data: null, error: notConfigured() };
    const record = {
      driver_id: driverId,
      updated_at: nowIso(),
      last_seen_at: nowIso(),
      ...patch,
    };
    const result = await db
      .from(TABLES.driverStatus)
      .upsert(record, { onConflict: "driver_id" })
      .select()
      .maybeSingle();

    if (result.error) {
      const insertAttempt = await db.from(TABLES.driverStatus).insert(record).select().maybeSingle();
      if (!insertAttempt.error) return insertAttempt;
      const updateAttempt = await db
        .from(TABLES.driverStatus)
        .update(record)
        .eq("driver_id", driverId)
        .select()
        .maybeSingle();
      if (!updateAttempt.error) return updateAttempt;

      const minimal = {
        driver_id: driverId,
        status: patch.status || "offline",
        current_lat: patch.current_lat,
        current_lng: patch.current_lng,
        updated_at: nowIso(),
      };
      const fallback = await db.from(TABLES.driverStatus).insert(minimal).select().maybeSingle();
      if (!fallback.error) return fallback;
      const fallbackUpdate = await db
        .from(TABLES.driverStatus)
        .update(minimal)
        .eq("driver_id", driverId)
        .select()
        .maybeSingle();
      return fallbackUpdate.error ? result : fallbackUpdate;
    }
    return result;
  },
};

const REQUEST_COLUMNS =
  "id,client_id,email,requester_name,phone,company,service_type,status,pickup_location,dropoff_location,origin_state,origin_city,dest_state,dest_city,client_own_vehicle,vehicle_type,attire,security_profile,scheduled_at,passengers,notes,distance_km,duration_hours,estimated_price,preferred_driver_name,preferred_driver_id,driver_id,assigned_driver_name,assigned_driver_cpf,assigned_driver_vehicle,assigned_driver_plate,assigned_driver_praca,rating,rating_feedback,contract_text,deposit_amount,pix_payload,pix_receipt,pix_receipt_name,signed_contract,signed_contract_name,created_at";

const serviceRequests = {
  async get(id) {
    if (!db) return { data: null, error: notConfigured() };
    return db.from(TABLES.serviceRequests).select(REQUEST_COLUMNS).eq("id", id).maybeSingle();
  },

  async create(payload) {
    if (!db) return { data: null, error: notConfigured() };
    const session = await auth.session();
    const user = session?.user;
    if (user?.id) {
      payload.client_id = user.id;
      payload.email = payload.email || user.email;
    }
    const record = {
      status: "pending",
      is_first_request: true,
      ...payload,
    };
    const full = await db.from(TABLES.serviceRequests).insert(record).select().maybeSingle();
    if (!full.error) return full;

    const minimal = {
      client_id: record.client_id,
      email: record.email || null,
      service_type: record.service_type,
      status: "pending",
      pickup_location: record.dropoff_location
        ? `${record.pickup_location} → ${record.dropoff_location}`
        : record.pickup_location,
      estimated_price: record.estimated_price,
    };
    const retry = await db.from(TABLES.serviceRequests).insert(minimal).select().maybeSingle();
    return retry.error ? full : retry;
  },

  async list(filters = {}) {
    if (!db) return { data: [], error: notConfigured() };
    let query = db.from(TABLES.serviceRequests).select(REQUEST_COLUMNS).order("created_at", { ascending: false });
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.clientId) query = query.eq("client_id", filters.clientId);
    if (filters.email) query = query.ilike("email", normalizeEmail(filters.email));
    if (filters.driverId) query = query.eq("driver_id", filters.driverId);
    return query;
  },

  async listMine() {
    if (!db) return { data: [], error: notConfigured() };
    const user = await auth.currentUser();
    if (!user?.id) return { data: [], error: { message: "Sessão inválida. Faça login novamente." } };
    const email = normalizeEmail(user.email);
    const { data, error } = await db
      .from(TABLES.serviceRequests)
      .select(REQUEST_COLUMNS)
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return { data: [], error };
    const isolated = (data || []).filter((row) => ownsRow(row, user) && (!email || !row.email || normalizeEmail(row.email) === email));
    return { data: isolated, error: null };
  },

  async update(id, patch) {
    if (!db) return { data: null, error: notConfigured() };
    const result = await db.from(TABLES.serviceRequests).update(patch).eq("id", id).select("id,status").maybeSingle();
    return result;
  },

  async remove(id) {
    if (!db) return { data: null, error: notConfigured() };
    return db.from(TABLES.serviceRequests).delete().eq("id", id);
  },

  async hasPrevious(clientId) {
    if (!db || !clientId) return false;
    const user = await auth.currentUser();
    if (user?.id && user.id !== clientId) return false;
    const { data } = await db.from(TABLES.serviceRequests).select("id").eq("client_id", clientId).limit(1);
    return Boolean(data?.length);
  },
};

const settings = {
  defaults: DEFAULT_SETTINGS,
  cache: currentSettings,

  async getAll() {
    if (!db) {
      currentSettings = { ...DEFAULT_SETTINGS };
      this.cache = currentSettings;
      return { data: currentSettings, error: notConfigured() };
    }
    const { data, error } = await db.from(TABLES.settings).select("key,value");
    const map = { ...DEFAULT_SETTINGS };
    const numericKeys = new Set(["hourly_unarmed", "hourly_armed"]);
    if (!error && data) {
      data.forEach((row) => {
        if (!row?.key) return;
        map[row.key] = numericKeys.has(row.key) ? Number(row.value) : row.value;
      });
    }
    currentSettings = map;
    this.cache = map;
    return { data: map, error: error && isSchemaError(error) ? error : null };
  },

  async setMany(pairs) {
    if (!db) return { data: null, error: notConfigured() };
    const rows = Object.entries(pairs).map(([key, value]) => ({
      key,
      value: String(value ?? ""),
      updated_at: nowIso(),
    }));
    const result = await db.from(TABLES.settings).upsert(rows, { onConflict: "key" }).select();
    if (!result.error) {
      const numericKeys = new Set(["hourly_unarmed", "hourly_armed"]);
      rows.forEach((row) => {
        currentSettings[row.key] = numericKeys.has(row.key) ? Number(row.value) : row.value;
      });
      this.cache = currentSettings;
    }
    return result;
  },
};

function friendlyAuthError(error) {
  const message = String(error?.message || "");
  if (/invalid login credentials|invalid_credentials|invalid email or password/i.test(message)) {
    return "E-mail já registado ou credenciais incorretas.";
  }
  if (/already registered|user already|already exists|already been registered|email address is already/i.test(message)) {
    return "E-mail já registado ou credenciais incorretas.";
  }
  return message || "Não foi possível autenticar. Verifique o e-mail e o PIN.";
}

function subscribeRealtime(table, callback) {
  if (!db) return { unsubscribe() {} };
  const channel = db
    .channel(`csi-${table}-${Date.now()}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, callback)
    .subscribe();
  return {
    unsubscribe() {
      db.removeChannel(channel);
    },
  };
}

window.CSI = {
  supabase: db,
  url: SUPABASE_URL,
  isConfigured: isConfigured(),
  tables: TABLES,
  services: SERVICES,
  vehicles: VEHICLES,
  regions: REGIONS,
  attire: ATTIRE,
  security: SECURITY,
  adminPin: ADMIN_PIN,
  adminCode: ADMIN_CODE,
  quoteBudget,
  estimateKm,
  estimateHours,
  buildPixPayload,
  isSchemaError,
  auth,
  profiles,
  driverStatus,
  serviceRequests,
  settings,
  subscribeRealtime,
  rememberProfile,
  rememberedProfileId,
  rememberedEmail,
  clearRememberedProfile,
  normalizeEmail,
  friendlyAuthError,
};
