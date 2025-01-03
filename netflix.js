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

const TRAKT_URL_PATHS = {
  [TYPE_MOVIE]: "movies",
  [TYPE_SHOW]: "shows",
};

/**
 * Minumin number of common cast members between Netflix and Trakt
 * for it to be considered the same show or movie.
 */
const CAST_SIZE_THRESHOLD = 3;

function injectStyle(headElem) {
  const css = `
.ttv-logo {
  margin-right: 4px;
  width: 20px;
  height: 20px;
  background: url("https://walter-r2.trakt.tv/hotlink-ok/public/2024/favicon.svg");
}
.ttv-link {
  display: inline-flex;
  align-items: center;
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
  const url = new URL(`search/${type}`, TRAKT_API_URL);
  url.searchParams.append("query", title);
  const response = await getTraktRequest(url);
  return response.json();
}

async function getRating(type, slug) {
  const url = new URL(`${type}/${slug}/ratings`, TRAKT_API_URL);
  const response = await traktRequest(url);
  return response.json();
}

async function getSeasons(slug) {
  const url = new URL(`shows/${slug}/seasons?extended=full`, TRAKT_API_URL);
  const response = await traktRequest(url);
  return response.json();
}

async function getPeople(type, slug) {
  const url = new URL(`${type}/${slug}/people`, TRAKT_API_URL);
  const response = await traktRequest(url);
  return response.json();
}
//#endregion

function buildTraktLink(href, rating, votes) {
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

  const traktLink = document.createElement("a");
  traktLink.classList.add("tag-item", "ttv-link");
  traktLink.target = "_blank";
  traktLink.href = href;

  const traktLogo = document.createElement("div");
  traktLogo.classList.add("ttv-logo");
  traktLink.appendChild(traktLogo);

  const infoList = [];
  if (rating) {
    infoList.push(`${rating}%`);
  }
  if (votes) {
    infoList.push(`${formatVotesNumber(votes)} votes`);
  }

  let text = "Trakt";
  if (infoList.length) {
    const info = infoList.join(" · ");
    text += " | " + info;
  }

  traktLink.appendChild(document.createTextNode(text));
  return traktLink;
}

async function onDetailsOpened() {
  async function getSearchType() {
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

  const type = await getSearchType();
  const urlPath = TRAKT_URL_PATHS[type];
  const titleElem = await waitForElement(
    ".about-header strong",
    (elem) => elem?.textContent,
  );
  const title = titleElem.textContent;
  const results = await searchTrakt(type, title.toLowerCase());

  let traktLink;
  if (results && results.length) {
    let result = results[0];

    if (type === TYPE_SHOW) {
      const netflixCreators = await getCreators();
      netflixCreators.sort();

      const netflixCast = await getCast();

      if (netflixCreators.length || netflixCast.length) {
        for (const res of results) {
          const slug = res[type].ids.slug;
          const people = await getPeople(urlPath, slug);

          if (netflixCreators.length) {
            const traktCreators =
              people?.crew?.["created by"]?.map((c) =>
                normalizeString(c.person.name),
              ) ?? [];
            console.log("creators", traktCreators);
            if (arrayEquals(netflixCreators, traktCreators.sort())) {
              result = res;
              console.log("found by creators", result);
              break;
            }
          }

          if (netflixCast.length) {
            const traktCast =
              people?.cast?.map((c) => normalizeString(c.person.name)) ?? [];
            console.log("cast", traktCast);
            // Why intersection rather than equality? Netflix and Trakt casts might not exactly match
            // and some cast members might be left out from one or the other.
            // People's names might be incomplete (missing middle name), or have an abbreviated middle
            // or last names.
            const castIntersection = arrayIntersection(netflixCast, traktCast);
            console.log("cast intersection", castIntersection);

            const castMatchesExactly =
              castIntersection.length === netflixCast.length;
            const castMatchesEnough =
              castIntersection.length >= CAST_SIZE_THRESHOLD;

            if (castMatchesExactly || castMatchesEnough) {
              result = res;
              console.log("found by cast", result);
              break;
            }
          }
        }
      }
    }

    const slug = result[type].ids.slug;

    const ratingRes = await getRating(urlPath, slug);
    const ratingPerc = Math.floor(ratingRes.rating * 10);

    traktLink = buildTraktLink(
      `https://trakt.tv/${urlPath}/${slug}`,
      ratingPerc,
      ratingRes.votes,
    );
  } else {
    const titleQuery = encodeURIComponent(title);
    traktLink = buildTraktLink(
      `https://trakt.tv/search?query=${titleQuery}`,
      null,
      null,
    );
  }

  const container = document.createElement("div");
  container.classList.add("previewModal--tags");
  container.appendChild(traktLink);

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
