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

const TMDB_BASE_URL = "https://themoviedb.org";
const TMDB_API_BASE_URL = "https://api.themoviedb.org";
const TMDB_API_VERSION = "3";
const TMDB_API_MOVIE_PATH = "movie";
const TMDB_API_SERIES_PATH = "tv";
const TMDB_API_PATHS = {
  [ENTITY_MOVIE]: TMDB_API_MOVIE_PATH,
  [ENTITY_SERIES]: TMDB_API_SERIES_PATH,
};

const TMDB_LOGO_SVG =
  "https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg";

// #region DOM
function injectStyle(headElem) {
  const css = `
.tmdb-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tmdb-link {
  display: flex;
  flex-direction: row;
  gap: 4px;
}
.tmdb-link:hover {
  text-decoration: underline;
}
.tmdb-link .tmdb-logo {
  width: 100px;
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

function buildTmdbSummary(url, vote, voteCount, overview) {
  const container = document.createElement("div");
  container.classList.add("tmdb-summary");

  container.appendChild(
    buildTmdbLink(
      `${formatVote(vote)}% · ${formatVotesNumber(voteCount)} votes`,
      url,
    ),
  );

  const overviewElem = document.createElement("span");
  overviewElem.appendChild(document.createTextNode(overview));
  container.appendChild(overviewElem);

  return container;
}

function buildTmdbLink(text, url) {
  const link = document.createElement("a");
  link.classList.add("tmdb-link");
  link.target = "_blank";
  link.href = url;

  const logo = document.createElement("img");
  logo.src = TMDB_LOGO_SVG;
  logo.classList.add("tmdb-logo");

  link.appendChild(logo);
  link.appendChild(document.createTextNode(text));

  return link;
}

/**
 * Formats the number of votes according to the following rules:
 * - if the number is less than 1000, it shows it with no formatting
 * - if the number is more than 1000, it shows it in the "k" format
 *   with a precision of 100. Eg: 1.280 -> 1.3k
 * - if the number is more than 100.000, it shows it in the "k" format
 *   with a precision of 1000. Eg: 100.800 -> 101k
 */
function formatVotesNumber(votes) {
  let factor = 0;
  if (votes >= 100_000) {
    factor = 1000;
  } else if (votes >= 1000) {
    factor = 100;
  } else {
    return votes.toString();
  }
  const normalizedVotes = Math.round(votes / factor) * factor;
  return normalizedVotes.toString().replace(/(\d)\d{2}$/, (_, p1) => {
    if (p1 === "0") {
      return "k";
    } else {
      return `.${p1}k`;
    }
  });
}

/**
 * Formats the vote as an integer in the range 0-100.
 */
function formatVote(vote) {
  const perc = vote * 10;
  return Math.round(perc);
}

async function onDetailsOpened() {
  const entity = await getEntityType();
  const title = await getTitle();
  const result = await search(entity, title);

  let tmdbElem;
  if (result) {
    const url = `${TMDB_BASE_URL}/${TMDB_API_PATHS[entity]}/${result.id}`;
    tmdbElem = buildTmdbSummary(
      url,
      result.vote_average,
      result.vote_count,
      result.overview,
    );
  } else {
    console.log("No results");
  }

  const container = document.createElement("div");
  container.classList.add("previewModal--tags");
  container.appendChild(tmdbElem);

  const parent = document.querySelector(
    ".previewModal--detailsMetadata-info div",
  );
  parent.appendChild(container);
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
