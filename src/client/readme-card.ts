import type { TownRepositoryV1, TownSnapshot } from "../shared/town-snapshot.js";

export const README_CARD_WIDTH = 800;
export const README_CARD_HEIGHT = 260;

const COLORS = {
  ink: "#17233d",
  inkSoft: "#43506b",
  paper: "#fffdf5",
  cream: "#fff3c5",
  sky: "#94d4e4",
  skyDeep: "#71b6d1",
  water: "#63b3cc",
  grass: "#8fcf8b",
  grassLight: "#b7df8c",
  grassDark: "#4f9561",
  coral: "#f17f72",
  coralDark: "#b94e55",
  gold: "#f6c65b",
  heritage: "#c9aa7d",
} as const;

const BUILDING_PALETTE = ["#ef8f7e", "#76b7c7", "#e2b85c", "#8fbf82", "#a98bc8", "#d58aac"];
const GARDEN_PALETTE = ["#d9edcb", "#b9dc9d", "#8fcf8b", "#65ae72", "#3f8559"];

interface CardRepository {
  district: "owned" | "contributed";
  repository: TownRepositoryV1;
}

export function generateReadmeTownCard(town: TownSnapshot): string {
  const login = town.profile.login;
  const founder = shorten(town.profile.name?.trim() || `@${login}`, 34);
  const repositories = cardRepositories(town);
  const languages = [...town.languageMix.weights]
    .sort((a, b) => b.bytes - a.bytes || compareText(a.name, b.name))
    .slice(0, 3)
    .map((language) => shorten(language.name, 16));
  const repositoryTotal =
    town.districts.owned.sourceRepositoryCount + town.districts.contributed.sourceRepositoryCount;
  const title = `${founder}'s PullTopolis town`;
  const description =
    `A deterministic repository town for @${login}, representing ${repositoryTotal} public repositories. ` +
    `${town.districts.contributed.sourceRepositoryCount} are GitHub-reported recently contributed-to repositories.`;
  const languageLine = languages.length > 0 ? languages.join(" · ") : "Public repository town";
  const snapshotDate = town.asOf.slice(0, 10);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${README_CARD_WIDTH}" height="${README_CARD_HEIGHT}" viewBox="0 0 ${README_CARD_WIDTH} ${README_CARD_HEIGHT}" role="img" aria-labelledby="pulltopolis-title pulltopolis-description" shape-rendering="crispEdges">`,
    `  <title id="pulltopolis-title">${escapeXml(title)}</title>`,
    `  <desc id="pulltopolis-description">${escapeXml(description)}</desc>`,
    `  <rect width="800" height="260" rx="12" fill="${COLORS.paper}"/>`,
    `  <rect x="3" y="3" width="794" height="254" rx="10" fill="none" stroke="${COLORS.ink}" stroke-width="6"/>`,
    `  <rect x="6" y="6" width="788" height="154" fill="${COLORS.sky}"/>`,
    `  <rect x="6" y="118" width="788" height="42" fill="${COLORS.skyDeep}"/>`,
    `  <path d="M6 160H794V254H6Z" fill="${COLORS.grass}"/>`,
    `  <path d="M6 160H794V169H6Z" fill="${COLORS.grassLight}"/>`,
    `  <path d="M6 160H794" stroke="${COLORS.ink}" stroke-width="4"/>`,
    `  <path d="M6 20H794M6 52H794M6 84H794M6 116H794M38 6V160M70 6V160M102 6V160M134 6V160M166 6V160M198 6V160M230 6V160M262 6V160M294 6V160M326 6V160M358 6V160M390 6V160M422 6V160M454 6V160M486 6V160M518 6V160M550 6V160M582 6V160M614 6V160M646 6V160M678 6V160M710 6V160M742 6V160M774 6V160" stroke="#ffffff" stroke-opacity="0.24"/>`,
    `  <rect x="715" y="20" width="36" height="36" fill="#fff3b2"/>`,
    `  <path d="M48 33H88M57 25H79M64 17H72" stroke="${COLORS.paper}" stroke-width="6" stroke-linecap="square"/>`,
    `  <text x="30" y="43" fill="${COLORS.coralDark}" font-family="system-ui, sans-serif" font-size="13" font-weight="800" letter-spacing="2">PULLTOPOLIS TOWN CARD</text>`,
    `  <text x="30" y="78" fill="${COLORS.ink}" font-family="system-ui, sans-serif" font-size="25" font-weight="900">${escapeXml(title)}</text>`,
    `  <text x="30" y="104" fill="${COLORS.inkSoft}" font-family="system-ui, sans-serif" font-size="15" font-weight="700">@${escapeXml(login)} · snapshot ${escapeXml(snapshotDate)}</text>`,
    `  <rect x="30" y="122" width="274" height="31" fill="${COLORS.cream}" stroke="${COLORS.ink}" stroke-width="3"/>`,
    `  <text x="42" y="143" fill="${COLORS.ink}" font-family="system-ui, sans-serif" font-size="13" font-weight="800">${town.districts.owned.sourceRepositoryCount} owned · ${town.districts.contributed.sourceRepositoryCount} recently contributed</text>`,
    ...gardenTiles(town),
    `  <text x="30" y="229" fill="${COLORS.ink}" font-family="system-ui, sans-serif" font-size="13" font-weight="800">${escapeXml(languageLine)}</text>`,
    `  <text x="30" y="247" fill="${COLORS.inkSoft}" font-family="system-ui, sans-serif" font-size="11">${repositoryTotal} public repositories represented</text>`,
    `  <path d="M328 29L344 13L360 29V55H328Z" fill="${COLORS.coral}" stroke="${COLORS.ink}" stroke-width="4"/>`,
    `  <rect x="340" y="39" width="8" height="16" fill="${COLORS.gold}" stroke="${COLORS.ink}" stroke-width="2"/>`,
    ...repositories.map((entry, index) => buildingSvg(entry, index)),
    `  <path d="M326 218H780" stroke="${COLORS.ink}" stroke-width="4"/>`,
    `  <text x="566" y="244" fill="${COLORS.inkSoft}" font-family="system-ui, sans-serif" font-size="11" text-anchor="middle">Identity over leaderboard · public GitHub data</text>`,
    `</svg>`,
  ].join("\n");
}

export function readmeTownCardFilename(town: TownSnapshot): string {
  const login = town.profile.login.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  return `pulltopolis-${login || "town"}.svg`;
}

export function readmeTownCardMarkdown(town: TownSnapshot): string {
  return `![PullTopolis town for @${town.profile.login}](./${readmeTownCardFilename(town)})`;
}

function cardRepositories(town: TownSnapshot): CardRepository[] {
  return [
    ...town.districts.owned.repositories.map((repository) => ({ district: "owned" as const, repository })),
    ...town.districts.contributed.repositories.map((repository) => ({
      district: "contributed" as const,
      repository,
    })),
  ].sort(
    (a, b) =>
      (a.district === b.district ? 0 : a.district === "owned" ? -1 : 1) ||
      compareText(a.repository.githubId, b.repository.githubId),
  );
}

function buildingSvg(entry: CardRepository, index: number): string {
  const repository = entry.repository;
  const slotX = 365 + index * 33;
  const width = 22 + repository.starProminenceTier * 2;
  const height = 34 + repository.starProminenceTier * 9;
  const x = slotX + Math.floor((30 - width) / 2);
  const y = 216 - height;
  const roofY = y - 12;
  const color = repository.isArchived
    ? COLORS.heritage
    : BUILDING_PALETTE[stableHash(repository.languages.primary?.name || repository.name) % BUILDING_PALETTE.length];
  const windowColor =
    repository.recencyTier === "active" || repository.recencyTier === "warm"
      ? COLORS.gold
      : repository.recencyTier === "quiet"
        ? COLORS.cream
        : COLORS.sky;
  const monogram = shorten(repository.languages.primary?.name || repository.name, 1).toUpperCase();
  const districtMark = entry.district === "owned" ? COLORS.coralDark : COLORS.grassDark;

  return [
    `  <g data-repository-building="${escapeXml(repository.githubId)}">`,
    `    <path d="M${x - 4} ${y}L${x + Math.floor(width / 2)} ${roofY}L${x + width + 4} ${y}Z" fill="${COLORS.coral}" stroke="${COLORS.ink}" stroke-width="3"/>`,
    `    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" stroke="${COLORS.ink}" stroke-width="3"/>`,
    `    <rect x="${x + 5}" y="${y + 10}" width="7" height="7" fill="${windowColor}" stroke="${COLORS.ink}" stroke-width="2"/>`,
    `    <rect x="${x + width - 12}" y="${y + 10}" width="7" height="7" fill="${windowColor}" stroke="${COLORS.ink}" stroke-width="2"/>`,
    `    <rect x="${x + Math.floor(width / 2) - 4}" y="${y + height - 15}" width="8" height="15" fill="${COLORS.cream}" stroke="${COLORS.ink}" stroke-width="2"/>`,
    `    <rect x="${x + 2}" y="${y + height - 5}" width="${width - 4}" height="5" fill="${districtMark}"/>`,
    `    <text x="${x + Math.floor(width / 2)}" y="${y + 29}" fill="${COLORS.ink}" font-family="system-ui, sans-serif" font-size="9" font-weight="900" text-anchor="middle">${escapeXml(monogram)}</text>`,
    `  </g>`,
  ].join("\n");
}

function gardenTiles(town: TownSnapshot): string[] {
  const days = town.contributions.days.slice(-20);
  return days.map((day, index) => {
    const x = 30 + index * 14;
    return `  <rect x="${x}" y="174" width="10" height="10" fill="${GARDEN_PALETTE[day.intensity]}" stroke="${COLORS.ink}" stroke-width="1"/>`;
  });
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function shorten(value: string, length: number): string {
  const characters = Array.from(value.trim());
  return characters.length <= length ? characters.join("") : `${characters.slice(0, length - 1).join("")}…`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
