export class StorageProvider {
  constructor() {
    this.kind = "unknown";
  }

  isAuthenticated() {
    return false;
  }

  async getUser() {
    return null;
  }

  async listProjects() {
    return [];
  }

  async getProject(projectId) {
    return null;
  }

  async createProject(name) {
    return null;
  }

  async deleteProject(projectId) {
    return false;
  }

  async addItem(projectId, itemDraft) {
    return null;
  }

  async updateItem(projectId, itemId, patch) {
    return null;
  }

  async addCost(projectId, cost) {
    return null;
  }
}

