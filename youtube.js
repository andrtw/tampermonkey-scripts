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
    let css = `.mybtn {
width: 32px;
height: 32px;
min-width: 32px;
min-height: 32px;
font-size: 8px;
background: #181818;
margin: 4px;
outline: none;
border: none;
color: #fff;
border-radius: 2px;
cursor: pointer;
}`;
    css += `.mybtn:hover { background: #141414; }`;
    css += '.mybtn:active { background: #101010; }';
    css += '.label-speed { color: #fff; margin: 4px; cursor: pointer; }';
    css += '.label-speed-fullscreen { width: 54px !important; height: 63px !important; }';
    css += '.label-time-remaining { margin: 12px }';
    css += '.ytp-ad-overlay-container { display: none; }';

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
    btn.classList.add('mybtn');
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
            labelSpeedFullscreen.innerHTML = speed;
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

        const speedBtn = buildButton(video.playbackRate, resetSpeed);
        const decreaseSpeedBtn = buildIconButton(['fas', 'fa-minus'], decreaseSpeed);
        const increaseSpeedBtn = buildIconButton(['fas', 'fa-plus'], increaseSpeed);

        const pipBtn = buildIconButton(['fas', 'fa-clone'], togglePip);

        const labelSpeedFullscreen = document.createElement('button');
        labelSpeedFullscreen.classList.add('label-speed-fullscreen', 'ytp-watch-later-button', 'ytp-button');
        labelSpeedFullscreen.onclick = () => resetSpeed();
        labelSpeedFullscreen.appendChild(document.createTextNode(video.playbackRate));

        const defaultParent = document.querySelector('#end');
        const defaultFullscreenParent = document.querySelector('.ytp-chrome-top-buttons');
        const remainingTimeParent = document.querySelector('.ytp-time-display');
        defaultParent.prepend(pipBtn);
        defaultParent.prepend(decreaseSpeedBtn);
        defaultParent.prepend(increaseSpeedBtn);
        defaultParent.prepend(speedBtn);
        defaultFullscreenParent.prepend(labelSpeedFullscreen);
        remainingTimeParent.appendChild(remainingTime);

        updateSpeed(INITIAL_SPEED);
    }, TIMEOUT);
})();
