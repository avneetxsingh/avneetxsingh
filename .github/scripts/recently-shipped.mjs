// Rewrites the "Recently Shipped" list in the README between the RECENT markers
// with the user's latest merged PRs on public repos (excluding this profile repo).
// Usage: GITHUB_TOKEN=... GITHUB_USER=... node recently-shipped.mjs README.md

import { readFileSync, writeFileSync } from "node:fs";

const token = process.env.GITHUB_TOKEN;
const user = process.env.GITHUB_USER;
const readmePath = process.argv[2] || "README.md";
const LIMIT = 5;
const START = "<!-- RECENT:START -->";
const END = "<!-- RECENT:END -->";

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

const { user: u } = await gql(
  `query($login: String!) {
    user(login: $login) {
      pullRequests(first: 30, states: MERGED, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes { title url mergedAt repository { nameWithOwner url isPrivate } }
      }
    }
  }`,
  { login: user }
);

const profileRepo = `${user}/${user}`.toLowerCase();
const prs = u.pullRequests.nodes
  .filter((pr) => !pr.repository.isPrivate && pr.repository.nameWithOwner.toLowerCase() !== profileRepo)
  .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt))
  .slice(0, LIMIT);

// Keep titles from breaking the markdown link or injecting HTML.
const clean = (s) => s.replace(/[\[\]<>]/g, "").replace(/\s+/g, " ").trim();
const day = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const lines = prs.length
  ? prs.map(
      (pr) => `* \`${day(pr.mergedAt)}\` · [${clean(pr.title)}](${pr.url}) in [${pr.repository.nameWithOwner}](${pr.repository.url})`
    )
  : ["* Nothing merged recently. Check back soon."];

const readme = readFileSync(readmePath, "utf8");
const start = readme.indexOf(START);
const end = readme.indexOf(END);
if (start === -1 || end === -1 || end < start) throw new Error(`Markers ${START} / ${END} not found in ${readmePath}`);

const next = `${readme.slice(0, start + START.length)}\n${lines.join("\n")}\n${readme.slice(end)}`;
writeFileSync(readmePath, next);
console.log(`Wrote ${prs.length} item(s) to ${readmePath}`);
