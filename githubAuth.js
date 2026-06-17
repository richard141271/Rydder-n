import { deleteSetting, getSetting, setSetting } from "./offlineDb.js";

const TOKEN_KEY = "githubAccessToken";
const USER_KEY = "githubUser";

export async function getStoredToken() {
  return getSetting(TOKEN_KEY);
}

export async function setStoredToken(token) {
  await setSetting(TOKEN_KEY, token);
}

export async function clearStoredToken() {
  await deleteSetting(TOKEN_KEY);
  await deleteSetting(USER_KEY);
}

export async function getStoredUser() {
  return getSetting(USER_KEY);
}

export async function setStoredUser(user) {
  await setSetting(USER_KEY, user);
}

export async function startDeviceFlow({ clientId, scope }) {
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  if (scope) {
    body.set("scope", scope);
  }

  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Kunne ikke starte GitHub-innlogging.");
  }

  return response.json();
}

export async function pollDeviceFlowToken({ clientId, deviceCode }) {
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("device_code", deviceCode);
  body.set("grant_type", "urn:ietf:params:oauth:grant-type:device_code");

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const data = await response.json();

  if (data.error) {
    return data;
  }

  return data;
}

