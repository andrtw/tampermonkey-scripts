// ==UserScript==
// @name         YouTube
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://www.youtube.com/watch*
// @match        https://www.youtube.com/shorts/*
// @grant        none
// ==/UserScript==

const TIMEOUT = 2000;

const INCREASE_STEP = 0.25;
const DECREASE_STEP = 0.25;
const INITIAL_SPEED = 1.50;
const DEFAULT_SPEED = 1;
const MIN_SPEED = 0.25;
const MAX_SPEED = 16;

const CODE_ARROW_UP = 38;
const CODE_ARROW_DOWN = 40;
const CODE_ARROW_LEFT = 37;
const CODE_ARROW_RIGHT = 39;

function injectStyle(headElem) {
    let css = `
.yt-btn {
  width: 40px;
  height: 40px;
  font-size: 10px;
  background: #181818;
  margin: 2px;
  outline: none;
  border: none;
  color: #fff;
  border-radius: 50%;
  cursor: pointer;
  font-family: "Roboto","Arial",sans-serif;
}
.yt-btn:active {
  background: #303030;
}
.label-speed {
  color: #fff;
  margin: 4px;
  cursor: pointer;
}
.fullscreen-btn-container {
  height: 100% !important;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: linear-gradient(270deg, black 40%, transparent);
  right: -96%;
  padding-left: 22px;
}
.label-time-remaining {
  margin: 12px
}
.ytp-ad-overlay-container {
  display: none;
}
.last-btn {
  margin-right: 16px;
}
.hidden {
  display: none;
}
`;
    const style = document.createElement('style');
    if (style.styleSheet) {
        style.styleSheet.cssText = css;
    } else {
        style.appendChild(document.createTextNode(css));
    }
    headElem.appendChild(style);
}

function injectFontAwesome(headElem) {
    const script = document.createElement('script');
    script.src = 'https://kit.fontawesome.com/52842ab63c.js';
    headElem.appendChild(script);
}

function buildButton(text, onClick) {
    const btn = document.createElement('button');
    btn.classList.add('yt-btn');
    btn.appendChild(document.createTextNode(text));
    btn.onclick = onClick;
    return btn;
}

function buildIconButton(iconStyle, onClick) {
    const btn = buildButton('', onClick);
    const i = document.createElement('i');
    iconStyle.forEach((style) => i.classList.add(style));
    btn.appendChild(i);
    return btn;
}

class RemainingTimeController {
    #remainingTimeId;

    constructor(video, remainingTimeElem, moviePlayerElem) {
        this.video = video;
        this.remainingTimeElem = remainingTimeElem;
        this.moviePlayerElem = moviePlayerElem;
    }

    updateRemainingTime() {
        const time = (this.video.duration - this.video.currentTime) / this.video.playbackRate;

        const s = Math.floor(time % 60);
        const m = Math.floor((time / 60) % 60);
        const h = Math.floor((time / (60 * 60)) % 24);

        const timeFormatted = this.#formatTime(h, m, s);
        this.remainingTimeElem.innerHTML = timeFormatted;

        const isBottomBarHidden = this.moviePlayerElem.classList.contains('ytp-autohide');
        if (isBottomBarHidden || this.video.paused) {
            this.stopUpdating();
        }
    }

    startUpdating() {
        if (this.#remainingTimeId !== undefined) {
            return;
        }
        this.updateRemainingTime();
        this.#remainingTimeId = setInterval(this.updateRemainingTime.bind(this), 1000);
    }

    stopUpdating() {
        if (this.#remainingTimeId === undefined) {
            return;
        }
        clearInterval(this.#remainingTimeId);
        this.#remainingTimeId = undefined;
        this.updateRemainingTime();
    }

    #formatTime(hours, minutes, seconds) {
        let formatted = '-';
        if (hours > 0) {
            formatted += `${hours}:${minutes.toString().padStart(2, '0')}:`;
        } else {
            formatted += `${minutes}:`;
        }
        formatted += `${seconds.toString().padStart(2, '0')}`;
        return formatted;
    }
}

(function() {
    'use strict';

    setTimeout(function() {
        const head = document.querySelector('head');
        injectStyle(head);
        injectFontAwesome(head);

        const video = document.querySelector('video');
        const moviePlayer = document.querySelector('#movie_player');
        const remainingTime = document.createElement('span');
        remainingTime.classList.add('label-time-remaining');

        const remainingTimeController = new RemainingTimeController(video, remainingTime, moviePlayer);

        let currentSpeed = video.playbackRate;

        video.onmouseenter = (e) => {
            if (video.paused) return;
            remainingTimeController.startUpdating();
        };
        video.onmousemove = (e) => {
            if (video.paused) return;
            remainingTimeController.startUpdating();
        };
        video.onplay = (e) => { remainingTimeController.startUpdating(); };
        video.onpause = (e) => { remainingTimeController.stopUpdating(); };
        video.onseeked = (e) => { remainingTimeController.startUpdating(); };

        function updateSpeed(targetSpeed) {
            const speed = Math.min(Math.max(targetSpeed, MIN_SPEED), MAX_SPEED);
            currentSpeed = speed;
            video.playbackRate = speed;
            speedBtn.innerHTML = speed;
            fullscreenSpeedBtn.innerHTML = speed;
            remainingTimeController.updateRemainingTime();
        }

        function increaseSpeed() {
            updateSpeed(video.playbackRate + INCREASE_STEP);
        }

        function decreaseSpeed() {
            updateSpeed(video.playbackRate - DECREASE_STEP);
        }

        function resetSpeed() {
            updateSpeed(DEFAULT_SPEED);
        }

        function togglePip() {
            if (!document.pictureInPictureEnabled) {
                alert('Picture-in-picture mode not available.');
                return;
            }
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture();
            } else {
                video.requestPictureInPicture();
            }
        }

        window.addEventListener('keydown', (e) => {
            const key = e.keyCode;

            if (e.ctrlKey && e.altKey) {
                if (key === CODE_ARROW_UP) {
                    increaseSpeed();
                } else if (key === CODE_ARROW_DOWN) {
                    decreaseSpeed();
                }
            }
        });

        document.addEventListener('fullscreenchange', (e) => {
            if (document.fullscreenElement) {
                fullscreenBtnContainer.classList.remove('hidden');
            } else {
                fullscreenBtnContainer.classList.add('hidden');
            }
        });

        const speedBtn = buildButton(video.playbackRate, resetSpeed);
        const decreaseSpeedBtn = buildIconButton(['fas', 'fa-minus'], decreaseSpeed);
        const increaseSpeedBtn = buildIconButton(['fas', 'fa-plus'], increaseSpeed);

        const fullscreenSpeedBtn = buildButton(video.playbackRate, resetSpeed);
        const fullscreenDecreaseSpeedBtn = buildIconButton(['fas', 'fa-minus'], decreaseSpeed);
        const fullscreenIncreaseSpeedBtn = buildIconButton(['fas', 'fa-plus'], increaseSpeed);

        const pipBtn = buildIconButton(['fas', 'fa-clone'], togglePip);
        pipBtn.classList.add('last-btn');

        const btnParent = document.querySelector('#end');
        btnParent.prepend(pipBtn);
        btnParent.prepend(decreaseSpeedBtn);
        btnParent.prepend(increaseSpeedBtn);
        btnParent.prepend(speedBtn);

        const fullscreenBtnContainer = document.createElement('div');
        fullscreenBtnContainer.classList.add('hidden', 'fullscreen-btn-container', 'ytp-chrome-bottom');
        fullscreenBtnContainer.appendChild(fullscreenSpeedBtn);
        fullscreenBtnContainer.appendChild(fullscreenIncreaseSpeedBtn);
        fullscreenBtnContainer.appendChild(fullscreenDecreaseSpeedBtn);
        const fullscreenParent = document.querySelector('.html5-video-player');
        fullscreenParent.appendChild(fullscreenBtnContainer);

        const remainingTimeParent = document.querySelector('.ytp-time-display');
        remainingTimeParent.appendChild(remainingTime);

        updateSpeed(INITIAL_SPEED);
    }, TIMEOUT);
})();
