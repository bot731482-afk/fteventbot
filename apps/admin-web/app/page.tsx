"use client";

import { BotConfigV1Schema, type BotConfigV1 } from "@eon/shared-domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BotConfigPanel } from "./components/bot-config/BotConfigPanel";
import { groupValidationIssues, normalizeDraftForSave, serializeBotConfigState } from "./components/bot-config/botConfigUtils";

type Plan = {
  code: string;
  title: string;
  kind: "VIEWS" | "UNLIMITED_LIFETIME";
  price: number;
  viewsAmount: number | null;
  enabled: boolean;
};

type ContentItem = { key: string; locale: string; text: string };
type Flag = { key: string; enabled: boolean; description: string | null };

type BotConfigHistoryEntry = { id: string; createdAt: string };
type TabKey = "plans" | "content" | "flags" | "bot_config" | "users";

type UserListItem = {
  id: string;
  telegramId: string;
  username: string | null;
  isBanned: boolean;
  freeViewsLeft: number;
  isUnlimitedLifetime: boolean;
  access: { tier: string; canViewEvents: boolean };
};

type UserDetail = {
  id: string;
  telegramId: string;
  username: string | null;
  isBanned: boolean;
  freeViewsLeft: number;
  isUnlimitedLifetime: boolean;
  lastEventQueryAt: string | null;
  access: { tier: string; canViewEvents: boolean; reasons?: string[] };
  recentDailyUsage: Array<{ dayUtc: string; count: number }>;
};

const LS_API = "eon.admin.apiBaseUrl";
const LS_OWNER = "eon.admin.ownerId";

export default function HomePage() {
  const proxyMode = (process.env.NEXT_PUBLIC_ADMIN_PROXY_MODE ?? "false").trim().toLowerCase() === "true";
  const [apiBaseUrl, setApiBaseUrl] = useState(proxyMode ? "/api/core" : process.env.NEXT_PUBLIC_CORE_API_URL ?? "http://localhost:3000/v1");
  const [ownerId, setOwnerId] = useState(proxyMode ? "server-managed" : "");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [tab, setTab] = useState<TabKey>("plans");
  const [botConfig, setBotConfig] = useState<BotConfigV1 | null>(null);
  const [botConfigHistory, setBotConfigHistory] = useState<BotConfigHistoryEntry[]>([]);
  /** Последний JSON с сервера (admin GET), для сброса черновика */
  const [serverBotConfigJson, setServerBotConfigJson] = useState<string | null>(null);
  const [publicBotConfig, setPublicBotConfig] = useState<BotConfigV1 | null>(null);
  const [publicBotConfigError, setPublicBotConfigError] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userItems, setUserItems] = useState<UserListItem[]>([]);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);

  const [listLoading, setListLoading] = useState(false);
  const [botConfigLoading, setBotConfigLoading] = useState(false);
  const [savingBotConfig, setSavingBotConfig] = useState(false);
  const [loadingPublicConfig, setLoadingPublicConfig] = useState(false);

  const [errorText, setErrorText] = useState<string | null>(null);
  const [botConfigError, setBotConfigError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const headers = useMemo(
    () => ({
      "content-type": "application/json",
      ...(proxyMode ? {} : { "x-owner-admin-id": ownerId })
    }),
    [ownerId, proxyMode]
  );

  useEffect(() => {
    try {
      if (proxyMode) return;
      const savedApi = localStorage.getItem(LS_API);
      const savedOwner = localStorage.getItem(LS_OWNER);
      if (savedApi) setApiBaseUrl(savedApi);
      if (savedOwner) setOwnerId(savedOwner);
    } catch {
      // ignore
    }
  }, [proxyMode]);

  useEffect(() => {
    try {
      if (proxyMode) return;
      localStorage.setItem(LS_API, apiBaseUrl);
    } catch {
      // ignore
    }
  }, [apiBaseUrl, proxyMode]);

  useEffect(() => {
    try {
      if (proxyMode) return;
      localStorage.setItem(LS_OWNER, ownerId);
    } catch {
      // ignore
    }
  }, [ownerId, proxyMode]);

  function pushToast(text: string): void {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  function clearStoredConnection(): void {
    try {
      localStorage.removeItem(LS_API);
      localStorage.removeItem(LS_OWNER);
    } catch {
      // ignore
    }
    setApiBaseUrl(process.env.NEXT_PUBLIC_CORE_API_URL ?? "http://localhost:3000/v1");
    setOwnerId("");
    pushToast("Сохранённые URL и OWNER очищены");
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) }
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const message = text?.trim() ? text : `${response.status} ${response.statusText}`;
      throw new Error(message);
    }
    return (await response.json()) as T;
  }

  const loadPublicBotConfig = useCallback(async (): Promise<void> => {
    setLoadingPublicConfig(true);
    setPublicBotConfigError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/bot/config`, {
        method: "GET",
        headers: { accept: "application/json" }
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text?.trim() ? text : `${response.status} ${response.statusText}`);
      }
      const data = (await response.json()) as BotConfigV1;
      setPublicBotConfig(data);
    } catch (e) {
      setPublicBotConfig(null);
      setPublicBotConfigError(String(e));
    } finally {
      setLoadingPublicConfig(false);
    }
  }, [apiBaseUrl]);

  const loadBotConfig = useCallback(
    async (opts?: { quiet?: boolean }): Promise<void> => {
      try {
        setBotConfigLoading(true);
        setBotConfigError(null);
        const res = await request<{ config: BotConfigV1; history: BotConfigHistoryEntry[] }>("/admin/bot-config");
        setBotConfig(res.config);
        setBotConfigHistory(res.history);
        setServerBotConfigJson(JSON.stringify(res.config));
        setLastLoadedAt(Date.now());
        if (!opts?.quiet) pushToast("Настройки бота загружены с сервера");
      } catch (error) {
        setBotConfigError(String(error));
      } finally {
        setBotConfigLoading(false);
      }
    },
    [apiBaseUrl, ownerId, proxyMode]
  );

  const validationLines = useMemo(() => {
    if (!botConfig) return [];
    const normalized = normalizeDraftForSave(botConfig);
    const parsed = BotConfigV1Schema.safeParse(normalized);
    if (parsed.success) return [];
    return groupValidationIssues(parsed.error.issues);
  }, [botConfig]);

  const isBotConfigDirty = useMemo(() => {
    if (!botConfig || !serverBotConfigJson) return false;
    try {
      const serverObj = JSON.parse(serverBotConfigJson) as BotConfigV1;
      return serializeBotConfigState(botConfig) !== serializeBotConfigState(serverObj);
    } catch {
      return true;
    }
  }, [botConfig, serverBotConfigJson]);

  useEffect(() => {
    if (!isBotConfigDirty) return;
    const fn = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [isBotConfigDirty]);

  async function saveBotConfig(): Promise<void> {
    if (!botConfig) return;
    const normalized = normalizeDraftForSave(botConfig);
    const parsed = BotConfigV1Schema.safeParse(normalized);
    if (!parsed.success) {
      setBotConfigError("Исправьте ошибки в форме (см. список выше).");
      return;
    }
    try {
      setSavingBotConfig(true);
      setBotConfigError(null);
      setErrorText(null);
      await request("/admin/bot-config", { method: "PATCH", body: JSON.stringify(parsed.data) });
      pushToast("Сохранено на сервере");
      await loadBotConfig({ quiet: true });
      await loadPublicBotConfig();
    } catch (error) {
      setBotConfigError(String(error));
    } finally {
      setSavingBotConfig(false);
    }
  }

  function discardBotConfigDraft(): void {
    if (!serverBotConfigJson) return;
    if (isBotConfigDirty) {
      const ok = window.confirm("Сбросить все несохранённые изменения и вернуть последнюю версию с сервера?");
      if (!ok) return;
    }
    try {
      setBotConfig(JSON.parse(serverBotConfigJson) as BotConfigV1);
      setBotConfigError(null);
      pushToast("Черновик совпадает с последней загрузкой с сервера");
    } catch {
      setBotConfigError("Не удалось восстановить конфиг из снимка");
    }
  }

  async function rollbackBotConfig(id: string): Promise<void> {
    const ok = window.confirm(
      `Откатить конфиг бота к снимку ${id}? Текущие несохранённые правки в форме будут потеряны; после отката проверьте публичный конфиг.`
    );
    if (!ok) return;
    try {
      setSavingBotConfig(true);
      setBotConfigError(null);
      await request("/admin/bot-config/rollback", { method: "POST", body: JSON.stringify({ id }) });
      pushToast("Откат выполнен");
      await loadBotConfig({ quiet: true });
      await loadPublicBotConfig();
    } catch (error) {
      setBotConfigError(String(error));
    } finally {
      setSavingBotConfig(false);
    }
  }

  async function loadAll(): Promise<void> {
    try {
      setListLoading(true);
      setErrorText(null);
      const [planRes, contentRes, flagRes] = await Promise.all([
        request<{ items: Plan[] }>("/admin/plans"),
        request<{ items: ContentItem[] }>("/admin/content"),
        request<{ items: Flag[] }>("/admin/flags")
      ]);
      setPlans(planRes.items);
      setContentItems(contentRes.items);
      setFlags(flagRes.items);
      setLastLoadedAt(Date.now());
      pushToast("Списки обновлены");
    } catch (error) {
      setErrorText(String(error));
    } finally {
      setListLoading(false);
    }
  }

  async function searchUsers(): Promise<void> {
    try {
      setListLoading(true);
      setErrorText(null);
      const q = userQuery.trim();
      const res = await request<{ items: UserListItem[] }>(`/admin/users?q=${encodeURIComponent(q)}&take=50`);
      setUserItems(res.items);
      setUserDetail(null);
      pushToast(`Пользователей: ${res.items.length}`);
    } catch (error) {
      setErrorText(String(error));
    } finally {
      setListLoading(false);
    }
  }

  async function loadUserDetail(id: string): Promise<void> {
    try {
      setListLoading(true);
      setErrorText(null);
      const d = await request<UserDetail>(`/admin/users/${encodeURIComponent(id)}`);
      setUserDetail(d);
    } catch (error) {
      setErrorText(String(error));
    } finally {
      setListLoading(false);
    }
  }

  async function postUserAction(
    subPath: string,
    method: "POST" | "PATCH" | "DELETE" = "POST",
    body?: unknown
  ): Promise<void> {
    if (!userDetail?.id) return;
    const uid = userDetail.id;
    try {
      setListLoading(true);
      setErrorText(null);
      await request(`/admin/users/${encodeURIComponent(uid)}${subPath}`, {
        method,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      pushToast("Готово");
      await loadUserDetail(uid);
      void searchUsers();
    } catch (error) {
      setErrorText(String(error));
    } finally {
      setListLoading(false);
    }
  }

  async function refreshFuntimeCache(): Promise<void> {
    try {
      setListLoading(true);
      setErrorText(null);
      await request("/admin/funtime/refresh", { method: "POST" });
      pushToast("FunTime: кэш обновлён");
    } catch (error) {
      setErrorText(String(error));
    } finally {
      setListLoading(false);
    }
  }

  function updateBotConfig(updater: (prev: BotConfigV1) => BotConfigV1): void {
    setBotConfig((prev) => {
      if (!prev) return prev;
      return updater(prev);
    });
  }

  async function savePlan(plan: Plan): Promise<void> {
    await request(`/admin/plans/${plan.code}`, { method: "PATCH", body: JSON.stringify(plan) });
    pushToast("Тариф сохранён");
    await loadAll();
  }

  async function deletePlan(code: string): Promise<void> {
    await request(`/admin/plans/${code}`, { method: "DELETE" });
    pushToast("Тариф удалён");
    await loadAll();
  }

  async function saveContent(item: ContentItem): Promise<void> {
    await request("/admin/content", { method: "PATCH", body: JSON.stringify(item) });
    pushToast("Контент сохранён");
    await loadAll();
  }

  async function saveFlag(flag: Flag): Promise<void> {
    await request("/admin/flags", { method: "PATCH", body: JSON.stringify(flag) });
    pushToast("Флаг сохранён");
    await loadAll();
  }

  const isConfigured = proxyMode ? apiBaseUrl.trim().length > 0 : apiBaseUrl.trim().length > 0 && ownerId.trim().length > 0;
  const anyBusy = listLoading || botConfigLoading || savingBotConfig;

  const statusPill = (() => {
    if (anyBusy) return { dot: "dotWarn", text: "Загрузка…" };
    if (!isConfigured) return { dot: "dotBad", text: proxyMode ? "Нужен server env" : "Нужен OWNER_ADMIN_ID" };
    if (errorText || botConfigError) return { dot: "dotBad", text: "Ошибка" };
    if (lastLoadedAt) return { dot: "dotOk", text: "Готово" };
    return { dot: "dotWarn", text: "Не загружено" };
  })();

  useEffect(() => {
    if (!isConfigured) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab !== "bot_config" || !isConfigured) return;
    if (isBotConfigDirty) return;
    void loadBotConfig({ quiet: true });
    void loadPublicBotConfig();
    // Intentionally omit loadBotConfig/loadPublicBotConfig/isBotConfigDirty from deps:
    // reload when switching to this tab (or API identity), not after every local edit or save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isConfigured, apiBaseUrl, ownerId]);

  const botChannelsCount = botConfig?.channels?.length ?? 0;
  const botTabCountLabel = botConfig !== null ? String(botChannelsCount) : "—";

  return (
    <main className="container">
      <div className="header">
        <div className="title">
          <h1>Панель управления ботом</h1>
          <p>
            Тарифы, пользователи, тексты в БД, флаги — отдельные разделы. <strong>Настройки бота</strong> (сообщения, каналы, меню, лимиты) — один
            файл конфигурации на сервере; бот читает их через публичный API.
          </p>
          <div className="hint">
            {proxyMode ? (
              <>
                Режим прокси: запросы идут через <code>/api/core/*</code>, OWNER задаётся на сервере (<code>OWNER_ADMIN_ID</code>).
              </>
            ) : (
              <>
                Без прокси: URL API и numeric OWNER хранятся в <strong>localStorage этого браузера</strong> — не делитесь сессией с посторонними.
              </>
            )}
          </div>
          {!proxyMode ? (
            <div className="warnBanner inlineWarn">
              <span>Локальное хранилище браузера используется для URL и OWNER.</span>
              <button type="button" className="btn btnSmall" onClick={clearStoredConnection}>
                Очистить сохранённые
              </button>
            </div>
          ) : null}
        </div>
        <div className="pill" title="Текущий статус">
          <span className={`dot ${statusPill.dot}`} />
          <span>{statusPill.text}</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="cardBody stack">
          <div className="grid2">
            <div>
              <div className="label">API base URL</div>
              <input
                className="field"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="http://localhost:3000/v1"
                disabled={proxyMode}
              />
            </div>
            <div>
              <div className="label">OWNER_ADMIN_ID</div>
              <input
                className="field"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                placeholder="например 815991920"
                disabled={proxyMode}
              />
            </div>
          </div>

          <div className="rowBetween">
            <div className="row">
              <button className="btn btnPrimary" disabled={!isConfigured || listLoading} onClick={() => void loadAll()}>
                {listLoading ? "Загружаю…" : "Обновить списки"}
              </button>
              {lastLoadedAt ? <span className="hint">обновлено: {new Date(lastLoadedAt).toLocaleTimeString()}</span> : null}
            </div>
            <div className="tabs" aria-label="tabs">
              <button className={`tab ${tab === "plans" ? "tabActive" : ""}`} onClick={() => setTab("plans")}>
                Тарифы <span className="muted">({plans.length})</span>
              </button>
              <button
                className={`tab ${tab === "users" ? "tabActive" : ""}`}
                onClick={() => {
                  setTab("users");
                }}
              >
                Пользователи
              </button>
              <button className={`tab ${tab === "content" ? "tabActive" : ""}`} onClick={() => setTab("content")}>
                Контент БД <span className="muted">({contentItems.length})</span>
              </button>
              <button className={`tab ${tab === "flags" ? "tabActive" : ""}`} onClick={() => setTab("flags")}>
                Флаги <span className="muted">({flags.length})</span>
              </button>
              <button
                className={`tab ${tab === "bot_config" ? "tabActive" : ""}`}
                onClick={() => {
                  setTab("bot_config");
                }}
              >
                Настройки бота <span className="muted">({botTabCountLabel})</span>
              </button>
            </div>
          </div>

          {!isConfigured ? (
            <div className="errorBox">
              {proxyMode
                ? "На сервере должны быть заданы OWNER_ADMIN_ID и CORE_API_INTERNAL_URL."
                : "Введите OWNER_ADMIN_ID из .env и нажмите «Обновить списки»."}
            </div>
          ) : null}
          {errorText ? <div className="errorBox">{errorText}</div> : null}
          {toast ? (
            <div className="pill" style={{ alignSelf: "flex-start" }}>
              <span className="dot dotOk" />
              <span>{toast}</span>
            </div>
          ) : null}
        </div>
      </div>

      {tab === "plans" ? (
        <div className="card">
          <div className="cardBody stack">
            <div className="rowBetween">
              <div className="stack" style={{ gap: 4 }}>
                <div className="sectionTitle">Тарифы</div>
                <div className="hint">Пакеты и цены в PostgreSQL.</div>
              </div>
            </div>

            {plans.length === 0 ? (
              <div className="hint">Пусто. Нажми «Обновить списки».</div>
            ) : (
              <table className="table">
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.code} className="tr">
                      <td style={{ width: 220 }}>
                        <div className="label">code</div>
                        <code>{plan.code}</code>
                        <div className="hint">{plan.kind}</div>
                      </td>
                      <td>
                        <div className="label">title</div>
                        <input
                          className="field"
                          value={plan.title}
                          onChange={(e) => setPlans((prev) => prev.map((p) => (p.code === plan.code ? { ...p, title: e.target.value } : p)))}
                        />
                      </td>
                      <td style={{ width: 160 }}>
                        <div className="label">price</div>
                        <input
                          className="field"
                          value={plan.price}
                          type="number"
                          onChange={(e) =>
                            setPlans((prev) => prev.map((p) => (p.code === plan.code ? { ...p, price: Number(e.target.value) } : p)))
                          }
                        />
                        <div className="hint">views: {plan.viewsAmount ?? "∞"}</div>
                      </td>
                      <td style={{ width: 170 }}>
                        <div className="label">enabled</div>
                        <label className="row" style={{ gap: 10 }}>
                          <input
                            type="checkbox"
                            checked={plan.enabled}
                            onChange={(e) =>
                              setPlans((prev) => prev.map((p) => (p.code === plan.code ? { ...p, enabled: e.target.checked } : p)))
                            }
                          />
                          <span className="hint">{plan.enabled ? "включён" : "выключен"}</span>
                        </label>
                      </td>
                      <td style={{ width: 200 }}>
                        <div className="row" style={{ justifyContent: "flex-end" }}>
                          <button className="btn btnPrimary btnSmall" disabled={!isConfigured || listLoading} onClick={() => void savePlan(plan)}>
                            Сохранить
                          </button>
                          <button className="btn btnDanger btnSmall" disabled={!isConfigured || listLoading} onClick={() => void deletePlan(plan.code)}>
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      {tab === "users" ? (
        <div className="card">
          <div className="cardBody stack">
            <div className="stack" style={{ gap: 4 }}>
              <div className="sectionTitle">Пользователи</div>
              <div className="hint">Поиск по username или numeric Telegram id. Данные в PostgreSQL.</div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                className="field"
                style={{ minWidth: 220, flex: 1 }}
                placeholder="Поиск…"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
              />
              <button className="btn btnPrimary" disabled={!isConfigured || listLoading} onClick={() => void searchUsers()}>
                Найти
              </button>
              <button className="btn" disabled={!isConfigured || listLoading} onClick={() => void refreshFuntimeCache()}>
                Обновить кэш ивентов
              </button>
            </div>
            {userItems.length === 0 ? (
              <div className="hint">Нет результатов. Выполни поиск.</div>
            ) : (
              <table className="table">
                <tbody>
                  {userItems.map((u) => (
                    <tr key={u.id} className="tr">
                      <td>
                        <code>{u.telegramId}</code>
                        <div className="hint">{u.username ?? "—"}</div>
                      </td>
                      <td>
                        <span className="hint">tier: {u.access.tier}</span>
                        {u.isBanned ? <div className="errorBox" style={{ marginTop: 6 }}>banned</div> : null}
                      </td>
                      <td style={{ width: 140 }}>
                        <button className="btn btnPrimary btnSmall" disabled={!isConfigured || listLoading} onClick={() => void loadUserDetail(u.id)}>
                          Открыть
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {userDetail ? (
              <div className="card" style={{ boxShadow: "none" }}>
                <div className="cardBody stack">
                  <div className="label">Детали</div>
                  <div className="hint mono" style={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(
                      {
                        id: userDetail.id,
                        telegramId: userDetail.telegramId,
                        username: userDetail.username,
                        tier: userDetail.access.tier,
                        canViewEvents: userDetail.access.canViewEvents,
                        reasons: userDetail.access.reasons,
                        freeViewsLeft: userDetail.freeViewsLeft,
                        isUnlimitedLifetime: userDetail.isUnlimitedLifetime,
                        lastEventQueryAt: userDetail.lastEventQueryAt,
                        recentDailyUsage: userDetail.recentDailyUsage
                      },
                      null,
                      2
                    )}
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btnPrimary btnSmall" disabled={!isConfigured || listLoading} onClick={() => void postUserAction("/unlimited", "PATCH")}>
                      Grant unlimited
                    </button>
                    <button className="btn btnSmall" disabled={!isConfigured || listLoading} onClick={() => void postUserAction("/unlimited", "DELETE")}>
                      Revoke unlimited
                    </button>
                    <button className="btn btnDanger btnSmall" disabled={!isConfigured || listLoading} onClick={() => void postUserAction("/ban", "PATCH", { banned: true })}>
                      Ban
                    </button>
                    <button className="btn btnSmall" disabled={!isConfigured || listLoading} onClick={() => void postUserAction("/ban", "PATCH", { banned: false })}>
                      Unban
                    </button>
                    <button className="btn btnSmall" disabled={!isConfigured || listLoading} onClick={() => void postUserAction("/reset-cooldown", "POST")}>
                      Reset cooldown
                    </button>
                    <button className="btn btnSmall" disabled={!isConfigured || listLoading} onClick={() => void postUserAction("/reset-daily", "POST")}>
                      Reset daily usage
                    </button>
                    <button className="btn btnSmall" disabled={!isConfigured || listLoading} onClick={() => void postUserAction("/test-notification", "POST")}>
                      Test notification
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "content" ? (
        <div className="card">
          <div className="cardBody stack">
            <div className="stack" style={{ gap: 4 }}>
              <div className="sectionTitle">Контент (БД)</div>
              <div className="hint">Отдельные ключи в базе — не путать с «Настройки бота».</div>
            </div>

            {contentItems.length === 0 ? (
              <div className="hint">Пусто. Нажми «Обновить списки».</div>
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                {contentItems.map((item) => (
                  <div key={`${item.key}:${item.locale}`} className="card" style={{ boxShadow: "none" }}>
                    <div className="cardBody stack">
                      <div className="rowBetween">
                        <div className="stack" style={{ gap: 2 }}>
                          <div style={{ fontWeight: 600 }}>
                            <code>{item.key}</code> <span className="hint">({item.locale})</span>
                          </div>
                        </div>
                        <button className="btn btnPrimary btnSmall" disabled={!isConfigured || listLoading} onClick={() => void saveContent(item)}>
                          Сохранить
                        </button>
                      </div>
                      <textarea
                        className="field textarea"
                        value={item.text}
                        onChange={(e) =>
                          setContentItems((prev) =>
                            prev.map((x) => (x.key === item.key && x.locale === item.locale ? { ...x, text: e.target.value } : x))
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "flags" ? (
        <div className="card">
          <div className="cardBody stack">
            <div className="stack" style={{ gap: 4 }}>
              <div className="sectionTitle">Feature flags</div>
              <div className="hint">Флаги в PostgreSQL.</div>
            </div>

            {flags.length === 0 ? (
              <div className="hint">Пусто. Нажми «Обновить списки».</div>
            ) : (
              <table className="table">
                <tbody>
                  {flags.map((flag) => (
                    <tr key={flag.key} className="tr">
                      <td style={{ width: 320 }}>
                        <div className="label">key</div>
                        <code>{flag.key}</code>
                      </td>
                      <td>
                        <div className="label">description</div>
                        <input
                          className="field"
                          value={flag.description ?? ""}
                          onChange={(e) => setFlags((prev) => prev.map((x) => (x.key === flag.key ? { ...x, description: e.target.value } : x)))}
                          placeholder="что делает флаг"
                        />
                      </td>
                      <td style={{ width: 170 }}>
                        <div className="label">enabled</div>
                        <label className="row" style={{ gap: 10 }}>
                          <input
                            type="checkbox"
                            checked={flag.enabled}
                            onChange={(e) => setFlags((prev) => prev.map((x) => (x.key === flag.key ? { ...x, enabled: e.target.checked } : x)))}
                          />
                          <span className="hint">{flag.enabled ? "on" : "off"}</span>
                        </label>
                      </td>
                      <td style={{ width: 150 }}>
                        <div className="row" style={{ justifyContent: "flex-end" }}>
                          <button className="btn btnPrimary btnSmall" disabled={!isConfigured || listLoading} onClick={() => void saveFlag(flag)}>
                            Сохранить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      {tab === "bot_config" ? (
        <div className="card">
          <div className="cardBody stack">
            {botConfigLoading && !botConfig ? (
              <div className="hint">Загружаю конфиг с сервера…</div>
            ) : null}
            {botConfig ? (
              <BotConfigPanel
                botConfig={botConfig}
                botConfigHistory={botConfigHistory}
                publicConfig={publicBotConfig}
                publicConfigError={publicBotConfigError}
                isDirty={isBotConfigDirty}
                isLoadingAdmin={botConfigLoading}
                isSaving={savingBotConfig}
                isLoadingPublic={loadingPublicConfig}
                validationLines={validationLines}
                botConfigError={botConfigError}
                onUpdate={updateBotConfig}
                onReload={() => void loadBotConfig()}
                onSave={() => void saveBotConfig()}
                onDiscard={discardBotConfigDraft}
                onRefreshPublic={() => void loadPublicBotConfig()}
                onRollback={(id) => void rollbackBotConfig(id)}
                disabled={!isConfigured}
              />
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                <div className="hint">Загрузка не выполнена. Нажми «Настройки бота» снова или открой вкладку — конфиг подтянется с сервера.</div>
                <button className="btn btnPrimary" type="button" disabled={!isConfigured || botConfigLoading} onClick={() => void loadBotConfig()}>
                  {botConfigLoading ? "Загрузка…" : "Загрузить настройки бота"}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
