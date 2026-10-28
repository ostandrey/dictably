"use client";

import { useState } from "react";
import type { LandingCopy } from "@/lib/copy/types";

type Turn = {
  id: string;
  name: string;
  role: string;
  tone: 1 | 2 | 3;
  time: string;
  seconds: number;
  text: string;
  mark?: string;
};

type MinuteItem = {
  id: string;
  text: string;
  time: string;
  seconds: number;
  done?: boolean;
  active?: boolean;
};

type MinuteGroup = {
  id: string;
  title: string;
  tone: 1 | 2;
  items: MinuteItem[];
};

const TURNS_EN: Turn[] = [
  {
    id: "t1",
    name: "Olena",
    role: "Ministry",
    tone: 1,
    time: "03:08",
    seconds: 188,
    text: "STEM and pilot schools get different subsidies, but your table has only one column for it. I'm sending you the new order. It isn't signed yet.",
  },
  {
    id: "t3",
    name: "Iryna",
    role: "Support PM",
    tone: 2,
    time: "03:15",
    seconds: 195,
    text: "Okay, we'll update the table. Where will you send the order?",
    mark: "Okay, we'll update the table.",
  },
  {
    id: "t4",
    name: "Olena",
    role: "Ministry",
    tone: 1,
    time: "03:22",
    seconds: 202,
    text: "I've already sent it. Check your inbox.",
  },
  {
    id: "t7",
    name: "Maria",
    role: "Support CEO",
    tone: 3,
    time: "12:01",
    seconds: 721,
    text: "Let's fix the agreements. On our side, we speed up the review of furniture-procurement documents within a month.",
  },
];

const TURNS_UK: Turn[] = [
  {
    id: "t1",
    name: "Олена",
    role: "МОН",
    tone: 1,
    time: "03:08",
    seconds: 188,
    text: "СТЕМ і пілотні заклади мають різні субвенції, а у вашій таблиці для цього лише одна колонка. Я надішлю вам новий наказ. Його ще не підписали.",
  },
  {
    id: "t3",
    name: "Ірина",
    role: "PM підтримки",
    tone: 2,
    time: "03:15",
    seconds: 195,
    text: "Добре, оновимо таблицю. Куди саме ви надішлете наказ?",
    mark: "Добре, оновимо таблицю.",
  },
  {
    id: "t4",
    name: "Олена",
    role: "МОН",
    tone: 1,
    time: "03:22",
    seconds: 202,
    text: "Я вже надіслала, подивіться пошту.",
  },
  {
    id: "t7",
    name: "Марія",
    role: "CEO підтримки",
    tone: 3,
    time: "12:01",
    seconds: 721,
    text: "Давайте зафіксуємо домовленості. З нашого боку — пришвидшуємо перевірку документації із закупівлі меблів протягом місяця.",
  },
];

const GROUPS_EN: MinuteGroup[] = [
  {
    id: "g-support",
    title: "Support team agreed to",
    tone: 2,
    items: [
      {
        id: "m2",
        text: "Update the table to the new STEM order",
        time: "03:15",
        seconds: 195,
        active: true,
      },
      {
        id: "m1",
        text: "Speed up the furniture review, within a month",
        time: "12:01",
        seconds: 721,
      },
    ],
  },
  {
    id: "g-ministry",
    title: "Ministry agreed to",
    tone: 1,
    items: [
      {
        id: "m4",
        text: "Send the new STEM order",
        time: "03:22",
        seconds: 202,
        done: true,
      },
    ],
  },
];

const GROUPS_UK: MinuteGroup[] = [
  {
    id: "g-support",
    title: "Команда підтримки домовилась",
    tone: 2,
    items: [
      {
        id: "m2",
        text: "Оновити таблицю відповідно до нового наказу щодо СТЕМ",
        time: "03:15",
        seconds: 195,
        active: true,
      },
      {
        id: "m1",
        text: "Пришвидшити перевірку меблів протягом місяця",
        time: "12:01",
        seconds: 721,
      },
    ],
  },
  {
    id: "g-ministry",
    title: "МОН домовилось",
    tone: 1,
    items: [
      {
        id: "m4",
        text: "Надіслати новий наказ щодо СТЕМ",
        time: "03:22",
        seconds: 202,
        done: true,
      },
    ],
  },
];

const LANES = [
  { flex: 12, tone: 1 },
  { flex: 5, tone: 2 },
  { flex: 6, tone: 1 },
  { flex: 14, tone: 3 },
  { flex: 8, tone: 2 },
  { flex: 9, tone: 1 },
] as const;

type Props = { copy: LandingCopy };

export function ProductExample({ copy }: Props) {
  const turns = copy.locale === "uk" ? TURNS_UK : TURNS_EN;
  const groups = copy.locale === "uk" ? GROUPS_UK : GROUPS_EN;
  const [tab, setTab] = useState<"transcript" | "minutes">("transcript");
  const initial = turns.find((t) => t.id === "t3") ?? turns[0];

  return (
    <div
      className="lp-product"
      data-demo
      data-product-demo
      data-duration="2412"
      data-demo-hero="true"
    >
      <div className="lp-product__bar">
        <span className="lp-product__title">
          {copy.locale === "uk"
            ? "Щотижневий синк з міністерством"
            : "Weekly sync with the ministry"}
        </span>
        <span className="lp-product__meta dy-time">
          {copy.locale === "uk"
            ? "14 жовт · 40:12 · Українська"
            : "14 Oct · 40:12 · Ukrainian"}
        </span>
        <span className="dy-badge dy-badge--success">
          <span className="dy-badge__dot" aria-hidden />
          {copy.locale === "uk" ? "Готово" : "Ready"}
        </span>
      </div>

      <div className="lp-product__tabs dy-tabs" role="tablist" aria-label="Demo">
        <button
          type="button"
          role="tab"
          className="dy-tab"
          aria-selected={tab === "transcript"}
          onClick={() => setTab("transcript")}
        >
          {copy.example.transcriptLabel}
        </button>
        <button
          type="button"
          role="tab"
          className="dy-tab"
          aria-selected={tab === "minutes"}
          onClick={() => setTab("minutes")}
        >
          {copy.example.minutesLabel}
        </button>
      </div>

      <div className="lp-product__body">
        <div
          className={`lp-product__transcript${tab === "transcript" ? " is-open" : ""}`}
          data-demo-transcript
          aria-label={copy.example.transcriptLabel}
        >
          <div className="dy-transcript">
            {turns.map((turn) => {
              const active = turn.id === initial.id;
              return (
                <button
                  key={turn.id}
                  type="button"
                  className={`dy-turn${active ? " is-playing" : ""}`}
                  data-line-id={turn.id}
                  data-line-seconds={turn.seconds}
                  data-seek={turn.seconds}
                >
                  <span className="dy-speaker">
                    <span className={`dy-speaker__dot sp-${turn.tone}`} aria-hidden />
                    {turn.name}
                    <span className="dy-speaker__role">{turn.role}</span>
                  </span>
                  <span
                    className={`dy-timecode${active ? " is-active" : ""}`}
                    data-seek={turn.seconds}
                  >
                    <svg className="dy-icon" viewBox="0 0 12 12" aria-hidden>
                      <path d="M3 2.5v7l6-3.5z" />
                    </svg>
                    <span className="dy-time">{turn.time}</span>
                  </span>
                  <p className="dy-turn__text" data-line-text>
                    {turn.mark ? (
                      <>
                        <mark className="dy-mark">{turn.mark}</mark>
                        {turn.text.slice(turn.mark.length)}
                      </>
                    ) : (
                      turn.text
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className={`lp-product__minutes${tab === "minutes" ? " is-open" : ""}`}
          aria-label={copy.example.minutesLabel}
        >
          <div className="dy-minutes">
            {groups.map((group) => (
              <div key={group.id} className="dy-minutes__group">
                <h3 className="dy-minutes__heading">
                  <span className={`dy-speaker__dot sp-${group.tone}`} aria-hidden />
                  {group.title}
                </h3>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`dy-item${item.active ? " is-active" : ""}`}
                    data-seek={item.seconds}
                    data-item-id={item.id}
                    data-link-seconds={item.seconds}
                  >
                    <span
                      className={`dy-item__check${item.done ? " is-done" : ""}`}
                      aria-hidden
                    />
                    <p
                      className={`dy-item__text${item.done ? " is-done" : ""}`}
                    >
                      {item.text}
                    </p>
                    <span
                      className={`dy-timecode${item.active ? " is-active" : ""}`}
                    >
                      <span className="dy-time">{item.time}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dy-player lp-product__player">
        <button type="button" className="dy-play" aria-label="Pause" data-demo-play>
          <svg className="dy-icon" viewBox="0 0 16 16" aria-hidden>
            <rect x="4" y="3" width="3" height="10" rx="1" />
            <rect x="9" y="3" width="3" height="10" rx="1" />
          </svg>
        </button>
        <div className="dy-wave" data-demo-wave>
          <div className="dy-wave__track" aria-hidden>
            <span className="dy-wave__played" data-demo-played style={{ width: "8%" }} />
            <span className="dy-wave__head" data-demo-playhead />
          </div>
          <div className="dy-wave__lanes" aria-hidden>
            {LANES.map((lane, i) => (
              <span
                key={i}
                className={`dy-wave__lane sp-${lane.tone}`}
                style={{ flex: lane.flex }}
              />
            ))}
          </div>
        </div>
        <span
          className="dy-player__time"
          data-demo-time
          data-total="40:12"
          aria-live="off"
        >
          <b>{initial.time}</b> / 40:12
        </span>
      </div>
    </div>
  );
}
