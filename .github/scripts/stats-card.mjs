// Renders the GitHub stats card shown in the profile README.
// github-readme-stats only counts stars on repos you own, so this sums owned
// (non-fork) repo stars plus the repos listed in EXTRA_REPOS, e.g. "S4US/Roqer".
// Usage: GITHUB_TOKEN=... GITHUB_USER=... EXTRA_REPOS="owner/name,..." node stats-card.mjs out.svg

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const token = process.env.GITHUB_TOKEN;
const user = process.env.GITHUB_USER;
const extraRepos = (process.env.EXTRA_REPOS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const outPath = process.argv[2] || "stats.svg";

if (!token || !user) throw new Error("GITHUB_TOKEN and GITHUB_USER are required");

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  return json.data;
}

async function ownedStars() {
  let total = 0;
  let after = null;
  do {
    const { user: u } = await gql(
      `query($login: String!, $after: String) {
        user(login: $login) {
          repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false) {
            nodes { stargazerCount }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { login: user, after }
    );
    const repos = u.repositories;
    total += repos.nodes.reduce((sum, r) => sum + r.stargazerCount, 0);
    after = repos.pageInfo.hasNextPage ? repos.pageInfo.endCursor : null;
  } while (after);
  return total;
}

async function extraStars() {
  const counts = await Promise.all(
    extraRepos.map(async (full) => {
      const [owner, name] = full.split("/");
      const { repository } = await gql(
        `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { stargazerCount } }`,
        { owner, name }
      );
      return repository.stargazerCount;
    })
  );
  return counts.reduce((a, b) => a + b, 0);
}

async function activity() {
  const { user: u } = await gql(
    `query($login: String!) {
      user(login: $login) {
        contributionsCollection { totalCommitContributions restrictedContributionsCount }
        pullRequests { totalCount }
        issues { totalCount }
        repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) { totalCount }
      }
    }`,
    { login: user }
  );
  return {
    commits: u.contributionsCollection.totalCommitContributions + u.contributionsCollection.restrictedContributionsCount,
    prs: u.pullRequests.totalCount,
    issues: u.issues.totalCount,
    contributedTo: u.repositoriesContributedTo.totalCount,
  };
}

const ICONS = {
  star: `<path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z"/>`,
  commit: `<path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>`,
  pr: `<path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>`,
  issue: `<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>`,
  repo: `<path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/>`,
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n.toLocaleString("en-US");

function render({ stars, commits, prs, issues, contributedTo }) {
  const rows = [
    ["star", "Total Stars Earned", stars],
    ["commit", "Total Commits (last year)", commits],
    ["pr", "Total PRs", prs],
    ["issue", "Total Issues", issues],
    ["repo", "Contributed to (last year)", contributedTo],
  ];
  const rowSvg = rows
    .map(
      ([icon, label, value], i) => `
  <g transform="translate(25, ${60 + i * 24})">
    <svg x="0" y="-12.5" width="16" height="16" viewBox="0 0 16 16" fill="#C4442A">${ICONS[icon]}</svg>
    <text x="25" y="0" class="label">${esc(label)}:</text>
    <text x="225" y="0" class="value">${fmt(value)}</text>
  </g>`
    )
    .join("");
  const note = extraRepos.length ? `Stars include ${extraRepos.join(", ")}` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="467" height="195" viewBox="0 0 467 195" role="img" aria-labelledby="title">
  <title id="title">${esc(user)}'s GitHub Stats: ${fmt(stars)} stars, ${fmt(commits)} commits, ${fmt(prs)} PRs</title>
  <style>
    text { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif; }
    .title { font-size: 18px; font-weight: 600; fill: #C4442A; }
    .label, .value { font-size: 14px; font-weight: 600; fill: #161616; }
    .note { font-size: 11px; fill: #161616; fill-opacity: 0.55; }
    .big { font-size: 26px; font-weight: 700; fill: #161616; }
    .small { font-size: 10px; font-weight: 600; fill: #C4442A; letter-spacing: 1.5px; }
  </style>
  <rect x="0.5" y="0.5" rx="4.5" width="466" height="194" fill="#FAFAF7" stroke="#DDD9D0"/>
  <text x="25" y="35" class="title">${esc(user)}'s GitHub Stats</text>
  ${rowSvg}
  <g transform="translate(385, 100)">
    <circle r="42" fill="none" stroke="#C4442A" stroke-opacity="0.18" stroke-width="6"/>
    <circle r="42" fill="none" stroke="#C4442A" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="263.9" stroke-dashoffset="66" transform="rotate(-90)"/>
    <text y="7" text-anchor="middle" class="big">${fmt(stars)}</text>
    <text y="23" text-anchor="middle" class="small">STARS</text>
  </g>
  ${note ? `<text x="25" y="182" class="note">${esc(note)}</text>` : ""}
</svg>
`;
}

const [own, extra, act] = await Promise.all([ownedStars(), extraStars(), activity()]);
const stats = { stars: own + extra, ...act };
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, render(stats));
console.log(`Wrote ${outPath}: owned stars ${own} + extra ${extra}`, act);
