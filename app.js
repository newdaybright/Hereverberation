const BATCH = 8;
const timeline = document.querySelector("#timeline");
const sentinel = document.querySelector("#sentinel");
const mast = document.querySelector(".mast");
const byBirthInput = document.querySelector("#by-birth");
const oldestInput = document.querySelector("#oldest-first");
const countrySelect = document.querySelector("#filter-country");
const tagRow = document.querySelector("#filter-tags");

const fieldsByTag = new Map();
let activeKind = "all";
let activeValue = "";

let ordered = [];
let cursor = 0;
let lastYear = null;
let loading = false;

function peopleOf(entry) {
  return entry.name.split("、").map((part) => part.trim()).filter(Boolean);
}

function knownBirths(entry) {
  return peopleOf(entry)
    .map((name) => entry.births?.[name])
    .filter((year) => Number.isFinite(year));
}

function sortKey(entry) {
  if (byBirthInput.checked) {
    const years = knownBirths(entry);
    return years.length ? Math.min(...years) : null;
  }
  return entry.year;
}

function passesFilters(entry) {
  const country = countrySelect.value;
  if (country && !entry.country.split("、").some((part) => part.trim() === country)) return false;
  if (activeKind === "tag" && entry.tag !== activeValue) return false;
  if (activeKind === "field" && entry.field !== activeValue) return false;
  return true;
}

function sortedEntries() {
  const oldestFirst = oldestInput.checked;
  return (window.ENTRIES || []).filter(passesFilters).sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka == null && kb == null) return a.name.localeCompare(b.name, "zh");
    if (ka == null) return 1;
    if (kb == null) return -1;
    if (ka !== kb) return oldestFirst ? ka - kb : kb - ka;
    return a.name.localeCompare(b.name, "zh");
  });
}

function birthText(entry) {
  const people = peopleOf(entry);
  if (people.length > 1) {
    return people
      .map((name) => {
        const year = entry.births?.[name];
        return `${name} ${Number.isFinite(year) ? year : "不详"}`;
      })
      .join(" · ");
  }
  const year = entry.births?.[people[0]];
  return Number.isFinite(year) ? String(year) : "不详";
}

function achievementText(entry) {
  const people = peopleOf(entry);
  const ages = people
    .map((name) => {
      const born = entry.births?.[name];
      if (!Number.isFinite(born)) return "";
      const age = entry.year - born;
      if (age < 0) return "";
      return people.length > 1 ? `${name} ${age}岁` : `${age}岁`;
    })
    .filter(Boolean);
  if (!ages.length) return String(entry.year);
  return `${entry.year} · ${ages.join(" · ")}`;
}

function portraitFor(entry, person) {
  const map = entry.portraits || {};
  return map[person] || "";
}

function monogram(name) {
  return name.replace(/\s/g, "").slice(0, 1) || "·";
}

function shot(name, src) {
  const frame = document.createElement("div");
  frame.className = "shot";
  const fallback = document.createElement("div");
  fallback.className = "monogram";
  fallback.textContent = monogram(name);
  fallback.setAttribute("aria-hidden", "true");
  frame.appendChild(fallback);
  if (!src) return frame;

  const img = document.createElement("img");
  img.alt = name;
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("load", () => {
    fallback.remove();
  });
  img.addEventListener("error", () => {
    img.remove();
  });
  img.src = src;
  frame.appendChild(img);
  return frame;
}

function renderEntry(entry) {
  const people = peopleOf(entry);
  const key = sortKey(entry);
  const showYear = key !== lastYear;
  lastYear = key;

  const item = document.createElement("li");
  item.className = "node" + (showYear ? " is-new-year" : "");

  const time = document.createElement("div");
  time.className = "time";
  const year = document.createElement("time");
  year.className = "year" + (showYear ? "" : " is-repeat");
  year.textContent = key == null ? "不详" : String(key);
  if (key != null) year.dateTime = String(key);
  if (!showYear) year.setAttribute("aria-hidden", "true");
  const dot = document.createElement("span");
  dot.className = "dot";
  time.append(year, dot);

  const person = document.createElement("div");
  person.className = "person";

  const photos = document.createElement("div");
  photos.className = "photos" + (people.length > 1 ? " pair" : "");
  for (const name of people) {
    photos.appendChild(shot(name, portraitFor(entry, name)));
  }

  const body = document.createElement("div");
  body.className = "body";
  const headline = document.createElement("div");
  headline.className = "headline";
  const title = document.createElement("h2");
  title.textContent = entry.name;
  const birth = document.createElement("span");
  birth.className = "birth" + (byBirthInput.checked ? " is-active" : "");
  birth.textContent = birthText(entry);
  const field = document.createElement("span");
  field.className = "field";
  field.textContent = entry.field;
  const country = document.createElement("span");
  country.className = "field";
  country.textContent = entry.country;
  headline.append(title, birth, country, field);
  const achievement = document.createElement("p");
  achievement.className = "achievement" + (!byBirthInput.checked ? " is-active" : "");
  achievement.textContent = achievementText(entry);
  const deed = document.createElement("p");
  deed.className = "deed";
  deed.textContent = entry.event;

  body.append(headline, achievement, deed);
  person.append(photos, body);
  item.append(time, person);
  return item;
}

function finish() {
  sentinel.textContent = ordered.length ? "百年的回响，到这里暂歇。" : "没有符合的条目。";
  sentinel.classList.add("is-end");
  observer.disconnect();
}

function entryMatchesCountry(entry, country) {
  if (!country) return true;
  return entry.country.split("、").some((part) => part.trim() === country);
}

function entryMatchesChip(entry, kind, value) {
  if (kind === "tag") return entry.tag === value;
  if (kind === "field") return entry.field === value;
  return true;
}

function peopleCount(predicate) {
  let total = 0;
  for (const entry of window.ENTRIES || []) {
    if (predicate(entry)) total += peopleOf(entry).length;
  }
  return total;
}

function syncFilterCounts() {
  const country = countrySelect.value;
  const buttons = [...tagRow.querySelectorAll(".filter-tag")];
  for (const button of buttons) {
    const kind = button.dataset.kind;
    const value = button.dataset.value;
    const count = peopleCount(
      (entry) => entryMatchesCountry(entry, country) && entryMatchesChip(entry, kind, value),
    );
    const label = kind === "all" ? "全部" : value;
    button.replaceChildren(document.createTextNode(label));
    const num = document.createElement("span");
    num.className = "count";
    num.textContent = String(count);
    button.append(num);
    button.dataset.count = String(count);
    const hide = kind !== "all" && count === 0;
    button.hidden = hide;
    if (hide && activeKind === kind && activeValue === value) setActiveChip("all", "");
  }
  buttons.sort((a, b) => {
    if (a.dataset.kind === "all") return -1;
    if (b.dataset.kind === "all") return 1;
    const byCount = Number(b.dataset.count) - Number(a.dataset.count);
    if (byCount) return byCount;
    return a.dataset.value.localeCompare(b.dataset.value, "zh-CN");
  });
  for (const button of buttons) tagRow.append(button);

  const names = new Set();
  for (const entry of window.ENTRIES || []) {
    for (const part of entry.country.split("、")) {
      const name = part.trim();
      if (name) names.add(name);
    }
  }
  const current = countrySelect.value;
  countrySelect.replaceChildren();
  const total = peopleCount((entry) => entryMatchesChip(entry, activeKind, activeValue));
  countrySelect.append(new Option(`全部 ${total}`, ""));
  for (const name of [...names].sort((a, b) => a.localeCompare(b, "zh"))) {
    const count = peopleCount(
      (entry) => entryMatchesCountry(entry, name) && entryMatchesChip(entry, activeKind, activeValue),
    );
    if (activeKind !== "all" && count === 0) continue;
    countrySelect.append(new Option(`${name} ${count}`, name));
  }
  countrySelect.value = [...countrySelect.options].some((option) => option.value === current) ? current : "";
  syncTagFade();
}

function setActiveChip(kind, value) {
  activeKind = kind;
  activeValue = value;
  for (const button of tagRow.querySelectorAll(".filter-tag")) {
    button.classList.toggle("is-active", button.dataset.kind === kind && button.dataset.value === value);
  }
}

function addChip(label, kind, value) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "filter-tag";
  button.dataset.kind = kind;
  button.dataset.value = value;
  button.textContent = label;
  button.addEventListener("click", () => {
    markFiltersTouched();
    setActiveChip(kind, value);
    rebuild(true);
  });
  tagRow.appendChild(button);
}

const COUNTRY_BY_CODE = {
  AR: "阿根廷",
  AT: "奥地利",
  AU: "澳大利亚",
  BR: "巴西",
  BY: "白俄罗斯",
  PL: "波兰",
  DE: "德国",
  FR: "法国",
  KR: "韩国",
  CA: "加拿大",
  KE: "肯尼亚",
  US: "美国",
  MX: "墨西哥",
  ZA: "南非",
  NO: "挪威",
  JP: "日本",
  SE: "瑞典",
  GR: "希腊",
  NZ: "新西兰",
  HU: "匈牙利",
  IR: "伊朗",
  IL: "以色列",
  IT: "意大利",
  IN: "印度",
  GB: "英国",
  CL: "智利",
  CN: "中国",
  TW: "中国台湾",
  HK: "中国香港",
};

let filtersTouched = false;

function markFiltersTouched() {
  filtersTouched = true;
}

async function readCountryCode(url, read) {
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) return "";
  const code = String(read(await response.json()) || "").toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

async function selectLocalCountry() {
  const sources = [
    ["https://get.geojs.io/v1/ip/country.json", (data) => data.country],
    ["https://api.country.is/", (data) => data.country],
  ];
  let code = "";
  for (const [url, read] of sources) {
    if (filtersTouched) return;
    try {
      code = await readCountryCode(url, read);
    } catch {
      code = "";
    }
    if (code) break;
  }
  const name = COUNTRY_BY_CODE[code];
  if (!name || filtersTouched) return;
  if (![...countrySelect.options].some((option) => option.value === name)) return;
  countrySelect.value = name;
  rebuild(false);
}

function prepareFilters() {
  for (const entry of window.ENTRIES || []) {
    if (!fieldsByTag.has(entry.tag)) fieldsByTag.set(entry.tag, new Set());
    fieldsByTag.get(entry.tag).add(entry.field);
  }
  const chips = [];
  for (const tag of fieldsByTag.keys()) {
    chips.push({ kind: "tag", value: tag });
    for (const field of fieldsByTag.get(tag)) chips.push({ kind: "field", value: field });
  }
  tagRow.replaceChildren();
  addChip("全部", "all", "");
  for (const chip of chips) addChip(chip.value, chip.kind, chip.value);
  setActiveChip("all", "");
  syncTagFade();
}

let tagScrollTimer = 0;

function syncTagFade() {
  const wrap = tagRow.parentElement;
  const hidden = tagRow.scrollWidth - tagRow.clientWidth;
  wrap.classList.toggle("has-before", tagRow.scrollLeft > 2);
  wrap.classList.toggle("has-more", hidden > 2 && tagRow.scrollLeft < hidden - 2);
}

function showTagScroll() {
  tagRow.classList.add("is-scrolling");
  clearTimeout(tagScrollTimer);
  tagScrollTimer = setTimeout(() => tagRow.classList.remove("is-scrolling"), 700);
}

function appendBatch() {
  if (loading || cursor >= ordered.length) return;
  loading = true;
  const slice = ordered.slice(cursor, cursor + BATCH);
  cursor += slice.length;
  const frag = document.createDocumentFragment();
  for (const entry of slice) frag.appendChild(renderEntry(entry));
  timeline.appendChild(frag);
  loading = false;
  if (cursor >= ordered.length) finish();
}

const observer = new IntersectionObserver(
  (records) => {
    if (records.some((record) => record.isIntersecting)) appendBatch();
  },
  { rootMargin: "640px 0px" }
);

function syncMast() {
  document.documentElement.style.setProperty("--mast-h", `${mast.offsetHeight}px`);
}

function rebuild(scrollTop) {
  observer.disconnect();
  timeline.replaceChildren();
  cursor = 0;
  lastYear = null;
  loading = false;
  syncFilterCounts();
  ordered = sortedEntries();
  sentinel.classList.remove("is-end");
  sentinel.textContent = "继续向下";
  appendBatch();
  if (cursor < ordered.length) observer.observe(sentinel);
  else finish();
  syncMast();
  if (scrollTop) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

byBirthInput.addEventListener("change", () => rebuild(true));
oldestInput.addEventListener("change", () => rebuild(true));
countrySelect.addEventListener("change", () => {
  markFiltersTouched();
  rebuild(true);
});
tagRow.addEventListener("scroll", () => {
  syncTagFade();
  showTagScroll();
}, { passive: true });
window.addEventListener("resize", () => {
  syncMast();
  syncTagFade();
});

prepareFilters();
syncMast();
syncTagFade();
rebuild(false);
selectLocalCountry();
