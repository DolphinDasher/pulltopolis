import "./styles.css";

import type { TownRepositoryV1, TownSnapshot } from "../shared/town-snapshot.js";
import {
  generateReadmeTownCard,
  readmeTownCardFilename,
  readmeTownCardMarkdown,
} from "./readme-card.js";
import { mountTownRenderer, TOWN_VIEWPORT } from "./town/index.js";
import { cacheStatusLabel, fetchTown, townErrorMessage } from "./town-api.js";

type District = "owned" | "contributed";
interface RepositoryEntry {
  district: District;
  repository: TownRepositoryV1;
}

const form = requireElement<HTMLFormElement>("town-search");
const input = requireElement<HTMLInputElement>("github-login");
const submit = requireElement<HTMLButtonElement>(form.querySelector("button[type='submit']"));
const status = requireElement<HTMLDivElement>("request-status");
const view = requireElement<HTMLElement>("town-view");
const heading = requireElement<HTMLHeadingElement>("town-heading");
const freshness = requireElement<HTMLParagraphElement>("snapshot-freshness");
const canvas = requireElement<HTMLCanvasElement>("town-canvas");
const motionToggle = requireElement<HTMLInputElement>("reduce-motion");
const profileSummary = requireElement<HTMLElement>("profile-summary");
const contributionSummary = requireElement<HTMLElement>("contribution-summary");
const repositoryGroups = requireElement<HTMLDivElement>("repository-groups");
const repositoryDetail = requireElement<HTMLElement>("repository-detail");
const cardPreview = requireElement<HTMLImageElement>("town-card-preview");
const cardMarkdown = requireElement<HTMLElement>("town-card-markdown");
const cardFeedback = requireElement<HTMLParagraphElement>("town-card-feedback");
const downloadCard = requireElement<HTMLAnchorElement>("download-town-card");
const copyCardMarkdown = requireElement<HTMLButtonElement>("copy-town-card-markdown");
const mediaMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const canvasFrame = requireElement<HTMLElement>(canvas.parentElement);

let snapshot: TownSnapshot | null = null;
let repositoryButtons: HTMLButtonElement[] = [];
let activeRequest: AbortController | null = null;
let cardObjectUrl: string | null = null;

motionToggle.checked = mediaMotion.matches;
const renderer = mountTownRenderer(canvas, {
  reducedMotion: motionToggle.checked,
  onRepositorySelect: selectRepository,
});
const canvasResizeObserver = new ResizeObserver(sizeCanvasAtIntegerScale);
canvasResizeObserver.observe(canvasFrame);

motionToggle.addEventListener("change", () => renderer.setReducedMotion(motionToggle.checked));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  void loadTown(input.value);
});
downloadCard.addEventListener("click", () => {
  if (!snapshot || cardObjectUrl === null) return;
  cardFeedback.textContent = `${downloadCard.download} is ready to commit beside your README.`;
});
copyCardMarkdown.addEventListener("click", () => void copyReadmeCardMarkdown());

const initialLogin = new URL(window.location.href).searchParams.get("user");
if (initialLogin) {
  input.value = initialLogin;
  void loadTown(initialLogin);
}

async function loadTown(login: string): Promise<void> {
  activeRequest?.abort();
  const request = new AbortController();
  activeRequest = request;
  view.hidden = true;
  snapshot = null;
  resetReadmeCard();
  selectRepository(null);
  setBusy(true);
  announce(`Building ${login.trim()}'s town…`);

  try {
    const result = await fetchTown(login, fetch, request.signal);
    if (activeRequest !== request) return;
    snapshot = result.snapshot;
    const normalizedLogin = snapshot.profile.login;
    input.value = normalizedLogin;
    history.replaceState(null, "", `?user=${encodeURIComponent(normalizedLogin)}`);
    renderer.setSnapshot(snapshot);
    heading.textContent = `${snapshot.profile.name || normalizedLogin}'s repository town`;
    freshness.textContent = `${cacheStatusLabel(result.cacheStatus)} · ${formatTimestamp(snapshot.asOf)}`;
    canvas.setAttribute(
      "aria-label",
      `${normalizedLogin}'s repository town with ${repositoryEntries(snapshot).length} visible buildings. Use the repository buttons after the canvas to inspect them.`,
    );
    renderProfile(snapshot);
    renderContributionSummary(snapshot);
    renderRepositoryDirectory(snapshot);
    renderReadmeCard(snapshot);
    view.hidden = false;
    sizeCanvasAtIntegerScale();
    status.classList.remove("is-error");
    announce(`Welcome to ${normalizedLogin}'s town.`);

    const first = repositoryEntries(snapshot)[0]?.repository.githubId ?? null;
    selectRepository(first);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    status.classList.add("is-error");
    announce(townErrorMessage(error));
  } finally {
    if (activeRequest === request) setBusy(false);
  }
}

function renderReadmeCard(town: TownSnapshot): void {
  releaseCardObjectUrl();
  const svg = generateReadmeTownCard(town);
  cardObjectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  cardPreview.src = cardObjectUrl;
  cardPreview.alt = `README town card preview for @${town.profile.login}`;
  downloadCard.href = cardObjectUrl;
  downloadCard.download = readmeTownCardFilename(town);
  downloadCard.setAttribute("aria-disabled", "false");
  cardMarkdown.textContent = readmeTownCardMarkdown(town);
  cardFeedback.textContent = "";
  copyCardMarkdown.disabled = false;
}

function resetReadmeCard(): void {
  downloadCard.removeAttribute("href");
  downloadCard.removeAttribute("download");
  downloadCard.setAttribute("aria-disabled", "true");
  releaseCardObjectUrl();
  cardPreview.removeAttribute("src");
  cardPreview.alt = "";
  cardMarkdown.textContent = "Load a town to generate its card.";
  cardFeedback.textContent = "";
  copyCardMarkdown.disabled = true;
}

async function copyReadmeCardMarkdown(): Promise<void> {
  if (!snapshot) return;
  try {
    if (!navigator.clipboard) throw new TypeError("Clipboard API unavailable");
    await clipboardWriteWithTimeout(readmeTownCardMarkdown(snapshot));
    cardFeedback.textContent = "Markdown copied. Keep the SVG beside your README or adjust the relative path.";
  } catch {
    cardFeedback.textContent = "Copy is unavailable here. Select the Markdown text above and copy it manually.";
  }
}

function clipboardWriteWithTimeout(value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new TypeError("Clipboard write timed out")),
      1_000,
    );
    navigator.clipboard.writeText(value).then(
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function releaseCardObjectUrl(): void {
  if (cardObjectUrl === null) return;
  URL.revokeObjectURL(cardObjectUrl);
  cardObjectUrl = null;
}

function sizeCanvasAtIntegerScale(): void {
  const availableWidth = canvasFrame.clientWidth;
  const scale = Math.max(1, Math.floor(availableWidth / TOWN_VIEWPORT.width));
  canvas.style.width = `${TOWN_VIEWPORT.width * scale}px`;
  canvas.style.height = `${TOWN_VIEWPORT.height * scale}px`;
}

function renderProfile(town: TownSnapshot): void {
  const avatar = element("img", "profile-avatar");
  avatar.src = town.profile.avatarUrl;
  avatar.alt = "";
  avatar.width = 72;
  avatar.height = 72;

  const identity = element("div");
  identity.append(
    element("p", "eyebrow", "Town founder"),
    element("h2", "", town.profile.name || town.profile.login),
    element("p", "profile-login", `@${town.profile.login}`),
  );
  const identityRow = element("div", "profile-identity");
  identityRow.append(avatar, identity);

  const stats = element("dl", "profile-stats");
  addStat(stats, formatNumber(town.economy.starlightEarned), "Starlight earned");
  addStat(stats, formatNumber(town.profile.followers), "Followers");
  addStat(stats, formatNumber(town.contributions.totals.allContributions), "Year contributions");
  addStat(stats, String(repositoryEntries(town).length), "Visible buildings");

  profileSummary.replaceChildren(identityRow, stats);
}

function renderContributionSummary(town: TownSnapshot): void {
  const activeDays = town.contributions.days.filter((day) => day.intensity > 0).length;
  const range = `${formatDate(town.contributions.window.from)} – ${formatDate(town.contributions.window.to)}`;
  const legend = element("p", "garden-legend", "Garden intensity: calm 0 · active 1 · growing 2 · lively 3 · radiant 4");
  contributionSummary.replaceChildren(
    element("p", "eyebrow", "Contribution garden"),
    element("h2", "", `${formatNumber(town.contributions.totals.allContributions)} contributions`),
    element("p", "garden-range", range),
    element("p", "", `${formatNumber(activeDays)} active days in the 365-day garden.`),
    legend,
  );
}

function renderRepositoryDirectory(town: TownSnapshot): void {
  repositoryButtons = [];
  repositoryGroups.replaceChildren(
    districtGroup("owned", town.districts.owned.repositories, town.districts.owned.overflowRepositoryCount),
    districtGroup(
      "contributed",
      town.districts.contributed.repositories,
      town.districts.contributed.overflowRepositoryCount,
    ),
  );
}

function districtGroup(
  district: District,
  repositories: TownRepositoryV1[],
  overflow: number,
): HTMLElement {
  const section = element("section", "repository-group");
  const title = element("h3", "", district === "owned" ? "Owned district" : "Contributed district");
  const hint = element(
    "p",
    "group-hint",
    district === "owned"
      ? "Public, non-fork repositories selected for this town."
      : "Repositories GitHub reports as recently contributed to.",
  );
  const list = element("div", "repository-list");

  for (const repository of repositories) {
    const button = element("button", "repository-button");
    button.type = "button";
    button.dataset.repositoryId = repository.githubId;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute(
      "aria-label",
      `${repository.name}, ${formatNumber(repository.stars)} stars, ${repository.recencyTier}`,
    );
    button.append(
      element("span", "repository-name", repository.name),
      element("span", "repository-meta", `★ ${formatNumber(repository.stars)} · ${recencyLabel(repository)}`),
    );
    button.addEventListener("click", () => selectRepository(repository.githubId));
    button.addEventListener("keydown", moveBetweenRepositoryButtons);
    repositoryButtons.push(button);
    list.append(button);
  }

  if (repositories.length === 0) list.append(element("p", "empty-group", "No buildings in this district."));
  if (overflow > 0) {
    list.append(element("p", "overflow-count", `+ ${formatNumber(overflow)} more represented beyond the scene`));
  }
  section.append(title, hint, list);
  return section;
}

function selectRepository(githubId: string | null): void {
  renderer.setSelectedRepository(githubId);
  for (const button of repositoryButtons) {
    const selected = button.dataset.repositoryId === githubId;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-selected", selected);
  }

  if (!snapshot || githubId === null) {
    repositoryDetail.replaceChildren(
      element("p", "", "Select a repository building to inspect its GitHub stats."),
    );
    return;
  }

  const entry = repositoryEntries(snapshot).find((item) => item.repository.githubId === githubId);
  if (!entry) return;
  renderRepositoryDetail(entry);
}

function renderRepositoryDetail(entry: RepositoryEntry): void {
  const repository = entry.repository;
  const eyebrow = element(
    "p",
    "eyebrow",
    `${entry.district === "owned" ? "Owned" : "Contributed"} district${repository.isArchived ? " · heritage building" : ""}`,
  );
  const title = element("h2", "", repository.name);
  const description = element(
    "p",
    "repository-description",
    repository.description || "No repository description provided.",
  );
  const stats = element("dl", "detail-stats");
  addStat(stats, formatNumber(repository.stars), "Stars");
  addStat(stats, recencyLabel(repository), "Activity");
  addStat(stats, formatNumber(repository.pullRequestsLifetime), "Pull requests");
  addStat(stats, formatNumber(repository.issuesLifetime), "Issues");

  const languages = [repository.languages.primary, ...repository.languages.secondary]
    .filter((language): language is NonNullable<typeof language> => language !== null)
    .map((language) => language.name)
    .join(", ");
  const mapping = element(
    "p",
    "mapping-note",
    `Building prominence tier ${repository.starProminenceTier} comes from its star band. ` +
      `${recencyLabel(repository)} ambience comes from repository-wide push recency.` +
      (languages ? ` Architecture accents represent ${languages}.` : " No language was reported."),
  );
  const link = element("a", "repository-link", "Open repository on GitHub ↗");
  link.href = repository.url;
  link.target = "_blank";
  link.rel = "noreferrer";

  repositoryDetail.replaceChildren(eyebrow, title, description, stats, mapping, link);
}

function repositoryEntries(town: TownSnapshot): RepositoryEntry[] {
  return [
    ...town.districts.owned.repositories.map((repository) => ({ district: "owned" as const, repository })),
    ...town.districts.contributed.repositories.map((repository) => ({
      district: "contributed" as const,
      repository,
    })),
  ];
}

function moveBetweenRepositoryButtons(event: KeyboardEvent): void {
  if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
  const current = repositoryButtons.indexOf(event.currentTarget as HTMLButtonElement);
  if (current < 0) return;
  event.preventDefault();
  const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
  const target = (current + direction + repositoryButtons.length) % repositoryButtons.length;
  repositoryButtons[target]?.focus();
}

function recencyLabel(repository: TownRepositoryV1): string {
  const labels = { active: "Active", warm: "Warm", quiet: "Quiet", resting: "Resting" };
  return labels[repository.recencyTier];
}

function addStat(list: HTMLDListElement, value: string, label: string): void {
  const group = element("div");
  group.append(element("dd", "", value), element("dt", "", label));
  list.append(group);
}

function setBusy(busy: boolean): void {
  form.setAttribute("aria-busy", String(busy));
  submit.disabled = busy;
  submit.textContent = busy ? "Building…" : "Build town";
}

function announce(message: string): void {
  status.textContent = message;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(value),
  );
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function requireElement<T extends Element>(idOrElement: string | Element | null): T {
  const candidate = typeof idOrElement === "string" ? document.getElementById(idOrElement) : idOrElement;
  if (!candidate) throw new Error(`Missing required UI element: ${String(idOrElement)}`);
  return candidate as T;
}

window.addEventListener("pagehide", () => {
  activeRequest?.abort();
  releaseCardObjectUrl();
  canvasResizeObserver.disconnect();
  renderer.destroy();
});
