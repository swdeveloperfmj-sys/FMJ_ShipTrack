const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event("fmj-session-expired"));
    }
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

export const api = {
  getPreCostings: () => request("/pre-costings"),
  createPreCosting: (costing) => request("/pre-costings", { method: "POST", body: JSON.stringify(costing) }),
  updatePreCosting: (id, costing) => request(`/pre-costings/${id}`, { method: "PUT", body: JSON.stringify(costing) }),
  deletePreCosting: (id) => request(`/pre-costings/${id}`, { method: "DELETE" }),
  getAuthStatus: () => request("/auth/status"),
  setupSuperAdmin: (credentials) =>
    request("/auth/setup", { method: "POST", body: JSON.stringify(credentials) }),
  login: (credentials) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(credentials) }),
  verifyLoginCode: (challenge) =>
    request("/auth/verify", { method: "POST", body: JSON.stringify(challenge) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  getUsers: () => request("/users"),
  createUser: (user) => request("/users", { method: "POST", body: JSON.stringify(user) }),
  updateUser: (id, user) =>
    request(`/users/${id}`, { method: "PUT", body: JSON.stringify(user) }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),
  updateFontSize: (userId, fontSize) =>
    request("/settings/font-size", { method: "PUT", body: JSON.stringify({ userId, fontSize }) }),
  getConsignees: () => request("/consignees"),
  getCountries: () => request("/countries"),
  createCountry: (country) =>
    request("/countries", { method: "POST", body: JSON.stringify(country) }),
  updateCountry: (id, country) =>
    request(`/countries/${id}`, { method: "PUT", body: JSON.stringify(country) }),
  deleteCountry: (id) => request(`/countries/${id}`, { method: "DELETE" }),
  getCurrencies: () => request("/currencies"),
  createCurrency: (currency) =>
    request("/currencies", { method: "POST", body: JSON.stringify(currency) }),
  updateCurrency: (id, currency) =>
    request(`/currencies/${id}`, { method: "PUT", body: JSON.stringify(currency) }),
  deleteCurrency: (id) => request(`/currencies/${id}`, { method: "DELETE" }),
  createConsignee: (consignee) =>
    request("/consignees", { method: "POST", body: JSON.stringify(consignee) }),
  updateConsignee: (id, consignee) =>
    request(`/consignees/${id}`, { method: "PUT", body: JSON.stringify(consignee) }),
  deleteConsignee: (id) => request(`/consignees/${id}`, { method: "DELETE" }),
  getShipments: () => request("/shipments"),
  getAnalytics: () => request("/analytics"),
  getMaterials: () => request("/materials"),
  updateMaterial: (id, material) =>
    request(`/materials/${id}`, { method: "PUT", body: JSON.stringify(material) }),
  importMaterials: (materials) =>
    request("/materials/import", { method: "POST", body: JSON.stringify({ materials }) }),
  getPostCostings: () => request("/post-costings"),
  createPostCosting: (costing) => request("/post-costings", { method: "POST", body: JSON.stringify(costing) }),
  updatePostCosting: (id, costing) => request(`/post-costings/${id}`, { method: "PUT", body: JSON.stringify(costing) }),
  deletePostCosting: (id) => request(`/post-costings/${id}`, { method: "DELETE" }),
  createShipment: (shipment) =>
    request("/shipments", { method: "POST", body: JSON.stringify(shipment) }),
  updateShipment: (id, shipment) =>
    request(`/shipments/${id}`, { method: "PUT", body: JSON.stringify(shipment) }),
  deleteShipment: (id) => request(`/shipments/${id}`, { method: "DELETE" }),
};
