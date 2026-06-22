import {
  deleteProjectAndData,
  getAllItems,
  getDefaultProjectId,
  getEvidenceEntries,
  getEvidenceMaps,
  getProjectCosts,
  saveEvidenceEntry,
  saveEvidenceMap,
  saveItem,
  saveProjectCost,
} from "./db.js";
import { addProject, ensureProjects, getProjectById, setActiveProject } from "./projects.js";
import { buildValuationPatch, getItemsWithoutValue, getTotalItemValue, sanitizeValue } from "./valuation.js";

const CATEGORIES = ["Materialer", "Verktøy", "Maskiner", "Inventar", "Kontorutstyr", "Deler", "Diverse"];
const ACTIONS = ["Kast", "Selg", "Behold"];
const FILTERS = ["Alle", ...ACTIONS];
const DOC_CATEGORIES = [
  "Kloakkrelatert",
  "Vannskade",
  "Fukt",
  "Lukt",
  "Mugg",
  "Avfall",
  "Stikkpilleemballasje",
  "Papir",
  "Fremmedlegeme",
  "Bygningsskade",
  "Elektrisk",
  "Annet",
];
const DOC_TYPES = [
  { id: "finding", label: "Nytt funn", prefix: "FUNN", shortLabel: "Funn" },
  { id: "observation", label: "Ny observasjon", prefix: "OBS", shortLabel: "Observasjon" },
  { id: "damage", label: "Ny skade", prefix: "SKADE", shortLabel: "Skade" },
  { id: "measurement", label: "Ny måling", prefix: "MAL", shortLabel: "Måling" },
  { id: "sample", label: "Ny prøve", prefix: "SP", shortLabel: "Prøve" },
];
const DOC_VIEWS = ["docsEntryView", "docsMapView", "docsReportView"];

function createDocumentationDraft(entryType) {
  return {
    entryType,
    category: "Annet",
    description: "",
    comment: "",
    zone: "",
    count: 1,
    risk: "Middels",
    images: [],
    imageHashes: [],
  };
}

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
  evidenceEntries: [],
  evidenceMaps: [],
  activeProjectId: "",
  filter: "Alle",
  currentView: "captureView",
  activeModule: "rydderen",
  deferredInstallPrompt: null,
  renderedImageUrls: [],
  valuationImageUrl: "",
  docsRenderedImageUrls: [],
  docsDraftPreviewUrls: [],
  isSavingDraft: false,
  isSavingValuation: false,
  isSavingDocEntry: false,
  isSavingDocMap: false,
  projectRegistrationConfirmed: false,
  documentationDraft: createDocumentationDraft("finding"),
  documentationView: "docsEntryView",
  documentationSearch: "",
};

const elements = {
  captureView: document.querySelector("#captureView"),
  categoryView: document.querySelector("#categoryView"),
  actionView: document.querySelector("#actionView"),
  valuationView: document.querySelector("#valuationView"),
  overviewView: document.querySelector("#overviewView"),
  rydderenModule: document.querySelector("#rydderenModule"),
  documentationModule: document.querySelector("#documentationModule"),
  showRydderenModuleButton: document.querySelector("#showRydderenModuleButton"),
  showDocumentationModuleButton: document.querySelector("#showDocumentationModuleButton"),
  activeProjectSelect: document.querySelector("#activeProjectSelect"),
  openPhotoButton: document.querySelector("#openPhotoButton"),
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
  bottomNav: document.querySelector(".bottom-nav"),
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
  docsNewFindingButton: document.querySelector("#docsNewFindingButton"),
  docsNewObservationButton: document.querySelector("#docsNewObservationButton"),
  docsNewDamageButton: document.querySelector("#docsNewDamageButton"),
  docsNewMeasurementButton: document.querySelector("#docsNewMeasurementButton"),
  docsNewSampleButton: document.querySelector("#docsNewSampleButton"),
  docsMapButton: document.querySelector("#docsMapButton"),
  docsReportsButton: document.querySelector("#docsReportsButton"),
  docsEntryView: document.querySelector("#docsEntryView"),
  docsMapView: document.querySelector("#docsMapView"),
  docsReportView: document.querySelector("#docsReportView"),
  docsEntryEyebrow: document.querySelector("#docsEntryEyebrow"),
  docsEntryTitle: document.querySelector("#docsEntryTitle"),
  docsEntryNumber: document.querySelector("#docsEntryNumber"),
  docsEntryTimestamp: document.querySelector("#docsEntryTimestamp"),
  openDocsCameraButton: document.querySelector("#openDocsCameraButton"),
  openDocsGalleryButton: document.querySelector("#openDocsGalleryButton"),
  docsCameraInput: document.querySelector("#docsCameraInput"),
  docsGalleryInput: document.querySelector("#docsGalleryInput"),
  docsDraftImages: document.querySelector("#docsDraftImages"),
  docsCategorySelect: document.querySelector("#docsCategorySelect"),
  docsDescriptionInput: document.querySelector("#docsDescriptionInput"),
  docsZoneInput: document.querySelector("#docsZoneInput"),
  docsZoneOptions: document.querySelector("#docsZoneOptions"),
  docsMoreFields: document.querySelector("#docsMoreFields"),
  docsCommentInput: document.querySelector("#docsCommentInput"),
  docsCountInput: document.querySelector("#docsCountInput"),
  docsRiskSelect: document.querySelector("#docsRiskSelect"),
  docsGpsStatus: document.querySelector("#docsGpsStatus"),
  docsSaveEntryButton: document.querySelector("#docsSaveEntryButton"),
  docsMoreButton: document.querySelector("#docsMoreButton"),
  docsExitEntryButton: document.querySelector("#docsExitEntryButton"),
  docsCaseNameInput: document.querySelector("#docsCaseNameInput"),
  docsAddressInput: document.querySelector("#docsAddressInput"),
  docsMapRowsInput: document.querySelector("#docsMapRowsInput"),
  docsMapColumnsInput: document.querySelector("#docsMapColumnsInput"),
  docsGenerateZonesButton: document.querySelector("#docsGenerateZonesButton"),
  docsZoneGrid: document.querySelector("#docsZoneGrid"),
  docsSketchInput: document.querySelector("#docsSketchInput"),
  docsSaveMapButton: document.querySelector("#docsSaveMapButton"),
  docsExitMapButton: document.querySelector("#docsExitMapButton"),
  docsSearchInput: document.querySelector("#docsSearchInput"),
  docsClearSearchButton: document.querySelector("#docsClearSearchButton"),
  docsExportPdfButton: document.querySelector("#docsExportPdfButton"),
  docsExportPagesButton: document.querySelector("#docsExportPagesButton"),
  docsSaveAllImagesButton: document.querySelector("#docsSaveAllImagesButton"),
  docsExportZipButton: document.querySelector("#docsExportZipButton"),
  docsReportSummary: document.querySelector("#docsReportSummary"),
  docsEntriesList: document.querySelector("#docsEntriesList"),
  docsReportEmptyState: document.querySelector("#docsReportEmptyState"),
  docsEntryCardTemplate: document.querySelector("#docsEntryCardTemplate"),
};

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRtfText(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replace(/\r\n|\r|\n/g, "\\line ")
    .replace(/[^\x00-\x7f]/g, (character) => `\\u${character.charCodeAt(0)}?`);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50);
}

function createObjectLabel(sequence) {
  return `Objekt #${String(sequence).padStart(3, "0")}`;
}

function getDocTypeConfig(entryType) {
  return DOC_TYPES.find((type) => type.id === entryType) || DOC_TYPES[0];
}

function getNextSequence() {
  const maxSequence = state.items.reduce((max, item) => Math.max(max, item.sequence || 0), 0);
  return maxSequence + 1;
}

function getNextEvidenceSequence(entryType) {
  return (
    state.evidenceEntries
      .filter((entry) => entry.projectId === state.activeProjectId && entry.entryType === entryType)
      .reduce((max, entry) => Math.max(max, entry.sequence || 0), 0) + 1
  );
}

function createEvidenceNumber(entryType, sequence) {
  const type = getDocTypeConfig(entryType);
  return `${type.prefix}-${String(sequence).padStart(3, "0")}`;
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

function getActiveEvidenceEntries() {
  return state.evidenceEntries.filter((entry) => entry.projectId === state.activeProjectId);
}

function buildZones(rows, columns) {
  const safeRows = Math.max(1, Math.min(8, Number(rows) || 1));
  const safeColumns = Math.max(1, Math.min(8, Number(columns) || 1));
  const zones = [];
  for (let row = 0; row < safeRows; row += 1) {
    const rowLabel = String.fromCharCode(65 + row);
    for (let column = 1; column <= safeColumns; column += 1) {
      zones.push(`${rowLabel}${column}`);
    }
  }
  return zones;
}

function getActiveEvidenceMap() {
  return (
    state.evidenceMaps.find((map) => map.projectId === state.activeProjectId) || {
      projectId: state.activeProjectId,
      rows: 3,
      columns: 3,
      zones: buildZones(3, 3),
      sketch: "",
      caseName: "",
      address: "",
      updatedAt: Date.now(),
    }
  );
}

function getFilteredEvidenceEntries() {
  const search = state.documentationSearch.trim().toLowerCase();
  const entries = getActiveEvidenceEntries();
  if (!search) {
    return entries;
  }

  return entries.filter((entry) =>
    [
      entry.entryNumber,
      entry.category,
      entry.createdDate,
      entry.zone,
      entry.description,
      entry.comment,
      getDocTypeConfig(entry.entryType).shortLabel,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search),
  );
}

function setVisibleView(viewName) {
  const allViews = ["captureView", "categoryView", "actionView", "valuationView", "overviewView"];
  for (const name of allViews) {
    elements[name].classList.toggle("hidden", name !== viewName);
  }

  state.currentView = viewName;
  elements.showRegisterButton.classList.toggle("active", ["captureView", "categoryView", "actionView"].includes(viewName));
  elements.showValuationButton.classList.toggle("active", viewName === "valuationView");
  elements.showOverviewButton.classList.toggle("active", viewName === "overviewView");
}

function setDocumentationView(viewName) {
  for (const name of DOC_VIEWS) {
    elements[name].classList.toggle("hidden", name !== viewName);
  }
  state.documentationView = viewName;
}

function setActiveModule(moduleName) {
  state.activeModule = moduleName;
  elements.showRydderenModuleButton.classList.toggle("active", moduleName === "rydderen");
  elements.showDocumentationModuleButton.classList.toggle("active", moduleName === "documentation");
  elements.rydderenModule.classList.toggle("hidden", moduleName !== "rydderen");
  elements.documentationModule.classList.toggle("hidden", moduleName !== "documentation");
  elements.bottomNav.classList.toggle("hidden", moduleName !== "rydderen");
  document.body.dataset.printMode = moduleName === "documentation" ? "docs" : "overview";

  if (moduleName === "documentation") {
    renderDocumentationModule();
  } else if (state.currentView === "valuationView") {
    renderValuation();
  } else if (state.currentView === "overviewView") {
    renderOverview();
  }
}

function confirmActiveProjectForRegistration() {
  const projectName = getActiveProject()?.name || "ukjent prosjekt";
  if (state.projectRegistrationConfirmed) {
    return true;
  }

  const isConfirmed = window.confirm(`Dette registreres i "${projectName}". Er dette riktig?`);
  if (!isConfirmed) {
    elements.activeProjectSelect.focus();
    showOverview();
    return false;
  }

  state.projectRegistrationConfirmed = true;
  return true;
}

function focusPriceInput() {
  window.setTimeout(() => {
    elements.priceInput.focus();
    elements.priceInput.select();
  }, 50);
}

function focusDocsDescription() {
  window.setTimeout(() => {
    elements.docsDescriptionInput.focus();
    elements.docsDescriptionInput.select();
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

function setDocsSaveDisabled(disabled) {
  elements.docsSaveEntryButton.disabled = disabled;
  elements.docsExportZipButton.disabled = disabled;
}

function showRegisterCapture() {
  setActiveModule("rydderen");
  setVisibleView("captureView");
}

function showCategoryStep() {
  setActiveModule("rydderen");
  setVisibleView("categoryView");
}

function showActionStep() {
  elements.selectedCategoryBadge.textContent = state.draft.category;
  setActiveModule("rydderen");
  setVisibleView("actionView");
}

function showOverview() {
  setActiveModule("rydderen");
  renderOverview();
  setVisibleView("overviewView");
}

function showValuation() {
  setActiveModule("rydderen");
  setVisibleView("valuationView");
  renderValuation();
}

function showDocsEntry(entryType = state.documentationDraft.entryType) {
  if (entryType !== state.documentationDraft.entryType) {
    resetDocumentationDraft(entryType);
  } else {
    updateDocumentationHeader();
    syncDocumentationDraftToForm();
  }

  setActiveModule("documentation");
  setDocumentationView("docsEntryView");
  focusDocsDescription();
}

function showDocsMap() {
  setActiveModule("documentation");
  setDocumentationView("docsMapView");
  renderDocumentationMap();
}

function showDocsReport() {
  setActiveModule("documentation");
  setDocumentationView("docsReportView");
  renderDocumentationReport();
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

function revokeDocsDraftImages() {
  for (const url of state.docsDraftPreviewUrls) {
    URL.revokeObjectURL(url);
  }
  state.docsDraftPreviewUrls = [];
}

function resetDocumentationDraft(entryType = state.documentationDraft.entryType) {
  revokeDocsDraftImages();
  state.documentationDraft = createDocumentationDraft(entryType);
  elements.docsCameraInput.value = "";
  elements.docsGalleryInput.value = "";
  syncDocumentationDraftToForm();
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

function cleanupDocsRenderedImages() {
  for (const url of state.docsRenderedImageUrls) {
    URL.revokeObjectURL(url);
  }
  state.docsRenderedImageUrls = [];
}

function cleanupValuationImage() {
  if (!state.valuationImageUrl) {
    return;
  }

  URL.revokeObjectURL(state.valuationImageUrl);
  state.valuationImageUrl = "";
}

function requestCurrentPosition() {
  if (!("geolocation" in navigator)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 2500, maximumAge: 60000 },
    );
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function shareExportedFile(blob, filename, title, text) {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      files: [file],
      title,
      text,
    });
    return true;
  }

  downloadBlob(blob, filename);
  return false;
}

function ensureShareableFiles(images, prefix) {
  return (images || []).map((image, index) => {
    if (image instanceof File) {
      return image;
    }
    const extension = image.type === "image/png" ? "png" : "jpg";
    return new File([image], `${prefix}-${String(index + 1).padStart(2, "0")}.${extension}`, {
      type: image.type || "image/jpeg",
    });
  });
}

function createCategoryOptions() {
  return DOC_CATEGORIES.map((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    return option;
  });
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
    `<p>Prosjekt: ${escapeHtml(project?.name || "")}</p>`,
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

function updateDocumentationHeader() {
  const type = getDocTypeConfig(state.documentationDraft.entryType);
  const createdAt = Date.now();
  const nextSequence = getNextEvidenceSequence(type.id);
  elements.docsEntryEyebrow.textContent = type.label;
  elements.docsEntryTitle.textContent = "Registrer bevis";
  elements.docsEntryNumber.textContent = createEvidenceNumber(type.id, nextSequence);
  elements.docsEntryTimestamp.textContent = `${formatDate(createdAt)} ${formatTime(createdAt)}`;
}

function renderDocumentationDraftImages() {
  elements.docsDraftImages.classList.toggle("hidden", state.documentationDraft.images.length === 0);

  const items = state.documentationDraft.images.map((_, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "docs-image-thumb";

    const image = document.createElement("img");
    image.src = state.docsDraftPreviewUrls[index];
    image.alt = `Bilde ${index + 1}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost-button docs-remove-image";
    removeButton.textContent = "Fjern";
    removeButton.addEventListener("click", () => {
      URL.revokeObjectURL(state.docsDraftPreviewUrls[index]);
      state.docsDraftPreviewUrls.splice(index, 1);
      state.documentationDraft.images.splice(index, 1);
      state.documentationDraft.imageHashes.splice(index, 1);
      renderDocumentationDraftImages();
    });

    wrapper.append(image, removeButton);
    return wrapper;
  });

  elements.docsDraftImages.replaceChildren(...items);
}

function renderZoneOptions() {
  const zones = getActiveEvidenceMap().zones || [];
  const options = zones.map((zone) => {
    const option = document.createElement("option");
    option.value = zone;
    return option;
  });
  elements.docsZoneOptions.replaceChildren(...options);
}

function syncDocumentationDraftToForm() {
  updateDocumentationHeader();
  elements.docsCategorySelect.value = state.documentationDraft.category;
  elements.docsDescriptionInput.value = state.documentationDraft.description;
  elements.docsZoneInput.value = state.documentationDraft.zone;
  elements.docsCommentInput.value = state.documentationDraft.comment;
  elements.docsCountInput.value = String(state.documentationDraft.count);
  elements.docsRiskSelect.value = state.documentationDraft.risk;
  elements.docsGpsStatus.textContent = "GPS lagres hvis tilgjengelig. Ellers lagres funnet uten GPS.";
  renderDocumentationDraftImages();
  renderZoneOptions();
}

function renderDocumentationMap() {
  const map = getActiveEvidenceMap();
  elements.docsCaseNameInput.value = map.caseName || "";
  elements.docsAddressInput.value = map.address || "";
  elements.docsMapRowsInput.value = String(map.rows || 3);
  elements.docsMapColumnsInput.value = String(map.columns || 3);
  elements.docsSketchInput.value = map.sketch || "";

  const counts = getActiveEvidenceEntries().reduce((result, entry) => {
    if (!entry.zone) {
      return result;
    }
    result[entry.zone] = (result[entry.zone] || 0) + 1;
    return result;
  }, {});

  const gridItems = (map.zones || []).map((zone) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "zone-cell";
    button.innerHTML = `<strong>${zone}</strong><span>${counts[zone] || 0} funn</span>`;
    button.addEventListener("click", () => {
      state.documentationDraft.zone = zone;
      showDocsEntry(state.documentationDraft.entryType);
    });
    return button;
  });

  elements.docsZoneGrid.replaceChildren(...gridItems);
}

function renderDocumentationSummary(entries) {
  const map = getActiveEvidenceMap();
  const categoryStats = entries.reduce((result, entry) => {
    result[entry.category] = (result[entry.category] || 0) + 1;
    return result;
  }, {});

  const categorySummary = Object.entries(categoryStats)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${category}: ${count}`)
    .join(", ");

  const totalImages = entries.reduce((sum, entry) => sum + (entry.imageCount || entry.images?.length || 0), 0);

  elements.docsReportSummary.innerHTML = [
    `<p>Forside: Dokumentasjonsrapport</p>`,
    `<p>Prosjekt: ${escapeHtml(getActiveProject()?.name || "")}</p>`,
    `<p>Adresse: ${escapeHtml(map.address || "-")}</p>`,
    `<p>Saksnavn: ${escapeHtml(map.caseName || "-")}</p>`,
    `<p>Dato: ${formatDate(Date.now())}</p>`,
    `<p>Antall funn: ${entries.length}</p>`,
    `<p>Antall bilder: ${totalImages}</p>`,
    `<p>Kategorier: ${escapeHtml(categorySummary || "-")}</p>`,
  ].join("");
}

function renderDocumentationEntries() {
  cleanupDocsRenderedImages();

  const entries = getFilteredEvidenceEntries();
  elements.docsReportEmptyState.classList.toggle("hidden", entries.length > 0);
  renderDocumentationSummary(entries);

  const cards = entries.map((entry) => {
    const node = elements.docsEntryCardTemplate.content.firstElementChild.cloneNode(true);
    const image = node.querySelector(".item-image");
    const gallery = node.querySelector(".docs-card-gallery");
    const shareButton = node.querySelector(".docs-share-images-button");
    const imageUrl = entry.images?.[0] ? URL.createObjectURL(entry.images[0]) : "";
    if (imageUrl) {
      state.docsRenderedImageUrls.push(imageUrl);
      image.src = imageUrl;
    } else {
      image.removeAttribute("src");
    }
    image.alt = `Bilde for ${entry.entryNumber}`;
    node.querySelector(".item-id").textContent = entry.entryNumber;
    node.querySelector(".item-action").textContent = getDocTypeConfig(entry.entryType).shortLabel;
    node.querySelector(".item-meta").textContent = `${entry.category} · Sone: ${entry.zone || "-"}`;
    node.querySelector(".item-date").textContent = `${entry.createdDate || formatDate(entry.createdAt)} ${
      entry.createdTime || formatTime(entry.createdAt)
    }`;
    node.querySelector(".item-value").textContent = entry.description || "Ingen beskrivelse";
    node.querySelector(".item-extra").textContent = `${entry.imageCount || entry.images?.length || 0} bilder · Risiko: ${
      entry.risk
    } · Kommentar: ${entry.comment || "-"}`;

    const galleryItems = (entry.images || []).slice(1).map((imageBlob, index) => {
      const thumbButton = document.createElement("button");
      thumbButton.type = "button";
      thumbButton.className = "docs-gallery-button";

      const thumbImage = document.createElement("img");
      const thumbUrl = URL.createObjectURL(imageBlob);
      state.docsRenderedImageUrls.push(thumbUrl);
      thumbImage.src = thumbUrl;
      thumbImage.alt = `${entry.entryNumber} bilde ${index + 2}`;
      thumbButton.append(thumbImage);
      thumbButton.addEventListener("click", () => {
        const fullUrl = URL.createObjectURL(imageBlob);
        const popup = window.open(fullUrl, "_blank");
        if (!popup) {
          window.location.href = fullUrl;
        }
        window.setTimeout(() => URL.revokeObjectURL(fullUrl), 60000);
      });
      return thumbButton;
    });

    gallery.replaceChildren(...galleryItems);
    gallery.classList.toggle("hidden", galleryItems.length === 0);
    shareButton.classList.toggle("hidden", (entry.images || []).length === 0);
    shareButton.addEventListener("click", () => {
      shareEntryImages(entry).catch((error) => {
        console.error("Kunne ikke dele bilder", error);
      });
    });
    return node;
  });

  elements.docsEntriesList.replaceChildren(...cards);
}

function renderDocumentationReport() {
  renderZoneOptions();
  renderDocumentationEntries();
}

function renderDocumentationModule() {
  renderZoneOptions();
  if (state.documentationView === "docsMapView") {
    renderDocumentationMap();
  } else if (state.documentationView === "docsReportView") {
    renderDocumentationReport();
  } else {
    syncDocumentationDraftToForm();
  }
}

async function saveDraft(action) {
  if (!confirmActiveProjectForRegistration()) {
    return;
  }

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

async function handleDocsImages(event) {
  const files = [...(event.target.files || [])];
  if (files.length === 0) {
    return;
  }

  for (const file of files) {
    const hash = await hashBlob(file);
    if (state.documentationDraft.imageHashes.includes(hash)) {
      continue;
    }
    state.documentationDraft.images.push(file);
    state.documentationDraft.imageHashes.push(hash);
    state.docsDraftPreviewUrls.push(URL.createObjectURL(file));
  }

  renderDocumentationDraftImages();
  focusDocsDescription();
}

async function handleActiveProjectChange() {
  state.activeProjectId = elements.activeProjectSelect.value;
  state.projectRegistrationConfirmed = false;
  await setActiveProject(state.activeProjectId);
  renderOverview();
  renderDocumentationModule();

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
  renderDocumentationModule();
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
  const projectEntriesCount = state.evidenceEntries.filter((entry) => entry.projectId === projectId).length;
  const message =
    `Slette prosjekt "${project.name}"?\n\nDette sletter også ${projectItemsCount} objekter, ` +
    `${projectCostsCount} kostnader og ${projectEntriesCount} dokumentasjonsfunn.`;

  if (!window.confirm(message)) {
    return;
  }

  await deleteProjectAndData(projectId);
  state.items = state.items.filter((item) => item.projectId !== projectId);
  state.costs = state.costs.filter((cost) => cost.projectId !== projectId);
  state.evidenceEntries = state.evidenceEntries.filter((entry) => entry.projectId !== projectId);
  state.evidenceMaps = state.evidenceMaps.filter((map) => map.projectId !== projectId);

  const ensured = await ensureProjects();
  state.projects = ensured.projects;
  state.activeProjectId = ensured.activeProjectId;
  renderOverview();
  renderDocumentationModule();

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

async function handleSaveDocEntry() {
  if (!confirmActiveProjectForRegistration()) {
    return;
  }

  if (state.isSavingDocEntry) {
    return;
  }

  const hasQuickContent =
    state.documentationDraft.images.length > 0 ||
    state.documentationDraft.description.trim() ||
    state.documentationDraft.comment.trim();

  if (!hasQuickContent) {
    focusDocsDescription();
    return;
  }

  state.isSavingDocEntry = true;
  setDocsSaveDisabled(true);
  elements.docsGpsStatus.textContent = "Henter GPS hvis tilgjengelig ...";

  try {
    const createdAt = Date.now();
    const gps = await requestCurrentPosition();
    const sequence = getNextEvidenceSequence(state.documentationDraft.entryType);
    const entry = {
      id: crypto.randomUUID(),
      projectId: state.activeProjectId,
      entryType: state.documentationDraft.entryType,
      sequence,
      entryNumber: createEvidenceNumber(state.documentationDraft.entryType, sequence),
      category: state.documentationDraft.category,
      description: state.documentationDraft.description.trim(),
      comment: state.documentationDraft.comment.trim(),
      zone: state.documentationDraft.zone.trim(),
      count: Math.max(1, Number(state.documentationDraft.count) || 1),
      risk: state.documentationDraft.risk,
      gps,
      images: [...state.documentationDraft.images],
      imageHashes: [...state.documentationDraft.imageHashes],
      imageCount: state.documentationDraft.images.length,
      createdAt,
      updatedAt: createdAt,
      createdDate: formatDate(createdAt),
      createdTime: formatTime(createdAt),
      lastEditedAt: createdAt,
    };

    await saveEvidenceEntry(entry);
    state.evidenceEntries = [entry, ...state.evidenceEntries];
    resetDocumentationDraft(state.documentationDraft.entryType);
    renderDocumentationModule();
    elements.docsGpsStatus.textContent = gps ? "GPS lagret." : "GPS ikke tilgjengelig. Funnet er lagret uten GPS.";
    focusDocsDescription();
  } finally {
    state.isSavingDocEntry = false;
    setDocsSaveDisabled(false);
  }
}

async function handleSaveDocMap() {
  if (state.isSavingDocMap) {
    return;
  }

  state.isSavingDocMap = true;
  elements.docsSaveMapButton.disabled = true;

  try {
    const rows = Math.max(1, Math.min(8, Number(elements.docsMapRowsInput.value) || 3));
    const columns = Math.max(1, Math.min(8, Number(elements.docsMapColumnsInput.value) || 3));
    const existingMap = getActiveEvidenceMap();
    const map = {
      ...existingMap,
      projectId: state.activeProjectId,
      rows,
      columns,
      zones: buildZones(rows, columns),
      sketch: elements.docsSketchInput.value.trim(),
      caseName: elements.docsCaseNameInput.value.trim(),
      address: elements.docsAddressInput.value.trim(),
      updatedAt: Date.now(),
    };

    await saveEvidenceMap(map);
    state.evidenceMaps = [...state.evidenceMaps.filter((item) => item.projectId !== state.activeProjectId), map];
    renderDocumentationMap();
    renderZoneOptions();
  } finally {
    state.isSavingDocMap = false;
    elements.docsSaveMapButton.disabled = false;
  }
}

function createCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let current = i;
    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    table[i] = current >>> 0;
  }
  return table;
}

const CRC32_TABLE = createCrc32Table();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function numberToBytes(value, length) {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = (value >>> (8 * index)) & 0xff;
  }
  return bytes;
}

function joinUint8Arrays(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function buildStoredZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);

    const localHeader = joinUint8Arrays([
      numberToBytes(0x04034b50, 4),
      numberToBytes(20, 2),
      numberToBytes(0, 2),
      numberToBytes(0, 2),
      numberToBytes(0, 2),
      numberToBytes(0, 2),
      numberToBytes(crc, 4),
      numberToBytes(data.length, 4),
      numberToBytes(data.length, 4),
      numberToBytes(nameBytes.length, 2),
      numberToBytes(0, 2),
      nameBytes,
      data,
    ]);

    const centralHeader = joinUint8Arrays([
      numberToBytes(0x02014b50, 4),
      numberToBytes(20, 2),
      numberToBytes(20, 2),
      numberToBytes(0, 2),
      numberToBytes(0, 2),
      numberToBytes(0, 2),
      numberToBytes(0, 2),
      numberToBytes(crc, 4),
      numberToBytes(data.length, 4),
      numberToBytes(data.length, 4),
      numberToBytes(nameBytes.length, 2),
      numberToBytes(0, 2),
      numberToBytes(0, 2),
      numberToBytes(0, 2),
      numberToBytes(0, 2),
      numberToBytes(0, 4),
      numberToBytes(offset, 4),
      nameBytes,
    ]);

    localParts.push(localHeader);
    centralParts.push(centralHeader);
    offset += localHeader.length;
  }

  const centralDirectory = joinUint8Arrays(centralParts);
  const endRecord = joinUint8Arrays([
    numberToBytes(0x06054b50, 4),
    numberToBytes(0, 2),
    numberToBytes(0, 2),
    numberToBytes(files.length, 2),
    numberToBytes(files.length, 2),
    numberToBytes(centralDirectory.length, 4),
    numberToBytes(offset, 4),
    numberToBytes(0, 2),
  ]);

  return new Blob([...localParts, centralDirectory, endRecord], { type: "application/zip" });
}

async function exportDocsPages() {
  const project = getActiveProject();
  const map = getActiveEvidenceMap();
  const entries = getFilteredEvidenceEntries();
  const projectName = project?.name || "rapport";
  const reportTitle = "Dokumentasjonsrapport";
  const lines = [
    "{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1",
    "{\\fonttbl{\\f0 Arial;}}",
    "\\viewkind4\\paperw11907\\paperh16840\\margl720\\margr720\\margt720\\margb720",
    `\\fs28\\b ${escapeRtfText(reportTitle)}\\b0\\par`,
    `Prosjekt: ${escapeRtfText(project?.name || "-")}\\par`,
    `Adresse: ${escapeRtfText(map.address || "-")}\\par`,
    `Saksnavn: ${escapeRtfText(map.caseName || "-")}\\par`,
    `Dato: ${formatDate(Date.now())}\\par\\par`,
  ];

  for (const entry of entries) {
    lines.push(`\\pard\\sa180\\b ${escapeRtfText(entry.entryNumber)}\\b0\\par`);
    lines.push(`Type: ${escapeRtfText(getDocTypeConfig(entry.entryType).shortLabel)}\\par`);
    lines.push(`Kategori: ${escapeRtfText(entry.category || "-")}\\par`);
    lines.push(`Dato: ${entry.createdDate || formatDate(entry.createdAt)} ${entry.createdTime || formatTime(entry.createdAt)}\\par`);
    lines.push(`Sone: ${escapeRtfText(entry.zone || "-")}\\par`);
    lines.push(`Beskrivelse: ${escapeRtfText(entry.description || "-")}\\par`);
    lines.push(`Kommentar: ${escapeRtfText(entry.comment || "-")}\\par`);
    lines.push(`Bilder: ${entry.imageCount || entry.images?.length || 0}\\par\\par`);
  }

  lines.push("}");
  const rtfBlob = new Blob([lines.join("\r\n")], { type: "text/rtf;charset=utf-8" });
  const shared = await shareExportedFile(
    rtfBlob,
    `${slugify(projectName)}.rtf`,
    `${reportTitle} - ${projectName}`,
    "Velg Pages i delingsarket for å åpne rapporten der.",
  );

  if (!shared) {
    window.alert("Pages-dokumentet ble lastet ned som .rtf. Hvis iPhone ikke åpner det direkte, velg Del og deretter Pages.");
  }
}

async function shareEntryImages(entry) {
  const files = ensureShareableFiles(entry.images || [], slugify(entry.entryNumber || "bilde"));
  if (files.length === 0) {
    return;
  }

  if (navigator.canShare && navigator.canShare({ files })) {
    await navigator.share({
      files,
      title: `${entry.entryNumber} bilder`,
      text: "Velg 'Lagre i Bilder' i delingsarket hvis du vil ha full størrelse i bildebiblioteket.",
    });
    return;
  }

  for (const file of files) {
    downloadBlob(file, file.name);
  }
  window.alert("Safari lot ikke appen sende bildene direkte til Bilder. Filene er lastet ned i full størrelse.");
}

async function shareAllDocumentationImages() {
  const files = getFilteredEvidenceEntries().flatMap((entry) =>
    ensureShareableFiles(entry.images || [], slugify(entry.entryNumber || "bilde")),
  );

  if (files.length === 0) {
    window.alert("Ingen bilder funnet i rapporten.");
    return;
  }

  if (navigator.canShare && navigator.canShare({ files })) {
    await navigator.share({
      files,
      title: "Dokumentasjonsbilder",
      text: "Velg 'Lagre i Bilder' i delingsarket for å lagre originalene i bildebiblioteket.",
    });
    return;
  }

  for (const file of files) {
    downloadBlob(file, file.name);
  }
  window.alert("Safari lot ikke appen sende alle bildene direkte til Bilder. Filene er lastet ned i full størrelse.");
}

async function exportDocsZip() {
  const entries = getFilteredEvidenceEntries();
  const report = {
    project: getActiveProject()?.name || "",
    createdAt: new Date().toISOString(),
    entries: entries.map((entry) => ({
      entryNumber: entry.entryNumber,
      category: entry.category,
      description: entry.description,
      comment: entry.comment,
      zone: entry.zone,
      risk: entry.risk,
      imageCount: entry.imageCount,
    })),
  };

  const files = [
    {
      name: "rapport.json",
      blob: new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    },
  ];

  for (const entry of entries) {
    for (let index = 0; index < (entry.images || []).length; index += 1) {
      files.push({
        name: `${entry.entryNumber}/${String(index + 1).padStart(2, "0")}.jpg`,
        blob: entry.images[index],
      });
    }
  }

  const zipBlob = await buildStoredZip(files);
  downloadBlob(zipBlob, `${slugify(getActiveProject()?.name || "bilder")}-bilder.zip`);
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
      navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
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

  window.addEventListener("afterprint", () => {
    document.body.dataset.printMode = state.activeModule === "documentation" ? "docs" : "overview";
  });
}

function bindEvents() {
  elements.openPhotoButton.addEventListener("click", () => {
    if (!confirmActiveProjectForRegistration()) {
      return;
    }
    elements.photoInput.click();
  });
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
  elements.showRydderenModuleButton.addEventListener("click", () => setActiveModule("rydderen"));
  elements.showDocumentationModuleButton.addEventListener("click", () => showDocsEntry(state.documentationDraft.entryType));
  elements.printButton.addEventListener("click", () => {
    document.body.dataset.printMode = "overview";
    window.print();
  });
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

  elements.docsNewFindingButton.addEventListener("click", () => showDocsEntry("finding"));
  elements.docsNewObservationButton.addEventListener("click", () => showDocsEntry("observation"));
  elements.docsNewDamageButton.addEventListener("click", () => showDocsEntry("damage"));
  elements.docsNewMeasurementButton.addEventListener("click", () => showDocsEntry("measurement"));
  elements.docsNewSampleButton.addEventListener("click", () => showDocsEntry("sample"));
  elements.docsMapButton.addEventListener("click", showDocsMap);
  elements.docsReportsButton.addEventListener("click", showDocsReport);
  elements.openDocsCameraButton.addEventListener("click", () => {
    if (!confirmActiveProjectForRegistration()) {
      return;
    }
    elements.docsCameraInput.click();
  });
  elements.openDocsGalleryButton.addEventListener("click", () => {
    if (!confirmActiveProjectForRegistration()) {
      return;
    }
    elements.docsGalleryInput.click();
  });
  elements.docsCameraInput.addEventListener("change", handleDocsImages);
  elements.docsGalleryInput.addEventListener("change", handleDocsImages);
  elements.docsCategorySelect.addEventListener("change", () => {
    state.documentationDraft.category = elements.docsCategorySelect.value;
  });
  elements.docsDescriptionInput.addEventListener("input", () => {
    state.documentationDraft.description = elements.docsDescriptionInput.value;
  });
  elements.docsZoneInput.addEventListener("input", () => {
    state.documentationDraft.zone = elements.docsZoneInput.value;
  });
  elements.docsCommentInput.addEventListener("input", () => {
    state.documentationDraft.comment = elements.docsCommentInput.value;
  });
  elements.docsCountInput.addEventListener("input", () => {
    state.documentationDraft.count = Math.max(1, Number(elements.docsCountInput.value) || 1);
  });
  elements.docsRiskSelect.addEventListener("change", () => {
    state.documentationDraft.risk = elements.docsRiskSelect.value;
  });
  elements.docsSaveEntryButton.addEventListener("click", handleSaveDocEntry);
  elements.docsMoreButton.addEventListener("click", () => {
    elements.docsMoreFields.classList.toggle("hidden");
  });
  elements.docsExitEntryButton.addEventListener("click", showDocsReport);
  elements.docsGenerateZonesButton.addEventListener("click", () => {
    const rows = Math.max(1, Math.min(8, Number(elements.docsMapRowsInput.value) || 3));
    const columns = Math.max(1, Math.min(8, Number(elements.docsMapColumnsInput.value) || 3));
    const map = {
      ...getActiveEvidenceMap(),
      projectId: state.activeProjectId,
      rows,
      columns,
      zones: buildZones(rows, columns),
      caseName: elements.docsCaseNameInput.value.trim(),
      address: elements.docsAddressInput.value.trim(),
      sketch: elements.docsSketchInput.value.trim(),
      updatedAt: Date.now(),
    };
    state.evidenceMaps = [...state.evidenceMaps.filter((item) => item.projectId !== state.activeProjectId), map];
    renderDocumentationMap();
    renderZoneOptions();
  });
  elements.docsSaveMapButton.addEventListener("click", handleSaveDocMap);
  elements.docsExitMapButton.addEventListener("click", showDocsReport);
  elements.docsSearchInput.addEventListener("input", () => {
    state.documentationSearch = elements.docsSearchInput.value;
    renderDocumentationReport();
  });
  elements.docsClearSearchButton.addEventListener("click", () => {
    state.documentationSearch = "";
    elements.docsSearchInput.value = "";
    renderDocumentationReport();
  });
  elements.docsExportPdfButton.addEventListener("click", () => {
    showDocsReport();
    document.body.dataset.printMode = "docs";
    window.print();
  });
  elements.docsExportPagesButton.addEventListener("click", () => {
    exportDocsPages().catch((error) => {
      console.error("Kunne ikke eksportere Pages-fil", error);
    });
  });
  elements.docsSaveAllImagesButton.addEventListener("click", () => {
    shareAllDocumentationImages().catch((error) => {
      console.error("Kunne ikke dele bilder", error);
    });
  });
  elements.docsExportZipButton.addEventListener("click", () => {
    exportDocsZip().catch((error) => {
      console.error("Kunne ikke eksportere ZIP", error);
    });
  });
}

async function loadState() {
  const ensured = await ensureProjects();
  state.projects = ensured.projects;
  state.activeProjectId = ensured.activeProjectId;
  state.items = await getAllItems();
  state.costs = await getProjectCosts();
  state.evidenceEntries = await getEvidenceEntries();
  state.evidenceMaps = await getEvidenceMaps();
}

async function init() {
  renderCategoryButtons();
  renderActionButtons();
  elements.docsCategorySelect.replaceChildren(...createCategoryOptions());
  bindEvents();
  setupInstallPrompt();
  registerServiceWorker();
  await loadState();
  renderOverview();
  renderDocumentationModule();
  showRegisterCapture();
}

init().catch((error) => {
  console.error("Kunne ikke starte appen", error);
});
