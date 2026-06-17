import {
  deleteProject,
  getDefaultProjectId,
  getProjects,
  getSetting,
  saveProject,
  saveSetting,
} from "./db.js";

const ACTIVE_PROJECT_KEY = "activeProjectId";

export const DEFAULT_PROJECTS = [
  { id: getDefaultProjectId(), name: "Kalesje Lager 2026" },
  { id: "rascheprangen-1", name: "Rascheprangen 1" },
  { id: "vaskehall-slyngerom", name: "Vaskehall Slyngerom" },
  { id: "dodsbo-hansen", name: "Dødsbo Hansen" },
];

export function createProjectId(name) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export async function ensureProjects() {
  const existingProjects = await getProjects();

  if (existingProjects.length === 0) {
    for (const project of DEFAULT_PROJECTS) {
      await saveProject(project);
    }
  }

  const projects = await getProjects();
  const activeProjectId = (await getSetting(ACTIVE_PROJECT_KEY)) || projects[0]?.id || getDefaultProjectId();

  if (!projects.some((project) => project.id === activeProjectId) && projects[0]) {
    await saveSetting(ACTIVE_PROJECT_KEY, projects[0].id);
    return { projects, activeProjectId: projects[0].id };
  }

  return { projects, activeProjectId };
}

export function getProjectById(projects, projectId) {
  return projects.find((project) => project.id === projectId) || null;
}

export async function setActiveProject(projectId) {
  await saveSetting(ACTIVE_PROJECT_KEY, projectId);
}

export async function addProject(name) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return null;
  }

  const id = createProjectId(trimmedName) || `project-${crypto.randomUUID()}`;
  const project = { id, name: trimmedName };
  await saveProject(project);
  return project;
}

export async function removeProject(projectId) {
  if (projectId === getDefaultProjectId()) {
    return false;
  }

  await deleteProject(projectId);
  return true;
}
