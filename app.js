import { clearItems, getAllItems, saveItem } from "./db.js";

const CATEGORIES = [
  "Materialer",
  "Verktøy",
  "Maskiner",
  "Inventar",
  "Kontorutstyr",
  "Deler",
  "Diverse",
];

const ACTIONS = ["Kast", "Selg", "Behold"];
const FILTERS = ["Alle", ...ACTIONS];

const state = {
  draft: {
    imageBlob: null,
    previewUrl: "",
    category: "",
  },
  items: [],
  filter: "Alle",
  deferredInstallPrompt: null,
  renderedImageUrls: [],
};

const elements = {
  captureView: document.querySelector("#captureView"),
  categoryView: document.querySelector("#categoryView"),
  actionView: document.querySelector("#actionView"),
  savedView: document.querySelector("#savedView"),
  overviewView: document.querySelector("#overviewView"),
  photoInput: document.querySelector("#photoInput"),
  draftPreview: document.querySelector("#draftPreview"),
  previewImage: document.querySelector("#previewImage"),
  categoryButtons: document.querySelector("#categoryButtons"),
  actionButtons: document.querySelector("#actionButtons"),
  selectedCategoryBadge: document.querySelector("#selectedCategoryBadge"),
  savedSummary: document.querySelector("#savedSummary"),
  backToCaptureButton: document.querySelector("#backToCaptureButton"),
  backToCategoryButton: document.querySelector("#backToCategoryButton"),
  nextObjectButton: document.querySelector("#nextObjectButton"),
  finishButton: document.querySelector("#finishButton"),
  showRegisterButton: document.querySelector("#showRegisterButton"),
  showOverviewButton: document.querySelector("#showOverviewButton"),
  statsGrid: document.querySelector("#statsGrid"),
  filterButtons: document.querySelector("#filterButtons"),
  reportSummary: document.querySelector("#reportSummary"),
  reportDate: document.querySelector("#reportDate"),
  itemsList: document.querySelector("#itemsList"),
  emptyState: document.querySelector("#emptyState"),
  itemCardTemplate: document.querySelector("#itemCardTemplate"),
  printButton: document.querySelector("#printButton"),
  clearDataButton: document.querySelector("#clearDataButton"),
  installButton: document.querySelector("#installButton"),
};

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}

function createObjectLabel(sequence) {
  return `Objekt #${String(sequence).padStart(3, "0")}`;
}

function getNextSequence() {
  const maxSequence = state.items.reduce((max, item) => Math.max(max, item.sequence || 0), 0);
  return maxSequence + 1;
}

function setVisibleView(viewName) {
  const allViews = ["captureView", "categoryView", "actionView", "savedView", "overviewView"];
  for (const name of allViews) {
    elements[name].classList.toggle("hidden", name !== viewName);
  }

  const registerActive = viewName !== "overviewView";
  elements.showRegisterButton.classList.toggle("active", registerActive);
  elements.showOverviewButton.classList.toggle("active", !registerActive);
}

function showRegisterCapture() {
  setVisibleView("captureView");
}

function showCategoryStep() {
  setVisibleView("categoryView");
}

function showActionStep() {
  elements.selectedCategoryBadge.textContent = state.draft.category;
  setVisibleView("actionView");
}

function showSavedStep(item) {
  elements.savedSummary.innerHTML = [
    `<p><strong>${createObjectLabel(item.sequence)}</strong></p>`,
    `<p>Kategori: ${item.category}</p>`,
    `<p>Handling: ${item.action}</p>`,
    `<p>Dato: ${item.date}</p>`,
    "<p>Bilde: Lagret</p>",
  ].join("");
  setVisibleView("savedView");
}

function showOverview() {
  renderOverview();
  setVisibleView("overviewView");
}

function resetDraft() {
  if (state.draft.previewUrl) {
    URL.revokeObjectURL(state.draft.previewUrl);
  }

  state.draft = {
    imageBlob: null,
    previewUrl: "",
    category: "",
  };

  elements.photoInput.value = "";
  elements.previewImage.removeAttribute("src");
  elements.draftPreview.classList.add("hidden");
}

function renderCategoryButtons() {
  elements.categoryButtons.replaceChildren(
    ...CATEGORIES.map((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tile-button";
      button.textContent = category;
      button.addEventListener("click", () => {
        state.draft.category = category;
        showActionStep();
      });
      return button;
    }),
  );
}

function renderActionButtons() {
  elements.actionButtons.replaceChildren(
    ...ACTIONS.map((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tile-button";
      button.textContent = action;
      button.addEventListener("click", () => saveDraft(action));
      return button;
    }),
  );
}

function renderFilterButtons() {
  elements.filterButtons.replaceChildren(
    ...FILTERS.map((filter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter-button";
      button.textContent = filter;
      button.classList.toggle("is-active", state.filter === filter);
      button.addEventListener("click", () => {
        state.filter = filter;
        renderOverview();
      });
      return button;
    }),
  );
}

function countByAction(action) {
  return state.items.filter((item) => item.action === action).length;
}

function renderStats() {
  const stats = [
    { label: "Kast", value: countByAction("Kast") },
    { label: "Selg", value: countByAction("Selg") },
    { label: "Behold", value: countByAction("Behold") },
    { label: "Totalt", value: state.items.length },
  ];

  elements.statsGrid.replaceChildren(
    ...stats.map((stat) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      card.innerHTML = `<span>${stat.label}</span><strong>${stat.value}</strong>`;
      return card;
    }),
  );
}

function renderReportSummary() {
  const today = formatDate(Date.now());
  elements.reportDate.textContent = `Dato: ${today}`;
  elements.reportSummary.innerHTML = [
    `<p>Kast: ${countByAction("Kast")} objekter</p>`,
    `<p>Selg: ${countByAction("Selg")} objekter</p>`,
    `<p>Behold: ${countByAction("Behold")} objekter</p>`,
    `<p>Totalt: ${state.items.length} objekter</p>`,
  ].join("");
}

function cleanupRenderedImages() {
  for (const url of state.renderedImageUrls) {
    URL.revokeObjectURL(url);
  }
  state.renderedImageUrls = [];
}

function renderItemsList() {
  cleanupRenderedImages();

  const filteredItems =
    state.filter === "Alle"
      ? state.items
      : state.items.filter((item) => item.action === state.filter);

  elements.emptyState.classList.toggle("hidden", filteredItems.length > 0);
  elements.itemsList.replaceChildren();

  const cards = filteredItems.map((item) => {
    const node = elements.itemCardTemplate.content.firstElementChild.cloneNode(true);
    const image = node.querySelector(".item-image");
    const imageUrl = URL.createObjectURL(item.imageBlob);

    state.renderedImageUrls.push(imageUrl);

    image.src = imageUrl;
    image.alt = `Bilde for ${createObjectLabel(item.sequence)}`;
    node.querySelector(".item-id").textContent = createObjectLabel(item.sequence);
    node.querySelector(".item-action").textContent = item.action;
    node.querySelector(".item-meta").textContent = `Kategori: ${item.category}`;
    node.querySelector(".item-date").textContent = `Dato: ${item.date}`;
    return node;
  });

  elements.itemsList.replaceChildren(...cards);
}

function renderOverview() {
  renderFilterButtons();
  renderStats();
  renderReportSummary();
  renderItemsList();
}

async function saveDraft(action) {
  if (!state.draft.imageBlob || !state.draft.category) {
    return;
  }

  const sequence = getNextSequence();
  const createdAt = Date.now();
  const item = {
    id: crypto.randomUUID(),
    sequence,
    createdAt,
    date: formatDate(createdAt),
    imageBlob: state.draft.imageBlob,
    category: state.draft.category,
    action,
  };

  await saveItem(item);
  state.items = [item, ...state.items];
  renderOverview();
  showSavedStep(item);
}

async function handlePhotoChange(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  resetDraft();
  state.draft.imageBlob = file;
  state.draft.previewUrl = URL.createObjectURL(file);
  elements.previewImage.src = state.draft.previewUrl;
  elements.draftPreview.classList.remove("hidden");
  showCategoryStep();
}

async function loadExistingItems() {
  state.items = await getAllItems();
  renderOverview();
}

async function handleClearData() {
  if (!window.confirm("Vil du slette alle lokalt lagrede objekter?")) {
    return;
  }

  cleanupRenderedImages();
  await clearItems();
  state.items = [];
  resetDraft();
  renderOverview();
  showRegisterCapture();
}

async function installApp() {
  if (!state.deferredInstallPrompt) {
    return;
  }

  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  elements.installButton.classList.add("hidden");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js");
    });
  }
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    elements.installButton.classList.remove("hidden");
  });

  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    elements.installButton.classList.add("hidden");
  });
}

function bindEvents() {
  elements.photoInput.addEventListener("change", handlePhotoChange);
  elements.backToCaptureButton.addEventListener("click", showRegisterCapture);
  elements.backToCategoryButton.addEventListener("click", showCategoryStep);
  elements.nextObjectButton.addEventListener("click", () => {
    resetDraft();
    showRegisterCapture();
  });
  elements.finishButton.addEventListener("click", () => {
    resetDraft();
    showOverview();
  });
  elements.showRegisterButton.addEventListener("click", () => {
    showRegisterCapture();
  });
  elements.showOverviewButton.addEventListener("click", showOverview);
  elements.printButton.addEventListener("click", () => window.print());
  elements.clearDataButton.addEventListener("click", handleClearData);
  elements.installButton.addEventListener("click", installApp);
}

async function init() {
  renderCategoryButtons();
  renderActionButtons();
  renderFilterButtons();
  bindEvents();
  setupInstallPrompt();
  registerServiceWorker();
  await loadExistingItems();
  showRegisterCapture();
}

init().catch((error) => {
  console.error("Kunne ikke starte appen", error);
});
