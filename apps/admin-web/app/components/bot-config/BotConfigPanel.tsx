"use client";

import type { ReactElement } from "react";
import type { BotConfigV1 } from "@eon/shared-domain";

export type BotConfigHistoryEntry = { id: string; createdAt: string };

export type BotConfigPanelProps = {
  botConfig: BotConfigV1;
  botConfigHistory: BotConfigHistoryEntry[];
  publicConfig: BotConfigV1 | null;
  publicConfigError: string | null;
  isDirty: boolean;
  isLoadingAdmin: boolean;
  isSaving: boolean;
  isLoadingPublic: boolean;
  validationLines: string[];
  botConfigError: string | null;
  onUpdate: (updater: (prev: BotConfigV1) => BotConfigV1) => void;
  onReload: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onRefreshPublic: () => void;
  onRollback: (id: string) => void;
  disabled: boolean;
};

function addMainMenuButton(onUpdate: BotConfigPanelProps["onUpdate"]): void {
  onUpdate((prev) => ({ ...prev, menuButtons: { ...prev.menuButtons, main: [...prev.menuButtons.main, "Новая кнопка"] } }));
}

function addAfterSubscriptionButton(onUpdate: BotConfigPanelProps["onUpdate"]): void {
  onUpdate((prev) => ({
    ...prev,
    menuButtons: { ...prev.menuButtons, afterSubscription: [...prev.menuButtons.afterSubscription, "Новая кнопка"] }
  }));
}

function addChannel(onUpdate: BotConfigPanelProps["onUpdate"]): void {
  onUpdate((prev) => ({
    ...prev,
    channels: [
      ...prev.channels,
      {
        title: "Новый канал",
        username: "@channel",
        inviteLink: "https://t.me/channel",
        isRequired: true,
        isActive: true
      }
    ]
  }));
}

export function BotConfigPanel(props: BotConfigPanelProps): ReactElement {
  const {
    botConfig,
    botConfigHistory,
    publicConfig,
    publicConfigError,
    isDirty,
    isLoadingAdmin,
    isSaving,
    isLoadingPublic,
    validationLines,
    botConfigError,
    onUpdate,
    onReload,
    onSave,
    onDiscard,
    onRefreshPublic,
    onRollback,
    disabled
  } = props;

  const busy = disabled || isLoadingAdmin || isSaving;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {isDirty ? (
        <div className="warnBanner">
          <strong>Есть несохранённые изменения.</strong> Нажми «Сохранить на сервере», иначе бот их не увидит. Уход со страницы может показать
          предупреждение браузера.
        </div>
      ) : null}

      {botConfigError ? <div className="errorBox">{botConfigError}</div> : null}

      {validationLines.length > 0 ? (
        <div className="errorBox">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Исправьте ошибки перед сохранением</div>
          <ul className="validationList">
            {validationLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rowBetween" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 6 }}>
          <div className="sectionTitle">Настройки бота</div>
          <p className="sectionLead">
            Один источник правды для бота: после сохранения данные уходят в core-api и сразу доступны по публичному адресу{" "}
            <code>/v1/bot/config</code> (то, что опрашивает bot-service).
          </p>
        </div>
        <div className="row">
          <button className="btn btnSmall" type="button" disabled={busy} onClick={() => void onReload()} title="Загрузить с сервера">
            {isLoadingAdmin ? "Загрузка…" : "Загрузить с сервера"}
          </button>
          <button className="btn btnSmall" type="button" disabled={busy || !isDirty} onClick={() => void onDiscard()}>
            Сбросить черновик
          </button>
          <button className="btn btnPrimary btnSmall" type="button" disabled={busy || validationLines.length > 0} onClick={() => void onSave()}>
            {isSaving ? "Сохранение…" : "Сохранить на сервере"}
          </button>
        </div>
      </div>

      <div className="card sectionCard">
        <div className="cardBody stack">
          <div className="sectionTitle">Проверка: что видит бот сейчас</div>
          <p className="hint">
            Публичный JSON без секретов — после сохранения нажми «Обновить», число каналов должно совпасть с блоком «Обязательные каналы» ниже.
          </p>
          <div className="row">
            <button className="btn btnSmall" type="button" disabled={disabled || isLoadingPublic} onClick={() => void onRefreshPublic()}>
              {isLoadingPublic ? "Загрузка…" : "Обновить публичный конфиг"}
            </button>
          </div>
          {publicConfigError ? <div className="errorBox">{publicConfigError}</div> : null}
          {publicConfig ? (
            <div className="successBanner mono" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
              Каналов в публичном конфиге: <strong>{publicConfig.channels?.length ?? 0}</strong>
              {"\n"}
              {JSON.stringify(
                (publicConfig.channels ?? []).map((c) => ({
                  title: c.title,
                  username: c.username,
                  isRequired: c.isRequired,
                  isActive: c.isActive
                })),
                null,
                2
              )}
            </div>
          ) : (
            <div className="hint">Нажми «Обновить публичный конфиг», чтобы сравнить с черновиком.</div>
          )}
        </div>
      </div>

      <div className="card sectionCard">
        <div className="cardBody stack">
          <div className="sectionTitle">Сообщения бота</div>
          <p className="hint">Тексты, которые пользователь видит в Telegram. Все поля обязательны для сохранения (кроме помеченных «дополнительно»).</p>

          <div className="label">Приветствие (/start)</div>
          <textarea
            className="field textarea"
            value={botConfig.content.startMessage}
            onChange={(e) => onUpdate((prev) => ({ ...prev, content: { ...prev.content, startMessage: e.target.value } }))}
          />

          <div className="label">Нужна подписка на каналы</div>
          <textarea
            className="field textarea"
            value={botConfig.content.subscriptionRequiredMessage}
            onChange={(e) =>
              onUpdate((prev) => ({ ...prev, content: { ...prev.content, subscriptionRequiredMessage: e.target.value } }))
            }
          />

          <div className="label">Ивенты недоступны</div>
          <textarea
            className="field textarea"
            value={botConfig.content.eventsUnavailableMessage}
            onChange={(e) => onUpdate((prev) => ({ ...prev, content: { ...prev.content, eventsUnavailableMessage: e.target.value } }))}
          />

          <div className="label">Поддержка</div>
          <textarea
            className="field textarea"
            value={botConfig.content.supportMessage}
            onChange={(e) => onUpdate((prev) => ({ ...prev, content: { ...prev.content, supportMessage: e.target.value } }))}
          />

          <div className="label">Не удалось проверить подписку (дополнительно)</div>
          <textarea
            className="field textarea"
            value={botConfig.content.subscriptionCheckFailedMessage ?? ""}
            onChange={(e) =>
              onUpdate((prev) => ({
                ...prev,
                content: { ...prev.content, subscriptionCheckFailedMessage: e.target.value || undefined }
              }))
            }
          />

          <div className="label">Лимит просмотров исчерпан (дополнительно)</div>
          <textarea
            className="field textarea"
            value={botConfig.content.limitReachedMessage ?? ""}
            onChange={(e) =>
              onUpdate((prev) => ({
                ...prev,
                content: { ...prev.content, limitReachedMessage: e.target.value || undefined }
              }))
            }
          />

          <div className="label">Слишком частые запросы / cooldown (дополнительно)</div>
          <textarea
            className="field textarea"
            value={botConfig.content.cooldownActiveMessage ?? ""}
            onChange={(e) =>
              onUpdate((prev) => ({
                ...prev,
                content: { ...prev.content, cooldownActiveMessage: e.target.value || undefined }
              }))
            }
          />
        </div>
      </div>

      <div className="card sectionCard">
        <div className="cardBody stack">
          <div className="rowBetween">
            <div className="sectionTitle">Кнопки меню</div>
            <div className="row">
              <button className="btn btnPrimary btnSmall" type="button" disabled={busy} onClick={() => addMainMenuButton(onUpdate)}>
                + В главное меню
              </button>
              <button className="btn btnPrimary btnSmall" type="button" disabled={busy} onClick={() => addAfterSubscriptionButton(onUpdate)}>
                + После подписки
              </button>
            </div>
          </div>
          <p className="hint">В каждой группе должна остаться хотя бы одна непустая кнопка — иначе сохранение будет отклонено.</p>

          <div className="label">Главное меню</div>
          {botConfig.menuButtons.main.map((btn, idx) => (
            <div key={`main-${idx}`} className="row">
              <input
                className="field"
                value={btn}
                onChange={(e) =>
                  onUpdate((prev) => {
                    const next = [...prev.menuButtons.main];
                    next[idx] = e.target.value;
                    return { ...prev, menuButtons: { ...prev.menuButtons, main: next } };
                  })
                }
              />
              <button
                className="btn btnDanger btnSmall"
                type="button"
                disabled={busy || botConfig.menuButtons.main.length <= 1}
                title={botConfig.menuButtons.main.length <= 1 ? "Нужна минимум одна кнопка" : undefined}
                onClick={() =>
                  onUpdate((prev) => ({
                    ...prev,
                    menuButtons: { ...prev.menuButtons, main: prev.menuButtons.main.filter((_, i) => i !== idx) }
                  }))
                }
              >
                Удалить
              </button>
            </div>
          ))}

          <div className="label">После подписки</div>
          {botConfig.menuButtons.afterSubscription.map((btn, idx) => (
            <div key={`after-${idx}`} className="row">
              <input
                className="field"
                value={btn}
                onChange={(e) =>
                  onUpdate((prev) => {
                    const next = [...prev.menuButtons.afterSubscription];
                    next[idx] = e.target.value;
                    return { ...prev, menuButtons: { ...prev.menuButtons, afterSubscription: next } };
                  })
                }
              />
              <button
                className="btn btnDanger btnSmall"
                type="button"
                disabled={busy || botConfig.menuButtons.afterSubscription.length <= 1}
                onClick={() =>
                  onUpdate((prev) => ({
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

      <div className="card sectionCard">
        <div className="cardBody stack">
          <div className="rowBetween">
            <div className="sectionTitle">Обязательные каналы</div>
            <button className="btn btnPrimary btnSmall" type="button" disabled={busy} onClick={() => addChannel(onUpdate)}>
              + Добавить канал
            </button>
          </div>
          <p className="hint">
            Именно эти каналы проверяет бот при включённой проверке подписки. Чтобы проверка работала, бот должен быть{" "}
            <strong>администратором</strong> канала (или иметь доступ к участникам). Ссылка-приглашение — полный URL, например{" "}
            <code>https://t.me/+…</code> или <code>https://t.me/username</code> (можно вставить <code>t.me/…</code> — мы добавим https).
          </p>

          {botConfig.channels.length === 0 ? (
            <div className="hint">Каналов нет — подписка не требуется, если проверка выключена в блоке «Включение функций».</div>
          ) : null}

          {botConfig.channels.map((channel, idx) => (
            <div key={`ch-${idx}`} className="card innerChannelCard">
              <div className="cardBody stack">
                <div className="label">Название для пользователя</div>
                <input
                  className="field"
                  value={channel.title}
                  onChange={(e) =>
                    onUpdate((prev) => {
                      const next = [...prev.channels];
                      next[idx] = { ...next[idx], title: e.target.value };
                      return { ...prev, channels: next };
                    })
                  }
                  placeholder="Например: Новости проекта"
                />

                <div className="label">Username канала</div>
                <input
                  className="field"
                  value={channel.username}
                  onChange={(e) =>
                    onUpdate((prev) => {
                      const next = [...prev.channels];
                      next[idx] = { ...next[idx], username: e.target.value };
                      return { ...prev, channels: next };
                    })
                  }
                  placeholder="@mychannel"
                />

                <div className="label">Ссылка (invite / публичная)</div>
                <input
                  className="field"
                  value={channel.inviteLink}
                  onChange={(e) =>
                    onUpdate((prev) => {
                      const next = [...prev.channels];
                      next[idx] = { ...next[idx], inviteLink: e.target.value };
                      return { ...prev, channels: next };
                    })
                  }
                  placeholder="https://t.me/+…"
                />

                <div className="label">ID канала в Telegram (необязательно, -100…)</div>
                <input
                  className="field"
                  value={channel.tgChannelId ?? ""}
                  onChange={(e) =>
                    onUpdate((prev) => {
                      const next = [...prev.channels];
                      const v = e.target.value.trim();
                      next[idx] = { ...next[idx], tgChannelId: v ? v : undefined };
                      return { ...prev, channels: next };
                    })
                  }
                  placeholder="-1001234567890"
                />

                <div className="row">
                  <label className="row" style={{ gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={channel.isRequired}
                      onChange={(e) =>
                        onUpdate((prev) => {
                          const next = [...prev.channels];
                          next[idx] = { ...next[idx], isRequired: e.target.checked };
                          return { ...prev, channels: next };
                        })
                      }
                    />
                    Обязателен для доступа
                  </label>
                  <label className="row" style={{ gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={channel.isActive}
                      onChange={(e) =>
                        onUpdate((prev) => {
                          const next = [...prev.channels];
                          next[idx] = { ...next[idx], isActive: e.target.checked };
                          return { ...prev, channels: next };
                        })
                      }
                    />
                    Учитывать при проверке
                  </label>
                </div>

                <button
                  className="btn btnDanger btnSmall"
                  type="button"
                  disabled={busy}
                  onClick={() => onUpdate((prev) => ({ ...prev, channels: prev.channels.filter((_, i) => i !== idx) }))}
                >
                  Удалить канал из конфига
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card sectionCard">
        <div className="cardBody stack">
          <div className="sectionTitle">Лимиты</div>
          <div className="label">Пауза между запросами пользователя (секунды)</div>
          <input
            className="field"
            type="number"
            min={0}
            max={3600}
            value={botConfig.limits.cooldownSeconds}
            onChange={(e) =>
              onUpdate((prev) => ({
                ...prev,
                limits: { ...prev.limits, cooldownSeconds: Math.max(0, Math.min(3600, Number(e.target.value) || 0)) }
              }))
            }
          />

          <div className="label">Максимум просмотров ивентов в сутки (на пользователя)</div>
          <input
            className="field"
            type="number"
            min={0}
            max={100000}
            value={botConfig.limits.dailyEventViewsMax}
            onChange={(e) =>
              onUpdate((prev) => ({
                ...prev,
                limits: { ...prev.limits, dailyEventViewsMax: Math.max(0, Math.min(100000, Number(e.target.value) || 0)) }
              }))
            }
          />

          <div className="label">Минимум секунд между повторными проверками подписки</div>
          <input
            className="field"
            type="number"
            min={0}
            max={3600}
            value={botConfig.limits.subscriptionRecheckMinSeconds}
            onChange={(e) =>
              onUpdate((prev) => ({
                ...prev,
                limits: {
                  ...prev.limits,
                  subscriptionRecheckMinSeconds: Math.max(0, Math.min(3600, Number(e.target.value) || 0))
                }
              }))
            }
          />
        </div>
      </div>

      <div className="card sectionCard">
        <div className="cardBody stack">
          <div className="sectionTitle">Включение функций</div>

          <label className="row flagRow">
            <input
              type="checkbox"
              checked={botConfig.flags.subscriptionsCheckEnabled}
              onChange={(e) =>
                onUpdate((prev) => ({
                  ...prev,
                  flags: { ...prev.flags, subscriptionsCheckEnabled: e.target.checked }
                }))
              }
            />
            <span>
              <strong>Проверка подписки на каналы</strong>
              <span className="hint blockHint">Если выключено, бот не требует вступления в каналы из списка выше.</span>
            </span>
          </label>

          <label className="row flagRow">
            <input
              type="checkbox"
              checked={botConfig.flags.eventsEnabled}
              onChange={(e) => onUpdate((prev) => ({ ...prev, flags: { ...prev.flags, eventsEnabled: e.target.checked } }))}
            />
            <span>
              <strong>Ивенты (FunTime)</strong>
              <span className="hint blockHint">Выкл — бот не показывает ближайшие события.</span>
            </span>
          </label>

          <label className="row flagRow">
            <input
              type="checkbox"
              checked={botConfig.flags.notificationsEnabled}
              onChange={(e) =>
                onUpdate((prev) => ({
                  ...prev,
                  flags: { ...prev.flags, notificationsEnabled: e.target.checked }
                }))
              }
            />
            <span>
              <strong>Уведомления</strong>
              <span className="hint blockHint">Напоминания и сервисные сообщения пользователям.</span>
            </span>
          </label>

          <label className="row flagRow">
            <input
              type="checkbox"
              checked={botConfig.flags.paymentsEnabled}
              onChange={(e) => onUpdate((prev) => ({ ...prev, flags: { ...prev.flags, paymentsEnabled: e.target.checked } }))}
            />
            <span>
              <strong>Платежи</strong>
              <span className="hint blockHint">Оплата тарифов через Crypto Pay (когда интеграция включена).</span>
            </span>
          </label>
        </div>
      </div>

      <details className="supportDetails">
        <summary>Технический JSON (для поддержки)</summary>
        <pre className="mono preJson">{JSON.stringify(botConfig, null, 2)}</pre>
      </details>

      <div className="card sectionCard">
        <div className="cardBody stack">
          <div className="sectionTitle">История версий</div>
          <p className="hint dangerText">
            Откат заменяет текущий конфиг снимком из истории. Перед откатом убедись, что черновик сохранён или не нужен.
          </p>
          {botConfigHistory.length === 0 ? (
            <div className="hint">История появится после первого успешного сохранения.</div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {botConfigHistory.slice(0, 15).map((h) => (
                <div key={h.id} className="rowBetween historyRow">
                  <div>
                    <code className="mono">{h.id}</code>
                    <div className="hint">{new Date(h.createdAt).toLocaleString()}</div>
                  </div>
                  <button
                    className="btn btnDanger btnSmall"
                    type="button"
                    disabled={busy}
                    onClick={() => void onRollback(h.id)}
                  >
                    Откатить к этой версии
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
