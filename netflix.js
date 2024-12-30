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

// Sometimes multiple movies with the same title are available, the only difference is the release year
// which is reflected in the movie slug, eg: my-movie-1996 and my-movie-2024.
// This flag tries to find the best match taking into account the release year too.
const USE_LOOKUP_BY_YEAR = true;

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

function arrayEquals(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((value, index) => value === b[index])
  );
}

function traktRequest(url, config) {
  const c = {
    ...config,
    headers: {
      ...config.headers,
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": TRAKT_API_KEY,
    },
  };
  return fetch(url, c);
}

async function searchTrakt(type, title) {
  const url = new URL(`search/${type}`, TRAKT_API_URL);
  url.searchParams.append("query", title);
  const response = await traktRequest(url, { method: "GET" });
  return response.json();
}

async function getRating(type, slug) {
  const url = new URL(`${type}/${slug}/ratings`, TRAKT_API_URL);
  const response = await traktRequest(url, { method: "GET" });
  return response.json();
}

async function getSeasons(slug) {
  const url = new URL(`shows/${slug}/seasons?extended=full`, TRAKT_API_URL);
  const response = await traktRequest(url, { method: "GET" });
  return response.json();
}

async function getPeople(type, slug) {
  const url = new URL(`${type}/${slug}/people`, TRAKT_API_URL);
  const response = await traktRequest(url, { method: "GET" });
  return response.json();
}

function buildTraktLink(href, rating, votes) {
  function formatVotesNumber(votes) {
    let factor = 0;
    if (votes >= 100000) {
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
    const isMovie = /^\dh(\s\d{1,2}m)?$/.test(duration);
    if (isMovie) {
      return TYPE_MOVIE;
    } else {
      return TYPE_SHOW;
    }
  }

  async function getYear() {
    const yearElem = await waitForElement(".videoMetadata--container .year");
    return parseInt(yearElem.textContent);
  }

  async function getCreators() {
    const creatorElems = await waitForElements(
      '.about-container [data-uia="previewModal--tags-person"]',
    );
    return (
      Array.from(creatorElems)
        .find((e) => /^Creators/.test(e.textContent))
        ?.textContent?.replace(/^Creators:\s/, "")
        ?.split(/,\s/) ?? []
    );
  }

  const type = await getSearchType();
  const urlPath = TRAKT_URL_PATHS[type];
  const year = await getYear();
  const titleElem = await waitForElement(
    ".about-header strong",
    (elem) => elem?.textContent,
  );
  const title = titleElem.textContent;
  const results = await searchTrakt(type, title);

  let traktLink;
  if (results && results.length) {
    let result = results[0];
    // TODO: remove
    if (USE_LOOKUP_BY_YEAR) {
      switch (type) {
        case TYPE_SHOW: {
          // Do not use year lookup for shows, as the year displayed is the last season's year but the year returned by APIs is the release year
          //result = results[0];
          const creators = await getCreators();
          creators.sort();
          console.log("netflix creators", creators);
          for (const r of results) {
            const slug = r[type].ids.slug;
            const people = await getPeople(urlPath, slug);
            const traktCreators = people?.crew?.["created by"];
            const traktCreatorsNames =
              traktCreators?.map((c) => c.person.name) ?? [];
            console.log("trakt creators", traktCreatorsNames);
            const found = arrayEquals(creators, traktCreatorsNames.sort());
            if (found) {
              console.log("result found", r);
              result = r;
              break;
            }
          }
          break;
        }
        case TYPE_MOVIE: {
          result = results.find((r) => r[type].year == year);
          break;
        }
        default:
          throw new Error(`Unknown type ${type}`);
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
