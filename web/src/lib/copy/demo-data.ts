import type { MinutesGroup, TranscriptLine } from "./types";

export const demoTranscriptEn: TranscriptLine[] = [
  {
    id: "t1",
    speaker: "Olena, Ministry",
    speakerTone: "plum",
    time: "03:08",
    seconds: 188,
    text: "STEM and pilot schools get different subsidies, but your table has only one column for it.",
  },
  {
    id: "t2",
    speaker: "Olena, Ministry",
    speakerTone: "plum",
    time: "03:12",
    seconds: 192,
    text: "I'm sending you the new order. It isn't signed yet, but it will be soon — please update the table to match it.",
  },
  {
    id: "t3",
    speaker: "Iryna, Support PM",
    speakerTone: "teal",
    time: "03:15",
    seconds: 195,
    text: "Okay, we'll update the table. Where will you send the order?",
  },
  {
    id: "t4",
    speaker: "Olena, Ministry",
    speakerTone: "plum",
    time: "03:22",
    seconds: 202,
    text: "I've already sent it — check your inbox.",
  },
  {
    id: "t5",
    speaker: "Iryna, Support PM",
    speakerTone: "teal",
    time: "08:08",
    seconds: 488,
    text: "Right now 15 documents from 15 schools are waiting for our experts' review.",
  },
  {
    id: "t6",
    speaker: "Olena, Ministry",
    speakerTone: "plum",
    time: "10:52",
    seconds: 652,
    text: "Schools must buy the equipment within three months, and the tender itself takes a month.",
  },
  {
    id: "t7",
    speaker: "Maria, Support CEO",
    speakerTone: "ochre",
    time: "12:01",
    seconds: 721,
    text: "Let's fix the agreements. On our side, we speed up the review of furniture-procurement documents within a month.",
  },
  {
    id: "t8",
    speaker: "Maria, Support CEO",
    speakerTone: "ochre",
    time: "13:38",
    seconds: 818,
    text: "And every week we send you a report on the status of all 250 schools.",
  },
];

export const demoTranscriptUk: TranscriptLine[] = [
  {
    id: "t1",
    speaker: "Олена, МОН",
    speakerTone: "plum",
    time: "03:08",
    seconds: 188,
    text: "СТЕМ і пілотні заклади мають різні субвенції, а у вашій таблиці для цього лише одна колонка.",
  },
  {
    id: "t2",
    speaker: "Олена, МОН",
    speakerTone: "plum",
    time: "03:12",
    seconds: 192,
    text: "Я надішлю вам новий наказ. Його ще не підписали, але скоро підпишуть — оновіть, будь ласка, таблицю відповідно до нього.",
  },
  {
    id: "t3",
    speaker: "Ірина, PM підтримки",
    speakerTone: "teal",
    time: "03:15",
    seconds: 195,
    text: "Добре, оновимо таблицю. Куди саме ви надішлете наказ?",
  },
  {
    id: "t4",
    speaker: "Олена, МОН",
    speakerTone: "plum",
    time: "03:22",
    seconds: 202,
    text: "Я вже надіслала, подивіться пошту.",
  },
  {
    id: "t5",
    speaker: "Ірина, PM підтримки",
    speakerTone: "teal",
    time: "08:08",
    seconds: 488,
    text: "Зараз 15 документів від 15 закладів чекають на перевірку наших експертів.",
  },
  {
    id: "t6",
    speaker: "Олена, МОН",
    speakerTone: "plum",
    time: "10:52",
    seconds: 652,
    text: "Заклади мають закупити обладнання протягом трьох місяців, а тендер триває місяць.",
  },
  {
    id: "t7",
    speaker: "Марія, CEO підтримки",
    speakerTone: "ochre",
    time: "12:01",
    seconds: 721,
    text: "Давайте зафіксуємо домовленості. З нашого боку — пришвидшуємо перевірку документації із закупівлі меблів протягом місяця.",
  },
  {
    id: "t8",
    speaker: "Марія, CEO підтримки",
    speakerTone: "ochre",
    time: "13:38",
    seconds: 818,
    text: "І щотижня надсилаємо вам звіт зі статусом усіх 250 закладів освіти.",
  },
];

export const demoMinutesEn: MinutesGroup[] = [
  {
    id: "g-support",
    title: "Agreed — support team",
    items: [
      {
        id: "m1",
        text: "Speed up the review of furniture-procurement documents — within a month",
        time: "12:01",
        seconds: 721,
      },
      {
        id: "m2",
        text: "Update the table to the new STEM order",
        time: "03:15",
        seconds: 195,
      },
      {
        id: "m3",
        text: "Send a weekly status report on all 250 schools",
        time: "13:38",
        seconds: 818,
      },
    ],
  },
  {
    id: "g-ministry",
    title: "Agreed — ministry",
    items: [
      {
        id: "m4",
        text: "Send the new STEM order (not yet signed)",
        time: "03:22",
        seconds: 202,
        note: "already sent",
      },
    ],
  },
  {
    id: "g-deadlines",
    title: "Deadlines mentioned",
    items: [
      {
        id: "m5",
        text: "Schools must buy equipment within 3 months; the tender takes 1 month",
        time: "10:52",
        seconds: 652,
      },
    ],
  },
  {
    id: "g-open",
    title: "Open",
    items: [
      {
        id: "m6",
        text: "15 documents from 15 schools are waiting for expert review",
        time: "08:08",
        seconds: 488,
      },
    ],
  },
];

export const demoMinutesUk: MinutesGroup[] = [
  {
    id: "g-support",
    title: "Домовились — команда підтримки",
    items: [
      {
        id: "m1",
        text: "Пришвидшити перевірку документації із закупівлі меблів — протягом місяця",
        time: "12:01",
        seconds: 721,
      },
      {
        id: "m2",
        text: "Оновити таблицю відповідно до нового наказу щодо СТЕМ",
        time: "03:15",
        seconds: 195,
      },
      {
        id: "m3",
        text: "Щотижня надсилати звіт зі статусом усіх 250 закладів",
        time: "13:38",
        seconds: 818,
      },
    ],
  },
  {
    id: "g-ministry",
    title: "Домовились — МОН",
    items: [
      {
        id: "m4",
        text: "Надіслати новий наказ щодо СТЕМ (ще не підписаний)",
        time: "03:22",
        seconds: 202,
        note: "уже надіслано",
      },
    ],
  },
  {
    id: "g-deadlines",
    title: "Строки",
    items: [
      {
        id: "m5",
        text: "Заклади мають закупити обладнання протягом 3 місяців; тендер триває місяць",
        time: "10:52",
        seconds: 652,
      },
    ],
  },
  {
    id: "g-open",
    title: "Відкрите",
    items: [
      {
        id: "m6",
        text: "15 документів від 15 закладів чекають на перевірку експертів",
        time: "08:08",
        seconds: 488,
      },
    ],
  },
];
