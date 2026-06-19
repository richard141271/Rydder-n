import { APP_CONFIG } from "./config.js";
import {
  clearStoredToken,
  getStoredToken,
  getStoredUser,
  pollDeviceFlowToken,
  setStoredToken,
  setStoredUser,
  startDeviceFlow,
} from "./githubAuth.js";
import { GitHubStorageProvider } from "./githubStorageProvider.js";
import {
  deleteQueuedMutation,
  enqueueMutation,
  getCache,
  getQueuedMutations,
  getSetting,
  setCache,
  setSetting,
} from "./offlineDb.js";

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
  projects: [],
  currentProject: null,
  activeProjectId: "",
  filter: "Alle",
  currentView: "captureView",
  deferredInstallPrompt: null,
  renderedImageUrls: [],
  valuationImageUrl: "",
  auth: {
    token: "",
    user: null,
    deviceFlow: null,
    polling: false,
  },
  sync: {
    running: false,
    lastError: "",
    queueCount: 0,
  },
};

const elements = {
  captureView: document.querySelector("#captureView"),
  categoryView: document.querySelector("#categoryView"),
  actionView: document.querySelector("#actionView"),
  valuationView: document.querySelector("#valuationView"),
  overviewView: document.querySelector("#overviewView"),
  activeProjectSelect: document.querySelector("#activeProjectSelect"),
  authView: document.querySelector("#authView"),
  authStatus: document.querySelector("#authStatus"),
  syncStatus: document.querySelector("#syncStatus"),
  loginButton: document.querySelector("#loginButton"),
  logoutButton: document.querySelector("#logoutButton"),
  startDeviceFlowButton: document.querySelector("#startDeviceFlowButton"),
  deviceFlowCard: document.querySelector("#deviceFlowCard"),
  deviceFlowLink: document.querySelector("#deviceFlowLink"),
  copyUserCodeButton: document.querySelector("#copyUserCodeButton"),
  deviceUserCode: document.querySelector("#deviceUserCode"),
  authError: document.querySelector("#authError"),
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

const storage = new GitHubStorageProvider(APP_CONFIG.github);
const ACTIVE_PROJECT_KEY = "activeProjectId";

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

function createObjectLabel(id) {
  if (typeof id === "number") {
    return `Objekt #${String(id).padStart(4, "0")}`;
  }
  return "Objekt (venter synk)";
}

function getRawBaseUrl() {
  return `https://raw.githubusercontent.com/${APP_CONFIG.github.owner}/${APP_CONFIG.github.repo}/${APP_CONFIG.github.branch}`;
}

function getActiveProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || null;
}

function getActiveProjectItems() {
  return state.currentProject?.items || [];
}

function getFilteredItems() {
  const items = getActiveProjectItems();
  return state.filter === "Alle" ? items : items.filter((item) => item.action === state.filter);
}

function getActiveProjectCosts() {
  return state.currentProject?.costs || [];
}

function getTotalProjectCost() {
  return getActiveProjectCosts().reduce((sum, cost) => sum + (Number(cost.amount) || 0), 0);
}

function setVisibleView(viewName) {
  const allViews = [
    "authView",
    "captureView",
    "categoryView",
    "actionView",
    "valuationView",
    "overviewView",
  ];
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
  if (state.projects.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Ingen prosjekter";
    option.selected = true;
    elements.activeProjectSelect.replaceChildren(option);
    elements.activeProjectSelect.disabled = true;
    return;
  }

  elements.activeProjectSelect.disabled = false;
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

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "mini-danger-button";
    deleteButton.textContent = "Slett";
    deleteButton.addEventListener("click", () => handleDeleteProject(project.id));
    header.append(deleteButton);

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
  const totalValue = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
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
    let imageUrl = "";
    if (item.imageBlob) {
      imageUrl = URL.createObjectURL(item.imageBlob);
      state.renderedImageUrls.push(imageUrl);
    } else if (item.image && item.image.startsWith("/")) {
      imageUrl = `${getRawBaseUrl()}${item.image}`;
    }

    if (imageUrl) {
      image.src = imageUrl;
    }
    image.alt = `Bilde for ${createObjectLabel(item.id)}`;
    node.querySelector(".item-id").textContent = createObjectLabel(item.id);
    node.querySelector(".item-action").textContent = item.action;
    node.querySelector(".item-meta").textContent = `Kategori: ${item.category}`;
    const dateText = item.createdAt ? formatDate(Date.parse(item.createdAt)) : "";
    node.querySelector(".item-date").textContent = dateText ? `Dato: ${dateText}` : "";
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

  const itemsWithoutValue = getActiveProjectItems().filter(
    (item) => typeof item.id === "number" && (item.value === null || item.value === ""),
  );
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

  if (currentItem.image && currentItem.image.startsWith("/")) {
    elements.valuationImage.src = `${getRawBaseUrl()}${currentItem.image}`;
  }
  elements.valuationObjectId.textContent = createObjectLabel(currentItem.id);
  elements.valuationCategory.textContent = `Kategori: ${currentItem.category}`;
  elements.valuationAction.textContent = `Handling: ${currentItem.action}`;
  const dateText = currentItem.createdAt ? formatDate(Date.parse(currentItem.createdAt)) : "";
  elements.valuationDate.textContent = dateText ? `Dato: ${dateText}` : "";
  elements.priceInput.value = "";
  elements.commentInput.value = currentItem.comment || "";
  elements.conditionInput.value = currentItem.condition || "";
  elements.noteInput.value = currentItem.note || "";
  focusPriceInput();
}

async function saveDraft(action) {
  if (!state.draft.imageBlob || !state.draft.category || !state.activeProjectId) {
    return;
  }
  if (!state.currentProject) {
    return;
  }

  const projectId = state.activeProjectId;
  const itemDraft = {
    category: state.draft.category,
    action,
    imageBlob: state.draft.imageBlob,
  };

  const optimisticId = `local-${crypto.randomUUID()}`;
  const optimistic = {
    id: optimisticId,
    projectId,
    category: itemDraft.category,
    action: itemDraft.action,
    value: null,
    comment: "",
    condition: "",
    note: "",
    imageBlob: itemDraft.imageBlob,
    createdAt: new Date().toISOString(),
    pending: true,
  };

  state.currentProject.items = [optimistic, ...(state.currentProject.items || [])];
  await setCache(`project:${projectId}`, state.currentProject);
  renderOverview();

  try {
    if (!navigator.onLine) {
      throw new Error("offline");
    }

    const item = await storage.addItem(projectId, itemDraft);
    await loadProject(projectId);
    await deleteOptimisticItem(projectId, optimisticId);
    resetDraft();
    showRegisterCapture();
    tryOpenCamera();
    return item;
  } catch {
    await enqueueMutation({
      type: "addItem",
      projectId,
      createdAt: Date.now(),
      payload: { optimisticId, itemDraft },
    });
    await refreshQueueCount();
    resetDraft();
    showRegisterCapture();
    tryOpenCamera();
    return null;
  }
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

async function handleAddProject() {
  const name = (elements.newProjectInput.value || "").trim();
  if (!name) {
    return;
  }

  elements.newProjectInput.value = "";

  try {
    const project = await storage.createProject(name);
    await loadProjects();
    state.activeProjectId = project.id;
    await setSetting(ACTIVE_PROJECT_KEY, project.id);
    await loadProject(project.id);
    renderOverview();
  } catch (error) {
    showAuthError(error?.message || "Kunne ikke opprette prosjekt.");
  }
}

async function handleDeleteProject(projectId) {
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) {
    return;
  }

  const message = `Slette prosjekt "${project.name}"?\n\nDette sletter prosjektfilen og alle bilder i GitHub.`;

  if (!window.confirm(message)) {
    return;
  }

  try {
    if (!navigator.onLine) {
      throw new Error("offline");
    }
    await storage.deleteProject(projectId);
  } catch {
    await enqueueMutation({
      type: "deleteProject",
      projectId,
      createdAt: Date.now(),
      payload: {},
    });
    await refreshQueueCount();
  }

  await loadProjects();
  const fallback = state.projects[0]?.id || "";
  state.activeProjectId = projectId === state.activeProjectId ? fallback : state.activeProjectId;
  await setSetting(ACTIVE_PROJECT_KEY, state.activeProjectId);
  if (state.activeProjectId) {
    await loadProject(state.activeProjectId);
  }
  renderOverview();
}

async function handleAddCost() {
  if (!state.activeProjectId || !state.currentProject) {
    return;
  }
  const amount = Number(String(elements.costAmountInput.value || "").trim());
  if (!Number.isFinite(amount) || amount < 0) {
    elements.costAmountInput.focus();
    return;
  }

  const entry = {
    id: crypto.randomUUID(),
    type: elements.costTypeSelect.value,
    amount,
    createdAt: new Date().toISOString(),
  };

  elements.costAmountInput.value = "";
  const projectId = state.activeProjectId;

  const optimistic = { ...entry, pending: true };
  state.currentProject.costs = [optimistic, ...(state.currentProject.costs || [])];
  await setCache(`project:${projectId}`, state.currentProject);
  renderOverview();

  try {
    if (!navigator.onLine) {
      throw new Error("offline");
    }
    await storage.addCost(projectId, entry);
    await loadProject(projectId);
  } catch {
    await enqueueMutation({
      type: "addCost",
      projectId,
      createdAt: Date.now(),
      payload: { entry },
    });
    await refreshQueueCount();
  }
  renderOverview();
}

async function handleValuationNext() {
  const itemsWithoutValue = getActiveProjectItems().filter(
    (item) => typeof item.id === "number" && (item.value === null || item.value === ""),
  );
  const currentItem = itemsWithoutValue[0];
  const value = Number(String(elements.priceInput.value || "").trim());

  if (!currentItem || !Number.isFinite(value)) {
    focusPriceInput();
    return;
  }

  const patch = {
    value,
    comment: elements.commentInput.value,
    condition: elements.conditionInput.value,
    note: elements.noteInput.value,
  };

  const projectId = state.activeProjectId;
  applyLocalItemPatch(currentItem.id, patch);
  await setCache(`project:${projectId}`, state.currentProject);
  renderOverview();

  try {
    if (!navigator.onLine) {
      throw new Error("offline");
    }
    await storage.updateItem(projectId, currentItem.id, patch);
    await loadProject(projectId);
  } catch {
    await enqueueMutation({
      type: "updateItem",
      projectId,
      createdAt: Date.now(),
      payload: { itemId: currentItem.id, patch },
    });
    await refreshQueueCount();
  }

  renderValuation();
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
  elements.activeProjectSelect.addEventListener("change", async () => {
    state.activeProjectId = elements.activeProjectSelect.value;
    await setSetting(ACTIVE_PROJECT_KEY, state.activeProjectId);
    await loadProject(state.activeProjectId);
    renderOverview();
  });
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

  elements.loginButton.addEventListener("click", () => showAuthView());
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.startDeviceFlowButton.addEventListener("click", handleStartDeviceFlow);
  elements.copyUserCodeButton.addEventListener("click", async () => {
    const code = elements.deviceUserCode.textContent || "";
    if (!code) {
      return;
    }
    await navigator.clipboard.writeText(code);
  });

  window.addEventListener("online", () => {
    renderSyncStatus();
    syncQueue();
  });
  window.addEventListener("offline", () => {
    renderSyncStatus();
  });
}

function showAuthError(message) {
  elements.authError.textContent = message;
  elements.authError.classList.toggle("hidden", !message);
}

function renderSyncStatus() {
  const status = elements.syncStatus;
  const queueCount = state.sync.queueCount || 0;
  const classNames = ["sync-status"];

  let text = "Ikke innlogget";

  if (!storage.isAuthenticated()) {
    text = "Ikke innlogget";
  } else if (!navigator.onLine) {
    text = queueCount > 0 ? `Offline - ${queueCount} i kø` : "Offline";
    classNames.push("is-pending");
  } else if (state.sync.running) {
    text = queueCount > 0 ? `Synkroniserer ${queueCount}` : "Synkroniserer";
    classNames.push("is-pending");
  } else if (state.sync.lastError) {
    text = queueCount > 0 ? `Synk-feil - ${queueCount} i kø` : "Synk-feil";
    classNames.push("is-error");
  } else if (queueCount > 0) {
    text = `${queueCount} venter`;
    classNames.push("is-pending");
  } else {
    text = "Synket";
    classNames.push("is-ok");
  }

  status.className = classNames.join(" ");
  status.textContent = text;
  status.classList.remove("hidden");
}

async function refreshQueueCount() {
  const queue = await getQueuedMutations();
  state.sync.queueCount = queue.length;
  renderSyncStatus();
  return queue;
}

function updateAuthUi() {
  const isAuthed = storage.isAuthenticated();
  elements.loginButton.classList.toggle("hidden", isAuthed);
  elements.logoutButton.classList.toggle("hidden", !isAuthed);

  const label = isAuthed
    ? `GitHub: ${state.auth.user?.login || "pålogget"}`
    : "GitHub: ikke innlogget";
  elements.authStatus.textContent = label;
  elements.authStatus.classList.remove("hidden");
  renderSyncStatus();
}

function showAuthView() {
  showAuthError("");
  elements.deviceFlowCard.classList.add("hidden");
  setVisibleView("authView");
}

async function handleLogout() {
  await clearStoredToken();
  storage.setToken("");
  state.auth.user = null;
  state.projects = [];
  state.currentProject = null;
  state.activeProjectId = "";
  state.sync.lastError = "";
  await refreshQueueCount();
  updateAuthUi();
  showAuthView();
}

async function handleStartDeviceFlow() {
  showAuthError("");

  if (!APP_CONFIG.github.clientId) {
    showAuthError("Mangler GitHub clientId i config.js.");
    return;
  }

  try {
    const flow = await startDeviceFlow({
      clientId: APP_CONFIG.github.clientId,
      scope: APP_CONFIG.github.scope,
    });

    state.auth.deviceFlow = flow;
    elements.deviceFlowLink.href = flow.verification_uri;
    elements.deviceUserCode.textContent = flow.user_code;
    elements.deviceFlowCard.classList.remove("hidden");
    startPollingForToken();
  } catch (error) {
    showAuthError(error?.message || "Kunne ikke starte innlogging.");
  }
}

async function startPollingForToken() {
  if (state.auth.polling) {
    return;
  }

  state.auth.polling = true;
  const flow = state.auth.deviceFlow;
  let intervalMs = Math.max(1, Number(flow.interval) || 5) * 1000;
  const expiresAt = Date.now() + (Number(flow.expires_in) || 900) * 1000;

  while (Date.now() < expiresAt) {
    try {
      const data = await pollDeviceFlowToken({
        clientId: APP_CONFIG.github.clientId,
        deviceCode: flow.device_code,
      });

      if (data.access_token) {
        await setStoredToken(data.access_token);
        storage.setToken(data.access_token);
        const user = await storage.getUser();
        state.auth.user = user;
        await setStoredUser(user);
        updateAuthUi();
        await loadProjects();
        await ensureActiveProject();
        renderOverview();
        showRegisterCapture();
        syncQueue();
        state.auth.polling = false;
        return;
      }

      if (data.error === "authorization_pending") {
        await delay(intervalMs);
        continue;
      }

      if (data.error === "slow_down") {
        intervalMs += 2000;
        await delay(intervalMs);
        continue;
      }

      if (data.error === "access_denied") {
        showAuthError("Innlogging avbrutt.");
        break;
      }

      if (data.error === "expired_token") {
        showAuthError("Koden er utløpt. Start innlogging på nytt.");
        break;
      }

      showAuthError("Kunne ikke fullføre innlogging.");
      break;
    } catch (error) {
      showAuthError(error?.message || "Kunne ikke fullføre innlogging.");
      break;
    }
  }

  state.auth.polling = false;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function loadProjects() {
  try {
    const projects = await storage.listProjects();
    state.projects = projects;
    await setCache("projects:list", projects);
  } catch {
    const cached = (await getCache("projects:list")) || [];
    state.projects = cached;
  }
}

async function loadProject(projectId) {
  if (!projectId) {
    state.currentProject = null;
    return;
  }

  try {
    const project = await storage.getProject(projectId);
    state.currentProject = project;
    await setCache(`project:${projectId}`, project);
  } catch {
    const cached = await getCache(`project:${projectId}`);
    state.currentProject = cached;
  }
}

async function ensureActiveProject() {
  let activeProjectId = (await getSetting(ACTIVE_PROJECT_KEY)) || "";
  if (!activeProjectId || !state.projects.some((project) => project.id === activeProjectId)) {
    activeProjectId = state.projects[0]?.id || "";
    if (activeProjectId) {
      await setSetting(ACTIVE_PROJECT_KEY, activeProjectId);
    }
  }

  state.activeProjectId = activeProjectId;
  renderProjectSelect();
  await loadProject(activeProjectId);
}

function applyLocalItemPatch(itemId, patch) {
  if (!state.currentProject) {
    return;
  }

  state.currentProject.items = (state.currentProject.items || []).map((item) =>
    item.id === itemId ? { ...item, ...patch } : item,
  );
}

async function deleteOptimisticItem(projectId, optimisticId) {
  const cached = await getCache(`project:${projectId}`);
  if (cached && Array.isArray(cached.items)) {
    cached.items = cached.items.filter((item) => item.id !== optimisticId);
    await setCache(`project:${projectId}`, cached);
  }
}

async function syncQueue() {
  if (state.sync.running) {
    return;
  }
  if (!navigator.onLine || !storage.isAuthenticated()) {
    await refreshQueueCount();
    return;
  }

  state.sync.running = true;
  state.sync.lastError = "";
  renderSyncStatus();

  try {
    const queue = await refreshQueueCount();
    for (const entry of queue) {
      if (entry.type === "addItem") {
        await storage.addItem(entry.projectId, entry.payload.itemDraft);
        if (entry.payload.optimisticId) {
          await deleteOptimisticItem(entry.projectId, entry.payload.optimisticId);
        }
        await deleteQueuedMutation(entry.id);
        state.sync.queueCount = Math.max(0, state.sync.queueCount - 1);
        renderSyncStatus();
        continue;
      }
      if (entry.type === "updateItem") {
        await storage.updateItem(entry.projectId, entry.payload.itemId, entry.payload.patch);
        await deleteQueuedMutation(entry.id);
        state.sync.queueCount = Math.max(0, state.sync.queueCount - 1);
        renderSyncStatus();
        continue;
      }
      if (entry.type === "addCost") {
        await storage.addCost(entry.projectId, entry.payload.entry);
        await deleteQueuedMutation(entry.id);
        state.sync.queueCount = Math.max(0, state.sync.queueCount - 1);
        renderSyncStatus();
        continue;
      }
      if (entry.type === "deleteProject") {
        await storage.deleteProject(entry.projectId);
        await deleteQueuedMutation(entry.id);
        state.sync.queueCount = Math.max(0, state.sync.queueCount - 1);
        renderSyncStatus();
        continue;
      }
    }

    await loadProjects();
    await ensureActiveProject();
    renderOverview();
  } catch (error) {
    state.sync.lastError = error?.message || "Kunne ikke synkronisere.";
  } finally {
    state.sync.running = false;
    await refreshQueueCount();
  }
}

async function init() {
  renderCategoryButtons();
  renderActionButtons();
  bindEvents();
  setupInstallPrompt();
  registerServiceWorker();

  const token = await getStoredToken();
  if (token) {
    storage.setToken(token);
    state.auth.user = (await getStoredUser()) || (await storage.getUser().catch(() => null));
    if (state.auth.user) {
      await setStoredUser(state.auth.user);
    }
  }

  updateAuthUi();
  await refreshQueueCount();

  if (!storage.isAuthenticated()) {
    showAuthView();
    return;
  }

  await loadProjects();
  await ensureActiveProject();
  renderOverview();
  showRegisterCapture();
  syncQueue();
}

init().catch((error) => {
  console.error("Kunne ikke starte appen", error);
});
