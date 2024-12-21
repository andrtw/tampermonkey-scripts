// ==UserScript==
// @name         WordReference search
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

const BASE_URL = "https://www.wordreference.com";
const CODE_ESC = 27;
const LANG = "enit";
const AUDIO_SEARCH_TERM = "uk/general";

function log(message, data) {
  if (data) {
    console.log(message, data);
  } else {
    console.log(message);
  }
}

function injectStyle(headElem) {
  const css = `
.wr-box {
  display: none;
  background: #fff;
  box-shadow: 0 12px 48px rgb(109 117 141 / 20%);
  border-radius: 8px;
  padding: 4px 6px;
  position: absolute;
  z-index: 2147483644;
  align-items: center;
  font-size: 12px;
  font-family: sans-serif;
  font-style: normal;
  line-height: 14px;
}
.wr-logo {
  background-image: url(https://www.wordreference.com/favicon.ico);
  background-size: contain;
  width: 18px;
  height: 18px;
  cursor: pointer;
}
.wr-box-content {
  align-items: center;
}
.wr-close-btn {
  position: absolute;
  transform: rotate(45deg);
  top: -2px;
  right: 2px;
  font-size: 16px;
  color: #0000006b;
  cursor: pointer;
}
.wr-box-content-right {
  display: flex;
  flex-direction: column;
  margin-left: 4px;
  padding-left: 4px;
  border-left: 1px solid rgb(109 117 141 / 20%);
}
.wr-pron {
  color: #003399;
  white-space: break-spaces;
  margin-bottom: 2px;
}
.wr-audio-icon {
  background-image: url(https://www.wordreference.com/images/sprite_2022.webp?v=1);
  background-size: 160px 172px;
  background-position: -5px -117px;
  width: 23px;
  height: 16px;
  cursor: pointer;
}
.wr-loading,
.wr-loading:after {
  border-radius: 50%;
  width: 10em;
  height: 10em;
}
.wr-loading {
  width: 16px;
  height: 16px;
  border: 2px solid #ddd;
  border-left: 2px solid rgb(0, 0, 0, 0);
  -webkit-transform: translateZ(0);
  -ms-transform: translateZ(0);
  transform: translateZ(0);
  -webkit-animation: rotate 1.1s infinite linear;
  animation: rotate 1.1s infinite linear;
}
@-webkit-keyframes rotate {
  0% {
    -webkit-transform: rotate(0deg);
    transform: rotate(0deg);
  }
  100% {
    -webkit-transform: rotate(360deg);
    transform: rotate(360deg);
  }
}
@keyframes rotate {
  0% {
    -webkit-transform: rotate(0deg);
    transform: rotate(0deg);
  }
  100% {
    -webkit-transform: rotate(360deg);
    transform: rotate(360deg);
  }
}
`;
  const style = document.createElement("style");
  if (style.styleSheet) {
    style.styleSheet.cssText = css;
  } else {
    style.appendChild(document.createTextNode(css));
  }
  headElem.appendChild(style);
}

function getSelectedText() {
  let selection = "";
  if (window.getSelection) {
    selection = window.getSelection().toString();
  } else if (document.selection && document.selection.type != "Control") {
    selection = document.selection.createRange().text;
  }
  const pieces = selection.split(" ").filter((p) => p.length > 0);
  if (pieces.length == 1) {
    return pieces[0].replace(/\r?\n|\r/g, "").trim();
  }
  return undefined;
}

function clearSelection() {
  if (window.getSelection) {
    if (window.getSelection().empty) {
      window.getSelection().empty();
    } else if (window.getSelection().removeAllRanges) {
      window.getSelection().removeAllRanges();
    }
  } else if (document.selection) {
    document.selection.empty();
  }
}

class BoxController {
  #isOpen = false;

  constructor() {
    this.boxElem = this.#buildBoxElem();
    this.loadingElem = this.#buildLoadingElem();
    this.contentElem = this.#buildContentElem();
    this.closeBtn = this.#buildCloseBtn();
  }

  get isOpen() {
    return this.#isOpen;
  }

  get box() {
    this.boxElem.appendChild(this.loadingElem);
    this.boxElem.appendChild(this.contentElem);
    this.boxElem.appendChild(this.closeBtn);
    return this.boxElem;
  }

  searchTerm(term, x, y) {
    if (!term) return;

    this.#open(x, y);

    fetch(`${BASE_URL}/${LANG}/${term}`)
      .then((response) => response.text())
      .then((html) => {
        const dom = new DOMParser().parseFromString(html, "text/html");
        const noEntryFoundElem = dom.querySelector("#noEntryFound");

        if (noEntryFoundElem) {
          this.close();
          return;
        }

        const headerWordElem = dom.querySelector(".headerWord");
        const word =
          headerWordElem.childElementCount > 0
            ? headerWordElem.childNodes[0].innerHTML
            : headerWordElem.innerHTML;
        const pron = this.#getPronunciation(
          dom.querySelector("#pronunciation_widget"),
        );
        const audioUrl = this.#getAudioUrl(
          dom.querySelector("#listen_widget script")?.text,
        );
        this.#populateBox(word, pron, audioUrl);
      })
      .catch((error) => log("Error calling WordReference", error));
  }

  close() {
    if (!this.#isOpen) return;

    this.boxElem.style.display = "none";
    this.#isOpen = false;
  }

  #buildBoxElem() {
    const boxElem = document.createElement("div");
    boxElem.classList.add("wr-box");

    const stopPropagation = (e) => e.stopPropagation();
    boxElem.onclick = stopPropagation;
    boxElem.onmouseup = stopPropagation;
    boxElem.onmousedown = stopPropagation;

    return boxElem;
  }

  #buildContentElem() {
    const boxContentElem = document.createElement("div");
    boxContentElem.classList.add("wr-box-content");
    return boxContentElem;
  }

  #buildLoadingElem() {
    const loadingElem = document.createElement("span");
    loadingElem.classList.add("wr-loading");
    return loadingElem;
  }

  #buildCloseBtn() {
    const closeBtn = document.createElement("span");
    closeBtn.classList.add("wr-close-btn");
    closeBtn.appendChild(document.createTextNode("+"));
    closeBtn.onclick = (e) => this.close();
    return closeBtn;
  }

  #open(x, y) {
    if (this.#isOpen) return;

    this.loadingElem.style.display = "block";
    this.contentElem.style.display = "none";
    this.closeBtn.style.display = "none";

    this.boxElem.style.top = `${y || 0}px`;
    this.boxElem.style.left = `${x || 0}px`;
    this.boxElem.style.display = "block";

    this.#isOpen = true;
  }

  #populateBox(term, pron, audioUrl) {
    this.loadingElem.style.display = "none";
    this.contentElem.style.display = "flex";
    this.closeBtn.style.display = "block";

    const logoElem = document.createElement("div");
    logoElem.classList.add("wr-logo");
    logoElem.onclick = (e) => {
      window.open(`${BASE_URL}/${LANG}/${term}`);
    };

    const rightColElem = document.createElement("div");
    rightColElem.classList.add("wr-box-content-right");

    if (!pron && !audioUrl) {
      rightColElem.style.display = "none";
    }
    if (pron) {
      const p = document.createElement("span");
      p.classList.add("wr-pron");
      p.innerHTML = pron;
      rightColElem.appendChild(p);
    }
    if (audioUrl) {
      const icon = document.createElement("div");
      icon.classList.add("wr-audio-icon");
      icon.onclick = (e) => {
        const audio = new Audio(BASE_URL + audioUrl);
        audio.play();
      };
      rightColElem.appendChild(icon);
    }

    this.contentElem.innerHTML = "";
    this.contentElem.appendChild(logoElem);
    this.contentElem.appendChild(rightColElem);
  }

  #getPronunciation(pronElem) {
    if (!pronElem) return undefined;

    const deleteElems = pronElem.querySelectorAll(
      'span[style="font-size:12px"]',
    );
    deleteElems.forEach((el) => {
      el.parentNode.removeChild(el);
    });
    return pronElem.innerText
      .replace(/UK/g, "\nUK")
      .replace(/US/g, "\nUS")
      .trim();
  }

  #getAudioUrl(scriptString) {
    if (!scriptString) return undefined;
    const urls = scriptString
      .match(/('\/).*(mp3')/)[0]
      ?.split(",")
      ?.map((url) => url.replace(/'/g, ""));
    return urls.find((url) => url.includes(AUDIO_SEARCH_TERM));
  }
}

(function () {
  const head = document.querySelector("head");
  injectStyle(head);

  const boxController = new BoxController();
  document.body.appendChild(boxController.box);

  document.onclick = (e) => {
    if (boxController.isOpen) {
      boxController.close();
    } else {
      boxController.searchTerm(getSelectedText(), e.pageX + 2, e.pageY + 2);
    }
  };

  document.onmousedown = (e) => {
    boxController.close();
    clearSelection();
  };

  document.onkeydown = (e) => {
    if (boxController.isOpen && e.keyCode === CODE_ESC) {
      boxController.close();
      clearSelection();
    }
  };
})();
