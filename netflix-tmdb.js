// ==UserScript==
// @name         Netflix - TMDB
// @namespace    andrtw
// @version      1
// @author       andrtw
// @match        https://www.netflix.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=netflix.com
// @grant        none
// ==/UserScript==

const TMDB_READ_ACCESS_TOKEN = "YOU_ACCESS_TOKEN";

const ENTITY_MOVIE = "movie";
const ENTITY_SERIES = "series";

const TMDB_API_BASE_URL = "https://api.themoviedb.org";
const TMDB_API_VERSION = "3";
const TMDB_API_MOVIE_PATH = "movie";
const TMDB_API_SERIES_PATH = "tv";
const TMDB_API_PATHS = {
  [ENTITY_MOVIE]: TMDB_API_MOVIE_PATH,
  [ENTITY_SERIES]: TMDB_API_SERIES_PATH,
};

// #region DOM
function injectStyle(headElem) {
  const css = `
`;
  const style = document.createElement("style");
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

  return new Promise((resolve) => {
    const elem = document.querySelector(selector);
    if (elem && ensurePredicate(elem)) {
      return resolve(elem);
    }

    const observer = new MutationObserver(() => {
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
// #endregion

// #region TMDB
/**
 * Helper method for sending a request to the TMDB API.
 * By default, it adds common headers like content type
 * and authorization token.
 */
function tmdbRequest(url, config) {
  const c = {
    ...config,
    headers: {
      ...(config?.headers ?? {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${TMDB_READ_ACCESS_TOKEN}`,
    },
  };
  return fetch(url, c);
}

function tmdbUrl(path) {
  return `${TMDB_API_BASE_URL}/${TMDB_API_VERSION}/${path}`;
}
// #endregion

// #region Netflix
/**
 * Returns the type of the current entity: can be either "movie"
 * or "series".
 *
 * The value is used to different extents to differentiate between
 * the two types in the TMDB API.
 */
async function getEntityType() {
  const durationElem = await waitForElement(
    ".videoMetadata--container .duration",
  );
  const duration = durationElem.textContent;
  const isMovie = /^(\dh)?\s?(\d{1,2}m)?$$/.test(duration);
  if (isMovie) {
    return ENTITY_MOVIE;
  } else {
    return ENTITY_SERIES;
  }
}

async function getTitle() {
  const elem = await waitForElement(
    ".about-header strong",
    (elem) => elem?.textContent,
  );
  return elem.textContent;
}
// #endregion

async function search(entity, title) {
  const path = TMDB_API_PATHS[entity];
  const url = new URL(tmdbUrl(`search/${path}`));
  url.searchParams.append("query", title);
  const response = await tmdbRequest(url);
  const body = await response.json();
  return body?.results?.[0];
}

async function onDetailsOpened() {
  const entity = await getEntityType();
  const title = await getTitle();
  const result = await search(entity, title);
  if (result) {
    console.log(result.overview, result.vote_average, result.vote_count);
  } else {
    console.log("No results");
  }
}

const URLS_HANDLER = {
  "^https://www.netflix.com/\\S+jbv=\\S+$": onDetailsOpened,
  "^https://www.netflix.com/title/\\S+$": onDetailsOpened,
};

(function () {
  "use strict";

  const head = document.querySelector("head");
  injectStyle(head);

  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      onUrlChange(lastUrl);
    }
  }).observe(document, { subtree: true, childList: true });

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
