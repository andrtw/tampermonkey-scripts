// ==UserScript==
// @name         Netflix
// @namespace    http://tampermonkey.net/
// @version      2023-12-21
// @description  try to take over the world!
// @author       You
// @match        https://www.netflix.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=netflix.com
// @grant        none
// ==/UserScript==

const TRAKT_API_KEY = 'YOUR_API_KEY';
const TRAKT_API_URL = 'https://api.trakt.tv';

function injectStyle(headElem) {
    const css = `
.ttv-logo {
  margin-right: 4px;
  width: 20px;
  height: 20px;
  background: url("https://walter.trakt.tv/hotlink-ok/public/favicon.svg");
  filter: invert(26%) sepia(87%) saturate(2019%) hue-rotate(345deg) brightness(94%) contrast(82%);
}
.ttv-link {
  display: inline-flex;
  align-items: center;
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

function waitForElement(selector, predicate) {
    function ensurePredicate(elem) {
        if (!predicate) return true;
        return predicate(elem);
    }

    return new Promise(resolve => {
        const elem = document.querySelector(selector);
        if (elem && ensurePredicate(elem)) {
            return resolve(elem);
        }

        const observer = new MutationObserver(mutations => {
            const elem = document.querySelector(selector);
            if (elem && ensurePredicate(elem)) {
                observer.disconnect();
                resolve(elem);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    });
}

function traktRequest(url, config) {
    const c = {
        ...config,
        headers: {
            ...config.headers,
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': TRAKT_API_KEY,
        },
    };
    return fetch(url, c);
}

async function searchTrakt(type, title) {
    const url = new URL(`search/${type}`, TRAKT_API_URL);
    url.searchParams.append('query', title);
    const response = await traktRequest(url, { method: 'GET' });
    return response.json();
}

async function getRating(type, slug) {
    const url = new URL(`${type}/${slug}/ratings`, TRAKT_API_URL);
    const response = await traktRequest(url, { method: 'GET' });
    return response.json();
}

async function onDetailsOpened() {
    async function getSearchType() {
        const durationElem = await waitForElement('.videoMetadata--container .duration');
        const duration = durationElem.textContent;
        const isMovie = /^\dh \d{1,2}m$/.test(duration);
        if (isMovie) {
            return 'movie';
        } else {
            return 'show';
        }
    }

    function getUrlPathFromType(type) {
        switch (type) {
            case 'show':
                return 'shows';
            case 'movie':
                return 'movies';
            default:
                throw new Error('Cannot get url path from type');
        }
    }

    const type = await getSearchType();
    const titleElem = await waitForElement('.about-header strong', (elem) => elem?.textContent);
    const title = titleElem.textContent;
    const results = await searchTrakt(type, title);

    const traktLogo = document.createElement('div');
    traktLogo.classList.add('ttv-logo');

    const traktLink = document.createElement('a');
    traktLink.classList.add('tag-item', 'ttv-link');
    traktLink.target = '_blank';
    traktLink.appendChild(traktLogo);

    if (results && results.length) {
        const slug = results[0][type].ids.slug;
        const typeUrlPath = getUrlPathFromType(type);
        const rating = await getRating(typeUrlPath, slug);
        const ratingPerc = Math.floor(rating.rating * 10);
        traktLink.href = `https://trakt.tv/${typeUrlPath}/${slug}`;
        traktLink.appendChild(document.createTextNode(`Trakt | ${ratingPerc}%`));
    } else {
        const titleQuery = encodeURIComponent(title);
        traktLink.href = `https://trakt.tv/search?query=${titleQuery}`;
        traktLink.appendChild(document.createTextNode('Trakt'));
    }

    const container = document.createElement('div');
    container.classList.add('previewModal--tags');
    container.appendChild(traktLink);

    const parent = document.querySelector('.previewModal--detailsMetadata-info div');
    parent.appendChild(container);
}

const URLS_HANDLER = {
    '^https://www.netflix.com/\\S+jbv=\\S+$': onDetailsOpened,
    '^https://www.netflix.com/title/\\S+$': onDetailsOpened,
};

(function() {
    'use strict';

    const head = document.querySelector('head');
    injectStyle(head);

    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            onUrlChange(lastUrl);
        }
    }).observe(document, {subtree: true, childList: true});

    function onUrlChange(url) {
        for (const [regex, handler] of Object.entries(URLS_HANDLER)) {
            if (new RegExp(regex).test(url)) {
                handler();
                break;
            }
        }
    }

    onUrlChange(location.href);
})();
