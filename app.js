import {
  deleteProjectAndData,
  getAllItems,
  getDefaultProjectId,
  getProjectCosts,
  saveItem,
  saveProjectCost,
} from "./db.js";
import { addProject, ensureProjects, getProjectById, setActiveProject } from "./projects.js";
import { buildValuationPatch, getItemsWithoutValue, getTotalItemValue, sanitizeValue } from "./valuation.js";

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
    imageHash: "",
    previewUrl: "",
    category: "",
  },
  items: [],
  projects: [],
  costs: [],
  activeProjectId: "",
  filter: "Alle",
  currentView: "captureView",
  deferredInstallPrompt: null,
  renderedImageUrls: [],
  valuationImageUrl: "",
  isSavingDraft: false,
  isSavingValuation: false,
};

const elements = {
  captureView: document.querySelector("#captureView"),
  categoryView: document.querySelector("#categoryView"),
  actionView: document.querySelector("#actionView"),
  valuationView: document.querySelector("#valuationView"),
  overviewView: document.querySelector("#overviewView"),
  activeProjectSelect: document.querySelector("#activeProjectSelect"),
  photoInput: document.querySelector("#photoInput"),
  draftPreview: document.querySelector("#draftPreview"),
  previewImage: document.querySelector("#previewImage"),
  categoryButtons: document.querySelector("#categoryButtons"),
  actionButtons: document.querySelector("#actionButtons"),
  selectedCategoryBadge: document.querySelector("#selectedCategoryBadge"),
  backToCaptureButton: document.querySelector("#backToCaptureButton"),
  backToCategoryButton: document.querySelector("#backToCategoryButton"),
  exitFromCaptureButton: document.querySelector("#exitFromCaptureButton"),
  exitFromCategoryButton: document.querySelector("#exitFromCategoryButton"),
  exitFromActionButton: document.querySelector("#exitFromActionButton"),
  showRegisterButton: document.querySelector("#showRegisterButton"),
  showValuationButton: document.querySelector("#showValuationButton"),
  showOverviewButton: document.querySelector("#showOverviewButton"),
  statsGrid: document.querySelector("#statsGrid"),
  filterButtons: document.querySelector("#filterButtons"),
  reportSummary: document.querySelector("#reportSummary"),
  reportDate: document.querySelector("#reportDate"),
  itemsList: document.querySelector("#itemsList"),
  emptyState: document.querySelector("#emptyState"),
  itemCardTemplate: document.querySelector("#itemCardTemplate"),
  printButton: document.querySelector("#printButton"),
  installButton: document.querySelector("#installButton"),
  newProjectInput: document.querySelector("#newProjectInput"),
  addProjectButton: document.querySelector("#addProjectButton"),
  projectList: document.querySelector("#projectList"),
  costTypeSelect: document.querySelector("#costTypeSelect"),
  costAmountInput: document.querySelector("#costAmountInput"),
  addCostButton: document.querySelector("#addCostButton"),
  costList: document.querySelector("#costList"),
  valuationEmptyState: document.querySelector("#valuationEmptyState"),
  valuationCard: document.querySelector("#valuationCard"),
  valuationImage: document.querySelector("#valuationImage"),
  valuationObjectId: document.querySelector("#valuationObjectId"),
  valuationCategory: document.querySelector("#valuationCategory"),
  valuationAction: document.querySelector("#valuationAction"),
  valuationDate: document.querySelector("#valuationDate"),
  priceInput: document.querySelector("#priceInput"),
  commentInput: document.querySelector("#commentInput"),
  conditionInput: document.querySelector("#conditionInput"),
  noteInput: document.querySelector("#noteInput"),
  valuationNextButton: document.querySelector("#valuationNextButton"),
  valuationMoreButton: document.querySelector("#valuationMoreButton"),
  valuationExitButton: document.querySelector("#valuationExitButton"),
  moreFields: document.querySelector("#moreFields"),
};

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function createObjectLabel(sequence) {
  return `Objekt #${String(sequence).padStart(3, "0")}`;
}

function getNextSequence() {
  const maxSequence = state.items.reduce((max, item) => Math.max(max, item.sequence || 0), 0);
  return maxSequence + 1;
}

function getActiveProject() {
  return getProjectById(state.projects, state.activeProjectId);
}

function getActiveProjectItems() {
  return state.items.filter((item) => item.projectId === state.activeProjectId);
}

function getFilteredItems() {
  const items = getActiveProjectItems();
  return state.filter === "Alle" ? items : items.filter((item) => item.action === state.filter);
}

function getActiveProjectCosts() {
  return state.costs.filter((cost) => cost.projectId === state.activeProjectId);
}

function getTotalProjectCost() {
  return getActiveProjectCosts().reduce((sum, cost) => sum + (Number(cost.amount) || 0), 0);
}

function setVisibleView(viewName) {
  const allViews = ["captureView", "categoryView", "actionView", "valuationView", "overviewView"];
  for (const name of allViews) {
    elements[name].classList.toggle("hidden", name !== viewName);
  }

  state.currentView = viewName;
  elements.showRegisterButton.classList.toggle(
    "active",
    ["captureView", "categoryView", "actionView"].includes(viewName),
  );
  elements.showValuationButton.classList.toggle("active", viewName === "valuationView");
  elements.showOverviewButton.classList.toggle("active", viewName === "overviewView");
}

function focusPriceInput() {
  window.setTimeout(() => {
    elements.priceInput.focus();
    elements.priceInput.select();
  }, 50);
}

function tryOpenCamera() {
  window.setTimeout(() => {
    elements.photoInput.click();
  }, 80);
}

async function hashBlob(blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hasDuplicateImage(imageHash, excludeItemId = "") {
  return state.items.some(
    (item) =>
      item.projectId === state.activeProjectId &&
      item.imageHash &&
      item.imageHash === imageHash &&
      item.id !== excludeItemId,
  );
}

function setActionButtonsDisabled(disabled) {
  const buttons = elements.actionButtons.querySelectorAll("button");
  for (const button of buttons) {
    button.disabled = disabled;
  }
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

function showOverview() {
  renderOverview();
  setVisibleView("overviewView");
}

function showValuation() {
  setVisibleView("valuationView");
  renderValuation();
}

function resetDraft() {
  if (state.draft.previewUrl) {
    URL.revokeObjectURL(state.draft.previewUrl);
  }

  state.draft = {
    imageBlob: null,
    imageHash: "",
    previewUrl: "",
    category: "",
  };

  elements.photoInput.value = "";
  elements.previewImage.removeAttribute("src");
  elements.draftPreview.classList.add("hidden");
}

function exitRegistration() {
  resetDraft();
  showOverview();
}

function cleanupRenderedImages() {
  for (const url of state.renderedImageUrls) {
    URL.revokeObjectURL(url);
  }
  state.renderedImageUrls = [];
}

function cleanupValuationImage() {
  if (!state.valuationImageUrl) {
    return;
  }

  URL.revokeObjectURL(state.valuationImageUrl);
  state.valuationImageUrl = "";
}

function renderProjectSelect() {
  const options = state.projects.map((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    option.selected = project.id === state.activeProjectId;
    return option;
  });

  elements.activeProjectSelect.replaceChildren(...options);
}

function renderProjectList() {
  const defaultProjectId = getDefaultProjectId();
  const rows = state.projects.map((project) => {
    const row = document.createElement("div");
    row.className = "list-row";

    const left = document.createElement("div");
    left.className = "list-left";

    const header = document.createElement("div");
    header.className = "list-header";

    const title = document.createElement("strong");
    title.textContent = project.name;
    header.append(title);

    if (project.id !== defaultProjectId) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "mini-danger-button";
      deleteButton.textContent = "Slett";
      deleteButton.addEventListener("click", () => handleDeleteProject(project.id));
      header.append(deleteButton);
    }

    const meta = document.createElement("p");
    meta.className = "list-line";
    meta.textContent = project.id === state.activeProjectId ? "Aktivt prosjekt" : "Prosjekt";

    left.append(header, meta);
    row.append(left);
    return row;
  });

  elements.projectList.replaceChildren(...rows);
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

function renderStats() {
  const items = getActiveProjectItems();
  const stats = [
    { label: "Kast", value: items.filter((item) => item.action === "Kast").length },
    { label: "Selg", value: items.filter((item) => item.action === "Selg").length },
    { label: "Behold", value: items.filter((item) => item.action === "Behold").length },
    { label: "Totalt", value: items.length },
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

function renderCostList() {
  const costs = getActiveProjectCosts();

  if (costs.length === 0) {
    elements.costList.replaceChildren();
    return;
  }

  const rows = costs.map((cost) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div>
        <strong>${cost.type}</strong>
        <p class="list-line">${formatDate(cost.createdAt)}</p>
      </div>
      <strong>${formatCurrency(cost.amount)}</strong>
    `;
    return row;
  });

  elements.costList.replaceChildren(...rows);
}

function renderReportSummary() {
  const project = getActiveProject();
  const items = getActiveProjectItems();
  const totalValue = getTotalItemValue(state.items, state.activeProjectId);
  const totalCost = getTotalProjectCost();
  const netValue = totalValue - totalCost;

  elements.reportDate.textContent = `Dato: ${formatDate(Date.now())}`;
  elements.reportSummary.innerHTML = [
    `<p>Prosjekt: ${project?.name || ""}</p>`,
    `<p>Kast: ${items.filter((item) => item.action === "Kast").length} objekter</p>`,
    `<p>Selg: ${items.filter((item) => item.action === "Selg").length} objekter</p>`,
    `<p>Behold: ${items.filter((item) => item.action === "Behold").length} objekter</p>`,
    `<p>Totalt: ${items.length} objekter</p>`,
    `<p>Totalt registrert verdi: ${formatCurrency(totalValue)}</p>`,
    `<p>Totale prosjektkostnader: ${formatCurrency(totalCost)}</p>`,
    `<p>Netto verdi: ${formatCurrency(netValue)}</p>`,
  ].join("");
}

function renderItemsList() {
  cleanupRenderedImages();

  const filteredItems = getFilteredItems();
  elements.emptyState.classList.toggle("hidden", filteredItems.length > 0);

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
    node.querySelector(".item-value").textContent =
      item.value === null ? "Verdi mangler" : `Verdi: ${formatCurrency(item.value)}`;
    return node;
  });

  elements.itemsList.replaceChildren(...cards);
}

function renderOverview() {
  renderProjectSelect();
  renderProjectList();
  renderFilterButtons();
  renderStats();
  renderCostList();
  renderReportSummary();
  renderItemsList();
}

function renderValuation() {
  cleanupValuationImage();

  const itemsWithoutValue = getItemsWithoutValue(state.items, state.activeProjectId);
  const currentItem = itemsWithoutValue[0];

  elements.moreFields.classList.add("hidden");
  elements.valuationEmptyState.classList.toggle("hidden", Boolean(currentItem));
  elements.valuationCard.classList.toggle("hidden", !currentItem);

  if (!currentItem) {
    elements.priceInput.value = "";
    elements.commentInput.value = "";
    elements.conditionInput.value = "";
    elements.noteInput.value = "";
    return;
  }

  state.valuationImageUrl = URL.createObjectURL(currentItem.imageBlob);
  elements.valuationImage.src = state.valuationImageUrl;
  elements.valuationObjectId.textContent = createObjectLabel(currentItem.sequence);
  elements.valuationCategory.textContent = `Kategori: ${currentItem.category}`;
  elements.valuationAction.textContent = `Handling: ${currentItem.action}`;
  elements.valuationDate.textContent = `Dato: ${currentItem.date}`;
  elements.priceInput.value = "";
  elements.commentInput.value = currentItem.comment || "";
  elements.conditionInput.value = currentItem.condition || "";
  elements.noteInput.value = currentItem.note || "";
  focusPriceInput();
}

async function saveDraft(action) {
  if (
    state.isSavingDraft ||
    !state.draft.imageBlob ||
    !state.draft.imageHash ||
    !state.draft.category ||
    !state.activeProjectId
  ) {
    return;
  }

  if (hasDuplicateImage(state.draft.imageHash)) {
    window.alert("Dette bildet er allerede registrert i prosjektet.");
    resetDraft();
    showRegisterCapture();
    return;
  }

  state.isSavingDraft = true;
  setActionButtonsDisabled(true);

  try {
    const createdAt = Date.now();
    const item = {
      id: crypto.randomUUID(),
      sequence: getNextSequence(),
      createdAt,
      date: formatDate(createdAt),
      imageBlob: state.draft.imageBlob,
      imageHash: state.draft.imageHash,
      category: state.draft.category,
      action,
      projectId: state.activeProjectId,
      value: null,
      comment: "",
      condition: "",
      note: "",
    };

    await saveItem(item);
    state.items = [item, ...state.items];
    renderOverview();
    resetDraft();
    showRegisterCapture();
    tryOpenCamera();
  } finally {
    state.isSavingDraft = false;
    setActionButtonsDisabled(false);
  }
}

async function handlePhotoChange(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  resetDraft();
  const imageHash = await hashBlob(file);
  if (hasDuplicateImage(imageHash)) {
    window.alert("Dette bildet er allerede registrert i prosjektet.");
    showRegisterCapture();
    return;
  }

  state.draft.imageBlob = file;
  state.draft.imageHash = imageHash;
  state.draft.previewUrl = URL.createObjectURL(file);
  elements.previewImage.src = state.draft.previewUrl;
  elements.draftPreview.classList.remove("hidden");
  showCategoryStep();
}

async function handleActiveProjectChange() {
  state.activeProjectId = elements.activeProjectSelect.value;
  await setActiveProject(state.activeProjectId);
  renderOverview();

  if (state.currentView === "valuationView") {
    renderValuation();
  }
}

async function handleAddProject() {
  const newProject = await addProject(elements.newProjectInput.value);
  if (!newProject) {
    return;
  }

  elements.newProjectInput.value = "";
  const ensured = await ensureProjects();
  state.projects = ensured.projects;
  state.activeProjectId = newProject.id;
  await setActiveProject(newProject.id);
  renderOverview();
  renderProjectSelect();
}

async function handleDeleteProject(projectId) {
  const defaultProjectId = getDefaultProjectId();
  if (projectId === defaultProjectId) {
    return;
  }

  const project = getProjectById(state.projects, projectId);
  if (!project) {
    return;
  }

  const projectItemsCount = state.items.filter((item) => item.projectId === projectId).length;
  const projectCostsCount = state.costs.filter((cost) => cost.projectId === projectId).length;
  const message = `Slette prosjekt "${project.name}"?\n\nDette sletter også ${projectItemsCount} objekter og ${projectCostsCount} kostnader.`;

  if (!window.confirm(message)) {
    return;
  }

  await deleteProjectAndData(projectId);
  state.items = state.items.filter((item) => item.projectId !== projectId);
  state.costs = state.costs.filter((cost) => cost.projectId !== projectId);

  const ensured = await ensureProjects();
  state.projects = ensured.projects;
  state.activeProjectId = ensured.activeProjectId;
  renderOverview();

  if (state.currentView === "valuationView") {
    renderValuation();
  }
}

async function handleAddCost() {
  const amount = sanitizeValue(elements.costAmountInput.value);
  if (amount === null) {
    elements.costAmountInput.focus();
    return;
  }

  const cost = {
    id: crypto.randomUUID(),
    projectId: state.activeProjectId,
    type: elements.costTypeSelect.value,
    amount,
    createdAt: Date.now(),
  };

  await saveProjectCost(cost);
  state.costs = [cost, ...state.costs];
  elements.costAmountInput.value = "";
  renderOverview();
}

async function handleValuationNext() {
  if (state.isSavingValuation) {
    return;
  }

  const itemsWithoutValue = getItemsWithoutValue(state.items, state.activeProjectId);
  const currentItem = itemsWithoutValue[0];
  const value = sanitizeValue(elements.priceInput.value);

  if (!currentItem || value === null) {
    focusPriceInput();
    return;
  }

  state.isSavingValuation = true;
  elements.valuationNextButton.disabled = true;

  try {
    const updatedItem = buildValuationPatch(currentItem, {
      value,
      comment: elements.commentInput.value,
      condition: elements.conditionInput.value,
      note: elements.noteInput.value,
    });

    await saveItem(updatedItem);
    state.items = state.items.map((item) => (item.id === updatedItem.id ? updatedItem : item));
    renderOverview();
    renderValuation();
  } finally {
    state.isSavingValuation = false;
    elements.valuationNextButton.disabled = false;
  }
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
  elements.activeProjectSelect.addEventListener("change", handleActiveProjectChange);
  elements.backToCaptureButton.addEventListener("click", showRegisterCapture);
  elements.backToCategoryButton.addEventListener("click", showCategoryStep);
  elements.exitFromCaptureButton.addEventListener("click", exitRegistration);
  elements.exitFromCategoryButton.addEventListener("click", exitRegistration);
  elements.exitFromActionButton.addEventListener("click", exitRegistration);
  elements.showRegisterButton.addEventListener("click", showRegisterCapture);
  elements.showValuationButton.addEventListener("click", showValuation);
  elements.showOverviewButton.addEventListener("click", showOverview);
  elements.printButton.addEventListener("click", () => window.print());
  elements.installButton.addEventListener("click", installApp);
  elements.addProjectButton.addEventListener("click", handleAddProject);
  elements.addCostButton.addEventListener("click", handleAddCost);
  elements.valuationNextButton.addEventListener("click", handleValuationNext);
  elements.valuationMoreButton.addEventListener("click", () => {
    elements.moreFields.classList.toggle("hidden");
  });
  elements.valuationExitButton.addEventListener("click", showOverview);
  elements.priceInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleValuationNext();
    }
  });
}

async function loadState() {
  const ensured = await ensureProjects();
  state.projects = ensured.projects;
  state.activeProjectId = ensured.activeProjectId;
  state.items = await getAllItems();
  state.costs = await getProjectCosts();
}

async function init() {
  renderCategoryButtons();
  renderActionButtons();
  bindEvents();
  setupInstallPrompt();
  registerServiceWorker();
  await loadState();
  renderOverview();
  showRegisterCapture();
}

init().catch((error) => {
  console.error("Kunne ikke starte appen", error);
});
