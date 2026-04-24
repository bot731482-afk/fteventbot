"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BotConfigV1Schema, type BotConfigV1 } from "@eon/shared-domain";

type Plan = {
  code: string;
  title: string;
  kind: "VIEWS" | "UNLIMITED_LIFETIME";
  price: number;
  viewsAmount: number | null;
  enabled: boolean;
};

type Channel = {
  id: string;
  tgChannelId: string;
  username: string | null;
  inviteLink: string | null;
  isActive: boolean;
};

type ContentItem = { key: string; locale: string; text: string };
type Flag = { key: string; enabled: boolean; description: string | null };

type BotConfigHistoryEntry = { id: string; createdAt: string };
type TabKey = "plans" | "channels" | "content" | "flags" | "bot_config";

export default function HomePage() {
  const proxyMode = (process.env.NEXT_PUBLIC_ADMIN_PROXY_MODE ?? "false").trim().toLowerCase() === "true";
  const [apiBaseUrl, setApiBaseUrl] = useState(proxyMode ? "/api/core" : process.env.NEXT_PUBLIC_CORE_API_URL ?? "http://localhost:3000/v1");
  const [ownerId, setOwnerId] = useState(proxyMode ? "server" : "");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [tab, setTab] = useState<TabKey>("plans");
  const [botConfig, setBotConfig] = useState<BotConfigV1 | null>(null);
  const [botConfigHistory, setBotConfigHistory] = useState<BotConfigHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
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
      const savedApi = localStorage.getItem("eon.admin.apiBaseUrl");
      const savedOwner = localStorage.getItem("eon.admin.ownerId");
      if (savedApi) setApiBaseUrl(savedApi);
      if (savedOwner) setOwnerId(savedOwner);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      if (proxyMode) return;
      localStorage.setItem("eon.admin.apiBaseUrl", apiBaseUrl);
    } catch {
      // ignore
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    try {
      if (proxyMode) return;
      localStorage.setItem("eon.admin.ownerId", ownerId);
    } catch {
      // ignore
    }
  }, [ownerId]);

  function pushToast(text: string): void {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
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

  async function loadAll(): Promise<void> {
    try {
      setLoading(true);
      setErrorText(null);
      const [planRes, channelRes, contentRes, flagRes] = await Promise.all([
        request<{ items: Plan[] }>("/admin/plans"),
        request<{ items: Channel[] }>("/admin/channels"),
        request<{ items: ContentItem[] }>("/admin/content"),
        request<{ items: Flag[] }>("/admin/flags")
      ]);
      setPlans(planRes.items);
      setChannels(channelRes.items);
      setContentItems(contentRes.items);
      setFlags(flagRes.items);
      setLastLoadedAt(Date.now());
      pushToast("Обновлено");
    } catch (error) {
      setErrorText(String(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadBotConfig(): Promise<void> {
    try {
      setLoading(true);
      setErrorText(null);
      const res = await request<{ config: BotConfigV1; history: BotConfigHistoryEntry[] }>("/admin/bot-config");
      setBotConfig(res.config);
      setBotConfigHistory(res.history);
      setLastLoadedAt(Date.now());
      pushToast("Bot config загружен");
    } catch (error) {
      setErrorText(String(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveBotConfig(): Promise<void> {
    try {
      setLoading(true);
      setErrorText(null);
      const parsed = BotConfigV1Schema.safeParse(botConfig);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
        throw new Error(msg);
      }
      await request("/admin/bot-config", { method: "PATCH", body: JSON.stringify(parsed.data) });
      pushToast("Bot config сохранён");
      await loadBotConfig();
    } catch (error) {
      setErrorText(String(error));
    } finally {
      setLoading(false);
    }
  }

  async function rollbackBotConfig(id: string): Promise<void> {
    try {
      setLoading(true);
      setErrorText(null);
      await request("/admin/bot-config/rollback", { method: "POST", body: JSON.stringify({ id }) });
      pushToast("Rollback выполнен");
      await loadBotConfig();
    } catch (error) {
      setErrorText(String(error));
    } finally {
      setLoading(false);
    }
  }

  function updateBotConfig(updater: (prev: BotConfigV1) => BotConfigV1): void {
    setBotConfig((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      return next;
    });
  }

  function addMainMenuButton(): void {
    updateBotConfig((prev) => ({ ...prev, menuButtons: { ...prev.menuButtons, main: [...prev.menuButtons.main, "Новая кнопка"] } }));
  }

  function addAfterSubscriptionButton(): void {
    updateBotConfig((prev) => ({
      ...prev,
      menuButtons: { ...prev.menuButtons, afterSubscription: [...prev.menuButtons.afterSubscription, "Новая кнопка"] }
    }));
  }

  function addChannel(): void {
    updateBotConfig((prev) => ({
      ...prev,
      channels: [
        ...prev.channels,
        {
          title: "Новый канал",
          username: "@new_channel",
          inviteLink: "https://t.me/new_channel",
          isRequired: true,
          isActive: true
        }
      ]
    }));
  }

  async function savePlan(plan: Plan): Promise<void> {
    await request(`/admin/plans/${plan.code}`, { method: "PATCH", body: JSON.stringify(plan) });
    pushToast("Plan сохранён");
    await loadAll();
  }

  async function deletePlan(code: string): Promise<void> {
    await request(`/admin/plans/${code}`, { method: "DELETE" });
    pushToast("Plan удалён");
    await loadAll();
  }

  async function saveChannel(channel: Channel): Promise<void> {
    await request(`/admin/channels/${channel.id}`, { method: "PATCH", body: JSON.stringify(channel) });
    pushToast("Канал сохранён");
    await loadAll();
  }

  async function deleteChannel(id: string): Promise<void> {
    await request(`/admin/channels/${id}`, { method: "DELETE" });
    pushToast("Канал удалён");
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
  const statusPill = (() => {
    if (loading) return { dot: "dotWarn", text: "Загрузка..." };
    if (!isConfigured) return { dot: "dotBad", text: "Нужен OWNER_ADMIN_ID" };
    if (errorText) return { dot: "dotBad", text: "Ошибка" };
    if (lastLoadedAt) return { dot: "dotOk", text: "Готово" };
    return { dot: "dotWarn", text: "Не загружено" };
  })();

  useEffect(() => {
    if (!isConfigured) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="container">
      <div className="header">
        <div className="title">
          <h1>EonFuntimeHelper Admin</h1>
          <p>
            Тут настраивается поведение бота: тарифы (plans), обязательные каналы, тексты/кнопки, feature flags.
            Доступ к админ-ручкам защищён заголовком <code>x-owner-admin-id</code>.
          </p>
          <div className="hint">
            Если видишь <code>TypeError: Failed to fetch</code> — обычно это неправильный API URL, не запущен <code>core-api</code>,
            или CORS/сеть. Если <code>403/401</code> — не тот OWNER_ADMIN_ID.
          </div>
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
              <input className="field" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="http://localhost:3000/v1" disabled={proxyMode} />
            </div>
            <div>
              <div className="label">OWNER_ADMIN_ID</div>
              <input className="field" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="например 815991920" disabled={proxyMode} />
            </div>
          </div>

          <div className="rowBetween">
            <div className="row">
              <button className="btn btnPrimary" disabled={!isConfigured || loading} onClick={() => void loadAll()}>
                {loading ? "Загружаю..." : "Обновить данные"}
              </button>
              {lastLoadedAt ? <span className="hint">последняя загрузка: {new Date(lastLoadedAt).toLocaleTimeString()}</span> : null}
            </div>
            <div className="tabs" aria-label="tabs">
              <button className={`tab ${tab === "plans" ? "tabActive" : ""}`} onClick={() => setTab("plans")}>
                Plans <span className="muted">({plans.length})</span>
              </button>
              <button className={`tab ${tab === "channels" ? "tabActive" : ""}`} onClick={() => setTab("channels")}>
                Channels <span className="muted">({channels.length})</span>
              </button>
              <button className={`tab ${tab === "content" ? "tabActive" : ""}`} onClick={() => setTab("content")}>
                Content <span className="muted">({contentItems.length})</span>
              </button>
              <button className={`tab ${tab === "flags" ? "tabActive" : ""}`} onClick={() => setTab("flags")}>
                Feature flags <span className="muted">({flags.length})</span>
              </button>
              <button
                className={`tab ${tab === "bot_config" ? "tabActive" : ""}`}
                onClick={() => {
                  setTab("bot_config");
                  if (isConfigured) void loadBotConfig();
                }}
              >
                Bot config
              </button>
            </div>
          </div>

          {!isConfigured ? (
            <div className="errorBox">Введи OWNER_ADMIN_ID (из .env `OWNER_ADMIN_ID`) и нажми “Обновить данные”.</div>
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
                <div style={{ fontSize: 16, fontWeight: 600 }}>Plans</div>
                <div className="hint">Тарифы/пакеты. Бот и биллинг будут опираться на эти записи.</div>
              </div>
            </div>

            {plans.length === 0 ? (
              <div className="hint">Пусто. Нажми “Обновить данные”.</div>
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
                          <button className="btn btnPrimary btnSmall" disabled={!isConfigured || loading} onClick={() => void savePlan(plan)}>
                            Сохранить
                          </button>
                          <button className="btn btnDanger btnSmall" disabled={!isConfigured || loading} onClick={() => void deletePlan(plan.code)}>
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

      {tab === "channels" ? (
        <div className="card">
          <div className="cardBody stack">
            <div className="stack" style={{ gap: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Channels</div>
              <div className="hint">
                Обязательные каналы. Если включён флаг <code>enforce.required.channels</code>, бот будет требовать подписку.
              </div>
            </div>

            {channels.length === 0 ? (
              <div className="hint">Пусто. Нажми “Обновить данные”.</div>
            ) : (
              <table className="table">
                <tbody>
                  {channels.map((channel) => (
                    <tr key={channel.id} className="tr">
                      <td style={{ width: 260 }}>
                        <div className="label">tgChannelId</div>
                        <input
                          className="field"
                          value={channel.tgChannelId}
                          onChange={(e) =>
                            setChannels((prev) => prev.map((item) => (item.id === channel.id ? { ...item, tgChannelId: e.target.value } : item)))
                          }
                        />
                        <div className="hint">id: <code>{channel.id}</code></div>
                      </td>
                      <td>
                        <div className="label">inviteLink</div>
                        <input
                          className="field"
                          value={channel.inviteLink ?? ""}
                          onChange={(e) =>
                            setChannels((prev) => prev.map((item) => (item.id === channel.id ? { ...item, inviteLink: e.target.value } : item)))
                          }
                          placeholder="https://t.me/... или invite link"
                        />
                      </td>
                      <td style={{ width: 170 }}>
                        <div className="label">active</div>
                        <label className="row" style={{ gap: 10 }}>
                          <input
                            type="checkbox"
                            checked={channel.isActive}
                            onChange={(e) =>
                              setChannels((prev) => prev.map((item) => (item.id === channel.id ? { ...item, isActive: e.target.checked } : item)))
                            }
                          />
                          <span className="hint">{channel.isActive ? "включён" : "выключен"}</span>
                        </label>
                      </td>
                      <td style={{ width: 200 }}>
                        <div className="row" style={{ justifyContent: "flex-end" }}>
                          <button className="btn btnPrimary btnSmall" disabled={!isConfigured || loading} onClick={() => void saveChannel(channel)}>
                            Сохранить
                          </button>
                          <button className="btn btnDanger btnSmall" disabled={!isConfigured || loading} onClick={() => void deleteChannel(channel.id)}>
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

      {tab === "content" ? (
        <div className="card">
          <div className="cardBody stack">
            <div className="stack" style={{ gap: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Content</div>
              <div className="hint">
                Тексты/настройки для бота. Например <code>menu.buttons</code> (кнопки меню) и разные подсказки.
              </div>
            </div>

            {contentItems.length === 0 ? (
              <div className="hint">Пусто. Нажми “Обновить данные”.</div>
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
                          <div className="hint">Редактируй текст и нажми “Сохранить”.</div>
                        </div>
                        <button className="btn btnPrimary btnSmall" disabled={!isConfigured || loading} onClick={() => void saveContent(item)}>
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
              <div style={{ fontSize: 16, fontWeight: 600 }}>Feature Flags</div>
              <div className="hint">Фичефлаги, чтобы включать/выключать поведение без деплоя.</div>
            </div>

            {flags.length === 0 ? (
              <div className="hint">Пусто. Нажми “Обновить данные”.</div>
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
                          <button className="btn btnPrimary btnSmall" disabled={!isConfigured || loading} onClick={() => void saveFlag(flag)}>
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
            <div className="rowBetween">
              <div className="stack" style={{ gap: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>BotConfigV1</div>
                <div className="hint">
                  Единая схема для <code>bot-service</code>, <code>core-api</code>, <code>admin-web</code>. Изменения применяются ботом
                  автоматически (sync).
                </div>
              </div>
              <div className="row">
                <button className="btn btnPrimary btnSmall" disabled={!isConfigured || loading} onClick={() => void loadBotConfig()}>
                  Обновить
                </button>
                <button className="btn btnPrimary btnSmall" disabled={!isConfigured || loading} onClick={() => void saveBotConfig()}>
                  Сохранить
                </button>
              </div>
            </div>
            {botConfig ? (
              <div className="stack" style={{ gap: 16 }}>
                <div className="card" style={{ boxShadow: "none" }}>
                  <div className="cardBody stack">
                    <div style={{ fontSize: 15, fontWeight: 600 }}>Content</div>
                    <div className="label">startMessage</div>
                    <textarea
                      className="field textarea"
                      value={botConfig.content.startMessage}
                      onChange={(e) => updateBotConfig((prev) => ({ ...prev, content: { ...prev.content, startMessage: e.target.value } }))}
                    />
                    <div className="label">subscriptionRequiredMessage</div>
                    <textarea
                      className="field textarea"
                      value={botConfig.content.subscriptionRequiredMessage}
                      onChange={(e) =>
                        updateBotConfig((prev) => ({ ...prev, content: { ...prev.content, subscriptionRequiredMessage: e.target.value } }))
                      }
                    />
                    <div className="label">eventsUnavailableMessage</div>
                    <textarea
                      className="field textarea"
                      value={botConfig.content.eventsUnavailableMessage}
                      onChange={(e) =>
                        updateBotConfig((prev) => ({ ...prev, content: { ...prev.content, eventsUnavailableMessage: e.target.value } }))
                      }
                    />
                    <div className="label">supportMessage</div>
                    <textarea
                      className="field textarea"
                      value={botConfig.content.supportMessage}
                      onChange={(e) => updateBotConfig((prev) => ({ ...prev, content: { ...prev.content, supportMessage: e.target.value } }))}
                    />
                  </div>
                </div>

                <div className="card" style={{ boxShadow: "none" }}>
                  <div className="cardBody stack">
                    <div className="rowBetween">
                      <div style={{ fontSize: 15, fontWeight: 600 }}>Menu Buttons</div>
                      <div className="row">
                        <button className="btn btnPrimary btnSmall" type="button" onClick={addMainMenuButton}>
                          + Main
                        </button>
                        <button className="btn btnPrimary btnSmall" type="button" onClick={addAfterSubscriptionButton}>
                          + AfterSub
                        </button>
                      </div>
                    </div>
                    <div className="label">main</div>
                    {botConfig.menuButtons.main.map((btn, idx) => (
                      <div key={`main-${idx}`} className="row">
                        <input
                          className="field"
                          value={btn}
                          onChange={(e) =>
                            updateBotConfig((prev) => {
                              const next = [...prev.menuButtons.main];
                              next[idx] = e.target.value;
                              return { ...prev, menuButtons: { ...prev.menuButtons, main: next } };
                            })
                          }
                        />
                        <button
                          className="btn btnDanger btnSmall"
                          type="button"
                          onClick={() =>
                            updateBotConfig((prev) => ({
                              ...prev,
                              menuButtons: { ...prev.menuButtons, main: prev.menuButtons.main.filter((_, i) => i !== idx) }
                            }))
                          }
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                    <div className="label">afterSubscription</div>
                    {botConfig.menuButtons.afterSubscription.map((btn, idx) => (
                      <div key={`after-${idx}`} className="row">
                        <input
                          className="field"
                          value={btn}
                          onChange={(e) =>
                            updateBotConfig((prev) => {
                              const next = [...prev.menuButtons.afterSubscription];
                              next[idx] = e.target.value;
                              return { ...prev, menuButtons: { ...prev.menuButtons, afterSubscription: next } };
                            })
                          }
                        />
                        <button
                          className="btn btnDanger btnSmall"
                          type="button"
                          onClick={() =>
                            updateBotConfig((prev) => ({
                              ...prev,
                              menuButtons: {
                                ...prev.menuButtons,
                                afterSubscription: prev.menuButtons.afterSubscription.filter((_, i) => i !== idx)
                              }
                            }))
                          }
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card" style={{ boxShadow: "none" }}>
                  <div className="cardBody stack">
                    <div className="rowBetween">
                      <div style={{ fontSize: 15, fontWeight: 600 }}>Channels</div>
                      <button className="btn btnPrimary btnSmall" type="button" onClick={addChannel}>
                        + Channel
                      </button>
                    </div>
                    {botConfig.channels.map((channel, idx) => (
                      <div key={`ch-${idx}`} className="card" style={{ boxShadow: "none" }}>
                        <div className="cardBody stack">
                          <input
                            className="field"
                            value={channel.title}
                            onChange={(e) =>
                              updateBotConfig((prev) => {
                                const next = [...prev.channels];
                                next[idx] = { ...next[idx], title: e.target.value };
                                return { ...prev, channels: next };
                              })
                            }
                            placeholder="title"
                          />
                          <input
                            className="field"
                            value={channel.username}
                            onChange={(e) =>
                              updateBotConfig((prev) => {
                                const next = [...prev.channels];
                                next[idx] = { ...next[idx], username: e.target.value };
                                return { ...prev, channels: next };
                              })
                            }
                            placeholder="@username"
                          />
                          <input
                            className="field"
                            value={channel.inviteLink}
                            onChange={(e) =>
                              updateBotConfig((prev) => {
                                const next = [...prev.channels];
                                next[idx] = { ...next[idx], inviteLink: e.target.value };
                                return { ...prev, channels: next };
                              })
                            }
                            placeholder="https://t.me/..."
                          />
                          <div className="row">
                            <label className="row" style={{ gap: 8 }}>
                              <input
                                type="checkbox"
                                checked={channel.isRequired}
                                onChange={(e) =>
                                  updateBotConfig((prev) => {
                                    const next = [...prev.channels];
                                    next[idx] = { ...next[idx], isRequired: e.target.checked };
                                    return { ...prev, channels: next };
                                  })
                                }
                              />
                              isRequired
                            </label>
                            <label className="row" style={{ gap: 8 }}>
                              <input
                                type="checkbox"
                                checked={channel.isActive}
                                onChange={(e) =>
                                  updateBotConfig((prev) => {
                                    const next = [...prev.channels];
                                    next[idx] = { ...next[idx], isActive: e.target.checked };
                                    return { ...prev, channels: next };
                                  })
                                }
                              />
                              isActive
                            </label>
                          </div>
                          <button
                            className="btn btnDanger btnSmall"
                            type="button"
                            onClick={() =>
                              updateBotConfig((prev) => ({ ...prev, channels: prev.channels.filter((_, i) => i !== idx) }))
                            }
                          >
                            Удалить канал
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card" style={{ boxShadow: "none" }}>
                  <div className="cardBody stack">
                    <div style={{ fontSize: 15, fontWeight: 600 }}>Flags & Limits</div>
                    <label className="row" style={{ gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={botConfig.flags.subscriptionsCheckEnabled}
                        onChange={(e) =>
                          updateBotConfig((prev) => ({
                            ...prev,
                            flags: { ...prev.flags, subscriptionsCheckEnabled: e.target.checked }
                          }))
                        }
                      />
                      subscriptionsCheckEnabled
                    </label>
                    <label className="row" style={{ gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={botConfig.flags.eventsEnabled}
                        onChange={(e) => updateBotConfig((prev) => ({ ...prev, flags: { ...prev.flags, eventsEnabled: e.target.checked } }))}
                      />
                      eventsEnabled
                    </label>
                    <label className="row" style={{ gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={botConfig.flags.notificationsEnabled}
                        onChange={(e) =>
                          updateBotConfig((prev) => ({ ...prev, flags: { ...prev.flags, notificationsEnabled: e.target.checked } }))
                        }
                      />
                      notificationsEnabled
                    </label>
                    <label className="row" style={{ gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={botConfig.flags.paymentsEnabled}
                        onChange={(e) => updateBotConfig((prev) => ({ ...prev, flags: { ...prev.flags, paymentsEnabled: e.target.checked } }))}
                      />
                      paymentsEnabled
                    </label>
                    <div className="label">cooldownSeconds</div>
                    <input
                      className="field"
                      type="number"
                      min={0}
                      max={3600}
                      value={botConfig.limits.cooldownSeconds}
                      onChange={(e) =>
                        updateBotConfig((prev) => ({
                          ...prev,
                          limits: { ...prev.limits, cooldownSeconds: Math.max(0, Number(e.target.value) || 0) }
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="hint">Нажми “Обновить”, чтобы загрузить Bot config.</div>
            )}

            <details>
              <summary className="hint">JSON preview</summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{botConfig ? JSON.stringify(botConfig, null, 2) : "not loaded"}</pre>
            </details>

            <div className="stack" style={{ gap: 8 }}>
              <div style={{ fontWeight: 600 }}>History / rollback</div>
              {botConfigHistory.length === 0 ? (
                <div className="hint">История пока пустая (появится после первого сохранения).</div>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  {botConfigHistory.slice(0, 10).map((h) => (
                    <div key={h.id} className="rowBetween">
                      <code>{h.id}</code>
                      <button className="btn btnDanger btnSmall" disabled={!isConfigured || loading} onClick={() => void rollbackBotConfig(h.id)}>
                        Rollback
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
