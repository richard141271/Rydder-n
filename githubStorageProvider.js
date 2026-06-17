import { StorageProvider } from "./storageProvider.js";

function padId(id) {
  return String(id).padStart(4, "0");
}

async function blobToBase64(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function compressImageToJpeg(blob, { maxDimension = 1280, quality = 0.78 } = {}) {
  const bitmap = await createImageBitmap(blob);
  const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const outBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!outBlob) {
    return blob;
  }
  return outBlob;
}

function isoNow() {
  return new Date().toISOString();
}

function normalizeProjectData(projectId, name, data) {
  const safe = data && typeof data === "object" ? data : {};
  return {
    projectId,
    name: safe.name || name || projectId,
    updatedAt: safe.updatedAt || isoNow(),
    lastObjectId: Number.isFinite(safe.lastObjectId) ? safe.lastObjectId : 0,
    items: Array.isArray(safe.items) ? safe.items : [],
    costs: Array.isArray(safe.costs) ? safe.costs : [],
  };
}

export class GitHubStorageProvider extends StorageProvider {
  constructor({ owner, repo, branch = "main" }) {
    super();
    this.kind = "github";
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.token = "";
    this.user = null;
  }

  setToken(token) {
    this.token = token || "";
  }

  isAuthenticated() {
    return Boolean(this.token);
  }

  async api(path, { method = "GET", headers = {}, body } = {}) {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...headers,
      },
      body,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `GitHub API-feil (${response.status})`);
    }

    return response;
  }

  async getUser() {
    if (this.user) {
      return this.user;
    }

    const response = await this.api("/user");
    const data = await response.json();
    this.user = { login: data.login || "", id: data.id };
    return this.user;
  }

  async listDir(path) {
    const response = await this.api(`/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`);
    return response.json();
  }

  async getJsonFile(path) {
    const response = await this.api(
      `/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`,
      {
        headers: { Accept: "application/vnd.github.raw" },
      },
    );
    const text = await response.text();
    return JSON.parse(text);
  }

  async getFileMeta(path) {
    const response = await this.api(`/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`);
    return response.json();
  }

  async putFile({ path, content, message }) {
    let sha = null;
    try {
      const meta = await this.getFileMeta(path);
      sha = meta.sha;
    } catch {
      sha = null;
    }

    const payload = {
      message,
      content,
      branch: this.branch,
      ...(sha ? { sha } : {}),
    };

    const response = await this.api(`/repos/${this.owner}/${this.repo}/contents/${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.json();
  }

  async deleteFile({ path, message }) {
    const meta = await this.getFileMeta(path);
    const payload = {
      message,
      sha: meta.sha,
      branch: this.branch,
    };

    await this.api(`/repos/${this.owner}/${this.repo}/contents/${path}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async listProjects() {
    let entries = [];
    try {
      entries = await this.listDir("projects");
    } catch {
      return [];
    }

    const ids = entries
      .filter((entry) => entry.type === "file" && entry.name.endsWith(".json"))
      .map((entry) => entry.name.replace(/\.json$/, ""));

    const projects = await Promise.all(
      ids.map(async (id) => {
        try {
          const data = await this.getJsonFile(`projects/${id}.json`);
          return { id, name: data?.name || id };
        } catch {
          return { id, name: id };
        }
      }),
    );

    return projects.sort((a, b) => a.name.localeCompare(b.name, "nb"));
  }

  async getProject(projectId) {
    const path = `projects/${projectId}.json`;
    try {
      const data = await this.getJsonFile(path);
      return normalizeProjectData(projectId, projectId, data);
    } catch {
      return normalizeProjectData(projectId, projectId, null);
    }
  }

  async createProject(name) {
    const projectId = name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

    const safeId = projectId || `project-${crypto.randomUUID()}`;
    const project = normalizeProjectData(safeId, name, { name, items: [], costs: [], lastObjectId: 0 });
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(project, null, 2))));
    await this.putFile({
      path: `projects/${safeId}.json`,
      content,
      message: `Create project ${safeId}`,
    });
    return { id: safeId, name };
  }

  async uploadImage(projectId, objectId, imageBlob) {
    const jpegBlob = await compressImageToJpeg(imageBlob);
    const base64 = await blobToBase64(jpegBlob);
    const imagePath = `images/${projectId}/${padId(objectId)}.jpg`;
    await this.putFile({
      path: imagePath,
      content: base64,
      message: `Upload image ${projectId} ${padId(objectId)}`,
    });
    return `/${imagePath}`;
  }

  async saveProjectData(projectData, message) {
    const payload = {
      ...projectData,
      updatedAt: isoNow(),
    };
    const json = JSON.stringify(payload, null, 2);
    const content = btoa(unescape(encodeURIComponent(json)));
    await this.putFile({
      path: `projects/${projectData.projectId}.json`,
      content,
      message,
    });
  }

  async addItem(projectId, itemDraft) {
    const project = await this.getProject(projectId);
    const nextId = (project.lastObjectId || 0) + 1;
    const imagePath = await this.uploadImage(projectId, nextId, itemDraft.imageBlob);
    const item = {
      id: nextId,
      projectId,
      category: itemDraft.category,
      action: itemDraft.action,
      value: null,
      comment: "",
      condition: "",
      note: "",
      image: imagePath,
      createdAt: isoNow(),
    };

    project.lastObjectId = nextId;
    project.items = [item, ...project.items];
    await this.saveProjectData(project, `Add item ${projectId} #${padId(nextId)}`);
    return item;
  }

  async updateItem(projectId, itemId, patch) {
    const project = await this.getProject(projectId);
    const index = project.items.findIndex((item) => item.id === itemId);
    if (index < 0) {
      return null;
    }
    const updated = { ...project.items[index], ...patch };
    project.items[index] = updated;
    await this.saveProjectData(project, `Update item ${projectId} #${padId(itemId)}`);
    return updated;
  }

  async addCost(projectId, cost) {
    const project = await this.getProject(projectId);
    const entry = {
      id: cost.id || crypto.randomUUID(),
      type: cost.type,
      amount: cost.amount,
      createdAt: cost.createdAt || isoNow(),
    };
    project.costs = [entry, ...project.costs];
    await this.saveProjectData(project, `Add cost ${projectId}`);
    return entry;
  }

  async deleteProject(projectId) {
    const defaultMessage = `Delete project ${projectId}`;
    try {
      const imageEntries = await this.listDir(`images/${projectId}`);
      const files = imageEntries.filter((entry) => entry.type === "file");
      for (const file of files) {
        await this.deleteFile({ path: `images/${projectId}/${file.name}`, message: defaultMessage });
      }
    } catch {
      null;
    }

    try {
      await this.deleteFile({ path: `projects/${projectId}.json`, message: defaultMessage });
    } catch {
      return false;
    }

    return true;
  }
}
