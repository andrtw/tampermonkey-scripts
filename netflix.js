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
    const url = new URL('search/' + type, TRAKT_API_URL);
    url.searchParams.append('query', title);
    const response = await traktRequest(url, { method: 'GET' });
    return response.json();
}

async function onDetailsOpened() {
    function getSearchType() {
        const isTvSeries = document.querySelector('.previewModal--section-header.episodeSelector-label') !== null;
        if (isTvSeries) {
            return 'show';
        } else {
            return 'movie';
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

    const type = getSearchType();
    const title = document.querySelector('.about-header strong').textContent;
    const results = await searchTrakt(type, title);

    const container = document.createElement('div');
    container.classList.add('previewModal--tags');

    const traktLogo = document.createElement('div');
    traktLogo.classList.add('ttv-logo');

    const traktLink = document.createElement('a');
    traktLink.classList.add('tag-item', 'ttv-link');
    traktLink.target = '_blank';

    if (results && results.length) {
        const slug = results[0][type].ids.slug;
        traktLink.href = `https://trakt.tv/${getUrlPathFromType(type)}/${slug}`;
    } else {
        const titleQuery = encodeURIComponent(title);
        traktLink.href = `https://trakt.tv/search?query=${titleQuery}`;
    }

    traktLink.appendChild(traktLogo);
    traktLink.appendChild(document.createTextNode('Trakt'));
    container.appendChild(traktLink);

    const parent = document.querySelector('.previewModal--detailsMetadata-info div');
    parent.appendChild(container);
}

const URLS_HANDLER = {
    '^https://www.netflix.com/\\S+jbv=\\S+$': onDetailsOpened,
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
