// ==UserScript==
// @name         WordReference
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        www.wordreference.com/*
// @grant        none
// ==/UserScript==

const CODE_SLASH = 191;
const CODE_L = 76;
const LANG_CODES = {
  it: "🇮🇹",
  en: "🇬🇧",
  fr: "🇫🇷",
};

function injectStyle(headElem) {
  let css = `.google-translate {
background: url("https://ssl.gstatic.com/translate/favicon.ico");
background-size: cover;
width: 22px;
height: 22px;
cursor: pointer;
display: inline-block;
position: relative;
top: 3px;
margin-right: 12px;
}`;
  css += `.lang-switcher {
position: absolute;
top: 42px;
left: 6px;
}`;
  css += `.lang-switcher-item {
display: flex;
align-items: center;
}`;
  css += `.lang-switcher-icon {
font-size: 30px;
}`;
  css += `.lang-switcher-arrow-container {
display: flex;
flex-direction: column;
}`;
  css += `.lang-switcher-arrow {
cursor: pointer;
margin: 0 6px;
}`;
  const style = document.createElement("style");
  if (style.styleSheet) {
    style.styleSheet.cssText = css;
  } else {
    style.appendChild(document.createTextNode(css));
  }
  headElem.appendChild(style);
}

function buildGoogleTranslate(term, sourceLang, targetLang) {
  const elem = document.createElement("span");
  elem.classList.add("google-translate");
  elem.onclick = (e) => {
    window.open(
      `https://translate.google.com/?sl=${sourceLang}&tl=${targetLang}&text=${term}&op=translate`,
    );
  };
  return elem;
}

function buildLangSwitcher() {
  const container = document.createElement("div");
  container.classList.add("lang-switcher");

  container.appendChild(buildLangSwitcherItem("en", "it"));
  container.appendChild(buildLangSwitcherItem("en", "fr"));

  return container;
}

function buildLangSwitcherItem(fromLang, toLang) {
  const fromLangElem = document.createElement("span");
  fromLangElem.classList.add("lang-switcher-icon");
  fromLangElem.innerText = LANG_CODES[fromLang];

  const toLangElem = document.createElement("span");
  toLangElem.classList.add("lang-switcher-icon");
  toLangElem.innerText = LANG_CODES[toLang];

  const rightArrow = buildLangSwitcherArrow(
    "→",
    `${fromLang} to ${toLang}`,
    (e) => {
      const path = window.location.pathname.split("/")[2];
      const lang = `${fromLang}${toLang}`;
      window.location = `${origin}/${lang}/${path}`;
    },
  );
  const leftArrow = buildLangSwitcherArrow(
    "←",
    `${toLang} to ${fromLang}`,
    (e) => {
      const path = window.location.pathname.split("/")[2];
      const lang = `${toLang}${fromLang}`;
      window.location = `${origin}/${lang}/${path}`;
    },
  );
  const arrowContainer = document.createElement("div");
  arrowContainer.classList.add("lang-switcher-arrow-container");
  arrowContainer.appendChild(rightArrow);
  arrowContainer.appendChild(leftArrow);

  const container = document.createElement("div");
  container.classList.add("lang-switcher-item");
  container.appendChild(fromLangElem);
  container.appendChild(arrowContainer);
  container.appendChild(toLangElem);
  return container;
}

function buildLangSwitcherArrow(content, tooltipText, onClick) {
  const arrow = document.createElement("span");
  arrow.classList.add("lang-switcher-arrow");
  arrow.innerText = content;
  arrow.title = tooltipText;
  arrow.onclick = onClick;
  return arrow;
}

(function () {
  "use strict";

  injectStyle(document.querySelector("head"));

  const q = document.querySelector("#si");
  const articleHead = document.querySelector("#articleHead");
  const listenBtn = document.querySelector("#listen_txt");
  const term = document.querySelector(".headerWord").innerText;

  document.addEventListener("keyup", (e) => {
    if (listenBtn && e.altKey && e.ctrlKey && e.keyCode === CODE_L) {
      listenBtn.click();
    }
    if (e.keyCode === CODE_SLASH) {
      q.focus();
    }
  });

  const lang = window.location.pathname.split("/")[1];
  const sourceLang = lang.substring(0, 2);
  const targetLang = lang.substring(2);
  const gTranslate = buildGoogleTranslate(term, sourceLang, targetLang);
  articleHead.prepend(gTranslate);

  const langSwitcher = buildLangSwitcher();
  document.body.appendChild(langSwitcher);
})();
