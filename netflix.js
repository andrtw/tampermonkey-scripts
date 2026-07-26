// ==UserScript==
// @name         Netflix
// @namespace    andrtw
// @version      1
// @author       andrtw
// @match        https://www.netflix.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=netflix.com
// @grant        none
// ==/UserScript==

const TRAKT_API_KEY = "YOUR_API_KEY";
const TRAKT_API_URL = "https://api.trakt.tv";

const TYPE_MOVIE = "movie";
const TYPE_SHOW = "show";

const URL_PATH_MOVIE = "movies";
const URL_PATH_SHOW = "shows";

const TRAKT_URL_PATHS = {
  [TYPE_MOVIE]: URL_PATH_MOVIE,
  [TYPE_SHOW]: URL_PATH_SHOW,
};

/**
 * Minumin number of common cast members between Netflix and Trakt
 * for it to be considered the same show or movie.
 */
const CAST_SIZE_THRESHOLD = 3;

const TRAKT_LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#9f42c6" d="M48 11.26v25.47C48 42.95 42.95 48 36.73 48H11.26C5.04 48 0 42.95 0 36.73V11.26C0 5.04 5.04 0 11.26 0h25.47c3.32 0 6.3 1.43 8.37 3.72.47.52.89 1.08 1.25 1.68.18.29.34.59.5.89.33.68.6 1.39.79 2.14.1.37.18.76.23 1.15.09.54.13 1.11.13 1.68Z"/><path fill="#fff" d="m13.62 17.97 7.92 7.92 1.47-1.47-7.92-7.92-1.47 1.47Zm-.7.7-1.46 1.46 14.4 14.4 1.46-1.47L23 28.75 46.35 5.4c-.36-.6-.78-1.16-1.25-1.68L21.54 27.28l-8.62-8.61Zm15.09 13.7 1.47-1.46-2.16-2.16L47.64 8.43c-.19-.75-.46-1.46-.79-2.14L24.39 28.75l3.62 3.62ZM47.87 9.58 28.7 28.75l1.47 1.46L48 12.38v-1.12c0-.57-.04-1.14-.13-1.68ZM25.16 22.27l-7.92-7.92-1.47 1.47 7.92 7.92 1.47-1.47Zm16.16 12.85c0 3.42-2.78 6.2-6.2 6.2H12.88c-3.42 0-6.2-2.78-6.2-6.2V12.88c0-3.42 2.78-6.21 6.2-6.21h20.78V4.6H12.88c-4.56 0-8.28 3.71-8.28 8.28v22.24c0 4.56 3.71 8.28 8.28 8.28h22.24c4.56 0 8.28-3.71 8.28-8.28v-3.51h-2.07v3.51Z"/></svg>';

function injectStyle(headElem) {
  const css = `
.ttv-logo {
  margin-right: 4px;
  width: 20px;
  height: 20px;
}
.ttv-link {
  display: inline-flex;
  align-items: center;
}
.ttv-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
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

//#region DOM
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

function waitForElements(selector) {
  return new Promise((resolve) => {
    const elem = document.querySelectorAll(selector);
    if (elem) {
      return resolve(elem);
    }

    const observer = new MutationObserver(() => {
      const elem = document.querySelectorAll(selector);
      if (elem) {
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
//#endregion

//#region Utils
function arrayEquals(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((value, index) => value === b[index])
  );
}

function arrayIntersection(a, b) {
  const setA = new Set(a);
  return b.filter((value) => setA.has(value));
}

function normalizeString(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
//#endregion

//#region Trakt
/**
 * Helper method for sending a request to the Trakt API.
 * Adds common headers like the API version and API key.
 */
function traktRequest(url, config) {
  const c = {
    ...config,
    headers: {
      ...(config?.headers ?? {}),
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": TRAKT_API_KEY,
    },
  };
  return fetch(url, c);
}

/**
 * Helper method for sending a GET request to the Trakt API.
 */
function getTraktRequest(url) {
  return traktRequest(url, { method: "GET" });
}

async function searchTrakt(type, title) {
  const url = new URL(`search/${type}/exact`, TRAKT_API_URL);
  url.searchParams.append("query", title);
  const response = await getTraktRequest(url);
  return response.json();
}

async function getRating(type, slug) {
  const url = new URL(`${type}/${slug}/ratings`, TRAKT_API_URL);
  const response = await traktRequest(url);
  return response.json();
}

async function getPeople(type, slug) {
  const url = new URL(`${type}/${slug}/people`, TRAKT_API_URL);
  const response = await traktRequest(url);
  return response.json();
}
//#endregion

/**
 * Builds an SVG DOM element.
 */
function createSvg(svg) {
  const container = document.createElement("span");
  container.innerHTML = svg;
  return container.firstChild;
}

/**
 * Builds an anchor element with a Trakt logo leading icon.
 */
function buildTraktLink(text, url) {
  const traktLink = document.createElement("a");
  traktLink.classList.add("tag-item", "ttv-link");
  traktLink.target = "_blank";
  traktLink.href = url;

  const traktLogo = createSvg(TRAKT_LOGO);
  traktLogo.classList.add("ttv-logo");

  traktLink.appendChild(traktLogo);
  traktLink.appendChild(document.createTextNode(text));

  return traktLink;
}

function buildTraktSummary(url, rating, votes, overview) {
  const container = document.createElement("div");
  container.classList.add("ttv-summary");

  container.appendChild(
    buildTraktLink(`${rating}% · ${formatVotesNumber(votes)} votes`, url),
  );

  const overviewContainer = document.createElement("span");
  overviewContainer.appendChild(document.createTextNode(overview));
  container.appendChild(overviewContainer);

  return container;
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
 * Returns the type of the current entity: can be either "movie"
 * or "show".
 *
 * The value is used to different extents to differentiate between
 * the two types in the Trakt API.
 */
async function getEntityType() {
  const durationElem = await waitForElement(
    ".videoMetadata--container .duration",
  );
  const duration = durationElem.textContent;
  const isMovie = /^(\dh)?\s?(\d{1,2}m)?$$/.test(duration);
  if (isMovie) {
    return TYPE_MOVIE;
  } else {
    return TYPE_SHOW;
  }
}

/**
 * Returns a list of creator names as they appear on the Netflix detail page.
 */
async function getCreators() {
  const creatorElems = await waitForElements(
    '.about-container [data-uia="previewModal--tags-person"]',
  );
  return (
    Array.from(creatorElems)
      .find((e) => /^Creators/.test(e.textContent))
      ?.textContent?.replace(/^Creators:\s/, "")
      ?.split(/,\s/)
      ?.map((name) => normalizeString(name)) ?? []
  );
}

/**
 * Returns a list of cast members names as they appear on the Netflix detail page.
 */
async function getCast() {
  const castElems = await waitForElements(
    '.about-container [data-uia="previewModal--tags-person"]',
  );
  return (
    Array.from(castElems)
      .find((e) => /^Cast/.test(e.textContent))
      ?.textContent?.replace(/^Cast:\s/, "")
      ?.split(/,\s/)
      ?.map((name) => normalizeString(name)) ?? []
  );
}

/**
 * Attempts to find the best match in the given results array.
 *
 * Applies different techniques based on the entity type and
 * on the available data on both Netflix and Trakt.
 *
 * If all of the above fails, it falls back at returning the
 * first result in the list.
 */
async function findBestMatch(type, results) {
  if (results.length === 1) {
    return results[0];
  }

  if (type === TYPE_MOVIE) {
    return results[0];
  }

  if (type === TYPE_SHOW) {
    const bestMatch = await findBestShow(results);
    if (bestMatch) {
      return bestMatch;
    }
  }

  return results[0];
}

/**
 * Attempts to find the best match for a show.
 *
 * It compares various data provided by Netflix and Trakt
 * and tries to intersect it to find the best match.
 */
async function findBestShow(results) {
  const netflixCreators = await getCreators();
  netflixCreators.sort();
  console.log("Netflix creators", netflixCreators);

  const netflixCast = await getCast();
  console.log("Netflix cast", netflixCast);

  if (!netflixCreators.length && !netflixCast.length) {
    return results[0];
  }

  for (const res of results) {
    const slug = res[TYPE_SHOW].ids.slug;
    const traktPeople = await getPeople(URL_PATH_SHOW, slug);

    if (findBestShowByCreators(netflixCreators, traktPeople)) {
      console.log("Found by creators", res);
      return res;
    }
    if (findBestShowByCast(netflixCast, traktPeople)) {
      console.log("Found by cast", res);
      return res;
    }
  }

  return null;
}

function findBestShowByCreators(netflixCreators, traktPeople) {
  if (!netflixCreators) {
    return null;
  }

  const traktCreators =
    traktPeople?.crew?.["created by"]?.map((c) =>
      normalizeString(c.person.name),
    ) ?? [];
  console.log("Trakt creators", traktCreators);
  return arrayEquals(netflixCreators, traktCreators.sort());
}

function findBestShowByCast(netflixCast, traktPeople) {
  if (!netflixCast) {
    return;
  }

  const traktCast =
    traktPeople?.cast?.map((c) => normalizeString(c.person.name)) ?? [];
  console.log("Trakt cast", traktCast);
  // Why intersection rather than equality? Netflix and Trakt casts might not exactly match
  // and some cast members might be left out from one or the other.
  // People's names might be incomplete (missing middle name), or have an abbreviated middle
  // or last names.
  const intersection = arrayIntersection(netflixCast, traktCast);
  console.log("Cast intersection", intersection);

  const matchesExactly = intersection.length === netflixCast.length;
  const matchesEnough = intersection.length >= CAST_SIZE_THRESHOLD;

  return matchesExactly || matchesEnough;
}

async function onDetailsOpened() {
  const type = await getEntityType();
  const urlPath = TRAKT_URL_PATHS[type];
  const titleElem = await waitForElement(
    ".about-header strong",
    (elem) => elem?.textContent,
  );
  const title = titleElem.textContent;
  const results = await searchTrakt(type, title.toLowerCase());

  let traktElem;
  if (results && results.length) {
    const result = await findBestMatch(type, results);
    console.log("Best match", result);
    const slug = result[type].ids.slug;
    const overview = result[type].overview;
    const ratingRes = await getRating(urlPath, slug);
    const ratingPerc = Math.floor(ratingRes.rating * 10);

    traktElem = buildTraktSummary(
      `https://trakt.tv/${urlPath}/${slug}`,
      ratingPerc,
      ratingRes.votes,
      overview,
    );
  } else {
    const text = `Search "${title}" on Trakt`;
    const url = `https://trakt.tv/search?q=${encodeURIComponent(title)}`;
    traktElem = buildTraktLink(text, url);
  }

  const container = document.createElement("div");
  container.classList.add("previewModal--tags");
  container.appendChild(traktElem);

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
